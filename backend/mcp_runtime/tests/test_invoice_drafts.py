from __future__ import annotations

import json
import time
from uuid import uuid4

import pytest
from jsonschema import Draft202012Validator
from mcp.server.auth.provider import AccessToken

from aasopharma_mcp.invoice_drafts import INVOICE_DRAFT_SCHEMAS
from aasopharma_mcp.operations import (
    OPERATOR_OPERATIONS,
    OperationGateway,
    UpstreamContractError,
)
from conftest import settings


class Response:
    def __init__(self, status_code: int, payload: dict) -> None:
        self.status_code = status_code
        self._payload = payload
        self.content = json.dumps(payload).encode()

    def json(self):
        return self._payload


class Client:
    def __init__(self, responses: list[Response], calls: list[tuple]) -> None:
        self.responses = responses
        self.calls = calls

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def get(self, url, **kwargs):
        self.calls.append(("GET", url, kwargs))
        return self.responses.pop(0)

    async def post(self, url, **kwargs):
        self.calls.append(("POST", url, kwargs))
        return self.responses.pop(0)

    async def patch(self, url, **kwargs):
        self.calls.append(("PATCH", url, kwargs))
        return self.responses.pop(0)


def _access() -> AccessToken:
    return AccessToken(
        token="oauth-bearer-must-not-be-forwarded",
        client_id="chatgpt-installation",
        scopes=["openid", "offline_access"],
        expires_at=int(time.time()) + 300,
        subject=str(uuid4()),
        claims={
            "iss": settings().supabase_issuer,
            "organization_id": str(uuid4()),
        },
    )


def _grant(access: AccessToken, document_kind: str, branch_id: str) -> dict:
    operation_key = {
        "sales_invoice": "sales.invoice.prepare",
        "supplier_invoice": "procurement.supplier_invoice.prepare",
    }[document_kind]
    return {
        "allowed": True,
        "issuer": access.claims["iss"],
        "subject": access.subject,
        "client_id": access.client_id,
        "operation_key": operation_key,
        "capability_code": operation_key,
        "operation_mode": "write",
        "permission_code": (
            "sales.invoice.create"
            if document_kind == "sales_invoice"
            else "procurement.supplier_invoice.create"
        ),
        "organization_id": access.claims["organization_id"],
        "membership_id": str(uuid4()),
        "agent_grant_id": str(uuid4()),
        "branch_ids": [branch_id],
        "organization_scope": False,
        "command_request_id": None,
        "delegated_access_token": "d" * 48,
        "expires_at": int(time.time()) + 60,
    }


def _envelope(command_payload=None, document_kind="supplier_invoice") -> dict:
    if document_kind == "sales_invoice":
        editor_state = {
            "invoice": {
                "items": [{"description": "Permissive authoring data", "quantity": "1"}],
                "future_ui_field": {"preserved": True},
            },
            "selected_customer": None,
            "current_step": 2,
        }
    else:
        editor_state = {
            "selected_receipt_id": "",
            "invoice_number": "",
            "invoice_date": "",
            "received_date": "",
            "rates": {},
            "allocation_methods": {},
            "charge_allocation_methods": {},
            "itc_attested": False,
        }
    return {
        "schema_version": "invoice-draft.v1",
        "editor_state": editor_state,
        "command_payload": command_payload,
    }


def _draft(draft_id: str, branch_id: str, document_kind: str, **values) -> dict:
    return {
        "draft_id": draft_id,
        "document_kind": document_kind,
        "branch_id": branch_id,
        "title": None,
        "payload": _envelope(document_kind=document_kind),
        "status": "open",
        "created_via": "mcp",
        "row_version": 1,
        **values,
    }


def test_exact_shared_envelope_is_typed_without_copying_invoice_business_schema() -> None:
    assert set(INVOICE_DRAFT_SCHEMAS) == {
        "erp_invoice_draft_list",
        "erp_invoice_draft_get",
        "erp_invoice_draft_save",
        "erp_invoice_draft_update",
        "erp_invoice_draft_abandon",
        "erp_invoice_draft_prepare",
    }
    payload_schema = INVOICE_DRAFT_SCHEMAS["erp_invoice_draft_save"]["properties"]["payload"]
    assert payload_schema["additionalProperties"] is False
    assert payload_schema["required"] == [
        "schema_version", "editor_state", "command_payload"
    ]
    assert payload_schema["properties"]["schema_version"]["const"] == "invoice-draft.v1"
    assert payload_schema["properties"]["command_payload"]["type"] == ["object", "null"]
    assert payload_schema["properties"]["command_payload"]["type"] != "object"
    # The MCP contract owns no invoice line, tax, pricing, or batch fields.
    assert set(payload_schema["properties"]) == {
        "schema_version", "editor_state", "command_payload"
    }
    Draft202012Validator(INVOICE_DRAFT_SCHEMAS["erp_invoice_draft_save"]).validate({
        "document_kind": "supplier_invoice",
        "branch_id": str(uuid4()),
        "payload": _envelope(None),
    })


@pytest.mark.parametrize(
    ("document_kind", "editor_state"),
    (
        ("sales_invoice", {"invoice": {}, "selected_customer": None}),
        (
            "sales_invoice",
            {"invoice": {}, "selected_customer": None, "current_step": 4},
        ),
        (
            "sales_invoice",
            {"invoice": {}, "selected_customer": "not-an-object", "current_step": 1},
        ),
        (
            "supplier_invoice",
            {"invoice": {}, "selected_customer": None, "current_step": 1},
        ),
        (
            "supplier_invoice",
            {
                **_envelope(document_kind="supplier_invoice")["editor_state"],
                "rates": {"line-id": 12.5},
            },
        ),
        (
            "supplier_invoice",
            {
                key: value
                for key, value in _envelope(
                    document_kind="supplier_invoice"
                )["editor_state"].items()
                if key != "itc_attested"
            },
        ),
    ),
)
def test_document_kind_rejects_non_resumable_editor_state(
    document_kind: str, editor_state: dict,
) -> None:
    candidate = {
        "document_kind": document_kind,
        "branch_id": str(uuid4()),
        "payload": {
            "schema_version": "invoice-draft.v1",
            "editor_state": editor_state,
            "command_payload": None,
        },
    }
    assert list(
        Draft202012Validator(
            INVOICE_DRAFT_SCHEMAS["erp_invoice_draft_save"]
        ).iter_errors(candidate)
    )


def test_nested_sales_authoring_data_remains_permissive() -> None:
    payload = _envelope(document_kind="sales_invoice")
    payload["editor_state"]["invoice"]["future_nested_shape"] = {
        "anything": [1, "two", {"three": True}],
    }
    payload["editor_state"]["selected_customer"] = {
        "customer_id": "temporary-ui-value",
        "future_projection": ["kept"],
    }
    Draft202012Validator(INVOICE_DRAFT_SCHEMAS["erp_invoice_draft_save"]).validate({
        "document_kind": "sales_invoice",
        "branch_id": str(uuid4()),
        "payload": payload,
    })


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("document_kind", "expected_operation"),
    (
        ("sales_invoice", "sales.invoice.prepare"),
        ("supplier_invoice", "procurement.supplier_invoice.prepare"),
    ),
)
async def test_save_preserves_incomplete_envelope_and_uses_kind_specific_authority(
    document_kind: str, expected_operation: str,
) -> None:
    access = _access()
    branch_id = str(uuid4())
    draft_id = str(uuid4())
    envelope = _envelope(None, document_kind)
    calls: list[tuple] = []
    responses = [
        Response(200, _grant(access, document_kind, branch_id)),
        Response(201, _draft(
            draft_id,
            branch_id,
            document_kind,
            edit_path=f"/invoice-drafts/{draft_id}/edit",
        )),
    ]
    gateway = OperationGateway(
        settings(),
        lambda: Client(responses, calls),
    )
    arguments = {
        "document_kind": document_kind,
        "branch_id": branch_id,
        "title": "Bill photo intake",
        "payload": envelope,
    }

    result = await gateway.execute_operator(
        OPERATOR_OPERATIONS["erp_invoice_draft_save"], access, arguments
    )

    grant_call, api_call = calls
    assert grant_call[2]["json"]["operation_key"] == expected_operation
    assert grant_call[2]["json"]["operation_mode"] == "write"
    assert grant_call[2]["json"]["branch_ids"] == [branch_id]
    assert api_call[0] == "POST"
    assert api_call[1].endswith("/api/internal/mcp/invoice-drafts")
    assert api_call[2]["json"] == {
        **arguments,
        "created_via": "mcp",
    }
    assert api_call[2]["json"]["payload"] == envelope
    assert access.token not in json.dumps(calls)
    assert result["draft_id"] == draft_id
    assert result["edit_path"] == f"/invoice-drafts/{draft_id}/edit"


@pytest.mark.asyncio
async def test_list_get_update_abandon_and_prepare_share_one_rest_authority() -> None:
    access = _access()
    branch_id = str(uuid4())
    draft_id = str(uuid4())
    document_kind = "sales_invoice"
    prepared = {
        "command_request_id": str(uuid4()),
        "preview_hash": "sha256:" + "a" * 64,
        "expires_at": "2026-08-29T12:00:00Z",
    }
    scenarios = (
        (
            "erp_invoice_draft_list",
            {"document_kind": document_kind, "branch_id": branch_id},
            Response(200, {"drafts": [], "total": 0}),
            "GET", "/api/internal/mcp/invoice-drafts",
            None,
        ),
        (
            "erp_invoice_draft_get",
            {"document_kind": document_kind, "branch_id": branch_id, "draft_id": draft_id},
            Response(200, _draft(draft_id, branch_id, document_kind)),
            "GET", f"/api/internal/mcp/invoice-drafts/{draft_id}",
            None,
        ),
        (
            "erp_invoice_draft_update",
            {
                "document_kind": document_kind,
                "branch_id": branch_id,
                "draft_id": draft_id,
                "expected_row_version": 1,
                "payload": _envelope(
                    {"branch_id": branch_id, "lines": []}, document_kind
                ),
                },
                Response(200, _draft(
                    draft_id,
                    branch_id,
                    document_kind,
                    row_version=2,
                    payload=_envelope(
                        {"branch_id": branch_id, "lines": []}, document_kind
                    ),
                )),
            "PATCH", f"/api/internal/mcp/invoice-drafts/{draft_id}",
            {
                "expected_row_version": 1,
                "payload": _envelope(
                    {"branch_id": branch_id, "lines": []}, document_kind
                ),
            },
        ),
        (
            "erp_invoice_draft_abandon",
            {
                "document_kind": document_kind,
                "branch_id": branch_id,
                "draft_id": draft_id,
                "expected_row_version": 2,
            },
            Response(200, _draft(
                draft_id, branch_id, document_kind, row_version=3, status="abandoned"
            )),
            "POST", f"/api/internal/mcp/invoice-drafts/{draft_id}/abandon",
            {"expected_row_version": 2},
        ),
        (
            "erp_invoice_draft_prepare",
            {
                "document_kind": document_kind,
                "branch_id": branch_id,
                "draft_id": draft_id,
                "expected_row_version": 2,
            },
            Response(200, prepared),
            "POST", f"/api/internal/mcp/invoice-drafts/{draft_id}/prepare",
            {"expected_row_version": 2},
        ),
    )

    for tool_name, arguments, api_response, method, path, expected_body in scenarios:
        calls: list[tuple] = []
        responses = [
            Response(200, _grant(access, document_kind, branch_id)), api_response
        ]
        gateway = OperationGateway(
            settings(),
            lambda: Client(responses, calls),
        )
        result = await gateway.execute_operator(
            OPERATOR_OPERATIONS[tool_name], access, arguments
        )
        grant_call, api_call = calls
        assert grant_call[2]["json"]["operation_key"] == "sales.invoice.prepare"
        assert api_call[0] == method
        assert api_call[1].endswith(path)
        if expected_body is not None:
            assert api_call[2]["json"] == expected_body
        if tool_name == "erp_invoice_draft_list":
                assert api_call[2]["params"] == {
                    "document_kind": document_kind,
                    "branch_id": branch_id,
                    "status": "open",
                    "limit": 50,
                    "offset": 0,
            }
        assert access.token not in json.dumps(calls)
        if tool_name == "erp_invoice_draft_prepare":
            assert result == prepared


def test_prepare_cannot_supply_or_mutate_business_payload() -> None:
    schema = INVOICE_DRAFT_SCHEMAS["erp_invoice_draft_prepare"]
    assert set(schema["properties"]) == {
        "document_kind", "branch_id", "draft_id", "expected_row_version"
    }
    assert schema["additionalProperties"] is False
    errors = list(Draft202012Validator(schema).iter_errors({
        "document_kind": "sales_invoice",
        "branch_id": str(uuid4()),
        "draft_id": str(uuid4()),
        "expected_row_version": 1,
        "payload": _envelope({"lines": []}),
    }))
    assert errors


def test_update_requires_a_real_change_and_exact_row_version() -> None:
    schema = INVOICE_DRAFT_SCHEMAS["erp_invoice_draft_update"]
    incomplete = {
        "document_kind": "supplier_invoice",
        "branch_id": str(uuid4()),
        "draft_id": str(uuid4()),
        "expected_row_version": 1,
    }
    assert list(Draft202012Validator(schema).iter_errors(incomplete))
    Draft202012Validator(schema).validate({**incomplete, "title": "Resume supplier bill"})


@pytest.mark.asyncio
async def test_absolute_edit_path_is_rejected() -> None:
    access = _access()
    branch_id = str(uuid4())
    draft_id = str(uuid4())
    responses = [
        Response(200, _grant(access, "sales_invoice", branch_id)),
        Response(200, _draft(
            draft_id,
            branch_id,
            "sales_invoice",
            edit_path="https://attacker.example/draft",
        )),
    ]
    gateway = OperationGateway(settings(), lambda: Client(responses, []))

    with pytest.raises(UpstreamContractError, match="edit_path must be relative"):
        await gateway.execute_operator(
            OPERATOR_OPERATIONS["erp_invoice_draft_get"],
            access,
            {
                "document_kind": "sales_invoice",
                "branch_id": branch_id,
                "draft_id": draft_id,
            },
        )

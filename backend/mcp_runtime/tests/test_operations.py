from __future__ import annotations

import json
import time
from uuid import uuid4

import pytest
from mcp.server.auth.provider import AccessToken

from aasopharma_mcp.operations import (
    AuthorizationDenied,
    OPERATIONS,
    OPERATOR_OPERATIONS,
    OperationGateway,
    UpstreamContractError,
)
from conftest import settings


class Response:
    def __init__(self, status_code: int, payload) -> None:
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

    async def post(self, url, **kwargs):
        self.calls.append(("POST", url, kwargs))
        return self.responses.pop(0)

    async def get(self, url, **kwargs):
        self.calls.append(("GET", url, kwargs))
        return self.responses.pop(0)


def _access() -> AccessToken:
    organization_id = str(uuid4())
    return AccessToken(
        token="oauth-bearer-must-not-be-forwarded",
        client_id="claude-installation",
        scopes=["openid", "offline_access", "email"],
        expires_at=int(time.time()) + 300,
        subject=str(uuid4()),
        claims={
            "iss": settings().supabase_issuer,
            "organization_id": organization_id,
        },
    )


def _grant(access: AccessToken, operation_name: str) -> dict:
    operation = OPERATIONS[operation_name]
    return {
        "allowed": True,
        "issuer": access.claims["iss"],
        "subject": access.subject,
        "client_id": access.client_id,
        "operation_key": operation.key,
        "capability_code": operation.key,
        "organization_id": access.claims["organization_id"],
        "membership_id": str(uuid4()),
        "agent_grant_id": str(uuid4()),
        "branch_ids": [],
        "delegated_access_token": "d" * 48,
        "expires_at": int(time.time()) + 60,
    }


def _operator_grant(access: AccessToken, operation_name: str, command_id=None) -> dict:
    operation = OPERATOR_OPERATIONS[operation_name]
    return {
        "allowed": True,
        "issuer": access.claims["iss"],
        "subject": access.subject,
        "client_id": access.client_id,
        "operation_key": operation.operation_key,
        "capability_code": operation.operation_key,
        "operation_mode": "read" if operation.kind in {
            "status", "bank_reconciliation_readback", "supplier_advance_readback",
            "readback",
        } else "write",
        "permission_code": "automation.command.view",
        "organization_id": access.claims["organization_id"],
        "membership_id": str(uuid4()),
        "agent_grant_id": str(uuid4()),
        "branch_ids": [],
        "organization_scope": True,
        "command_request_id": command_id,
        "delegated_access_token": "w" * 48,
        "expires_at": int(time.time()) + 60,
    }


@pytest.mark.asyncio
async def test_tool_authorizes_app_owned_grant_then_uses_only_delegated_token() -> None:
    access = _access()
    calls: list[tuple] = []
    responses = [Response(200, _grant(access, "erp_product_search")), Response(200, [{"id": "p1"}])]
    gateway = OperationGateway(settings(), lambda: Client(responses, calls))

    result = await gateway.execute(
        OPERATIONS["erp_product_search"], access, {"q": "para", "limit": 20, "offset": 0}
    )

    assert result == [{"id": "p1"}]
    grant_call, api_call = calls
    assert grant_call[0] == "POST"
    assert grant_call[2]["headers"]["Authorization"].endswith("s" * 48)
    assert grant_call[2]["json"]["capability_code"] == "master.products.search"
    assert grant_call[2]["json"]["organization_id"] == access.claims["organization_id"]
    assert access.token not in json.dumps(grant_call[2])
    assert api_call[0] == "GET"
    assert api_call[2]["headers"] == {
        "Authorization": f"Bearer {'s' * 48}",
        "X-MCP-Delegated-Authorization": f"Bearer {'d' * 48}",
    }
    assert access.token not in json.dumps(api_call[2])
    assert all(
        operation.path.startswith(
            ("/api/internal/mcp/reads/", "/api/internal/mcp/resolution/")
        )
        for operation in OPERATIONS.values()
    )


@pytest.mark.asyncio
async def test_grant_response_echo_and_record_limits_fail_closed() -> None:
    access = _access()
    bad_grant = _grant(access, "erp_product_search")
    bad_grant["client_id"] = "other-client"
    responses = [Response(200, bad_grant)]
    gateway = OperationGateway(settings(), lambda: Client(responses, []))
    with pytest.raises(UpstreamContractError, match="client_id"):
        await gateway.execute(OPERATIONS["erp_product_search"], access, {})

    bad_grant = _grant(access, "erp_product_search")
    bad_grant["organization_id"] = str(uuid4())
    gateway = OperationGateway(
        settings(), lambda: Client([Response(200, bad_grant)], [])
    )
    with pytest.raises(UpstreamContractError, match="organization_id"):
        await gateway.execute(OPERATIONS["erp_product_search"], access, {})

    responses = [
        Response(200, _grant(access, "erp_gst_settings_get")),
        Response(200, [{"one": 1}, {"two": 2}]),
    ]
    gateway = OperationGateway(settings(), lambda: Client(responses, []))
    with pytest.raises(UpstreamContractError, match="record limit"):
        await gateway.execute(OPERATIONS["erp_gst_settings_get"], access, {})


@pytest.mark.asyncio
async def test_readiness_requires_the_app_owned_grant_authority() -> None:
    calls: list[tuple] = []
    responses = [Response(200, {"status": "ready", "grant_authority": "automation.agent_grants"})]
    gateway = OperationGateway(settings(), lambda: Client(responses, calls))
    await gateway.readiness()
    assert calls[0][1].endswith("/api/internal/mcp/agent-grants/ready")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("tool_name", "suffix", "method"),
    (
        ("erp_operation_approve", "/approve", "POST"),
        ("erp_operation_review_get", "/review", "GET"),
        ("erp_operation_execute", "/execute", "POST"),
        ("erp_operation_status_get", "", "GET"),
        ("erp_bank_reconciliation_get", "/bank-reconciliation-readback", "GET"),
        ("erp_supplier_advance_readback", "/supplier-advance-readback", "GET"),
        ("erp_expense_claim_readback", "/expense-claim-readback", "GET"),
    ),
)
async def test_shared_operator_tools_use_action_grant_and_delegated_token(
    tool_name: str, suffix: str, method: str
) -> None:
    access = _access()
    command_id = str(uuid4())
    preview_hash = "sha256:" + "a" * 64
    if tool_name == "erp_operation_approve":
        arguments = {
            "command_request_id": command_id,
            "preview_hash": preview_hash,
            "approval_intent": "approve",
            "idempotency_key": "approval-test-0001",
        }
    elif tool_name == "erp_operation_execute":
        arguments = {
            "command_request_id": command_id,
            "preview_hash": preview_hash,
            "idempotency_key": "execute-test-0001",
        }
    else:
        arguments = {"command_request_id": command_id}
    calls: list[tuple] = []
    responses = [
        Response(200, _operator_grant(access, tool_name, command_id)),
        Response(200, {"command_request_id": command_id, "status": "prepared"}),
    ]
    gateway = OperationGateway(settings(), lambda: Client(responses, calls))

    result = await gateway.execute_operator(
        OPERATOR_OPERATIONS[tool_name], access, arguments
    )

    assert result["command_request_id"] == command_id
    grant_call, action_call = calls
    assert grant_call[0] == "POST"
    assert grant_call[1].endswith("/api/internal/mcp/agent-grants/authorize-action")
    assert grant_call[2]["json"]["command_request_id"] == command_id
    assert grant_call[2]["json"]["organization_id"] == access.claims["organization_id"]
    assert action_call[0] == method
    assert action_call[1].endswith(f"/api/internal/mcp/commands/{command_id}{suffix}")
    assert action_call[2]["headers"]["X-MCP-Delegated-Authorization"] == (
        f"Bearer {'w' * 48}"
    )
    assert access.token not in json.dumps(calls)


@pytest.mark.asyncio
async def test_prepare_routes_exact_business_input_through_bounded_action_grant() -> None:
    access = _access()
    branch_id = str(uuid4())
    arguments = {
        "idempotency_key": "prepare-sales-order-0001",
        "branch_id": branch_id,
        "order_date": "2026-08-22",
        "document_discount": {
            "document_discount_kind": "none",
            "document_discount_basis": "taxable_value",
            "document_discount_value": "0",
        },
        "rounding_policy": "nearest_rupee",
        "zero_rated_payment_mode": "not_applicable",
        "customer_account_id": str(uuid4()),
        "lines": [
            {
                "product_id": str(uuid4()),
                "uom_conversion_id": str(uuid4()),
                "billed_quantity": "10",
                "free_quantity": "0",
                "free_supply_tax_treatment": "excluded_from_taxable_value",
                "quoted_unit_rate": "100.00",
                "price_basis": "tax_exclusive",
                "line_discount": {
                    "line_discount_kind": "none",
                    "line_discount_basis": "taxable_value",
                    "line_discount_value": "0",
                },
                "document_discount_eligible": True,
            }
        ],
    }
    command_id = str(uuid4())
    grant = _operator_grant(access, "erp_sales_order_prepare")
    grant["branch_ids"] = [branch_id]
    calls: list[tuple] = []
    responses = [
        Response(200, grant),
        Response(
            200,
            {
                "command_request_id": command_id,
                "status": "prepared",
                "preview_hash": "sha256:" + "a" * 64,
            },
        ),
    ]
    gateway = OperationGateway(
        settings(),
        lambda: Client(responses, calls),
    )

    result = await gateway.execute_operator(
        OPERATOR_OPERATIONS["erp_sales_order_prepare"], access, arguments
    )

    assert result["command_request_id"] == command_id
    assert calls[0][2]["json"]["branch_ids"] == [branch_id]
    assert calls[0][2]["json"]["organization_id"] == access.claims["organization_id"]
    assert calls[1][1].endswith(
        "/api/internal/mcp/actions/sales.order.prepare/prepare"
    )
    assert calls[1][2]["json"] == arguments
    assert access.token not in json.dumps(calls)


@pytest.mark.asyncio
async def test_operator_schema_rejects_extra_business_fields_before_network() -> None:
    calls: list[tuple] = []
    gateway = OperationGateway(settings(), lambda: Client([], calls))
    with pytest.raises(ValueError, match="Additional properties"):
        await gateway.execute_operator(
            OPERATOR_OPERATIONS["erp_operation_execute"],
            _access(),
            {
                "command_request_id": str(uuid4()),
                "preview_hash": "sha256:" + "a" * 64,
                "idempotency_key": "execute-test-0002",
                "lines": [],
            },
        )
    assert calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status_code", "payload", "expected", "excluded"),
    (
        (
            403,
            {"detail": "Exactly one active operator agent grant is required"},
            r"HTTP 403.*Exactly one active operator agent grant is required",
            None,
        ),
        (500, {"detail": "database password leaked"}, "HTTP 500", "password"),
        (403, ["not a detail object"], "HTTP 403", "not a detail object"),
    ),
)
async def test_operator_grant_rejection_reports_only_safe_authority_detail(
    status_code: int,
    payload,
    expected: str,
    excluded: str | None,
) -> None:
    gateway = OperationGateway(
        settings(), lambda: Client([Response(status_code, payload)], [])
    )

    with pytest.raises(AuthorizationDenied, match=expected) as raised:
        await gateway.execute_operator(
            OPERATOR_OPERATIONS["erp_operation_status_get"],
            _access(),
            {"command_request_id": str(uuid4())},
        )

    if excluded is not None:
        assert excluded not in str(raised.value)

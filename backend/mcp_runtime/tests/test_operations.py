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
    OPERATOR_READBACK_TOOLS,
    READ_ONLY_OPERATOR_KINDS,
    OperationGateway,
    UpstreamContractError,
)
from conftest import settings


def test_readback_tool_registry_is_the_single_route_and_grant_authority() -> None:
    assert {
        tool_name: (operation.kind, OPERATOR_READBACK_TOOLS[tool_name][1])
        for tool_name, operation in OPERATOR_OPERATIONS.items()
        if operation.kind in READ_ONLY_OPERATOR_KINDS - {"status"}
    } == dict(OPERATOR_READBACK_TOOLS)


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
        "operation_mode": (
            "read" if operation.kind in READ_ONLY_OPERATOR_KINDS else "write"
        ),
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
async def test_product_master_search_uses_distinct_draft_aware_capability_and_route() -> None:
    access = _access()
    calls: list[tuple] = []
    responses = [
        Response(200, _grant(access, "erp_product_master_search")),
        Response(200, [{
            "product_id": str(uuid4()), "status": "draft",
            "lifecycle_status": "draft", "row_version": 1,
        }]),
    ]
    gateway = OperationGateway(settings(), lambda: Client(responses, calls))
    arguments = {"q": "draft", "limit": 20, "offset": 0}

    result = await gateway.execute(
        OPERATIONS["erp_product_master_search"], access, arguments
    )

    assert result[0]["lifecycle_status"] == "draft"
    assert calls[0][2]["json"]["capability_code"] == "master.product_catalog.search"
    assert calls[1][1].endswith("/api/internal/mcp/reads/product-master")
    assert calls[1][2]["params"] == arguments


@pytest.mark.asyncio
async def test_master_create_uses_scoped_write_grant_and_canonical_backend_route() -> None:
    access = _access()
    calls: list[tuple] = []
    operation = OPERATOR_OPERATIONS["erp_product_create"]
    grant = _operator_grant(access, "erp_product_create")
    grant["permission_code"] = "catalog.product.manage"
    grant["organization_scope"] = True
    responses = [
        Response(200, grant),
        Response(200, {
            "product_id": str(uuid4()),
            "product_code": "PROD-000001",
            "idempotency_replayed": False,
        }),
    ]
    gateway = OperationGateway(settings(), lambda: Client(responses, calls))
    arguments = {
        "product_name": "Canonical MCP Product",
        "product_kind": "medicine",
        "idempotency_key": "mcp-product-create-0001",
    }

    result = await gateway.execute_operator(operation, access, arguments)

    grant_call, command_call = calls
    assert grant_call[0] == "POST"
    assert grant_call[2]["json"]["operation_key"] == "catalog.product_draft.create"
    assert grant_call[2]["json"]["operation_mode"] == "write"
    assert grant_call[2]["json"]["branch_ids"] == []
    assert command_call[0] == "POST"
    assert command_call[1].endswith("/api/internal/mcp/master/products")
    assert command_call[2]["json"] == arguments
    assert result["product_code"] == "PROD-000001"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("tool_name", "operation_key", "path", "arguments"),
    (
        (
            "erp_product_category_create", "catalog.product_category.create",
            "/api/internal/mcp/master/product-categories",
            {"name": "Analgesics", "idempotency_key": "mcp-category-create-0001"},
        ),
        (
            "erp_product_manufacturer_create", "catalog.product_manufacturer.create",
            "/api/internal/mcp/master/product-manufacturers",
            {"legal_name": "Exact Pharma Laboratories", "idempotency_key": "mcp-manufacturer-create-0001"},
        ),
    ),
)
async def test_product_reference_creates_share_scoped_canonical_authority(
    tool_name: str, operation_key: str, path: str, arguments: dict,
) -> None:
    access = _access()
    calls: list[tuple] = []
    operation = OPERATOR_OPERATIONS[tool_name]
    grant = _operator_grant(access, tool_name)
    grant["permission_code"] = "catalog.product.manage"
    responses = [Response(200, grant), Response(200, {"row_version": 1})]
    gateway = OperationGateway(settings(), lambda: Client(responses, calls))

    await gateway.execute_operator(operation, access, arguments)

    assert calls[0][2]["json"]["operation_key"] == operation_key
    assert calls[1][1].endswith(path)
    assert calls[1][2]["json"] == arguments


@pytest.mark.asyncio
async def test_product_setup_uses_scoped_write_grant_and_shared_backend_route() -> None:
    access = _access()
    calls: list[tuple] = []
    operation = OPERATOR_OPERATIONS["erp_product_setup"]
    grant = _operator_grant(access, "erp_product_setup")
    grant["permission_code"] = "catalog.product.manage"
    grant["organization_scope"] = True
    product_id = str(uuid4())
    manufacturer_id = str(uuid4())
    responses = [
        Response(200, grant),
        Response(200, {
            "product_id": product_id,
            "product_code": "PROD-000001",
            "row_version": 2,
            "lifecycle_status": "draft",
        }),
    ]
    gateway = OperationGateway(settings(), lambda: Client(responses, calls))
    arguments = {
        "product_id": product_id,
        "idempotency_key": "mcp-product-setup-0001",
        "row_version": 1,
        "manufacturer_party_id": manufacturer_id,
        "base_uom_code": "EA",
        "hsn_code": "3004",
        "dosage_form": "Tablet",
        "strength_display": "500 mg",
        "pack_conversions": [{"uom_code": "STRIP", "multiplier": "10"}],
        "ingredients": [],
    }

    result = await gateway.execute_operator(operation, access, arguments)

    grant_call, command_call = calls
    assert grant_call[2]["json"]["operation_key"] == "catalog.product_draft.configure"
    assert grant_call[2]["json"]["operation_mode"] == "write"
    assert grant_call[2]["json"]["branch_ids"] == []
    assert command_call[0] == "POST"
    assert command_call[1].endswith("/api/internal/mcp/master/products/setup")
    assert command_call[2]["json"] == arguments
    assert result["lifecycle_status"] == "draft"


@pytest.mark.asyncio
async def test_product_activation_uses_consequential_scoped_grant_and_shared_backend_route() -> None:
    access = _access()
    calls: list[tuple] = []
    operation = OPERATOR_OPERATIONS["erp_product_activate"]
    grant = _operator_grant(access, "erp_product_activate")
    grant["permission_code"] = "catalog.product.manage"
    grant["organization_scope"] = True
    product_id = str(uuid4())
    responses = [
        Response(200, grant),
        Response(200, {
            "product_id": product_id,
            "product_code": "PROD-000001",
            "row_version": 3,
            "lifecycle_status": "active",
            "idempotency_replayed": False,
        }),
    ]
    gateway = OperationGateway(settings(), lambda: Client(responses, calls))
    arguments = {
        "product_id": product_id,
        "row_version": 2,
        "manufacturer_traceability_code": "MFG-REVIEW-42",
        "idempotency_key": "mcp-product-activate-0001",
    }

    result = await gateway.execute_operator(operation, access, arguments)

    grant_call, command_call = calls
    assert grant_call[2]["json"] == {
        "issuer": access.claims["iss"],
        "subject": access.subject,
        "client_id": access.client_id,
        "organization_id": access.claims["organization_id"],
        "operation_key": "catalog.product.activate",
        "capability_code": "catalog.product.activate",
        "operation_mode": "write",
        "branch_ids": [],
        "command_request_id": None,
    }
    assert command_call[0] == "POST"
    assert command_call[1].endswith("/api/internal/mcp/master/products/activate")
    assert command_call[2]["json"] == arguments
    assert result["lifecycle_status"] == "active"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("tool_name", "operation_key", "path", "identity_field"),
    (
        (
            "erp_customer_update", "parties.customer.update",
            "/api/internal/mcp/master/customers/update", "customer_id",
        ),
        (
            "erp_supplier_update", "parties.supplier.update",
            "/api/internal/mcp/master/suppliers/update", "supplier_id",
        ),
    ),
)
async def test_master_update_routes_versions_and_patch_through_scoped_grant(
    tool_name: str, operation_key: str, path: str, identity_field: str,
) -> None:
    access = _access()
    calls: list[tuple] = []
    operation = OPERATOR_OPERATIONS[tool_name]
    grant = _operator_grant(access, tool_name)
    grant["permission_code"] = f"parties.{tool_name.split('_')[1]}.manage"
    arguments = {
        identity_field: str(uuid4()),
        "account_row_version": 3,
        "party_row_version": 4,
        f"{tool_name.split('_')[1]}_name": "Canonical Updated Name",
        "idempotency_key": f"mcp-{tool_name}-0001",
    }
    responses = [Response(200, grant), Response(200, arguments)]
    gateway = OperationGateway(settings(), lambda: Client(responses, calls))

    assert await gateway.execute_operator(operation, access, arguments) == arguments
    grant_call, command_call = calls
    assert grant_call[2]["json"]["operation_key"] == operation_key
    assert command_call[0] == "POST"
    assert command_call[1].endswith(path)
    assert command_call[2]["json"] == arguments


@pytest.mark.parametrize("tool_name", ("erp_customer_update", "erp_supplier_update"))
def test_master_update_schema_requires_versions_and_a_mutable_field(tool_name: str) -> None:
    schema = OPERATOR_OPERATIONS[tool_name].input_schema
    assert {"account_row_version", "party_row_version", "idempotency_key"} <= set(schema["required"])
    assert schema["anyOf"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "lookup",
    [
        {
            "sales_order_id": "0198ea37-2b21-7c8d-9123-123456789abc",
            "order_number": None,
            "fiscal_year": None,
        },
        {
            "sales_order_id": None,
            "order_number": "SO-2026-0001",
            "fiscal_year": 2026,
        },
    ],
)
async def test_document_reads_omit_none_and_delegate_branch_without_query_leakage(
    lookup: dict,
) -> None:
    access = _access()
    branch_id = str(uuid4())
    grant = _grant(access, "erp_sales_order_get")
    grant["branch_ids"] = [branch_id]
    calls: list[tuple] = []
    gateway = OperationGateway(
        settings(),
        lambda: Client(
            [
                Response(200, grant),
                Response(200, {"match_state": "matched", "results": []}),
            ],
            calls,
        ),
    )

    await gateway.execute(
        OPERATIONS["erp_sales_order_get"],
        access,
        {"branch_id": branch_id, **lookup},
    )

    grant_call, api_call = calls
    assert grant_call[2]["json"]["branch_id"] == branch_id
    assert grant_call[2]["json"]["organization_id"] == access.claims["organization_id"]
    assert api_call[2]["params"] == {
        key: value for key, value in lookup.items() if value is not None
    }
    assert "branch_id" not in api_call[2]["params"]


@pytest.mark.asyncio
async def test_read_gateway_omits_only_none_optional_parameters() -> None:
    access = _access()
    calls: list[tuple] = []
    gateway = OperationGateway(
        settings(),
        lambda: Client(
            [
                Response(200, _grant(access, "erp_product_search")),
                Response(200, []),
            ],
            calls,
        ),
    )

    await gateway.execute(
        OPERATIONS["erp_product_search"],
        access,
        {
            "search_term": "",
            "limit": 0,
            "offset": 0,
            "include_inactive": False,
            "optional_filter": None,
        },
    )

    assert calls[1][2]["params"] == {
        "search_term": "",
        "limit": 0,
        "offset": 0,
        "include_inactive": False,
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("tool_name", "params", "records_field"),
    (
        ("erp_party_aging_get", {"party_type": "supplier"}, "parties"),
        (
            "erp_party_statement_get",
            {
                "party_account_id": str(uuid4()), "party_type": "customer",
                "date_from": "2026-08-01", "date_to": "2026-08-31",
                "page": 1, "page_size": 100,
            },
            "items",
        ),
        (
            "erp_trial_balance_get",
            {"date_from": "2026-08-01", "date_to": "2026-08-31"},
            "rows",
        ),
        (
            "erp_profit_loss_get",
            {"date_from": "2026-08-01", "date_to": "2026-08-31"},
            "rows",
        ),
        (
            "erp_customer_activity_get",
            {"date_from": "2026-08-01", "date_to": "2026-08-31"},
            "customers",
        ),
    ),
)
async def test_canonical_finance_reads_preserve_exact_query_and_bound_records(
    tool_name: str, params: dict, records_field: str,
) -> None:
    access = _access()
    calls: list[tuple] = []
    operation = OPERATIONS[tool_name]
    responses = [
        Response(200, _grant(access, tool_name)),
        Response(200, {records_field: []}),
    ]
    gateway = OperationGateway(
        settings(),
        lambda: Client(responses, calls),
    )

    assert await gateway.execute(operation, access, params) == {records_field: []}
    assert calls[1][2]["params"] == params

    oversized = {records_field: [{}] * (operation.max_records + 1)}
    responses = [
        Response(200, _grant(access, tool_name)), Response(200, oversized)
    ]
    gateway = OperationGateway(
        settings(),
        lambda: Client(responses, []),
    )
    with pytest.raises(UpstreamContractError, match="record limit"):
        await gateway.execute(operation, access, params)

    responses = [Response(200, _grant(access, tool_name)), Response(200, {})]
    gateway = OperationGateway(
        settings(),
        lambda: Client(responses, []),
    )
    with pytest.raises(UpstreamContractError, match=records_field):
        await gateway.execute(operation, access, params)


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
        ("erp_sales_dispatch_readback", "/sales-dispatch-readback", "GET"),
        ("erp_sales_return_readback", "/sales-return-readback", "GET"),
        ("erp_purchase_return_readback", "/purchase-return-readback", "GET"),
        ("erp_customer_receipt_readback", "/customer-receipt-readback", "GET"),
        ("erp_supplier_payment_readback", "/supplier-payment-readback", "GET"),
        ("erp_supplier_advance_readback", "/supplier-advance-readback", "GET"),
        ("erp_inventory_transfer_readback", "/inventory-transfer-readback", "GET"),
        ("erp_inventory_adjustment_readback", "/inventory-adjustment-readback", "GET"),
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
    delivery_address_id = str(uuid4())
    arguments = {
        "idempotency_key": "prepare-sales-order-0001",
        "branch_id": branch_id,
        "order_date": "2026-08-22",
        "requested_delivery_date": "2026-08-24",
        "document_discount": {
            "document_discount_kind": "none",
            "document_discount_basis": "taxable_value",
            "document_discount_value": "0",
        },
        "rounding_policy": "nearest_rupee",
        "zero_rated_payment_mode": "not_applicable",
        "customer_account_id": str(uuid4()),
        "delivery_address_id": delivery_address_id,
        "delivery_address_row_version": "7",
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
    assert calls[1][2]["json"]["delivery_address_id"] == delivery_address_id
    assert calls[1][2]["json"]["delivery_address_row_version"] == "7"
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

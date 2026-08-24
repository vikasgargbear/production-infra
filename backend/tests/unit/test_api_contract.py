"""Contract tests for the reviewed agent-facing OpenAPI allowlist."""

from dataclasses import replace
from types import SimpleNamespace

import pytest
from fastapi import FastAPI

from app.core import api_contract
from app.core.api_contract import (
    OPERATION_REGISTRY,
    OperationRisk,
    install_operation_registry,
    validate_operation_definitions,
)
from app.main import app


def _schema_operation(schema, contract):
    return schema["paths"][contract.path][contract.method.lower()]


def test_registry_is_unique_and_read_only():
    definitions = validate_operation_definitions(OPERATION_REGISTRY)

    assert definitions
    assert all(operation.method == "GET" for operation in definitions)
    assert all(operation.risk == OperationRisk.READ_ONLY for operation in definitions)
    assert all(operation.side_effects == "none" for operation in definitions)
    assert all(operation.mcp_export for operation in definitions)


def test_registry_rejects_write_export():
    unsafe = replace(
        OPERATION_REGISTRY[0],
        key="sales.invoice.create",
        method="POST",
        path="/api/invoices/",
        operation_id="sales_create_invoice_v1",
        tool_name="erp_invoice_create",
        risk=OperationRisk.CONSEQUENTIAL_WRITE,
    )

    with pytest.raises(ValueError, match="read-only"):
        validate_operation_definitions((unsafe,))


def test_installer_rejects_route_without_enforced_security_dependencies():
    unsafe_app = FastAPI()

    @unsafe_app.get("/unsafe")
    async def unsafe_read():
        return {"unsafe": True}

    claimed_safe = replace(
        OPERATION_REGISTRY[0],
        key="unsafe.read",
        path="/unsafe",
        operation_id="unsafe_read_v1",
        tool_name="erp_unsafe_read",
    )

    with pytest.raises(RuntimeError, match="JWT organization context"):
        install_operation_registry(unsafe_app, (claimed_safe,))


def test_route_index_uses_effective_paths_from_lazy_included_routers(monkeypatch):
    nested = FastAPI()

    @nested.get("/local")
    async def nested_read():
        return {"ok": True}

    route = next(item for item in nested.routes if getattr(item, "path", None) == "/local")
    effective = SimpleNamespace(
        original_route=route,
        path="/api/nested/local",
        methods=route.methods,
    )
    monkeypatch.setattr(api_contract, "iter_route_contexts", lambda _routes: (effective,))

    index = api_contract._route_index(nested)

    assert index[("/api/nested/local", "GET")] == [effective]


def test_openapi_contains_only_the_reviewed_mcp_allowlist():
    schema = app.openapi()
    contract_extension = schema["x-erp-contract"]
    allowlist = contract_extension["allowlist"]

    assert contract_extension["boundary"] == "backend_application_api"
    assert contract_extension["mcp_transport_implemented"] is False
    assert contract_extension["write_operations_exported"] is False
    assert contract_extension["deprecations"] == []
    assert {item["operation_id"] for item in allowlist} == {
        operation.operation_id for operation in OPERATION_REGISTRY
    }

    exported_operation_ids = set()
    for path_item in schema["paths"].values():
        for method, operation in path_item.items():
            if method.lower() not in {"get", "post", "put", "patch", "delete"}:
                continue
            if operation.get("x-erp-mcp-export"):
                exported_operation_ids.add(operation["operationId"])

    assert exported_operation_ids == {
        operation.operation_id for operation in OPERATION_REGISTRY
    }


def test_invoice_calculation_preview_is_authenticated_but_not_mcp_exported():
    operation = app.openapi()["paths"]["/api/calculations/invoice"]["post"]

    assert operation.get("x-erp-mcp-export") is not True
    assert {next(iter(item)) for item in operation["security"]} == {"HTTPBearer"}
    assert all(
        contract.path != "/api/calculations/invoice"
        for contract in OPERATION_REGISTRY
    )


def test_sales_order_preview_is_authenticated_but_not_mcp_exported():
    schema = app.openapi()
    operation = schema["paths"]["/api/calculations/sales-order"]["post"]

    assert operation.get("x-erp-mcp-export") is not True
    assert {next(iter(item)) for item in operation["security"]} == {"HTTPBearer"}
    assert all(
        contract.path != "/api/calculations/sales-order"
        for contract in OPERATION_REGISTRY
    )
    request_schema = schema["components"]["schemas"]["SalesOrderCalculationRequest"]
    assert request_schema["properties"]["items"]["maxItems"] == 200
    entity_schema = schema["components"]["schemas"]["SalesOrderCalculationLine"]
    assert any(option.get("format") == "uuid" for option in entity_schema["properties"]["product_id"]["anyOf"])


@pytest.mark.parametrize("contract", OPERATION_REGISTRY)
def test_exported_operation_has_explicit_security_metadata(contract):
    operation = _schema_operation(app.openapi(), contract)

    assert operation["operationId"] == contract.operation_id
    assert operation["x-erp-mcp-export"] is True
    assert operation["x-erp-tool-name"] == contract.tool_name
    assert operation["x-erp-risk"] == "read_only"
    assert operation["x-erp-side-effects"] == "none"
    assert operation["x-erp-approval"] == "none"
    assert operation["x-erp-idempotency"] == "not_applicable"
    assert operation["x-erp-data-classification"] in {"internal", "confidential"}
    assert operation["x-erp-max-records"] == contract.max_records
    assert operation["x-erp-permission"] == contract.permission
    assert operation["x-erp-tenant-scope"] == "organization"
    assert operation["x-erp-deprecated"] is False
    assert {next(iter(item)) for item in operation["security"]} == {"HTTPBearer"}

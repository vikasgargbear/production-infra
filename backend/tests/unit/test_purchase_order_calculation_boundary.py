from app.main import app
from app.core.api_contract import _route_index


def test_purchase_preview_is_authenticated_and_not_mcp_exported():
    operation = app.openapi()["paths"]["/api/calculations/purchase-order"]["post"]

    assert operation["security"] == [{"HTTPBearer": []}]
    assert "x-erp-tool-name" not in operation
    request_schema = operation["requestBody"]["content"]["application/json"]["schema"]
    assert request_schema["$ref"].endswith("/PurchaseCalculationRequest")


def test_purchase_preview_route_is_mounted_once():
    route = _route_index(app)[("/api/calculations/purchase-order", "POST")][0]
    assert route.methods == {"POST"}


def test_purchase_calculator_rejects_empty_lines():
    from app.api.services.purchase.calculations import PurchaseCalculator

    try:
        PurchaseCalculator.calculate_totals([])
    except ValueError as exc:
        assert "at least one" in str(exc)
    else:
        raise AssertionError("empty purchase preview must fail closed")

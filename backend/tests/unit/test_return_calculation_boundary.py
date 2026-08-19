from decimal import Decimal

from app.api.services.returns.return_service import ReturnService
from app.main import app


def test_return_preview_is_typed_authenticated_and_not_mcp_exported():
    operation = app.openapi()["paths"]["/api/calculations/return"]["post"]

    assert operation["security"] == [{"HTTPBearer": []}]
    assert "x-erp-tool-name" not in operation
    request_schema = operation["requestBody"]["content"]["application/json"]["schema"]
    assert request_schema["$ref"].endswith("/ReturnCalculationRequest")


def test_sales_return_lines_reconcile_with_free_quantity_and_gst_withheld():
    result = ReturnService.calculate_return_totals(
        [{
            "product_id": 11,
            "return_quantity": "3",
            "paid_quantity": "2",
            "free_quantity": "1",
            "unit_price": "100",
            "discount_percent": "10",
            "tax_percent": "18",
        }],
        "IGST",
        include_gst=False,
        cap_to_paid_quantity=True,
        exclude_free_quantity_from_taxable=True,
    )

    line = result["calculated_items"][0]
    assert line["taxable_quantity"] == Decimal("2")
    assert line["taxable_amount"] == Decimal("180.00")
    assert line["tax_amount"] == Decimal("0.00")
    assert result["subtotal"] == Decimal("180.00")
    assert result["total_amount"] == Decimal("180")

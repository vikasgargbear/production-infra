from app.api.services.sales.challan.service import ChallanService
from app.main import app


def test_challan_preview_is_typed_authenticated_and_not_mcp_exported():
    operation = app.openapi()["paths"]["/api/calculations/challan"]["post"]

    assert operation["security"] == [{"HTTPBearer": []}]
    assert "x-erp-tool-name" not in operation
    request_schema = operation["requestBody"]["content"]["application/json"]["schema"]
    assert request_schema["$ref"].endswith("/ChallanCalculationRequest")


def test_challan_lines_reconcile_discount_gst_freight_and_total():
    result = ChallanService.calculate_challan_totals(
        items=[{
            "quantity": "2",
            "unit_price": "100",
            "discount_percent": "10",
            "gst_percent": "18",
        }],
        gst_type="CGST/SGST",
        freight_charges="7.25",
    )

    assert result["subtotal_amount"] == 200.0
    assert result["discount_amount"] == 20.0
    assert result["taxable_amount"] == 180.0
    assert result["cgst_amount"] == 16.2
    assert result["sgst_amount"] == 16.2
    assert result["total_tax_amount"] == 32.4
    assert result["final_amount"] == 219.65
    assert result["calculated_items"][0]["line_total"] == 212.4


def test_challan_rejects_zero_quantity_and_invalid_gst_rate():
    for item in (
        {"quantity": 0, "unit_price": 100, "gst_percent": 18},
        {"quantity": 1, "unit_price": 100, "gst_percent": 101},
    ):
        try:
            ChallanService.calculate_challan_totals([item], "IGST")
        except ValueError:
            pass
        else:
            raise AssertionError("invalid challan line must fail closed")

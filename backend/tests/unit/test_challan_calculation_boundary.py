from app.api.services.sales.challan.service import ChallanService
from app.api.schemas.calculations import ChallanCalculationRequest
from app.main import app
from uuid import UUID, uuid4


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


def test_challan_accepts_uuid_strings_and_values_free_supply_by_treatment():
    customer_id, product_id = uuid4(), uuid4()
    request = ChallanCalculationRequest.model_validate({
        "customer_id": str(customer_id),
        "gst_type": "IGST",
        "items": [{
            "product_id": str(product_id),
            "quantity": "0",
            "free_quantity": "2",
            "free_supply_tax_treatment": "included_at_unit_rate",
            "unit_price": "100",
            "gst_percent": "18",
        }],
    })

    assert request.customer_id == UUID(str(customer_id))
    assert request.items[0].product_id == UUID(str(product_id))
    result = ChallanService.calculate_challan_totals(
        [item.model_dump() for item in request.items], request.gst_type
    )
    assert result["subtotal_amount"] == 200.0
    assert result["igst_amount"] == 36.0
    assert result["final_amount"] == 236.0
    assert result["calculated_items"][0]["quantity"] == 0.0
    assert result["calculated_items"][0]["free_quantity"] == 2.0


def test_challan_mixed_billed_and_free_excludes_free_by_default():
    result = ChallanService.calculate_challan_totals(
        [{
            "quantity": "1", "free_quantity": "2", "unit_price": "100",
            "gst_percent": "18",
            "free_supply_tax_treatment": "excluded_from_taxable_value",
        }],
        "IGST",
    )
    assert result["subtotal_amount"] == 100.0
    assert result["igst_amount"] == 18.0
    assert result["final_amount"] == 118.0

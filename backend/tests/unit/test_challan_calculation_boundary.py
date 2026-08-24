import pytest
from pydantic import ValidationError
from types import SimpleNamespace

from app.api.services.sales.challan.service import ChallanService
from app.api.schemas.calculations import ChallanCalculationRequest
from app.api.routes.calculations import preview_challan_totals
from app.main import app
from uuid import UUID, uuid4


def test_challan_preview_is_typed_authenticated_and_not_mcp_exported():
    schema = app.openapi()
    operation = schema["paths"]["/api/calculations/challan"]["post"]

    assert operation["security"] == [{"HTTPBearer": []}]
    assert "x-erp-tool-name" not in operation
    request_schema = operation["requestBody"]["content"]["application/json"]["schema"]
    assert request_schema["$ref"].endswith("/ChallanCalculationRequest")
    challan_request = schema["components"]["schemas"]["ChallanCalculationRequest"]
    assert challan_request["additionalProperties"] is False
    assert "gst_type" in challan_request["required"]
    assert challan_request["properties"]["gst_type"]["enum"] == ["CGST/SGST", "IGST"]
    response_schema = operation["responses"]["200"]["content"][
        "application/json"
    ]["schema"]
    assert response_schema["$ref"].endswith("/ChallanCalculationPreviewResponse")
    totals = schema["components"]["schemas"]["ChallanCalculationPreviewTotals"]
    assert totals["additionalProperties"] is False


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


def test_challan_uuid_request_requires_explicit_document_gst_type():
    payload = {
        "customer_id": str(uuid4()),
        "items": [{
            "product_id": str(uuid4()),
            "quantity": 1,
            "unit_price": 100,
            "gst_percent": 18,
        }],
    }

    with pytest.raises(ValidationError, match="gst_type"):
        ChallanCalculationRequest.model_validate(payload)

    with pytest.raises(ValidationError, match="Input should be 'CGST/SGST' or 'IGST'"):
        ChallanCalculationRequest.model_validate({**payload, "gst_type": "AUTO"})


@pytest.mark.asyncio
@pytest.mark.parametrize("gst_type", ["CGST/SGST", "IGST"])
async def test_challan_uuid_route_uses_explicit_document_gst_type(gst_type):
    request = ChallanCalculationRequest.model_validate({
        "customer_id": str(uuid4()),
        "gst_type": gst_type,
        "items": [{
            "product_id": str(uuid4()),
            "quantity": 1,
            "unit_price": 100,
            "gst_percent": 18,
        }],
    })

    response = await preview_challan_totals.__wrapped__(
        request,
        {},
        db=None,
        context=SimpleNamespace(org_id=uuid4(), primary_branch_id=uuid4()),
    )

    assert response.gst_type == gst_type
    if gst_type == "IGST":
        assert response.totals.igst_amount == 18
        assert response.totals.cgst_amount == 0
        assert response.totals.sgst_amount == 0
    else:
        assert response.totals.igst_amount == 0
        assert response.totals.cgst_amount == 9
        assert response.totals.sgst_amount == 9


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


def test_challan_preview_response_validates_totals_and_preserves_uuid_line_id():
    from pydantic import ValidationError
    from app.api.routes.calculations import _preview_response
    from app.api.schemas.calculations import ChallanCalculationPreviewResponse

    product_id = uuid4()
    request = ChallanCalculationRequest.model_validate({
        "customer_id": str(uuid4()), "gst_type": "IGST",
        "items": [{
            "product_id": str(product_id), "quantity": 1, "free_quantity": 0,
            "free_supply_tax_treatment": "excluded_from_taxable_value",
            "unit_price": 100, "gst_percent": 18,
        }],
    })
    result = ChallanService.calculate_challan_totals(
        [item.model_dump() for item in request.items], request.gst_type
    )
    response = _preview_response(
        result,
        request.gst_type,
        ChallanCalculationPreviewResponse,
        request.items,
    )
    assert response.line_items[0].product_id == product_id
    assert isinstance(response.model_dump(mode="json")["totals"]["final_amount"], float)

    invalid = dict(result)
    invalid["final_amount"] = -1
    with pytest.raises(ValidationError, match="greater than or equal to 0"):
        _preview_response(
            invalid,
            request.gst_type,
            ChallanCalculationPreviewResponse,
            request.items,
        )

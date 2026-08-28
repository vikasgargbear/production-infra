"""Tests for the shared sales-order preview/commit calculation boundary."""

from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

from app.api.schemas.calculations import SalesOrderCalculationRequest
from app.api.services.sales.calculation import calculate_sales_totals
def test_sales_order_uuid_lines_preserve_free_supply_treatment():
    branch_id, customer_id, product_id, batch_id = uuid4(), uuid4(), uuid4(), uuid4()
    request = SalesOrderCalculationRequest.model_validate({
        "branch_id": str(branch_id),
        "customer_id": str(customer_id),
        "order_date": "2026-08-25",
        "items": [
            {
                "product_id": str(product_id), "batch_id": str(batch_id),
                "quantity": "0", "free_quantity": "2", "unit_price": "100",
                "free_supply_tax_treatment": "included_at_unit_rate",
            },
            {
                "product_id": str(product_id), "quantity": "1",
                "free_quantity": "2", "unit_price": "100",
                "free_supply_tax_treatment": "excluded_from_taxable_value",
            },
        ],
    })

    assert request.customer_id == UUID(str(customer_id))
    assert request.items[0].product_id == UUID(str(product_id))
    assert request.items[0].batch_id == UUID(str(batch_id))
    totals = calculate_sales_totals(
        items=[
            {**item.model_dump(), "resolved_gst_percent": "18"}
            for item in request.items
        ],
        gst_type="IGST",
    )
    assert totals["subtotal_amount"] == 300
    assert totals["igst_amount"] == 54
    assert totals["final_amount"] == 354
    assert totals["calculated_items"][0]["free_supply_tax_treatment"] == (
        "included_at_unit_rate"
    )
    from app.api.routes.calculations import _preview_response
    from app.api.schemas.calculations import InvoiceCalculationPreviewResponse
    authority_line = SimpleNamespace(
        hsn_code="481910", taxability="taxable",
        tax_code_version_id=uuid4(), tax_release_id=uuid4(),
        tax_version_number=1, tax_effective_from=__import__("datetime").date(2026, 4, 1),
        tax_effective_to=None, tax_ruleset_version="gst-2026.04",
    )
    response = _preview_response(
        totals,
        "IGST",
        InvoiceCalculationPreviewResponse,
        request.items,
        [authority_line, authority_line],
    )
    assert response.line_items[0].product_id == product_id
    assert response.line_items[0].batch_id == batch_id


def test_sales_order_rejects_browser_owned_gst_rates():
    branch_id, customer_id, product_id = uuid4(), uuid4(), uuid4()
    payload = {
        "branch_id": str(branch_id),
        "customer_id": str(customer_id),
        "order_date": "2026-08-25",
        "items": [{
            "product_id": str(product_id),
            "quantity": "2",
            "unit_price": "100",
        }],
    }

    request = SalesOrderCalculationRequest.model_validate(payload)
    assert request.items[0].product_id == product_id

    payload["items"][0]["tax_percent"] = "18"
    with pytest.raises(ValidationError, match="extra_forbidden"):
        SalesOrderCalculationRequest.model_validate(payload)

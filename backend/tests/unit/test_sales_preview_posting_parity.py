from decimal import Decimal
from uuid import uuid4

import pytest

from app.api.services.sales.calculation import calculate_sales_totals
from app.infrastructure.operator_actions.sales_invoice import calculation_documents


@pytest.mark.parametrize(
    "gst_type,supply_type,line_count,expected_total",
    [
        ("CGST/SGST", "intra_state", 1, "179.55"),
        ("IGST", "inter_state", 1, "179.55"),
        ("CGST/SGST", "intra_state", 2, "359.10"),
        ("IGST", "inter_state", 2, "359.10"),
    ],
)
def test_discounted_free_item_preview_matches_posting_component_rounding(
    gst_type,
    supply_type,
    line_count,
    expected_total,
) -> None:
    request = {
        "rounding_policy": "none",
        "zero_rated_payment_mode": "not_applicable",
        "document_discount": {
            "document_discount_kind": "percent",
            "document_discount_basis": "price_value",
            "document_discount_value": "5",
        },
    }
    resolution = {
        "supply_type": supply_type,
        "ruleset_version": "gst-rules-1",
        "lines": [
            {
                "line_id": str(uuid4()),
                "line_kind": "product",
                "product_id": str(uuid4()),
                "multiplier": "1.000000",
                "gst_rate": "5.000000",
                "cess_rate": "0.000000",
                "taxability": "taxable",
                "input": {
                    "billed_quantity": "2.000000",
                    "free_quantity": "1.000000",
                    "free_supply_tax_treatment": "excluded_from_taxable_value",
                    "quoted_unit_rate": "100.000000",
                    "price_basis": "tax_exclusive",
                    "line_discount": {
                        "line_discount_kind": "percent",
                        "line_discount_basis": "price_value",
                        "line_discount_value": "10.000000",
                    },
                    "document_discount_eligible": True,
                },
            }
            for _ in range(line_count)
        ],
    }
    _, prepared = calculation_documents(request, resolution, invoice_id=uuid4())
    preview = calculate_sales_totals(
        [
            {
                "quantity": "2",
                "free_quantity": "1",
                "unit_price": "100",
                "free_supply_tax_treatment": "excluded_from_taxable_value",
                "discount_percent": "10",
                "resolved_gst_percent": "5",
            }
            for _ in range(line_count)
        ],
        gst_type,
        discount_percent="5",
    )
    assert prepared["totals"]["grand_total"] == expected_total
    assert preview["final_amount"] == Decimal(expected_total)
    assert preview["taxable_amount"] == Decimal(prepared["totals"]["gst_taxable_total"])
    if supply_type == "intra_state" and line_count == 1:
        assert preview["taxable_amount"] == Decimal("170.99")
        assert preview["cgst_amount"] == preview["sgst_amount"] == Decimal("4.28")
    for component in ("cgst", "sgst", "igst"):
        assert preview[f"{component}_amount"] == Decimal(
            prepared["totals"][f"{component}_total"]
        )
    for displayed, authoritative in zip(preview["calculated_items"], prepared["lines"]):
        for field in ("cgst_amount", "sgst_amount", "igst_amount", "line_total"):
            assert displayed[field] == Decimal(authoritative[field])

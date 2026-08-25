from decimal import Decimal

import pytest

from app.api.services.sales.calculation import calculate_sales_totals


def _line(**overrides):
    return {
        "quantity": "1",
        "free_quantity": "0",
        "free_supply_tax_treatment": "excluded_from_taxable_value",
        "unit_price": "100.00",
        "discount_percent": "0",
        "resolved_gst_percent": "18.00",
        **overrides,
    }


def test_sales_preview_uses_only_explicit_server_resolved_rate() -> None:
    totals = calculate_sales_totals([_line(gst_percent="99")], "IGST")

    assert totals["taxable_amount"] == Decimal("100.00")
    assert totals["igst_amount"] == Decimal("18.00")
    assert totals["final_amount"] == Decimal("118")
    assert totals["calculated_items"][0]["gst_percent"] == Decimal("18.00")


def test_sales_preview_fails_closed_without_resolved_rate() -> None:
    line = _line()
    del line["resolved_gst_percent"]

    with pytest.raises(KeyError, match="resolved_gst_percent"):
        calculate_sales_totals([line], "IGST")


def test_sales_preview_allocates_exact_document_discount_and_gst() -> None:
    totals = calculate_sales_totals(
        [_line(), _line(unit_price="50.00")],
        "CGST/SGST",
        discount_type="amount",
        discount_amount="15.00",
    )

    assert totals["scheme_discount"] == Decimal("15.00")
    assert totals["taxable_amount"] == Decimal("135.00")
    assert totals["cgst_amount"] == Decimal("12.15")
    assert totals["sgst_amount"] == Decimal("12.15")
    assert totals["final_amount"] == Decimal("159")


@pytest.mark.parametrize("rate", ["-0.01", "100.01", "nan", "infinity"])
def test_sales_preview_rejects_invalid_authority_rate(rate: str) -> None:
    with pytest.raises(ValueError):
        calculate_sales_totals([_line(resolved_gst_percent=rate)], "IGST")

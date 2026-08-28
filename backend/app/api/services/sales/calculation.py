"""Exact, non-persistent arithmetic for canonical sales previews.

Tax rates passed to this calculator must already have been resolved by the
server from the effective tax-code version.  This module has no database or
write dependencies; the boundary that resolves tax authority lives in the
calculation route and canonical prepare commands.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from app.api.shared.calculations import calculate_line_item
from app.core.money import decimal_value, money, rupees


def _gst_components(
    taxable_amount: Decimal,
    gst_rate: Decimal,
    gst_type: str,
) -> dict[str, Decimal]:
    tax = money(taxable_amount * gst_rate / Decimal("100"))
    if gst_type == "IGST":
        return {
            "cgst_amount": Decimal("0.00"),
            "sgst_amount": Decimal("0.00"),
            "igst_amount": tax,
            "total_tax_amount": tax,
        }
    cgst = money(taxable_amount * gst_rate / Decimal("200"))
    sgst = money(tax - cgst)
    return {
        "cgst_amount": cgst,
        "sgst_amount": sgst,
        "igst_amount": Decimal("0.00"),
        "total_tax_amount": money(cgst + sgst),
    }


def calculate_sales_totals(
    items: list[dict[str, Any]],
    gst_type: str,
    freight_charges: object = Decimal("0"),
    insurance_charges: object = Decimal("0"),
    other_charges: object = Decimal("0"),
    discount_type: str = "percentage",
    discount_percent: object = Decimal("0"),
    discount_amount: object = Decimal("0"),
    rounding_policy: str = "nearest_rupee",
) -> dict[str, Any]:
    """Calculate exact invoice/order totals from server-resolved line rates."""
    if not isinstance(items, list) or not items:
        raise ValueError("items must contain at least one sales line")

    normalized_gst_type = str(gst_type).strip().upper()
    if normalized_gst_type not in {"IGST", "CGST/SGST"}:
        raise ValueError("gst_type must be 'IGST' or 'CGST/SGST'")

    normalized_discount_type = str(discount_type or "percentage").strip().lower()
    if normalized_discount_type not in {"percentage", "amount", "fixed"}:
        raise ValueError("discount_type must be 'percentage', 'amount', or 'fixed'")
    normalized_rounding_policy = str(rounding_policy).strip().lower()
    if normalized_rounding_policy not in {"none", "nearest_rupee"}:
        raise ValueError("rounding_policy must be 'none' or 'nearest_rupee'")
    document_discount_percent = decimal_value(
        discount_percent,
        "discount_percent",
        minimum=Decimal("0"),
        maximum=Decimal("100"),
    )
    document_discount_amount = decimal_value(
        discount_amount, "discount_amount", minimum=Decimal("0")
    )

    gross_subtotal = Decimal("0")
    pre_scheme_taxable = Decimal("0")
    item_discount = Decimal("0")
    calculated_items: list[dict[str, Any]] = []

    for item in items:
        quantity = decimal_value(
            item.get("quantity", 0), "quantity", minimum=Decimal("0")
        )
        free_quantity = decimal_value(
            item.get("free_quantity", 0),
            "free_quantity",
            minimum=Decimal("0"),
        )
        if quantity + free_quantity <= 0:
            raise ValueError("quantity plus free_quantity must be greater than 0")
        unit_price = decimal_value(
            item.get("unit_price", 0), "unit_price", minimum=Decimal("0")
        )
        free_supply_tax_treatment = str(
            item.get("free_supply_tax_treatment", "excluded_from_taxable_value")
        ).strip()
        if free_supply_tax_treatment not in {
            "excluded_from_taxable_value",
            "included_at_unit_rate",
        }:
            raise ValueError("free_supply_tax_treatment is invalid")
        priced_quantity = quantity + (
            free_quantity
            if free_supply_tax_treatment == "included_at_unit_rate"
            else Decimal("0")
        )
        discount_pct = decimal_value(
            item.get("discount_percent", 0),
            "discount_percent",
            minimum=Decimal("0"),
            maximum=Decimal("100"),
        )
        gst_pct = decimal_value(
            item["resolved_gst_percent"],
            "resolved_gst_percent",
            minimum=Decimal("0"),
            maximum=Decimal("100"),
        )

        calculated = calculate_line_item(
            quantity=priced_quantity,
            unit_price=unit_price,
            discount_percent=discount_pct,
            gst_percent=gst_pct,
            gst_type=normalized_gst_type,
        )
        line_gross = money(priced_quantity * unit_price)
        line_discount = money(calculated["discount_amount"])
        line_taxable = money(calculated["taxable_amount"])
        calculated_items.append(
            {
                **calculated,
                "quantity": quantity,
                "free_quantity": free_quantity,
                "free_supply_tax_treatment": free_supply_tax_treatment,
                "gst_percent": gst_pct,
                "cgst_percent": (
                    gst_pct / 2 if normalized_gst_type == "CGST/SGST" else Decimal("0")
                ),
                "sgst_percent": (
                    gst_pct / 2 if normalized_gst_type == "CGST/SGST" else Decimal("0")
                ),
                "igst_percent": (
                    gst_pct if normalized_gst_type == "IGST" else Decimal("0")
                ),
                "total_tax_amount": calculated["total_tax"],
                "_taxable_before_scheme": line_taxable,
                "_gst_percent": gst_pct,
            }
        )
        gross_subtotal += line_gross
        pre_scheme_taxable += line_taxable
        item_discount += line_discount

    if normalized_discount_type == "percentage" and document_discount_percent > 0:
        scheme_discount_percent_value = document_discount_percent
        scheme_discount = money(
            pre_scheme_taxable * scheme_discount_percent_value / Decimal("100")
        )
    elif normalized_discount_type in {"amount", "fixed"} and document_discount_amount > 0:
        scheme_discount = money(document_discount_amount)
        scheme_discount_percent_value = (
            scheme_discount / pre_scheme_taxable * Decimal("100")
            if pre_scheme_taxable > 0
            else Decimal("0")
        )
    else:
        scheme_discount = Decimal("0")
        scheme_discount_percent_value = Decimal("0")
    if scheme_discount > pre_scheme_taxable:
        raise ValueError("document discount cannot exceed the taxable amount")

    taxable_indexes = [
        index
        for index, calculated in enumerate(calculated_items)
        if calculated["_taxable_before_scheme"] > 0
    ]
    allocated_discount = Decimal("0")
    cgst = Decimal("0")
    sgst = Decimal("0")
    igst = Decimal("0")
    taxable_amount = Decimal("0")

    for index, calculated in enumerate(calculated_items):
        line_taxable = calculated.pop("_taxable_before_scheme")
        line_gst_rate = calculated.pop("_gst_percent")
        line_scheme_discount = Decimal("0")
        if scheme_discount > 0 and line_taxable > 0:
            if index == taxable_indexes[-1]:
                line_scheme_discount = scheme_discount - allocated_discount
            else:
                line_scheme_discount = money(
                    scheme_discount * line_taxable / pre_scheme_taxable
                )
                allocated_discount += line_scheme_discount
        adjusted_taxable = money(line_taxable - line_scheme_discount)
        components = _gst_components(
            adjusted_taxable, line_gst_rate, normalized_gst_type
        )
        calculated.update(
            {
                "scheme_discount": line_scheme_discount,
                "taxable_amount": adjusted_taxable,
                **components,
                "total_tax": components["total_tax_amount"],
                "line_total": money(
                    adjusted_taxable + components["total_tax_amount"]
                ),
            }
        )
        taxable_amount += adjusted_taxable
        cgst += components["cgst_amount"]
        sgst += components["sgst_amount"]
        igst += components["igst_amount"]

    total_tax = money(cgst + sgst + igst)
    freight_value = money(
        decimal_value(freight_charges, "freight_charges", minimum=Decimal("0"))
    )
    insurance_value = money(
        decimal_value(insurance_charges, "insurance_charges", minimum=Decimal("0"))
    )
    other_value = money(
        decimal_value(other_charges, "other_charges", minimum=Decimal("0"))
    )
    amount_before_round = money(
        taxable_amount
        + total_tax
        + freight_value
        + insurance_value
        + other_value
    )
    final_amount = (
        rupees(amount_before_round)
        if normalized_rounding_policy == "nearest_rupee"
        else amount_before_round
    )
    return {
        "subtotal_amount": money(gross_subtotal),
        "discount_amount": money(item_discount),
        "scheme_discount": scheme_discount,
        "scheme_discount_percent": money(scheme_discount_percent_value),
        "taxable_amount": money(taxable_amount),
        "cgst_amount": money(cgst),
        "sgst_amount": money(sgst),
        "igst_amount": money(igst),
        "total_tax_amount": total_tax,
        "freight_charges": freight_value,
        "insurance_charges": insurance_value,
        "other_charges": other_value,
        "round_off_amount": money(final_amount - amount_before_round),
        "final_amount": final_amount,
        "calculated_items": calculated_items,
    }


__all__ = ["calculate_sales_totals"]

"""Pure, exact-decimal credit/debit-note calculation authority."""

from decimal import Decimal
from typing import Any

from ....core.money import decimal_value, money
from ...shared.calculations import calculate_gst_components


class AdjustmentNoteCalculator:
    @staticmethod
    def calculate_note_totals(
        note_data: dict[str, Any],
        gst_type: str,
    ) -> dict[str, Any]:
        items = note_data.get("items") or []
        include_gst = bool(
            note_data.get("include_gst", note_data.get("is_gst_applicable", True))
        )
        if not items:
            items = [{
                "quantity": 1,
                "unit_price": note_data.get("amount", 0),
                "discount_percent": 0,
                "gst_percent": note_data.get("tax_percent", 0),
            }]

        subtotal = Decimal("0")
        discount_amount = Decimal("0")
        taxable_amount = Decimal("0")
        cgst_amount = Decimal("0")
        sgst_amount = Decimal("0")
        igst_amount = Decimal("0")
        tax_amount = Decimal("0")
        calculated_items: list[dict[str, Any]] = []

        for item in items:
            quantity = decimal_value(item.get("quantity", 0), "quantity", minimum=Decimal("0"))
            if quantity <= 0:
                raise ValueError("quantity must be greater than 0")
            unit_price = decimal_value(
                item.get("unit_price", 0), "unit_price", minimum=Decimal("0")
            )
            discount_rate = decimal_value(
                item.get("discount_percent", 0),
                "discount_percent",
                minimum=Decimal("0"),
                maximum=Decimal("100"),
            )
            tax_rate = (
                decimal_value(
                    item.get("gst_percent", item.get("tax_percent", 0)),
                    "gst_percent",
                    minimum=Decimal("0"),
                    maximum=Decimal("100"),
                )
                if include_gst
                else Decimal("0")
            )
            line_subtotal = money(quantity * unit_price)
            line_discount = money(line_subtotal * discount_rate / Decimal("100"))
            line_taxable = line_subtotal - line_discount
            gst = calculate_gst_components(line_taxable, tax_rate, gst_type)
            line_tax = gst["total_tax_amount"]

            subtotal += line_subtotal
            discount_amount += line_discount
            taxable_amount += line_taxable
            cgst_amount += gst["cgst_amount"]
            sgst_amount += gst["sgst_amount"]
            igst_amount += gst["igst_amount"]
            tax_amount += line_tax
            calculated_items.append({
                **item,
                "subtotal_amount": line_subtotal,
                "discount_amount": line_discount,
                "taxable_amount": line_taxable,
                "cgst_amount": gst["cgst_amount"],
                "sgst_amount": gst["sgst_amount"],
                "igst_amount": gst["igst_amount"],
                "tax_amount": line_tax,
                "total_amount": line_taxable + line_tax,
            })

        return {
            "subtotal_amount": money(subtotal),
            "discount_amount": money(discount_amount),
            "taxable_amount": money(taxable_amount),
            "cgst_amount": money(cgst_amount),
            "sgst_amount": money(sgst_amount),
            "igst_amount": money(igst_amount),
            "tax_amount": money(tax_amount),
            "total_amount": money(taxable_amount + tax_amount),
            "calculated_items": calculated_items,
        }

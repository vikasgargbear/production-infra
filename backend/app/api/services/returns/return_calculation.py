"""Pure, exact-decimal return calculation authority.

Posting remains owned by reviewed canonical return commands.  This module is
limited to the authenticated, non-persistent calculation preview boundary.
"""

from decimal import Decimal
from typing import Any

from ....core.money import decimal_value, money, rupees
from ..compliance.gst_service import GSTService


class ReturnCalculator:
    @staticmethod
    def calculate_return_totals(
        items: list[dict[str, Any]],
        gst_type: str,
        include_gst: bool,
        cap_to_paid_quantity: bool,
        exclude_free_quantity_from_taxable: bool,
    ) -> dict[str, Any]:
        if not isinstance(items, list) or not items:
            raise ValueError("items must contain at least one return line")

        normalized_gst_type = str(gst_type).strip().upper()
        if normalized_gst_type not in {"CGST/SGST", "IGST"}:
            raise ValueError("gst_type must be 'IGST' or 'CGST/SGST'")

        subtotal = Decimal("0")
        tax_amount = Decimal("0")
        cgst_amount = Decimal("0")
        sgst_amount = Decimal("0")
        igst_amount = Decimal("0")
        total_amount = Decimal("0")
        total_return_quantity = Decimal("0")
        calculated_items: list[dict[str, Any]] = []

        for item in items:
            requested_qty = decimal_value(
                item.get("return_quantity") or item.get("quantity", 0),
                "return_quantity",
                minimum=Decimal("0"),
            )
            if requested_qty <= 0:
                raise ValueError("return_quantity must be greater than 0")
            paid_qty = decimal_value(
                item.get("paid_quantity", 0) or 0, "paid_quantity", minimum=Decimal("0")
            )
            free_qty = decimal_value(
                item.get("free_quantity", 0) or 0, "free_quantity", minimum=Decimal("0")
            )
            rate = decimal_value(
                item.get("unit_price") or item.get("rate", 0),
                "unit_price",
                minimum=Decimal("0"),
            )
            discount_percent = decimal_value(
                item.get("discount_percent", 0),
                "discount_percent",
                minimum=Decimal("0"),
                maximum=Decimal("100"),
            )
            tax_percent = (
                decimal_value(
                    item.get("tax_percent", item.get("gst_percent", 0)),
                    "tax_percent",
                    minimum=Decimal("0"),
                    maximum=Decimal("100"),
                )
                if include_gst
                else Decimal("0")
            )

            taxable_quantity = requested_qty
            if cap_to_paid_quantity and paid_qty > 0:
                taxable_quantity = min(taxable_quantity, paid_qty)
            elif exclude_free_quantity_from_taxable and free_qty > 0:
                taxable_quantity = max(Decimal("0"), taxable_quantity - free_qty)

            base_amount = money(taxable_quantity * rate)
            discount_amount = money(base_amount * discount_percent / Decimal("100"))
            taxable_amount = base_amount - discount_amount
            gst = GSTService.calculate_gst_components(
                taxable_amount, tax_percent, normalized_gst_type
            )
            item_tax = gst["total_tax_amount"]

            subtotal += taxable_amount
            tax_amount += item_tax
            cgst_amount += gst["cgst_amount"]
            sgst_amount += gst["sgst_amount"]
            igst_amount += gst["igst_amount"]
            total_amount += taxable_amount + item_tax
            total_return_quantity += requested_qty
            calculated_items.append({
                "product_id": item.get("product_id"),
                "return_quantity": requested_qty,
                "taxable_quantity": taxable_quantity,
                "unit_price": rate,
                "discount_percent": discount_percent,
                "discount_amount": discount_amount,
                "tax_percent": tax_percent,
                "taxable_amount": taxable_amount,
                "cgst_amount": gst["cgst_amount"],
                "sgst_amount": gst["sgst_amount"],
                "igst_amount": gst["igst_amount"],
                "tax_amount": item_tax,
                "total_amount": taxable_amount + item_tax,
            })

        rounded_total = rupees(total_amount)
        return {
            "subtotal": money(subtotal),
            "tax_amount": money(tax_amount),
            "cgst_amount": money(cgst_amount),
            "sgst_amount": money(sgst_amount),
            "igst_amount": money(igst_amount),
            "round_off_amount": money(rounded_total - total_amount),
            "total_amount": rounded_total,
            "total_return_quantity": total_return_quantity,
            "calculated_items": calculated_items,
        }

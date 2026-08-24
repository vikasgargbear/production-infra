"""Pure calculation helpers shared by document services.

HTTP previews live in ``api.routes.calculations``. Keeping this module free of
routers prevents unmounted legacy endpoints from becoming a second API surface.
"""

from decimal import Decimal
from typing import Dict

from ...core.money import decimal_value, money, rupees
from ..services.compliance.gst_service import GSTService


def calculate_line_item(
    quantity: object,
    unit_price: object,
    discount_percent: object,
    gst_percent: object,
    gst_type: str = "CGST/SGST",
) -> Dict[str, Decimal]:
    """Calculate one billable line using commercial half-up rounding."""
    quantity_value = decimal_value(quantity, "quantity", minimum=Decimal("0"))
    price_value = decimal_value(unit_price, "unit_price", minimum=Decimal("0"))
    discount_rate = decimal_value(
        discount_percent,
        "discount_percent",
        minimum=Decimal("0"),
        maximum=Decimal("100"),
    )
    gst_rate = decimal_value(
        gst_percent, "gst_percent", minimum=Decimal("0"), maximum=Decimal("100")
    )

    subtotal = money(quantity_value * price_value)
    discount_amount = money(subtotal * discount_rate / Decimal("100"))
    taxable_amount = subtotal - discount_amount
    gst = GSTService.calculate_gst_components(taxable_amount, gst_rate, gst_type)
    line_total = money(taxable_amount + gst["total_tax_amount"])

    return {
        "subtotal": subtotal,
        "discount_amount": discount_amount,
        "taxable_amount": taxable_amount,
        "cgst_amount": gst["cgst_amount"],
        "sgst_amount": gst["sgst_amount"],
        "igst_amount": gst["igst_amount"],
        "total_tax": gst["total_tax_amount"],
        "line_total": line_total,
    }


def finalize_totals(
    totals: Dict[str, float],
    freight: float = 0,
    insurance: float = 0,
    other_charges: float = 0,
    discount: float = 0,
    auto_round_off: bool = True,
    round_off_limit: float = 0.50,
) -> Dict[str, float]:
    """Add document charges and produce a reconciled final amount."""
    taxable = decimal_value(totals["taxable_amount"], "taxable_amount", minimum=Decimal("0"))
    tax = decimal_value(totals["total_tax"], "total_tax", minimum=Decimal("0"))
    freight_value = money(decimal_value(freight, "freight", minimum=Decimal("0")))
    insurance_value = money(decimal_value(insurance, "insurance", minimum=Decimal("0")))
    other_value = money(decimal_value(other_charges, "other_charges", minimum=Decimal("0")))
    discount_value = money(decimal_value(discount, "discount", minimum=Decimal("0")))
    net_amount = money(
        taxable + tax + freight_value + insurance_value + other_value - discount_value
    )
    if net_amount < 0:
        raise ValueError("discount cannot exceed the document amount")

    totals.update({
        "freight_charges": float(freight_value),
        "insurance_charges": float(insurance_value),
        "other_charges": float(other_value),
        "invoice_discount": float(discount_value),
        "net_amount": float(net_amount),
    })

    rounded_total = rupees(net_amount) if auto_round_off else net_amount
    calculated_round_off = money(rounded_total - net_amount)
    limit = decimal_value(round_off_limit, "round_off_limit", minimum=Decimal("0"))
    if not auto_round_off or abs(calculated_round_off) > limit:
        rounded_total = net_amount
        calculated_round_off = Decimal("0")

    totals["round_off"] = float(calculated_round_off)
    totals["final_amount"] = float(rounded_total)
    for key in (
        "gross_amount",
        "total_discount",
        "taxable_amount",
        "cgst_amount",
        "sgst_amount",
        "igst_amount",
        "total_tax",
    ):
        if key in totals:
            totals[key] = float(money(totals[key]))

    return totals

"""Non-persistent sales preview projection of the canonical posting calculator."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from app.core.money import decimal_value, money
from app.domain.calculations import (
    DiscountBasis,
    DiscountInput,
    DiscountKind,
    DocumentInput,
    FreeSupplyTaxTreatment,
    GstType,
    PriceBasis,
    ProductLineInput,
    RoundingPolicy,
    TaxabilitySnapshot,
    TaxChargeMechanism,
    ZeroRatedMode,
    calculate_document,
)


def calculate_sales_totals(
    items: list[dict[str, Any]],
    gst_type: str,
    freight_charges: object = Decimal("0"),
    insurance_charges: object = Decimal("0"),
    other_charges: object = Decimal("0"),
    discount_type: str = "percentage",
    discount_percent: object = Decimal("0"),
    discount_amount: object = Decimal("0"),
) -> dict[str, Any]:
    """Project canonical price-value discounts, allocation and tax arithmetic."""
    if not isinstance(items, list) or not items:
        raise ValueError("items must contain at least one sales line")
    normalized_gst_type = str(gst_type).strip().upper()
    if normalized_gst_type not in {"IGST", "CGST/SGST"}:
        raise ValueError("gst_type must be 'IGST' or 'CGST/SGST'")
    normalized_discount_type = str(discount_type or "percentage").strip().lower()
    if normalized_discount_type not in {"percentage", "amount", "fixed"}:
        raise ValueError("discount_type must be 'percentage', 'amount', or 'fixed'")
    percent = decimal_value(
        discount_percent,
        "discount_percent",
        minimum=Decimal("0"),
        maximum=Decimal("100"),
    )
    amount = decimal_value(discount_amount, "discount_amount", minimum=Decimal("0"))
    products = []
    for index, item in enumerate(items):
        quantity = decimal_value(
            item.get("quantity", 0), "quantity", minimum=Decimal("0")
        )
        free = decimal_value(
            item.get("free_quantity", 0), "free_quantity", minimum=Decimal("0")
        )
        if quantity + free <= 0:
            raise ValueError("quantity plus free_quantity must be greater than 0")
        rate = decimal_value(
            item.get("unit_price", 0), "unit_price", minimum=Decimal("0")
        )
        discount = decimal_value(
            item.get("discount_percent", 0),
            "discount_percent",
            minimum=Decimal("0"),
            maximum=Decimal("100"),
        )
        gst = decimal_value(
            item["resolved_gst_percent"],
            "resolved_gst_percent",
            minimum=Decimal("0"),
            maximum=Decimal("100"),
        )
        treatment = FreeSupplyTaxTreatment(
            str(
                item.get("free_supply_tax_treatment", "excluded_from_taxable_value")
            ).strip()
        )
        products.append(
            ProductLineInput(
                line_id=str(index),
                billed_quantity=quantity,
                free_quantity=free,
                base_billed_quantity=quantity,
                base_free_quantity=free,
                uom_conversion_factor=Decimal("1"),
                quoted_unit_rate=rate,
                price_basis=PriceBasis.TAX_EXCLUSIVE,
                line_discount=DiscountInput(
                    kind=DiscountKind.PERCENT,
                    basis=DiscountBasis.PRICE_VALUE,
                    value=discount,
                ),
                gst_rate=gst,
                free_supply_tax_treatment=treatment,
                cess_rate=Decimal("0"),
                taxability_snapshot=TaxabilitySnapshot.TAXABLE,
                tax_charge_mechanism=TaxChargeMechanism.NORMAL,
                document_discount_eligible=True,
            )
        )
    result = calculate_document(
        DocumentInput(
            products=tuple(products),
            gst_type=(
                GstType.INTER_STATE
                if normalized_gst_type == "IGST"
                else GstType.INTRA_STATE
            ),
            rounding_policy=RoundingPolicy.NONE,
            charges=(),
            zero_rated_mode=ZeroRatedMode.NOT_APPLICABLE,
            tax_charge_mechanism=TaxChargeMechanism.NORMAL,
            document_discount=DiscountInput(
                kind=(
                    DiscountKind.PERCENT
                    if normalized_discount_type == "percentage"
                    else DiscountKind.AMOUNT
                ),
                basis=DiscountBasis.PRICE_VALUE,
                value=percent if normalized_discount_type == "percentage" else amount,
            ),
        )
    )
    calculated_items = []
    for source, line in zip(products, result.products):
        intra = normalized_gst_type == "CGST/SGST"
        calculated_items.append(
            {
                "quantity": source.billed_quantity,
                "free_quantity": source.free_quantity,
                "free_supply_tax_treatment": source.free_supply_tax_treatment.value,
                "subtotal": line.gross_price_amount,
                "discount_amount": line.line_discount_amount,
                "scheme_discount": line.document_discount_amount,
                "taxable_amount": line.gst_taxable_value,
                "gst_percent": source.gst_rate,
                "cgst_percent": source.gst_rate / 2 if intra else Decimal("0"),
                "sgst_percent": source.gst_rate / 2 if intra else Decimal("0"),
                "igst_percent": Decimal("0") if intra else source.gst_rate,
                "cgst_amount": line.tax.cgst_amount,
                "sgst_amount": line.tax.sgst_amount,
                "igst_amount": line.tax.igst_amount,
                "total_tax_amount": line.tax.total_tax_amount,
                "total_tax": line.tax.total_tax_amount,
                "line_total": line.line_total,
            }
        )
    freight = money(
        decimal_value(freight_charges, "freight_charges", minimum=Decimal("0"))
    )
    insurance = money(
        decimal_value(insurance_charges, "insurance_charges", minimum=Decimal("0"))
    )
    other = money(decimal_value(other_charges, "other_charges", minimum=Decimal("0")))
    # Preserve separately displayed unallocated charge inputs; no tax facts are inferred.
    final = money(result.grand_total + freight + insurance + other)
    return {
        "subtotal_amount": money(
            sum((line.gross_price_amount for line in result.products), Decimal("0"))
        ),
        "discount_amount": result.line_discount_amount,
        "scheme_discount": result.document_discount_amount,
        "scheme_discount_percent": money(
            percent if normalized_discount_type == "percentage" else Decimal("0")
        ),
        "taxable_amount": result.gst_taxable_value,
        "cgst_amount": result.tax.cgst_amount,
        "sgst_amount": result.tax.sgst_amount,
        "igst_amount": result.tax.igst_amount,
        "total_tax_amount": result.tax.total_tax_amount,
        "freight_charges": freight,
        "insurance_charges": insurance,
        "other_charges": other,
        "round_off_amount": result.rounding_adjustment,
        "final_amount": final,
        "calculated_items": calculated_items,
    }


__all__ = ["calculate_sales_totals"]

"""Canonical wire projections for calculation artifact inputs."""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict

from .models import (
    ChargeReversalInput,
    PriorChargeReversalTotals,
    PriorProductReversalTotals,
    PriorReversalState,
    ProductReversalInput,
    ReversalInput,
    TaxAmounts,
)


def decimal_string(value: Decimal) -> str:
    """Return the exact non-exponent JSON string owned by the Decimal model."""
    if not isinstance(value, Decimal) or not value.is_finite():
        raise TypeError("canonical decimal values must be finite Decimal instances")
    return format(value, "f")


def _tax_components(tax: TaxAmounts) -> Dict[str, str]:
    return {
        "cess_amount": decimal_string(tax.cess_amount),
        "cgst_amount": decimal_string(tax.cgst_amount),
        "igst_amount": decimal_string(tax.igst_amount),
        "sgst_amount": decimal_string(tax.sgst_amount),
    }


def _product_reversal(item: ProductReversalInput) -> Dict[str, Any]:
    return {
        "final_residual": item.final_residual,
        "line_id": item.line_id,
        "reversed_base_billed_quantity": decimal_string(
            item.reversed_base_billed_quantity
        ),
        "reversed_base_free_quantity": decimal_string(
            item.reversed_base_free_quantity
        ),
        "reversed_billed_quantity": decimal_string(item.reversed_billed_quantity),
        "reversed_free_quantity": decimal_string(item.reversed_free_quantity),
        "value_basis": item.value_basis.value,
    }


def _charge_reversal(item: ChargeReversalInput) -> Dict[str, Any]:
    return {
        "final_residual": item.final_residual,
        "line_id": item.line_id,
        "ratio": decimal_string(item.ratio),
    }


def _prior_product(item: PriorProductReversalTotals) -> Dict[str, str]:
    return {
        **_tax_components(item.tax),
        "document_discount_amount": decimal_string(item.document_discount_amount),
        "gross_price_amount": decimal_string(item.gross_price_amount),
        "gst_taxable_value": decimal_string(item.gst_taxable_value),
        "line_discount_amount": decimal_string(item.line_discount_amount),
        "line_id": item.line_id,
        "net_value_amount": decimal_string(item.net_value_amount),
        "reversed_base_billed_quantity": decimal_string(
            item.reversed_base_billed_quantity
        ),
        "reversed_base_free_quantity": decimal_string(
            item.reversed_base_free_quantity
        ),
        "reversed_billed_quantity": decimal_string(item.reversed_billed_quantity),
        "reversed_free_quantity": decimal_string(item.reversed_free_quantity),
        "value_basis": item.value_basis.value,
    }


def _prior_charge(item: PriorChargeReversalTotals) -> Dict[str, str]:
    return {
        **_tax_components(item.tax),
        "document_discount_amount": decimal_string(item.document_discount_amount),
        "gross_price_amount": decimal_string(item.gross_price_amount),
        "gst_taxable_value": decimal_string(item.gst_taxable_value),
        "line_id": item.line_id,
        "net_value_amount": decimal_string(item.net_value_amount),
        "reversed_ratio": decimal_string(item.reversed_ratio),
    }


def serialize_prior_reversal_state(state: PriorReversalState) -> Dict[str, Any]:
    """Project cumulative engine totals without changing their field meanings."""
    if not isinstance(state, PriorReversalState):
        raise TypeError("state must be PriorReversalState")
    return {
        "charges": [_prior_charge(item) for item in state.charges],
        "products": [_prior_product(item) for item in state.products],
        "rounding_adjustment": decimal_string(state.rounding_adjustment),
    }


def reversal_input_payload(request: ReversalInput) -> Dict[str, Any]:
    """Project the engine request to the fixed calculation-input v1 shape."""
    if not isinstance(request, ReversalInput):
        raise TypeError("request must be ReversalInput")
    return {
        "charges": [_charge_reversal(item) for item in request.charges],
        "gst_tax_treatment": request.gst_tax_treatment.value,
        "prior_state": serialize_prior_reversal_state(request.prior_state),
        "products": [_product_reversal(item) for item in request.products],
    }

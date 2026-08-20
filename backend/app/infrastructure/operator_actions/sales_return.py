"""Canonical sales-return reversal calculation and persistence boundary."""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Mapping
from uuid import UUID

from sqlalchemy import text

from ...domain.calculations import (
    ChargeLineResult,
    DocumentResult,
    FreeSupplyTaxTreatment,
    GstTaxTreatment,
    GstType,
    PriceBasis,
    PriorProductReversalTotals,
    PriorReversalState,
    ProductLineResult,
    ProductReversalInput,
    ReversalInput,
    ReversalValueBasis,
    RoundingPolicy,
    TaxAmounts,
    TaxChargeMechanism,
    TaxabilitySnapshot,
    ZeroRatedMode,
    calculate_reversal,
    decimal_string,
    reversal_input_payload,
)
from .sales_order import ENGINE_VERSION, SERIALIZER_VERSION


RESOLVE_SALES_RETURN_SQL = text(
    """
    SELECT erp_automation_commands.resolve_sales_return_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :sales_return_id, CAST(:request_json AS jsonb)
    ) AS resolution
    """
)

PERSIST_SALES_RETURN_SQL = text(
    """
    SELECT erp_automation_commands.persist_sales_return_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :sales_return_id, :inventory_document_id,
        :command_request_id, :artifact_id, :request_id, :adjustment_note_id,
        :tax_document_id, :journal_id, :event_id, :allocation_id,
        :residual_open_item_id, :idempotency_key_hash, :return_sequence_key_hash,
        :request_bytes, :resolved_bytes, :preview_bytes, :calculation_input_bytes,
        :calculation_output_bytes, :expires_at
    ) AS command_request_id
    """
)


def _d(value: Any) -> Decimal:
    return Decimal(str(value))


def _tax(line: Mapping[str, Any]) -> TaxAmounts:
    components = [_d(line[f"{name}_amount"]) for name in ("cgst", "sgst", "igst", "cess")]
    return TaxAmounts(*components, sum(components, Decimal("0.00")))


def _original_document(resolution: Mapping[str, Any]) -> DocumentResult:
    source_input = resolution["original_calculation_input"]["document"]
    source_output = resolution["original_calculation_output"]
    output_by_id = {line["line_id"]: line for line in source_output["lines"]}
    products = []
    for line in source_input["products"]:
        output = output_by_id[line["line_id"]]
        products.append(ProductLineResult(
            line_id=line["line_id"], billed_quantity=_d(line["billed_quantity"]),
            free_quantity=_d(line["free_quantity"]), uom_conversion_factor=_d(line["uom_conversion_factor"]),
            base_billed_quantity=_d(line["base_billed_quantity"]), base_free_quantity=_d(line["base_free_quantity"]),
            quoted_unit_rate=_d(line["quoted_unit_rate"]), price_basis=PriceBasis(line["price_basis"]),
            free_supply_tax_treatment=FreeSupplyTaxTreatment(line["free_supply_tax_treatment"]),
            gst_rate=_d(line["gst_rate"]), cess_rate=_d(line["cess_rate"]),
            taxability_snapshot=TaxabilitySnapshot(line["taxability_snapshot"]),
            tax_charge_mechanism=TaxChargeMechanism(line["tax_charge_mechanism"]),
            gross_price_amount=_d(output["gross_amount"]), line_discount_amount=_d(output["line_discount_amount"]),
            line_pre_tax_discount_amount=_d(output["line_taxable_discount_amount"]),
            document_discount_amount=_d(output["document_discount_amount"]),
            document_pre_tax_discount_amount=_d(output["document_taxable_discount_amount"]),
            net_value_amount=_d(output["net_value_amount"]), gst_taxable_value=_d(output["gst_taxable_value"]),
            tax=_tax(output), recipient_assessed_tax_amount=_d(output["recipient_assessed_tax_amount"]),
            line_total=_d(output["line_total"]),
        ))
    charges = []
    for line in source_input["charges"]:
        output = output_by_id[line["line_id"]]
        charges.append(ChargeLineResult(
            line_id=line["line_id"], charge_code=line["charge_code"], quoted_amount=_d(line["quoted_amount"]),
            price_basis=PriceBasis(line["price_basis"]), taxability_snapshot=TaxabilitySnapshot(line["taxability_snapshot"]),
            tax_charge_mechanism=TaxChargeMechanism(line["tax_charge_mechanism"]), gst_rate=_d(line["gst_rate"]),
            cess_rate=_d(line["cess_rate"]), gross_price_amount=_d(output["gross_amount"]),
            document_discount_amount=_d(output["document_discount_amount"]),
            document_pre_tax_discount_amount=_d(output["document_taxable_discount_amount"]),
            net_value_amount=_d(output["net_value_amount"]), gst_taxable_value=_d(output["gst_taxable_value"]),
            tax=_tax(output), recipient_assessed_tax_amount=_d(output["recipient_assessed_tax_amount"]),
            line_total=_d(output["line_total"]),
        ))
    totals = source_output["totals"]
    return DocumentResult(
        gst_type=GstType(source_input["gst_type"]), zero_rated_mode=ZeroRatedMode(source_input["zero_rated_mode"]),
        rounding_policy=RoundingPolicy(source_input["rounding_policy"]),
        tax_charge_mechanism=TaxChargeMechanism(source_input["tax_charge_mechanism"]),
        products=tuple(products), charges=tuple(charges), gross_price_amount=_d(totals["subtotal"]) + _d(totals["charges_total"]),
        line_discount_amount=sum((_d(line["line_discount_amount"]) for line in source_output["lines"]), Decimal("0.00")),
        document_discount_amount=sum((_d(line["document_discount_amount"]) for line in source_output["lines"]), Decimal("0.00")),
        net_value_amount=_d(totals["net_value_total"]), gst_taxable_value=_d(totals["gst_taxable_total"]),
        tax=TaxAmounts(_d(totals["cgst_total"]), _d(totals["sgst_total"]), _d(totals["igst_total"]),
                       _d(totals["cess_total"]), _d(totals["cgst_total"]) + _d(totals["sgst_total"]) + _d(totals["igst_total"]) + _d(totals["cess_total"])),
        recipient_assessed_tax_total=_d(totals["recipient_assessed_tax_total"]),
        pre_round_total=_d(totals["pre_round_total"]), rounding_adjustment=_d(totals["rounding_adjustment"]),
        grand_total=_d(totals["grand_total"]), gst_tax_treatment=GstTaxTreatment(source_output["gst_tax_treatment"]),
    )


def _prior_state(resolution: Mapping[str, Any]) -> PriorReversalState:
    products = []
    for line in resolution["prior_state"]["products"]:
        products.append(PriorProductReversalTotals(
            line_id=line["line_id"], value_basis=ReversalValueBasis(line["value_basis"]),
            reversed_billed_quantity=_d(line["reversed_billed_quantity"]), reversed_free_quantity=_d(line["reversed_free_quantity"]),
            reversed_base_billed_quantity=_d(line["reversed_base_billed_quantity"]), reversed_base_free_quantity=_d(line["reversed_base_free_quantity"]),
            gross_price_amount=_d(line["gross_price_amount"]), line_discount_amount=_d(line["line_discount_amount"]),
            document_discount_amount=_d(line["document_discount_amount"]), net_value_amount=_d(line["net_value_amount"]),
            gst_taxable_value=_d(line["gst_taxable_value"]), tax=_tax(line),
        ))
    return PriorReversalState(tuple(products), (), _d(resolution["prior_state"]["rounding_adjustment"]))


def reversal_calculation_documents(
    request: Mapping[str, Any],
    resolution: Mapping[str, Any],
    *,
    resource_id: UUID,
    operation: str,
    resource_type: str,
    source_line_id_key: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    original = _original_document(resolution)
    reversals = tuple(ProductReversalInput(
        line_id=resolved[source_line_id_key], reversed_billed_quantity=_d(line["billed_quantity"]),
        reversed_free_quantity=_d(line["free_quantity"]), reversed_base_billed_quantity=_d(resolved["base_billed_quantity"]),
        reversed_base_free_quantity=_d(resolved["base_free_quantity"]), value_basis=ReversalValueBasis.BILLED_QUANTITY,
        final_residual=bool(resolved["final_residual"]),
    ) for line, resolved in zip(request["lines"], resolution["lines"]))
    reversal = ReversalInput(reversals, (), _prior_state(resolution), GstTaxTreatment(request["gst_tax_treatment"]))
    result = calculate_reversal(original, reversal)
    input_document = {
        "aggregate_version": 1, "calculation_kind": "reversal", "document": None,
        "operation": operation, "original": resolution["original_calculation_output"],
        "resource_id": str(resource_id), "resource_type": resource_type,
        "reversal": reversal_input_payload(reversal), "schema": "aasopharma.trade-calculation-input",
        "schema_version": "1", "serializer_version": SERIALIZER_VERSION,
    }
    lines = []
    for source, item in zip(reversal.products, result.products):
        lines.append({
            "cess_amount": decimal_string(item.tax.cess_amount), "cess_rate": decimal_string(next(p.cess_rate for p in original.products if p.line_id == source.line_id)),
            "cgst_amount": decimal_string(item.tax.cgst_amount), "cgst_rate": decimal_string(next(p.gst_rate / 2 if original.gst_type is GstType.INTRA_STATE else Decimal("0") for p in original.products if p.line_id == source.line_id)),
            "document_discount_amount": decimal_string(item.document_discount_amount), "document_taxable_discount_amount": decimal_string(item.document_discount_amount),
            "final_residual": source.final_residual, "gross_amount": decimal_string(item.gross_price_amount),
            "gst_taxable_value": decimal_string(item.gst_taxable_value), "igst_amount": decimal_string(item.tax.igst_amount),
            "igst_rate": decimal_string(next(p.gst_rate if original.gst_type is GstType.INTER_STATE else Decimal("0") for p in original.products if p.line_id == source.line_id)),
            "line_discount_amount": decimal_string(item.line_discount_amount), "line_id": source.line_id, "line_kind": "product",
            "line_taxable_discount_amount": decimal_string(item.line_discount_amount), "line_total": decimal_string(item.line_total),
            "net_value_amount": decimal_string(item.net_value_amount), "recipient_assessed_tax_amount": decimal_string(item.recipient_assessed_tax_amount),
            "sgst_amount": decimal_string(item.tax.sgst_amount), "sgst_rate": decimal_string(next(p.gst_rate / 2 if original.gst_type is GstType.INTRA_STATE else Decimal("0") for p in original.products if p.line_id == source.line_id)),
        })
    output_document = {
        "aggregate_version": 1, "currency_code": "INR", "engine_version": ENGINE_VERSION,
        "gst_tax_treatment": result.gst_tax_treatment.value, "lines": lines, "operation": operation,
        "resource_id": str(resource_id), "resource_type": resource_type, "ruleset_version": resolution["ruleset_version"],
        "schema": "aasopharma.trade-calculation-output", "schema_version": "1", "serializer_version": SERIALIZER_VERSION,
        "totals": {
            "cess_total": decimal_string(result.tax.cess_amount), "cgst_total": decimal_string(result.tax.cgst_amount),
            "charges_total": "0.00", "discount_total": decimal_string(result.line_discount_amount + result.document_discount_amount),
            "grand_total": decimal_string(result.grand_total), "gst_taxable_total": decimal_string(result.gst_taxable_value),
            "igst_total": decimal_string(result.tax.igst_amount), "net_value_total": decimal_string(result.net_value_amount),
            "pre_round_total": decimal_string(result.pre_round_total), "recipient_assessed_tax_total": decimal_string(result.recipient_assessed_tax_total),
            "rounding_adjustment": decimal_string(result.rounding_adjustment), "sgst_total": decimal_string(result.tax.sgst_amount),
            "subtotal": decimal_string(result.gross_price_amount),
        },
    }
    return input_document, output_document


def calculation_documents(
    request: Mapping[str, Any],
    resolution: Mapping[str, Any],
    *,
    sales_return_id: UUID,
) -> tuple[dict[str, Any], dict[str, Any]]:
    return reversal_calculation_documents(
        request,
        resolution,
        resource_id=sales_return_id,
        operation="sales.return.post",
        resource_type="sales_return",
        source_line_id_key="original_invoice_line_id",
    )


__all__ = [
    "PERSIST_SALES_RETURN_SQL",
    "RESOLVE_SALES_RETURN_SQL",
    "calculation_documents",
    "reversal_calculation_documents",
]

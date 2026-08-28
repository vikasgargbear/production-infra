"""Canonical sales-order prepare calculation and wire projections."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
import json
from typing import Any, Mapping
from uuid import UUID

from sqlalchemy import text

from ...domain.calculations import (
    ChargeLineInput,
    DiscountBasis,
    DiscountInput,
    DiscountKind,
    DocumentInput,
    FreeSupplyTaxTreatment,
    GstTaxTreatment,
    GstType,
    PriceBasis,
    ProductLineInput,
    RoundingPolicy,
    TaxChargeMechanism,
    TaxabilitySnapshot,
    ZeroRatedMode,
    calculate_document,
    decimal_string,
)


RESOLVE_SALES_ORDER_SQL = text(
    """
    SELECT erp_automation_commands.resolve_sales_order_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, CAST(:request_json AS jsonb)
    ) AS resolution
    """
)

PERSIST_SALES_ORDER_SQL = text(
    """
    SELECT erp_automation_commands.persist_sales_order_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :order_id, :command_request_id, :artifact_id, :request_id,
        :idempotency_key_hash, :sequence_key_hash, :request_bytes,
        :resolved_bytes, :preview_bytes, :calculation_input_bytes,
        :calculation_output_bytes, :expires_at
    ) AS command_request_id
    """
)

SERIALIZER_VERSION = "aasopharma-jcs-decimal-v1"
ENGINE_VERSION = "decimal-engine-1"


def _wire(value: Any) -> Any:
    if isinstance(value, (UUID, date, datetime)):
        return value.isoformat() if not isinstance(value, UUID) else str(value)
    if isinstance(value, Decimal):
        return decimal_string(value)
    if isinstance(value, Mapping):
        return {str(key): _wire(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_wire(item) for item in value]
    return value


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        _wire(value), ensure_ascii=True, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")


def _discount(value: Mapping[str, Any], prefix: str) -> DiscountInput:
    basis = value[f"{prefix}_discount_basis"]
    return DiscountInput(
        kind=DiscountKind(value[f"{prefix}_discount_kind"]),
        basis=(
            DiscountBasis.PRE_TAX_VALUE
            if basis == "taxable_value"
            else DiscountBasis.PRICE_VALUE
        ),
        value=Decimal(str(value[f"{prefix}_discount_value"])),
    )


def commercial_calculation_documents(
    request: Mapping[str, Any],
    resolution: Mapping[str, Any],
    *,
    resource_id: UUID,
    operation: str,
    resource_type: str,
    gst_tax_treatment: GstTaxTreatment = GstTaxTreatment.STATUTORY,
) -> tuple[dict[str, Any], dict[str, Any]]:
    products = []
    charges = []
    resolved_lines = list(resolution["lines"])
    for resolved in resolved_lines:
        source = resolved["input"]
        if resolved["line_kind"] == "charge":
            charges.append(
                ChargeLineInput(
                    line_id=str(resolved["line_id"]),
                    charge_code=source["charge_code"],
                    quoted_amount=Decimal(str(source["quoted_amount"])),
                    price_basis=PriceBasis(source["price_basis"]),
                    taxability_snapshot=TaxabilitySnapshot(resolved["taxability"]),
                    tax_charge_mechanism=TaxChargeMechanism.NORMAL,
                    gst_rate=Decimal(str(resolved["gst_rate"])),
                    cess_rate=Decimal(str(resolved["cess_rate"])),
                    document_discount_eligible=source["document_discount_eligible"],
                )
            )
            continue
        quantity = Decimal(str(source["billed_quantity"]))
        free_quantity = Decimal(str(source["free_quantity"]))
        multiplier = Decimal(str(resolved["multiplier"]))
        products.append(
            ProductLineInput(
                line_id=str(resolved["line_id"]),
                billed_quantity=quantity,
                free_quantity=free_quantity,
                uom_conversion_factor=multiplier,
                base_billed_quantity=(quantity * multiplier).quantize(
                    Decimal("0.000001"), rounding=ROUND_HALF_UP
                ),
                base_free_quantity=(free_quantity * multiplier).quantize(
                    Decimal("0.000001"), rounding=ROUND_HALF_UP
                ),
                quoted_unit_rate=Decimal(str(source["quoted_unit_rate"])),
                price_basis=PriceBasis(source["price_basis"]),
                line_discount=_discount(source["line_discount"], "line"),
                gst_rate=Decimal(str(resolved["gst_rate"])),
                cess_rate=Decimal(str(resolved["cess_rate"])),
                taxability_snapshot=TaxabilitySnapshot(resolved["taxability"]),
                tax_charge_mechanism=TaxChargeMechanism.NORMAL,
                free_supply_tax_treatment=FreeSupplyTaxTreatment(
                    source["free_supply_tax_treatment"]
                ),
                document_discount_eligible=source["document_discount_eligible"],
            )
        )
    gst_type = (
        GstType.INTRA_STATE
        if resolution["supply_type"] == "intra_state"
        else GstType.INTER_STATE
    )
    document = DocumentInput(
        products=tuple(products),
        charges=tuple(charges),
        gst_type=gst_type,
        zero_rated_mode=ZeroRatedMode(request["zero_rated_payment_mode"]),
        rounding_policy=RoundingPolicy(request["rounding_policy"]),
        tax_charge_mechanism=TaxChargeMechanism.NORMAL,
        document_discount=_discount(request["document_discount"], "document"),
        gst_tax_treatment=gst_tax_treatment,
    )
    result = calculate_document(document)
    input_document = {
        "aggregate_version": 1,
        "calculation_kind": "document",
        "document": {
            "charges": [],
            "document_discount": {
                "basis": document.document_discount.basis.value,
                "kind": document.document_discount.kind.value,
                "value": decimal_string(document.document_discount.value),
            },
            "gst_tax_treatment": document.gst_tax_treatment.value,
            "gst_type": document.gst_type.value,
            "products": [
                {
                    "base_billed_quantity": decimal_string(item.base_billed_quantity),
                    "base_free_quantity": decimal_string(item.base_free_quantity),
                    "billed_quantity": decimal_string(item.billed_quantity),
                    "cess_rate": decimal_string(item.cess_rate),
                    "document_discount_eligible": item.document_discount_eligible,
                    "free_quantity": decimal_string(item.free_quantity),
                    "free_supply_tax_treatment": item.free_supply_tax_treatment.value,
                    "gst_rate": decimal_string(item.gst_rate),
                    "line_discount": {
                        "basis": item.line_discount.basis.value,
                        "kind": item.line_discount.kind.value,
                        "value": decimal_string(item.line_discount.value),
                    },
                    "line_id": item.line_id,
                    "price_basis": item.price_basis.value,
                    "quoted_unit_rate": decimal_string(item.quoted_unit_rate),
                    "tax_charge_mechanism": item.tax_charge_mechanism.value,
                    "taxability_snapshot": item.taxability_snapshot.value,
                    "uom_conversion_factor": decimal_string(item.uom_conversion_factor),
                }
                for item in document.products
            ],
            "rounding_policy": document.rounding_policy.value,
            "tax_charge_mechanism": document.tax_charge_mechanism.value,
            "zero_rated_mode": document.zero_rated_mode.value,
        },
        "operation": operation,
        "original": None,
        "resource_id": str(resource_id),
        "resource_type": resource_type,
        "reversal": None,
        "schema": "aasopharma.trade-calculation-input",
        "schema_version": "1",
        "serializer_version": SERIALIZER_VERSION,
    }
    input_document["document"]["charges"] = [
        {
            "cess_rate": decimal_string(item.cess_rate),
            "charge_code": item.charge_code,
            "document_discount_eligible": item.document_discount_eligible,
            "gst_rate": decimal_string(item.gst_rate),
            "line_id": item.line_id,
            "price_basis": item.price_basis.value,
            "quoted_amount": decimal_string(item.quoted_amount),
            "tax_charge_mechanism": item.tax_charge_mechanism.value,
            "taxability_snapshot": item.taxability_snapshot.value,
        }
        for item in document.charges
    ]
    output_lines = []
    for source, item in zip(document.products, result.products):
        intra = document.gst_type is GstType.INTRA_STATE
        output_lines.append(
            {
                "cess_amount": decimal_string(item.tax.cess_amount),
                "cess_rate": decimal_string(item.cess_rate),
                "cgst_amount": decimal_string(item.tax.cgst_amount),
                "cgst_rate": decimal_string(source.gst_rate / 2 if intra else Decimal("0")),
                "document_discount_amount": decimal_string(item.document_discount_amount),
                "document_taxable_discount_amount": decimal_string(item.document_pre_tax_discount_amount),
                "final_residual": False,
                "gross_amount": decimal_string(item.gross_price_amount),
                "gst_taxable_value": decimal_string(item.gst_taxable_value),
                "igst_amount": decimal_string(item.tax.igst_amount),
                "igst_rate": decimal_string(source.gst_rate if not intra else Decimal("0")),
                "line_discount_amount": decimal_string(item.line_discount_amount),
                "line_id": source.line_id,
                "line_kind": "product",
                "line_taxable_discount_amount": decimal_string(item.line_pre_tax_discount_amount),
                "line_total": decimal_string(item.line_total),
                "net_value_amount": decimal_string(item.net_value_amount),
                "recipient_assessed_tax_amount": decimal_string(item.recipient_assessed_tax_amount),
                "sgst_amount": decimal_string(item.tax.sgst_amount),
                "sgst_rate": decimal_string(source.gst_rate / 2 if intra else Decimal("0")),
            }
        )
    for source, item in zip(document.charges, result.charges):
        intra = document.gst_type is GstType.INTRA_STATE
        output_lines.append(
            {
                "cess_amount": decimal_string(item.tax.cess_amount),
                "cess_rate": decimal_string(item.cess_rate),
                "cgst_amount": decimal_string(item.tax.cgst_amount),
                "cgst_rate": decimal_string(source.gst_rate / 2 if intra else Decimal("0")),
                "document_discount_amount": decimal_string(item.document_discount_amount),
                "document_taxable_discount_amount": decimal_string(item.document_pre_tax_discount_amount),
                "final_residual": False,
                "gross_amount": decimal_string(item.gross_price_amount),
                "gst_taxable_value": decimal_string(item.gst_taxable_value),
                "igst_amount": decimal_string(item.tax.igst_amount),
                "igst_rate": decimal_string(source.gst_rate if not intra else Decimal("0")),
                "line_discount_amount": "0.00",
                "line_id": source.line_id,
                "line_kind": "charge",
                "line_taxable_discount_amount": "0.00",
                "line_total": decimal_string(item.line_total),
                "net_value_amount": decimal_string(item.net_value_amount),
                "recipient_assessed_tax_amount": decimal_string(item.recipient_assessed_tax_amount),
                "sgst_amount": decimal_string(item.tax.sgst_amount),
                "sgst_rate": decimal_string(source.gst_rate / 2 if intra else Decimal("0")),
            }
        )
    output_document = {
        "aggregate_version": 1,
        "currency_code": "INR",
        "engine_version": ENGINE_VERSION,
        "gst_tax_treatment": result.gst_tax_treatment.value,
        "lines": output_lines,
        "operation": operation,
        "resource_id": str(resource_id),
        "resource_type": resource_type,
        "ruleset_version": str(resolution["ruleset_version"]),
        "schema": "aasopharma.trade-calculation-output",
        "schema_version": "1",
        "serializer_version": SERIALIZER_VERSION,
        "totals": {
            "cess_total": decimal_string(result.tax.cess_amount),
            "cgst_total": decimal_string(result.tax.cgst_amount),
            "charges_total": decimal_string(
                sum(
                    (item.gross_price_amount for item in result.charges),
                    Decimal("0.00"),
                )
            ),
            "discount_total": decimal_string(result.line_discount_amount + result.document_discount_amount),
            "grand_total": decimal_string(result.grand_total),
            "gst_taxable_total": decimal_string(result.gst_taxable_value),
            "igst_total": decimal_string(result.tax.igst_amount),
            "net_value_total": decimal_string(result.net_value_amount),
            "pre_round_total": decimal_string(result.pre_round_total),
            "recipient_assessed_tax_total": decimal_string(result.recipient_assessed_tax_total),
            "rounding_adjustment": decimal_string(result.rounding_adjustment),
            "sgst_total": decimal_string(result.tax.sgst_amount),
            "subtotal": decimal_string(
                sum(
                    (item.gross_price_amount for item in result.products),
                    Decimal("0.00"),
                )
            ),
        },
    }
    return input_document, output_document


def calculation_documents(
    request: Mapping[str, Any],
    resolution: Mapping[str, Any],
    *,
    order_id: UUID,
) -> tuple[dict[str, Any], dict[str, Any]]:
    return commercial_calculation_documents(
        request,
        resolution,
        resource_id=order_id,
        operation="sales.order.approve",
        resource_type="sales_order",
    )

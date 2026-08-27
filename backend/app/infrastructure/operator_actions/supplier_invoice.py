"""Canonical supplier-invoice prepare calculation and wire projections."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Mapping
from uuid import UUID

from sqlalchemy import text

from .sales_order import commercial_calculation_documents


RESOLVE_SUPPLIER_INVOICE_SQL = text(
    """
    SELECT erp_automation_commands.resolve_supplier_invoice_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :supplier_invoice_id, CAST(:request_json AS jsonb)
    ) AS resolution
    """
)

PERSIST_SUPPLIER_INVOICE_SQL = text(
    """
    SELECT erp_automation_commands.persist_supplier_invoice_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :supplier_invoice_id, :command_request_id, :artifact_id,
        :request_id, :tax_document_id, :journal_id, :event_id, :open_item_id,
        :idempotency_key_hash, :sequence_key_hash, :request_bytes,
        :resolved_bytes, :preview_bytes, :calculation_input_bytes,
        :calculation_output_bytes, :expires_at
    ) AS command_request_id
    """
)


def calculation_documents(
    request: Mapping[str, Any],
    resolution: Mapping[str, Any],
    *,
    supplier_invoice_id: UUID,
) -> tuple[dict[str, Any], dict[str, Any]]:
    return commercial_calculation_documents(
        request,
        resolution,
        resource_id=supplier_invoice_id,
        operation="procurement.supplier_invoice.post",
        resource_type="supplier_invoice",
    )


def landed_cost_preview(
    resolution: Mapping[str, Any],
    calculation_output: Mapping[str, Any],
) -> tuple[list[dict[str, Any]], Decimal, Decimal]:
    """Project the reviewed split; PostgreSQL re-resolves and posts it atomically."""

    calculated = {
        str(line["line_id"]): line for line in calculation_output["lines"]
    }
    product_targets = [
        allocation
        for line in resolution["lines"]
        if line["line_kind"] == "product"
        for allocation in line["receipt_allocations"]
    ]
    effects: list[dict[str, Any]] = []
    capitalized_total = Decimal("0.00")
    consumed_total = Decimal("0.00")
    for line in resolution["lines"]:
        if line["inventory_cost_treatment"] != "capitalize":
            continue
        method = line.get("landed_cost_allocation_method")
        if method not in {"direct", "quantity_weighted", "value_weighted"}:
            raise ValueError("capitalized supplier line lacks reviewed allocation method")
        output_line = calculated[str(line["line_id"])]
        total_pool = Decimal(str(output_line["net_value_amount"]))
        targets = line.get("receipt_allocations") or product_targets
        if line["line_kind"] == "product":
            total_pool -= Decimal(str(line["receipt_cost"]))
        if not targets:
            raise ValueError("capitalized supplier line has no receipt stock lineage")
        if total_pool == 0:
            effects.append({
                "supplier_invoice_line_id": str(line["line_id"]),
                "line_kind": line["line_kind"],
                "allocation_method": method,
                "total_landed_cost_pool": "0.00",
                "landed_cost_inventory_value_delta": "0.00",
                "consumed_variance_amount": "0.00",
                "targets": [{
                    "goods_receipt_line_id": target["goods_receipt_line_id"],
                    "location_id": target["location_id"],
                    "product_id": target["product_id"],
                    "batch_id": target["batch_id"],
                    "remaining_on_hand_quantity": target["stock_on_hand_quantity"],
                    "stock_row_version": target["stock_row_version"],
                } for target in targets],
            })
            continue
        if method == "direct" and len({
            (target["location_id"], target["product_id"], target["batch_id"])
            for target in targets
        }) != 1:
            raise ValueError("direct landed-cost allocation requires one stock identity")

        source_basis = Decimal("0")
        remaining_basis = Decimal("0")
        target_effects: list[dict[str, Any]] = []
        for target in targets:
            if target.get("exact_receipt_source_provenance") is not True:
                raise ValueError(
                    "landed-cost remaining stock lacks exclusive receipt provenance"
                )
            allocated_quantity = (
                Decimal(str(target["allocated_base_billed_quantity"]))
                + Decimal(str(target["allocated_base_free_quantity"]))
            )
            remaining_quantity = min(
                allocated_quantity, Decimal(str(target["stock_on_hand_quantity"]))
            )
            if Decimal(str(target["stock_on_hand_quantity"])) > allocated_quantity:
                raise ValueError(
                    "landed-cost target on-hand exceeds its exact receipt allocation"
                )
            receipt_cost = Decimal(str(target["receipt_unit_cost"]))
            source = (
                allocated_quantity * receipt_cost
                if method == "value_weighted"
                else allocated_quantity
            )
            remaining = (
                remaining_quantity * receipt_cost
                if method == "value_weighted"
                else remaining_quantity
            )
            source_basis += source
            remaining_basis += remaining
            target_effects.append({
                "goods_receipt_line_id": target["goods_receipt_line_id"],
                "location_id": target["location_id"],
                "product_id": target["product_id"],
                "batch_id": target["batch_id"],
                "remaining_on_hand_quantity": str(remaining_quantity),
                "stock_row_version": target["stock_row_version"],
            })
        if source_basis <= 0:
            raise ValueError("landed-cost allocation basis must be positive")
        capitalized = (total_pool * remaining_basis / source_basis).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        ) if remaining_basis > 0 else Decimal("0.00")
        consumed = total_pool - capitalized
        capitalized_total += capitalized
        consumed_total += consumed
        effects.append({
            "supplier_invoice_line_id": str(line["line_id"]),
            "line_kind": line["line_kind"],
            "allocation_method": method,
            "total_landed_cost_pool": format(total_pool, ".2f"),
            "landed_cost_inventory_value_delta": format(capitalized, ".2f"),
            "consumed_variance_amount": format(consumed, ".2f"),
            "targets": target_effects,
        })
    return effects, capitalized_total, consumed_total


__all__ = [
    "PERSIST_SUPPLIER_INVOICE_SQL",
    "RESOLVE_SUPPLIER_INVOICE_SQL",
    "calculation_documents",
    "landed_cost_preview",
]

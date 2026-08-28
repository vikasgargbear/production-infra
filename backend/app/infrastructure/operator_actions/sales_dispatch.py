"""Canonical sales-dispatch prepare wire projections."""

from __future__ import annotations

from typing import Any, Mapping

from sqlalchemy import text

from .sales_order import canonical_json_bytes


RESOLVE_SALES_DISPATCH_SQL = text(
    """
    SELECT erp_automation_commands.resolve_sales_dispatch_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :dispatch_id, CAST(:request_json AS jsonb)
    ) AS resolution
    """
)

PERSIST_SALES_DISPATCH_SQL = text(
    """
    SELECT erp_automation_commands.persist_sales_dispatch_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :dispatch_id, :inventory_document_id, :command_request_id,
        :request_id, :idempotency_key_hash, :sequence_key_hash, :request_bytes,
        :resolved_bytes, :preview_bytes, :expires_at
    ) AS command_request_id
    """
)


def dispatch_preview(
    *,
    organization_id: Any,
    command_request_id: Any,
    dispatch_id: Any,
    request_hash: str,
    resolution: Mapping[str, Any],
) -> dict[str, Any]:
    """Project the exact resolver result into the immutable operator preview."""

    inventory_impact = []
    resolved_references = [
        {"resource_type": "sales_order", "id": resolution["sales_order_id"]},
        {"resource_type": "inventory_location", "id": resolution["from_location_id"]},
        {"resource_type": "shipping_address", "id": resolution["shipping_address_id"]},
        {
            "resource_type": "finance_account",
            "role": "cost_of_goods_sold",
            "id": resolution["cost_of_goods_sold_account_id"],
        },
        {
            "resource_type": "finance_account",
            "role": "inventory_asset",
            "id": resolution["inventory_asset_account_id"],
        },
    ]
    for line in resolution["lines"]:
        resolved_references.append(
            {
                "resource_type": "sales_order_line",
                "id": line["sales_order_line_id"],
                "product_id": line["product_id"],
            }
        )
        for allocation in line["batch_allocations"]:
            resolved_references.append(
                {
                    "resource_type": "manufacturer_batch",
                    "id": allocation["batch_id"],
                    "product_id": line["product_id"],
                }
            )
            inventory_impact.append(
                {
                    "batch_id": allocation["batch_id"],
                    "base_billed_quantity": allocation["base_billed_quantity"],
                    "base_free_quantity": allocation["base_free_quantity"],
                    "from_location_id": resolution["from_location_id"],
                    "product_id": line["product_id"],
                    "unit_cost": allocation["unit_cost"],
                    "value_out": allocation["extended_cost"],
                }
            )
    if resolution.get("transporter_party_id"):
        resolved_references.append(
            {
                "resource_type": "transporter_party",
                "id": resolution["transporter_party_id"],
            }
        )

    return {
        "branch_id": resolution["branch_id"],
        "calculation_artifact_id": None,
        "calculation_hash": None,
        "calculation_ruleset": [],
        "capability_code": "sales.dispatch.prepare",
        "command_request_id": str(command_request_id),
        "destination_branch_id": None,
        "financial_impact": [
            {
                "currency_code": "INR",
                "inventory_valuation": resolution["total_value"],
                "cost_of_goods_sold": resolution["total_value"],
            }
        ],
        "inventory_impact": inventory_impact,
        "operation": "sales.dispatch.post",
        "organization_id": str(organization_id),
        "request_hash": request_hash,
        "resolved_references": resolved_references,
        "source_versions": resolution["source_versions"],
        "target_resource_id": str(dispatch_id),
        "target_resource_type": "dispatch",
        "tax_impact": [],
    }


__all__ = [
    "PERSIST_SALES_DISPATCH_SQL",
    "RESOLVE_SALES_DISPATCH_SQL",
    "canonical_json_bytes",
    "dispatch_preview",
]

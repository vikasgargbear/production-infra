"""Canonical purchase-order prepare calculation and wire projections."""

from __future__ import annotations

from typing import Any, Mapping
from uuid import UUID

from sqlalchemy import text

from .sales_order import commercial_calculation_documents


RESOLVE_PURCHASE_ORDER_SQL = text(
    """
    SELECT erp_automation_commands.resolve_purchase_order_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :purchase_order_id, CAST(:request_json AS jsonb)
    ) AS resolution
    """
)

PERSIST_PURCHASE_ORDER_SQL = text(
    """
    SELECT erp_automation_commands.persist_purchase_order_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :purchase_order_id, :command_request_id, :artifact_id,
        :request_id, :idempotency_key_hash, :sequence_key_hash,
        :request_bytes, :resolved_bytes, :preview_bytes,
        :calculation_input_bytes, :calculation_output_bytes, :expires_at
    ) AS command_request_id
    """
)


def calculation_documents(
    request: Mapping[str, Any],
    resolution: Mapping[str, Any],
    *,
    purchase_order_id: UUID,
) -> tuple[dict[str, Any], dict[str, Any]]:
    return commercial_calculation_documents(
        request,
        resolution,
        resource_id=purchase_order_id,
        operation="procurement.purchase_order.approve",
        resource_type="purchase_order",
    )


__all__ = [
    "PERSIST_PURCHASE_ORDER_SQL",
    "RESOLVE_PURCHASE_ORDER_SQL",
    "calculation_documents",
]

"""Canonical purchase-return reversal calculation and persistence boundary."""

from __future__ import annotations

from typing import Any, Mapping
from uuid import UUID

from sqlalchemy import text

from .sales_return import reversal_calculation_documents


RESOLVE_PURCHASE_RETURN_SQL = text(
    """
    SELECT erp_automation_commands.resolve_purchase_return_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :purchase_return_id, CAST(:request_json AS jsonb)
    ) AS resolution
    """
)

PERSIST_PURCHASE_RETURN_SQL = text(
    """
    SELECT erp_automation_commands.persist_purchase_return_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :purchase_return_id, :inventory_document_id,
        :command_request_id, :artifact_id, :request_id, :adjustment_note_id,
        :tax_document_id, :journal_id, :event_id, :allocation_id,
        :residual_open_item_id, :idempotency_key_hash, :return_sequence_key_hash,
        :request_bytes, :resolved_bytes, :preview_bytes, :calculation_input_bytes,
        :calculation_output_bytes, :expires_at
    ) AS command_request_id
    """
)


def calculation_documents(
    request: Mapping[str, Any],
    resolution: Mapping[str, Any],
    *,
    purchase_return_id: UUID,
) -> tuple[dict[str, Any], dict[str, Any]]:
    return reversal_calculation_documents(
        request,
        resolution,
        resource_id=purchase_return_id,
        operation="procurement.purchase_return.post",
        resource_type="purchase_return",
        source_line_id_key="supplier_invoice_line_id",
    )


__all__ = [
    "PERSIST_PURCHASE_RETURN_SQL",
    "RESOLVE_PURCHASE_RETURN_SQL",
    "calculation_documents",
]

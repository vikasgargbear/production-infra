"""Canonical supplier-invoice prepare calculation and wire projections."""

from __future__ import annotations

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


__all__ = [
    "PERSIST_SUPPLIER_INVOICE_SQL",
    "RESOLVE_SUPPLIER_INVOICE_SQL",
    "calculation_documents",
]

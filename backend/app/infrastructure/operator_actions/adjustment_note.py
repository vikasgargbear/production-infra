"""Canonical standalone adjustment-note calculation and persistence boundary."""

from __future__ import annotations

from typing import Any, Mapping
from uuid import UUID

from sqlalchemy import text

from ...domain.calculations import GstTaxTreatment
from .sales_order import commercial_calculation_documents


RESOLVE_ADJUSTMENT_NOTE_SQL = text("""
    SELECT erp_automation_commands.resolve_adjustment_note_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :adjustment_note_id, CAST(:request_json AS jsonb)
    ) AS resolution
""")

PERSIST_ADJUSTMENT_NOTE_SQL = text("""
    SELECT erp_automation_commands.persist_adjustment_note_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :adjustment_note_id, :command_request_id, :artifact_id,
        :request_id, :tax_document_id, :journal_id, :event_id, :allocation_id,
        :residual_open_item_id, :idempotency_key_hash, :note_sequence_key_hash,
        :request_bytes, :resolved_bytes, :preview_bytes,
        :calculation_input_bytes, :calculation_output_bytes, :expires_at
    ) AS command_request_id
""")


def calculation_documents(
    request: Mapping[str, Any],
    resolution: Mapping[str, Any],
    *,
    adjustment_note_id: UUID,
) -> tuple[dict[str, Any], dict[str, Any]]:
    calculation_request = {
        **request,
        # Adjustment commands inherit immutable tax context from the posted
        # original document; clients cannot select a different zero-rate mode.
        "zero_rated_payment_mode": resolution["zero_rated_payment_mode"],
    }
    return commercial_calculation_documents(
        calculation_request,
        resolution,
        resource_id=adjustment_note_id,
        operation="finance.adjustment_note.post",
        resource_type="adjustment_note",
        gst_tax_treatment=GstTaxTreatment(request["gst_tax_treatment"]),
    )


__all__ = [
    "PERSIST_ADJUSTMENT_NOTE_SQL",
    "RESOLVE_ADJUSTMENT_NOTE_SQL",
    "calculation_documents",
]

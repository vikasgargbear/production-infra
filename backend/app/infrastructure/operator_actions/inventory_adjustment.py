"""Canonical same-day signed inventory cycle-count persistence boundary."""

from sqlalchemy import text


RESOLVE_INVENTORY_ADJUSTMENT_SQL = text(
    """
    SELECT erp_automation_commands.resolve_inventory_adjustment_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :inventory_document_id, CAST(:request_json AS jsonb)
    ) AS resolution
    """
)

PERSIST_INVENTORY_ADJUSTMENT_SQL = text(
    """
    SELECT erp_automation_commands.persist_inventory_adjustment_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :inventory_document_id, :command_request_id, :journal_id,
        :event_id, :idempotency_key_hash, :document_sequence_key_hash,
        :journal_sequence_key_hash, :request_bytes, :resolved_bytes,
        :preview_bytes, :expires_at
    ) AS command_request_id
    """
)


__all__ = ["PERSIST_INVENTORY_ADJUSTMENT_SQL", "RESOLVE_INVENTORY_ADJUSTMENT_SQL"]

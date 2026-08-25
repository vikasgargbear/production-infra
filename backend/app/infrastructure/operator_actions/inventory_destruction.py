"""Reviewed SQL boundary for certified canonical inventory destruction."""

from sqlalchemy import text


RESOLVE_INVENTORY_DESTRUCTION_SQL = text(
    """
    SELECT erp_automation_commands.resolve_inventory_destruction_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :destruction_id, :inventory_document_id,
        CAST(:request_json AS jsonb)
    ) AS resolution
    """
)

PERSIST_INVENTORY_DESTRUCTION_SQL = text(
    """
    SELECT erp_automation_commands.persist_inventory_destruction_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :destruction_id, :inventory_document_id,
        :command_request_id, :journal_id, :event_id,
        :idempotency_key_hash, :destruction_sequence_key_hash,
        :journal_sequence_key_hash,
        :request_bytes, :resolved_bytes, :preview_bytes, :expires_at
    ) AS command_request_id
    """
)

EXECUTE_INVENTORY_DESTRUCTION_SQL = text(
    """
    SELECT erp_automation_commands.execute_inventory_destruction_command(
        :org_id, :command_request_id
    ) AS response_bytes
    """
)


__all__ = [
    "EXECUTE_INVENTORY_DESTRUCTION_SQL",
    "PERSIST_INVENTORY_DESTRUCTION_SQL",
    "RESOLVE_INVENTORY_DESTRUCTION_SQL",
]

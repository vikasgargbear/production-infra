"""Reviewed SQL boundary for canonical inter-branch stock transfers."""

from sqlalchemy import text


RESOLVE_INVENTORY_TRANSFER_SQL = text(
    """
    SELECT erp_automation_commands.resolve_inventory_transfer_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id,
        :agent_grant_id, :client_id, :inventory_document_id,
        CAST(:request_json AS jsonb)
    ) AS resolution
    """
)


PERSIST_INVENTORY_TRANSFER_SQL = text(
    """
    SELECT erp_automation_commands.persist_inventory_transfer_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id,
        :agent_grant_id, :client_id, :inventory_document_id,
        :command_request_id, :idempotency_key_hash,
        :document_sequence_key_hash, :request_bytes,
        :resolved_bytes, :preview_bytes, :expires_at
    ) AS command_request_id
    """
)

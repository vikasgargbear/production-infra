"""Canonical domestic INR supplier-payment persistence boundary."""

from sqlalchemy import text


RESOLVE_SUPPLIER_PAYMENT_SQL = text(
    """
    SELECT erp_automation_commands.resolve_supplier_payment_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :payment_id, CAST(:request_json AS jsonb)
    ) AS resolution
    """
)

PERSIST_SUPPLIER_PAYMENT_SQL = text(
    """
    SELECT erp_automation_commands.persist_supplier_payment_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :payment_id, :command_request_id, :journal_id, :event_id,
        :idempotency_key_hash, :payment_sequence_key_hash,
        :journal_sequence_key_hash, :request_bytes, :resolved_bytes,
        :preview_bytes, :expires_at
    ) AS command_request_id
    """
)


__all__ = ["PERSIST_SUPPLIER_PAYMENT_SQL", "RESOLVE_SUPPLIER_PAYMENT_SQL"]

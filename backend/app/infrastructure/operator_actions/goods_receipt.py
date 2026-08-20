"""Canonical goods-receipt prepare database boundary."""

from sqlalchemy import text


RESOLVE_GOODS_RECEIPT_SQL = text(
    """
    SELECT erp_automation_commands.resolve_goods_receipt_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :goods_receipt_id, CAST(:request_json AS jsonb)
    ) AS resolution
    """
)

PERSIST_GOODS_RECEIPT_SQL = text(
    """
    SELECT erp_automation_commands.persist_goods_receipt_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :goods_receipt_id, :inventory_document_id,
        :command_request_id, :request_id, :idempotency_key_hash,
        :sequence_key_hash, :request_bytes, :resolved_bytes, :preview_bytes,
        :expires_at
    ) AS command_request_id
    """
)


__all__ = ["PERSIST_GOODS_RECEIPT_SQL", "RESOLVE_GOODS_RECEIPT_SQL"]

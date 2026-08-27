"""Canonical customer-cheque terminal action prepare boundaries."""

from sqlalchemy import text


RESOLVE_CUSTOMER_CHEQUE_CLEARANCE_SQL = text("""
SELECT erp_automation_commands.resolve_customer_cheque_clearance_prepare(
  :org_id,:membership_id,:auth_user_id,:user_id,:agent_grant_id,:client_id,
  :payment_id,CAST(:request_json AS jsonb)) AS resolution
""")
PERSIST_CUSTOMER_CHEQUE_CLEARANCE_SQL = text("""
SELECT erp_automation_commands.persist_customer_cheque_clearance_prepare(
  :org_id,:membership_id,:auth_user_id,:user_id,:agent_grant_id,:client_id,
  :payment_id,:command_request_id,:journal_id,:event_id,:idempotency_key_hash,
  :payment_sequence_key_hash,:journal_sequence_key_hash,:request_bytes,
  :resolved_bytes,:preview_bytes,:expires_at) AS command_request_id
""")
RESOLVE_CUSTOMER_CHEQUE_BOUNCE_SQL = text("""
SELECT erp_automation_commands.resolve_customer_cheque_bounce_prepare(
  :org_id,:membership_id,:auth_user_id,:user_id,:agent_grant_id,:client_id,
  :payment_id,CAST(:request_json AS jsonb)) AS resolution
""")
PERSIST_CUSTOMER_CHEQUE_BOUNCE_SQL = text("""
SELECT erp_automation_commands.persist_customer_cheque_bounce_prepare(
  :org_id,:membership_id,:auth_user_id,:user_id,:agent_grant_id,:client_id,
  :payment_id,:command_request_id,:journal_id,:event_id,:idempotency_key_hash,
  :payment_sequence_key_hash,:journal_sequence_key_hash,:request_bytes,
  :resolved_bytes,:preview_bytes,:expires_at) AS command_request_id
""")

__all__ = [
    "PERSIST_CUSTOMER_CHEQUE_BOUNCE_SQL",
    "PERSIST_CUSTOMER_CHEQUE_CLEARANCE_SQL",
    "RESOLVE_CUSTOMER_CHEQUE_BOUNCE_SQL",
    "RESOLVE_CUSTOMER_CHEQUE_CLEARANCE_SQL",
]

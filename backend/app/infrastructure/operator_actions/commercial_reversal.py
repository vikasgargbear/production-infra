"""Typed prepare/execute SQL for compensating commercial reversals."""

from sqlalchemy import text


RESOLVE_COMMERCIAL_REVERSAL_SQL = {
    "sales_return": text("""
        SELECT erp_commercial_commands.prepare_sales_return_reversal(
          :org_id,:original_resource_id,:expected_row_version,:reversal_date,:reason,
          :amendment_evidence_attachment_id) AS resolution
    """),
    "purchase_return": text("""
        SELECT erp_commercial_commands.prepare_purchase_return_reversal(
          :org_id,:original_resource_id,:expected_row_version,:reversal_date,:reason,
          :amendment_evidence_attachment_id) AS resolution
    """),
    "adjustment_note": text("""
        SELECT erp_commercial_commands.prepare_adjustment_note_reversal(
          :org_id,:original_resource_id,:expected_row_version,:reversal_date,:reason,
          :amendment_evidence_attachment_id) AS resolution
    """),
}

PERSIST_COMMERCIAL_REVERSAL_SQL = text("""
    SELECT erp_commercial_commands.persist_commercial_reversal_prepare(
      :org_id,:reversal_kind,:original_resource_id,:reversal_adjustment_note_id,
      :command_request_id,:agent_grant_id,:idempotency_key_hash,:request_bytes,
      :resolved_bytes,:preview_bytes,:expires_at) AS command_request_id
""")

EXECUTE_COMMERCIAL_REVERSAL_SQL = text("""
    SELECT erp_commercial_commands.execute_approved_commercial_reversal(
      :org_id,:command_request_id) AS response_bytes
""")


__all__ = [
    "EXECUTE_COMMERCIAL_REVERSAL_SQL",
    "PERSIST_COMMERCIAL_REVERSAL_SQL",
    "RESOLVE_COMMERCIAL_REVERSAL_SQL",
]

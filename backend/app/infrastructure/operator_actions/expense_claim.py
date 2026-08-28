"""Canonical verified-receipt member expense-claim persistence boundary."""

from sqlalchemy import text


RESOLVE_EXPENSE_CLAIM_SQL = text(
    """
    SELECT erp_automation_commands.resolve_expense_claim_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :expense_claim_id, CAST(:request_json AS jsonb)
    ) AS resolution
    """
)

PERSIST_EXPENSE_CLAIM_SQL = text(
    """
    SELECT erp_automation_commands.persist_expense_claim_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :expense_claim_id, :command_request_id, :journal_id,
        :event_id, :idempotency_key_hash, :claim_sequence_key_hash,
        :journal_sequence_key_hash, :request_bytes, :resolved_bytes,
        :preview_bytes, :expires_at
    ) AS command_request_id
    """
)

APPROVE_EXPENSE_CLAIM_SQL = text(
    """
    SELECT erp_automation_commands.approve_expense_claim_command(
        :org_id, :command_request_id
    ) AS expense_claim_id
    """
)

EXECUTE_EXPENSE_CLAIM_SQL = text(
    """
    SELECT erp_automation_commands.execute_approved_expense_claim(
        :org_id, :command_request_id
    ) AS response_body
    """
)

READBACK_EXPENSE_CLAIM_SQL = text(
    """
    SELECT command.id AS command_request_id,command.branch_id,
           claim.id AS expense_claim_id,claim.claim_number,claim.status,
           claim.claimant_membership_id,claim.claim_date,claim.period_start,
           claim.period_end,claim.currency_code,claim.claimed_amount,
           claim.approved_amount,claim.approved_by_membership_id,
           claim.posted_by_membership_id,journal.id AS journal_entry_id,
           journal.status AS journal_status,
           journal.transaction_debit_total AS journal_debit_total,
           journal.transaction_credit_total AS journal_credit_total,
           journal_totals.line_count AS journal_line_count,
           journal_totals.debit_total AS journal_line_debit_total,
           journal_totals.credit_total AS journal_line_credit_total,
           event.id AS accounting_event_id,line.id AS expense_claim_line_id,
           line.line_number,line.expense_date,line.expense_account_id,
           line.description,line.merchant_name,line.receipt_attachment_id,
           receipt.evidence_kind AS receipt_evidence_kind,
           receipt.status AS receipt_status,receipt.document_date AS receipt_document_date,
           receipt.verified_at AS receipt_verified_at,
           receipt.retention_until AS receipt_retention_until,
           encode(receipt.sha256,'hex') AS receipt_sha256,
           line.claimed_amount AS line_claimed_amount,
           line.approved_amount AS line_approved_amount
      FROM erp_automation_reads.command_authority_context(
           :org_id, :command_request_id
      ) command
      JOIN finance.expense_claims claim
        ON claim.org_id=:org_id AND claim.id=command.target_resource_id
      JOIN finance.expense_claim_lines line
        ON line.org_id=claim.org_id AND line.expense_claim_id=claim.id
      JOIN core.attachments receipt
        ON receipt.org_id=line.org_id AND receipt.id=line.receipt_attachment_id
      JOIN finance.accounting_events event
        ON event.org_id=claim.org_id AND event.expense_claim_id=claim.id
       AND event.event_type='expense_claim'
      JOIN finance.journal_entries journal
        ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id
      JOIN LATERAL (
        SELECT count(*) AS line_count,
               COALESCE(sum(journal_line.transaction_debit),0) AS debit_total,
               COALESCE(sum(journal_line.transaction_credit),0) AS credit_total
          FROM finance.journal_lines journal_line
         WHERE journal_line.org_id=journal.org_id
           AND journal_line.journal_entry_id=journal.id
      ) journal_totals ON true
     WHERE command.id=:command_request_id
       AND command.capability_code='finance.expense_claim.prepare'
       AND command.operation='finance.expense_claim.post'
       AND command.status='succeeded' AND claim.status='posted'
       AND journal.status='posted' AND receipt.status IN ('verified','retained')
     ORDER BY line.line_number,line.id
    """
)


__all__ = [
    "APPROVE_EXPENSE_CLAIM_SQL",
    "EXECUTE_EXPENSE_CLAIM_SQL",
    "PERSIST_EXPENSE_CLAIM_SQL",
    "READBACK_EXPENSE_CLAIM_SQL",
    "RESOLVE_EXPENSE_CLAIM_SQL",
]

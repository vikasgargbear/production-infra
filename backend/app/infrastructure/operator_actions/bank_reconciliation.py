"""Canonical exact bank-statement to posted-journal match boundary."""

from sqlalchemy import text


RESOLVE_BANK_RECONCILIATION_SQL = text(
    """
    SELECT erp_automation_commands.resolve_bank_reconciliation_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :reconciliation_match_id, CAST(:request_json AS jsonb)
    ) AS resolution
    """
)

PERSIST_BANK_RECONCILIATION_SQL = text(
    """
    SELECT erp_automation_commands.persist_bank_reconciliation_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :reconciliation_match_id, :command_request_id,
        :idempotency_key_hash, :request_bytes, :resolved_bytes,
        :preview_bytes, :expires_at
    ) AS command_request_id
    """
)

EXECUTE_BANK_RECONCILIATION_SQL = text(
    """
    SELECT erp_automation_commands.execute_bank_reconciliation_command(
        :org_id, :command_request_id
    ) AS response_bytes
    """
)

READBACK_BANK_RECONCILIATION_SQL = text(
    """
    SELECT command.id AS command_request_id,matched.id AS reconciliation_match_id,
           matched.status,statement.id AS bank_statement_id,
           statement.status AS bank_statement_status,
           statement_line.id AS bank_statement_line_id,
           statement_line.direction AS statement_direction,
           bank.id AS bank_account_id,bank.account_id AS bank_ledger_account_id,
           journal.id AS journal_entry_id,journal.status AS journal_status,
           journal_line.id AS journal_bank_line_id,matched.matched_amount,
           matched.currency_code,matched.match_method,
           journal_line.transaction_debit AS journal_bank_debit,
           journal_line.transaction_credit AS journal_bank_credit,
           (SELECT count(*) FROM core.audit_events audit
             WHERE audit.org_id=command.org_id AND audit.command_request_id=command.id) AS audit_event_count,
           (SELECT count(*) FROM core.outbox_events event
             WHERE event.org_id=command.org_id AND
               ((event.aggregate_type='command' AND event.aggregate_id=command.id)
                OR (event.aggregate_type='reconciliation_match' AND event.aggregate_id=matched.id))) AS outbox_event_count
      FROM automation.command_requests command
      JOIN finance.reconciliation_matches matched
        ON matched.org_id=command.org_id AND matched.id=command.result_resource_id
      JOIN finance.bank_statement_lines statement_line
        ON statement_line.org_id=matched.org_id AND statement_line.id=matched.bank_statement_line_id
      JOIN finance.bank_statements statement
        ON statement.org_id=statement_line.org_id AND statement.id=statement_line.bank_statement_id
      JOIN finance.bank_accounts bank
        ON bank.org_id=statement.org_id AND bank.id=statement.bank_account_id
      JOIN finance.journal_entries journal
        ON journal.org_id=matched.org_id AND journal.id=matched.journal_entry_id
      JOIN finance.journal_lines journal_line
        ON journal_line.org_id=journal.org_id AND journal_line.journal_entry_id=journal.id
       AND journal_line.account_id=bank.account_id
     WHERE command.org_id=:org_id AND command.id=:command_request_id
       AND command.agent_grant_id=:agent_grant_id
       AND command.requested_by_membership_id=:membership_id
       AND command.capability_code='finance.bank_reconciliation.prepare'
       AND command.status='succeeded' AND matched.status='matched'
       AND statement.status IN ('reconciling','reconciled') AND journal.status='posted'
    """
)


__all__ = [
    "EXECUTE_BANK_RECONCILIATION_SQL",
    "PERSIST_BANK_RECONCILIATION_SQL",
    "READBACK_BANK_RECONCILIATION_SQL",
    "RESOLVE_BANK_RECONCILIATION_SQL",
]

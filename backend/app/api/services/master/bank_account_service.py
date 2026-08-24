"""
Bank Account Service
Handles all database operations for organization bank accounts
"""
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)


class BankAccountService:
    """Service class for Bank Account operations"""
    
    @staticmethod
    def list_bank_accounts(db: Session, org_id: str) -> List[Dict[str, Any]]:
        """Get canonical active bank accounts without exposing encrypted numbers."""
        query = """
            SELECT bank.id AS bank_account_id,
                   bank.org_id,
                   account.code,
                   account.name,
                   COALESCE(bank.account_holder_name, account.name) AS account_name,
                   '••••'::text AS account_number,
                   account.account_type,
                   bank.bank_name,
                   NULL::text AS branch_name,
                   bank.ifsc AS ifsc_code,
                   NULL::text AS swift_code,
                   NULL::jsonb AS bank_address,
                   false AS is_default_account,
                   true AS is_payment_account,
                   account.allows_bank_reconciliation,
                   bank.status='active' AS is_active,
                   bank.currency_code,
                   COALESCE(balance.book_balance, 0) AS balance,
                   bank.created_at,
                   bank.updated_at
              FROM finance.bank_accounts bank
              JOIN finance.accounts account
                ON account.org_id=bank.org_id AND account.id=bank.account_id
              LEFT JOIN LATERAL (
                  SELECT COALESCE(SUM(line.functional_debit-line.functional_credit), 0)
                           AS book_balance
                    FROM finance.journal_lines line
                    JOIN finance.journal_entries entry
                      ON entry.org_id=line.org_id AND entry.id=line.journal_entry_id
                   WHERE line.org_id=bank.org_id
                     AND line.account_id=bank.account_id
                     AND entry.status='posted'
              ) balance ON true
             WHERE bank.org_id=:org_id
               AND bank.status='active'
               AND account.status='active'
             ORDER BY bank.bank_name, account.code, bank.id
        """

        result = db.execute(text(query), {"org_id": org_id})
        accounts = []
        for row in result:
            account = dict(row._mapping)
            accounts.append(account)
        return accounts

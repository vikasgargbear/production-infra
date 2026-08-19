"""
Journal Entry Service
Handles all database operations for journal entries and chart of accounts
"""
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)


class JournalService:
    """Service class for Journal Entry operations"""
    
    @staticmethod
    def get_chart_of_accounts(
        db: Session, org_id: str, search: str = None, 
        account_type: str = None, active_only: bool = True
    ) -> List[Dict[str, Any]]:
        """Get chart of accounts with filters."""
        query = """
            SELECT account_id, account_code, account_name, account_type,
                   parent_account_id, is_active, created_at
            FROM financial.chart_of_accounts WHERE org_id = :org_id
        """
        params = {"org_id": org_id}
        
        if active_only:
            query += " AND is_active = true"
        if account_type:
            query += " AND account_type = :account_type"
            params["account_type"] = account_type
        if search:
            query += " AND (account_code ILIKE :search OR account_name ILIKE :search)"
            params["search"] = f"%{search}%"
        
        query += " ORDER BY account_code"
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def insert_journal_entry(db: Session, org_id: str, data: Dict[str, Any]) -> int:
        """Insert journal entry header. Returns journal_id."""
        result = db.execute(text("""
            INSERT INTO financial.journal_entries (
                org_id, branch_id, journal_number, journal_date, journal_type,
                reference_type, reference_id, reference_number, narration,
                entry_status, is_reversal, reversal_of_journal_id,
                created_by, created_at
            ) VALUES (
                :org_id, :branch_id, :journal_number, :journal_date, :journal_type,
                :reference_type, :reference_id, :reference_number, :narration,
                'draft', :is_reversal, :reversal_of_journal_id,
                :created_by, CURRENT_TIMESTAMP
            ) RETURNING journal_id
        """), {
            "org_id": org_id,
            "reference_type": None,
            "reference_id": None,
            "reference_number": None,
            "is_reversal": False,
            "reversal_of_journal_id": None,
            **data,
        })
        return result.scalar()
    
    @staticmethod
    def get_account(
        db: Session, org_id: str, account_code: str, account_name: str
    ) -> Dict[str, Any]:
        """Resolve an active tenant account; journal posting never creates accounts."""
        result = db.execute(text("""
            SELECT account_id, account_code, account_name
            FROM financial.chart_of_accounts
            WHERE account_code = :code AND org_id = :org_id AND is_active = true
        """), {"code": account_code, "org_id": org_id})
        row = result.first()
        if row is None:
            raise ValueError(f"Active account {account_code} was not found")
        account = dict(row._mapping)
        if account["account_name"] != account_name:
            raise ValueError(f"Account name does not match code {account_code}")
        return account
    
    @staticmethod
    def insert_journal_line(db: Session, data: Dict[str, Any]) -> None:
        """Insert journal entry line."""
        db.execute(text("""
            INSERT INTO financial.journal_entry_lines (
                journal_id, account_code, account_name,
                debit_amount, credit_amount, line_narration
            ) VALUES (
                :journal_id, :account_code, :account_name,
                :debit_amount, :credit_amount, :line_narration
            )
        """), data)

    @staticmethod
    def post_journal_entry(
        db: Session, org_id: str, journal_id: int, posted_by: int
    ) -> None:
        """Post a completed draft; the database trigger validates its lines."""
        result = db.execute(text("""
            UPDATE financial.journal_entries
            SET entry_status = 'posted', posted_by = :posted_by,
                posted_at = CURRENT_TIMESTAMP
            WHERE journal_id = :journal_id
              AND org_id = :org_id
              AND entry_status = 'draft'
            RETURNING journal_id
        """), {
            "journal_id": journal_id,
            "org_id": org_id,
            "posted_by": posted_by,
        })
        if result.scalar() is None:
            raise ValueError("Journal entry is missing, already posted, or access denied")
    
    @staticmethod
    def list_journal_entries(
        db: Session, org_id: str, from_date: date = None, to_date: date = None,
        search: str = None, limit: int = 50, offset: int = 0
    ) -> List[Dict[str, Any]]:
        """List journal entries with filters."""
        query = """
            SELECT je.journal_id, je.journal_number, je.journal_date, je.reference_number,
                   je.narration, je.entry_status, je.created_at, u.username as created_by_name,
                   COUNT(jel.line_id) as lines_count
            FROM financial.journal_entries je
            LEFT JOIN master.org_users u ON je.created_by = u.user_id
            LEFT JOIN financial.journal_entry_lines jel ON je.journal_id = jel.journal_id
            WHERE je.org_id = :org_id
        """
        params = {"org_id": org_id, "limit": limit, "offset": offset}
        
        if from_date:
            query += " AND je.journal_date >= :from_date"
            params["from_date"] = from_date
        if to_date:
            query += " AND je.journal_date <= :to_date"
            params["to_date"] = to_date
        if search:
            query += " AND (je.journal_number ILIKE :search OR je.narration ILIKE :search)"
            params["search"] = f"%{search}%"
        
        query += """
            GROUP BY je.journal_id, je.journal_number, je.journal_date, 
                     je.reference_number, je.narration, je.entry_status, je.created_at, u.username
            ORDER BY je.journal_date DESC, je.journal_id DESC LIMIT :limit OFFSET :offset
        """
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def count_journal_entries(
        db: Session, org_id: str, from_date: date = None, to_date: date = None, search: str = None
    ) -> int:
        """Count journal entries with filters."""
        query = "SELECT COUNT(*) FROM financial.journal_entries je WHERE je.org_id = :org_id"
        params = {"org_id": org_id}
        
        if from_date:
            query += " AND je.journal_date >= :from_date"
            params["from_date"] = from_date
        if to_date:
            query += " AND je.journal_date <= :to_date"
            params["to_date"] = to_date
        if search:
            query += " AND (je.journal_number ILIKE :search OR je.narration ILIKE :search)"
            params["search"] = f"%{search}%"
        
        return db.execute(text(query), params).scalar() or 0
    
    @staticmethod
    def get_journal_entry(db: Session, org_id: str, journal_id: int) -> Optional[Dict[str, Any]]:
        """Get journal entry header."""
        result = db.execute(text("""
            SELECT je.journal_id, je.journal_number, je.journal_date, je.reference_number,
                   je.narration, je.entry_status, je.created_at, u.username as created_by_name
            FROM financial.journal_entries je
            LEFT JOIN master.org_users u ON je.created_by = u.user_id
            WHERE je.journal_id = :journal_id AND je.org_id = :org_id
        """), {"journal_id": journal_id, "org_id": org_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_journal_lines(db: Session, journal_id: int) -> List[Dict[str, Any]]:
        """Get journal entry lines."""
        result = db.execute(text("""
            SELECT line_id, account_code, account_name,
                   debit_amount, credit_amount, line_narration
            FROM financial.journal_entry_lines WHERE journal_id = :journal_id ORDER BY line_id
        """), {"journal_id": journal_id})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def reverse_journal_entry(
        db: Session,
        org_id: str,
        journal_id: int,
        journal_number: str,
        reversal_date: date,
        reason: str,
        created_by: int,
    ) -> int:
        """Create and post one compensating journal without mutating the original."""
        original = db.execute(text("""
            SELECT journal_id, journal_number, branch_id
            FROM financial.journal_entries
            WHERE journal_id = :journal_id AND org_id = :org_id
              AND entry_status = 'posted' AND is_reversal = false
            FOR UPDATE
        """), {"journal_id": journal_id, "org_id": org_id}).first()
        if original is None:
            raise ValueError("Posted journal was not found or access was denied")

        existing = db.execute(text("""
            SELECT journal_id
            FROM financial.journal_entries
            WHERE org_id = :org_id AND reversal_of_journal_id = :journal_id
            LIMIT 1
        """), {"journal_id": journal_id, "org_id": org_id}).scalar()
        if existing is not None:
            raise ValueError("Journal has already been reversed")

        lines = db.execute(text("""
            SELECT account_code, account_name, debit_amount, credit_amount,
                   line_narration
            FROM financial.journal_entry_lines
            WHERE journal_id = :journal_id
            ORDER BY line_id
        """), {"journal_id": journal_id}).fetchall()
        if len(lines) < 2:
            raise ValueError("Posted journal has insufficient lines to reverse")

        reversal_id = JournalService.insert_journal_entry(db, org_id, {
            "branch_id": original.branch_id,
            "journal_number": journal_number,
            "journal_date": reversal_date,
            "journal_type": "manual",
            "reference_type": "journal_reversal",
            "reference_id": journal_id,
            "reference_number": original.journal_number,
            "narration": f"Reversal: {reason.strip()}",
            "is_reversal": True,
            "reversal_of_journal_id": journal_id,
            "created_by": created_by,
        })
        for line in lines:
            JournalService.insert_journal_line(db, {
                "journal_id": reversal_id,
                "account_code": line.account_code,
                "account_name": line.account_name,
                "debit_amount": line.credit_amount,
                "credit_amount": line.debit_amount,
                "line_narration": f"Reversal: {line.line_narration or reason.strip()}",
            })
        JournalService.post_journal_entry(db, org_id, reversal_id, created_by)
        return reversal_id

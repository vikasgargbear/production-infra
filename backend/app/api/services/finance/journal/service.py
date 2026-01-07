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
                   parent_account_id, account_level, is_active, created_at
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
    def get_active_user(db: Session, org_id: str) -> Optional[int]:
        """Get first active user for org."""
        result = db.execute(text("""
            SELECT user_id FROM master.org_users 
            WHERE org_id = :org_id AND is_active = true ORDER BY user_id LIMIT 1
        """), {"org_id": org_id})
        row = result.first()
        return row.user_id if row else None
    
    @staticmethod
    def insert_journal_entry(db: Session, org_id: str, data: Dict[str, Any]) -> int:
        """Insert journal entry header. Returns journal_id."""
        result = db.execute(text("""
            INSERT INTO financial.journal_entries (
                org_id, journal_number, journal_date, reference_number,
                narration, entry_status, created_by, created_at
            ) VALUES (
                :org_id, :journal_number, :journal_date, :reference_number,
                :narration, 'posted', :created_by, CURRENT_TIMESTAMP
            ) RETURNING journal_id
        """), {"org_id": org_id, **data})
        return result.scalar()
    
    @staticmethod
    def get_or_create_account(
        db: Session, org_id: str, account_code: str, account_name: str
    ) -> int:
        """Get account_id or create if not exists."""
        result = db.execute(text(
            "SELECT account_id FROM financial.chart_of_accounts WHERE account_code = :code AND org_id = :org_id"
        ), {"code": account_code, "org_id": org_id})
        row = result.first()
        
        if row:
            return row.account_id
        
        # Create account
        result = db.execute(text("""
            INSERT INTO financial.chart_of_accounts (
                org_id, account_code, account_name, account_type, is_active
            ) VALUES (:org_id, :account_code, :account_name, 'general', true)
            RETURNING account_id
        """), {"org_id": org_id, "account_code": account_code, "account_name": account_name})
        return result.scalar()
    
    @staticmethod
    def insert_journal_line(db: Session, data: Dict[str, Any]) -> None:
        """Insert journal entry line."""
        db.execute(text("""
            INSERT INTO financial.journal_entry_lines (
                journal_id, account_id, account_code, account_name,
                debit_amount, credit_amount, line_narration
            ) VALUES (
                :journal_id, :account_id, :account_code, :account_name,
                :debit_amount, :credit_amount, :line_narration
            )
        """), data)
    
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
            SELECT line_id, account_id, account_code, account_name,
                   debit_amount, credit_amount, line_narration
            FROM financial.journal_entry_lines WHERE journal_id = :journal_id ORDER BY line_id
        """), {"journal_id": journal_id})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def reverse_journal_entry(db: Session, journal_id: int, reason: str) -> None:
        """Mark journal entry as reversed."""
        db.execute(text("""
            UPDATE financial.journal_entries 
            SET entry_status = 'reversed', reversed_reason = :reason, reversed_at = CURRENT_TIMESTAMP
            WHERE journal_id = :journal_id
        """), {"journal_id": journal_id, "reason": reason})

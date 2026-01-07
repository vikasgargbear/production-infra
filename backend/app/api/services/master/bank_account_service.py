"""
Bank Account Service
Handles all database operations for organization bank accounts
"""
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
import json

logger = logging.getLogger(__name__)


class BankAccountService:
    """Service class for Bank Account operations"""
    
    @staticmethod
    def list_bank_accounts(db: Session, org_id: str) -> List[Dict[str, Any]]:
        """Get all active bank accounts for an organization."""
        query = """
            SELECT 
                bank_account_id, org_id, account_name, account_number, account_type,
                bank_name, branch_name, ifsc_code, swift_code, bank_address,
                is_default_account, is_payment_account, is_active, created_at, updated_at
            FROM master.org_bank_accounts
            WHERE org_id = :org_id AND is_active = true
            ORDER BY is_default_account DESC, created_at DESC
        """
        
        result = db.execute(text(query), {"org_id": org_id})
        accounts = []
        for row in result:
            account = dict(row._mapping)
            if account.get("bank_address"):
                try:
                    account["bank_address"] = json.loads(account["bank_address"])
                except:
                    pass
            accounts.append(account)
        return accounts
    
    @staticmethod
    def unset_default_accounts(db: Session, org_id: str, exclude_id: Optional[int] = None) -> None:
        """Unset default flag on all accounts, optionally excluding one."""
        if exclude_id:
            db.execute(text("""
                UPDATE master.org_bank_accounts
                SET is_default_account = false
                WHERE org_id = :org_id AND bank_account_id != :exclude_id
            """), {"org_id": org_id, "exclude_id": exclude_id})
        else:
            db.execute(text("""
                UPDATE master.org_bank_accounts
                SET is_default_account = false
                WHERE org_id = :org_id
            """), {"org_id": org_id})
    
    @staticmethod
    def insert_bank_account(db: Session, org_id: str, data: Dict[str, Any]) -> int:
        """Insert a new bank account. Returns bank_account_id."""
        result = db.execute(text("""
            INSERT INTO master.org_bank_accounts (
                org_id, account_name, account_number, account_type,
                bank_name, branch_name, ifsc_code, swift_code,
                bank_address, is_default_account, is_payment_account, is_active
            ) VALUES (
                :org_id, :account_name, :account_number, :account_type,
                :bank_name, :branch_name, :ifsc_code, :swift_code,
                CAST(:bank_address AS jsonb), :is_default_account, :is_payment_account, true
            )
            RETURNING bank_account_id
        """), {"org_id": org_id, **data})
        
        row = result.first()
        return row.bank_account_id if row else None
    
    @staticmethod
    def update_bank_account_dynamic(
        db: Session, org_id: str, account_id: int,
        update_fields: List[str], params: Dict[str, Any]
    ) -> None:
        """Update bank account with dynamic fields."""
        if not update_fields:
            return
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        query = f"""
            UPDATE master.org_bank_accounts
            SET {', '.join(update_fields)}
            WHERE org_id = :org_id AND bank_account_id = :account_id
        """
        db.execute(text(query), {**params, "org_id": org_id, "account_id": account_id})
    
    @staticmethod
    def get_account_delete_check(
        db: Session, org_id: str, account_id: int
    ) -> Optional[Dict[str, Any]]:
        """Get account info for delete validation. Returns None if not found."""
        result = db.execute(text("""
            SELECT is_default_account, 
                   (SELECT COUNT(*) FROM master.org_bank_accounts 
                    WHERE org_id = :org_id AND is_active = true) as total_count
            FROM master.org_bank_accounts
            WHERE org_id = :org_id AND bank_account_id = :account_id
        """), {"org_id": org_id, "account_id": account_id})
        row = result.first()
        return {"is_default_account": row.is_default_account, "total_count": row.total_count} if row else None
    
    @staticmethod
    def soft_delete_bank_account(db: Session, org_id: str, account_id: int) -> None:
        """Soft delete a bank account."""
        db.execute(text("""
            UPDATE master.org_bank_accounts
            SET is_active = false, updated_at = CURRENT_TIMESTAMP
            WHERE org_id = :org_id AND bank_account_id = :account_id
        """), {"org_id": org_id, "account_id": account_id})
    
    @staticmethod
    def set_default_account(db: Session, org_id: str, account_id: int) -> None:
        """Set a bank account as default."""
        # Unset all others
        db.execute(text("""
            UPDATE master.org_bank_accounts
            SET is_default_account = false
            WHERE org_id = :org_id
        """), {"org_id": org_id})
        
        # Set this one as default
        db.execute(text("""
            UPDATE master.org_bank_accounts
            SET is_default_account = true, updated_at = CURRENT_TIMESTAMP
            WHERE org_id = :org_id AND bank_account_id = :account_id
        """), {"org_id": org_id, "account_id": account_id})

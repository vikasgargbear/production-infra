"""
Expense Claims Service
Handles all database operations for expense claims and reimbursements
"""
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)


class ExpenseService:
    """Service class for Expense Claims operations"""
    
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
    def find_employee_by_name(db: Session, name: str) -> Optional[int]:
        """Find employee by name."""
        result = db.execute(text("""
            SELECT employee_id FROM master.employees 
            WHERE full_name ILIKE :name ORDER BY employee_id LIMIT 1
        """), {"name": f"%{name}%"})
        row = result.first()
        return row.employee_id if row else None
    
    @staticmethod
    def create_employee(db: Session, code: str, name: str) -> int:
        """Create employee record. Returns employee_id."""
        result = db.execute(text("""
            INSERT INTO master.employees (employee_code, full_name, employment_status)
            VALUES (:code, :name, 'active') RETURNING employee_id
        """), {"code": code, "name": name})
        return result.scalar()
    
    @staticmethod
    def insert_expense_claim(db: Session, data: Dict[str, Any]) -> int:
        """Insert expense claim header. Returns claim_id."""
        result = db.execute(text("""
            INSERT INTO financial.expense_claims (
                org_id, claim_number, employee_id, claim_date, purpose,
                total_amount, claim_status, created_at
            ) VALUES (
                :org_id, :claim_number, :employee_id, :claim_date, :purpose,
                :total_amount, 'submitted', CURRENT_TIMESTAMP
            ) RETURNING claim_id
        """), data)
        return result.scalar()
    
    @staticmethod
    def insert_expense_item(db: Session, data: Dict[str, Any]) -> None:
        """Insert expense claim item."""
        db.execute(text("""
            INSERT INTO financial.expense_claim_items (
                claim_id, expense_description, claimed_amount, expense_date
            ) VALUES (:claim_id, :description, :amount, :expense_date)
        """), data)
    
    @staticmethod
    def list_expense_claims(
        db: Session, org_id: str, status: str = None, employee_id: int = None,
        from_date: date = None, to_date: date = None, limit: int = 50, offset: int = 0
    ) -> List[Dict[str, Any]]:
        """List expense claims with filters."""
        query = """
            SELECT ec.claim_id, ec.claim_number, ec.employee_id, e.full_name as employee_name,
                   ec.claim_date, ec.purpose, ec.total_amount, ec.approved_amount,
                   ec.claim_status, ec.created_at, u.username as created_by_name,
                   COUNT(eci.claim_item_id) as items_count
            FROM financial.expense_claims ec
            LEFT JOIN master.employees e ON ec.employee_id = e.employee_id
            LEFT JOIN financial.expense_claim_items eci ON ec.claim_id = eci.claim_id
            WHERE ec.org_id = :org_id
        """
        params = {"org_id": org_id, "limit": limit, "offset": offset}
        
        if status:
            query += " AND ec.claim_status = :status"
            params["status"] = status
        if employee_id:
            query += " AND ec.employee_id = :employee_id"
            params["employee_id"] = employee_id
        if from_date:
            query += " AND ec.claim_date >= :from_date"
            params["from_date"] = from_date
        if to_date:
            query += " AND ec.claim_date <= :to_date"
            params["to_date"] = to_date
        
        query += """
            GROUP BY ec.claim_id, ec.claim_number, ec.employee_id, e.full_name,
                     ec.claim_date, ec.purpose, ec.total_amount, ec.approved_amount,
                     ec.claim_status, ec.created_at, u.username
            ORDER BY ec.claim_date DESC, ec.claim_id DESC LIMIT :limit OFFSET :offset
        """
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def count_expense_claims(
        db: Session, org_id: str, status: str = None, employee_id: int = None,
        from_date: date = None, to_date: date = None
    ) -> int:
        """Count expense claims with filters."""
        query = "SELECT COUNT(*) FROM financial.expense_claims ec WHERE ec.org_id = :org_id"
        params = {"org_id": org_id}
        
        if status:
            query += " AND ec.claim_status = :status"
            params["status"] = status
        if employee_id:
            query += " AND ec.employee_id = :employee_id"
            params["employee_id"] = employee_id
        if from_date:
            query += " AND ec.claim_date >= :from_date"
            params["from_date"] = from_date
        if to_date:
            query += " AND ec.claim_date <= :to_date"
            params["to_date"] = to_date
        
        return db.execute(text(query), params).scalar() or 0
    
    @staticmethod
    def get_expense_claim(db: Session, org_id: str, claim_id: int) -> Optional[Dict[str, Any]]:
        """Get expense claim header."""
        result = db.execute(text("""
            SELECT ec.claim_id, ec.claim_number, ec.employee_id, e.full_name as employee_name,
                   ec.claim_date, ec.purpose, ec.total_amount, ec.approved_amount,
                   ec.claim_status, ec.notes as approval_notes,
                   ec.current_approver_id as approved_by, ec.submitted_date as approved_at,
                   ec.created_at, u.username as created_by_name
            FROM financial.expense_claims ec
            LEFT JOIN master.employees e ON ec.employee_id = e.employee_id
            WHERE ec.claim_id = :claim_id AND ec.org_id = :org_id
        """), {"claim_id": claim_id, "org_id": org_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_expense_claim_items(db: Session, claim_id: int) -> List[Dict[str, Any]]:
        """Get expense claim items."""
        result = db.execute(text("""
            SELECT claim_item_id as item_id, expense_description, claimed_amount,
                   expense_date, attachment_path, notes, approved_amount
            FROM financial.expense_claim_items
            WHERE claim_id = :claim_id ORDER BY expense_date, claim_item_id
        """), {"claim_id": claim_id})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_claim_for_approval(db: Session, org_id: str, claim_id: int) -> Optional[Dict[str, Any]]:
        """Get claim for approval check."""
        result = db.execute(text("""
            SELECT claim_id, claim_status, total_amount 
            FROM financial.expense_claims WHERE claim_id = :claim_id AND org_id = :org_id
        """), {"claim_id": claim_id, "org_id": org_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def approve_claim(db: Session, claim_id: int, approved_amount: Decimal, notes: str, approved_by: int) -> None:
        """Approve expense claim."""
        db.execute(text("""
            UPDATE financial.expense_claims
            SET claim_status = 'approved', approved_amount = :approved_amount,
                approval_notes = :approval_notes, approved_by = :approved_by,
                approved_at = CURRENT_TIMESTAMP
            WHERE claim_id = :claim_id
        """), {"claim_id": claim_id, "approved_amount": approved_amount, "approval_notes": notes, "approved_by": approved_by})
    
    @staticmethod
    def reject_claim(db: Session, org_id: str, claim_id: int, notes: str, approved_by: int) -> int:
        """Reject expense claim. Returns rows affected."""
        result = db.execute(text("""
            UPDATE financial.expense_claims
            SET claim_status = 'rejected', approval_notes = :rejection_notes,
                approved_by = :approved_by, approved_at = CURRENT_TIMESTAMP
            WHERE claim_id = :claim_id AND org_id = :org_id
        """), {"claim_id": claim_id, "org_id": org_id, "rejection_notes": notes, "approved_by": approved_by})
        return result.rowcount

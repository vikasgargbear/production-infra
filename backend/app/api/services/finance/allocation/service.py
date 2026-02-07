"""
Payment Allocation Service
Handles all database operations for payment allocations
"""
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)


class AllocationService:
    """Service class for Payment Allocation operations"""
    
    @staticmethod
    def get_payment(db: Session, org_id: str, payment_id: int) -> Optional[Dict[str, Any]]:
        """Get payment with allocation info."""
        result = db.execute(text("""
            SELECT payment_id, payment_amount, allocated_amount, party_id, party_type
            FROM financial.payments WHERE payment_id = :payment_id AND org_id = :org_id
        """), {"payment_id": payment_id, "org_id": org_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_invoice(db: Session, invoice_id: int) -> Optional[Dict[str, Any]]:
        """Get invoice with allocation info."""
        result = db.execute(text("""
            SELECT invoice_id, customer_id, final_amount, allocated_amount
            FROM sales.invoices WHERE invoice_id = :invoice_id
        """), {"invoice_id": invoice_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def create_allocation(
        db: Session, org_id: str, payment_id: int, invoice_id: int, amount: float
    ) -> int:
        """Create payment allocation. Returns allocation_id."""
        result = db.execute(text("""
            INSERT INTO financial.payment_allocations 
            (org_id, payment_id, invoice_id, allocated_amount, allocation_type)
            VALUES (:org_id, :payment_id, :invoice_id, :amount, 'manual')
            RETURNING allocation_id
        """), {"org_id": org_id, "payment_id": payment_id, "invoice_id": invoice_id, "amount": amount})
        
        allocation_id = result.scalar()
        
        # Update invoice outstanding in financial.customer_outstanding
        db.execute(text("""
            UPDATE financial.customer_outstanding
            SET outstanding_amount = outstanding_amount - :amount,
                paid_amount = COALESCE(paid_amount, 0) + :amount,
                status = CASE 
                    WHEN outstanding_amount - :amount <= 0 THEN 'paid'
                    ELSE 'partial'
                END,
                updated_at = CURRENT_TIMESTAMP
            WHERE document_type = 'invoice' 
            AND document_id = :invoice_id
            AND org_id = :org_id
        """), {
            "amount": amount,
            "invoice_id": invoice_id,
            "org_id": org_id
        })
        
        return allocation_id
    
    @staticmethod
    def get_payment_status(db: Session, payment_id: int) -> Optional[Dict[str, Any]]:
        """Get updated payment status."""
        result = db.execute(text("""
            SELECT allocation_status, allocated_amount, unallocated_amount
            FROM financial.payments WHERE payment_id = :payment_id
        """), {"payment_id": payment_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_invoice_status(db: Session, invoice_id: int) -> Optional[Dict[str, Any]]:
        """Get updated invoice status."""
        result = db.execute(text("""
            SELECT payment_status, allocated_amount, final_amount - allocated_amount as due_amount
            FROM sales.invoices WHERE invoice_id = :invoice_id
        """), {"invoice_id": invoice_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def auto_allocate(db: Session, payment_id: int, method: str) -> List[Dict[str, Any]]:
        """Call auto-allocation function. Returns allocation results."""
        result = db.execute(text(
            "SELECT * FROM financial.auto_allocate_payment(:payment_id, :method)"
        ), {"payment_id": payment_id, "method": method})
        return [{"invoice_id": row.invoice_id, "allocated_amount": float(row.allocated_amount)} for row in result]
    
    @staticmethod
    def get_payment_allocations(db: Session, payment_id: int) -> List[Dict[str, Any]]:
        """Get allocations for a payment."""
        result = db.execute(text("""
            SELECT allocation_id, reference_id as invoice_id, reference_number as invoice_number,
                   allocated_amount, created_at as allocation_date
            FROM financial.payment_allocations
            WHERE payment_id = :payment_id AND reference_type = 'invoice' AND allocation_status = 'active'
            ORDER BY created_at DESC
        """), {"payment_id": payment_id})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_invoice_payments(db: Session, invoice_id: int) -> List[Dict[str, Any]]:
        """Get payments allocated to an invoice."""
        result = db.execute(text("""
            SELECT pa.allocation_id, pa.payment_id, p.payment_number, p.payment_date,
                   p.payment_amount, pa.allocated_amount, pa.created_at as allocation_date
            FROM financial.payment_allocations pa
            JOIN financial.payments p ON pa.payment_id = p.payment_id
            WHERE pa.reference_type = 'invoice' AND pa.reference_id = :invoice_id
            AND pa.allocation_status = 'active' ORDER BY pa.created_at DESC
        """), {"invoice_id": invoice_id})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_invoice_summary(db: Session, invoice_id: int) -> Optional[Dict[str, Any]]:
        """Get invoice summary for allocation view."""
        result = db.execute(text("""
            SELECT invoice_number, final_amount, allocated_amount, payment_status
            FROM sales.invoices WHERE invoice_id = :invoice_id
        """), {"invoice_id": invoice_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_allocation_with_org(db: Session, org_id: str, allocation_id: int) -> Optional[Dict[str, Any]]:
        """Get allocation with org verification."""
        result = db.execute(text("""
            SELECT pa.*, p.org_id FROM financial.payment_allocations pa
            JOIN financial.payments p ON pa.payment_id = p.payment_id
            WHERE pa.allocation_id = :allocation_id AND p.org_id = :org_id
        """), {"allocation_id": allocation_id, "org_id": org_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def delete_allocation(db: Session, allocation_id: int) -> None:
        """Delete an allocation."""
        db.execute(text(
            "DELETE FROM financial.payment_allocations WHERE allocation_id = :allocation_id"
        ), {"allocation_id": allocation_id})
    
    @staticmethod
    def get_unallocated_payments(
        db: Session, org_id: str, party_id: int = None, cancelled_status: str = "cancelled"
    ) -> List[Dict[str, Any]]:
        """Get payments with unallocated amounts."""
        query = """
            SELECT payment_id, payment_number, payment_date, party_id, party_name,
                   payment_amount, allocated_amount, unallocated_amount, allocation_status
            FROM financial.payments
            WHERE org_id = :org_id AND allocation_status != 'full'
            AND unallocated_amount > 0 AND payment_status != :cancelled_status
        """
        params = {"org_id": org_id, "cancelled_status": cancelled_status}
        if party_id:
            query += " AND party_id = :party_id"
            params["party_id"] = party_id
        query += " ORDER BY payment_date DESC"
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_unpaid_invoices(
        db: Session, customer_id: int = None,
        cancelled_status: str = "cancelled", paid_status: str = "paid"
    ) -> List[Dict[str, Any]]:
        """Get invoices with outstanding amounts."""
        query = """
            SELECT invoice_id, invoice_number, invoice_date, customer_id, customer_name,
                   final_amount, allocated_amount, final_amount - allocated_amount as due_amount,
                   payment_status
            FROM sales.invoices
            WHERE invoice_status != :cancelled_status AND payment_status != :paid_status
        """
        params = {"cancelled_status": cancelled_status, "paid_status": paid_status}
        if customer_id:
            query += " AND customer_id = :customer_id"
            params["customer_id"] = customer_id
        query += " ORDER BY invoice_date ASC"
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result]

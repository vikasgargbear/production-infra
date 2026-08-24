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
    def reconcile_allocation_projections(
        db: Session,
        org_id: str,
        payment_id: int,
        invoice_id: int,
    ) -> None:
        """Rebuild payment and invoice balances from active allocation rows."""
        payment_result = db.execute(text("""
            WITH active_allocations AS (
                SELECT COALESCE(SUM(a.allocated_amount), 0) AS allocated_amount
                FROM financial.allocations a
                JOIN financial.payments owner ON owner.payment_id = a.payment_id
                WHERE a.payment_id = :payment_id
                  AND owner.org_id = :org_id
                  AND a.source_type = 'payment'
                  AND a.allocation_status = 'active'
            )
            UPDATE financial.payments payment
            SET allocated_amount = active.allocated_amount,
                unallocated_amount = GREATEST(0, payment.payment_amount - active.allocated_amount),
                allocation_status = CASE
                    WHEN active.allocated_amount = 0 THEN 'unallocated'
                    WHEN active.allocated_amount >= payment.payment_amount THEN 'full'
                    ELSE 'partial'
                END,
                updated_at = CURRENT_TIMESTAMP
            FROM active_allocations active
            WHERE payment.payment_id = :payment_id
              AND payment.org_id = :org_id
        """), {"payment_id": payment_id, "org_id": org_id})
        if payment_result.rowcount != 1:
            raise ValueError("Payment not found or access denied")

        invoice_result = db.execute(text("""
            WITH active_allocations AS (
                SELECT COALESCE(SUM(a.allocated_amount), 0) AS allocated_amount
                FROM financial.allocations a
                JOIN financial.payments payment ON payment.payment_id = a.payment_id
                WHERE UPPER(a.reference_type) = 'INVOICE'
                  AND a.reference_id = :invoice_id
                  AND a.source_type = 'payment'
                  AND a.allocation_status = 'active'
                  AND payment.org_id = :org_id
            )
            UPDATE sales.invoices invoice
            SET paid_amount = LEAST(invoice.final_amount, active.allocated_amount),
                payment_status = CASE
                    WHEN active.allocated_amount <= 0 THEN 'pending'
                    WHEN active.allocated_amount < invoice.final_amount THEN 'partial'
                    ELSE 'paid'
                END,
                updated_at = CURRENT_TIMESTAMP
            FROM active_allocations active
            WHERE invoice.invoice_id = :invoice_id
              AND invoice.org_id = :org_id
        """), {"invoice_id": invoice_id, "org_id": org_id})
        if invoice_result.rowcount != 1:
            raise ValueError("Invoice not found or access denied")

        db.execute(text("""
            WITH active_allocations AS (
                SELECT COALESCE(SUM(a.allocated_amount), 0) AS allocated_amount
                FROM financial.allocations a
                JOIN financial.payments payment ON payment.payment_id = a.payment_id
                WHERE UPPER(a.reference_type) = 'INVOICE'
                  AND a.reference_id = :invoice_id
                  AND a.source_type = 'payment'
                  AND a.allocation_status = 'active'
                  AND payment.org_id = :org_id
            )
            UPDATE financial.customer_outstanding outstanding
            SET paid_amount = active.allocated_amount,
                outstanding_amount = GREATEST(
                    0, outstanding.original_amount - active.allocated_amount
                ),
                status = CASE
                    WHEN active.allocated_amount >= outstanding.original_amount THEN 'paid'
                    WHEN active.allocated_amount > 0 THEN 'partial'
                    ELSE 'open'
                END,
                updated_at = CURRENT_TIMESTAMP
            FROM active_allocations active
            WHERE outstanding.org_id = :org_id
              AND outstanding.document_type = 'INVOICE'
              AND outstanding.document_id = :invoice_id
        """), {"invoice_id": invoice_id, "org_id": org_id})
    
    @staticmethod
    def get_payment(db: Session, org_id: str, payment_id: int) -> Optional[Dict[str, Any]]:
        """Get payment with allocation info."""
        result = db.execute(text("""
            SELECT payment_id, payment_amount, allocated_amount, party_id, party_type
            FROM financial.payments WHERE payment_id = :payment_id AND org_id = :org_id
            FOR UPDATE
        """), {"payment_id": payment_id, "org_id": org_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_invoice(db: Session, org_id: str, invoice_id: int) -> Optional[Dict[str, Any]]:
        """Get and lock an invoice in the payment's organization."""
        result = db.execute(text("""
            SELECT invoice_id, invoice_number, customer_id, final_amount,
                   paid_amount AS allocated_amount
            FROM sales.invoices
            WHERE invoice_id = :invoice_id AND org_id = :org_id
            FOR UPDATE
        """), {"invoice_id": invoice_id, "org_id": org_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def create_allocation(
        db: Session, org_id: str, payment_id: int, invoice_id: int,
        amount: Decimal, invoice_number: str, user_id: int
    ) -> int:
        """Create an allocation and rebuild its denormalized balances."""
        result = db.execute(text("""
            INSERT INTO financial.allocations
            (payment_id, reference_type, reference_id, reference_number,
             allocated_amount, allocation_status, created_by, source_type)
            VALUES (:payment_id, 'INVOICE', :reference_id, :reference_number,
                    :amount, 'active', :created_by, 'payment')
            RETURNING allocation_id
        """), {
            "payment_id": payment_id,
            "reference_id": invoice_id,
            "reference_number": invoice_number,
            "amount": amount,
            "created_by": user_id
        })

        allocation_id = result.scalar()
        if allocation_id is None:
            raise RuntimeError("Failed to create payment allocation")

        AllocationService.reconcile_allocation_projections(
            db, org_id, payment_id, invoice_id
        )

        return allocation_id
    
    @staticmethod
    def get_payment_status(db: Session, org_id: str, payment_id: int) -> Optional[Dict[str, Any]]:
        """Get updated payment status."""
        result = db.execute(text("""
            SELECT allocation_status, allocated_amount, unallocated_amount
            FROM financial.payments
            WHERE payment_id = :payment_id AND org_id = :org_id
        """), {"payment_id": payment_id, "org_id": org_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_invoice_status(db: Session, org_id: str, invoice_id: int) -> Optional[Dict[str, Any]]:
        """Get updated invoice status."""
        result = db.execute(text("""
            SELECT payment_status, paid_amount AS allocated_amount,
                   final_amount - paid_amount as due_amount
            FROM sales.invoices
            WHERE invoice_id = :invoice_id AND org_id = :org_id
        """), {"invoice_id": invoice_id, "org_id": org_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def auto_allocate(db: Session, org_id: str, payment_id: int, method: str) -> List[Dict[str, Any]]:
        """Call auto-allocation function. Returns allocation results."""
        if AllocationService.get_payment(db, org_id, payment_id) is None:
            raise ValueError("Payment not found or access denied")
        result = db.execute(text(
            "SELECT * FROM financial.auto_allocate_payment(:payment_id, :method)"
        ), {"payment_id": payment_id, "method": method})
        return [{"invoice_id": row.invoice_id, "allocated_amount": row.allocated_amount} for row in result]
    
    @staticmethod
    def get_payment_allocations(db: Session, org_id: str, payment_id: int) -> List[Dict[str, Any]]:
        """Get allocations for a payment."""
        result = db.execute(text("""
            SELECT allocation.allocation_id, allocation.reference_id as invoice_id,
                   allocation.reference_number as invoice_number,
                   allocation.allocated_amount, allocation.created_at as allocation_date
            FROM financial.allocations allocation
            JOIN financial.payments payment ON payment.payment_id = allocation.payment_id
            WHERE allocation.payment_id = :payment_id
              AND payment.org_id = :org_id
              AND UPPER(allocation.reference_type) = 'INVOICE'
              AND allocation.allocation_status = 'active'
            ORDER BY allocation.created_at DESC
        """), {"payment_id": payment_id, "org_id": org_id})
        return [dict(row._mapping) for row in result]
    @staticmethod
    def get_allocation_with_org(db: Session, org_id: str, allocation_id: int) -> Optional[Dict[str, Any]]:
        """Get allocation with org verification."""
        result = db.execute(text("""
            SELECT pa.*, p.org_id FROM financial.allocations pa
            JOIN financial.payments p ON pa.payment_id = p.payment_id
            WHERE pa.allocation_id = :allocation_id AND p.org_id = :org_id
              AND pa.source_type = 'payment'
              AND UPPER(pa.reference_type) = 'INVOICE'
            FOR UPDATE
        """), {"allocation_id": allocation_id, "org_id": org_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def delete_allocation(
        db: Session,
        org_id: str,
        allocation_id: int,
        payment_id: int,
        invoice_id: int,
    ) -> None:
        """Delete a tenant-owned payment allocation and rebuild projections."""
        result = db.execute(text("""
            DELETE FROM financial.allocations allocation
            USING financial.payments payment
            WHERE allocation.allocation_id = :allocation_id
              AND allocation.payment_id = :payment_id
              AND UPPER(allocation.reference_type) = 'INVOICE'
              AND allocation.reference_id = :invoice_id
              AND allocation.source_type = 'payment'
              AND payment.payment_id = allocation.payment_id
              AND payment.org_id = :org_id
        """), {
            "allocation_id": allocation_id,
            "payment_id": payment_id,
            "invoice_id": invoice_id,
            "org_id": org_id,
        })
        if result.rowcount != 1:
            raise ValueError("Allocation not found or access denied")
        AllocationService.reconcile_allocation_projections(
            db, org_id, payment_id, invoice_id
        )
    
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

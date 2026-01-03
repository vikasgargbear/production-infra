"""
Payment service for tracking invoice payments

SECURITY: Uses TenantAwareSession for automatic org_id/branch_id filtering
Do NOT manually filter by org_id - TenantAwareSession handles it
"""
from typing import Dict, Any, List, Optional
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from uuid import UUID

from ..document_number_service import DocumentNumberService
from ....core.constants import (
    PaymentStatus, PaymentRecordStatus, PaymentMethod, PaymentType, PartyType
)

logger = logging.getLogger(__name__)


class PaymentService:
    """
    Service class for payment-related operations
    
    SECURITY NOTE: All methods expect TenantAwareSession which auto-filters by:
    - org_id: Always (hard tenant boundary)
    - branch_id: Based on user's branch_scope
    """
    
    @staticmethod
    def generate_payment_number(db: Session, org_id: Optional[str] = None) -> str:
        """Generate unique payment number using DocumentNumberService."""
        return DocumentNumberService.generate_number(db, "payment", org_id)
    
    @staticmethod
    def generate_receipt_number(db: Session, org_id: Optional[str] = None) -> str:
        """Generate unique receipt number using DocumentNumberService."""
        return DocumentNumberService.generate_number(db, "receipt", org_id)
    
    @staticmethod
    def record_payment(
        db: Session, 
        invoice_id: int, 
        payment_data: Dict[str, Any],
        org_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Record a payment against an invoice.
        
        TenantAwareSession auto-filters by org_id.
        """
        # Get invoice details (TenantAwareSession auto-adds org_id filter)
        invoice = db.execute(text("""
            SELECT invoice_id, invoice_number, final_amount as total_amount, 
                   COALESCE(paid_amount, 0) as paid_amount, payment_status, org_id
            FROM sales.invoices
            WHERE invoice_id = :invoice_id
        """), {"invoice_id": invoice_id}).fetchone()
        
        if not invoice:
            raise ValueError(f"Invoice {invoice_id} not found or access denied")
        
        # Validate payment amount
        payment_amount = Decimal(str(payment_data["amount"]))
        balance_amount = Decimal(str(invoice.total_amount)) - Decimal(str(invoice.paid_amount))
        
        if payment_amount > balance_amount:
            raise ValueError(f"Payment amount exceeds balance. Balance: {balance_amount}")
        
        # Generate payment reference
        payment_reference = PaymentService.generate_payment_number(db, org_id)
        
        # Create payment record
        payment_record = {
            "payment_reference": payment_reference,
            "invoice_id": invoice_id,
            "payment_date": payment_data.get("payment_date", date.today()),
            "payment_mode": payment_data.get("payment_mode", PaymentMethod.CASH.value),
            "payment_amount": payment_amount,
            "transaction_reference": payment_data.get("transaction_reference"),
            "bank_name": payment_data.get("bank_name"),
            "cheque_number": payment_data.get("cheque_number"),
            "cheque_date": payment_data.get("cheque_date"),
            "notes": payment_data.get("notes"),
            "status": PaymentRecordStatus.COMPLETED.value,
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        }
        
        # Insert payment into financial.payments
        result = db.execute(text("""
            INSERT INTO financial.payments (
                org_id, payment_number, payment_date, payment_type, payment_mode,
                party_type, party_id, payment_amount, payment_status,
                reference_number, narration, created_at, updated_at
            ) 
            SELECT 
                i.org_id, :payment_reference, :payment_date, 'receipt', :payment_mode,
                'customer', i.customer_id, :payment_amount, 'cleared',
                :transaction_reference, :notes, :created_at, :updated_at
            FROM sales.invoices i
            WHERE i.invoice_id = :invoice_id
            RETURNING payment_id
        """), payment_record)
        
        payment_id = result.scalar()
        
        # Calculate new totals
        new_paid_amount = Decimal(str(invoice.paid_amount)) + payment_amount
        total_amount = Decimal(str(invoice.total_amount))
        
        # Determine new payment status
        if new_paid_amount >= total_amount:
            new_payment_status = PaymentStatus.PAID.value
        elif new_paid_amount > 0:
            new_payment_status = PaymentStatus.PARTIAL.value
        else:
            new_payment_status = PaymentStatus.PENDING.value
        
        # Update invoice paid amount and status
        db.execute(text("""
            UPDATE sales.invoices
            SET paid_amount = :paid_amount,
                payment_status = :payment_status,
                payment_date = CASE 
                    WHEN :payment_status = 'paid' THEN :payment_date 
                    ELSE payment_date 
                END,
                updated_at = CURRENT_TIMESTAMP
            WHERE invoice_id = :invoice_id
        """), {
            "invoice_id": invoice_id,
            "paid_amount": new_paid_amount,
            "payment_status": new_payment_status,
            "payment_date": payment_data.get("payment_date", date.today())
        })
        
        # Update order payment status if fully paid
        if new_payment_status == PaymentStatus.PAID.value:
            db.execute(text("""
                UPDATE sales.orders o
                SET payment_status = 'paid',
                    updated_at = CURRENT_TIMESTAMP
                FROM sales.invoices i
                WHERE i.order_id = o.order_id
                AND i.invoice_id = :invoice_id
            """), {"invoice_id": invoice_id})
        
        return {
            "payment_id": payment_id,
            "payment_reference": payment_reference,
            "invoice_id": invoice_id,
            "amount": payment_amount,
            "balance_amount": total_amount - new_paid_amount,
            "payment_status": new_payment_status,
            "message": "Payment recorded successfully"
        }
    
    @staticmethod
    def get_invoice_payments(
        db: Session, 
        invoice_id: int,
        org_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all payments for an invoice.
        TenantAwareSession auto-filters by org_id.
        """
        payments = db.execute(text("""
            SELECT p.* 
            FROM financial.payments p
            JOIN sales.invoices i ON p.party_id = i.customer_id AND p.party_type = 'customer'
            WHERE i.invoice_id = :invoice_id
            ORDER BY p.payment_date DESC, p.created_at DESC
        """), {"invoice_id": invoice_id}).fetchall()
        return [dict(payment._mapping) for payment in payments]
    
    @staticmethod
    def get_payment_summary(
        db: Session, 
        org_id: UUID, 
        from_date: Optional[date] = None,
        to_date: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Get payment summary for organization.
        TenantAwareSession auto-filters by org_id.
        """
        params = {}
        date_filter = ""
        
        if from_date:
            date_filter += " AND p.payment_date >= :from_date"
            params["from_date"] = from_date
        if to_date:
            date_filter += " AND p.payment_date <= :to_date"
            params["to_date"] = to_date
        
        # Get payment statistics (TenantAwareSession auto-adds org_id)
        result = db.execute(text(f"""
            SELECT 
                COUNT(DISTINCT p.payment_id) as total_payments,
                COUNT(DISTINCT p.party_id) as customers_paid,
                COALESCE(SUM(p.payment_amount), 0) as total_collected,
                COUNT(DISTINCT CASE WHEN pm.method_type = 'cash' THEN p.payment_id END) as cash_payments,
                COUNT(DISTINCT CASE WHEN pm.method_type = 'cheque' THEN p.payment_id END) as cheque_payments,
                COUNT(DISTINCT CASE WHEN pm.method_type IN ('upi', 'bank_transfer', 'card', 'online') THEN p.payment_id END) as online_payments,
                COALESCE(SUM(CASE WHEN pm.method_type = 'cash' THEN p.payment_amount ELSE 0 END), 0) as cash_amount,
                COALESCE(SUM(CASE WHEN pm.method_type = 'cheque' THEN p.payment_amount ELSE 0 END), 0) as cheque_amount,
                COALESCE(SUM(CASE WHEN pm.method_type IN ('upi', 'bank_transfer', 'card', 'online') THEN p.payment_amount ELSE 0 END), 0) as online_amount
            FROM financial.payments p
            LEFT JOIN financial.payment_methods pm ON p.payment_method_id = pm.payment_method_id
            WHERE p.payment_status IN ('cleared', 'processed', 'approved', 'completed')
                AND p.party_type = 'customer' {date_filter}
        """), params).fetchone()
        
        # Get pending payments from invoices
        pending_result = db.execute(text("""
            SELECT 
                COUNT(DISTINCT i.invoice_id) as pending_invoices,
                COALESCE(SUM(i.final_amount - COALESCE(i.paid_amount, 0)), 0) as pending_amount
            FROM sales.invoices i
            WHERE (i.payment_status IN ('unpaid', 'partial') OR i.payment_status IS NULL)
                AND i.final_amount > COALESCE(i.paid_amount, 0)
        """)).fetchone()
        
        return {
            "total_payments": result.total_payments or 0,
            "invoices_paid": result.customers_paid or 0,
            "total_collected": float(result.total_collected or 0),
            "payment_modes": {
                "cash": {
                    "count": result.cash_payments or 0,
                    "amount": float(result.cash_amount or 0)
                },
                "cheque": {
                    "count": result.cheque_payments or 0,
                    "amount": float(result.cheque_amount or 0)
                },
                "online": {
                    "count": result.online_payments or 0,
                    "amount": float(result.online_amount or 0)
                }
            },
            "pending": {
                "invoices": pending_result.pending_invoices if pending_result else 0,
                "amount": float(pending_result.pending_amount if pending_result else 0)
            }
        }
    
    @staticmethod
    def cancel_payment(
        db: Session, 
        payment_id: int, 
        reason: str,
        org_id: Optional[str] = None,
        cancelled_by: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Cancel a payment and adjust invoice.
        TenantAwareSession auto-filters by org_id.
        """
        # Get payment details (TenantAwareSession auto-adds org_id filter)
        payment = db.execute(text("""
            SELECT p.*, i.invoice_id, i.paid_amount as invoice_paid_amount
            FROM financial.payments p
            LEFT JOIN sales.invoices i ON p.party_id = i.customer_id AND p.party_type = 'customer'
            WHERE p.payment_id = :payment_id 
                AND p.payment_status NOT IN ('cancelled', 'failed')
        """), {"payment_id": payment_id}).fetchone()
        
        if not payment:
            raise ValueError("Payment not found, already cancelled, or access denied")
        
        # Update payment status
        db.execute(text("""
            UPDATE financial.payments
            SET payment_status = :status,
                narration = COALESCE(narration, '') || ' | Cancelled: ' || :reason,
                updated_at = CURRENT_TIMESTAMP
            WHERE payment_id = :payment_id
        """), {
            "payment_id": payment_id, 
            "reason": reason,
            "status": PaymentRecordStatus.CANCELLED.value
        })
        
        # Adjust invoice paid amount if linked
        if payment.invoice_id:
            db.execute(text("""
                UPDATE sales.invoices
                SET paid_amount = GREATEST(0, paid_amount - :amount),
                    payment_status = CASE 
                        WHEN GREATEST(0, paid_amount - :amount) = 0 THEN 'unpaid'
                        WHEN GREATEST(0, paid_amount - :amount) < final_amount THEN 'partial'
                        ELSE payment_status
                    END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE invoice_id = :invoice_id
            """), {"invoice_id": payment.invoice_id, "amount": payment.payment_amount})
        
        logger.info(f"Payment {payment_id} cancelled by user {cancelled_by}. Reason: {reason}")
        
        return {
            "payment_id": payment_id,
            "status": "cancelled",
            "message": "Payment cancelled successfully"
        }
    
    @staticmethod
    def get_payment_by_id(
        db: Session, 
        payment_id: int, 
        org_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get single payment by ID with security validation.
        TenantAwareSession auto-filters by org_id.
        """
        result = db.execute(text("""
            SELECT p.*, 
                c.customer_name,
                s.supplier_name,
                i.invoice_number
            FROM financial.payments p
            LEFT JOIN parties.customers c ON p.party_id = c.customer_id AND p.party_type = 'customer'
            LEFT JOIN parties.suppliers s ON p.party_id = s.supplier_id AND p.party_type = 'supplier'
            LEFT JOIN sales.invoices i ON p.party_id = i.customer_id AND p.party_type = 'customer'
            WHERE p.payment_id = :payment_id
        """), {"payment_id": payment_id}).first()
        return dict(result._mapping) if result else None
    
    @staticmethod
    def create_customer_receipt(
        db: Session,
        org_id: str,
        customer_id: int,
        amount: Decimal,
        payment_mode: str = "cash",
        payment_date: Optional[date] = None,
        reference_number: Optional[str] = None,
        notes: Optional[str] = None,
        created_by: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Create a customer payment receipt.
        TenantAwareSession auto-filters by org_id.
        """
        # Generate receipt number
        receipt_number = PaymentService.generate_receipt_number(db, org_id)
        
        # Get customer name (TenantAwareSession auto-adds org_id)
        customer_result = db.execute(
            text("SELECT customer_name FROM parties.customers WHERE customer_id = :id"),
            {"id": customer_id}
        ).first()
        customer_name = customer_result.customer_name if customer_result else f"Customer {customer_id}"
        
        # Insert payment - using org_id from parameter for INSERT (new record creation)
        result = db.execute(text("""
            INSERT INTO financial.payments (
                org_id, payment_number, payment_date, payment_type, payment_mode,
                party_type, party_id, party_name, payment_amount,
                reference_number, payment_status, narration, created_by
            ) VALUES (
                :org_id, :receipt_number, :payment_date, 'receipt', :payment_mode,
                'customer', :customer_id, :customer_name, :amount,
                :reference_number, 'cleared', :notes, :created_by
            ) RETURNING payment_id, payment_number, payment_amount
        """), {
            "org_id": org_id,
            "receipt_number": receipt_number,
            "payment_date": payment_date or date.today(),
            "customer_id": customer_id,
            "customer_name": customer_name,
            "amount": amount,
            "payment_mode": payment_mode,
            "reference_number": reference_number,
            "notes": notes,
            "created_by": created_by
        })
        
        payment = result.fetchone()
        
        # Update customer outstanding
        db.execute(text("""
            UPDATE parties.customers
            SET current_outstanding = GREATEST(0, current_outstanding - :amount),
                last_payment_date = :payment_date,
                updated_at = CURRENT_TIMESTAMP
            WHERE customer_id = :customer_id
        """), {
            "amount": amount,
            "payment_date": payment_date or date.today(),
            "customer_id": customer_id
        })
        
        return {
            "success": True,
            "payment_id": payment.payment_id,
            "receipt_number": payment.payment_number,
            "amount": float(payment.payment_amount),
            "message": "Payment receipt created successfully"
        }
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

from ...document_number_service import DocumentNumberService
from .....core.utils.constants import (
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
        
        # Generate payment reference (use invoice's org_id if not provided)
        effective_org_id = org_id or str(invoice.org_id)
        payment_reference = PaymentService.generate_payment_number(db, effective_org_id)
        
        # Resolve payment_method_id from payment_mode string
        payment_mode = payment_data.get("payment_mode", PaymentMethod.CASH.value)
        method_id_result = db.execute(text("""
            SELECT payment_method_id FROM financial.payment_methods
            WHERE UPPER(method_code) = UPPER(:mode)
            LIMIT 1
        """), {"mode": payment_mode}).scalar()

        if not method_id_result:
            # Fallback to CASH (id=32)
            method_id_result = db.execute(text("""
                SELECT payment_method_id FROM financial.payment_methods
                WHERE UPPER(method_code) = 'CASH' LIMIT 1
            """)).scalar()

        # Create payment record
        payment_record = {
            "payment_reference": payment_reference,
            "invoice_id": invoice_id,
            "payment_date": payment_data.get("payment_date", date.today()),
            "payment_method_id": method_id_result,
            "payment_amount": payment_amount,
            "transaction_reference": payment_data.get("transaction_reference"),
            "notes": payment_data.get("notes"),
        }

        # Insert payment into financial.payments
        result = db.execute(text("""
            INSERT INTO financial.payments (
                org_id, branch_id, payment_number, payment_date, payment_type,
                payment_method_id, party_type, party_id, party_name,
                payment_amount, payment_status, reference_number, created_by
            )
            SELECT
                i.org_id,
                COALESCE((SELECT branch_id FROM master.org_branches WHERE org_id = i.org_id LIMIT 1), 5),
                :payment_reference, :payment_date, 'receipt',
                :payment_method_id, 'customer', i.customer_id,
                COALESCE((SELECT customer_name FROM parties.customers WHERE customer_id = i.customer_id), 'Unknown'),
                :payment_amount, 'cleared', :transaction_reference,
                COALESCE(:created_by, (SELECT user_id FROM master.org_users WHERE org_id = i.org_id LIMIT 1))
            FROM sales.invoices i
            WHERE i.invoice_id = :invoice_id
            RETURNING payment_id
        """), {**payment_record, "created_by": payment_data.get("created_by")})
        
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

        new_credit_amount = max(Decimal("0"), total_amount - new_paid_amount)

        # Create allocation row (links payment to invoice).
        # DB trigger trg_update_reference_paid_amount auto-updates
        # sales.invoices (paid_amount, credit_amount, payment_status).
        created_by = payment_data.get("created_by")
        if not created_by:
            created_by = db.execute(text(
                "SELECT user_id FROM master.org_users WHERE org_id = :org_id LIMIT 1"
            ), {"org_id": effective_org_id}).scalar()
        db.execute(text("""
            INSERT INTO financial.allocations (
                payment_id, reference_type, reference_id, reference_number,
                allocated_amount, source_type, created_by
            ) VALUES (
                :payment_id, 'INVOICE', :invoice_id, :invoice_number,
                :amount, 'payment', :created_by
            )
        """), {
            "payment_id": payment_id,
            "invoice_id": invoice_id,
            "invoice_number": invoice.invoice_number if hasattr(invoice, 'invoice_number') else str(invoice_id),
            "amount": payment_amount,
            "created_by": created_by,
        })

        # Update customer_outstanding (no trigger handles this)
        outstanding_status = "paid" if new_payment_status == PaymentStatus.PAID.value else "partial"
        db.execute(text("""
            UPDATE financial.customer_outstanding
            SET paid_amount = :paid_amount,
                outstanding_amount = :outstanding_amount,
                status = :status
            WHERE document_id = :invoice_id AND document_type = 'invoice'
        """), {
            "invoice_id": invoice_id,
            "paid_amount": new_paid_amount,
            "outstanding_amount": new_credit_amount,
            "status": outstanding_status
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
        Get all payments allocated to a specific invoice.
        Joins through financial.allocations for precise invoice-payment linking.
        """
        payments = db.execute(text("""
            SELECT p.payment_id, p.payment_number, p.payment_date,
                   p.payment_amount, p.payment_status, p.party_name,
                   a.allocated_amount, a.allocation_id,
                   pm.method_name as payment_method
            FROM financial.allocations a
            JOIN financial.payments p ON a.payment_id = p.payment_id
            LEFT JOIN financial.payment_methods pm ON p.payment_method_id = pm.payment_method_id
            WHERE a.reference_type = 'INVOICE'
              AND a.reference_id = :invoice_id
              AND a.allocation_status = 'active'
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
        # Get payment details with linked invoice via allocations
        payment = db.execute(text("""
            SELECT p.payment_id, p.payment_amount, p.payment_status, p.party_type, p.party_id,
                   a.reference_id as invoice_id
            FROM financial.payments p
            LEFT JOIN financial.allocations a ON a.payment_id = p.payment_id
                AND a.reference_type = 'INVOICE' AND a.allocation_status = 'active'
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
            SELECT p.payment_id, p.payment_number, p.payment_date,
                   p.payment_type, p.party_type, p.party_id, p.party_name,
                   p.payment_amount, p.payment_status, p.reference_number,
                   p.allocation_status, p.allocated_amount, p.narration,
                   pm.method_name as payment_method,
                   a.reference_number as invoice_number,
                   a.reference_id as invoice_id
            FROM financial.payments p
            LEFT JOIN financial.payment_methods pm ON p.payment_method_id = pm.payment_method_id
            LEFT JOIN financial.allocations a ON a.payment_id = p.payment_id
                AND a.reference_type = 'INVOICE' AND a.allocation_status = 'active'
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
        
        # Resolve payment_method_id from payment_mode string
        method_id = db.execute(text("""
            SELECT payment_method_id FROM financial.payment_methods
            WHERE UPPER(method_code) = UPPER(:mode)
            LIMIT 1
        """), {"mode": payment_mode}).scalar()
        if not method_id:
            method_id = db.execute(text("""
                SELECT payment_method_id FROM financial.payment_methods
                WHERE UPPER(method_code) = 'CASH' LIMIT 1
            """)).scalar()

        # Insert payment - using org_id from parameter for INSERT (new record creation)
        result = db.execute(text("""
            INSERT INTO financial.payments (
                org_id, branch_id, payment_number, payment_date, payment_type,
                payment_method_id, party_type, party_id, party_name,
                payment_amount, reference_number, payment_status, created_by
            ) VALUES (
                :org_id,
                COALESCE((SELECT branch_id FROM master.org_branches WHERE org_id = :org_id::uuid LIMIT 1), 5),
                :receipt_number, :payment_date, 'receipt',
                :payment_method_id, 'customer', :customer_id, :customer_name,
                :amount, :reference_number, 'cleared', :created_by
            ) RETURNING payment_id, payment_number, payment_amount
        """), {
            "org_id": org_id,
            "receipt_number": receipt_number,
            "payment_date": payment_date or date.today(),
            "customer_id": customer_id,
            "customer_name": customer_name,
            "amount": amount,
            "payment_method_id": method_id,
            "reference_number": reference_number,
            "created_by": created_by
        })
        
        payment = result.fetchone()
        
        # Update customer outstanding in financial.customer_outstanding
        # Insert payment entry with negative amount OR reduce invoice outstanding
        db.execute(text("""
            INSERT INTO financial.customer_outstanding (
                org_id, customer_id, document_type, document_id, document_number,
                document_date, original_amount, outstanding_amount, paid_amount,
                due_date, status
            ) VALUES (
                :org_id, :customer_id, 'payment', :payment_id, :receipt_number,
                :payment_date, :negative_amount, :negative_amount, 0,
                :payment_date, 'open'
            )
        """), {
            "org_id": org_id,
            "customer_id": customer_id,
            "payment_id": payment.payment_id,
            "receipt_number": payment.payment_number,
            "payment_date": payment_date or date.today(),
            "negative_amount": -float(amount)  # Negative to reduce outstanding
        })
        
        # Update last_payment_date on customer (this is metadata, not balance)
        db.execute(text("""
            UPDATE parties.customers
            SET last_payment_date = :payment_date,
                updated_at = CURRENT_TIMESTAMP
            WHERE customer_id = :customer_id
        """), {
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
    
    @staticmethod
    def get_overview(db: Session) -> Dict[str, Any]:
        """
        Get payments overview for last 30 days.
        TenantAwareSession auto-filters by org_id.
        """
        result = db.execute(text("""
            SELECT
                COUNT(*) as total_payments,
                COALESCE(SUM(payment_amount), 0) as total_amount,
                COUNT(CASE WHEN payment_type = 'receipt' THEN 1 END) as receipts_count,
                COUNT(CASE WHEN payment_type = 'payment' THEN 1 END) as payments_count
            FROM financial.payments
            WHERE payment_date >= CURRENT_DATE - INTERVAL '30 days'
        """)).fetchone()
        
        return {
            "total_payments": result.total_payments if result else 0,
            "total_amount": float(result.total_amount) if result and result.total_amount else 0,
            "receipts_count": result.receipts_count if result else 0,
            "payments_count": result.payments_count if result else 0
        }
    
    @staticmethod
    def search_payments(
        db: Session,
        q: Optional[str] = None,
        party_id: Optional[int] = None,
        party_type: Optional[str] = None,
        payment_mode: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        limit: int = 50,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Search payments with filters.
        TenantAwareSession auto-filters by org_id.
        """
        params = {"cancelled_status": "cancelled"}
        select_cols = """
            SELECT p.payment_id, p.payment_number, p.payment_date,
                   p.payment_type, p.party_type, p.party_id, p.party_name,
                   p.payment_amount, p.payment_status, p.reference_number,
                   p.allocation_status, p.allocated_amount,
                   pm.method_name as payment_method
        """
        from_clause = """
            FROM financial.payments p
            LEFT JOIN financial.payment_methods pm ON p.payment_method_id = pm.payment_method_id
            WHERE p.payment_status != :cancelled_status
        """

        if q:
            from_clause += """ AND (
                p.payment_number ILIKE :q
                OR p.reference_number ILIKE :q
                OR p.party_name ILIKE :q
            )"""
            params["q"] = f"%{q}%"

        if party_id and party_type == "customer":
            from_clause += " AND p.party_id = :party_id AND p.party_type = 'customer'"
            params["party_id"] = party_id
        elif party_id and party_type == "supplier":
            from_clause += " AND p.party_id = :party_id AND p.party_type = 'supplier'"
            params["party_id"] = party_id
        elif party_id:
            from_clause += " AND p.party_id = :party_id"
            params["party_id"] = party_id

        if date_from:
            from_clause += " AND p.payment_date >= :date_from"
            params["date_from"] = date_from
        if date_to:
            from_clause += " AND p.payment_date <= :date_to"
            params["date_to"] = date_to

        query = select_cols + from_clause + " ORDER BY p.payment_date DESC LIMIT :limit OFFSET :offset"
        params["limit"] = limit
        params["offset"] = offset

        result = db.execute(text(query), params)
        payments = [dict(row._mapping) for row in result]

        # Get total count
        count_query = "SELECT COUNT(*) " + from_clause
        count_result = db.execute(text(count_query), {k: v for k, v in params.items() if k not in ["limit", "offset"]})
        total = count_result.scalar() or 0

        return {"payments": payments, "total": total}
    
    @staticmethod
    def get_pending_payments(
        db: Session,
        party_type: Optional[str] = None,
        party_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Get pending/uncleared payments.
        TenantAwareSession auto-filters by org_id.
        """
        query = """
            SELECT p.payment_id, p.payment_number, p.payment_date,
                   p.payment_type, p.party_type, p.party_id, p.party_name,
                   p.payment_amount, p.payment_status, p.reference_number,
                   pm.method_name as payment_method
            FROM financial.payments p
            LEFT JOIN financial.payment_methods pm ON p.payment_method_id = pm.payment_method_id
            WHERE p.payment_status = :pending_status
                OR (p.payment_method_id IS NOT NULL AND p.clearance_date IS NULL)
        """
        params = {"pending_status": "pending"}

        if party_type == "customer" and party_id:
            query += " AND p.party_id = :party_id AND p.party_type = 'customer'"
            params["party_id"] = party_id
        elif party_type == "supplier" and party_id:
            query += " AND p.party_id = :party_id AND p.party_type = 'supplier'"
            params["party_id"] = party_id

        query += " ORDER BY p.payment_date DESC"

        result = db.execute(text(query), params)
        payments = [dict(row._mapping) for row in result]

        return {"payments": payments, "total": len(payments)}
    
    @staticmethod
    def get_payment_methods(db: Session) -> Dict[str, Any]:
        """
        Get available payment methods.
        TenantAwareSession auto-filters by org_id.
        """
        result = db.execute(text("""
            SELECT payment_method_id, method_name, method_type, is_active
            FROM financial.payment_methods
            WHERE is_active = true
            ORDER BY method_name
        """))
        methods = [dict(row._mapping) for row in result]
        
        # Fallback if no methods in DB
        if not methods:
            methods = [
                {"method_type": "cash", "method_name": "Cash"},
                {"method_type": "cheque", "method_name": "Cheque"},
                {"method_type": "upi", "method_name": "UPI"},
                {"method_type": "neft", "method_name": "NEFT/RTGS"},
                {"method_type": "card", "method_name": "Card"},
                {"method_type": "online", "method_name": "Online Transfer"}
            ]
        
        return {"methods": methods}
    
    @staticmethod
    def get_party_name(
        db: Session,
        party_id: int,
        party_type: str = "customer"
    ) -> Optional[str]:
        """
        Get party name for a customer or supplier.
        Returns None if not found.
        """
        result = db.execute(text("""
            SELECT customer_name as party_name FROM parties.customers WHERE customer_id = :id
            UNION ALL
            SELECT supplier_name as party_name FROM parties.suppliers WHERE supplier_id = :id
        """), {"id": party_id}).first()
        
        return result.party_name if result else None
    
    @staticmethod
    def get_or_create_method(
        db: Session,
        org_id: str,
        payment_mode: str
    ) -> int:
        """
        Get payment method ID, creating if doesn't exist.
        Returns method ID.
        """
        # First try to find existing
        method_result = db.execute(text("""
            SELECT payment_method_id FROM financial.payment_methods 
            WHERE LOWER(method_type) = LOWER(:mode)
            LIMIT 1
        """), {"mode": payment_mode}).first()
        
        if method_result:
            return method_result.payment_method_id
        
        # Create new method
        create_result = db.execute(text("""
            INSERT INTO financial.payment_methods (org_id, method_type, method_name, is_active)
            VALUES (:org_id, :mode, :name, true)
            RETURNING payment_method_id
        """), {
            "org_id": org_id,
            "mode": payment_mode,
            "name": payment_mode.title()
        }).first()
        
        return create_result.payment_method_id if create_result else 1
    
    @staticmethod
    def allocate_payment_to_invoices(
        db: Session,
        org_id: str,
        payment_id: int,
        allocations: List[Dict[str, Any]],
        user_id: int
    ) -> Dict[str, Any]:
        """
        Allocate a payment to multiple invoices.
        Creates allocation records and updates invoice/payment balances.
        """
        # Get payment details
        payment = db.execute(text("""
            SELECT payment_id, payment_amount, party_id, payment_type
            FROM financial.payments
            WHERE payment_id = :payment_id AND payment_status IN ('completed', 'cleared')
        """), {"payment_id": payment_id}).first()

        if not payment:
            raise ValueError("Payment not found or not in a valid status for allocation")
        
        total_allocated = 0

        for allocation in allocations:
            invoice_id = allocation.get("invoice_id")
            allocated_amount = allocation.get("amount", 0)

            if allocated_amount <= 0:
                continue

            # Get invoice balance
            invoice = db.execute(text("""
                SELECT invoice_id, invoice_number, final_amount, paid_amount
                FROM sales.invoices
                WHERE invoice_id = :invoice_id AND org_id = :org_id
            """), {"invoice_id": invoice_id, "org_id": org_id}).first()

            if not invoice:
                raise ValueError(f"Invoice {invoice_id} not found")

            balance = invoice.final_amount - (invoice.paid_amount or 0)
            actual_allocation = min(allocated_amount, balance)

            if actual_allocation > 0:
                # Create allocation record in financial.allocations (base table)
                # DB trigger trg_update_reference_paid_amount handles invoice + outstanding updates
                db.execute(text("""
                    INSERT INTO financial.allocations (
                        payment_id, reference_type, reference_id, reference_number,
                        allocated_amount, source_type, created_by
                    ) VALUES (
                        :payment_id, 'INVOICE', :reference_id, :reference_number,
                        :allocated_amount, 'payment', :created_by
                    )
                """), {
                    "payment_id": payment_id,
                    "reference_id": invoice_id,
                    "reference_number": invoice.invoice_number,
                    "allocated_amount": actual_allocation,
                    "created_by": user_id
                })

                total_allocated += actual_allocation
        
        # Update payment with allocated amount
        db.execute(text("""
            UPDATE financial.payments
            SET allocated_amount = :allocated_amount,
                unallocated_amount = payment_amount - :allocated_amount
            WHERE payment_id = :payment_id
        """), {
            "allocated_amount": total_allocated,
            "payment_id": payment_id
        })

        return {
            "payment_id": payment_id,
            "total_allocated": total_allocated,
            "unallocated_amount": float(payment.payment_amount) - total_allocated,
            "status": "success"
        }
    
    @staticmethod
    def process_bank_reconciliation(
        db: Session,
        org_id: str,
        bank_account: str,
        statement_date: date,
        opening_balance: float,
        closing_balance: float,
        reconciled_by: int,
        transactions: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Process bank reconciliation by matching transactions to payments.
        Creates reconciliation record and handles matched/unmatched items.
        """
        # Create reconciliation record
        result = db.execute(text("""
            INSERT INTO financial.bank_reconciliations (
                org_id, bank_account, statement_date, opening_balance, 
                closing_balance, reconciled_by, reconciliation_date
            ) VALUES (
                :org_id, :bank_account, :statement_date, :opening_balance,
                :closing_balance, :reconciled_by, CURRENT_DATE
            ) RETURNING reconciliation_id
        """), {
            "org_id": org_id,
            "bank_account": bank_account,
            "statement_date": statement_date,
            "opening_balance": opening_balance,
            "closing_balance": closing_balance,
            "reconciled_by": reconciled_by
        })
        
        reconciliation_id = result.scalar()
        
        # Process each transaction
        matched = 0
        unmatched = 0
        
        for txn in transactions:
            # Try to match with existing payments
            match_result = db.execute(text("""
                SELECT payment_id FROM financial.payments
                WHERE 1=1
                AND amount = :amount
                AND payment_date = :date
                AND payment_status != 'cancelled'
                AND cleared_date IS NULL
                LIMIT 1
            """), {
                "org_id": org_id,
                "amount": abs(txn.get("amount", 0)),
                "date": txn.get("date")
            })
            
            payment_match = match_result.first()
            
            if payment_match:
                # Update payment as cleared
                db.execute(text("""
                    UPDATE financial.payments
                    SET cleared_date = :cleared_date,
                        reconciliation_id = :reconciliation_id
                    WHERE payment_id = :payment_id
                """), {
                    "cleared_date": txn.get("date"),
                    "reconciliation_id": reconciliation_id,
                    "payment_id": payment_match.payment_id
                })
                matched += 1
            else:
                # Record unmatched transaction
                db.execute(text("""
                    INSERT INTO financial.unmatched_transactions (
                        reconciliation_id, transaction_date, description,
                        amount, transaction_type
                    ) VALUES (
                        :reconciliation_id, :transaction_date, :description,
                        :amount, :transaction_type
                    )
                """), {
                    "reconciliation_id": reconciliation_id,
                    "transaction_date": txn.get("date"),
                    "description": txn.get("description", ""),
                    "amount": txn.get("amount", 0),
                    "transaction_type": "credit" if txn.get("amount", 0) > 0 else "debit"
                })
                unmatched += 1
        
        return {
            "reconciliation_id": reconciliation_id,
            "matched_transactions": matched,
            "unmatched_transactions": unmatched,
            "status": "completed"
        }
    
    @staticmethod
    def create_general_payment(
        db: Session,
        org_id: str,
        branch_id: int,
        payment_data: Dict[str, Any],
        user_id: int
    ) -> Dict[str, Any]:
        """
        Create a general payment (advance, invoice payment, or adjustment).
        Handles sequence generation and insert.
        """
        from ...document_number_service import DocumentNumberService
        
        # Generate payment number if not provided
        payment_number = payment_data.get("payment_number")
        if not payment_number:
            doc_type = "receipt" if payment_data.get("customer_id") else "payment"
            payment_number = DocumentNumberService.generate_number(db, doc_type, org_id)
        
        # Get party name
        party_id = payment_data.get("customer_id") or payment_data.get("supplier_id")
        party_name = None
        if party_id:
            party_name = PaymentService.get_party_name(db, party_id)
            if not party_name:
                party_name = f"Party {party_id}"
        
        # Get or create payment method
        payment_method_id = 1
        if payment_data.get("payment_mode"):
            payment_method_id = PaymentService.get_or_create_method(db, org_id, payment_data["payment_mode"])
        
        # Insert payment
        result = db.execute(text("""
            INSERT INTO financial.payments (
                org_id, branch_id, payment_number, payment_date, payment_type, payment_method_id,
                party_type, party_id, party_name, payment_amount, payment_status,
                clearance_date, reference_number, narration, created_by
            ) VALUES (
                :org_id, :branch_id, :payment_number, :payment_date, :payment_type, :payment_method_id,
                :party_type, :party_id, :party_name, :payment_amount, :payment_status,
                :clearance_date, :reference_number, :narration, :created_by
            ) RETURNING payment_id, payment_number, payment_amount, payment_status
        """), {
            "org_id": org_id,
            "branch_id": branch_id,
            "payment_number": payment_number,
            "payment_date": payment_data.get("payment_date"),
            "payment_type": "payment" if payment_data.get("supplier_id") else "receipt",
            "payment_method_id": payment_method_id,
            "party_type": "supplier" if payment_data.get("supplier_id") else "customer",
            "party_id": party_id,
            "party_name": party_name,
            "payment_amount": payment_data.get("amount"),
            "payment_status": "cleared" if payment_data.get("payment_mode") == "cash" else "pending",
            "clearance_date": payment_data.get("cleared_date") or (payment_data.get("payment_date") if payment_data.get("payment_mode") == "cash" else None),
            "reference_number": payment_data.get("reference_number"),
            "narration": payment_data.get("notes"),
            "created_by": user_id
        }).fetchone()
        
        return {
            "payment_id": result.payment_id,
            "payment_number": result.payment_number,
            "amount": float(result.payment_amount),
            "status": result.payment_status
        }
    
    @staticmethod
    def get_outstanding_invoices(
        db: Session,
        customer_id: Optional[int] = None,
        overdue_only: bool = False
    ) -> Dict[str, Any]:
        """
        Get list of outstanding invoices with optional filters.
        """
        query = """
            SELECT 
                i.invoice_id, i.invoice_number, i.invoice_date, i.due_date,
                c.customer_id, c.customer_name, c.customer_code,
                i.final_amount, 
                COALESCE(i.paid_amount, 0) as paid_amount, 
                (i.final_amount - COALESCE(i.paid_amount, 0)) as balance_amount,
                i.payment_status,
                CASE 
                    WHEN i.due_date < CURRENT_DATE THEN 
                        CURRENT_DATE - i.due_date 
                    ELSE 0 
                END as days_overdue
            FROM sales.invoices i
            JOIN parties.customers c ON i.customer_id = c.customer_id
            WHERE i.payment_status IN ('unpaid', 'partial')
        """
        
        params = {}
        
        if customer_id:
            query += " AND c.customer_id = :customer_id"
            params["customer_id"] = customer_id
        
        if overdue_only:
            query += " AND i.due_date < CURRENT_DATE"
        
        query += " ORDER BY i.due_date, i.invoice_date"
        
        result = db.execute(text(query), params)
        invoices = [dict(row._mapping) for row in result]
        
        # Calculate summary
        total_outstanding = sum(inv["balance_amount"] for inv in invoices)
        total_overdue = sum(inv["balance_amount"] for inv in invoices if inv["days_overdue"] > 0)
        
        return {
            "invoices": invoices,
            "summary": {
                "total_invoices": len(invoices),
                "total_outstanding": total_outstanding,
                "total_overdue": total_overdue,
                "overdue_invoices": len([inv for inv in invoices if inv["days_overdue"] > 0])
            }
        }
    
    @staticmethod
    def get_aging_report(
        db: Session,
        aging_date: date,
        customer_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Generate customer aging report with buckets.
        """
        query = """
            WITH invoice_aging AS (
                SELECT 
                    i.invoice_id,
                    i.invoice_number,
                    i.invoice_date,
                    i.due_date,
                    c.customer_id,
                    c.customer_name,
                    c.customer_code,
                    i.final_amount,
                    COALESCE(i.paid_amount, 0) as paid_amount,
                    (i.final_amount - COALESCE(i.paid_amount, 0)) as balance_amount,
                    (:aging_date - i.due_date) as days_overdue,
                    CASE 
                        WHEN (:aging_date - i.due_date) <= 0 THEN 'current'
                        WHEN (:aging_date - i.due_date) BETWEEN 1 AND 30 THEN '1-30'
                        WHEN (:aging_date - i.due_date) BETWEEN 31 AND 60 THEN '31-60'
                        WHEN (:aging_date - i.due_date) BETWEEN 61 AND 90 THEN '61-90'
                        ELSE '90+'
                    END as aging_bucket
                FROM sales.invoices i
                JOIN parties.customers c ON i.customer_id = c.customer_id
                WHERE i.payment_status IN ('unpaid', 'partial')
                    AND (i.final_amount - COALESCE(i.paid_amount, 0)) > 0
        """
        
        params = {"aging_date": aging_date}
        
        if customer_id:
            query += " AND c.customer_id = :customer_id"
            params["customer_id"] = customer_id
            
        query += """
            )
            SELECT 
                customer_id,
                customer_name,
                customer_code,
                COUNT(*) as invoice_count,
                SUM(balance_amount) as total_outstanding,
                SUM(CASE WHEN aging_bucket = 'current' THEN balance_amount ELSE 0 END) as current,
                SUM(CASE WHEN aging_bucket = '1-30' THEN balance_amount ELSE 0 END) as days_1_30,
                SUM(CASE WHEN aging_bucket = '31-60' THEN balance_amount ELSE 0 END) as days_31_60,
                SUM(CASE WHEN aging_bucket = '61-90' THEN balance_amount ELSE 0 END) as days_61_90,
                SUM(CASE WHEN aging_bucket = '90+' THEN balance_amount ELSE 0 END) as days_90_plus,
                MAX(days_overdue) as max_days_overdue
            FROM invoice_aging
            GROUP BY customer_id, customer_name, customer_code
            ORDER BY total_outstanding DESC
        """
        
        result = db.execute(text(query), params)
        customer_aging = [dict(row._mapping) for row in result]
        
        # Calculate totals
        total_outstanding = sum(row["total_outstanding"] for row in customer_aging)
        total_current = sum(row["current"] for row in customer_aging)
        total_1_30 = sum(row["days_1_30"] for row in customer_aging)
        total_31_60 = sum(row["days_31_60"] for row in customer_aging)
        total_61_90 = sum(row["days_61_90"] for row in customer_aging)
        total_90_plus = sum(row["days_90_plus"] for row in customer_aging)
        
        return {
            "as_of_date": aging_date,
            "customer_aging": customer_aging,
            "summary": {
                "total_customers": len(customer_aging),
                "total_outstanding": total_outstanding,
                "aging_buckets": {
                    "current": total_current,
                    "1-30_days": total_1_30,
                    "31-60_days": total_31_60,
                    "61-90_days": total_61_90,
                    "90+_days": total_90_plus
                },
                "aging_percentages": {
                    "current": round((total_current / total_outstanding * 100) if total_outstanding > 0 else 0, 2),
                    "1-30_days": round((total_1_30 / total_outstanding * 100) if total_outstanding > 0 else 0, 2),
                    "31-60_days": round((total_31_60 / total_outstanding * 100) if total_outstanding > 0 else 0, 2),
                    "61-90_days": round((total_61_90 / total_outstanding * 100) if total_outstanding > 0 else 0, 2),
                    "90+_days": round((total_90_plus / total_outstanding * 100) if total_outstanding > 0 else 0, 2)
                }
            }
        }
    
    @staticmethod
    def generate_receipt_sequence(
        db: Session,
        payment_type: str = "receipt",
        org_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate unique receipt/payment number using centralized DocumentNumberService.
        Format: RCT-YYYYMMDDNNNN or PAY-YYYYMMDDNNNN
        """
        doc_type = "receipt" if payment_type == "receipt" else "payment"
        receipt_number = DocumentNumberService.generate_number(db, doc_type, org_id)

        return {
            "receipt_number": receipt_number,
            "payment_type": payment_type,
            "generated_at": datetime.now().isoformat()
        }
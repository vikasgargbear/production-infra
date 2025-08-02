"""
Payment service for tracking invoice payments
"""
from typing import Dict, Any, List, Optional
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from uuid import UUID

logger = logging.getLogger(__name__)


class PaymentService:
    """Service class for payment-related operations"""
    
    @staticmethod
    def record_payment(db: Session, invoice_id: int, payment_data: Dict[str, Any]) -> Dict[str, Any]:
        """Record a payment against an invoice"""
        
        # Get invoice details
        invoice = db.execute(text("""
            SELECT invoice_id, invoice_number, total_amount, paid_amount, payment_status
            FROM invoices
            WHERE invoice_id = :invoice_id
        """), {"invoice_id": invoice_id}).fetchone()
        
        if not invoice:
            raise ValueError(f"Invoice {invoice_id} not found")
        
        # Validate payment amount
        payment_amount = Decimal(str(payment_data["amount"]))
        balance_amount = invoice.total_amount - invoice.paid_amount
        
        if payment_amount > balance_amount:
            raise ValueError(f"Payment amount exceeds balance. Balance: {balance_amount}")
        
        # Generate payment reference
        payment_reference = PaymentService.generate_payment_reference(db)
        
        # Create payment record
        payment_record = {
            "payment_reference": payment_reference,
            "invoice_id": invoice_id,
            "payment_date": payment_data.get("payment_date", date.today()),
            "payment_mode": payment_data["payment_mode"],
            "payment_amount": payment_amount,
            "transaction_reference": payment_data.get("transaction_reference"),
            "bank_name": payment_data.get("bank_name"),
            "cheque_number": payment_data.get("cheque_number"),
            "cheque_date": payment_data.get("cheque_date"),
            "notes": payment_data.get("notes"),
            "status": "completed",
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        }
        
        # Insert payment
        result = db.execute(text("""
            INSERT INTO invoice_payments (
                payment_reference, invoice_id, payment_date,
                payment_mode, payment_amount, transaction_reference,
                bank_name, cheque_number, cheque_date,
                notes, status, created_at, updated_at
            ) VALUES (
                :payment_reference, :invoice_id, :payment_date,
                :payment_mode, :payment_amount, :transaction_reference,
                :bank_name, :cheque_number, :cheque_date,
                :notes, :status, :created_at, :updated_at
            ) RETURNING payment_id
        """), payment_record)
        
        payment_id = result.scalar()
        
        # Update invoice paid amount and status
        new_paid_amount = invoice.paid_amount + payment_amount
        new_payment_status = "paid" if new_paid_amount >= invoice.total_amount else "partial"
        
        db.execute(text("""
            UPDATE invoices
            SET paid_amount = :paid_amount,
                payment_status = :payment_status,
                payment_date = CASE 
                    WHEN payment_status = 'paid' THEN :payment_date 
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
        if new_payment_status == "paid":
            db.execute(text("""
                UPDATE orders o
                SET payment_status = 'paid',
                    updated_at = CURRENT_TIMESTAMP
                FROM invoices i
                WHERE i.order_id = o.order_id
                AND i.invoice_id = :invoice_id
            """), {"invoice_id": invoice_id})
        
        return {
            "payment_id": payment_id,
            "payment_reference": payment_reference,
            "invoice_id": invoice_id,
            "amount": payment_amount,
            "balance_amount": invoice.total_amount - new_paid_amount,
            "payment_status": new_payment_status,
            "message": "Payment recorded successfully"
        }
    
    @staticmethod
    def generate_payment_reference(db: Session) -> str:
        """Generate unique payment reference"""
        # Format: PAY-YYYYMMDD-XXXXX
        today = date.today()
        prefix = f"PAY-{today.strftime('%Y%m%d')}"
        
        result = db.execute(text("""
            SELECT COUNT(*) + 1 as next_num
            FROM invoice_payments
            WHERE payment_reference LIKE :prefix || '%'
        """), {"prefix": prefix})
        
        next_num = result.scalar() or 1
        return f"{prefix}-{next_num:05d}"
    
    @staticmethod
    def get_invoice_payments(db: Session, invoice_id: int) -> List[Dict[str, Any]]:
        """Get all payments for an invoice"""
        payments = db.execute(text("""
            SELECT * FROM invoice_payments
            WHERE invoice_id = :invoice_id
            ORDER BY payment_date DESC, created_at DESC
        """), {"invoice_id": invoice_id}).fetchall()
        
        return [dict(payment._mapping) for payment in payments]
    
    @staticmethod
    def get_payment_summary(db: Session, org_id: UUID, 
                          from_date: Optional[date] = None,
                          to_date: Optional[date] = None) -> Dict[str, Any]:
        """Get payment summary for organization"""
        params = {"org_id": org_id}
        date_filter = ""
        
        if from_date:
            date_filter += " AND ip.payment_date >= :from_date"
            params["from_date"] = from_date
        if to_date:
            date_filter += " AND ip.payment_date <= :to_date"
            params["to_date"] = to_date
        
        # Get payment statistics
        result = db.execute(text(f"""
            SELECT 
                COUNT(DISTINCT ip.payment_id) as total_payments,
                COUNT(DISTINCT i.invoice_id) as invoices_paid,
                COALESCE(SUM(ip.payment_amount), 0) as total_collected,
                COUNT(DISTINCT CASE WHEN ip.payment_mode = 'cash' THEN ip.payment_id END) as cash_payments,
                COUNT(DISTINCT CASE WHEN ip.payment_mode = 'cheque' THEN ip.payment_id END) as cheque_payments,
                COUNT(DISTINCT CASE WHEN ip.payment_mode = 'online' THEN ip.payment_id END) as online_payments,
                COALESCE(SUM(CASE WHEN ip.payment_mode = 'cash' THEN ip.payment_amount ELSE 0 END), 0) as cash_amount,
                COALESCE(SUM(CASE WHEN ip.payment_mode = 'cheque' THEN ip.payment_amount ELSE 0 END), 0) as cheque_amount,
                COALESCE(SUM(CASE WHEN ip.payment_mode = 'online' THEN ip.payment_amount ELSE 0 END), 0) as online_amount
            FROM invoice_payments ip
            JOIN invoices i ON ip.invoice_id = i.invoice_id
            JOIN orders o ON i.order_id = o.order_id
            WHERE o.org_id = :org_id {date_filter}
        """), params).fetchone()
        
        # Get pending payments
        pending_result = db.execute(text(f"""
            SELECT 
                COUNT(DISTINCT i.invoice_id) as pending_invoices,
                COALESCE(SUM(i.total_amount - i.paid_amount), 0) as pending_amount
            FROM invoices i
            JOIN orders o ON i.order_id = o.order_id
            WHERE o.org_id = :org_id 
                AND i.payment_status IN ('unpaid', 'partial')
        """), {"org_id": org_id}).fetchone()
        
        return {
            "total_payments": result.total_payments,
            "invoices_paid": result.invoices_paid,
            "total_collected": result.total_collected,
            "payment_modes": {
                "cash": {
                    "count": result.cash_payments,
                    "amount": result.cash_amount
                },
                "cheque": {
                    "count": result.cheque_payments,
                    "amount": result.cheque_amount
                },
                "online": {
                    "count": result.online_payments,
                    "amount": result.online_amount
                }
            },
            "pending": {
                "invoices": pending_result.pending_invoices,
                "amount": pending_result.pending_amount
            }
        }
    
    @staticmethod
    def cancel_payment(db: Session, payment_id: int, reason: str) -> Dict[str, Any]:
        """Cancel a payment and adjust invoice"""
        # Get payment details
        payment = db.execute(text("""
            SELECT * FROM invoice_payments
            WHERE payment_id = :payment_id AND status = 'completed'
        """), {"payment_id": payment_id}).fetchone()
        
        if not payment:
            raise ValueError("Payment not found or already cancelled")
        
        # Update payment status
        db.execute(text("""
            UPDATE invoice_payments
            SET status = 'cancelled',
                cancellation_reason = :reason,
                cancelled_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE payment_id = :payment_id
        """), {"payment_id": payment_id, "reason": reason})
        
        # Adjust invoice paid amount
        db.execute(text("""
            UPDATE invoices
            SET paid_amount = paid_amount - :amount,
                payment_status = CASE 
                    WHEN paid_amount - :amount = 0 THEN 'unpaid'
                    WHEN paid_amount - :amount < total_amount THEN 'partial'
                    ELSE payment_status
                END,
                updated_at = CURRENT_TIMESTAMP
            WHERE invoice_id = :invoice_id
        """), {"invoice_id": payment.invoice_id, "amount": payment.payment_amount})
        
        return {
            "payment_id": payment_id,
            "status": "cancelled",
            "message": "Payment cancelled successfully"
        }
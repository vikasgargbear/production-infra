"""
Ledger Service - Party ledger statements and aging analysis

SECURITY: Uses TenantAwareSession for automatic org_id/branch_id filtering
Do NOT manually filter by org_id - TenantAwareSession handles it

Provides business logic for:
- Party statement generation
- Balance calculations
- Aging analysis
- Outstanding bills tracking
"""
from typing import Dict, Any, List, Optional
from datetime import date
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from uuid import UUID

from .....core.utils.constants import (
    PartyType, InvoicePaymentStatus, InvoiceStatus, PaymentRecordStatus
)

logger = logging.getLogger(__name__)


class LedgerService:
    """
    Service for party ledger statements and aging analysis
    
    SECURITY NOTE: All methods expect TenantAwareSession which auto-filters by:
    - org_id: Always (hard tenant boundary)
    - branch_id: Based on user's branch_scope
    """
    
    @staticmethod
    def get_party_statement(
        db: Session,
        party_id: int,
        party_type: str,
        org_id: str,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Get party ledger statement with running balance.
        
        TenantAwareSession auto-filters by org_id on all tables.
        """
        if party_type == PartyType.CUSTOMER.value:
            # Customer statement (TenantAwareSession auto-adds org_id)
            query = """
                WITH all_transactions AS (
                    -- Invoices (Debit)
                    SELECT 
                        i.invoice_id as id,
                        i.invoice_date as date,
                        'Invoice' as type,
                        i.invoice_number as reference,
                        CONCAT('Invoice #', i.invoice_number) as description,
                        i.final_amount as debit,
                        0::numeric as credit,
                        1 as sort_order
                    FROM sales.invoices i
                    WHERE i.customer_id = :party_id
                    AND i.invoice_status != :cancelled
                    AND (:from_date IS NULL OR i.invoice_date >= :from_date)
                    AND (:to_date IS NULL OR i.invoice_date <= :to_date)
                    
                    UNION ALL
                    
                    -- Payments (Credit)
                    SELECT 
                        p.payment_id as id,
                        p.payment_date as date,
                        'Payment' as type,
                        p.payment_number as reference,
                        CONCAT('Payment #', p.payment_number) as description,
                        0::numeric as debit,
                        p.payment_amount as credit,
                        2 as sort_order
                    FROM financial.payments p
                    WHERE p.party_id = :party_id AND p.party_type = :customer_type
                    AND p.payment_status != :cancelled_payment
                    AND (:from_date IS NULL OR p.payment_date >= :from_date)
                    AND (:to_date IS NULL OR p.payment_date <= :to_date)
                )
                SELECT * FROM all_transactions
                ORDER BY date DESC, sort_order
            """
            
            result = db.execute(text(query), {
                "party_id": party_id,
                "from_date": from_date,
                "to_date": to_date,
                "cancelled": InvoiceStatus.CANCELLED.value,
                "cancelled_payment": PaymentRecordStatus.CANCELLED.value,
                "customer_type": PartyType.CUSTOMER.value
            })
            
            transactions = []
            running_balance = Decimal("0")
            
            for row in result:
                trans = dict(row._mapping)
                running_balance = running_balance + Decimal(str(trans['debit'])) - Decimal(str(trans['credit']))
                trans['running_balance'] = float(running_balance)
                trans['balance_type'] = 'Dr' if running_balance > 0 else 'Cr'
                trans['display_balance'] = float(abs(running_balance))
                transactions.append(trans)
            
            return {
                "transactions": transactions,
                "final_balance": float(running_balance),
                "transaction_count": len(transactions)
            }
        else:
            # Supplier statement - only show payments (supplier_invoices table may not exist)
            # TenantAwareSession auto-adds org_id
            query = """
                SELECT 
                    p.payment_id as id,
                    p.payment_date as date,
                    'Payment' as type,
                    p.payment_number as reference,
                    CONCAT('Payment #', p.payment_number) as description,
                    p.payment_amount as debit,
                    0::numeric as credit,
                    1 as sort_order
                FROM financial.payments p
                WHERE p.party_id = :party_id AND p.party_type = :supplier_type
                AND p.payment_status != :cancelled_payment
                AND (:from_date IS NULL OR p.payment_date >= :from_date)
                AND (:to_date IS NULL OR p.payment_date <= :to_date)
                ORDER BY p.payment_date DESC
            """
            
            result = db.execute(text(query), {
                "party_id": party_id,
                "from_date": from_date,
                "to_date": to_date,
                "cancelled_payment": PaymentRecordStatus.CANCELLED.value,
                "supplier_type": PartyType.SUPPLIER.value
            })
            
            transactions = []
            running_balance = Decimal("0")
            
            for row in result:
                trans = dict(row._mapping)
                running_balance = running_balance - Decimal(str(trans['debit']))
                trans['running_balance'] = float(running_balance)
                trans['balance_type'] = 'Dr' if running_balance < 0 else 'Nil'
                trans['display_balance'] = float(abs(running_balance))
                transactions.append(trans)
            
            return {
                "transactions": transactions,
                "final_balance": float(running_balance),
                "transaction_count": len(transactions)
            }
    
    @staticmethod
    def get_party_balance(
        db: Session,
        party_id: int,
        party_type: str,
        org_id: str
    ) -> Dict[str, Any]:
        """
        Get quick balance summary for a party.
        TenantAwareSession auto-filters by org_id.
        """
        if party_type == PartyType.CUSTOMER.value:
            result = db.execute(text("""
                SELECT 
                    COALESCE(SUM(final_amount - COALESCE(paid_amount, 0)), 0) as outstanding,
                    COUNT(*) as invoice_count
                FROM sales.invoices
                WHERE customer_id = :party_id
                AND invoice_status != :cancelled 
                AND payment_status != :paid
            """), {
                "party_id": party_id,
                "cancelled": InvoiceStatus.CANCELLED.value,
                "paid": InvoicePaymentStatus.PAID.value
            }).fetchone()
            
            advance = db.execute(text("""
                SELECT COALESCE(SUM(unallocated_amount), 0)
                FROM financial.payments
                WHERE party_id = :party_id AND party_type = :party_type
                AND payment_status != :cancelled
            """), {
                "party_id": party_id,
                "party_type": PartyType.CUSTOMER.value,
                "cancelled": PaymentRecordStatus.CANCELLED.value
            }).scalar() or 0
            
            return {
                "party_id": party_id,
                "party_type": party_type,
                "outstanding": float(result.outstanding) if result else 0,
                "advance": float(advance),
                "net_balance": float(result.outstanding or 0) - float(advance),
                "pending_invoices": result.invoice_count if result else 0
            }
        else:
            # Supplier invoices table doesn't exist - return zeros
            # Only track payments made to suppliers
            total_paid = db.execute(text("""
                SELECT COALESCE(SUM(payment_amount), 0) as total_paid
                FROM financial.payments
                WHERE party_id = :party_id AND party_type = :party_type
                AND payment_status != :cancelled
            """), {
                "party_id": party_id,
                "party_type": PartyType.SUPPLIER.value,
                "cancelled": PaymentRecordStatus.CANCELLED.value
            }).scalar() or 0
            
            return {
                "party_id": party_id,
                "party_type": party_type,
                "payable": 0,
                "total_paid": float(total_paid),
                "pending_invoices": 0
            }
    
    @staticmethod
    def get_outstanding_bills(
        db: Session,
        party_id: int,
        party_type: str,
        org_id: str
    ) -> Dict[str, Any]:
        """
        Get outstanding bills for a party.
        TenantAwareSession auto-filters by org_id.
        """
        if party_type == PartyType.CUSTOMER.value:
            result = db.execute(text("""
                SELECT 
                    i.invoice_id, i.invoice_number, i.invoice_date, i.due_date,
                    i.final_amount, COALESCE(i.paid_amount, 0) as paid_amount,
                    (i.final_amount - COALESCE(i.paid_amount, 0)) as outstanding_amount,
                    i.payment_status,
                    GREATEST(0, CURRENT_DATE - i.due_date) as days_overdue
                FROM sales.invoices i
                WHERE i.customer_id = :party_id
                AND i.payment_status IN (:unpaid, :partial, :pending)
                AND i.invoice_status != :cancelled
                ORDER BY i.due_date
            """), {
                "party_id": party_id,
                "unpaid": InvoicePaymentStatus.UNPAID.value,
                "partial": InvoicePaymentStatus.PARTIAL.value,
                "pending": "pending",
                "cancelled": InvoiceStatus.CANCELLED.value
            })
            bills = [dict(row._mapping) for row in result]
        else:
            # Supplier invoices table doesn't exist - return empty list
            bills = []
        
        return {
            "party_id": party_id,
            "party_type": party_type,
            "outstanding_bills": bills,
            "total_outstanding": sum(float(b["outstanding_amount"]) for b in bills) if bills else 0,
            "bill_count": len(bills)
        }
    
    @staticmethod
    def get_aging_analysis(
        db: Session,
        party_type: str,
        org_id: str
    ) -> Dict[str, Any]:
        """
        Get aging analysis for all parties.
        TenantAwareSession auto-filters by org_id.
        """
        if party_type == PartyType.CUSTOMER.value:
            result = db.execute(text("""
                SELECT
                    c.customer_id, c.customer_name, c.primary_phone as phone,
                    COUNT(i.invoice_id) as invoice_count,
                    COALESCE(SUM(i.final_amount - COALESCE(i.paid_amount, 0)), 0) as total_outstanding,
                    COALESCE(SUM(CASE WHEN CURRENT_DATE - i.invoice_date <= 30 
                        THEN i.final_amount - COALESCE(i.paid_amount, 0) ELSE 0 END), 0) as current,
                    COALESCE(SUM(CASE WHEN CURRENT_DATE - i.invoice_date BETWEEN 31 AND 60 
                        THEN i.final_amount - COALESCE(i.paid_amount, 0) ELSE 0 END), 0) as days_31_60,
                    COALESCE(SUM(CASE WHEN CURRENT_DATE - i.invoice_date BETWEEN 61 AND 90 
                        THEN i.final_amount - COALESCE(i.paid_amount, 0) ELSE 0 END), 0) as days_61_90,
                    COALESCE(SUM(CASE WHEN CURRENT_DATE - i.invoice_date > 90 
                        THEN i.final_amount - COALESCE(i.paid_amount, 0) ELSE 0 END), 0) as over_90
                FROM sales.invoices i
                JOIN parties.customers c ON i.customer_id = c.customer_id
                WHERE i.payment_status != :paid AND i.invoice_status != :cancelled
                AND i.final_amount > COALESCE(i.paid_amount, 0)
                GROUP BY c.customer_id, c.customer_name, c.primary_phone
                ORDER BY total_outstanding DESC
            """), {
                "paid": InvoicePaymentStatus.PAID.value,
                "cancelled": InvoiceStatus.CANCELLED.value
            })
            aging_data = [dict(row._mapping) for row in result]
            total_key = "total_outstanding"
        else:
            # Supplier invoices table doesn't exist - return empty data
            aging_data = []
            total_key = "total_payable"
        
        return {
            "party_type": party_type,
            "aging_data": aging_data,
            "summary": {
                "total": sum(float(a.get(total_key, 0) or 0) for a in aging_data),
                "current": sum(float(a.get("current", 0) or 0) for a in aging_data),
                "overdue": sum(
                    float(a.get("days_31_60", 0) or 0) + 
                    float(a.get("days_61_90", 0) or 0) + 
                    float(a.get("over_90", 0) or 0) 
                    for a in aging_data
                ),
                "party_count": len(aging_data)
            }
        }
    
    @staticmethod
    def get_ledger_summary(
        db: Session,
        party_type: str,
        org_id: str
    ) -> Dict[str, Any]:
        """
        Get overall ledger summary for all parties.
        TenantAwareSession auto-filters by org_id.
        """
        if party_type == PartyType.CUSTOMER.value:
            result = db.execute(text("""
                SELECT
                    COUNT(DISTINCT c.customer_id) as total_parties,
                    COUNT(DISTINCT CASE WHEN i.payment_status != :paid THEN c.customer_id END) as parties_with_dues,
                    COALESCE(SUM(i.final_amount - COALESCE(i.paid_amount, 0)), 0) as total_receivable,
                    COALESCE(SUM(CASE WHEN i.due_date < CURRENT_DATE 
                        THEN i.final_amount - COALESCE(i.paid_amount, 0) ELSE 0 END), 0) as total_overdue,
                    COUNT(DISTINCT i.invoice_id) as total_pending_invoices
                FROM parties.customers c
                LEFT JOIN sales.invoices i ON c.customer_id = i.customer_id 
                    AND i.invoice_status != :cancelled
                    AND i.payment_status != :paid
                WHERE c.is_active = true
            """), {
                "paid": InvoicePaymentStatus.PAID.value,
                "cancelled": InvoiceStatus.CANCELLED.value
            }).fetchone()
            
            total_receivable = float(result.total_receivable or 0)
            total_overdue = float(result.total_overdue or 0)
            
            return {
                "party_type": party_type,
                "total_parties": result.total_parties or 0,
                "parties_with_dues": result.parties_with_dues or 0,
                "total_receivable": total_receivable,
                "total_overdue": total_overdue,
                "pending_invoices": result.total_pending_invoices or 0,
                "collection_efficiency": round(
                    100 - (total_overdue / total_receivable * 100), 2
                ) if total_receivable > 0 else 100
            }
        else:
            # Supplier invoices table doesn't exist - return basic data from suppliers table only
            result = db.execute(text("""
                SELECT COUNT(*) as total_parties
                FROM parties.suppliers s
                WHERE s.is_active = true
            """)).fetchone()
            
            return {
                "party_type": party_type,
                "total_parties": result.total_parties if result else 0,
                "parties_with_dues": 0,
                "total_payable": 0,
                "total_overdue": 0,
                "pending_invoices": 0
            }
    
    @staticmethod
    def get_top_debtors(
        db: Session,
        org_id: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get top debtors by outstanding amount.
        TenantAwareSession auto-filters by org_id.
        """
        result = db.execute(text("""
            SELECT
                c.customer_id, c.customer_name, c.primary_phone as phone,
                COALESCE(SUM(i.final_amount - COALESCE(i.paid_amount, 0)), 0) as outstanding,
                COUNT(i.invoice_id) as invoice_count,
                MAX(i.invoice_date) as last_invoice_date
            FROM parties.customers c
            JOIN sales.invoices i ON c.customer_id = i.customer_id
            WHERE i.payment_status != :paid 
            AND i.invoice_status != :cancelled
            AND i.final_amount > COALESCE(i.paid_amount, 0)
            GROUP BY c.customer_id, c.customer_name, c.primary_phone
            ORDER BY outstanding DESC
            LIMIT :limit
        """), {
            "paid": InvoicePaymentStatus.PAID.value,
            "cancelled": InvoiceStatus.CANCELLED.value,
            "limit": limit
        })
        
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def calculate_interest_on_overdue(
        db: Session,
        party_id: int,
        party_type: str,
        org_id: str,
        interest_rate: float = 18.0
    ) -> Dict[str, Any]:
        """
        Calculate interest on overdue amounts.
        TenantAwareSession auto-filters by org_id.
        """
        if party_type == PartyType.CUSTOMER.value:
            result = db.execute(text("""
                SELECT 
                    invoice_id, invoice_number, invoice_date, due_date,
                    (final_amount - COALESCE(paid_amount, 0)) as outstanding,
                    GREATEST(0, CURRENT_DATE - due_date) as days_overdue
                FROM sales.invoices
                WHERE customer_id = :party_id
                AND payment_status IN (:unpaid, :partial)
                AND invoice_status != :cancelled
                AND due_date < CURRENT_DATE
                ORDER BY due_date
            """), {
                "party_id": party_id,
                "unpaid": InvoicePaymentStatus.UNPAID.value,
                "partial": InvoicePaymentStatus.PARTIAL.value,
                "cancelled": InvoiceStatus.CANCELLED.value
            })
        else:
            result = db.execute(text("""
                SELECT 
                    invoice_id, invoice_number, invoice_date, due_date,
                    (final_amount - COALESCE(paid_amount, 0)) as outstanding,
                    GREATEST(0, CURRENT_DATE - due_date) as days_overdue
                FROM purchases.supplier_invoices
                WHERE supplier_id = :party_id
                AND payment_status IN (:unpaid, :partial)
                AND invoice_status != :cancelled
                AND due_date < CURRENT_DATE
                ORDER BY due_date
            """), {
                "party_id": party_id,
                "unpaid": InvoicePaymentStatus.UNPAID.value,
                "partial": InvoicePaymentStatus.PARTIAL.value,
                "cancelled": InvoiceStatus.CANCELLED.value
            })
        
        daily_rate = interest_rate / 365 / 100
        overdue_items = []
        total_interest = 0
        
        for row in result:
            outstanding = float(row.outstanding)
            days = row.days_overdue
            interest = outstanding * daily_rate * days
            total_interest += interest
            
            overdue_items.append({
                "invoice_id": row.invoice_id,
                "invoice_number": row.invoice_number,
                "invoice_date": row.invoice_date.isoformat() if row.invoice_date else None,
                "due_date": row.due_date.isoformat() if row.due_date else None,
                "outstanding": outstanding,
                "days_overdue": days,
                "interest_amount": round(interest, 2)
            })
        
        return {
            "party_id": party_id,
            "party_type": party_type,
            "interest_rate_annual": interest_rate,
            "overdue_items": overdue_items,
            "summary": {
                "total_overdue_amount": sum(i["outstanding"] for i in overdue_items),
                "total_interest": round(total_interest, 2),
                "invoice_count": len(overdue_items)
            }
        }
    
    @staticmethod
    def get_customer_details(db: Session, org_id: str, customer_id: int) -> Optional[Dict[str, Any]]:
        """Get customer details for ledger."""
        result = db.execute(text("""
            SELECT customer_name as name, primary_phone, primary_email, credit_limit
            FROM parties.customers WHERE customer_id = :party_id AND org_id = :org_id
        """), {"party_id": customer_id, "org_id": org_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_supplier_details(db: Session, org_id: str, supplier_id: int) -> Optional[Dict[str, Any]]:
        """Get supplier details for ledger."""
        result = db.execute(text("""
            SELECT supplier_name as name, primary_phone, primary_email
            FROM parties.suppliers WHERE supplier_id = :party_id AND org_id = :org_id
        """), {"party_id": supplier_id, "org_id": org_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_last_payment(db: Session, org_id: str, party_id: int, party_type: str) -> Optional[Dict[str, Any]]:
        """Get last payment info for a party."""
        result = db.execute(text("""
            SELECT payment_id, payment_number, payment_date, payment_amount,
                   payment_type, CURRENT_DATE - payment_date as days_since
            FROM financial.payments
            WHERE party_id = :party_id AND party_type = :party_type AND org_id = :org_id
            AND payment_status != :cancelled_status ORDER BY payment_date DESC LIMIT 1
        """), {"party_id": party_id, "party_type": party_type, "org_id": org_id,
               "cancelled_status": PaymentRecordStatus.CANCELLED.value})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_opening_balance_customer(db: Session, org_id: str, party_id: int, as_of_date: date) -> float:
        """Calculate opening balance for customer as of date."""
        result = db.execute(text("""
            SELECT COALESCE(SUM(CASE WHEN type = 'invoice' THEN amount ELSE 0 END), 0) -
                   COALESCE(SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END), 0) as opening_balance
            FROM (
                SELECT 'invoice' as type, final_amount as amount FROM sales.invoices
                WHERE customer_id = :party_id AND org_id = :org_id
                AND invoice_date < :as_of_date AND invoice_status != :cancelled_status
                UNION ALL
                SELECT 'payment' as type, payment_amount as amount FROM financial.payments
                WHERE party_id = :party_id AND party_type = :customer_type AND org_id = :org_id
                AND payment_date < :as_of_date AND payment_status != :cancelled_status
            ) combined
        """), {"party_id": party_id, "org_id": org_id, "as_of_date": as_of_date,
               "cancelled_status": InvoiceStatus.CANCELLED.value, "customer_type": PartyType.CUSTOMER.value})
        row = result.first()
        return float(row.opening_balance) if row else 0
    
    @staticmethod
    def get_opening_balance_supplier(db: Session, org_id: str, party_id: int, as_of_date: date) -> float:
        """Calculate opening balance for supplier as of date."""
        result = db.execute(text("""
            SELECT COALESCE(SUM(CASE WHEN type = 'invoice' THEN amount ELSE 0 END), 0) -
                   COALESCE(SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END), 0) as opening_balance
            FROM (
                SELECT 'invoice' as type, final_amount as amount FROM purchases.supplier_invoices
                WHERE supplier_id = :party_id AND org_id = :org_id
                AND invoice_date < :as_of_date AND invoice_status != :cancelled_status
                UNION ALL
                SELECT 'payment' as type, payment_amount as amount FROM financial.payments
                WHERE party_id = :party_id AND party_type = :supplier_type AND org_id = :org_id
                AND payment_date < :as_of_date AND payment_status != :cancelled_status
            ) combined
        """), {"party_id": party_id, "org_id": org_id, "as_of_date": as_of_date,
               "cancelled_status": InvoiceStatus.CANCELLED.value, "supplier_type": PartyType.SUPPLIER.value})
        row = result.first()
        return float(row.opening_balance) if row else 0

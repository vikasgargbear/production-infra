"""
Customer service layer for business logic
Handles GST validation, credit management, and ledger calculations
"""
from __future__ import annotations

from typing import Optional, Dict, Any, List
from datetime import datetime, date, timedelta
from decimal import Decimal
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

from ..schemas_v2.customer import (
    CustomerLedgerEntry, CustomerLedgerResponse, OutstandingInvoice,
    CustomerOutstandingResponse, PaymentRecord,
    PaymentResponse
)

logger = logging.getLogger(__name__)


class CustomerService:
    """Service class for customer-related business logic"""
    
    @staticmethod
    def generate_customer_code(db: Session, customer_name: str) -> str:
        """Generate unique customer code"""
        # Get first 3 letters of customer name
        prefix = ''.join(filter(str.isalpha, customer_name.upper()))[:3]
        if not prefix:
            prefix = "CUS"
        
        # Get the next sequence number
        result = db.execute(text("""
            SELECT COUNT(*) + 1 as next_num
            FROM customers
            WHERE customer_code LIKE :prefix || '%'
        """), {"prefix": prefix})
        
        next_num = result.scalar() or 1
        return f"{prefix}{next_num:04d}"
    
    @staticmethod
    def validate_credit_limit(db: Session, customer_id: int, order_amount: Decimal, org_id: "UUID" = None) -> Dict[str, Any]:
        """Check if customer has sufficient credit limit"""
        # Get customer details with outstanding
        if org_id:
            result = db.execute(text("""
                SELECT 
                    c.credit_limit,
                    c.credit_days,
                    COALESCE(SUM(o.final_amount - o.paid_amount), 0) as outstanding
                FROM customers c
                LEFT JOIN orders o ON c.customer_id = o.customer_id
                    AND o.order_status NOT IN ('cancelled', 'draft')
                    AND o.org_id = c.org_id
                WHERE c.customer_id = :customer_id AND c.org_id = :org_id
                GROUP BY c.customer_id, c.credit_limit, c.credit_days
            """), {"customer_id": customer_id, "org_id": org_id})
        else:
            result = db.execute(text("""
                SELECT 
                    c.credit_limit,
                    c.credit_days,
                    COALESCE(SUM(o.final_amount - o.paid_amount), 0) as outstanding
                FROM customers c
                LEFT JOIN orders o ON c.customer_id = o.customer_id
                    AND o.order_status NOT IN ('cancelled', 'draft')
                WHERE c.customer_id = :customer_id
                GROUP BY c.customer_id, c.credit_limit, c.credit_days
            """), {"customer_id": customer_id})
        
        row = result.fetchone()
        if not row:
            return {"valid": False, "message": "Customer not found"}
        
        credit_limit = row.credit_limit
        outstanding = row.outstanding
        available_credit = credit_limit - outstanding
        
        if order_amount > available_credit:
            return {
                "valid": False,
                "message": f"Insufficient credit limit. Available: ₹{available_credit:.2f}",
                "credit_limit": credit_limit,
                "outstanding": outstanding,
                "available": available_credit
            }
        
        return {
            "valid": True,
            "credit_limit": credit_limit,
            "outstanding": outstanding,
            "available": available_credit
        }
    
    @staticmethod
    def get_customer_statistics(db: Session, customer_id: int) -> Dict[str, Any]:
        """Get customer business statistics"""
        # Total business
        business_result = db.execute(text("""
            SELECT 
                COUNT(*) as total_orders,
                COALESCE(SUM(final_amount), 0) as total_business,
                MAX(order_date) as last_order_date
            FROM orders
            WHERE customer_id = :customer_id
                AND order_status NOT IN ('cancelled', 'draft')
        """), {"customer_id": customer_id})
        
        business = business_result.fetchone()
        
        # Outstanding amount
        outstanding_result = db.execute(text("""
            SELECT COALESCE(SUM(final_amount - paid_amount), 0) as outstanding
            FROM orders
            WHERE customer_id = :customer_id
                AND order_status NOT IN ('cancelled', 'draft')
                AND paid_amount < final_amount
        """), {"customer_id": customer_id})
        
        outstanding = outstanding_result.scalar() or Decimal("0.00")
        
        return {
            "total_orders": business.total_orders or 0,
            "total_business": business.total_business or Decimal("0.00"),
            "last_order_date": business.last_order_date,
            "outstanding_amount": outstanding
        }
    
    @staticmethod
    def get_customers_statistics_batch(db: Session, customer_ids: List[int]) -> Dict[int, Dict[str, Any]]:
        """Get customer business statistics for multiple customers in one query"""
        if not customer_ids:
            return {}
        
        # Get all statistics in one query
        result = db.execute(text("""
            SELECT 
                c.customer_id,
                COUNT(DISTINCT o.order_id) as total_orders,
                COALESCE(SUM(o.final_amount), 0) as total_business,
                MAX(o.order_date) as last_order_date,
                COALESCE(SUM(CASE 
                    WHEN o.order_status NOT IN ('cancelled', 'draft') 
                    AND o.paid_amount < o.final_amount 
                    THEN o.final_amount - o.paid_amount 
                    ELSE 0 
                END), 0) as outstanding_amount
            FROM customers c
            LEFT JOIN orders o ON c.customer_id = o.customer_id 
                AND o.order_status NOT IN ('cancelled', 'draft')
            WHERE c.customer_id = ANY(:customer_ids)
            GROUP BY c.customer_id
        """), {"customer_ids": customer_ids})
        
        stats_by_customer = {}
        for row in result:
            stats_by_customer[row.customer_id] = {
                "total_orders": row.total_orders or 0,
                "total_business": row.total_business or Decimal("0.00"),
                "last_order_date": row.last_order_date,
                "outstanding_amount": row.outstanding_amount or Decimal("0.00")
            }
        
        # Fill in missing customers with default values
        for customer_id in customer_ids:
            if customer_id not in stats_by_customer:
                stats_by_customer[customer_id] = {
                    "total_orders": 0,
                    "total_business": Decimal("0.00"),
                    "last_order_date": None,
                    "outstanding_amount": Decimal("0.00")
                }
        
        return stats_by_customer
    
    @staticmethod
    def get_customer_ledger(
        db: Session, 
        customer_id: int,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None
    ) -> CustomerLedgerResponse:
        """Get customer ledger with all transactions"""
        # Set date range
        if not from_date:
            from_date = date.today() - timedelta(days=365)
        if not to_date:
            to_date = date.today()
        
        # Get customer details
        customer = db.execute(text("""
            SELECT customer_id, customer_name FROM customers WHERE customer_id = :id
        """), {"id": customer_id}).fetchone()
        
        if not customer:
            raise ValueError(f"Customer {customer_id} not found")
        
        # Get opening balance (before from_date)
        opening_result = db.execute(text("""
            SELECT 
                COALESCE(SUM(CASE 
                    WHEN t.type = 'invoice' THEN t.amount
                    WHEN t.type = 'payment' THEN -t.amount
                    WHEN t.type = 'credit_note' THEN -t.amount
                    WHEN t.type = 'debit_note' THEN t.amount
                END), 0) as opening_balance
            FROM (
                -- Invoices
                SELECT 
                    'invoice' as type,
                    order_date as date,
                    final_amount as amount
                FROM orders
                WHERE customer_id = :customer_id
                    AND order_date < :from_date
                    AND order_status NOT IN ('cancelled', 'draft')
                
                UNION ALL
                
                -- Payments
                SELECT 
                    'payment' as type,
                    payment_date as date,
                    amount
                FROM payments
                WHERE customer_id = :customer_id
                    AND payment_date < :from_date
            ) t
        """), {
            "customer_id": customer_id,
            "from_date": from_date
        })
        
        opening_balance = opening_result.scalar() or Decimal("0.00")
        
        # Get transactions in date range
        transactions_result = db.execute(text("""
            SELECT * FROM (
                -- Invoices
                SELECT 
                    'invoice' as transaction_type,
                    order_date as transaction_date,
                    order_number as reference_number,
                    'Sales Invoice' as description,
                    final_amount as debit_amount,
                    0 as credit_amount
                FROM orders
                WHERE customer_id = :customer_id
                    AND order_date BETWEEN :from_date AND :to_date
                    AND order_status NOT IN ('cancelled', 'draft')
                
                UNION ALL
                
                -- Payments
                SELECT 
                    'payment' as transaction_type,
                    payment_date as transaction_date,
                    payment_reference as reference_number,
                    'Payment Received' as description,
                    0 as debit_amount,
                    amount as credit_amount
                FROM payments
                WHERE customer_id = :customer_id
                    AND payment_date BETWEEN :from_date AND :to_date
            ) t
            ORDER BY transaction_date, transaction_type
        """), {
            "customer_id": customer_id,
            "from_date": from_date,
            "to_date": to_date
        })
        
        # Build ledger entries with running balance
        entries = []
        running_balance = opening_balance
        total_debit = Decimal("0.00")
        total_credit = Decimal("0.00")
        
        for row in transactions_result:
            debit = Decimal(str(row.debit_amount))
            credit = Decimal(str(row.credit_amount))
            running_balance += debit - credit
            total_debit += debit
            total_credit += credit
            
            entries.append(CustomerLedgerEntry(
                transaction_date=row.transaction_date,
                transaction_type=row.transaction_type,
                reference_number=row.reference_number,
                description=row.description,
                debit_amount=debit,
                credit_amount=credit,
                running_balance=running_balance
            ))
        
        return CustomerLedgerResponse(
            customer_id=customer.customer_id,
            customer_name=customer.customer_name,
            opening_balance=opening_balance,
            total_debit=total_debit,
            total_credit=total_credit,
            closing_balance=running_balance,
            entries=entries
        )
    
    @staticmethod
    def get_outstanding_invoices(db: Session, customer_id: int) -> CustomerOutstandingResponse:
        """Get all outstanding invoices for a customer"""
        # Get customer details
        customer_result = db.execute(text("""
            SELECT 
                customer_id,
                customer_name,
                credit_limit,
                credit_days
            FROM customers
            WHERE customer_id = :customer_id
        """), {"customer_id": customer_id})
        
        customer = customer_result.fetchone()
        if not customer:
            raise ValueError(f"Customer {customer_id} not found")
        
        # Get outstanding invoices
        invoices_result = db.execute(text("""
            SELECT 
                order_id,
                order_number,
                order_date,
                final_amount as invoice_amount,
                paid_amount,
                final_amount - paid_amount as outstanding_amount,
                CURRENT_DATE - order_date as days_since_invoice
            FROM orders
            WHERE customer_id = :customer_id
                AND order_status NOT IN ('cancelled', 'draft')
                AND paid_amount < final_amount
            ORDER BY order_date
        """), {"customer_id": customer_id})
        
        invoices = []
        total_outstanding = Decimal("0.00")
        overdue_amount = Decimal("0.00")
        
        for row in invoices_result:
            days_overdue = max(0, row.days_since_invoice - customer.credit_days)
            outstanding = Decimal(str(row.outstanding_amount))
            
            invoices.append(OutstandingInvoice(
                order_id=row.order_id,
                order_number=row.order_number,
                order_date=row.order_date,
                invoice_amount=Decimal(str(row.invoice_amount)),
                paid_amount=Decimal(str(row.paid_amount)),
                outstanding_amount=outstanding,
                days_overdue=days_overdue
            ))
            
            total_outstanding += outstanding
            if days_overdue > 0:
                overdue_amount += outstanding
        
        return CustomerOutstandingResponse(
            customer_id=customer.customer_id,
            customer_name=customer.customer_name,
            credit_limit=Decimal(str(customer.credit_limit)),
            credit_days=customer.credit_days,
            total_outstanding=total_outstanding,
            available_credit=Decimal(str(customer.credit_limit)) - total_outstanding,
            overdue_amount=overdue_amount,
            invoices=invoices
        )
    
    @staticmethod
    def record_payment(db: Session, payment_data: PaymentRecord) -> PaymentResponse:
        """Record customer payment and allocate to invoices"""
        # Generate payment reference if not provided
        if not payment_data.reference_number:
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            payment_data.reference_number = f"PAY{timestamp}"
        
        # Create payment record
        db.execute(text("""
            INSERT INTO payments (
                customer_id, payment_date, amount, payment_mode,
                payment_reference, notes, created_at, updated_at
            ) VALUES (
                :customer_id, :payment_date, :amount, :payment_mode,
                :reference, :notes, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """), {
            "customer_id": payment_data.customer_id,
            "payment_date": payment_data.payment_date,
            "amount": payment_data.amount,
            "payment_mode": payment_data.payment_mode,
            "reference": payment_data.reference_number,
            "notes": payment_data.notes
        })
        
        # Get the created payment ID
        payment_id = db.execute(text("""
            SELECT payment_id FROM payments 
            WHERE payment_reference = :ref
            ORDER BY created_at DESC LIMIT 1
        """), {"ref": payment_data.reference_number}).scalar()
        
        allocated_amount = Decimal("0.00")
        remaining_amount = payment_data.amount
        
        # Auto-allocate to oldest invoices if not specified
        if not payment_data.allocate_to_invoices:
            # Get outstanding invoices in FIFO order
            outstanding = db.execute(text("""
                SELECT order_id, final_amount - paid_amount as outstanding
                FROM orders
                WHERE customer_id = :customer_id
                    AND order_status NOT IN ('cancelled', 'draft')
                    AND paid_amount < final_amount
                ORDER BY order_date
            """), {"customer_id": payment_data.customer_id})
            
            for invoice in outstanding:
                if remaining_amount <= 0:
                    break
                
                allocation = min(remaining_amount, Decimal(str(invoice.outstanding)))
                
                # Update order paid amount
                db.execute(text("""
                    UPDATE orders
                    SET paid_amount = paid_amount + :amount,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE order_id = :order_id
                """), {
                    "amount": allocation,
                    "order_id": invoice.order_id
                })
                
                allocated_amount += allocation
                remaining_amount -= allocation
        else:
            # Allocate to specific invoices
            for order_id in payment_data.allocate_to_invoices:
                if remaining_amount <= 0:
                    break
                
                # Get outstanding amount for this invoice
                outstanding = db.execute(text("""
                    SELECT final_amount - paid_amount as outstanding
                    FROM orders
                    WHERE order_id = :order_id AND customer_id = :customer_id
                """), {
                    "order_id": order_id,
                    "customer_id": payment_data.customer_id
                }).scalar()
                
                if outstanding and outstanding > 0:
                    allocation = min(remaining_amount, Decimal(str(outstanding)))
                    
                    # Update order paid amount
                    db.execute(text("""
                        UPDATE orders
                        SET paid_amount = paid_amount + :amount,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE order_id = :order_id
                    """), {
                        "amount": allocation,
                        "order_id": order_id
                    })
                    
                    allocated_amount += allocation
                    remaining_amount -= allocation
        
        db.commit()
        
        return PaymentResponse(
            payment_id=payment_id,
            customer_id=payment_data.customer_id,
            payment_date=payment_data.payment_date,
            amount=payment_data.amount,
            payment_mode=payment_data.payment_mode,
            reference_number=payment_data.reference_number,
            allocated_amount=allocated_amount,
            unallocated_amount=remaining_amount,
            created_at=datetime.now()
        )
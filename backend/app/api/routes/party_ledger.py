"""
Party Ledger API Router - Fixed version using actual tables
Comprehensive ledger management for customers and suppliers
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import datetime, date, timedelta
from decimal import Decimal

from ...database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/party-ledger", tags=["party-ledger"])

@router.get("/balance/{party_id}")
async def get_party_balance(
    party_id: str,
    party_type: str = Query(..., regex="^(customer|supplier)$"),
    as_of_date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get current balance for a party
    """
    try:
        if party_type == "customer":
            # Get customer balance from invoices and payments
            query = """
                WITH ledger AS (
                    -- Invoices (Debit)
                    SELECT 
                        invoice_date as transaction_date,
                        total_amount as debit_amount,
                        0 as credit_amount
                    FROM invoices
                    WHERE customer_id = :party_id
                    AND status != 'cancelled'
                    
                    UNION ALL
                    
                    -- Payments (Credit)
                    SELECT 
                        payment_date as transaction_date,
                        0 as debit_amount,
                        amount as credit_amount
                    FROM payments
                    WHERE customer_id = :party_id
                    AND payment_status = 'completed'
                    
                    UNION ALL
                    
                    -- Returns (Credit)
                    SELECT 
                        return_date as transaction_date,
                        0 as debit_amount,
                        return_amount as credit_amount
                    FROM returns
                    WHERE customer_id = :party_id
                    AND return_status = 'approved'
                )
                SELECT 
                    COALESCE(SUM(debit_amount - credit_amount), 0) as balance,
                    COUNT(*) as transaction_count,
                    MAX(transaction_date) as last_transaction_date
                FROM ledger
            """
        else:  # supplier
            query = """
                WITH ledger AS (
                    -- Purchases (Credit)
                    SELECT 
                        purchase_date as transaction_date,
                        0 as debit_amount,
                        total_amount as credit_amount
                    FROM purchases
                    WHERE supplier_id = :party_id
                    AND status != 'cancelled'
                    
                    UNION ALL
                    
                    -- Supplier Payments (Debit)
                    SELECT 
                        payment_date as transaction_date,
                        amount as debit_amount,
                        0 as credit_amount
                    FROM payments
                    WHERE supplier_id = :party_id
                    AND payment_status = 'completed'
                )
                SELECT 
                    COALESCE(SUM(debit_amount - credit_amount), 0) as balance,
                    COUNT(*) as transaction_count,
                    MAX(transaction_date) as last_transaction_date
                FROM ledger
            """
            
        params = {"party_id": int(party_id)}
        
        if as_of_date:
            query = query.replace("FROM ledger", f"FROM ledger WHERE transaction_date <= '{as_of_date}'")
            
        result = db.execute(text(query), params).fetchone()
        
        balance = float(result.balance) if result else 0
        
        return {
            "party_id": party_id,
            "party_type": party_type,
            "balance": abs(balance),
            "balance_type": "Dr" if balance >= 0 else "Cr",
            "transaction_count": result.transaction_count if result else 0,
            "last_transaction_date": result.last_transaction_date if result else None,
            "as_of_date": as_of_date or date.today().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error fetching party balance: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/statement/{party_id}")
async def get_party_statement(
    party_id: str,
    party_type: str = Query(..., regex="^(customer|supplier)$"),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    """
    Get detailed statement for a party
    """
    try:
        if party_type == "customer":
            # Build customer ledger from invoices, payments, and returns
            query = """
                WITH ledger_entries AS (
                    -- Invoices
                    SELECT 
                        invoice_id as ledger_id,
                        invoice_date as date,
                        'Invoice' as transaction_type,
                        'INV' as reference_type,
                        invoice_number as reference,
                        CONCAT('Invoice ', invoice_number) as description,
                        total_amount as debit,
                        0 as credit,
                        'cash' as payment_mode
                    FROM invoices
                    WHERE customer_id = :party_id
                    AND status != 'cancelled'
                    
                    UNION ALL
                    
                    -- Payments
                    SELECT 
                        payment_id as ledger_id,
                        payment_date as date,
                        'Payment' as transaction_type,
                        'PAY' as reference_type,
                        payment_number as reference,
                        COALESCE(notes, 'Payment Received') as description,
                        0 as debit,
                        amount as credit,
                        payment_mode
                    FROM payments
                    WHERE customer_id = :party_id
                    AND payment_status = 'completed'
                    
                    UNION ALL
                    
                    -- Returns
                    SELECT 
                        return_id as ledger_id,
                        return_date as date,
                        'Return' as transaction_type,
                        'RET' as reference_type,
                        return_number as reference,
                        CONCAT('Return ', return_number) as description,
                        0 as debit,
                        return_amount as credit,
                        'cash' as payment_mode
                    FROM returns
                    WHERE customer_id = :party_id
                    AND return_status = 'approved'
                )
                SELECT * FROM ledger_entries
            """
            
            # Get party details
            party_query = "SELECT customer_name as name, phone, email FROM customers WHERE customer_id = :party_id"
            
        else:  # supplier
            query = """
                WITH ledger_entries AS (
                    -- Purchases
                    SELECT 
                        purchase_id as ledger_id,
                        purchase_date as date,
                        'Purchase' as transaction_type,
                        'PUR' as reference_type,
                        purchase_number as reference,
                        CONCAT('Purchase ', purchase_number) as description,
                        0 as debit,
                        total_amount as credit,
                        'cash' as payment_mode
                    FROM purchases
                    WHERE supplier_id = :party_id
                    AND status != 'cancelled'
                    
                    UNION ALL
                    
                    -- Supplier Payments
                    SELECT 
                        payment_id as ledger_id,
                        payment_date as date,
                        'Payment' as transaction_type,
                        'PAY' as reference_type,
                        payment_number as reference,
                        COALESCE(notes, 'Payment Made') as description,
                        amount as debit,
                        0 as credit,
                        payment_mode
                    FROM payments
                    WHERE supplier_id = :party_id
                    AND payment_status = 'completed'
                )
                SELECT * FROM ledger_entries
            """
            
            # Get party details
            party_query = "SELECT supplier_name as name, phone, email FROM suppliers WHERE supplier_id = :party_id"
        
        params = {"party_id": int(party_id)}
        
        # Add date filters
        date_conditions = []
        if from_date:
            date_conditions.append(f"date >= '{from_date}'")
        if to_date:
            date_conditions.append(f"date <= '{to_date}'")
            
        if date_conditions:
            query += " WHERE " + " AND ".join(date_conditions)
            
        # Order and pagination
        query += " ORDER BY date DESC, ledger_id DESC LIMIT :limit OFFSET :skip"
        params["limit"] = limit
        params["skip"] = skip
        
        # Get transactions
        transactions = db.execute(text(query), params).fetchall()
        
        # Get party details
        party = db.execute(text(party_query), {"party_id": int(party_id)}).fetchone()
        
        # Calculate running balance
        statement_entries = []
        running_balance = 0
        
        # Process transactions in chronological order for balance calculation
        for txn in reversed(list(transactions)):
            running_balance += float(txn.debit) - float(txn.credit)
            
            statement_entries.append({
                "ledger_id": txn.ledger_id,
                "date": txn.date.isoformat() if hasattr(txn.date, 'isoformat') else str(txn.date),
                "transaction_type": txn.transaction_type,
                "reference": txn.reference,
                "description": txn.description,
                "debit": float(txn.debit) if txn.debit > 0 else None,
                "credit": float(txn.credit) if txn.credit > 0 else None,
                "balance": abs(running_balance),
                "balance_type": "Dr" if running_balance >= 0 else "Cr",
                "payment_mode": txn.payment_mode
            })
            
        # Reverse to show latest first
        statement_entries.reverse()
        
        # Calculate totals
        total_debit = sum(float(txn.debit) for txn in transactions)
        total_credit = sum(float(txn.credit) for txn in transactions)
        
        return {
            "party_id": party_id,
            "party_name": party.name if party else "Unknown",
            "party_type": party_type,
            "phone": party.phone if party else None,
            "email": party.email if party else None,
            "from_date": from_date,
            "to_date": to_date,
            "opening_balance": 0,  # Would need historical calculation
            "opening_balance_type": "Dr",
            "closing_balance": abs(running_balance),
            "closing_balance_type": "Dr" if running_balance >= 0 else "Cr",
            "total_debit": total_debit,
            "total_credit": total_credit,
            "transactions": statement_entries,
            "total_transactions": len(statement_entries)
        }
        
    except Exception as e:
        logger.error(f"Error fetching party statement: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/outstanding-bills/{party_id}")
async def get_outstanding_bills(
    party_id: str,
    party_type: str = Query(..., regex="^(customer|supplier)$"),
    status: Optional[str] = Query(None, regex="^(outstanding|partial|overdue|paid)$"),
    db: Session = Depends(get_db)
):
    """
    Get outstanding bills for a party
    """
    try:
        if party_type == "customer":
            # Get outstanding invoices
            query = """
                SELECT 
                    i.invoice_id as bill_id,
                    'Invoice' as bill_type,
                    i.invoice_number as bill_number,
                    i.invoice_date as bill_date,
                    i.due_date,
                    i.total_amount as bill_amount,
                    COALESCE(SUM(p.amount), 0) as paid_amount,
                    i.total_amount - COALESCE(SUM(p.amount), 0) as outstanding_amount,
                    CASE 
                        WHEN i.total_amount - COALESCE(SUM(p.amount), 0) <= 0 THEN 'paid'
                        WHEN COALESCE(SUM(p.amount), 0) > 0 THEN 'partial'
                        WHEN i.due_date < CURRENT_DATE THEN 'overdue'
                        ELSE 'outstanding'
                    END as status,
                    CASE 
                        WHEN i.due_date < CURRENT_DATE THEN CURRENT_DATE - i.due_date
                        ELSE 0
                    END as days_overdue
                FROM invoices i
                LEFT JOIN payments p ON i.customer_id = p.customer_id 
                    AND p.reference_number = i.invoice_number
                    AND p.payment_status = 'completed'
                WHERE i.customer_id = :party_id
                AND i.status != 'cancelled'
                GROUP BY i.invoice_id
                HAVING i.total_amount - COALESCE(SUM(p.amount), 0) > 0
            """
        else:  # supplier
            query = """
                SELECT 
                    p.purchase_id as bill_id,
                    'Purchase' as bill_type,
                    p.purchase_number as bill_number,
                    p.purchase_date as bill_date,
                    p.purchase_date + INTERVAL '30 days' as due_date,
                    p.total_amount as bill_amount,
                    COALESCE(SUM(pay.amount), 0) as paid_amount,
                    p.total_amount - COALESCE(SUM(pay.amount), 0) as outstanding_amount,
                    CASE 
                        WHEN p.total_amount - COALESCE(SUM(pay.amount), 0) <= 0 THEN 'paid'
                        WHEN COALESCE(SUM(pay.amount), 0) > 0 THEN 'partial'
                        WHEN p.purchase_date + INTERVAL '30 days' < CURRENT_DATE THEN 'overdue'
                        ELSE 'outstanding'
                    END as status,
                    CASE 
                        WHEN p.purchase_date + INTERVAL '30 days' < CURRENT_DATE 
                        THEN EXTRACT(DAY FROM CURRENT_DATE - (p.purchase_date + INTERVAL '30 days'))
                        ELSE 0
                    END as days_overdue
                FROM purchases p
                LEFT JOIN payments pay ON p.supplier_id = pay.supplier_id 
                    AND pay.reference_number = p.purchase_number
                    AND pay.payment_status = 'completed'
                WHERE p.supplier_id = :party_id
                AND p.status != 'cancelled'
                GROUP BY p.purchase_id
                HAVING p.total_amount - COALESCE(SUM(pay.amount), 0) > 0
            """
            
        params = {"party_id": int(party_id)}
        
        if status:
            query = f"SELECT * FROM ({query}) AS bills WHERE status = :status"
            params["status"] = status
            
        query += " ORDER BY due_date, bill_date"
        
        bills = db.execute(text(query), params).fetchall()
        
        # Calculate summary
        summary = {
            "total_bills": len(bills),
            "total_outstanding": sum(float(bill.outstanding_amount) for bill in bills),
            "overdue_amount": sum(float(bill.outstanding_amount) for bill in bills if bill.days_overdue > 0),
            "current_amount": sum(float(bill.outstanding_amount) for bill in bills if bill.days_overdue <= 0)
        }
        
        # Format bills
        bills_data = []
        for bill in bills:
            bills_data.append({
                "bill_id": bill.bill_id,
                "bill_type": bill.bill_type,
                "bill_number": bill.bill_number,
                "bill_date": bill.bill_date.isoformat() if hasattr(bill.bill_date, 'isoformat') else str(bill.bill_date),
                "due_date": bill.due_date.isoformat() if hasattr(bill.due_date, 'isoformat') else str(bill.due_date),
                "bill_amount": float(bill.bill_amount),
                "paid_amount": float(bill.paid_amount),
                "outstanding_amount": float(bill.outstanding_amount),
                "status": bill.status,
                "days_overdue": int(bill.days_overdue),
                "aging_bucket": "Current" if bill.days_overdue <= 0 else 
                               "1-30 days" if bill.days_overdue <= 30 else 
                               "31-60 days" if bill.days_overdue <= 60 else 
                               "61-90 days" if bill.days_overdue <= 90 else 
                               "90+ days"
            })
            
        return {
            "party_id": party_id,
            "party_type": party_type,
            "summary": summary,
            "outstanding_bills": bills_data
        }
        
    except Exception as e:
        logger.error(f"Error fetching outstanding bills: {e}")
        raise HTTPException(status_code=500, detail=str(e))
"""
Party Ledger API Router - Fixed version with correct column names
Comprehensive ledger management for customers and suppliers
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import datetime, date, timedelta
from decimal import Decimal

from ...core.database import get_db
from ...core.auth_utils import get_org_id_from_header

logger = logging.getLogger(__name__)

router = APIRouter(tags=["party-ledger"])

@router.get("/balance/{party_id}")
async def get_party_balance(
    party_id: str,
    party_type: str = Query(..., pattern="^(customer|supplier)$"),
    as_of_date: Optional[str] = None,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get current balance for a party
    """
    try:
        if party_type == "customer":
            # Get customer balance from sales.invoices and payments
            query = """
                WITH ledger AS (
                    -- Invoices (Debit)
                    SELECT 
                        invoice_date as transaction_date,
                        final_amount as debit_amount,
                        0 as credit_amount
                    FROM sales.invoices
                    WHERE customer_id = :party_id
                    AND invoice_status != 'cancelled'
                    
                    UNION ALL
                    
                    -- Payments (Credit) - check if financial.payments exists
                    SELECT 
                        payment_date as transaction_date,
                        0 as debit_amount,
                        payment_amount as credit_amount
                    FROM financial.payments
                    WHERE party_id = :party_id AND party_type = 'customer'
                    AND payment_status != 'cancelled'
                    
                    UNION ALL
                    
                    -- Returns (Credit) - check if sales.sales_returns exists
                    SELECT 
                        return_date as transaction_date,
                        0 as debit_amount,
                        total_amount as credit_amount
                    FROM sales.sales_returns
                    WHERE customer_id = :party_id
                    AND approval_status = 'approved'
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
                        order_date as transaction_date,
                        0 as debit_amount,
                        total_amount as credit_amount
                    FROM procurement.purchase_orders
                    WHERE supplier_id = :party_id
                    AND status != 'cancelled'
                    
                    UNION ALL
                    
                    -- Supplier Payments (Debit)
                    SELECT 
                        payment_date as transaction_date,
                        payment_amount as debit_amount,
                        0 as credit_amount
                    FROM financial.payments
                    WHERE party_id = :party_id AND party_type = 'supplier'
                    AND payment_status != 'cancelled'
                )
                SELECT 
                    COALESCE(SUM(credit_amount - debit_amount), 0) as balance,
                    COUNT(*) as transaction_count,
                    MAX(transaction_date) as last_transaction_date
                FROM ledger
            """
        
        params = {"party_id": int(party_id)}
        
        if as_of_date:
            # Add date filter to both queries
            query = query.replace("FROM ledger", f"FROM ledger WHERE transaction_date <= '{as_of_date}'")
        
        result = db.execute(text(query), params).fetchone()
        
        return {
            "party_id": party_id,
            "party_type": party_type,
            "balance": float(result.balance) if result else 0,
            "transaction_count": result.transaction_count if result else 0,
            "last_transaction_date": result.last_transaction_date.isoformat() if result and result.last_transaction_date else None,
            "as_of_date": as_of_date
        }
        
    except Exception as e:
        logger.error(f"Error fetching party balance: {e}")
        # Return zero balance if error (likely missing tables)
        return {
            "party_id": party_id,
            "party_type": party_type,
            "balance": 0,
            "transaction_count": 0,
            "last_transaction_date": None,
            "as_of_date": as_of_date,
            "error": str(e)
        }

@router.get("/statement/{party_id}")
async def get_party_statement(
    party_id: str,
    party_type: str = Query(..., pattern="^(customer|supplier)$"),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get detailed statement for a party
    """
    try:
        if party_type == "customer":
            # Build customer ledger from sales.invoices and other tables
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
                        final_amount as debit,
                        0 as credit,
                        payment_status as status
                    FROM sales.invoices
                    WHERE customer_id = :party_id
                    AND invoice_status != 'cancelled'
                )
                SELECT * FROM ledger_entries
            """
            
            # Try to add payments if table exists
            try:
                payment_check = db.execute(text("SELECT 1 FROM financial.payments LIMIT 1"))
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
                            final_amount as debit,
                            0 as credit,
                            payment_status as status
                        FROM sales.invoices
                        WHERE customer_id = :party_id
                        AND invoice_status != 'cancelled'
                        
                        UNION ALL
                        
                        -- Payments
                        SELECT 
                            payment_id as ledger_id,
                            payment_date as date,
                            'Payment' as transaction_type,
                            'PAY' as reference_type,
                            payment_number as reference,
                            COALESCE(narration, 'Payment Received') as description,
                            0 as debit,
                            payment_amount as credit,
                            payment_status as status
                        FROM financial.payments
                        WHERE party_id = :party_id AND party_type = 'customer'
                        AND payment_status != 'cancelled'
                    )
                    SELECT * FROM ledger_entries
                """
            except:
                logger.info("financial.payments table not found, using invoices only")
            
            # Get party details
            party_query = "SELECT customer_name as name, phone_primary as phone, email FROM parties.customers WHERE customer_id = :party_id"
            
        else:  # supplier
            query = """
                WITH ledger_entries AS (
                    -- Purchases
                    SELECT 
                        purchase_order_id as ledger_id,
                        order_date as date,
                        'Purchase' as transaction_type,
                        'PUR' as reference_type,
                        order_number as reference,
                        CONCAT('Purchase ', order_number) as description,
                        0 as debit,
                        total_amount as credit,
                        status
                    FROM procurement.purchase_orders
                    WHERE supplier_id = :party_id
                    AND status != 'cancelled'
                )
                SELECT * FROM ledger_entries
            """
            
            # Try to add supplier payments if table exists
            try:
                payment_check = db.execute(text("SELECT 1 FROM financial.payments LIMIT 1"))
                query = """
                    WITH ledger_entries AS (
                        -- Purchases
                        SELECT 
                            purchase_order_id as ledger_id,
                            order_date as date,
                            'Purchase' as transaction_type,
                            'PUR' as reference_type,
                            order_number as reference,
                            CONCAT('Purchase ', order_number) as description,
                            0 as debit,
                            total_amount as credit,
                            status
                        FROM procurement.purchase_orders
                        WHERE supplier_id = :party_id
                        AND status != 'cancelled'
                        
                        UNION ALL
                        
                        -- Supplier Payments
                        SELECT 
                            payment_id as ledger_id,
                            payment_date as date,
                            'Payment' as transaction_type,
                            'PAY' as reference_type,
                            reference_number as reference,
                            COALESCE(narration, 'Payment Made') as description,
                            amount as debit,
                            0 as credit,
                            status
                        FROM financial.payments
                        WHERE party_id = :party_id AND party_type = 'supplier'
                        AND status = 'completed'
                    )
                    SELECT * FROM ledger_entries
                """
            except:
                logger.info("financial.payments table not found, using purchase orders only")
            
            # Get party details
            party_query = "SELECT supplier_name as name, phone_primary as phone, email FROM parties.suppliers WHERE supplier_id = :party_id"
        
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
        try:
            party = db.execute(text(party_query), {"party_id": int(party_id)}).fetchone()
        except:
            party = None
            logger.info(f"Could not fetch party details for {party_type} {party_id}")
        
        # Calculate running balance
        statement_entries = []
        running_balance = 0
        
        # Process transactions in chronological order for balance calculation
        for txn in reversed(list(transactions)):
            if party_type == "customer":
                running_balance += float(txn.debit) - float(txn.credit)
            else:
                running_balance += float(txn.credit) - float(txn.debit)
            
            statement_entries.append({
                "ledger_id": txn.ledger_id,
                "date": txn.date.isoformat() if txn.date else None,
                "transaction_type": txn.transaction_type,
                "reference_type": txn.reference_type,
                "reference": txn.reference,
                "description": txn.description,
                "debit": float(txn.debit),
                "credit": float(txn.credit),
                "status": txn.status if hasattr(txn, 'status') else 'completed',
                "running_balance": running_balance
            })
        
        # Reverse to show latest first
        statement_entries.reverse()
        
        return {
            "party": {
                "party_id": party_id,
                "party_type": party_type,
                "name": party.name if party else f"{party_type.title()} {party_id}",
                "phone": party.phone if party else None,
                "email": party.email if party else None
            },
            "statement": statement_entries,
            "summary": {
                "total_debit": sum(e["debit"] for e in statement_entries),
                "total_credit": sum(e["credit"] for e in statement_entries),
                "closing_balance": statement_entries[0]["running_balance"] if statement_entries else 0,
                "transaction_count": len(statement_entries)
            },
            "filters": {
                "from_date": from_date,
                "to_date": to_date,
                "skip": skip,
                "limit": limit
            }
        }
        
    except Exception as e:
        logger.error(f"Error fetching party statement: {e}")
        # Return empty statement if error
        return {
            "party": {
                "party_id": party_id,
                "party_type": party_type,
                "name": f"{party_type.title()} {party_id}",
                "phone": None,
                "email": None
            },
            "statement": [],
            "summary": {
                "total_debit": 0,
                "total_credit": 0,
                "closing_balance": 0,
                "transaction_count": 0
            },
            "filters": {
                "from_date": from_date,
                "to_date": to_date,
                "skip": skip,
                "limit": limit
            },
            "error": str(e)
        }

@router.get("/outstanding-bills/{party_id}")
async def get_outstanding_bills(
    party_id: str,
    party_type: str = Query(..., pattern="^(customer|supplier)$"),
    as_of_date: Optional[str] = None,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get outstanding bills for a party
    """
    try:
        if party_type == "customer":
            query = """
                SELECT 
                    invoice_id as bill_id,
                    invoice_number as bill_number,
                    invoice_date as bill_date,
                    invoice_date + INTERVAL '30 days' as due_date,
                    final_amount as bill_amount,
                    COALESCE(paid_amount, 0) as paid_amount,
                    final_amount - COALESCE(paid_amount, 0) as outstanding_amount,
                    payment_status,
                    CASE 
                        WHEN payment_status = 'paid' THEN 0
                        ELSE EXTRACT(DAY FROM CURRENT_DATE - invoice_date)
                    END as days_overdue
                FROM sales.invoices
                WHERE customer_id = :party_id
                AND invoice_status != 'cancelled'
                AND payment_status != 'paid'
            """
        else:
            query = """
                SELECT 
                    purchase_order_id as bill_id,
                    order_number as bill_number,
                    order_date as bill_date,
                    order_date + INTERVAL '30 days' as due_date,
                    total_amount as bill_amount,
                    COALESCE(paid_amount, 0) as paid_amount,
                    total_amount - COALESCE(paid_amount, 0) as outstanding_amount,
                    payment_status,
                    CASE 
                        WHEN payment_status = 'paid' THEN 0
                        ELSE EXTRACT(DAY FROM CURRENT_DATE - order_date)
                    END as days_overdue
                FROM procurement.purchase_orders
                WHERE supplier_id = :party_id
                AND status != 'cancelled'
                AND payment_status != 'paid'
            """
        
        params = {"party_id": int(party_id)}
        
        if as_of_date:
            query += f" AND bill_date <= '{as_of_date}'"
        
        query += " ORDER BY bill_date DESC"
        
        bills = db.execute(text(query), params).fetchall()
        
        outstanding_bills = []
        total_outstanding = 0
        
        for bill in bills:
            outstanding_bills.append({
                "bill_id": bill.bill_id,
                "bill_number": bill.bill_number,
                "bill_date": bill.bill_date.isoformat() if bill.bill_date else None,
                "due_date": bill.due_date.isoformat() if bill.due_date else None,
                "bill_amount": float(bill.bill_amount),
                "paid_amount": float(bill.paid_amount),
                "outstanding_amount": float(bill.outstanding_amount),
                "payment_status": bill.payment_status,
                "days_overdue": int(bill.days_overdue) if bill.days_overdue else 0
            })
            total_outstanding += float(bill.outstanding_amount)
        
        return {
            "party_id": party_id,
            "party_type": party_type,
            "outstanding_bills": outstanding_bills,
            "summary": {
                "total_bills": len(outstanding_bills),
                "total_outstanding": total_outstanding,
                "overdue_bills": sum(1 for b in outstanding_bills if b["days_overdue"] > 0),
                "overdue_amount": sum(b["outstanding_amount"] for b in outstanding_bills if b["days_overdue"] > 0)
            }
        }
        
    except Exception as e:
        logger.error(f"Error fetching outstanding bills: {e}")
        return {
            "party_id": party_id,
            "party_type": party_type,
            "outstanding_bills": [],
            "summary": {
                "total_bills": 0,
                "total_outstanding": 0,
                "overdue_bills": 0,
                "overdue_amount": 0
            },
            "error": str(e)
        }
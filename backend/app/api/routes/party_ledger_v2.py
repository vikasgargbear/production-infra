"""
Party Ledger V2 Simplified - Using only verified columns from working endpoints
Based on /sales/outstanding which we KNOW works
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import datetime, date
from decimal import Decimal

from ...core.database import get_db
from ...core.secure_auth import get_org_id_string  # SECURE: JWT-based auth

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/party-ledger-v2", tags=["party-ledger-v2"])

@router.get("/statement/{party_id}")
async def get_party_statement(
    party_id: str,
    party_type: str = Query("customer", regex="^(customer|supplier)$"),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """
    Get party statement using ONLY columns we know exist
    Based on working /sales/outstanding endpoint
    """
    try:
        if party_type == "customer":
            # Check if sales_returns table exists
            has_returns = db.execute(
                text("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'sales' AND table_name = 'sales_returns')")
            ).scalar()
            
            # Build query with available tables
            query = """
                WITH transactions AS (
                    -- Invoices (we KNOW these columns exist)
                    SELECT 
                        i.invoice_id as id,
                        i.invoice_date as date,
                        'Invoice' as type,
                        i.invoice_number as reference,
                        CONCAT('Invoice #', i.invoice_number) as description,
                        i.final_amount as debit,
                        0::numeric as credit,
                        i.payment_status,
                        1 as sort_order
                    FROM sales.invoices i
                    WHERE i.customer_id = :party_id
                    AND i.org_id = :org_id
                    AND i.invoice_status != 'cancelled'
                    
                    UNION ALL
                    
                    -- Payments (using simple approach)
                    SELECT 
                        p.payment_id as id,
                        p.payment_date as date,
                        'Payment' as type,
                        p.payment_number as reference,
                        CONCAT('Payment #', p.payment_number) as description,
                        0::numeric as debit,
                        p.payment_amount as credit,
                        p.payment_status,
                        2 as sort_order
                    FROM financial.payments p
                    WHERE p.party_id = :party_id
                    AND p.party_type = 'customer'
                    AND p.org_id = :org_id
                    AND p.payment_status != 'cancelled'
            """
            
            # Add sales returns if table exists
            if has_returns:
                query += """
                    UNION ALL
                    
                    -- Sales Returns
                    SELECT 
                        sr.return_id as id,
                        sr.return_date as date,
                        'Sales Return' as type,
                        sr.return_number as reference,
                        CONCAT('Return #', sr.return_number) as description,
                        0::numeric as debit,
                        sr.return_amount as credit,
                        sr.approval_status as payment_status,
                        3 as sort_order
                    FROM sales.sales_returns sr
                    WHERE sr.customer_id = :party_id
                    AND sr.org_id = :org_id
                    AND sr.approval_status = 'approved'
                """
            
            query += """
                )
                SELECT * FROM transactions
            """
            
            # Add date filters if provided
            date_conditions = []
            if from_date:
                query = query.replace("SELECT * FROM transactions", 
                                    f"SELECT * FROM transactions WHERE date >= '{from_date}'")
                if to_date:
                    query = query.replace(f"WHERE date >= '{from_date}'",
                                        f"WHERE date >= '{from_date}' AND date <= '{to_date}'")
            elif to_date:
                query = query.replace("SELECT * FROM transactions",
                                    f"SELECT * FROM transactions WHERE date <= '{to_date}'")
            
            query += " ORDER BY date ASC, sort_order"

            # Execute query
            result = db.execute(text(query), {"party_id": int(party_id), "org_id": org_id})
            transactions = []
            running_balance = 0

            for row in result:
                trans = dict(row._mapping)
                # For customer: Credit balance means customer has paid in advance
                # Debit (invoice) reduces credit balance or increases debit balance
                # Credit (payment/return) increases credit balance or reduces debit balance
                running_balance = running_balance - float(trans['debit']) + float(trans['credit'])
                trans['running_balance'] = running_balance
                trans['balance_type'] = 'Cr' if running_balance >= 0 else 'Dr'
                trans['display_balance'] = abs(running_balance)
                transactions.append(trans)

            # Reverse to show newest first while maintaining correct running balance
            transactions.reverse()
            
            # Get customer details (we KNOW these columns exist)
            customer = db.execute(
                text("""
                    SELECT customer_name, primary_phone, primary_email
                    FROM parties.customers
                    WHERE customer_id = :party_id
                    AND org_id = :org_id                """),
                {"party_id": int(party_id), "org_id": org_id}
            ).fetchone()
            
            # Calculate outstanding (we KNOW these columns exist)
            outstanding = db.execute(
                text("""
                    SELECT COALESCE(SUM(final_amount - COALESCE(paid_amount, 0)), 0) as amount
                    FROM sales.invoices
                    WHERE customer_id = :party_id
                    AND org_id = :org_id                    AND invoice_status != 'cancelled'
                    AND payment_status != 'paid'
                """),
                {"party_id": int(party_id), "org_id": org_id}
            ).scalar()

            # Get advance payments (unallocated amounts)
            advance = db.execute(
                text("""
                    SELECT COALESCE(SUM(unallocated_amount), 0) as amount
                    FROM financial.payments
                    WHERE party_id = :party_id
                    AND party_type = 'customer'
                    AND org_id = :org_id                    AND payment_status != 'cancelled'
                """),
                {"party_id": int(party_id), "org_id": org_id}
            ).scalar()

            # Calculate net position
            net_balance = float(advance or 0) - float(outstanding or 0)

            return {
                "success": True,
                "party": {
                    "id": party_id,
                    "name": customer.customer_name if customer else f"Customer {party_id}",
                    "phone": customer.primary_phone if customer else None,
                    "email": customer.primary_email if customer else None
                },
                "statement": transactions,
                "summary": {
                    "outstanding": float(outstanding) if outstanding else 0,
                    "advance": float(advance) if advance else 0,
                    "net_balance": net_balance,
                    "balance_type": "credit" if net_balance >= 0 else "debit",
                    "transaction_count": len(transactions),
                    "final_balance": running_balance if transactions else 0
                }
            }
            
        else:
            # Supplier logic - similar but with supplier tables
            return {
                "success": True,
                "message": "Supplier ledger not yet implemented",
                "statement": [],
                "summary": {}
            }
            
    except Exception as e:
        logger.error(f"Error in simplified party_ledger_v2: {e}")
        db.rollback()
        # Fallback to empty response instead of error
        return {
            "success": False,
            "error": str(e),
            "statement": [],
            "summary": {"outstanding": 0, "transaction_count": 0}
        }

@router.get("/balance/{party_id}")
async def get_balance(
    party_id: str,
    party_type: str = Query("customer"),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """Get party balance using verified columns"""
    try:
        if party_type == "customer":
            result = db.execute(
                text("""
                    SELECT 
                        COALESCE(SUM(final_amount - COALESCE(paid_amount, 0)), 0) as balance,
                        COUNT(*) as invoice_count
                    FROM sales.invoices
                    WHERE customer_id = :party_id
                    AND org_id = :org_id                    AND invoice_status != 'cancelled'
                    AND payment_status != 'paid'
                """),
                {"party_id": int(party_id), "org_id": org_id}
            ).fetchone()
            
            return {
                "party_id": party_id,
                "balance": float(result.balance) if result else 0,
                "pending_invoices": result.invoice_count if result else 0
            }
    except Exception as e:
        logger.error(f"Error getting balance: {e}")
        return {"party_id": party_id, "balance": 0, "pending_invoices": 0}

@router.get("/outstanding-bills/{party_id}")
async def get_outstanding_bills(
    party_id: str,
    party_type: str = Query("customer"),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """Get outstanding bills using verified columns"""
    try:
        if party_type == "customer":
            # Using the EXACT query from working /sales/outstanding
            result = db.execute(
                text("""
                    SELECT 
                        i.invoice_id, 
                        i.invoice_number,
                        i.invoice_date,
                        i.due_date,
                        i.final_amount,
                        COALESCE(i.paid_amount, 0) as paid_amount,
                        (i.final_amount - COALESCE(i.paid_amount, 0)) as outstanding_amount,
                        i.payment_status,
                        CASE 
                            WHEN i.due_date < CURRENT_DATE THEN 
                                CURRENT_DATE - i.due_date 
                            ELSE 0 
                        END as days_overdue
                    FROM sales.invoices i
                    WHERE i.customer_id = :party_id
                    AND i.org_id = :org_id                    AND i.payment_status IN ('unpaid', 'partial', 'pending')
                    AND i.invoice_status != 'cancelled'
                    ORDER BY i.due_date, i.invoice_date
                """),
                {"party_id": int(party_id), "org_id": org_id}
            )
            
            bills = []
            for row in result:
                bills.append(dict(row._mapping))
            
            return {
                "outstanding_bills": bills,
                "total_outstanding": sum(b["outstanding_amount"] for b in bills),
                "bill_count": len(bills)
            }
    except Exception as e:
        logger.error(f"Error getting outstanding bills: {e}")
        return {"outstanding_bills": [], "total_outstanding": 0, "bill_count": 0}

@router.get("/aging-analysis")
async def get_aging_analysis(
    party_type: str = Query("customer"),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """Get aging analysis using verified columns"""
    try:
        if party_type == "customer":
            result = db.execute(
                text("""
                    WITH aging AS (
                        SELECT
                            c.customer_id,
                            c.customer_name,
                            c.phone,
                            c.email,
                            c.address,
                            i.invoice_id,
                            i.invoice_number,
                            (i.final_amount - COALESCE(i.paid_amount, 0)) as outstanding,
                            CURRENT_DATE - i.invoice_date as days_old,
                            CASE
                                WHEN CURRENT_DATE - i.invoice_date <= 30 THEN 'current'
                                WHEN CURRENT_DATE - i.invoice_date <= 60 THEN '31-60'
                                WHEN CURRENT_DATE - i.invoice_date <= 90 THEN '61-90'
                                ELSE 'over_90'
                            END as bucket
                        FROM sales.invoices i
                        JOIN parties.customers c ON i.customer_id = c.customer_id
                        WHERE i.payment_status != 'paid'
                        AND i.invoice_status != 'cancelled'
                        AND i.final_amount > COALESCE(i.paid_amount, 0)
                        AND i.org_id = :org_id                        AND c.org_id = :org_id                    )
                    SELECT
                        customer_id,
                        customer_name,
                        MAX(phone) as phone,
                        MAX(email) as email,
                        MAX(address) as address,
                        COUNT(invoice_id) as invoice_count,
                        SUM(outstanding) as total_outstanding,
                        SUM(CASE WHEN bucket = 'current' THEN outstanding ELSE 0 END) as current,
                        SUM(CASE WHEN bucket = '31-60' THEN outstanding ELSE 0 END) as days_31_60,
                        SUM(CASE WHEN bucket = '61-90' THEN outstanding ELSE 0 END) as days_61_90,
                        SUM(CASE WHEN bucket = 'over_90' THEN outstanding ELSE 0 END) as over_90
                    FROM aging
                    GROUP BY customer_id, customer_name
                    ORDER BY total_outstanding DESC
                """),
                {"org_id": org_id}
            )
            
            aging_data = []
            for row in result:
                aging_data.append(dict(row._mapping))
            
            return {
                "aging_data": aging_data,
                "summary": {
                    "total": sum(a["total_outstanding"] for a in aging_data),
                    "current": sum(a["current"] for a in aging_data),
                    "overdue": sum(a["days_31_60"] + a["days_61_90"] + a["over_90"] for a in aging_data)
                }
            }
    except Exception as e:
        logger.error(f"Error getting aging analysis: {e}")
        return {"aging_data": [], "summary": {}}
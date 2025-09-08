"""
Party Ledger V2 - With Payment Allocation Support
Proper enterprise ledger with invoice-payment linking
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import datetime, date
from decimal import Decimal

from ...core.database import get_db
from ...core.auth_utils import get_org_id_from_header

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/party-ledger-v2", tags=["party-ledger-v2"])

@router.get("/balance/{party_id}")
async def get_party_balance(
    party_id: str,
    party_type: str = Query("customer", regex="^(customer|supplier)$"),
    as_of_date: Optional[str] = None,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get party balance (compatible with v1 for migration)
    """
    try:
        if party_type == "customer":
            query = """
                SELECT 
                    COALESCE(SUM(i.final_amount), 0) - COALESCE(SUM(i.paid_amount), 0) as balance,
                    COUNT(CASE WHEN i.payment_status != 'paid' THEN 1 END) as pending_invoices,
                    MAX(i.invoice_date) as last_transaction_date
                FROM sales.invoices i
                WHERE i.customer_id = :party_id
                AND i.invoice_status != 'cancelled'
            """
        else:
            query = """
                SELECT 
                    COALESCE(SUM(si.total_amount), 0) - COALESCE(SUM(si.paid_amount), 0) as balance,
                    COUNT(CASE WHEN si.payment_status != 'paid' THEN 1 END) as pending_invoices,
                    MAX(si.invoice_date) as last_transaction_date
                FROM procurement.supplier_invoices si
                WHERE si.supplier_id = :party_id
                AND si.status != 'cancelled'
            """
        
        result = db.execute(text(query), {"party_id": party_id}).fetchone()
        
        return {
            "party_id": party_id,
            "party_type": party_type,
            "balance": float(result.balance) if result else 0,
            "pending_invoices": result.pending_invoices if result else 0,
            "last_transaction_date": str(result.last_transaction_date) if result and result.last_transaction_date else None
        }
        
    except Exception as e:
        logger.error(f"Error fetching balance: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/statement/{party_id}")
async def get_party_statement_with_allocations(
    party_id: str,
    party_type: str = Query(..., regex="^(customer|supplier)$"),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get detailed party statement with proper payment allocations
    """
    try:
        if party_type == "customer":
            # Check if payment_allocations table exists
            allocation_check = db.execute(
                text("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'financial' AND table_name = 'payment_allocations')")
            ).scalar()
            
            if allocation_check:
                # Use allocation-based query
                query = """
                    WITH ledger_entries AS (
                        -- Invoices (Debit entries)
                        SELECT 
                            invoice_id as ledger_id,
                            invoice_date as date,
                            'Invoice' as transaction_type,
                            'INV' as reference_type,
                            invoice_number as reference,
                            CONCAT('Invoice #', invoice_number, ' - ', customer_name) as description,
                            final_amount as debit,
                            0 as credit,
                            NULL as linked_invoice,
                            payment_status as status,
                            1 as sort_order
                        FROM sales.invoices
                        WHERE customer_id = :party_id
                        AND invoice_status != 'cancelled'
                        
                        UNION ALL
                        
                        -- Allocated Payments (Credit entries linked to invoices)
                        SELECT 
                            pa.allocation_id as ledger_id,
                            COALESCE(pa.created_at, p.payment_date)::DATE as date,
                            'Payment' as transaction_type,
                            'PAY' as reference_type,
                            p.payment_number as reference,
                            CONCAT('Payment #', p.payment_number, ' allocated to Invoice #', i.invoice_number) as description,
                            0 as debit,
                            pa.allocated_amount as credit,
                            i.invoice_number as linked_invoice,
                            'allocated' as status,
                            2 as sort_order
                        FROM financial.payment_allocations pa
                        JOIN financial.payments p ON pa.payment_id = p.payment_id
                        JOIN sales.invoices i ON pa.reference_id = i.invoice_id AND pa.reference_type = 'invoice'
                        WHERE i.customer_id = :party_id
                        AND p.payment_status != 'cancelled'
                        
                        UNION ALL
                        
                        -- Unallocated Payments (Advance payments)
                        SELECT 
                            p.payment_id as ledger_id,
                            p.payment_date as date,
                            'Advance Payment' as transaction_type,
                            'ADV' as reference_type,
                            p.payment_number as reference,
                            CONCAT('Unallocated Payment #', p.payment_number, ' - Advance') as description,
                            0 as debit,
                            p.unallocated_amount as credit,
                            NULL as linked_invoice,
                            'unallocated' as status,
                            3 as sort_order
                        FROM financial.payments p
                        WHERE p.party_id = :party_id 
                        AND p.party_type = 'customer'
                        AND p.allocation_status != 'full'
                        AND p.unallocated_amount > 0
                        AND p.payment_status != 'cancelled'
                        
                        UNION ALL
                        
                        -- Sales Returns (Credit entries)
                        SELECT 
                            sr.return_id as ledger_id,
                            sr.return_date as date,
                            'Sales Return' as transaction_type,
                            'RET' as reference_type,
                            sr.return_number as reference,
                            CONCAT('Return #', sr.return_number, CASE WHEN i.invoice_number IS NOT NULL THEN CONCAT(' for Invoice #', i.invoice_number) ELSE '' END) as description,
                            0 as debit,
                            sr.return_amount as credit,
                            i.invoice_number as linked_invoice,
                            sr.approval_status as status,
                            4 as sort_order
                        FROM sales.sales_returns sr
                        LEFT JOIN sales.invoices i ON sr.invoice_id = i.invoice_id
                        WHERE sr.customer_id = :party_id
                        AND sr.approval_status = 'approved'
                    )
                    SELECT * FROM ledger_entries
                """
            else:
                # Fallback to simple query without allocations
                query = """
                    WITH ledger_entries AS (
                        -- Invoices only
                        SELECT 
                            invoice_id as ledger_id,
                            invoice_date as date,
                            'Invoice' as transaction_type,
                            'INV' as reference_type,
                            invoice_number as reference,
                            CONCAT('Invoice #', invoice_number) as description,
                            final_amount as debit,
                            0 as credit,
                            NULL as linked_invoice,
                            payment_status as status,
                            1 as sort_order
                        FROM sales.invoices
                        WHERE customer_id = :party_id
                        AND invoice_status != 'cancelled'
                    )
                    SELECT * FROM ledger_entries
                """
        else:  # supplier
            query = """
                WITH ledger_entries AS (
                    -- Purchase Orders (Credit)
                    SELECT 
                        purchase_order_id as ledger_id,
                        order_date as date,
                        'Purchase' as transaction_type,
                        'PUR' as reference_type,
                        order_number as reference,
                        CONCAT('Purchase Order #', order_number) as description,
                        0 as debit,
                        total_amount as credit,
                        NULL as linked_invoice,
                        status,
                        1 as sort_order
                    FROM procurement.purchase_orders
                    WHERE supplier_id = :party_id
                    AND status != 'cancelled'
                )
                SELECT * FROM ledger_entries
            """
        
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
        query += " ORDER BY date DESC, sort_order, ledger_id DESC LIMIT :limit OFFSET :skip"
        params["limit"] = limit
        params["skip"] = skip
        
        # Get transactions
        transactions = db.execute(text(query), params).fetchall()
        
        # Get party details
        if party_type == "customer":
            party_query = """
                SELECT customer_name as name, phone_primary as phone, email, gst_number as gst
                FROM parties.customers 
                WHERE customer_id = :party_id
            """
        else:
            party_query = """
                SELECT supplier_name as name, phone_primary as phone, email, gst_number as gst
                FROM parties.suppliers 
                WHERE supplier_id = :party_id
            """
        
        try:
            party = db.execute(text(party_query), {"party_id": int(party_id)}).fetchone()
        except:
            party = None
        
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
                "linked_invoice": txn.linked_invoice if hasattr(txn, 'linked_invoice') else None,
                "status": txn.status if hasattr(txn, 'status') else 'completed',
                "running_balance": running_balance
            })
        
        # Reverse to show latest first
        statement_entries.reverse()
        
        # Get current outstanding balance
        balance_query = """
            SELECT 
                COALESCE(SUM(i.final_amount - COALESCE(i.allocated_amount, 0)), 0) as outstanding
            FROM sales.invoices i
            WHERE i.customer_id = :party_id
            AND i.invoice_status != 'cancelled'
            AND i.payment_status != 'paid'
        """
        
        outstanding = db.execute(text(balance_query), {"party_id": int(party_id)}).scalar()
        
        return {
            "party": {
                "party_id": party_id,
                "party_type": party_type,
                "name": party.name if party else f"{party_type.title()} {party_id}",
                "phone": party.phone if party else None,
                "email": party.email if party else None,
                "gst": party.gst if party and hasattr(party, 'gst') else None
            },
            "statement": statement_entries,
            "summary": {
                "total_debit": sum(e["debit"] for e in statement_entries),
                "total_credit": sum(e["credit"] for e in statement_entries),
                "closing_balance": statement_entries[0]["running_balance"] if statement_entries else 0,
                "outstanding_balance": float(outstanding) if outstanding else 0,
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
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/reconciliation/{party_id}")
async def get_reconciliation_view(
    party_id: str,
    party_type: str = Query(..., regex="^(customer|supplier)$"),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get reconciliation view showing invoices and their payment status
    """
    try:
        if party_type == "customer":
            # Get all invoices with payment details
            query = """
                SELECT 
                    i.invoice_id,
                    i.invoice_number,
                    i.invoice_date,
                    i.final_amount,
                    COALESCE(i.allocated_amount, 0) as paid_amount,
                    i.final_amount - COALESCE(i.allocated_amount, 0) as due_amount,
                    i.payment_status,
                    ARRAY_AGG(
                        CASE WHEN pa.allocation_id IS NOT NULL THEN
                            json_build_object(
                                'payment_id', p.payment_id,
                                'payment_number', p.payment_number,
                                'payment_date', p.payment_date,
                                'allocated_amount', pa.allocated_amount,
                                'allocation_date', pa.created_at
                            )
                        ELSE NULL END
                    ) FILTER (WHERE pa.allocation_id IS NOT NULL) as payments
                FROM sales.invoices i
                LEFT JOIN financial.payment_allocations pa ON i.invoice_id = pa.reference_id AND pa.reference_type = 'invoice'
                LEFT JOIN financial.payments p ON pa.payment_id = p.payment_id
                WHERE i.customer_id = :party_id
                AND i.invoice_status != 'cancelled'
                GROUP BY i.invoice_id
                ORDER BY i.invoice_date DESC
            """
            
            invoices = db.execute(text(query), {"party_id": int(party_id)}).fetchall()
            
            # Get unallocated payments
            unallocated_query = """
                SELECT 
                    payment_id,
                    payment_number,
                    payment_date,
                    payment_amount,
                    unallocated_amount
                FROM financial.payments
                WHERE party_id = :party_id 
                AND party_type = 'customer'
                AND allocation_status != 'full'
                AND unallocated_amount > 0
                ORDER BY payment_date DESC
            """
            
            unallocated = db.execute(text(unallocated_query), {"party_id": int(party_id)}).fetchall()
            
            return {
                "party_id": party_id,
                "party_type": party_type,
                "invoices": [
                    {
                        "invoice_id": inv.invoice_id,
                        "invoice_number": inv.invoice_number,
                        "invoice_date": inv.invoice_date.isoformat() if inv.invoice_date else None,
                        "total_amount": float(inv.final_amount),
                        "paid_amount": float(inv.paid_amount),
                        "due_amount": float(inv.due_amount),
                        "payment_status": inv.payment_status,
                        "payments": inv.payments if inv.payments else []
                    }
                    for inv in invoices
                ],
                "unallocated_payments": [
                    {
                        "payment_id": p.payment_id,
                        "payment_number": p.payment_number,
                        "payment_date": p.payment_date.isoformat() if p.payment_date else None,
                        "total_amount": float(p.payment_amount),
                        "unallocated": float(p.unallocated_amount)
                    }
                    for p in unallocated
                ],
                "summary": {
                    "total_invoiced": sum(float(inv.final_amount) for inv in invoices),
                    "total_paid": sum(float(inv.paid_amount) for inv in invoices),
                    "total_due": sum(float(inv.due_amount) for inv in invoices),
                    "total_unallocated": sum(float(p.unallocated_amount) for p in unallocated)
                }
            }
        
        else:
            # Similar logic for suppliers
            return {
                "party_id": party_id,
                "party_type": party_type,
                "message": "Supplier reconciliation not yet implemented"
            }
            
    except Exception as e:
        logger.error(f"Error fetching reconciliation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/aging-analysis")
async def get_aging_analysis(
    party_type: str = Query("customer", regex="^(customer|supplier)$"),
    as_of_date: Optional[str] = None,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get aging analysis for all parties
    """
    try:
        if party_type == "customer":
            query = """
                WITH aging_buckets AS (
                    SELECT 
                        i.customer_id,
                        c.customer_name,
                        i.invoice_id,
                        i.invoice_number,
                        i.invoice_date,
                        i.final_amount - COALESCE(i.allocated_amount, 0) as outstanding,
                        CURRENT_DATE - i.invoice_date as days_outstanding,
                        CASE 
                            WHEN CURRENT_DATE - i.invoice_date <= 30 THEN '0-30 days'
                            WHEN CURRENT_DATE - i.invoice_date <= 60 THEN '31-60 days'
                            WHEN CURRENT_DATE - i.invoice_date <= 90 THEN '61-90 days'
                            ELSE 'Over 90 days'
                        END as aging_bucket
                    FROM sales.invoices i
                    JOIN parties.customers c ON i.customer_id = c.customer_id
                    WHERE i.invoice_status != 'cancelled'
                    AND i.payment_status != 'paid'
                    AND i.final_amount > COALESCE(i.allocated_amount, 0)
                )
                SELECT 
                    customer_id,
                    customer_name,
                    COUNT(invoice_id) as invoice_count,
                    SUM(outstanding) as total_outstanding,
                    SUM(CASE WHEN aging_bucket = '0-30 days' THEN outstanding ELSE 0 END) as current_amount,
                    SUM(CASE WHEN aging_bucket = '31-60 days' THEN outstanding ELSE 0 END) as days_31_60,
                    SUM(CASE WHEN aging_bucket = '61-90 days' THEN outstanding ELSE 0 END) as days_61_90,
                    SUM(CASE WHEN aging_bucket = 'Over 90 days' THEN outstanding ELSE 0 END) as over_90_days
                FROM aging_buckets
                GROUP BY customer_id, customer_name
                ORDER BY total_outstanding DESC
            """
            
            results = db.execute(text(query)).fetchall()
            
            return {
                "party_type": party_type,
                "as_of_date": as_of_date or date.today().isoformat(),
                "aging_data": [
                    {
                        "party_id": r.customer_id,
                        "party_name": r.customer_name,
                        "invoice_count": r.invoice_count,
                        "total_outstanding": float(r.total_outstanding),
                        "buckets": {
                            "current": float(r.current_amount),
                            "31-60": float(r.days_31_60),
                            "61-90": float(r.days_61_90),
                            "over_90": float(r.over_90_days)
                        }
                    }
                    for r in results
                ],
                "summary": {
                    "total_parties": len(results),
                    "total_outstanding": sum(float(r.total_outstanding) for r in results),
                    "current": sum(float(r.current_amount) for r in results),
                    "overdue": sum(float(r.days_31_60 + r.days_61_90 + r.over_90_days) for r in results)
                }
            }
            
    except Exception as e:
        logger.error(f"Error generating aging analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/outstanding-bills/{party_id}")
async def get_outstanding_bills(
    party_id: str,
    party_type: str = Query("customer", regex="^(customer|supplier)$"),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get outstanding bills for a party (compatible with v1 for migration)
    """
    try:
        if party_type == "customer":
            query = """
                SELECT 
                    i.invoice_id as bill_id,
                    i.invoice_number as bill_number,
                    i.invoice_date as bill_date,
                    i.final_amount as bill_amount,
                    i.paid_amount,
                    i.final_amount - i.paid_amount as outstanding_amount,
                    i.payment_status,
                    CURRENT_DATE - i.invoice_date as days_overdue
                FROM sales.invoices i
                WHERE i.customer_id = :party_id
                AND i.invoice_status != 'cancelled'
                AND i.payment_status != 'paid'
                ORDER BY i.invoice_date DESC
            """
        else:
            query = """
                SELECT 
                    si.invoice_id as bill_id,
                    si.invoice_number as bill_number,
                    si.invoice_date as bill_date,
                    si.total_amount as bill_amount,
                    si.paid_amount,
                    si.total_amount - si.paid_amount as outstanding_amount,
                    si.payment_status,
                    CURRENT_DATE - si.invoice_date as days_overdue
                FROM procurement.supplier_invoices si
                WHERE si.supplier_id = :party_id
                AND si.status != 'cancelled'
                AND si.payment_status != 'paid'
                ORDER BY si.invoice_date DESC
            """
        
        results = db.execute(text(query), {"party_id": party_id}).fetchall()
        
        bills = []
        for r in results:
            bills.append({
                "bill_id": r.bill_id,
                "bill_number": r.bill_number,
                "bill_date": str(r.bill_date),
                "bill_amount": float(r.bill_amount),
                "paid_amount": float(r.paid_amount) if r.paid_amount else 0,
                "outstanding_amount": float(r.outstanding_amount),
                "payment_status": r.payment_status,
                "days_overdue": r.days_overdue
            })
        
        return {
            "party_id": party_id,
            "party_type": party_type,
            "outstanding_bills": bills,
            "total_outstanding": sum(b["outstanding_amount"] for b in bills),
            "bill_count": len(bills)
        }
        
    except Exception as e:
        logger.error(f"Error fetching outstanding bills: {e}")
        raise HTTPException(status_code=500, detail=str(e))
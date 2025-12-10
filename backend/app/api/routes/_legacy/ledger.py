"""
Ledger API - Party ledger statements and aging analysis

MODERNIZED: Uses TenantAwareSession + PermissionChecker + OrgContext
Supports: Customers, Suppliers, Credit/Debit Notes, Sales Returns, Pagination
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
import logging
from datetime import date

from ...core.tenant_service import TenantAwareSession, get_tenant_aware_db, with_tenant_context
from ...core.org_context import OrgContext, get_org_context
from ...core.permissions import PermissionChecker

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ledger", tags=["Ledger"])


# Pydantic models for better API docs
class LedgerTransaction(BaseModel):
    id: int
    date: date
    type: str
    reference: str
    description: str
    debit: float
    credit: float
    running_balance: float
    balance_type: str


class LedgerSummary(BaseModel):
    outstanding: float
    advance: float
    net_balance: float
    transaction_count: int


@router.get("/statement/{party_id}")
@with_tenant_context
async def get_party_statement(
    party_id: int,
    party_type: str = Query("customer", regex="^(customer|supplier)$"),
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    _: dict = Depends(PermissionChecker("reports", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get party ledger statement with running balance
    
    Includes: Invoices, Payments, Credit Notes, Sales Returns
    Supports pagination for large statements
    """
    try:
        org_id = str(context.org_id)
        offset = (page - 1) * limit
        
        if party_type == "customer":
            # Complete statement with all transaction types
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
                    WHERE i.customer_id = :party_id AND i.org_id = :org_id
                    AND i.invoice_status != 'cancelled'
                    AND (:from_date IS NULL OR i.invoice_date >= :from_date)
                    AND (:to_date IS NULL OR i.invoice_date <= :to_date)
                    
                    UNION ALL
                    
                    -- Payments (Credit)
                    SELECT 
                        p.payment_id as id,
                        p.payment_date as date,
                        'Payment' as type,
                        p.payment_number as reference,
                        CONCAT('Payment - ', COALESCE(p.payment_mode, 'Cash')) as description,
                        0::numeric as debit,
                        p.payment_amount as credit,
                        2 as sort_order
                    FROM financial.payments p
                    WHERE p.party_id = :party_id AND p.party_type = 'customer' AND p.org_id = :org_id
                    AND p.payment_status != 'cancelled'
                    AND (:from_date IS NULL OR p.payment_date >= :from_date)
                    AND (:to_date IS NULL OR p.payment_date <= :to_date)
                    
                    UNION ALL
                    
                    -- Credit Notes (Credit) - if table exists
                    SELECT 
                        cn.note_id as id,
                        cn.note_date as date,
                        'Credit Note' as type,
                        cn.note_number as reference,
                        CONCAT('Credit Note - ', COALESCE(cn.reason, '')) as description,
                        0::numeric as debit,
                        cn.amount as credit,
                        3 as sort_order
                    FROM financial.credit_debit_notes cn
                    WHERE cn.party_id = :party_id AND cn.party_type = 'customer' 
                    AND cn.note_type = 'credit' AND cn.org_id = :org_id
                    AND cn.status = 'approved'
                    AND (:from_date IS NULL OR cn.note_date >= :from_date)
                    AND (:to_date IS NULL OR cn.note_date <= :to_date)
                    
                    UNION ALL
                    
                    -- Debit Notes (Debit)
                    SELECT 
                        dn.note_id as id,
                        dn.note_date as date,
                        'Debit Note' as type,
                        dn.note_number as reference,
                        CONCAT('Debit Note - ', COALESCE(dn.reason, '')) as description,
                        dn.amount as debit,
                        0::numeric as credit,
                        4 as sort_order
                    FROM financial.credit_debit_notes dn
                    WHERE dn.party_id = :party_id AND dn.party_type = 'customer'
                    AND dn.note_type = 'debit' AND dn.org_id = :org_id
                    AND dn.status = 'approved'
                    AND (:from_date IS NULL OR dn.note_date >= :from_date)
                    AND (:to_date IS NULL OR dn.note_date <= :to_date)
                )
                SELECT * FROM all_transactions
                ORDER BY date DESC, sort_order
            """
            
            # Get all for running balance calculation
            all_result = db.execute(text(query), {
                "party_id": party_id, "org_id": org_id,
                "from_date": from_date, "to_date": to_date
            })
            
            all_transactions = []
            running_balance = 0
            
            for row in all_result:
                trans = dict(row._mapping)
                # Debit increases balance owed TO us, Credit decreases it
                running_balance = running_balance + float(trans['debit']) - float(trans['credit'])
                trans['running_balance'] = running_balance
                trans['balance_type'] = 'Dr' if running_balance > 0 else 'Cr'
                trans['display_balance'] = abs(running_balance)
                all_transactions.append(trans)
            
            # Pagination
            total_count = len(all_transactions)
            paginated = all_transactions[offset:offset + limit]
            
            # Get customer details
            customer = db.execute(text("""
                SELECT customer_name, primary_phone, primary_email, credit_limit
                FROM parties.customers
                WHERE customer_id = :party_id AND org_id = :org_id
            """), {"party_id": party_id, "org_id": org_id}).fetchone()
            
            # Calculate outstanding
            outstanding = db.execute(text("""
                SELECT COALESCE(SUM(final_amount - COALESCE(paid_amount, 0)), 0)
                FROM sales.invoices
                WHERE customer_id = :party_id AND org_id = :org_id
                AND invoice_status != 'cancelled' AND payment_status != 'paid'
            """), {"party_id": party_id, "org_id": org_id}).scalar() or 0
            
            # Calculate advance (unallocated payments)
            advance = db.execute(text("""
                SELECT COALESCE(SUM(unallocated_amount), 0)
                FROM financial.payments
                WHERE party_id = :party_id AND party_type = 'customer' AND org_id = :org_id
                AND payment_status != 'cancelled' AND unallocated_amount > 0
            """), {"party_id": party_id, "org_id": org_id}).scalar() or 0
            
            return {
                "success": True,
                "party": {
                    "id": party_id,
                    "type": party_type,
                    "name": customer.customer_name if customer else f"Customer {party_id}",
                    "phone": customer.primary_phone if customer else None,
                    "email": customer.primary_email if customer else None,
                    "credit_limit": float(customer.credit_limit) if customer and customer.credit_limit else None
                },
                "statement": paginated,
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total_count,
                    "pages": (total_count + limit - 1) // limit
                },
                "summary": {
                    "outstanding": float(outstanding),
                    "advance": float(advance),
                    "net_balance": float(outstanding) - float(advance),
                    "transaction_count": total_count,
                    "final_balance": running_balance
                }
            }
            
        else:  # Supplier
            query = """
                WITH all_transactions AS (
                    -- Purchase Invoices (Credit - we owe them)
                    SELECT 
                        si.invoice_id as id,
                        si.invoice_date as date,
                        'Purchase Invoice' as type,
                        si.invoice_number as reference,
                        CONCAT('Purchase #', si.invoice_number) as description,
                        0::numeric as debit,
                        si.final_amount as credit,
                        1 as sort_order
                    FROM purchases.supplier_invoices si
                    WHERE si.supplier_id = :party_id AND si.org_id = :org_id
                    AND si.invoice_status != 'cancelled'
                    AND (:from_date IS NULL OR si.invoice_date >= :from_date)
                    AND (:to_date IS NULL OR si.invoice_date <= :to_date)
                    
                    UNION ALL
                    
                    -- Payments to Supplier (Debit - reduces what we owe)
                    SELECT 
                        p.payment_id as id,
                        p.payment_date as date,
                        'Payment' as type,
                        p.payment_number as reference,
                        CONCAT('Payment to Supplier - ', COALESCE(p.payment_mode, 'Cash')) as description,
                        p.payment_amount as debit,
                        0::numeric as credit,
                        2 as sort_order
                    FROM financial.payments p
                    WHERE p.party_id = :party_id AND p.party_type = 'supplier' AND p.org_id = :org_id
                    AND p.payment_status != 'cancelled'
                    AND (:from_date IS NULL OR p.payment_date >= :from_date)
                    AND (:to_date IS NULL OR p.payment_date <= :to_date)
                )
                SELECT * FROM all_transactions
                ORDER BY date DESC, sort_order
            """
            
            result = db.execute(text(query), {
                "party_id": party_id, "org_id": org_id,
                "from_date": from_date, "to_date": to_date
            })
            
            transactions = []
            running_balance = 0
            
            for row in result:
                trans = dict(row._mapping)
                # For supplier: Credit increases what we owe, Debit decreases it
                running_balance = running_balance + float(trans['credit']) - float(trans['debit'])
                trans['running_balance'] = running_balance
                trans['balance_type'] = 'Cr' if running_balance > 0 else 'Dr'
                trans['display_balance'] = abs(running_balance)
                transactions.append(trans)
            
            # Pagination
            total_count = len(transactions)
            paginated = transactions[offset:offset + limit]
            
            # Get supplier details
            supplier = db.execute(text("""
                SELECT supplier_name, primary_phone, primary_email
                FROM parties.suppliers
                WHERE supplier_id = :party_id AND org_id = :org_id
            """), {"party_id": party_id, "org_id": org_id}).fetchone()
            
            return {
                "success": True,
                "party": {
                    "id": party_id,
                    "type": party_type,
                    "name": supplier.supplier_name if supplier else f"Supplier {party_id}",
                    "phone": supplier.primary_phone if supplier else None,
                    "email": supplier.primary_email if supplier else None
                },
                "statement": paginated,
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total_count,
                    "pages": (total_count + limit - 1) // limit
                },
                "summary": {
                    "payable": running_balance if running_balance > 0 else 0,
                    "advance": abs(running_balance) if running_balance < 0 else 0,
                    "net_balance": running_balance,
                    "transaction_count": total_count
                }
            }
            
    except Exception as e:
        logger.error(f"Error getting party statement: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get statement: {str(e)}")


@router.get("/balance/{party_id}")
@with_tenant_context
async def get_balance(
    party_id: int,
    party_type: str = Query("customer", regex="^(customer|supplier)$"),
    _: dict = Depends(PermissionChecker("reports", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get party balance (quick summary without full statement)"""
    try:
        org_id = str(context.org_id)
        
        if party_type == "customer":
            result = db.execute(text("""
                SELECT 
                    COALESCE(SUM(final_amount - COALESCE(paid_amount, 0)), 0) as outstanding,
                    COUNT(*) as invoice_count
                FROM sales.invoices
                WHERE customer_id = :party_id AND org_id = :org_id
                AND invoice_status != 'cancelled' AND payment_status != 'paid'
            """), {"party_id": party_id, "org_id": org_id}).fetchone()
            
            advance = db.execute(text("""
                SELECT COALESCE(SUM(unallocated_amount), 0)
                FROM financial.payments
                WHERE party_id = :party_id AND party_type = 'customer' AND org_id = :org_id
                AND payment_status != 'cancelled'
            """), {"party_id": party_id, "org_id": org_id}).scalar() or 0
            
            return {
                "party_id": party_id,
                "party_type": party_type,
                "outstanding": float(result.outstanding) if result else 0,
                "advance": float(advance),
                "net_balance": float(result.outstanding or 0) - float(advance),
                "pending_invoices": result.invoice_count if result else 0
            }
        else:  # Supplier
            result = db.execute(text("""
                SELECT 
                    COALESCE(SUM(final_amount - COALESCE(paid_amount, 0)), 0) as payable,
                    COUNT(*) as invoice_count
                FROM purchases.supplier_invoices
                WHERE supplier_id = :party_id AND org_id = :org_id
                AND invoice_status != 'cancelled' AND payment_status != 'paid'
            """), {"party_id": party_id, "org_id": org_id}).fetchone()
            
            return {
                "party_id": party_id,
                "party_type": party_type,
                "payable": float(result.payable) if result else 0,
                "pending_invoices": result.invoice_count if result else 0
            }
            
    except Exception as e:
        logger.error(f"Error getting balance: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get balance: {str(e)}")


@router.get("/outstanding/{party_id}")
@with_tenant_context
async def get_outstanding_bills(
    party_id: int,
    party_type: str = Query("customer", regex="^(customer|supplier)$"),
    _: dict = Depends(PermissionChecker("reports", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get outstanding bills for a party"""
    try:
        org_id = str(context.org_id)
        
        if party_type == "customer":
            result = db.execute(text("""
                SELECT 
                    i.invoice_id, i.invoice_number, i.invoice_date, i.due_date,
                    i.final_amount, COALESCE(i.paid_amount, 0) as paid_amount,
                    (i.final_amount - COALESCE(i.paid_amount, 0)) as outstanding_amount,
                    i.payment_status,
                    GREATEST(0, CURRENT_DATE - i.due_date) as days_overdue
                FROM sales.invoices i
                WHERE i.customer_id = :party_id AND i.org_id = :org_id
                AND i.payment_status IN ('unpaid', 'partial', 'pending')
                AND i.invoice_status != 'cancelled'
                ORDER BY i.due_date
            """), {"party_id": party_id, "org_id": org_id})
        else:
            result = db.execute(text("""
                SELECT 
                    si.invoice_id, si.invoice_number, si.invoice_date, si.due_date,
                    si.final_amount, COALESCE(si.paid_amount, 0) as paid_amount,
                    (si.final_amount - COALESCE(si.paid_amount, 0)) as outstanding_amount,
                    si.payment_status,
                    GREATEST(0, CURRENT_DATE - si.due_date) as days_overdue
                FROM purchases.supplier_invoices si
                WHERE si.supplier_id = :party_id AND si.org_id = :org_id
                AND si.payment_status IN ('unpaid', 'partial', 'pending')
                AND si.invoice_status != 'cancelled'
                ORDER BY si.due_date
            """), {"party_id": party_id, "org_id": org_id})
        
        bills = [dict(row._mapping) for row in result]
        
        return {
            "party_id": party_id,
            "party_type": party_type,
            "outstanding_bills": bills,
            "total_outstanding": sum(b["outstanding_amount"] for b in bills),
            "bill_count": len(bills)
        }
        
    except Exception as e:
        logger.error(f"Error getting outstanding bills: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get outstanding bills: {str(e)}")


@router.get("/aging")
@with_tenant_context
async def get_aging_analysis(
    party_type: str = Query("customer", regex="^(customer|supplier)$"),
    _: dict = Depends(PermissionChecker("reports", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get aging analysis for all parties"""
    try:
        org_id = str(context.org_id)
        
        if party_type == "customer":
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
                JOIN parties.customers c ON i.customer_id = c.customer_id AND i.org_id = c.org_id
                WHERE i.payment_status != 'paid' AND i.invoice_status != 'cancelled'
                AND i.final_amount > COALESCE(i.paid_amount, 0)
                AND i.org_id = :org_id
                GROUP BY c.customer_id, c.customer_name, c.primary_phone
                ORDER BY total_outstanding DESC
            """), {"org_id": org_id})
        else:
            result = db.execute(text("""
                SELECT
                    s.supplier_id, s.supplier_name, s.primary_phone as phone,
                    COUNT(si.invoice_id) as invoice_count,
                    COALESCE(SUM(si.final_amount - COALESCE(si.paid_amount, 0)), 0) as total_payable,
                    COALESCE(SUM(CASE WHEN CURRENT_DATE - si.invoice_date <= 30 
                        THEN si.final_amount - COALESCE(si.paid_amount, 0) ELSE 0 END), 0) as current,
                    COALESCE(SUM(CASE WHEN CURRENT_DATE - si.invoice_date BETWEEN 31 AND 60 
                        THEN si.final_amount - COALESCE(si.paid_amount, 0) ELSE 0 END), 0) as days_31_60,
                    COALESCE(SUM(CASE WHEN CURRENT_DATE - si.invoice_date BETWEEN 61 AND 90 
                        THEN si.final_amount - COALESCE(si.paid_amount, 0) ELSE 0 END), 0) as days_61_90,
                    COALESCE(SUM(CASE WHEN CURRENT_DATE - si.invoice_date > 90 
                        THEN si.final_amount - COALESCE(si.paid_amount, 0) ELSE 0 END), 0) as over_90
                FROM purchases.supplier_invoices si
                JOIN parties.suppliers s ON si.supplier_id = s.supplier_id AND si.org_id = s.org_id
                WHERE si.payment_status != 'paid' AND si.invoice_status != 'cancelled'
                AND si.final_amount > COALESCE(si.paid_amount, 0)
                AND si.org_id = :org_id
                GROUP BY s.supplier_id, s.supplier_name, s.primary_phone
                ORDER BY total_payable DESC
            """), {"org_id": org_id})
        
        aging_data = [dict(row._mapping) for row in result]
        
        total_key = "total_outstanding" if party_type == "customer" else "total_payable"
        
        return {
            "party_type": party_type,
            "aging_data": aging_data,
            "summary": {
                "total": sum(a.get(total_key, 0) or 0 for a in aging_data),
                "current": sum(a.get("current", 0) or 0 for a in aging_data),
                "overdue": sum((a.get("days_31_60", 0) or 0) + (a.get("days_61_90", 0) or 0) + (a.get("over_90", 0) or 0) for a in aging_data),
                "party_count": len(aging_data)
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting aging analysis: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get aging analysis: {str(e)}")


# ============================================================================
# ENTERPRISE FEATURES
# ============================================================================

@router.get("/opening-balance/{party_id}")
@with_tenant_context
async def get_opening_balance(
    party_id: int,
    as_of_date: date = Query(..., description="Calculate opening balance as of this date"),
    party_type: str = Query("customer", regex="^(customer|supplier)$"),
    _: dict = Depends(PermissionChecker("reports", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get opening balance for a party as of a specific date
    
    Enterprise feature: Used for period-based ledger reports
    """
    try:
        org_id = str(context.org_id)
        
        if party_type == "customer":
            # Sum of all invoices before date - sum of all payments before date
            result = db.execute(text("""
                SELECT
                    COALESCE(SUM(CASE WHEN type = 'invoice' THEN amount ELSE 0 END), 0) -
                    COALESCE(SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END), 0) as opening_balance
                FROM (
                    SELECT 'invoice' as type, final_amount as amount
                    FROM sales.invoices
                    WHERE customer_id = :party_id AND org_id = :org_id
                    AND invoice_date < :as_of_date AND invoice_status != 'cancelled'
                    
                    UNION ALL
                    
                    SELECT 'payment' as type, payment_amount as amount
                    FROM financial.payments
                    WHERE party_id = :party_id AND party_type = 'customer' AND org_id = :org_id
                    AND payment_date < :as_of_date AND payment_status != 'cancelled'
                ) combined
            """), {"party_id": party_id, "org_id": org_id, "as_of_date": as_of_date}).fetchone()
        else:
            result = db.execute(text("""
                SELECT
                    COALESCE(SUM(CASE WHEN type = 'invoice' THEN amount ELSE 0 END), 0) -
                    COALESCE(SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END), 0) as opening_balance
                FROM (
                    SELECT 'invoice' as type, final_amount as amount
                    FROM purchases.supplier_invoices
                    WHERE supplier_id = :party_id AND org_id = :org_id
                    AND invoice_date < :as_of_date AND invoice_status != 'cancelled'
                    
                    UNION ALL
                    
                    SELECT 'payment' as type, payment_amount as amount
                    FROM financial.payments
                    WHERE party_id = :party_id AND party_type = 'supplier' AND org_id = :org_id
                    AND payment_date < :as_of_date AND payment_status != 'cancelled'
                ) combined
            """), {"party_id": party_id, "org_id": org_id, "as_of_date": as_of_date}).fetchone()
        
        opening = float(result.opening_balance) if result else 0
        
        return {
            "party_id": party_id,
            "party_type": party_type,
            "as_of_date": as_of_date.isoformat(),
            "opening_balance": opening,
            "balance_type": "Dr" if opening > 0 else ("Cr" if opening < 0 else "Nil")
        }
        
    except Exception as e:
        logger.error(f"Error getting opening balance: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get opening balance: {str(e)}")


@router.get("/last-payment/{party_id}")
@with_tenant_context
async def get_last_payment_info(
    party_id: int,
    party_type: str = Query("customer", regex="^(customer|supplier)$"),
    _: dict = Depends(PermissionChecker("reports", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get last payment information for a party
    
    Enterprise feature: Quick view for collection follow-up
    """
    try:
        result = db.execute(text("""
            SELECT 
                payment_id, payment_number, payment_date, payment_amount,
                payment_mode, CURRENT_DATE - payment_date as days_since
            FROM financial.payments
            WHERE party_id = :party_id AND party_type = :party_type AND org_id = :org_id
            AND payment_status != 'cancelled'
            ORDER BY payment_date DESC
            LIMIT 1
        """), {
            "party_id": party_id, 
            "party_type": party_type,
            "org_id": str(context.org_id)
        }).fetchone()
        
        if result:
            return {
                "party_id": party_id,
                "has_payments": True,
                "last_payment": {
                    "payment_id": result.payment_id,
                    "payment_number": result.payment_number,
                    "payment_date": result.payment_date.isoformat() if result.payment_date else None,
                    "amount": float(result.payment_amount),
                    "mode": result.payment_mode,
                    "days_since": result.days_since
                }
            }
        else:
            return {
                "party_id": party_id,
                "has_payments": False,
                "last_payment": None
            }
            
    except Exception as e:
        logger.error(f"Error getting last payment: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get last payment: {str(e)}")


@router.get("/interest-calculation/{party_id}")
@with_tenant_context
async def calculate_interest_on_overdue(
    party_id: int,
    interest_rate: float = Query(18.0, ge=0, le=36, description="Annual interest rate %"),
    party_type: str = Query("customer", regex="^(customer|supplier)$"),
    _: dict = Depends(PermissionChecker("reports", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Calculate interest on overdue amounts
    
    Enterprise feature: For interest debit notes and follow-up
    """
    try:
        org_id = str(context.org_id)
        
        if party_type == "customer":
            result = db.execute(text("""
                SELECT 
                    invoice_id, invoice_number, invoice_date, due_date,
                    (final_amount - COALESCE(paid_amount, 0)) as outstanding,
                    GREATEST(0, CURRENT_DATE - due_date) as days_overdue
                FROM sales.invoices
                WHERE customer_id = :party_id AND org_id = :org_id
                AND payment_status IN ('unpaid', 'partial')
                AND invoice_status != 'cancelled'
                AND due_date < CURRENT_DATE
                ORDER BY due_date
            """), {"party_id": party_id, "org_id": org_id})
        else:
            result = db.execute(text("""
                SELECT 
                    invoice_id, invoice_number, invoice_date, due_date,
                    (final_amount - COALESCE(paid_amount, 0)) as outstanding,
                    GREATEST(0, CURRENT_DATE - due_date) as days_overdue
                FROM purchases.supplier_invoices
                WHERE supplier_id = :party_id AND org_id = :org_id
                AND payment_status IN ('unpaid', 'partial')
                AND invoice_status != 'cancelled'
                AND due_date < CURRENT_DATE
                ORDER BY due_date
            """), {"party_id": party_id, "org_id": org_id})
        
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
        
    except Exception as e:
        logger.error(f"Error calculating interest: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to calculate interest: {str(e)}")


@router.get("/summary")
@with_tenant_context
async def get_ledger_summary(
    party_type: str = Query("customer", regex="^(customer|supplier)$"),
    _: dict = Depends(PermissionChecker("reports", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get overall ledger summary for all parties
    
    Enterprise feature: Dashboard and management overview
    """
    try:
        org_id = str(context.org_id)
        
        if party_type == "customer":
            result = db.execute(text("""
                SELECT
                    COUNT(DISTINCT c.customer_id) as total_parties,
                    COUNT(DISTINCT CASE WHEN i.payment_status != 'paid' THEN c.customer_id END) as parties_with_dues,
                    COALESCE(SUM(i.final_amount - COALESCE(i.paid_amount, 0)), 0) as total_receivable,
                    COALESCE(SUM(CASE WHEN i.due_date < CURRENT_DATE 
                        THEN i.final_amount - COALESCE(i.paid_amount, 0) ELSE 0 END), 0) as total_overdue,
                    COUNT(DISTINCT i.invoice_id) as total_pending_invoices
                FROM parties.customers c
                LEFT JOIN sales.invoices i ON c.customer_id = i.customer_id 
                    AND c.org_id = i.org_id 
                    AND i.invoice_status != 'cancelled'
                    AND i.payment_status != 'paid'
                WHERE c.org_id = :org_id AND c.is_active = true
            """), {"org_id": org_id}).fetchone()
            
            return {
                "party_type": party_type,
                "total_parties": result.total_parties or 0,
                "parties_with_dues": result.parties_with_dues or 0,
                "total_receivable": float(result.total_receivable or 0),
                "total_overdue": float(result.total_overdue or 0),
                "pending_invoices": result.total_pending_invoices or 0,
                "collection_efficiency": round(
                    100 - (float(result.total_overdue or 0) / float(result.total_receivable or 1) * 100), 2
                ) if result.total_receivable else 100
            }
        else:
            result = db.execute(text("""
                SELECT
                    COUNT(DISTINCT s.supplier_id) as total_parties,
                    COUNT(DISTINCT CASE WHEN si.payment_status != 'paid' THEN s.supplier_id END) as parties_with_dues,
                    COALESCE(SUM(si.final_amount - COALESCE(si.paid_amount, 0)), 0) as total_payable,
                    COALESCE(SUM(CASE WHEN si.due_date < CURRENT_DATE 
                        THEN si.final_amount - COALESCE(si.paid_amount, 0) ELSE 0 END), 0) as total_overdue,
                    COUNT(DISTINCT si.invoice_id) as total_pending_invoices
                FROM parties.suppliers s
                LEFT JOIN purchases.supplier_invoices si ON s.supplier_id = si.supplier_id 
                    AND s.org_id = si.org_id 
                    AND si.invoice_status != 'cancelled'
                    AND si.payment_status != 'paid'
                WHERE s.org_id = :org_id AND s.is_active = true
            """), {"org_id": org_id}).fetchone()
            
            return {
                "party_type": party_type,
                "total_parties": result.total_parties or 0,
                "parties_with_dues": result.parties_with_dues or 0,
                "total_payable": float(result.total_payable or 0),
                "total_overdue": float(result.total_overdue or 0),
                "pending_invoices": result.total_pending_invoices or 0
            }
            
    except Exception as e:
        logger.error(f"Error getting ledger summary: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get ledger summary: {str(e)}")


@router.get("/top-debtors")
@with_tenant_context
async def get_top_debtors(
    limit: int = Query(10, ge=1, le=100),
    _: dict = Depends(PermissionChecker("reports", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get top debtors by outstanding amount
    
    Enterprise feature: Priority collection list
    """
    try:
        result = db.execute(text("""
            SELECT
                c.customer_id, c.customer_name, c.primary_phone,
                COALESCE(SUM(i.final_amount - COALESCE(i.paid_amount, 0)), 0) as outstanding,
                COUNT(i.invoice_id) as invoice_count,
                MIN(i.due_date) as oldest_due_date,
                MAX(p.payment_date) as last_payment_date
            FROM parties.customers c
            LEFT JOIN sales.invoices i ON c.customer_id = i.customer_id 
                AND c.org_id = i.org_id 
                AND i.invoice_status != 'cancelled'
                AND i.payment_status != 'paid'
            LEFT JOIN financial.payments p ON c.customer_id = p.party_id 
                AND p.party_type = 'customer' 
                AND c.org_id = p.org_id
                AND p.payment_status != 'cancelled'
            WHERE c.org_id = :org_id AND c.is_active = true
            GROUP BY c.customer_id, c.customer_name, c.primary_phone
            HAVING COALESCE(SUM(i.final_amount - COALESCE(i.paid_amount, 0)), 0) > 0
            ORDER BY outstanding DESC
            LIMIT :limit
        """), {"org_id": str(context.org_id), "limit": limit})
        
        debtors = []
        for row in result:
            debtors.append({
                "customer_id": row.customer_id,
                "customer_name": row.customer_name,
                "phone": row.primary_phone,
                "outstanding": float(row.outstanding),
                "invoice_count": row.invoice_count,
                "oldest_due_date": row.oldest_due_date.isoformat() if row.oldest_due_date else None,
                "last_payment_date": row.last_payment_date.isoformat() if row.last_payment_date else None,
                "days_since_payment": (date.today() - row.last_payment_date).days if row.last_payment_date else None
            })
        
        return {
            "top_debtors": debtors,
            "total_outstanding": sum(d["outstanding"] for d in debtors)
        }
        
    except Exception as e:
        logger.error(f"Error getting top debtors: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get top debtors: {str(e)}")

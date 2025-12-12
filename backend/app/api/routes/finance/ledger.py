"""
Ledger API - Party ledger statements and aging analysis

MODERNIZED: Uses TenantAwareSession + PermissionChecker + OrgContext + LedgerService
Supports: Customers, Suppliers, Credit/Debit Notes, Sales Returns, Pagination
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
import logging
from datetime import date

from ....core.tenant_service import TenantAwareSession, get_tenant_aware_db, with_tenant_context
from ....core.org_context import OrgContext, get_org_context
from ....core.permissions import PermissionChecker
from ....core.constants import InvoiceStatus, PaymentRecordStatus, PartyType
from ...services.ledger_service import LedgerService

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
        
        # Get statement from service
        statement_data = LedgerService.get_party_statement(
            db, party_id, party_type, org_id, from_date, to_date
        )
        
        # Apply pagination
        all_transactions = statement_data["transactions"]
        total_count = statement_data["transaction_count"]
        paginated = all_transactions[offset:offset + limit]
        
        # Get party details
        if party_type == "customer":
            party = db.execute(text("""
                SELECT customer_name as name, primary_phone, primary_email, credit_limit
                FROM parties.customers
                WHERE customer_id = :party_id AND org_id = :org_id
            """), {"party_id": party_id, "org_id": org_id}).fetchone()
            
            # Get additional customer summary
            balance_data = LedgerService.get_party_balance(db, party_id, party_type, org_id)
            
            return {
                "success": True,
                "party": {
                    "id": party_id,
                    "type": party_type,
                    "name": party.name if party else f"Customer {party_id}",
                    "phone": party.primary_phone if party else None,
                    "email": party.primary_email if party else None,
                    "credit_limit": float(party.credit_limit) if party and party.credit_limit else None
                },
                "statement": paginated,
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total_count,
                    "pages": (total_count + limit - 1) // limit
                },
                "summary": {
                    "outstanding": balance_data.get("outstanding", 0),
                    "advance": balance_data.get("advance", 0),
                    "net_balance": balance_data.get("net_balance", 0),
                    "transaction_count": total_count,
                    "final_balance": statement_data["final_balance"]
                }
            }
        else:
            party = db.execute(text("""
                SELECT supplier_name as name, primary_phone, primary_email
                FROM parties.suppliers
                WHERE supplier_id = :party_id AND org_id = :org_id
            """), {"party_id": party_id, "org_id": org_id}).fetchone()
            
            final_balance = statement_data["final_balance"]
            
            return {
                "success": True,
                "party": {
                    "id": party_id,
                    "type": party_type,
                    "name": party.name if party else f"Supplier {party_id}",
                    "phone": party.primary_phone if party else None,
                    "email": party.primary_email if party else None
                },
                "statement": paginated,
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total_count,
                    "pages": (total_count + limit - 1) // limit
                },
                "summary": {
                    "payable": final_balance if final_balance > 0 else 0,
                    "advance": abs(final_balance) if final_balance < 0 else 0,
                    "net_balance": final_balance,
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
        return LedgerService.get_party_balance(
            db, party_id, party_type, str(context.org_id)
        )
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
        return LedgerService.get_outstanding_bills(
            db, party_id, party_type, str(context.org_id)
        )
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
        return LedgerService.get_aging_analysis(
            db, party_type, str(context.org_id)
        )
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
                    AND invoice_date < :as_of_date AND invoice_status != :cancelled_status
                    
                    UNION ALL
                    
                    SELECT 'payment' as type, payment_amount as amount
                    FROM financial.payments
                    WHERE party_id = :party_id AND party_type = :customer_type AND org_id = :org_id
                    AND payment_date < :as_of_date AND payment_status != :cancelled_status
                ) combined
            """), {
                "party_id": party_id, 
                "org_id": org_id, 
                "as_of_date": as_of_date,
                "cancelled_status": InvoiceStatus.CANCELLED.value,
                "customer_type": PartyType.CUSTOMER.value
            }).fetchone()
        else:
            result = db.execute(text("""
                SELECT
                    COALESCE(SUM(CASE WHEN type = 'invoice' THEN amount ELSE 0 END), 0) -
                    COALESCE(SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END), 0) as opening_balance
                FROM (
                    SELECT 'invoice' as type, final_amount as amount
                    FROM purchases.supplier_invoices
                    WHERE supplier_id = :party_id AND org_id = :org_id
                    AND invoice_date < :as_of_date AND invoice_status != :cancelled_status
                    
                    UNION ALL
                    
                    SELECT 'payment' as type, payment_amount as amount
                    FROM financial.payments
                    WHERE party_id = :party_id AND party_type = :supplier_type AND org_id = :org_id
                    AND payment_date < :as_of_date AND payment_status != :cancelled_status
                ) combined
            """), {
                "party_id": party_id, 
                "org_id": org_id, 
                "as_of_date": as_of_date,
                "cancelled_status": InvoiceStatus.CANCELLED.value,
                "supplier_type": PartyType.SUPPLIER.value
            }).fetchone()
        
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
            AND payment_status != :cancelled_status
            ORDER BY payment_date DESC
            LIMIT 1
        """), {
            "party_id": party_id, 
            "party_type": party_type,
            "org_id": str(context.org_id),
            "cancelled_status": PaymentRecordStatus.CANCELLED.value
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

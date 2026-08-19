"""
Ledger API - Party ledger statements and aging analysis
REFACTORED: Uses LedgerService for database operations
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
import logging
from datetime import date
from decimal import Decimal

from .....core.auth.tenant_service import TenantAwareSession, get_tenant_aware_db, with_tenant_context
from .....core.auth.org_context import OrgContext, get_org_context
from .....core.security.permissions import PermissionChecker
from .....core.money import money_json
from ....services.finance.ledger.service import LedgerService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ledger", tags=["Ledger"])

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
    party_type: str = Query("customer", pattern="^(customer|supplier)$"),
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    _: dict = Depends(PermissionChecker("reports", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get party ledger statement with running balance"""
    try:
        org_id = str(context.org_id)
        offset = (page - 1) * limit
        
        statement_data = LedgerService.get_party_statement(db, party_id, party_type, org_id, from_date, to_date)
        all_transactions = statement_data["transactions"]
        total_count = statement_data["transaction_count"]
        paginated = all_transactions[offset:offset + limit]
        
        if party_type == "customer":
            party = LedgerService.get_customer_details(db, org_id, party_id)
            balance_data = LedgerService.get_party_balance(db, party_id, party_type, org_id)
            return {
                "success": True,
                "party": {"id": party_id, "type": party_type,
                         "name": party["name"] if party else f"Customer {party_id}",
                         "phone": party.get("primary_phone") if party else None,
                         "email": party.get("primary_email") if party else None,
                         "credit_limit": money_json(party["credit_limit"]) if party and party.get("credit_limit") else None},
                "statement": paginated,
                "pagination": {"page": page, "limit": limit, "total": total_count, "pages": (total_count + limit - 1) // limit},
                "summary": {"outstanding": balance_data.get("outstanding", 0), "advance": balance_data.get("advance", 0),
                           "net_balance": balance_data.get("net_balance", 0), "transaction_count": total_count,
                           "final_balance": statement_data["final_balance"]}
            }
        else:
            party = LedgerService.get_supplier_details(db, org_id, party_id)
            final_balance = statement_data["final_balance"]
            return {
                "success": True,
                "party": {"id": party_id, "type": party_type,
                         "name": party["name"] if party else f"Supplier {party_id}",
                         "phone": party.get("primary_phone") if party else None,
                         "email": party.get("primary_email") if party else None},
                "statement": paginated,
                "pagination": {"page": page, "limit": limit, "total": total_count, "pages": (total_count + limit - 1) // limit},
                "summary": {"payable": final_balance if final_balance > 0 else 0,
                           "advance": abs(final_balance) if final_balance < 0 else 0,
                           "net_balance": final_balance, "transaction_count": total_count}
            }
    except Exception as e:
        logger.error(f"Error getting party statement: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get statement: {str(e)}")

@router.get("/balance/{party_id}")
@with_tenant_context
async def get_balance(
    party_id: int,
    party_type: str = Query("customer", pattern="^(customer|supplier)$"),
    _: dict = Depends(PermissionChecker("reports", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get party balance (quick summary)"""
    try:
        return LedgerService.get_party_balance(db, party_id, party_type, str(context.org_id))
    except Exception as e:
        logger.error(f"Error getting balance: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get balance: {str(e)}")

@router.get("/outstanding/{party_id}")
@with_tenant_context
async def get_outstanding_bills(
    party_id: int,
    party_type: str = Query("customer", pattern="^(customer|supplier)$"),
    _: dict = Depends(PermissionChecker("reports", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get outstanding bills for a party"""
    try:
        return LedgerService.get_outstanding_bills(db, party_id, party_type, str(context.org_id))
    except Exception as e:
        logger.error(f"Error getting outstanding bills: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get outstanding bills: {str(e)}")

@router.get("/aging")
@with_tenant_context
async def get_aging_analysis(
    party_type: str = Query("customer", pattern="^(customer|supplier)$"),
    _: dict = Depends(PermissionChecker("reports", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get aging analysis for all parties"""
    try:
        return LedgerService.get_aging_analysis(db, party_type, str(context.org_id))
    except Exception as e:
        logger.error(f"Error getting aging analysis: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get aging analysis: {str(e)}")

@router.get("/opening-balance/{party_id}")
@with_tenant_context
async def get_opening_balance(
    party_id: int,
    as_of_date: date = Query(..., description="Calculate opening balance as of this date"),
    party_type: str = Query("customer", pattern="^(customer|supplier)$"),
    _: dict = Depends(PermissionChecker("reports", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get opening balance for a party as of a specific date"""
    try:
        org_id = str(context.org_id)
        if party_type == "customer":
            opening = LedgerService.get_opening_balance_customer(db, org_id, party_id, as_of_date)
        else:
            opening = LedgerService.get_opening_balance_supplier(db, org_id, party_id, as_of_date)
        return {"party_id": party_id, "party_type": party_type, "as_of_date": as_of_date.isoformat(),
                "opening_balance": opening, "balance_type": "Dr" if opening > 0 else ("Cr" if opening < 0 else "Nil")}
    except Exception as e:
        logger.error(f"Error getting opening balance: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get opening balance: {str(e)}")

@router.get("/last-payment/{party_id}")
@with_tenant_context
async def get_last_payment_info(
    party_id: int,
    party_type: str = Query("customer", pattern="^(customer|supplier)$"),
    _: dict = Depends(PermissionChecker("reports", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get last payment information for a party"""
    try:
        result = LedgerService.get_last_payment(db, str(context.org_id), party_id, party_type)
        if result:
            return {"party_id": party_id, "has_payments": True, "last_payment": {
                "payment_id": result["payment_id"], "payment_number": result["payment_number"],
                "payment_date": result["payment_date"].isoformat() if result.get("payment_date") else None,
                "amount": money_json(result["payment_amount"]), "mode": result["payment_mode"],
                "days_since": result["days_since"]
            }}
        return {"party_id": party_id, "has_payments": False, "last_payment": None}
    except Exception as e:
        logger.error(f"Error getting last payment: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get last payment: {str(e)}")

@router.get("/interest-calculation/{party_id}")
@with_tenant_context
async def calculate_interest_on_overdue(
    party_id: int,
    interest_rate: float = Query(18.0, ge=0, le=36, description="Annual interest rate %"),
    party_type: str = Query("customer", pattern="^(customer|supplier)$"),
    _: dict = Depends(PermissionChecker("reports", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Calculate interest on overdue amounts"""
    try:
        return LedgerService.calculate_interest_on_overdue(db, party_id, party_type, str(context.org_id), interest_rate)
    except Exception as e:
        logger.error(f"Error calculating interest: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to calculate interest: {str(e)}")

@router.get("/summary")
@with_tenant_context
async def get_ledger_summary(
    party_type: str = Query("customer", pattern="^(customer|supplier)$"),
    _: dict = Depends(PermissionChecker("reports", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get overall ledger summary for all parties"""
    try:
        return LedgerService.get_ledger_summary(db, party_type, str(context.org_id))
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
    """Get top debtors by outstanding amount"""
    try:
        debtors = LedgerService.get_top_debtors(db, str(context.org_id), limit)
        return {"top_debtors": [{"customer_id": d["customer_id"], "customer_name": d["customer_name"],
                                "phone": d.get("phone"), "outstanding": money_json(d["outstanding"]),
                                "invoice_count": d["invoice_count"],
                                "last_invoice_date": d["last_invoice_date"].isoformat() if d.get("last_invoice_date") else None
                               } for d in debtors],
                "total_outstanding": money_json(sum(
                    (Decimal(str(d["outstanding"])) for d in debtors), Decimal("0")
                ))}
    except Exception as e:
        logger.error(f"Error getting top debtors: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get top debtors: {str(e)}")

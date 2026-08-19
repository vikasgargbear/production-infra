"""
Expense Claims management endpoints
REFACTORED: Uses ExpenseService for database operations
"""
from typing import Optional, List
from datetime import date, datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
import logging
from ....services.document_number_service import (
    DocumentNumberService,
    document_number_reservation_openapi,
)
from ....services.finance.expense.service import ExpenseService
from ....schemas.finance.mutations import ExpenseClaimCreateResponse

from .....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from .....core.auth.org_context import get_org_context, OrgContext
from .....core.security.permissions import PermissionChecker
from .....core.money import money_json

logger = logging.getLogger(__name__)

router = APIRouter(tags=["expense-claims"])

class ExpenseLineCreate(BaseModel):
    expense_type: str
    description: str
    amount: Decimal = Field(..., gt=0)
    expense_date: date
    receipt_attached: bool = Field(default=False)
    receipt_reference: Optional[str] = None

class ExpenseClaimCreate(BaseModel):
    employee_id: Optional[int] = None
    employee_name: str
    claim_date: date = Field(default_factory=date.today)
    purpose: str
    expenses: List[ExpenseLineCreate] = Field(..., min_length=1)
    created_by: Optional[int] = None

@router.post(
    "/generate-claim-number",
    operation_id="finance_reserve_expense_claim_number_v1",
    summary="Reserve an expense claim number",
    openapi_extra=document_number_reservation_openapi("finance.create"),
)
@with_tenant_context
async def generate_claim_number(
    _: dict = Depends(PermissionChecker("finance", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Reserve and commit the next organization-scoped expense claim number."""
    try:
        claim_number = DocumentNumberService.reserve_number(
            db, "expense_claim", str(context.org_id)
        )
        return {"claim_number": claim_number, "generated_at": datetime.now(timezone.utc).isoformat()}
    except Exception as e:
        logger.error(f"Error generating claim number: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to reserve expense claim number")

@router.get("/expense-types")
@with_tenant_context
async def get_expense_types():
    """Get list of available expense types"""
    return {
        "expense_types": [
            {"code": "TRAVEL", "name": "Travel"}, {"code": "ACCOMMODATION", "name": "Accommodation"},
            {"code": "MEALS", "name": "Meals"}, {"code": "OFFICE_SUPPLIES", "name": "Office Supplies"},
            {"code": "COMMUNICATION", "name": "Communication"}, {"code": "MEDICAL", "name": "Medical"},
            {"code": "TRAINING", "name": "Training"}, {"code": "FUEL", "name": "Fuel"},
            {"code": "PARKING", "name": "Parking"}, {"code": "OTHER", "name": "Other"}
        ]
    }

@router.post("", response_model=ExpenseClaimCreateResponse)
@with_tenant_context
async def create_expense_claim(
    claim: ExpenseClaimCreate,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Create a new expense claim"""
    try:
        org_id = str(context.org_id)
        claim_number = DocumentNumberService.generate_number(db.session, "expense_claim", org_id)
        
        if not claim.created_by:
            claim.created_by = ExpenseService.get_active_user(db, org_id)
            if not claim.created_by:
                raise HTTPException(status_code=400, detail="Unable to determine user")
        
        if not claim.employee_id:
            claim.employee_id = ExpenseService.find_employee_by_name(db, claim.employee_name)
            if not claim.employee_id:
                claim.employee_id = ExpenseService.create_employee(
                    db, f"EMP-{claim.employee_name.upper()[:3]}-{int(datetime.now().timestamp())}",
                    claim.employee_name
                )
        
        total_amount = sum(expense.amount for expense in claim.expenses)
        
        claim_id = ExpenseService.insert_expense_claim(db, {
            "org_id": org_id, "claim_number": claim_number, "employee_id": claim.employee_id,
            "claim_date": claim.claim_date, "purpose": claim.purpose, "total_amount": total_amount
        })
        
        for expense in claim.expenses:
            ExpenseService.insert_expense_item(db, {
                "claim_id": claim_id, "description": expense.description,
                "amount": expense.amount, "expense_date": expense.expense_date
            })
        
        return {
            "message": "Expense claim created successfully",
            "data": {"claim_id": claim_id, "claim_number": claim_number,
                     "total_amount": money_json(total_amount), "expenses_count": len(claim.expenses), "status": "submitted"}
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating expense claim: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create expense claim: {str(e)}")

@router.get("", response_model=dict)
@with_tenant_context
async def get_expense_claims(
    limit: int = Query(50, le=100), offset: int = Query(0, ge=0),
    status: Optional[str] = Query(None), employee_id: Optional[int] = Query(None),
    from_date: Optional[date] = Query(None), to_date: Optional[date] = Query(None),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get list of expense claims"""
    try:
        org_id = str(context.org_id)
        claims = ExpenseService.list_expense_claims(db, org_id, status, employee_id, from_date, to_date, limit, offset)
        total_count = ExpenseService.count_expense_claims(db, org_id, status, employee_id, from_date, to_date)
        return {"claims": claims, "total": total_count, "limit": limit, "offset": offset}
    except Exception as e:
        logger.error(f"Error getting expense claims: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve expense claims")

@router.get("/{claim_id}", response_model=dict)
@with_tenant_context
async def get_expense_claim_details(
    claim_id: int,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get detailed expense claim"""
    try:
        header = ExpenseService.get_expense_claim(db, str(context.org_id), claim_id)
        if not header:
            raise HTTPException(status_code=404, detail="Expense claim not found")
        items = ExpenseService.get_expense_claim_items(db, claim_id)
        return {"claim": header, "items": items}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting expense claim details: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve expense claim details")

@router.put("/{claim_id}/approve")
@with_tenant_context
async def approve_expense_claim(
    claim_id: int, approval_data: dict,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Approve expense claim"""
    try:
        claim = ExpenseService.get_claim_for_approval(db, str(context.org_id), claim_id)
        if not claim:
            raise HTTPException(status_code=404, detail="Expense claim not found")
        if claim["claim_status"] != 'submitted':
            raise HTTPException(status_code=400, detail=f"Claim is already {claim['claim_status']}")
        
        approved_amount = approval_data.get("approved_amount") or claim["total_amount"]
        approval_notes = approval_data.get("notes", "")
        
        ExpenseService.approve_claim(db, claim_id, approved_amount, approval_notes, 1)
        return {"message": "Expense claim approved successfully", "claim_id": claim_id,
                "approved_amount": money_json(approved_amount), "status": "approved"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error approving expense claim: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to approve expense claim")

@router.put("/{claim_id}/reject")
@with_tenant_context
async def reject_expense_claim(
    claim_id: int, rejection_data: dict,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Reject expense claim"""
    try:
        rejection_notes = rejection_data.get("notes", "")
        result = ExpenseService.reject_claim(db, str(context.org_id), claim_id, rejection_notes, 1)
        if result == 0:
            raise HTTPException(status_code=404, detail="Expense claim not found")
        return {"message": "Expense claim rejected successfully", "claim_id": claim_id, "status": "rejected"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error rejecting expense claim: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to reject expense claim")

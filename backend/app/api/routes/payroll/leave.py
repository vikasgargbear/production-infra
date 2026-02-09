"""
Leave Management API
Leave balances and applications
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, Dict, Any
import logging

from ....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from ....core.auth.org_context import get_org_context, OrgContext
from ...services.payroll.leave_service import LeaveService

logger = logging.getLogger(__name__)
router = APIRouter()


# ========== BALANCES ==========

@router.get("/balances", response_model=Dict[str, Any])
@with_tenant_context
async def get_leave_balances(
    financial_year: str = Query(..., description="e.g. 2025-2026"),
    employee_id: Optional[int] = None,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        data = LeaveService.get_balances(db, str(context.org_id), financial_year, employee_id)
        return {"success": True, "data": data}
    except Exception as e:
        logger.error(f"Error fetching leave balances: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/balances/initialize", response_model=Dict[str, Any])
@with_tenant_context
async def initialize_leave_balances(
    payload: Dict[str, Any],
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Initialize leave balances for all active employees for a financial year."""
    try:
        financial_year = payload.get("financial_year")
        if not financial_year:
            raise HTTPException(status_code=400, detail="financial_year required")

        count = LeaveService.initialize_balances(db, str(context.org_id), financial_year)
        return {"success": True, "count": count, "message": f"{count} leave balances initialized"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error initializing leave balances: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== APPLICATIONS ==========

@router.get("/applications", response_model=Dict[str, Any])
@with_tenant_context
async def list_leave_applications(
    status: Optional[str] = None,
    employee_id: Optional[int] = None,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        data, total = LeaveService.list_applications(
            db, str(context.org_id), status, employee_id, limit, offset
        )
        return {"success": True, "data": data, "total": total}
    except Exception as e:
        logger.error(f"Error listing leave applications: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/applications", response_model=Dict[str, Any])
@with_tenant_context
async def apply_for_leave(
    payload: Dict[str, Any],
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        result = LeaveService.apply_leave(db, str(context.org_id), {
            "employee_id": payload["employee_id"],
            "leave_policy_id": payload["leave_policy_id"],
            "from_date": payload["from_date"],
            "to_date": payload["to_date"],
            "number_of_days": payload["number_of_days"],
            "half_day": payload.get("half_day", False),
            "reason": payload.get("reason"),
        })
        return {"success": True, "data": result, "message": "Leave application submitted"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error applying for leave: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/applications/{application_id}/approve", response_model=Dict[str, Any])
@with_tenant_context
async def approve_leave_application(
    application_id: int,
    payload: Dict[str, Any],
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        result = LeaveService.approve_leave(
            db, str(context.org_id), application_id,
            payload["approved_by"], payload.get("remarks")
        )
        if not result:
            raise HTTPException(status_code=404, detail="Leave application not found or already processed")
        return {"success": True, "data": result, "message": "Leave approved"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error approving leave: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/applications/{application_id}/reject", response_model=Dict[str, Any])
@with_tenant_context
async def reject_leave_application(
    application_id: int,
    payload: Dict[str, Any],
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        result = LeaveService.reject_leave(
            db, str(context.org_id), application_id,
            payload["approved_by"], payload.get("remarks")
        )
        if not result:
            raise HTTPException(status_code=404, detail="Leave application not found or already processed")
        return {"success": True, "data": result, "message": "Leave rejected"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error rejecting leave: {e}")
        raise HTTPException(status_code=500, detail=str(e))

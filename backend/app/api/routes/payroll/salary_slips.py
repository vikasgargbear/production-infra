"""
Salary Slips API
View and manage generated payslips
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, Dict, Any
import logging

from ....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from ....core.auth.org_context import get_org_context, OrgContext
from ...services.payroll.salary_slip_service import SalarySlipService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=Dict[str, Any])
@with_tenant_context
async def list_salary_slips(
    run_id: Optional[int] = None,
    employee_id: Optional[int] = None,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        data, total = SalarySlipService.list_slips(
            db, str(context.org_id), run_id, employee_id, limit, offset
        )
        return {"success": True, "data": data, "total": total, "limit": limit, "offset": offset}
    except Exception as e:
        logger.error(f"Error listing salary slips: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{slip_id}", response_model=Dict[str, Any])
@with_tenant_context
async def get_salary_slip(
    slip_id: int,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        data = SalarySlipService.get_slip(db, str(context.org_id), slip_id)
        if not data:
            raise HTTPException(status_code=404, detail="Salary slip not found")
        return {"success": True, "data": data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching salary slip: {e}")
        raise HTTPException(status_code=500, detail=str(e))

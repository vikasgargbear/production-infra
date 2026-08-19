"""
Attendance API
Daily attendance marking and queries
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, Dict, Any, List
import logging

from ....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from ....core.auth.org_context import get_org_context, OrgContext
from ...services.payroll.attendance_service import AttendanceService
from ...schemas.payroll import AttendanceMutationResponse, PayrollCountResponse

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=Dict[str, Any])
@with_tenant_context
async def get_monthly_attendance(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    employee_id: Optional[int] = None,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        data = AttendanceService.get_monthly_attendance(
            db, str(context.org_id), year, month, employee_id
        )
        return {"success": True, "data": data}
    except Exception as e:
        logger.error(f"Error fetching attendance: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/summary", response_model=Dict[str, Any])
@with_tenant_context
async def get_attendance_summary(
    employee_id: int = Query(...),
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        data = AttendanceService.get_attendance_summary(
            db, str(context.org_id), employee_id, year, month
        )
        return {"success": True, "data": data}
    except Exception as e:
        logger.error(f"Error fetching attendance summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=AttendanceMutationResponse)
@with_tenant_context
async def mark_attendance(
    payload: Dict[str, Any],
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        result = AttendanceService.mark_attendance(db, str(context.org_id), {
            "employee_id": payload["employee_id"],
            "attendance_date": payload["attendance_date"],
            "status": payload["status"],
            "remarks": payload.get("remarks"),
            "leave_application_id": payload.get("leave_application_id"),
            "marked_by": payload.get("marked_by"),
        })
        return {"success": True, "data": result}
    except Exception as e:
        db.rollback()
        logger.error(f"Error marking attendance: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bulk", response_model=PayrollCountResponse)
@with_tenant_context
async def bulk_mark_attendance(
    payload: Dict[str, Any],
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Bulk mark attendance. Expects { records: [{employee_id, attendance_date, status}...] }"""
    try:
        records = payload.get("records", [])
        if not records:
            raise HTTPException(status_code=400, detail="No attendance records provided")

        count = AttendanceService.bulk_mark_attendance(
            db, str(context.org_id), records, payload.get("marked_by")
        )
        return {"success": True, "count": count, "message": f"{count} attendance records saved"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error bulk marking attendance: {e}")
        raise HTTPException(status_code=500, detail=str(e))

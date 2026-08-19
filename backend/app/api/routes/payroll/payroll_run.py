"""
Payroll Run API
Calculate, generate, and confirm payroll
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, Dict, Any
import logging

from ....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from ....core.auth.org_context import get_org_context, OrgContext
from ...services.payroll.payroll_calculation_service import PayrollCalculationService
from ...services.payroll.salary_slip_service import SalarySlipService
from ...services.payroll.payroll_report_service import PayrollReportService
from ...schemas.payroll import (
    PayrollCalculationResponse,
    PayrollRunConfirmationResponse,
    PayrollRunGenerationResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/runs", response_model=Dict[str, Any])
@with_tenant_context
async def list_payroll_runs(
    year: Optional[int] = None,
    limit: int = Query(20, ge=1, le=100),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        data = SalarySlipService.list_runs(db, str(context.org_id), year, limit)
        return {"success": True, "data": data}
    except Exception as e:
        logger.error(f"Error listing payroll runs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/runs/{run_id}", response_model=Dict[str, Any])
@with_tenant_context
async def get_payroll_run(
    run_id: int,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        data = SalarySlipService.get_run(db, str(context.org_id), run_id)
        if not data:
            raise HTTPException(status_code=404, detail="Payroll run not found")
        return {"success": True, "data": data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching payroll run: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calculate", response_model=PayrollCalculationResponse)
@with_tenant_context
async def calculate_payroll(
    payload: Dict[str, Any],
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Calculate payroll for a month (preview, no DB save)."""
    try:
        year = payload["year"]
        month = payload["month"]

        result = PayrollCalculationService.calculate_payroll(
            db, str(context.org_id), year, month
        )
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])

        return {"success": True, "data": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating payroll: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate", response_model=PayrollRunGenerationResponse)
@with_tenant_context
async def generate_payroll(
    payload: Dict[str, Any],
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Calculate + save payroll run and slips."""
    try:
        year = payload["year"]
        month = payload["month"]

        calculation = PayrollCalculationService.calculate_payroll(
            db, str(context.org_id), year, month
        )
        if calculation.get("error"):
            raise HTTPException(status_code=400, detail=calculation["error"])

        result = SalarySlipService.create_payroll_run(
            db, str(context.org_id), year, month, calculation,
            processed_by=payload.get("processed_by")
        )
        return {"success": True, "data": result, "message": "Payroll generated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error generating payroll: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/runs/{run_id}/confirm", response_model=PayrollRunConfirmationResponse)
@with_tenant_context
async def confirm_payroll_run(
    run_id: int,
    payload: Dict[str, Any],
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        result = SalarySlipService.confirm_payroll_run(
            db, str(context.org_id), run_id, payload.get("confirmed_by")
        )
        if not result:
            raise HTTPException(status_code=404, detail="Payroll run not found or not in calculated status")
        return {"success": True, "data": result, "message": "Payroll confirmed"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error confirming payroll: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== REPORTS ==========

@router.get("/reports/summary", response_model=Dict[str, Any])
@with_tenant_context
async def payroll_monthly_summary(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        data = PayrollReportService.monthly_summary(db, str(context.org_id), year, month)
        return {"success": True, "data": data}
    except Exception as e:
        logger.error(f"Error fetching payroll summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reports/pf-register", response_model=Dict[str, Any])
@with_tenant_context
async def pf_register(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        data = PayrollReportService.pf_register(db, str(context.org_id), year, month)
        return {"success": True, "data": data}
    except Exception as e:
        logger.error(f"Error fetching PF register: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reports/esi-register", response_model=Dict[str, Any])
@with_tenant_context
async def esi_register(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        data = PayrollReportService.esi_register(db, str(context.org_id), year, month)
        return {"success": True, "data": data}
    except Exception as e:
        logger.error(f"Error fetching ESI register: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reports/bank-sheet", response_model=Dict[str, Any])
@with_tenant_context
async def bank_transfer_sheet(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        data = PayrollReportService.bank_transfer_sheet(db, str(context.org_id), year, month)
        return {"success": True, "data": data}
    except Exception as e:
        logger.error(f"Error fetching bank transfer sheet: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reports/department-cost", response_model=Dict[str, Any])
@with_tenant_context
async def department_wise_cost(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        data = PayrollReportService.department_wise_cost(db, str(context.org_id), year, month)
        return {"success": True, "data": data}
    except Exception as e:
        logger.error(f"Error fetching department cost: {e}")
        raise HTTPException(status_code=500, detail=str(e))

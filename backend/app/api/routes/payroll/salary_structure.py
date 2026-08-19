"""
Salary Structure API
CRUD for payroll.salary_structures
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, Dict, Any
import logging

from ....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from ....core.auth.org_context import get_org_context, OrgContext
from ...services.payroll.salary_structure_service import SalaryStructureService
from ...schemas.payroll import SalaryStructureCreateResponse, SalaryStructureUpdateResponse

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=Dict[str, Any])
@with_tenant_context
async def list_salary_structures(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        data, total = SalaryStructureService.list_structures(
            db, str(context.org_id), search, is_active, limit, offset
        )
        return {"success": True, "data": data, "total": total, "limit": limit, "offset": offset}
    except Exception as e:
        logger.error(f"Error listing salary structures: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{structure_id}", response_model=Dict[str, Any])
@with_tenant_context
async def get_salary_structure(
    structure_id: int,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        data = SalaryStructureService.get_by_id(db, str(context.org_id), structure_id)
        if not data:
            raise HTTPException(status_code=404, detail="Salary structure not found")
        return {"success": True, "data": data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching salary structure: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/employee/{employee_id}", response_model=Dict[str, Any])
@with_tenant_context
async def get_employee_salary_structure(
    employee_id: int,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        data = SalaryStructureService.get_by_employee(db, str(context.org_id), employee_id)
        return {"success": True, "data": data}
    except Exception as e:
        logger.error(f"Error fetching employee salary structure: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=SalaryStructureCreateResponse)
@with_tenant_context
async def create_salary_structure(
    payload: Dict[str, Any],
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        result = SalaryStructureService.create(db, str(context.org_id), {
            "employee_id": payload["employee_id"],
            "basic_salary": payload.get("basic_salary", 0),
            "hra": payload.get("hra", 0),
            "dearness_allowance": payload.get("dearness_allowance", 0),
            "conveyance_allowance": payload.get("conveyance_allowance", 0),
            "medical_allowance": payload.get("medical_allowance", 0),
            "special_allowance": payload.get("special_allowance", 0),
            "other_allowance": payload.get("other_allowance", 0),
            "pf_applicable": payload.get("pf_applicable", True),
            "pf_percent": payload.get("pf_percent", 12.0),
            "esi_applicable": payload.get("esi_applicable", False),
            "professional_tax_applicable": payload.get("professional_tax_applicable", True),
            "effective_from": payload.get("effective_from"),
            "created_by": getattr(context, 'user_id', None),
        })
        return {"success": True, "data": result, "message": "Salary structure created"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating salary structure: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{structure_id}", response_model=SalaryStructureUpdateResponse)
@with_tenant_context
async def update_salary_structure(
    structure_id: int,
    payload: Dict[str, Any],
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        result = SalaryStructureService.update(db, str(context.org_id), structure_id, payload)
        if not result:
            raise HTTPException(status_code=404, detail="Salary structure not found")
        return {"success": True, "data": result, "message": "Salary structure updated"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating salary structure: {e}")
        raise HTTPException(status_code=500, detail=str(e))

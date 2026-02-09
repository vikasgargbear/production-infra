"""
Leave Policy API
CRUD for payroll.leave_policies
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any
import logging

from ....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from ....core.auth.org_context import get_org_context, OrgContext
from ...services.payroll.leave_service import LeaveService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=Dict[str, Any])
@with_tenant_context
async def list_leave_policies(
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        data = LeaveService.list_policies(db, str(context.org_id))
        return {"success": True, "data": data}
    except Exception as e:
        logger.error(f"Error listing leave policies: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=Dict[str, Any])
@with_tenant_context
async def create_leave_policy(
    payload: Dict[str, Any],
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        result = LeaveService.create_policy(db, str(context.org_id), {
            "leave_type": payload["leave_type"],
            "leave_name": payload["leave_name"],
            "annual_quota": payload.get("annual_quota", 0),
            "carry_forward": payload.get("carry_forward", False),
            "max_carry_forward": payload.get("max_carry_forward", 0),
            "max_consecutive_days": payload.get("max_consecutive_days", 3),
            "requires_document": payload.get("requires_document", False),
            "applicable_after_days": payload.get("applicable_after_days", 0),
        })
        return {"success": True, "data": result, "message": "Leave policy saved"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating leave policy: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{policy_id}", response_model=Dict[str, Any])
@with_tenant_context
async def update_leave_policy(
    policy_id: int,
    payload: Dict[str, Any],
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        result = LeaveService.update_policy(db, str(context.org_id), policy_id, payload)
        if not result:
            raise HTTPException(status_code=404, detail="Leave policy not found")
        return {"success": True, "data": result, "message": "Leave policy updated"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating leave policy: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{policy_id}", response_model=Dict[str, Any])
@with_tenant_context
async def delete_leave_policy(
    policy_id: int,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    try:
        deleted = LeaveService.delete_policy(db, str(context.org_id), policy_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Leave policy not found")
        return {"success": True, "message": "Leave policy deleted"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting leave policy: {e}")
        raise HTTPException(status_code=500, detail=str(e))

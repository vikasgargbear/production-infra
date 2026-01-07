"""
Branches API
CRUD operations for master.org_branches table
REFACTORED: All SQL moved to BranchService
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, Dict, Any
import logging
import json

from .....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from .....core.auth.org_context import get_org_context, OrgContext
from .....core.security.permissions import PermissionChecker

# Service layer
from ....services.master.department_branch_service import BranchService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/", response_model=Dict[str, Any])
@with_tenant_context
async def list_branches(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """List all branches"""
    try:
        branches, total = BranchService.list_branches(
            db, str(context.org_id), search, is_active, limit, offset
        )
        return {"success": True, "data": branches, "total": total, "limit": limit, "offset": offset}
    except Exception as e:
        logger.error(f"Error listing branches: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{branch_id}", response_model=Dict[str, Any])
@with_tenant_context
async def get_branch(
    branch_id: int,
    _: dict = Depends(PermissionChecker("master", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get branch by ID"""
    try:
        branch = BranchService.get_branch(db, str(context.org_id), branch_id)
        if not branch:
            raise HTTPException(status_code=404, detail="Branch not found")
        return {"success": True, "data": branch}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching branch: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", response_model=Dict[str, Any])
@with_tenant_context
async def create_branch(
    branch_data: Dict[str, Any],
    _: dict = Depends(PermissionChecker("master", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Create a new branch"""
    try:
        org_id = str(context.org_id)
        
        # Generate code if not provided
        branch_code = branch_data.get("branch_code")
        if not branch_code:
            count = BranchService.count_branches(db, org_id)
            branch_code = f"BR{count + 1:03d}"
        
        # Build address JSONB
        address_data = branch_data.get("address", {})
        if isinstance(address_data, str):
            address_jsonb = {
                "street": address_data,
                "city": branch_data.get("city", ""),
                "state": branch_data.get("state", ""),
                "pincode": branch_data.get("pincode", "")
            }
        elif isinstance(address_data, dict):
            address_jsonb = address_data
        else:
            address_jsonb = {}
        
        data = {
            "branch_code": branch_code,
            "branch_name": branch_data.get("branch_name"),
            "branch_type": branch_data.get("branch_type", "office"),
            "address": json.dumps(address_jsonb),
            "branch_phone": branch_data.get("phone") or branch_data.get("branch_phone"),
            "branch_email": branch_data.get("email") or branch_data.get("branch_email"),
            "branch_gst_number": branch_data.get("gstin") or branch_data.get("branch_gst_number"),
            "branch_manager_id": branch_data.get("manager_id") or branch_data.get("branch_manager_id"),
            "is_active": branch_data.get("is_active", True)
        }
        
        result = BranchService.insert_branch(db, org_id, data)
        return {"success": True, "data": result, "message": "Branch created successfully"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating branch: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{branch_id}", response_model=Dict[str, Any])
@with_tenant_context
async def update_branch(
    branch_id: int,
    branch_data: Dict[str, Any],
    _: dict = Depends(PermissionChecker("master", "edit")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Update branch"""
    try:
        update_fields = []
        params = {}
        
        # Handle address JSONB
        if "address" in branch_data:
            address_data = branch_data["address"]
            if isinstance(address_data, str):
                update_fields.append("address = :address")
                params["address"] = json.dumps({
                    "street": address_data,
                    "city": branch_data.get("city", ""),
                    "state": branch_data.get("state", ""),
                    "pincode": branch_data.get("pincode", "")
                })
            elif isinstance(address_data, dict):
                update_fields.append("address = :address")
                params["address"] = json.dumps(address_data)
        
        field_mapping = {
            "branch_name": "branch_name",
            "branch_code": "branch_code",
            "branch_type": "branch_type",
            "phone": "branch_phone",
            "branch_phone": "branch_phone",
            "email": "branch_email",
            "branch_email": "branch_email",
            "gstin": "branch_gst_number",
            "branch_gst_number": "branch_gst_number",
            "manager_id": "branch_manager_id",
            "branch_manager_id": "branch_manager_id",
            "is_active": "is_active"
        }
        
        for api_field, db_field in field_mapping.items():
            if api_field in branch_data:
                update_fields.append(f"{db_field} = :{db_field}")
                params[db_field] = branch_data[api_field]
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        result = BranchService.update_branch_dynamic(
            db, str(context.org_id), branch_id, update_fields, params
        )
        
        if not result:
            raise HTTPException(status_code=404, detail="Branch not found")
        
        return {"success": True, "data": result, "message": "Branch updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating branch: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{branch_id}", response_model=Dict[str, Any])
@with_tenant_context
async def delete_branch(
    branch_id: int,
    _: dict = Depends(PermissionChecker("master", "delete")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Delete (soft delete) branch"""
    try:
        result = BranchService.soft_delete_branch(db, str(context.org_id), branch_id)
        if not result:
            raise HTTPException(status_code=404, detail="Branch not found")
        return {"success": True, "message": f"Branch {result['branch_name']} deactivated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting branch: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

"""
Departments API
CRUD operations for master.departments table
REFACTORED: All SQL moved to DepartmentService
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, Dict, Any
import logging

from .....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from .....core.auth.org_context import get_org_context, OrgContext
from .....core.security.permissions import PermissionChecker

# Service layer
from ....services.master.department_branch_service import DepartmentService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/", response_model=Dict[str, Any])
@with_tenant_context
async def list_departments(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """List all departments"""
    try:
        departments, total = DepartmentService.list_departments(
            db, str(context.org_id), search, is_active, limit, offset
        )
        return {"success": True, "data": departments, "total": total, "limit": limit, "offset": offset}
    except Exception as e:
        logger.error(f"Error listing departments: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{department_id}", response_model=Dict[str, Any])
@with_tenant_context
async def get_department(
    department_id: int,
    _: dict = Depends(PermissionChecker("master", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get department by ID"""
    try:
        department = DepartmentService.get_department(db, str(context.org_id), department_id)
        if not department:
            raise HTTPException(status_code=404, detail="Department not found")
        return {"success": True, "data": department}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching department: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", response_model=Dict[str, Any])
@with_tenant_context
async def create_department(
    department_data: Dict[str, Any],
    _: dict = Depends(PermissionChecker("master", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Create a new department"""
    try:
        org_id = str(context.org_id)
        
        # Generate code if not provided
        department_code = department_data.get("department_code")
        if not department_code:
            count = DepartmentService.count_departments(db, org_id)
            department_code = f"DEPT{count + 1:03d}"
        
        data = {
            "department_code": department_code,
            "department_name": department_data.get("department_name"),
            "department_type": department_data.get("department_type"),
            "parent_department_id": department_data.get("parent_department_id"),
            "department_head_id": department_data.get("department_head_id"),
            "cost_center_code": department_data.get("cost_center_code"),
            "is_active": department_data.get("is_active", True)
        }
        
        result = DepartmentService.insert_department(db, org_id, data)
        return {"success": True, "data": result, "message": "Department created successfully"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating department: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{department_id}", response_model=Dict[str, Any])
@with_tenant_context
async def update_department(
    department_id: int,
    department_data: Dict[str, Any],
    _: dict = Depends(PermissionChecker("master", "edit")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Update department"""
    try:
        update_fields = []
        params = {}
        
        field_mapping = {
            "department_name": "department_name",
            "department_code": "department_code",
            "department_type": "department_type",
            "parent_department_id": "parent_department_id",
            "department_head_id": "department_head_id",
            "cost_center_code": "cost_center_code",
            "is_active": "is_active"
        }
        
        for api_field, db_field in field_mapping.items():
            if api_field in department_data:
                update_fields.append(f"{db_field} = :{db_field}")
                params[db_field] = department_data[api_field]
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        result = DepartmentService.update_department_dynamic(
            db, str(context.org_id), department_id, update_fields, params
        )
        
        if not result:
            raise HTTPException(status_code=404, detail="Department not found")
        
        return {"success": True, "data": result, "message": "Department updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating department: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{department_id}", response_model=Dict[str, Any])
@with_tenant_context
async def delete_department(
    department_id: int,
    _: dict = Depends(PermissionChecker("master", "delete")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Delete (soft delete) department"""
    try:
        result = DepartmentService.soft_delete_department(db, str(context.org_id), department_id)
        if not result:
            raise HTTPException(status_code=404, detail="Department not found")
        return {"success": True, "message": f"Department {result['department_name']} deactivated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting department: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

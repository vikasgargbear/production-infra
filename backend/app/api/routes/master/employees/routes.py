"""
Employee Management API
CRUD operations for master.employees table
REFACTORED: All SQL moved to EmployeeService
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, Dict, Any
from datetime import datetime, date
import logging
import json

from .....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from .....core.auth.org_context import get_org_context, OrgContext
from .....core.security.permissions import PermissionChecker

# Service layer
from ....services.master.employee.service import EmployeeService
from ....services.document_number_service import DocumentNumberService
from ....schemas.master.mutations import (
    EmployeeCreateResponse,
    EmployeeUpdateResponse,
    MasterDeleteResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ============== EMPLOYEE ENDPOINTS ==============

@router.get("", response_model=Dict[str, Any])
@with_tenant_context
async def list_employees(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """List all employees with pagination and search"""
    try:
        employees, total = EmployeeService.list_employees(
            db, str(context.org_id), search, is_active, limit, offset
        )
        
        return {
            "success": True,
            "data": employees,
            "total": total,
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        logger.error(f"Error listing employees: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{employee_id}", response_model=Dict[str, Any])
@with_tenant_context
async def get_employee(
    employee_id: int, 
    _: dict = Depends(PermissionChecker("master", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get employee by ID"""
    try:
        employee = EmployeeService.get_employee(db, str(context.org_id), employee_id)
        
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")
        
        return {
            "success": True,
            "data": employee
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching employee: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=EmployeeCreateResponse)
@with_tenant_context
async def create_employee(
    employee_data: Dict[str, Any], 
    _: dict = Depends(PermissionChecker("master", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Create a new employee"""
    try:
        org_id = str(context.org_id)
        
        # Generate employee code if not provided
        employee_code = employee_data.get("employee_code")
        if not employee_code:
            employee_code = DocumentNumberService.generate_number(db, "employee", org_id)
        
        # Extract name parts
        employee_name = employee_data.get("employee_name", "")
        name_parts = employee_name.split(" ", 1)
        first_name = name_parts[0] if name_parts else ""
        last_name = name_parts[1] if len(name_parts) > 1 else None
        
        # Get personal details
        personal_details = employee_data.get("personal_details", {})
        
        # Build address JSONB
        current_address = None
        if personal_details.get("address") or personal_details.get("city"):
            current_address = {
                "address": personal_details.get("address"),
                "city": personal_details.get("city"),
                "state": personal_details.get("state"),
                "pincode": personal_details.get("pincode")
            }
        
        data = {
            "employee_code": employee_code,
            "first_name": first_name,
            "last_name": last_name,
            "designation": employee_data.get("designation"),
            "department_id": employee_data.get("department_id"),
            "branch_id": employee_data.get("branch_id"),
            "joining_date": employee_data.get("date_of_joining") or None,
            "personal_mobile": personal_details.get("mobile") or employee_data.get("mobile"),
            "personal_email": personal_details.get("email") or employee_data.get("email") or None,
            "date_of_birth": personal_details.get("date_of_birth") or None,
            "gender": personal_details.get("gender") or None,
            "pan_number": personal_details.get("pan_number") or None,
            "aadhar_number": personal_details.get("aadhar_number") or None,
            "current_address": json.dumps(current_address) if current_address else None,
            "permanent_address": json.dumps(current_address) if current_address else None,
            "emergency_contact": json.dumps(employee_data.get("emergency_contact")) if employee_data.get("emergency_contact") else None,
            "bank_account_details": json.dumps(employee_data.get("bank_account_details")) if employee_data.get("bank_account_details") else None,
            "employment_status": 'active' if employee_data.get("is_active", True) else 'inactive'
        }
        
        result = EmployeeService.insert_employee(db, org_id, data)
        
        return {
            "success": True,
            "data": result,
            "message": "Employee created successfully"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating employee: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{employee_id}", response_model=EmployeeUpdateResponse)
@with_tenant_context
async def update_employee(
    employee_id: int,
    employee_data: Dict[str, Any], 
    _: dict = Depends(PermissionChecker("master", "edit")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Update employee"""
    try:
        org_id = str(context.org_id)
        
        # Build update query dynamically
        update_fields = []
        params = {}
        
        # Handle name update
        if "employee_name" in employee_data:
            name_parts = employee_data["employee_name"].split(" ", 1)
            update_fields.append("first_name = :first_name")
            params["first_name"] = name_parts[0] if name_parts else ""
            if len(name_parts) > 1:
                update_fields.append("last_name = :last_name")
                params["last_name"] = name_parts[1]
        
        # Get personal details
        personal_details = employee_data.get("personal_details", {})
        
        # Map API fields to database columns
        if "designation" in employee_data:
            update_fields.append("designation = :designation")
            params["designation"] = employee_data["designation"]
            
        if "department_id" in employee_data:
            update_fields.append("department_id = :department_id")
            params["department_id"] = employee_data["department_id"]
            
        if "branch_id" in employee_data:
            update_fields.append("branch_id = :branch_id")
            params["branch_id"] = employee_data["branch_id"]
            
        if "date_of_joining" in employee_data:
            update_fields.append("joining_date = :joining_date")
            params["joining_date"] = employee_data["date_of_joining"]
        
        # Personal details
        if personal_details.get("mobile") or employee_data.get("mobile"):
            update_fields.append("personal_mobile = :personal_mobile")
            params["personal_mobile"] = personal_details.get("mobile") or employee_data.get("mobile")
            
        if personal_details.get("email") or employee_data.get("email"):
            update_fields.append("personal_email = :personal_email")
            params["personal_email"] = personal_details.get("email") or employee_data.get("email")
            
        if personal_details.get("date_of_birth"):
            update_fields.append("date_of_birth = :date_of_birth")
            params["date_of_birth"] = personal_details["date_of_birth"]
            
        if personal_details.get("gender"):
            update_fields.append("gender = :gender")
            params["gender"] = personal_details["gender"]
            
        if personal_details.get("pan_number"):
            update_fields.append("pan_number = :pan_number")
            params["pan_number"] = personal_details["pan_number"]
            
        if personal_details.get("aadhar_number"):
            update_fields.append("aadhar_number = :aadhar_number")
            params["aadhar_number"] = personal_details["aadhar_number"]
        
        # Address
        if personal_details.get("address") or personal_details.get("city"):
            current_address = {
                "address": personal_details.get("address"),
                "city": personal_details.get("city"),
                "state": personal_details.get("state"),
                "pincode": personal_details.get("pincode")
            }
            update_fields.append("current_address = :current_address")
            params["current_address"] = json.dumps(current_address)
            
        # JSONB fields
        if "emergency_contact" in employee_data:
            update_fields.append("emergency_contact = :emergency_contact")
            params["emergency_contact"] = json.dumps(employee_data["emergency_contact"])
            
        if "bank_account_details" in employee_data:
            update_fields.append("bank_account_details = :bank_account_details")
            params["bank_account_details"] = json.dumps(employee_data["bank_account_details"])
        
        # Employment status
        if "is_active" in employee_data:
            update_fields.append("employment_status = :employment_status")
            params["employment_status"] = 'active' if employee_data["is_active"] else 'inactive'
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        result = EmployeeService.update_employee_dynamic(
            db, org_id, employee_id, update_fields, params
        )
        
        if not result:
            raise HTTPException(status_code=404, detail="Employee not found")
        
        return {
            "success": True,
            "data": result,
            "message": "Employee updated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating employee: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{employee_id}", response_model=MasterDeleteResponse)
@with_tenant_context
async def delete_employee(
    employee_id: int,
    _: dict = Depends(PermissionChecker("master", "delete")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Delete (soft delete) employee"""
    try:
        result = EmployeeService.soft_delete_employee(
            db, str(context.org_id), employee_id
        )
        
        if not result:
            raise HTTPException(status_code=404, detail="Employee not found")
        
        return {
            "success": True,
            "message": f"Employee {result['full_name']} deactivated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting employee: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

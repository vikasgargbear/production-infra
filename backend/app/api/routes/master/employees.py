"""
Employee Management API
CRUD operations for master.employees table
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy import text
from typing import List, Optional, Dict, Any
from datetime import datetime, date
import logging
import json

from ....core.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from ....core.org_context import get_org_context, OrgContext
from ....core.permissions import PermissionChecker
# get_org_id_string replaced with OrgContext

logger = logging.getLogger(__name__)
router = APIRouter()


# ============== EMPLOYEE ENDPOINTS ==============

@router.get("", response_model=Dict[str, Any])  # Empty string - handles both with/without trailing slash
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
        query = text("""
            SELECT 
                e.employee_id,
                e.employee_code,
                e.full_name as employee_name,
                e.first_name,
                e.last_name,
                e.designation,
                e.department_id,
                d.department_name,
                e.branch_id,
                b.branch_name,
                e.joining_date as date_of_joining,
                e.personal_mobile,
                e.personal_email,
                e.date_of_birth,
                e.gender,
                e.pan_number,
                e.aadhar_number,
                e.current_address,
                e.permanent_address,
                e.emergency_contact,
                e.bank_account_details,
                e.employment_status,
                CASE WHEN e.employment_status = 'active' THEN true ELSE false END as is_active,
                e.created_at
            FROM master.employees e
            LEFT JOIN master.departments d ON e.department_id = d.department_id AND d.org_id = e.org_id
            LEFT JOIN master.org_branches b ON e.branch_id = b.branch_id AND b.org_id = e.org_id
            WHERE e.org_id = :org_id
            AND (:search IS NULL OR 
                 LOWER(e.full_name) LIKE LOWER(:search_pattern) OR
                 LOWER(e.employee_code) LIKE LOWER(:search_pattern))
            AND (:is_active IS NULL OR (
                CASE WHEN :is_active THEN e.employment_status = 'active'
                ELSE e.employment_status != 'active' END
            ))
            ORDER BY e.full_name
            LIMIT :limit OFFSET :offset
        """)
        
        search_pattern = f"%{search}%" if search else None
        
        result = db.execute(query, {
            "org_id": str(context.org_id),
            "search": search,
            "search_pattern": search_pattern,
            "is_active": is_active,
            "limit": limit,
            "offset": offset
        })
        
        employees = []
        for row in result:
            employees.append(dict(row._mapping))
        
        # Get total count
        count_query = text("""
            SELECT COUNT(*) FROM master.employees e
            WHERE e.org_id = :org_id
            AND (:search IS NULL OR 
                 LOWER(e.full_name) LIKE LOWER(:search_pattern) OR
                 LOWER(e.employee_code) LIKE LOWER(:search_pattern))
            AND (:is_active IS NULL OR (
                CASE WHEN :is_active THEN e.employment_status = 'active'
                ELSE e.employment_status != 'active' END
            ))
        """)
        
        count_result = db.execute(count_query, {
            "org_id": str(context.org_id),
            "search": search,
            "search_pattern": search_pattern,
            "is_active": is_active
        })
        total = count_result.scalar()
        
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
        query = text("""
            SELECT 
                e.*,
                d.department_name,
                b.branch_name
            FROM master.employees e
            LEFT JOIN master.departments d ON e.department_id = d.department_id AND d.org_id = e.org_id
            LEFT JOIN master.org_branches b ON e.branch_id = b.branch_id AND b.org_id = e.org_id
            WHERE e.employee_id = :employee_id AND e.org_id = :org_id
        """)
        
        result = db.execute(query, {
            "employee_id": employee_id,
            "org_id": str(context.org_id)
        })
        employee = result.first()
        
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")
        
        return {
            "success": True,
            "data": dict(employee._mapping)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching employee: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", response_model=Dict[str, Any])
@with_tenant_context
async def create_employee(
    employee_data: Dict[str, Any], 
    _: dict = Depends(PermissionChecker("master", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Create a new employee"""
    try:
        # Generate employee code if not provided
        employee_code = employee_data.get("employee_code")
        if not employee_code:
            # Get next employee number
            count_query = text("""
                SELECT COUNT(*) FROM master.employees WHERE org_id = :org_id
            """)
            count_result = db.execute(count_query, {"org_id": str(context.org_id)})
            count = count_result.scalar() + 1
            employee_code = f"EMP{count:04d}"
        
        # Extract name parts
        employee_name = employee_data.get("employee_name", "")
        name_parts = employee_name.split(" ", 1)
        first_name = name_parts[0] if name_parts else ""
        last_name = name_parts[1] if len(name_parts) > 1 else None
        
        query = text("""
            INSERT INTO master.employees (
                org_id, employee_code, first_name, last_name,
                designation, department_id, branch_id, joining_date,
                personal_mobile, personal_email,
                date_of_birth, gender,
                pan_number, aadhar_number,
                current_address, permanent_address,
                emergency_contact, bank_account_details,
                employment_status
            ) VALUES (
                :org_id, :employee_code, :first_name, :last_name,
                :designation, :department_id, :branch_id, :joining_date,
                :personal_mobile, :personal_email,
                :date_of_birth, :gender,
                :pan_number, :aadhar_number,
                :current_address, :permanent_address,
                :emergency_contact, :bank_account_details,
                :employment_status
            ) RETURNING employee_id, full_name, employee_code
        """)
        
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
        
        result = db.execute(query, {
            "org_id": str(context.org_id),
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
        })
        
        # TenantAwareSession auto-commits
        row = result.first()
        
        return {
            "success": True,
            "data": {
                "employee_id": row[0],
                "employee_name": row[1],
                "employee_code": row[2]
            },
            "message": "Employee created successfully"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating employee: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{employee_id}", response_model=Dict[str, Any])
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
        # Build update query dynamically
        update_fields = []
        params = {
            "employee_id": employee_id,
            "org_id": str(context.org_id)
        }
        
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
        
        query = text(f"""
            UPDATE master.employees 
            SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP
            WHERE employee_id = :employee_id AND org_id = :org_id
            RETURNING employee_id, full_name
        """)
        
        result = db.execute(query, params)
        # TenantAwareSession auto-commits
        
        updated = result.first()
        if not updated:
            raise HTTPException(status_code=404, detail="Employee not found")
        
        return {
            "success": True,
            "data": {
                "employee_id": updated[0],
                "employee_name": updated[1]
            },
            "message": "Employee updated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating employee: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{employee_id}", response_model=Dict[str, Any])
@with_tenant_context
async def delete_employee(
    employee_id: int,
    _: dict = Depends(PermissionChecker("master", "delete")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Delete (soft delete) employee"""
    try:
        # Soft delete by setting employment_status to inactive
        query = text("""
            UPDATE master.employees 
            SET employment_status = 'inactive', updated_at = CURRENT_TIMESTAMP
            WHERE employee_id = :employee_id AND org_id = :org_id
            RETURNING employee_id, full_name
        """)
        
        result = db.execute(query, {
            "employee_id": employee_id,
            "org_id": str(context.org_id)
        })
        # TenantAwareSession auto-commits
        
        deleted = result.first()
        if not deleted:
            raise HTTPException(status_code=404, detail="Employee not found")
        
        return {
            "success": True,
            "message": f"Employee {deleted[1]} deactivated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting employee: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

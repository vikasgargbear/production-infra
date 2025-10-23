"""
Employee Management API
CRUD operations for master.employees table
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any
from datetime import datetime, date
import logging

from ...core.database import get_db
from ...core.auth_utils import get_org_id_from_header

logger = logging.getLogger(__name__)
router = APIRouter()


# ============== EMPLOYEE ENDPOINTS ==============

@router.get("/", response_model=Dict[str, Any])
async def list_employees(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """List all employees with pagination and search"""
    try:
        query = text("""
            SELECT 
                e.employee_id,
                e.employee_code,
                e.employee_name,
                e.designation,
                e.department_id,
                d.department_name,
                e.branch_id,
                b.branch_name,
                e.date_of_joining,
                e.is_active,
                e.created_at
            FROM master.employees e
            LEFT JOIN master.departments d ON e.department_id = d.department_id AND d.org_id = e.org_id
            LEFT JOIN master.org_branches b ON e.branch_id = b.branch_id AND b.org_id = e.org_id
            WHERE e.org_id = :org_id
            AND (:search IS NULL OR 
                 LOWER(e.employee_name) LIKE LOWER(:search_pattern) OR
                 LOWER(e.employee_code) LIKE LOWER(:search_pattern))
            AND (:is_active IS NULL OR e.is_active = :is_active)
            ORDER BY e.employee_name
            LIMIT :limit OFFSET :offset
        """)
        
        search_pattern = f"%{search}%" if search else None
        
        result = db.execute(query, {
            "org_id": org_id,
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
                 LOWER(e.employee_name) LIKE LOWER(:search_pattern) OR
                 LOWER(e.employee_code) LIKE LOWER(:search_pattern))
            AND (:is_active IS NULL OR e.is_active = :is_active)
        """)
        
        count_result = db.execute(count_query, {
            "org_id": org_id,
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
async def get_employee(
    employee_id: int, 
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
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
            "org_id": org_id
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
async def create_employee(
    employee_data: Dict[str, Any], 
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
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
            count_result = db.execute(count_query, {"org_id": org_id})
            count = count_result.scalar() + 1
            employee_code = f"EMP{count:04d}"
        
        query = text("""
            INSERT INTO master.employees (
                org_id, employee_code, employee_name, designation,
                department_id, branch_id, date_of_joining,
                emergency_contact, bank_account_details, is_active
            ) VALUES (
                :org_id, :employee_code, :employee_name, :designation,
                :department_id, :branch_id, :date_of_joining,
                :emergency_contact, :bank_account_details, :is_active
            ) RETURNING employee_id, employee_name, employee_code
        """)
        
        result = db.execute(query, {
            "org_id": org_id,
            "employee_code": employee_code,
            "employee_name": employee_data.get("employee_name"),
            "designation": employee_data.get("designation"),
            "department_id": employee_data.get("department_id"),
            "branch_id": employee_data.get("branch_id"),
            "date_of_joining": employee_data.get("date_of_joining"),
            "emergency_contact": employee_data.get("emergency_contact"),
            "bank_account_details": employee_data.get("bank_account_details"),
            "is_active": employee_data.get("is_active", True)
        })
        
        db.commit()
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
async def update_employee(
    employee_id: int,
    employee_data: Dict[str, Any], 
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """Update employee"""
    try:
        # Build update query dynamically
        update_fields = []
        params = {
            "employee_id": employee_id,
            "org_id": org_id
        }
        
        field_mapping = {
            "employee_name": "employee_name",
            "employee_code": "employee_code",
            "designation": "designation",
            "department_id": "department_id",
            "branch_id": "branch_id",
            "date_of_joining": "date_of_joining",
            "emergency_contact": "emergency_contact",
            "bank_account_details": "bank_account_details",
            "is_active": "is_active"
        }
        
        for api_field, db_field in field_mapping.items():
            if api_field in employee_data:
                update_fields.append(f"{db_field} = :{db_field}")
                params[db_field] = employee_data[api_field]
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        query = text(f"""
            UPDATE master.employees 
            SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP
            WHERE employee_id = :employee_id AND org_id = :org_id
            RETURNING employee_id, employee_name
        """)
        
        result = db.execute(query, params)
        db.commit()
        
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
async def delete_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """Delete (soft delete) employee"""
    try:
        # Soft delete by setting is_active to False
        query = text("""
            UPDATE master.employees 
            SET is_active = false, updated_at = CURRENT_TIMESTAMP
            WHERE employee_id = :employee_id AND org_id = :org_id
            RETURNING employee_id, employee_name
        """)
        
        result = db.execute(query, {
            "employee_id": employee_id,
            "org_id": org_id
        })
        db.commit()
        
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

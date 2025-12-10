"""
Departments API
CRUD operations for master.departments table
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any
import logging

from ....core.database import get_db
from ....core.jwt_auth import get_org_id_string  # SECURE: JWT-based auth

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/", response_model=Dict[str, Any])
async def list_departments(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """List all departments"""
    try:
        query = text("""
            SELECT 
                department_id,
                department_code,
                department_name,
                department_type,
                parent_department_id,
                department_head_id,
                cost_center_code,
                budget_allocated,
                is_active,
                created_at
            FROM master.departments
            WHERE org_id = :org_id
            AND (:search IS NULL OR 
                 LOWER(department_name) LIKE LOWER(:search_pattern) OR
                 LOWER(department_code) LIKE LOWER(:search_pattern))
            AND (:is_active IS NULL OR is_active = :is_active)
            ORDER BY department_name
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
        
        departments = []
        for row in result:
            departments.append(dict(row._mapping))
        
        # Get total count
        count_query = text("""
            SELECT COUNT(*) FROM master.departments
            WHERE org_id = :org_id
            AND (:search IS NULL OR 
                 LOWER(department_name) LIKE LOWER(:search_pattern) OR
                 LOWER(department_code) LIKE LOWER(:search_pattern))
            AND (:is_active IS NULL OR is_active = :is_active)
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
            "data": departments,
            "total": total,
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        logger.error(f"Error listing departments: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{department_id}", response_model=Dict[str, Any])
async def get_department(
    department_id: int,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """Get department by ID"""
    try:
        query = text("""
            SELECT * FROM master.departments
            WHERE department_id = :department_id AND org_id = :org_id
        """)
        
        result = db.execute(query, {
            "department_id": department_id,
            "org_id": org_id
        })
        department = result.first()
        
        if not department:
            raise HTTPException(status_code=404, detail="Department not found")
        
        return {
            "success": True,
            "data": dict(department._mapping)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching department: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", response_model=Dict[str, Any])
async def create_department(
    department_data: Dict[str, Any],
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """Create a new department"""
    try:
        # Generate department code if not provided
        department_code = department_data.get("department_code")
        if not department_code:
            count_query = text("""
                SELECT COUNT(*) FROM master.departments WHERE org_id = :org_id
            """)
            count_result = db.execute(count_query, {"org_id": org_id})
            count = count_result.scalar() + 1
            department_code = f"DEPT{count:03d}"
        
        query = text("""
            INSERT INTO master.departments (
                org_id, department_code, department_name, department_type,
                parent_department_id, department_head_id, cost_center_code, is_active
            ) VALUES (
                :org_id, :department_code, :department_name, :department_type,
                :parent_department_id, :department_head_id, :cost_center_code, :is_active
            ) RETURNING department_id, department_name, department_code
        """)
        
        result = db.execute(query, {
            "org_id": org_id,
            "department_code": department_code,
            "department_name": department_data.get("department_name"),
            "department_type": department_data.get("department_type"),
            "parent_department_id": department_data.get("parent_department_id"),
            "department_head_id": department_data.get("department_head_id"),
            "cost_center_code": department_data.get("cost_center_code"),
            "is_active": department_data.get("is_active", True)
        })
        
        db.commit()
        row = result.first()
        
        return {
            "success": True,
            "data": {
                "department_id": row[0],
                "department_name": row[1],
                "department_code": row[2]
            },
            "message": "Department created successfully"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating department: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{department_id}", response_model=Dict[str, Any])
async def update_department(
    department_id: int,
    department_data: Dict[str, Any],
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """Update department"""
    try:
        update_fields = []
        params = {
            "department_id": department_id,
            "org_id": org_id
        }
        
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
        
        query = text(f"""
            UPDATE master.departments 
            SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP
            WHERE department_id = :department_id AND org_id = :org_id
            RETURNING department_id, department_name
        """)
        
        result = db.execute(query, params)
        db.commit()
        
        updated = result.first()
        if not updated:
            raise HTTPException(status_code=404, detail="Department not found")
        
        return {
            "success": True,
            "data": {
                "department_id": updated[0],
                "department_name": updated[1]
            },
            "message": "Department updated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating department: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{department_id}", response_model=Dict[str, Any])
async def delete_department(
    department_id: int,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """Delete (soft delete) department"""
    try:
        query = text("""
            UPDATE master.departments 
            SET is_active = false, updated_at = CURRENT_TIMESTAMP
            WHERE department_id = :department_id AND org_id = :org_id
            RETURNING department_id, department_name
        """)
        
        result = db.execute(query, {
            "department_id": department_id,
            "org_id": org_id
        })
        db.commit()
        
        deleted = result.first()
        if not deleted:
            raise HTTPException(status_code=404, detail="Department not found")
        
        return {
            "success": True,
            "message": f"Department {deleted[1]} deactivated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting department: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

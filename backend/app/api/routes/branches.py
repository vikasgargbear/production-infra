"""
Branches API
CRUD operations for master.org_branches table
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any
import logging
import json

from ...core.database import get_db
from ...core.secure_auth import get_org_id_string  # SECURE: JWT-based auth

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/", response_model=Dict[str, Any])
async def list_branches(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """List all branches"""
    try:
        query = text("""
            SELECT 
                branch_id,
                branch_code,
                branch_name,
                branch_type,
                address,
                branch_phone,
                branch_email,
                branch_gst_number,
                branch_manager_id,
                is_billing_location,
                is_shipping_location,
                is_default_location,
                is_active,
                created_at
            FROM master.org_branches
            WHERE org_id = :org_id
            AND (:search IS NULL OR 
                 LOWER(branch_name) LIKE LOWER(:search_pattern) OR
                 LOWER(branch_code) LIKE LOWER(:search_pattern))
            AND (:is_active IS NULL OR is_active = :is_active)
            ORDER BY branch_name
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
        
        branches = []
        for row in result:
            branches.append(dict(row._mapping))
        
        # Get total count
        count_query = text("""
            SELECT COUNT(*) FROM master.org_branches
            WHERE org_id = :org_id
            AND (:search IS NULL OR 
                 LOWER(branch_name) LIKE LOWER(:search_pattern) OR
                 LOWER(branch_code) LIKE LOWER(:search_pattern))
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
            "data": branches,
            "total": total,
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        logger.error(f"Error listing branches: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{branch_id}", response_model=Dict[str, Any])
async def get_branch(
    branch_id: int,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """Get branch by ID"""
    try:
        query = text("""
            SELECT * FROM master.org_branches
            WHERE branch_id = :branch_id AND org_id = :org_id
        """)
        
        result = db.execute(query, {
            "branch_id": branch_id,
            "org_id": org_id
        })
        branch = result.first()
        
        if not branch:
            raise HTTPException(status_code=404, detail="Branch not found")
        
        return {
            "success": True,
            "data": dict(branch._mapping)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching branch: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", response_model=Dict[str, Any])
async def create_branch(
    branch_data: Dict[str, Any],
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """Create a new branch"""
    try:
        # Generate branch code if not provided
        branch_code = branch_data.get("branch_code")
        if not branch_code:
            count_query = text("""
                SELECT COUNT(*) FROM master.org_branches WHERE org_id = :org_id
            """)
            count_result = db.execute(count_query, {"org_id": org_id})
            count = count_result.scalar() + 1
            branch_code = f"BR{count:03d}"
        
        # Build address JSONB
        address_data = branch_data.get("address", {})
        if isinstance(address_data, str):
            # If address is a string, convert to JSONB
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
        
        query = text("""
            INSERT INTO master.org_branches (
                org_id, branch_code, branch_name, branch_type,
                address, branch_phone, branch_email, branch_gst_number,
                branch_manager_id, is_active
            ) VALUES (
                :org_id, :branch_code, :branch_name, :branch_type,
                :address, :branch_phone, :branch_email, :branch_gst_number,
                :branch_manager_id, :is_active
            ) RETURNING branch_id, branch_name, branch_code
        """)
        
        result = db.execute(query, {
            "org_id": org_id,
            "branch_code": branch_code,
            "branch_name": branch_data.get("branch_name"),
            "branch_type": branch_data.get("branch_type", "office"),
            "address": json.dumps(address_jsonb),
            "branch_phone": branch_data.get("phone") or branch_data.get("branch_phone"),
            "branch_email": branch_data.get("email") or branch_data.get("branch_email"),
            "branch_gst_number": branch_data.get("gstin") or branch_data.get("branch_gst_number"),
            "branch_manager_id": branch_data.get("manager_id") or branch_data.get("branch_manager_id"),
            "is_active": branch_data.get("is_active", True)
        })
        
        db.commit()
        row = result.first()
        
        return {
            "success": True,
            "data": {
                "branch_id": row[0],
                "branch_name": row[1],
                "branch_code": row[2]
            },
            "message": "Branch created successfully"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating branch: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{branch_id}", response_model=Dict[str, Any])
async def update_branch(
    branch_id: int,
    branch_data: Dict[str, Any],
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """Update branch"""
    try:
        update_fields = []
        params = {
            "branch_id": branch_id,
            "org_id": org_id
        }
        
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
        
        query = text(f"""
            UPDATE master.org_branches 
            SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP
            WHERE branch_id = :branch_id AND org_id = :org_id
            RETURNING branch_id, branch_name
        """)
        
        result = db.execute(query, params)
        db.commit()
        
        updated = result.first()
        if not updated:
            raise HTTPException(status_code=404, detail="Branch not found")
        
        return {
            "success": True,
            "data": {
                "branch_id": updated[0],
                "branch_name": updated[1]
            },
            "message": "Branch updated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating branch: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{branch_id}", response_model=Dict[str, Any])
async def delete_branch(
    branch_id: int,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """Delete (soft delete) branch"""
    try:
        query = text("""
            UPDATE master.org_branches 
            SET is_active = false, updated_at = CURRENT_TIMESTAMP
            WHERE branch_id = :branch_id AND org_id = :org_id
            RETURNING branch_id, branch_name
        """)
        
        result = db.execute(query, {
            "branch_id": branch_id,
            "org_id": org_id
        })
        db.commit()
        
        deleted = result.first()
        if not deleted:
            raise HTTPException(status_code=404, detail="Branch not found")
        
        return {
            "success": True,
            "message": f"Branch {deleted[1]} deactivated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting branch: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

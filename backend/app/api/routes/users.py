"""
Users API Router
Manages system users and authentication
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

from ...core.database import get_db
from ...core.auth_utils import get_org_id_from_header

logger = logging.getLogger(__name__)

router = APIRouter(tags=["users"])

# Users API now uses direct SQL queries with master.org_users table

@router.get("/")
def get_users(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = Query(None, description="Search by username or email"),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """Get users with optional search"""
    try:
        query = "SELECT user_id, username, email, full_name, is_active FROM master.org_users WHERE 1=1"
        params = {}
        
        if search:
            query += " AND (LOWER(username) LIKE LOWER(:search) OR LOWER(email) LIKE LOWER(:search))"
            params["search"] = f"%{search}%"
            
        query += " ORDER BY username LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        users = [dict(row._mapping) for row in result]
        
        return users
        
    except Exception as e:
        logger.error(f"Error fetching users: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get users: {str(e)}")

@router.get("/{user_id}")
def get_user(user_id: int, db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)):
    """Get a single user by ID (excluding password)"""
    try:
        result = db.execute(
            text("SELECT user_id, username, email, full_name, is_active FROM master.org_users WHERE user_id = :user_id"),
            {"user_id": user_id}
        )
        user = result.first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return dict(user._mapping)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get user: {str(e)}")

@router.post("/")
def create_user(user_data: dict, db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)):
    """Create a new user"""
    try:
        # IMPORTANT: Convert org_id to UUID as per migration guide
        from uuid import UUID
        if isinstance(org_id, str):
            org_id = UUID(org_id)
        
        # Extract full name and split into first/last
        full_name = user_data.get('full_name', user_data.get('fullName', ''))
        name_parts = full_name.split(' ', 1) if full_name else ['', '']
        first_name = name_parts[0] or user_data.get('username', 'User')
        last_name = name_parts[1] if len(name_parts) > 1 else ''
        
        # Log for debugging
        logger.info(f"Creating user with org_id type: {type(org_id)}, value: {org_id}")
        
        # Insert into master.org_users (full_name is GENERATED, so we use first_name and last_name)
        result = db.execute(
            text("""
                INSERT INTO master.org_users (
                    username, email, first_name, last_name, mobile_number, 
                    employee_code, role, is_active, org_id
                )
                VALUES (
                    :username, :email, :first_name, :last_name, :mobile_number,
                    :employee_code, :role, true, :org_id
                )
                RETURNING user_id, username, email, full_name
            """),
            {
                "username": user_data.get("username"),
                "email": user_data.get("email"),
                "first_name": first_name,
                "last_name": last_name,
                "mobile_number": user_data.get("phone", user_data.get("mobile_number", "")),
                "employee_code": user_data.get("employee_id", user_data.get("employee_code")),
                "role": user_data.get("role", "staff"),
                "org_id": org_id  # Now this is UUID type
            }
        )
        new_user = result.first()
        db.commit()
        
        # Return user data
        return dict(new_user._mapping)
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating user: {str(e)}")
        logger.error(f"Error details - columns might be: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create user: {str(e)}")

@router.put("/{user_id}")
def update_user(user_id: int, user_data: dict, db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)):
    """Update a user"""
    try:
        # Check if user exists
        existing = db.execute(
            text("SELECT user_id FROM master.org_users WHERE user_id = :user_id"),
            {"user_id": user_id}
        ).first()
        
        if not existing:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Build update query
        update_fields = []
        params = {"user_id": user_id}
        
        # Handle full_name by splitting into first_name and last_name
        if 'full_name' in user_data or 'fullName' in user_data:
            full_name = user_data.get('full_name', user_data.get('fullName', ''))
            if full_name:
                name_parts = full_name.split(' ', 1)
                update_fields.append("first_name = :first_name")
                params["first_name"] = name_parts[0]
                if len(name_parts) > 1:
                    update_fields.append("last_name = :last_name")
                    params["last_name"] = name_parts[1]
                else:
                    update_fields.append("last_name = :last_name")
                    params["last_name"] = ''
        
        if 'username' in user_data:
            update_fields.append("username = :username")
            params["username"] = user_data['username']
        if 'email' in user_data:
            update_fields.append("email = :email")
            params["email"] = user_data['email']
        if 'phone' in user_data or 'mobile_number' in user_data:
            update_fields.append("mobile_number = :mobile_number")
            params["mobile_number"] = user_data.get('phone', user_data.get('mobile_number'))
        if 'is_active' in user_data:
            update_fields.append("is_active = :is_active")
            params["is_active"] = user_data['is_active']
        if 'role' in user_data:
            update_fields.append("role = :role")
            params["role"] = user_data['role']
            
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
            
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        
        result = db.execute(
            text(f"""
                UPDATE master.org_users 
                SET {', '.join(update_fields)}
                WHERE user_id = :user_id
                RETURNING user_id, username, email, full_name, is_active
            """),
            params
        )
        
        updated_user = result.first()
        return dict(updated_user._mapping)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update user: {str(e)}")

@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)):
    """Delete a user"""
    try:
        # Check if user exists
        existing = db.execute(
            text("SELECT user_id FROM master.org_users WHERE user_id = :user_id"),
            {"user_id": user_id}
        ).first()
        
        if not existing:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Soft delete by setting is_active to false
        db.execute(
            text("""
                UPDATE master.org_users 
                SET is_active = false, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = :user_id
            """),
            {"user_id": user_id}
        )
        
        return {"message": "User deactivated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete user: {str(e)}")
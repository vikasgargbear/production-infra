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

logger = logging.getLogger(__name__)

router = APIRouter(tags=["users"])

# Users API now uses direct SQL queries with master.org_users table

@router.get("/")
def get_users(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = Query(None, description="Search by username or email"),
    db: Session = Depends(get_db)
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
def get_user(user_id: int, db: Session = Depends(get_db)):
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
def create_user(user_data: dict, db: Session = Depends(get_db)):
    """Create a new user"""
    try:
        # Insert into master.org_users
        result = db.execute(
            text("""
                INSERT INTO master.org_users (username, email, full_name, is_active, org_id, created_at, updated_at)
                VALUES (:username, :email, :full_name, true, :org_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING user_id, username, email, full_name
            """),
            {
                "username": user_data.get("username"),
                "email": user_data.get("email"),
                "full_name": user_data.get("full_name", user_data.get("username")),
                "org_id": "550e8400-e29b-41d4-a716-446655440000"  # Default org_id
            }
        )
        new_user = result.first()
        
        # Return user data
        return dict(new_user._mapping)
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating user: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create user: {str(e)}")

@router.put("/{user_id}")
def update_user(user_id: int, user_data: dict, db: Session = Depends(get_db)):
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
        
        if 'username' in user_data:
            update_fields.append("username = :username")
            params["username"] = user_data['username']
        if 'email' in user_data:
            update_fields.append("email = :email")
            params["email"] = user_data['email']
        if 'full_name' in user_data:
            update_fields.append("full_name = :full_name")
            params["full_name"] = user_data['full_name']
        if 'is_active' in user_data:
            update_fields.append("is_active = :is_active")
            params["is_active"] = user_data['is_active']
            
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
def delete_user(user_id: int, db: Session = Depends(get_db)):
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
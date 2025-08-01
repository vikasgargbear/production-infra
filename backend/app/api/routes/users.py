"""
Users API Router
Manages system users and authentication
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

from ...database import get_db
from ...models import User
from ...core.crud_base import create_crud

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/users", tags=["users"])

# Create CRUD instance
user_crud = create_crud(User)

@router.get("/")
def get_users(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = Query(None, description="Search by username or email"),
    db: Session = Depends(get_db)
):
    """Get users with optional search"""
    try:
        query = "SELECT id as user_id, username, email FROM users WHERE 1=1"
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
            text("SELECT id as user_id, username, email FROM users WHERE id = :user_id"),
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
        # Remove sensitive fields from response
        user = User(**user_data)
        db.add(user)
        db.commit()
        db.refresh(user)
        
        # Return user without password
        return {
            "user_id": user.id,
            "username": user.username,
            "email": user.email
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating user: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create user: {str(e)}")

@router.put("/{user_id}")
def update_user(user_id: int, user_data: dict, db: Session = Depends(get_db)):
    """Update a user"""
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Don't allow updating password through this endpoint
        if 'password' in user_data:
            del user_data['password']
        if 'hashed_password' in user_data:
            del user_data['hashed_password']
        
        for key, value in user_data.items():
            setattr(user, key, value)
        
        db.commit()
        db.refresh(user)
        
        # Return user without password
        return {
            "user_id": user.id,
            "username": user.username,
            "email": user.email
        }
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
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        db.delete(user)
        db.commit()
        return {"message": "User deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete user: {str(e)}")
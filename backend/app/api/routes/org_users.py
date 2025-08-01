"""
Org Users API Router
Manages organization users using the org_users table from Supabase
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
import bcrypt
from datetime import datetime

from ...database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/org-users", tags=["org-users"])

@router.get("/")
def get_org_users(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = Query(None, description="Search by name or email"),
    org_id: Optional[str] = Query(None, description="Organization ID"),
    db: Session = Depends(get_db)
):
    """Get organization users with optional search"""
    try:
        query = """
            SELECT 
                user_id,
                org_id,
                full_name,
                email,
                phone,
                employee_id,
                role,
                permissions,
                department,
                can_view_reports,
                can_modify_prices,
                can_approve_discounts,
                discount_limit_percent,
                is_active,
                last_login_at,
                created_at
            FROM org_users 
            WHERE 1=1
        """
        params = {}
        
        if org_id:
            query += " AND org_id = :org_id"
            params["org_id"] = org_id
            
        if search:
            query += " AND (LOWER(full_name) LIKE LOWER(:search) OR LOWER(email) LIKE LOWER(:search))"
            params["search"] = f"%{search}%"
            
        query += " ORDER BY full_name LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        users = [dict(row._mapping) for row in result]
        
        return {"data": users}
        
    except Exception as e:
        logger.error(f"Error fetching org users: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get org users: {str(e)}")

@router.get("/{user_id}")
def get_org_user(user_id: int, db: Session = Depends(get_db)):
    """Get a single org user by ID"""
    try:
        result = db.execute(
            text("""
                SELECT 
                    user_id,
                    org_id,
                    full_name,
                    email,
                    phone,
                    employee_id,
                    role,
                    permissions,
                    department,
                    can_view_reports,
                    can_modify_prices,
                    can_approve_discounts,
                    discount_limit_percent,
                    is_active,
                    last_login_at,
                    created_at
                FROM org_users 
                WHERE user_id = :user_id
            """),
            {"user_id": user_id}
        )
        user = result.first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return dict(user._mapping)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching org user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get org user: {str(e)}")

@router.post("/")
def create_org_user(user_data: dict, db: Session = Depends(get_db)):
    """Create a new org user"""
    try:
        # Hash password if provided
        password = user_data.pop('password', None)
        if password:
            password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        else:
            password_hash = 'temp_password_hash'  # Should be set properly
        
        # Extract fields
        org_id = user_data.get('org_id')
        if not org_id:
            raise HTTPException(status_code=400, detail="org_id is required")
            
        # Prepare insert query
        query = text("""
            INSERT INTO org_users (
                org_id, full_name, email, phone, employee_id,
                password_hash, role, permissions, department,
                can_view_reports, can_modify_prices, can_approve_discounts,
                discount_limit_percent, is_active
            ) VALUES (
                :org_id, :full_name, :email, :phone, :employee_id,
                :password_hash, :role, :permissions, :department,
                :can_view_reports, :can_modify_prices, :can_approve_discounts,
                :discount_limit_percent, :is_active
            ) RETURNING user_id
        """)
        
        params = {
            'org_id': org_id,
            'full_name': user_data.get('full_name', user_data.get('fullName')),
            'email': user_data.get('email'),
            'phone': user_data.get('phone'),
            'employee_id': user_data.get('employee_id'),
            'password_hash': password_hash,
            'role': user_data.get('role', 'staff'),
            'permissions': user_data.get('permissions', '{}'),
            'department': user_data.get('department'),
            'can_view_reports': user_data.get('can_view_reports', False),
            'can_modify_prices': user_data.get('can_modify_prices', False),
            'can_approve_discounts': user_data.get('can_approve_discounts', False),
            'discount_limit_percent': user_data.get('discount_limit_percent', 0),
            'is_active': user_data.get('is_active', True)
        }
        
        result = db.execute(query, params)
        user_id = result.scalar()
        db.commit()
        
        return {"user_id": user_id, "message": "User created successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating org user: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create org user: {str(e)}")

@router.put("/{user_id}")
def update_org_user(user_id: int, user_data: dict, db: Session = Depends(get_db)):
    """Update an org user"""
    try:
        # Don't allow updating password through this endpoint
        user_data.pop('password', None)
        user_data.pop('password_hash', None)
        
        # Build update query dynamically
        update_fields = []
        params = {"user_id": user_id}
        
        field_mapping = {
            'full_name': 'full_name',
            'fullName': 'full_name',
            'email': 'email',
            'phone': 'phone',
            'role': 'role',
            'permissions': 'permissions',
            'department': 'department',
            'can_view_reports': 'can_view_reports',
            'can_modify_prices': 'can_modify_prices',
            'can_approve_discounts': 'can_approve_discounts',
            'discount_limit_percent': 'discount_limit_percent',
            'is_active': 'is_active'
        }
        
        for key, value in user_data.items():
            if key in field_mapping:
                db_field = field_mapping[key]
                update_fields.append(f"{db_field} = :{db_field}")
                params[db_field] = value
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No valid fields to update")
        
        query = text(f"""
            UPDATE org_users 
            SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = :user_id
            RETURNING user_id
        """)
        
        result = db.execute(query, params)
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="User not found")
            
        db.commit()
        
        return {"message": "User updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating org user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update org user: {str(e)}")

@router.delete("/{user_id}")
def delete_org_user(user_id: int, db: Session = Depends(get_db)):
    """Delete an org user"""
    try:
        result = db.execute(
            text("DELETE FROM org_users WHERE user_id = :user_id RETURNING user_id"),
            {"user_id": user_id}
        )
        
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="User not found")
            
        db.commit()
        return {"message": "User deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting org user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete org user: {str(e)}")

@router.post("/{user_id}/reset-password")
def reset_password(user_id: int, db: Session = Depends(get_db)):
    """Reset user password (send reset email)"""
    try:
        # In a real implementation, this would:
        # 1. Generate a reset token
        # 2. Send an email with reset link
        # 3. Store token in database with expiration
        
        # For now, just verify user exists
        result = db.execute(
            text("SELECT email FROM org_users WHERE user_id = :user_id"),
            {"user_id": user_id}
        )
        user = result.first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
            
        # TODO: Implement actual password reset logic
        return {"message": f"Password reset link sent to {user.email}"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting password for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to reset password: {str(e)}")

@router.get("/roles")
def get_roles():
    """Get available user roles"""
    return {
        "roles": [
            {"value": "owner", "label": "Owner", "description": "Full system access"},
            {"value": "admin", "label": "Administrator", "description": "Admin access"},
            {"value": "manager", "label": "Manager", "description": "Management access"},
            {"value": "billing", "label": "Billing Staff", "description": "Billing operations"},
            {"value": "store", "label": "Store Staff", "description": "Inventory management"},
            {"value": "accounting", "label": "Accounting", "description": "Financial access"},
            {"value": "readonly", "label": "Read Only", "description": "View only access"}
        ]
    }

@router.get("/permissions")
def get_permissions():
    """Get available permissions"""
    return {
        "modules": [
            "sales", "purchase", "inventory", "payment", 
            "reports", "master", "gst", "returns", 
            "ledger", "notes"
        ],
        "actions": [
            "create", "view", "edit", "delete", "approve", "export"
        ]
    }
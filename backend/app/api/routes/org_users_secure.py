"""
Organization Users API with Enhanced Security
Manages organization users with role-based access control
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Header, status
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
import json
from datetime import datetime
from uuid import UUID

from ...core.database import get_db
from ...core.permissions import (
    PermissionChecker,
    check_permission,
    MODULES,
    PERMISSIONS
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/secure/org-users", tags=["secure-org-users"])

@router.get("/")
def get_org_users(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = Query(None, description="Search by name, email or username"),
    role_filter: Optional[str] = Query(None, description="Filter by role"),
    module_filter: Optional[str] = Query(None, description="Filter by module access"),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker("master", "view"))
):
    """Get organization users with enhanced filtering and permission checks"""
    try:
        org_id = current_user.get('org_id')
        
        query = """
            SELECT 
                u.user_id,
                u.username,
                u.email,
                u.full_name,
                u.first_name,
                u.last_name,
                u.mobile_number,
                u.employee_code,
                u.role_id,
                u.is_admin,
                u.permissions as user_permissions,
                u.branch_ids,
                u.department_id,
                u.is_active,
                u.last_login,
                u.created_at,
                r.role_code,
                r.role_name,
                r.permissions as role_permissions,
                r.allowed_modules,
                r.data_access_level
            FROM master.org_users u
            LEFT JOIN master.roles r ON u.role_id = r.role_id
            WHERE u.org_id = :org_id
        """
        params = {"org_id": org_id}
        
        if search:
            query += """ AND (
                LOWER(u.username) LIKE LOWER(:search) OR 
                LOWER(u.email) LIKE LOWER(:search) OR
                LOWER(u.full_name) LIKE LOWER(:search)
            )"""
            params["search"] = f"%{search}%"
        
        if role_filter:
            query += " AND r.role_code = :role_filter"
            params["role_filter"] = role_filter
            
        if module_filter:
            query += " AND :module_filter = ANY(r.allowed_modules)"
            params["module_filter"] = module_filter
            
        query += " ORDER BY u.created_at DESC LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        users = []
        
        for row in result:
            user_dict = dict(row._mapping)
            
            # Parse permissions
            if user_dict['user_permissions']:
                if isinstance(user_dict['user_permissions'], str):
                    user_dict['user_permissions'] = json.loads(user_dict['user_permissions'])
            
            if user_dict['role_permissions']:
                if isinstance(user_dict['role_permissions'], str):
                    user_dict['role_permissions'] = json.loads(user_dict['role_permissions'])
            
            # Merge permissions (user permissions override role permissions)
            merged_permissions = {}
            if user_dict['role_permissions']:
                merged_permissions = user_dict['role_permissions'].copy()
            if user_dict['user_permissions']:
                merged_permissions.update(user_dict['user_permissions'])
            
            user_dict['effective_permissions'] = merged_permissions
            users.append(user_dict)
        
        return {"data": users, "total": len(users)}
        
    except Exception as e:
        logger.error(f"Error fetching org users: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get org users: {str(e)}")

@router.get("/roles")
def get_available_roles(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker("master", "view"))
):
    """Get available roles for the organization"""
    try:
        org_id = current_user.get('org_id')
        
        result = db.execute(
            text("""
                SELECT 
                    role_id,
                    role_code,
                    role_name,
                    role_description,
                    permissions,
                    allowed_modules,
                    data_access_level
                FROM master.roles
                WHERE org_id = :org_id AND is_active = true
                ORDER BY role_level, role_name
            """),
            {"org_id": org_id}
        )
        
        roles = []
        for row in result:
            role = dict(row._mapping)
            if role['permissions'] and isinstance(role['permissions'], str):
                role['permissions'] = json.loads(role['permissions'])
            roles.append(role)
        
        return {"data": roles}
        
    except Exception as e:
        logger.error(f"Error fetching roles: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get roles: {str(e)}")

@router.get("/{user_id}")
def get_org_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker("master", "view"))
):
    """Get detailed user information with permissions"""
    try:
        org_id = current_user.get('org_id')
        
        result = db.execute(
            text("""
                SELECT 
                    u.*,
                    r.role_code,
                    r.role_name,
                    r.permissions as role_permissions,
                    r.allowed_modules,
                    r.data_access_level
                FROM master.org_users u
                LEFT JOIN master.roles r ON u.role_id = r.role_id
                WHERE u.user_id = :user_id AND u.org_id = :org_id
            """),
            {"user_id": user_id, "org_id": org_id}
        )
        
        user = result.first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        user_dict = dict(user._mapping)
        
        # Parse permissions
        if user_dict['permissions']:
            if isinstance(user_dict['permissions'], str):
                user_dict['permissions'] = json.loads(user_dict['permissions'])
        
        if user_dict['role_permissions']:
            if isinstance(user_dict['role_permissions'], str):
                user_dict['role_permissions'] = json.loads(user_dict['role_permissions'])
        
        return user_dict
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get user: {str(e)}")

@router.post("/")
def create_org_user(
    user_data: dict,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker("master", "create"))
):
    """Create a new user with role and permissions"""
    try:
        org_id = current_user.get('org_id')
        if isinstance(org_id, str):
            org_id = UUID(org_id)
        
        # Extract and validate data
        username = user_data.get('username')
        email = user_data.get('email')
        
        # Check if user already exists
        existing_check = db.execute(
            text("""
                SELECT user_id FROM master.org_users 
                WHERE org_id = :org_id AND (username = :username OR email = :email)
            """),
            {"org_id": org_id, "username": username, "email": email}
        )
        
        if existing_check.first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this username or email already exists"
            )
        
        # Process full name
        full_name = user_data.get('fullName', user_data.get('full_name', ''))
        name_parts = full_name.split(' ', 1) if full_name else ['', '']
        first_name = name_parts[0] or username
        last_name = name_parts[1] if len(name_parts) > 1 else ''
        
        # Get role_id from role code/name
        role_id = user_data.get('role_id')
        if not role_id and user_data.get('role'):
            role_result = db.execute(
                text("""
                    SELECT role_id FROM master.roles 
                    WHERE org_id = :org_id AND 
                    (role_code = :role OR role_name = :role)
                """),
                {"org_id": org_id, "role": user_data.get('role')}
            )
            role_row = role_result.first()
            if role_row:
                role_id = role_row.role_id
        
        # Process module access and permissions
        module_access = user_data.get('moduleAccess', [])
        permissions = user_data.get('permissions', {})
        
        # Build permissions JSON structure
        permission_json = {}
        for module in module_access:
            module_key = module.lower().replace(' ', '_')
            if module_key in permissions:
                permission_json[module_key] = permissions[module_key]
        
        # Insert user
        result = db.execute(
            text("""
                INSERT INTO master.org_users (
                    org_id, username, email, first_name, last_name,
                    mobile_number, employee_code, role_id, is_admin,
                    permissions, branch_ids, department_id, is_active
                ) VALUES (
                    :org_id, :username, :email, :first_name, :last_name,
                    :mobile_number, :employee_code, :role_id, :is_admin,
                    :permissions, :branch_ids, :department_id, true
                )
                RETURNING user_id, username, email, full_name
            """),
            {
                "org_id": org_id,
                "username": username,
                "email": email,
                "first_name": first_name,
                "last_name": last_name,
                "mobile_number": user_data.get('mobile', ''),
                "employee_code": user_data.get('employeeCode'),
                "role_id": role_id,
                "is_admin": user_data.get('role') == 'Admin',
                "permissions": json.dumps(permission_json),
                "branch_ids": user_data.get('branchIds', []),
                "department_id": user_data.get('departmentId')
            }
        )
        
        new_user = result.first()
        db.commit()
        
        return {
            "success": True,
            "data": dict(new_user._mapping),
            "message": "User created successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating user: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create user: {str(e)}")

@router.put("/{user_id}")
def update_org_user(
    user_id: int,
    user_data: dict,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker("master", "edit"))
):
    """Update user with role and permissions"""
    try:
        org_id = current_user.get('org_id')
        
        # Check if user exists
        existing = db.execute(
            text("""
                SELECT user_id, is_admin FROM master.org_users 
                WHERE user_id = :user_id AND org_id = :org_id
            """),
            {"user_id": user_id, "org_id": org_id}
        )
        
        user_row = existing.first()
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Prevent non-admin from modifying admin users
        if user_row.is_admin and not current_user.get('is_admin'):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can modify admin users"
            )
        
        # Build update query
        update_fields = []
        params = {"user_id": user_id, "org_id": org_id}
        
        # Handle full name
        if 'fullName' in user_data or 'full_name' in user_data:
            full_name = user_data.get('fullName', user_data.get('full_name', ''))
            if full_name:
                name_parts = full_name.split(' ', 1)
                update_fields.append("first_name = :first_name")
                update_fields.append("last_name = :last_name")
                params["first_name"] = name_parts[0]
                params["last_name"] = name_parts[1] if len(name_parts) > 1 else ''
        
        # Handle role update
        if 'role' in user_data or 'role_id' in user_data:
            role_id = user_data.get('role_id')
            if not role_id and user_data.get('role'):
                role_result = db.execute(
                    text("""
                        SELECT role_id FROM master.roles 
                        WHERE org_id = :org_id AND 
                        (role_code = :role OR role_name = :role)
                    """),
                    {"org_id": org_id, "role": user_data.get('role')}
                )
                role_row = role_result.first()
                if role_row:
                    role_id = role_row.role_id
            
            if role_id:
                update_fields.append("role_id = :role_id")
                params["role_id"] = role_id
                
                # Update is_admin based on role
                update_fields.append("is_admin = :is_admin")
                params["is_admin"] = user_data.get('role') == 'Admin'
        
        # Handle permissions update
        if 'moduleAccess' in user_data or 'permissions' in user_data:
            module_access = user_data.get('moduleAccess', [])
            permissions = user_data.get('permissions', {})
            
            permission_json = {}
            for module in module_access:
                module_key = module.lower().replace(' ', '_')
                if module_key in permissions:
                    permission_json[module_key] = permissions[module_key]
            
            update_fields.append("permissions = :permissions")
            params["permissions"] = json.dumps(permission_json)
        
        # Other fields
        field_mapping = {
            'username': 'username',
            'email': 'email',
            'mobile': 'mobile_number',
            'mobile_number': 'mobile_number',
            'employeeCode': 'employee_code',
            'employee_code': 'employee_code',
            'branchIds': 'branch_ids',
            'branch_ids': 'branch_ids',
            'departmentId': 'department_id',
            'department_id': 'department_id',
            'is_active': 'is_active'
        }
        
        for key, db_field in field_mapping.items():
            if key in user_data:
                update_fields.append(f"{db_field} = :{db_field}")
                params[db_field] = user_data[key]
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        
        result = db.execute(
            text(f"""
                UPDATE master.org_users 
                SET {', '.join(update_fields)}
                WHERE user_id = :user_id AND org_id = :org_id
                RETURNING user_id, username, email, full_name
            """),
            params
        )
        
        updated_user = result.first()
        db.commit()
        
        return {
            "success": True,
            "data": dict(updated_user._mapping),
            "message": "User updated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update user: {str(e)}")

@router.delete("/{user_id}")
def delete_org_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker("master", "delete"))
):
    """Delete (deactivate) a user"""
    try:
        org_id = current_user.get('org_id')
        
        # Check if user exists and prevent self-deletion
        if user_id == current_user.get('user_id'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete your own account"
            )
        
        # Check if user is admin
        existing = db.execute(
            text("""
                SELECT is_admin FROM master.org_users 
                WHERE user_id = :user_id AND org_id = :org_id
            """),
            {"user_id": user_id, "org_id": org_id}
        )
        
        user_row = existing.first()
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Prevent non-admin from deleting admin users
        if user_row.is_admin and not current_user.get('is_admin'):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can delete admin users"
            )
        
        # Soft delete
        db.execute(
            text("""
                UPDATE master.org_users 
                SET is_active = false, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = :user_id AND org_id = :org_id
            """),
            {"user_id": user_id, "org_id": org_id}
        )
        
        db.commit()
        
        return {
            "success": True,
            "message": "User deactivated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete user: {str(e)}")

@router.post("/{user_id}/permissions")
def update_user_permissions(
    user_id: int,
    permissions_data: dict,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker(require_admin=True))
):
    """Update user permissions (admin only)"""
    try:
        org_id = current_user.get('org_id')
        
        # Verify user exists
        existing = db.execute(
            text("""
                SELECT user_id FROM master.org_users 
                WHERE user_id = :user_id AND org_id = :org_id
            """),
            {"user_id": user_id, "org_id": org_id}
        )
        
        if not existing.first():
            raise HTTPException(status_code=404, detail="User not found")
        
        # Update permissions
        db.execute(
            text("""
                UPDATE master.org_users 
                SET permissions = :permissions, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = :user_id AND org_id = :org_id
            """),
            {
                "user_id": user_id,
                "org_id": org_id,
                "permissions": json.dumps(permissions_data)
            }
        )
        
        db.commit()
        
        return {
            "success": True,
            "message": "Permissions updated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating permissions for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update permissions: {str(e)}")
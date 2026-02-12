"""
User Management API
Manages organization users with role-based access control
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Header, status
from sqlalchemy import text
import logging
import json
from datetime import datetime
from uuid import UUID

from ...services.email.email_service import send_user_invite

from ....core.auth.tenant_service import get_tenant_aware_db, TenantAwareSession, with_tenant_context
from ....core.auth.org_context import get_org_context, OrgContext
from ....core.security.permissions import (
    PermissionChecker,
    check_permission,
    MODULES,
    PERMISSIONS
)
from ....core.security.role_management import RoleManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["Users"])

@router.get("/")
@with_tenant_context
async def get_org_users(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = Query(None, description="Search by name, email or username"),
    role_filter: Optional[str] = Query(None, description="Filter by role"),
    module_filter: Optional[str] = Query(None, description="Filter by module access"),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker("master", "view")),
    context: OrgContext = Depends(get_org_context)
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
            
            # Parse permissions - Role-First RBAC: role permissions are the effective permissions
            role_perms = user_dict.get('role_permissions')
            if role_perms:
                if isinstance(role_perms, str):
                    role_perms = json.loads(role_perms)
            else:
                role_perms = {}
            
            # Role permissions are the single source of truth (no user-level overrides)
            user_dict['effective_permissions'] = role_perms
            user_dict['role_permissions'] = role_perms
            
            # Clean up deprecated user_permissions field from response
            if 'user_permissions' in user_dict:
                del user_dict['user_permissions']
            
            users.append(user_dict)
        
        return {"data": users, "total": len(users)}
        
    except Exception as e:
        logger.error(f"Error fetching org users: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get org users: {str(e)}")

@router.get("/roles")
@with_tenant_context
async def get_available_roles(
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker("master", "view")),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get available roles for the organization.
    Auto-creates default roles if none exist (first time access).
    """
    try:
        org_id = current_user.get('org_id')
        
        # Check if roles exist for this org
        role_count = db.execute(
            text("SELECT COUNT(*) as count FROM master.roles WHERE org_id = :org_id"),
            {"org_id": org_id}
        ).fetchone()
        
        # Auto-create default roles if none exist
        if role_count and role_count.count == 0:
            logger.info(f"No roles found for org {org_id}, creating defaults...")
            role_manager = RoleManager(db)
            role_manager.setup_default_roles(str(org_id))
            db.commit()
            logger.info(f"Created default roles for org {org_id}")
        
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
@with_tenant_context
async def get_org_user(
    user_id: int,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker("master", "view")),
    context: OrgContext = Depends(get_org_context)
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
        
        # Role-First RBAC: role permissions are the effective permissions
        role_perms = user_dict.get('role_permissions')
        if role_perms:
            if isinstance(role_perms, str):
                role_perms = json.loads(role_perms)
        else:
            role_perms = {}
        
        user_dict['effective_permissions'] = role_perms
        user_dict['role_permissions'] = role_perms
        
        # Remove deprecated user-level permissions from response
        if 'permissions' in user_dict:
            del user_dict['permissions']
        
        return user_dict
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get user: {str(e)}")

@router.post("/")
@with_tenant_context
async def create_org_user(
    user_data: dict,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker("master", "create")),
    context: OrgContext = Depends(get_org_context)
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
        
        # Get role_id from role code/name - Role-First RBAC: validate role exists
        role_id = user_data.get('role_id')
        role_code = user_data.get('role')
        
        # Ensure roles exist for this org (auto-create if empty)
        role_check = db.execute(
            text("SELECT COUNT(*) as cnt FROM master.roles WHERE org_id = :org_id"),
            {"org_id": org_id}
        ).first()
        
        if role_check.cnt == 0:
            # Auto-create default roles
            role_manager = RoleManager(db)
            role_manager.setup_default_roles(str(org_id))
            db.commit()
            logger.info(f"Auto-created default roles for org {org_id}")
        
        # Look up role_id if role code/name provided
        if not role_id and role_code:
            role_result = db.execute(
                text("""
                    SELECT role_id FROM master.roles 
                    WHERE org_id = :org_id AND 
                    (role_code = :role OR role_name = :role)
                """),
                {"org_id": org_id, "role": role_code}
            )
            role_row = role_result.first()
            if role_row:
                role_id = role_row.role_id
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Role '{role_code}' not found. Please select a valid role."
                )
        
        if not role_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Role is required. Please select a role for the user."
            )
        
        # Role-First RBAC: User inherits permissions from role, no user-level overrides
        # Insert user without permissions column (or set to NULL)
        result = db.execute(
            text("""
                INSERT INTO master.org_users (
                    org_id, username, email, first_name, last_name,
                    mobile_number, employee_code, role_id, is_admin,
                    branch_ids, department_id, is_active
                ) VALUES (
                    :org_id, :username, :email, :first_name, :last_name,
                    :mobile_number, :employee_code, :role_id, :is_admin,
                    :branch_ids, :department_id, true
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
                "is_admin": role_code == 'admin' if role_code else False,
                "branch_ids": user_data.get('branchIds', []),
                "department_id": user_data.get('departmentId')
            }
        )
        
        new_user = result.first()
        db.commit()
        
        # Send invite email if requested
        send_invite = user_data.get('send_invite_email', False)
        email_sent = False
        
        if send_invite and email:
            try:
                # Get org name
                org_result = db.execute(
                    text("SELECT org_name FROM master.organizations WHERE org_id = :org_id"),
                    {"org_id": org_id}
                )
                org_row = org_result.first()
                org_name = org_row.org_name if org_row else "Your Organization"
                
                # Send invite
                email_sent = send_user_invite(
                    to_email=email,
                    user_name=full_name or username,
                    org_name=org_name,
                    role_name=role_code or "User",
                    temp_password=user_data.get('password')  # Only if password auth used
                )
                
                if email_sent:
                    logger.info(f"Invite email sent to {email}")
                else:
                    logger.warning(f"Could not send invite email to {email} (email service may not be configured)")
            except Exception as email_error:
                logger.error(f"Error sending invite email: {email_error}")
                # Don't fail user creation if email fails
        
        return {
            "success": True,
            "data": dict(new_user._mapping),
            "message": "User created successfully",
            "email_sent": email_sent
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating user: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create user: {str(e)}")

@router.put("/{user_id}")
@with_tenant_context
async def update_org_user(
    user_id: int,
    user_data: dict,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker("master", "edit")),
    context: OrgContext = Depends(get_org_context)
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
        
        # Role-First RBAC: User-level permission overrides removed
        # Permissions are now inherited from the user's role only
        # To change permissions, change the user's role or modify the role itself
        
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

        # Log deactivation to audit trail
        if 'is_active' in user_data and user_data['is_active'] is False:
            try:
                db.execute(
                    text("""
                        INSERT INTO system_config.audit_logs
                        (org_id, activity_type, entity_type, entity_id, entity_name,
                         action_performed, user_id, user_name, result_status)
                        VALUES (:org_id, 'delete', 'user', :target_user_id, :target_username,
                                'User deactivated', :admin_user_id, :admin_username, 'success')
                    """),
                    {
                        "org_id": org_id,
                        "target_user_id": str(user_id),
                        "target_username": updated_user.username if updated_user else str(user_id),
                        "admin_user_id": current_user.get('user_id'),
                        "admin_username": current_user.get('username', 'unknown'),
                    }
                )
            except Exception as audit_err:
                logger.warning(f"Failed to write audit log for user deactivation: {audit_err}")

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
@with_tenant_context
async def delete_org_user(
    user_id: int,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker("master", "delete")),
    context: OrgContext = Depends(get_org_context)
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
        
        # Get username before deactivation for audit log
        target_user = db.execute(
            text("SELECT username FROM master.org_users WHERE user_id = :user_id AND org_id = :org_id"),
            {"user_id": user_id, "org_id": org_id}
        ).first()

        # Soft delete
        db.execute(
            text("""
                UPDATE master.org_users
                SET is_active = false, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = :user_id AND org_id = :org_id
            """),
            {"user_id": user_id, "org_id": org_id}
        )

        # Log to audit trail
        try:
            db.execute(
                text("""
                    INSERT INTO system_config.audit_logs
                    (org_id, activity_type, entity_type, entity_id, entity_name,
                     action_performed, user_id, user_name, result_status)
                    VALUES (:org_id, 'delete', 'user', :target_user_id, :target_username,
                            'User deactivated (deleted)', :admin_user_id, :admin_username, 'success')
                """),
                {
                    "org_id": org_id,
                    "target_user_id": str(user_id),
                    "target_username": target_user.username if target_user else str(user_id),
                    "admin_user_id": current_user.get('user_id'),
                    "admin_username": current_user.get('username', 'unknown'),
                }
            )
        except Exception as audit_err:
            logger.warning(f"Failed to write audit log for user deletion: {audit_err}")

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
@with_tenant_context
async def update_user_permissions(
    user_id: int,
    permissions_data: dict,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker(require_admin=True)),
    context: OrgContext = Depends(get_org_context)
):
    """
    DEPRECATED: User-level permissions removed in Role-First RBAC refactor.
    
    Permissions are now inherited from roles only. To change a user's permissions:
    1. Assign them a different role, OR
    2. Modify the role's permissions via /api/roles endpoints
    """
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="User-level permissions have been removed. Permissions are now inherited from roles only. "
               "To change permissions, update the user's role or modify role permissions via /api/roles."
    )
"""
Role Management API
Comprehensive role and permission management endpoints
"""
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
import json
import logging

from ....core.auth.tenant_service import get_tenant_aware_db, TenantAwareSession
from ....core.security.permissions import PermissionChecker
from ....core.security.role_management import RoleManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/roles", tags=["Role Management"])

@router.get("/")
def get_roles(
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker("master", "view"))
):
    """Get all roles for the organization"""
    try:
        org_id = current_user.get('org_id')
        role_manager = RoleManager(db)
        
        # Get role hierarchy
        roles = role_manager.get_role_hierarchy(org_id)
        
        # Get user counts for each role
        result = db.execute(
            text("""
                SELECT r.role_id, COUNT(u.user_id) as user_count
                FROM master.roles r
                LEFT JOIN master.org_users u ON r.role_id = u.role_id AND u.is_active = true
                WHERE r.org_id = :org_id
                GROUP BY r.role_id
            """),
            {"org_id": org_id}
        )
        
        user_counts = {row.role_id: row.user_count for row in result}
        
        # Add user counts to roles
        for role in roles:
            role['user_count'] = user_counts.get(role['role_id'], 0)
        
        return {
            "success": True,
            "data": roles,
            "modules": RoleManager.MODULES,
            "permission_types": RoleManager.PERMISSION_TYPES,
            "data_access_levels": RoleManager.DATA_ACCESS_LEVELS
        }
        
    except Exception as e:
        logger.error(f"Error fetching roles: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch roles: {str(e)}")

@router.post("/setup-defaults")
def setup_default_roles(
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker(require_admin=True))
):
    """Setup default roles for the organization (Admin only)"""
    try:
        org_id = current_user.get('org_id')
        role_manager = RoleManager(db)
        
        results = role_manager.setup_default_roles(org_id)
        
        return {
            "success": True,
            "message": "Default roles setup completed",
            "results": results
        }
        
    except Exception as e:
        logger.error(f"Error setting up default roles: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to setup roles: {str(e)}")

@router.get("/{role_id}")
def get_role_details(
    role_id: int,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker("master", "view"))
):
    """Get detailed information about a specific role"""
    try:
        org_id = current_user.get('org_id')
        
        result = db.execute(
            text("""
                SELECT 
                    r.*,
                    COUNT(u.user_id) as user_count
                FROM master.roles r
                LEFT JOIN master.org_users u ON r.role_id = u.role_id AND u.is_active = true
                WHERE r.role_id = :role_id AND r.org_id = :org_id
                GROUP BY r.role_id
            """),
            {"role_id": role_id, "org_id": org_id}
        )
        
        role = result.first()
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        
        role_dict = dict(role._mapping)
        
        # Parse permissions
        if role_dict['permissions']:
            if isinstance(role_dict['permissions'], str):
                role_dict['permissions'] = json.loads(role_dict['permissions'])
        
        # Get users with this role
        users_result = db.execute(
            text("""
                SELECT user_id, username, email, full_name
                FROM master.org_users
                WHERE role_id = :role_id AND org_id = :org_id AND is_active = true
                ORDER BY full_name
            """),
            {"role_id": role_id, "org_id": org_id}
        )
        
        role_dict['users'] = [dict(row._mapping) for row in users_result]
        
        return {
            "success": True,
            "data": role_dict
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching role {role_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch role: {str(e)}")

@router.post("/")
def create_custom_role(
    role_data: Dict[str, Any],
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker(require_admin=True))
):
    """Create a custom role (Admin only)"""
    try:
        org_id = current_user.get('org_id')
        role_manager = RoleManager(db)
        
        # Validate role_code doesn't exist
        existing = db.execute(
            text("""
                SELECT role_id FROM master.roles
                WHERE org_id = :org_id AND role_code = :role_code
            """),
            {"org_id": org_id, "role_code": role_data.get('role_code')}
        ).first()
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Role with this code already exists"
            )
        
        role_id = role_manager.create_custom_role(org_id, role_data)
        
        return {
            "success": True,
            "message": "Role created successfully",
            "role_id": role_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating role: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create role: {str(e)}")

@router.put("/{role_id}")
def update_role(
    role_id: int,
    role_data: Dict[str, Any],
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker(require_admin=True))
):
    """Update a role (Admin only)"""
    try:
        org_id = current_user.get('org_id')
        
        # Check if role exists and is not a system role
        result = db.execute(
            text("""
                SELECT is_system_role FROM master.roles
                WHERE role_id = :role_id AND org_id = :org_id
            """),
            {"role_id": role_id, "org_id": org_id}
        )
        
        role = result.first()
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        
        # Build update query
        update_fields = []
        params = {"role_id": role_id, "org_id": org_id}
        
        allowed_fields = [
            'role_name', 'role_description', 'permissions', 
            'allowed_modules', 'restricted_features', 'data_access_level'
        ]
        
        for field in allowed_fields:
            if field in role_data:
                update_fields.append(f"{field} = :{field}")
                if field == 'permissions':
                    params[field] = json.dumps(role_data[field])
                else:
                    params[field] = role_data[field]
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        
        db.execute(
            text(f"""
                UPDATE master.roles
                SET {', '.join(update_fields)}
                WHERE role_id = :role_id AND org_id = :org_id
            """),
            params
        )
        
        # TenantAwareSession auto-commits
        
        return {
            "success": True,
            "message": "Role updated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating role {role_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update role: {str(e)}")

@router.delete("/{role_id}")
def delete_role(
    role_id: int,
    reassign_to: Optional[int] = None,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker(require_admin=True))
):
    """Delete a role (Admin only)"""
    try:
        org_id = current_user.get('org_id')
        
        # Check if role exists and is not a system role
        result = db.execute(
            text("""
                SELECT is_system_role, 
                       (SELECT COUNT(*) FROM master.org_users WHERE role_id = :role_id) as user_count
                FROM master.roles
                WHERE role_id = :role_id AND org_id = :org_id
            """),
            {"role_id": role_id, "org_id": org_id}
        )
        
        role = result.first()
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        
        if role.is_system_role:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete system roles"
            )
        
        if role.user_count > 0 and not reassign_to:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Role has {role.user_count} users. Provide reassign_to parameter."
            )
        
        # Reassign users if needed
        if reassign_to:
            db.execute(
                text("""
                    UPDATE master.org_users
                    SET role_id = :new_role_id
                    WHERE role_id = :old_role_id AND org_id = :org_id
                """),
                {"old_role_id": role_id, "new_role_id": reassign_to, "org_id": org_id}
            )
        
        # Delete the role
        db.execute(
            text("""
                DELETE FROM master.roles
                WHERE role_id = :role_id AND org_id = :org_id
            """),
            {"role_id": role_id, "org_id": org_id}
        )
        
        # TenantAwareSession auto-commits
        
        return {
            "success": True,
            "message": "Role deleted successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting role {role_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete role: {str(e)}")

@router.post("/assign")
def assign_role_to_users(
    assignment_data: Dict[str, Any],
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker("master", "edit"))
):
    """Assign role to multiple users"""
    try:
        org_id = current_user.get('org_id')
        role_id = assignment_data.get('role_id')
        user_ids = assignment_data.get('user_ids', [])
        
        if not role_id or not user_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="role_id and user_ids are required"
            )
        
        # Verify role exists
        role_check = db.execute(
            text("""
                SELECT role_id, role_code FROM master.roles
                WHERE role_id = :role_id AND org_id = :org_id
            """),
            {"role_id": role_id, "org_id": org_id}
        ).first()
        
        if not role_check:
            raise HTTPException(status_code=404, detail="Role not found")
        
        # Update users
        result = db.execute(
            text("""
                UPDATE master.org_users
                SET role_id = :role_id,
                    is_admin = :is_admin,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ANY(:user_ids) AND org_id = :org_id
                RETURNING user_id
            """),
            {
                "role_id": role_id,
                "is_admin": role_check.role_code == "admin",
                "user_ids": user_ids,
                "org_id": org_id
            }
        )
        
        updated_count = result.rowcount
        # TenantAwareSession auto-commits
        
        return {
            "success": True,
            "message": f"Role assigned to {updated_count} users",
            "updated_count": updated_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error assigning roles: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to assign roles: {str(e)}")

@router.get("/user/{user_id}/permissions")
def get_user_permissions(
    user_id: int,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker("master", "view"))
):
    """Get effective permissions for a user"""
    try:
        org_id = current_user.get('org_id')
        
        # Verify user belongs to organization
        user_check = db.execute(
            text("""
                SELECT user_id FROM master.org_users
                WHERE user_id = :user_id AND org_id = :org_id
            """),
            {"user_id": user_id, "org_id": org_id}
        ).first()
        
        if not user_check:
            raise HTTPException(status_code=404, detail="User not found")
        
        role_manager = RoleManager(db)
        permissions = role_manager.get_user_effective_permissions(user_id)
        
        return {
            "success": True,
            "data": permissions
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching user permissions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch permissions: {str(e)}")

@router.post("/validate")
def validate_permission(
    validation_data: Dict[str, Any],
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker())
):
    """Validate if current user has specific permission"""
    try:
        user_id = current_user.get('user_id')
        module = validation_data.get('module')
        permission = validation_data.get('permission')
        
        if not module or not permission:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="module and permission are required"
            )
        
        role_manager = RoleManager(db)
        has_permission = role_manager.validate_permission(user_id, module, permission)
        
        return {
            "success": True,
            "has_permission": has_permission,
            "module": module,
            "permission": permission
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating permission: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to validate permission: {str(e)}")
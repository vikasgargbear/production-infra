"""
Permission middleware and decorators for role-based access control
"""
from functools import wraps
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, Depends, status, Header
from sqlalchemy.orm import Session
from sqlalchemy import text
import jwt
import json
import logging

from .database import get_db
from .config import settings

logger = logging.getLogger(__name__)

# Module definitions
MODULES = {
    "SALES": "sales",
    "PURCHASE": "purchase", 
    "INVENTORY": "inventory",
    "PAYMENT": "payment",
    "REPORTS": "reports",
    "MASTER": "master",
    "GST": "gst",
    "RETURNS": "returns",
    "LEDGER": "ledger",
    "NOTES": "notes"
}

# Permission levels
PERMISSIONS = {
    "VIEW": "view",
    "CREATE": "create",
    "EDIT": "edit",
    "DELETE": "delete",
    "APPROVE": "approve",
    "EXPORT": "export"
}

class PermissionChecker:
    """
    Dependency class for checking user permissions
    """
    def __init__(self, module: str = None, permission: str = None, require_admin: bool = False):
        self.module = module
        self.permission = permission
        self.require_admin = require_admin
    
    async def __call__(self, 
                       authorization: str = Header(None),
                       db: Session = Depends(get_db)) -> Dict[str, Any]:
        """
        Check if user has required permissions
        """
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing or invalid authentication token"
            )
        
        token = authorization.replace("Bearer ", "")
        
        try:
            # Decode JWT token - use same secret as jwt_auth module
            import os
            jwt_secret = os.getenv("JWT_SECRET_KEY", settings.SECRET_KEY)
            payload = jwt.decode(token, jwt_secret, algorithms=[settings.ALGORITHM])
            user_id = payload.get("user_id")
            org_id = payload.get("org_id")
            
            if not user_id or not org_id:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token payload"
                )
            
            # Get user details with role and permissions
            result = db.execute(
                text("""
                    SELECT 
                        u.user_id,
                        u.username,
                        u.email,
                        u.org_id,
                        u.is_admin,
                        u.permissions as user_permissions,
                        r.role_id,
                        r.role_code,
                        r.role_name,
                        r.permissions as role_permissions,
                        r.allowed_modules,
                        r.data_access_level
                    FROM master.org_users u
                    LEFT JOIN master.roles r ON u.role_id = r.role_id
                    WHERE u.user_id = :user_id 
                    AND u.org_id = :org_id
                    AND u.is_active = true
                """),
                {"user_id": user_id, "org_id": org_id}
            )
            
            user = result.first()
            
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="User not found or inactive"
                )
            
            user_dict = dict(user._mapping)
            
            # Check admin requirement
            if self.require_admin and not user_dict['is_admin']:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Admin access required"
                )
            
            # If no specific permission required, just return user
            if not self.module and not self.permission:
                return user_dict
            
            # Admin users have all permissions
            if user_dict['is_admin']:
                return user_dict
            
            # Check module access
            if self.module:
                allowed_modules = user_dict.get('allowed_modules') or []
                if self.module.lower() not in [m.lower() for m in allowed_modules]:
                    # Check role permissions
                    if not self._check_permission(user_dict, self.module, self.permission):
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail=f"Access denied to {self.module} module"
                        )
            
            # Check specific permission
            if self.permission and not self._check_permission(user_dict, self.module, self.permission):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Permission denied: {self.permission} on {self.module}"
                )
            
            return user_dict
            
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired"
            )
        except jwt.InvalidTokenError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Permission check error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Permission check failed"
            )
    
    def _check_permission(self, user: Dict, module: str, permission: str) -> bool:
        """
        Check if user has specific permission for a module
        """
        # Merge role and user permissions
        role_perms = user.get('role_permissions') or {}
        user_perms = user.get('user_permissions') or {}
        
        # User permissions override role permissions
        if isinstance(user_perms, str):
            try:
                user_perms = json.loads(user_perms)
            except:
                user_perms = {}
        
        if isinstance(role_perms, str):
            try:
                role_perms = json.loads(role_perms)
            except:
                role_perms = {}
        
        # Check for "all" permission
        if user_perms.get('all') or role_perms.get('all'):
            return True
        
        # Check module-specific permissions
        module_lower = module.lower() if module else None
        perm_lower = permission.lower() if permission else None
        
        # Check user permissions first (they override role permissions)
        if module_lower in user_perms:
            module_perms = user_perms[module_lower]
            if isinstance(module_perms, dict):
                if module_perms.get('all') or module_perms.get(perm_lower):
                    return True
            elif isinstance(module_perms, list) and perm_lower in module_perms:
                return True
        
        # Check role permissions
        if module_lower in role_perms:
            module_perms = role_perms[module_lower]
            if isinstance(module_perms, dict):
                if module_perms.get('all') or module_perms.get(perm_lower):
                    return True
            elif isinstance(module_perms, list) and perm_lower in module_perms:
                return True
        
        return False

def require_permission(module: str = None, permission: str = None, require_admin: bool = False):
    """
    Decorator for protecting routes with permission checks
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # The PermissionChecker will be injected as a dependency
            return await func(*args, **kwargs)
        
        # Add the permission checker as a dependency
        wrapper.__annotations__['current_user'] = Depends(PermissionChecker(module, permission, require_admin))
        return wrapper
    
    return decorator

def get_current_user(authorization: str = Header(None), db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Get current user from JWT token
    """
    checker = PermissionChecker()
    return checker(authorization, db)

def check_module_access(user: Dict, module: str) -> bool:
    """
    Check if user has access to a module
    """
    if user.get('is_admin'):
        return True
    
    allowed_modules = user.get('allowed_modules') or []
    if module.lower() in [m.lower() for m in allowed_modules]:
        return True
    
    # Check in permissions
    checker = PermissionChecker()
    return checker._check_permission(user, module, 'view')

def check_permission(user: Dict, module: str, permission: str) -> bool:
    """
    Check if user has specific permission for a module
    """
    if user.get('is_admin'):
        return True
    
    checker = PermissionChecker()
    return checker._check_permission(user, module, permission)

# Module-specific permission shortcuts
def require_sales_permission(permission: str = "view"):
    return require_permission(MODULES["SALES"], permission)

def require_purchase_permission(permission: str = "view"):
    return require_permission(MODULES["PURCHASE"], permission)

def require_inventory_permission(permission: str = "view"):
    return require_permission(MODULES["INVENTORY"], permission)

def require_payment_permission(permission: str = "view"):
    return require_permission(MODULES["PAYMENT"], permission)

def require_reports_permission(permission: str = "view"):
    return require_permission(MODULES["REPORTS"], permission)

def require_master_permission(permission: str = "view"):
    return require_permission(MODULES["MASTER"], permission)

def require_returns_permission(permission: str = "view"):
    return require_permission(MODULES["RETURNS"], permission)

def require_admin():
    return require_permission(require_admin=True)
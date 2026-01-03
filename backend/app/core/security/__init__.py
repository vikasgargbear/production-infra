"""
Security Module - RBAC and Permissions
"""
from .permissions import (
    PermissionChecker,
    require_permission,
    require_admin,
    require_sales_permission,
    require_purchase_permission,
    require_inventory_permission,
    require_payment_permission,
    require_reports_permission,
    require_master_permission,
    require_returns_permission,
    get_current_user,
    check_module_access,
    check_permission,
    MODULES,
    PERMISSIONS,
)
from .role_management import RoleManager

__all__ = [
    "PermissionChecker", "require_permission", "require_admin",
    "require_sales_permission", "require_purchase_permission",
    "require_inventory_permission", "require_payment_permission",
    "require_reports_permission", "require_master_permission",
    "require_returns_permission", "get_current_user",
    "check_module_access", "check_permission",
    "MODULES", "PERMISSIONS", "RoleManager",
]

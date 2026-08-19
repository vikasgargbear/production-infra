"""
Core Module - Re-exports for backward compatibility

New structure:
- core.auth: Authentication, JWT, multi-tenancy
- core.security: RBAC, permissions, role management
- core.utils: API utilities, constants, helpers
"""
# Auth exports (backward compatible)
from .auth import (
    decode_jwt, create_access_token,
    get_org_id_string, get_user_context_secure, get_current_user_and_org,
    BranchScope, OrgContext, get_org_context,
    TenantContext, TenantAwareSession, TenantQueryBuilder, SecurityError,
    get_tenant_aware_db, with_tenant_context,
    blacklist_token, is_token_blacklisted,
    supabase_auth, SupabaseAuthService,
)

# Security exports (backward compatible)
from .security import (
    PermissionChecker, require_permission, require_admin,
    require_sales_permission, require_purchase_permission,
    require_inventory_permission, require_payment_permission,
    require_reports_permission, require_master_permission,
    require_returns_permission, get_current_user,
    check_module_access, check_permission, MODULES, PERMISSIONS,
    RoleManager,
)

# Utils exports (backward compatible)
from .utils import (
    StandardResponse, PaginatedResponse, ResponseMeta,
    create_response, create_error_response, handle_error,
    get_request_id, set_request_id, add_cache_headers,
    add_no_cache_headers, create_pagination_meta,
    GST_STATE_CODES, get_state_code, get_state_name_and_code, validate_state_code,
)

# Database (stays at root)
from .database import get_db, engine, SessionLocal, Base, set_org_context

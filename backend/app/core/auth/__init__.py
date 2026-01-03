"""
Authentication and Multi-Tenancy Module
"""
from .jwt_auth import (
    SECRET_KEY,
    ALGORITHM,
    decode_jwt,
    create_access_token,
    verify_password,
    get_password_hash,
    get_org_id_string,
    get_user_context_secure,
    get_current_user_and_org,
)
from .org_context import BranchScope, OrgContext, get_org_context
from .tenant_service import (
    TenantContext,
    TenantAwareSession,
    TenantQueryBuilder,
    SecurityError,
    get_tenant_aware_db,
    with_tenant_context,
)
from .token_blacklist import blacklist_token, is_token_blacklisted
from .supabase_auth import supabase_auth, SupabaseAuthService

__all__ = [
    # JWT
    "SECRET_KEY", "ALGORITHM", "decode_jwt", "create_access_token",
    "verify_password", "get_password_hash", "get_org_id_string",
    "get_user_context_secure", "get_current_user_and_org",
    # Org Context
    "BranchScope", "OrgContext", "get_org_context",
    # Tenant Service
    "TenantContext", "TenantAwareSession", "TenantQueryBuilder",
    "SecurityError", "get_tenant_aware_db", "with_tenant_context",
    # Token
    "blacklist_token", "is_token_blacklisted",
    # Supabase
    "supabase_auth", "SupabaseAuthService",
]

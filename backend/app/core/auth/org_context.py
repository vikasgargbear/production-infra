"""
Organization Context with Branch-Aware Filtering

Enterprise multi-tenant context supporting:
- org_id: Hard security boundary (always filtered)
- branch_id: Operational boundary (filtered based on user's branch_scope)

Branch Scope Types:
- SINGLE: User sees only their assigned branch (Store Manager, Staff)
- MULTI: User sees specific assigned branches (Regional Manager)
- ALL: User sees all branches in org (CEO, Owner, Admin)
"""
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, List
from uuid import UUID
from enum import Enum
from jose import JWTError
import logging

from .jwt_auth import decode_jwt  # Single source of truth
from ..env import is_production, is_test_mode_enabled

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)


class BranchScope(str, Enum):
    """
    Branch access scope - determines what branch data a user can access.
    
    Used by BranchAwareTenantSession to automatically inject branch filters.
    """
    SINGLE = "single"   # One branch only (store staff, store manager)
    MULTI = "multi"     # Multiple specific branches (regional manager)
    ALL = "all"         # All branches in org (CEO, owner, admin)


class OrgContext:
    """
    Enhanced organization context with branch-level access control.
    
    Attributes:
        org_id: Organization UUID (always required, always filtered)
        user_id: User identifier (int or UUID)
        branch_scope: Level of branch access (SINGLE, MULTI, ALL)
        branch_ids: List of accessible branch UUIDs
        permissions: User's permission set
    """
    def __init__(
        self, 
        org_id: UUID, 
        user_id: Optional[any] = None,
        branch_scope: BranchScope = BranchScope.ALL,
        branch_ids: Optional[List[UUID]] = None
    ):
        self.org_id = org_id
        self.user_id = user_id
        self.branch_scope = branch_scope
        self.branch_ids = branch_ids or []
        self.permissions = []
    
    @property
    def branch_id(self):
        """Get primary branch_id for backward compatibility with routes using context.branch_id."""
        return self.branch_ids[0] if self.branch_ids else None

    @property
    def primary_branch_id(self) -> Optional[UUID]:
        """Get user's primary branch (first in list)"""
        return self.branch_ids[0] if self.branch_ids else None
    
    @property
    def has_all_branch_access(self) -> bool:
        """Check if user can see all branches"""
        return self.branch_scope == BranchScope.ALL
    
    def can_access_branch(self, branch_id: UUID) -> bool:
        """Check if user can access a specific branch"""
        if self.branch_scope == BranchScope.ALL:
            return True
        return branch_id in self.branch_ids
    
    def has_permission(self, permission: str) -> bool:
        return permission in self.permissions


async def get_org_context(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> OrgContext:
    """
    SECURE: Get organization context from JWT token ONLY
    
    Security Fix (Nov 30, 2025): Removed X-Org-Id header fallback
    Multi-tenant SaaS requires server-verified org_id from JWT, not client headers
    
    TEST MODE: Set TEST_MODE=true env var to bypass auth (for automated testing only!)
    """
    import os
    
    # TEST MODE: Bypass auth for automated testing
    # SECURITY: Block TEST_MODE in production
    if is_test_mode_enabled():
        if is_production():
            logger.critical("SECURITY: TEST_MODE=true blocked in production environment")
            raise HTTPException(
                status_code=503,
                detail="Service configuration error"
            )
        logger.warning("TEST_MODE enabled - bypassing authentication")
        # Return default test context - adjust org_id to match your test org
        test_org_id = os.getenv("TEST_ORG_ID", "e78d6777-35f6-4b19-994f-caaede2f021a")
        test_branch_id = int(os.getenv("TEST_BRANCH_ID", "5"))
        return OrgContext(
            org_id=UUID(test_org_id),
            user_id=8,  # Default test user
            branch_scope=BranchScope.ALL,
            branch_ids=[test_branch_id]
        )
    
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Provide Bearer token.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    try:
        token = credentials.credentials
        
        # Use central decode function (single source of truth)
        try:
            payload = decode_jwt(token)
        except JWTError as decode_error:
            logger.error(f"JWT decode error: {decode_error}")
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired authentication token. Please login again.",
                headers={"WWW-Authenticate": "Bearer"}
            )
        
        org_id_str = payload.get("org_id")
        user_id_value = payload.get("user_id")
        
        if not org_id_str:
            raise HTTPException(
                status_code=401, 
                detail="Invalid token: missing org_id"
            )
        
        org_id = UUID(org_id_str) if isinstance(org_id_str, str) else org_id_str
        
        # user_id can be int or string, convert appropriately
        user_id = None
        if user_id_value:
            if isinstance(user_id_value, int):
                user_id = user_id_value  # Keep as int, don't convert to UUID
            elif isinstance(user_id_value, str):
                try:
                    user_id = UUID(user_id_value)
                except ValueError:
                    user_id = user_id_value  # Keep as string if not valid UUID
        
        # Extract branch scope from token - REQUIRED field
        branch_scope_str = payload.get("branch_scope")
        if not branch_scope_str:
            # Old token without branch_scope - treat as ALL for safety
            # New tokens will always have branch_scope set from data_access_level
            branch_scope = BranchScope.ALL
        else:
            try:
                branch_scope = BranchScope(branch_scope_str)
            except ValueError:
                raise HTTPException(
                    status_code=401,
                    detail=f"Invalid branch_scope in token: {branch_scope_str}"
                )
        
        # Extract branch_ids from token
        branch_ids_raw = payload.get("branch_ids", [])
        branch_ids = []
        for bid in branch_ids_raw:
            if bid:
                try:
                    branch_ids.append(UUID(bid) if isinstance(bid, str) else bid)
                except (ValueError, TypeError):
                    logger.warning(f"Invalid branch_id in token: {bid}")
        
        return OrgContext(
            org_id=org_id, 
            user_id=user_id,
            branch_scope=branch_scope,
            branch_ids=branch_ids
        )
        
    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is
    except (JWTError, ValueError) as e:
        logger.error(f"JWT token validation failed: {e}")
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"}
        )

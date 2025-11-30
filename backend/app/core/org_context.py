"""
Simple Organization Context - minimal version
"""
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from uuid import UUID
from jose import JWTError, jwt
import logging

from .jwt_auth import SECRET_KEY, ALGORITHM

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)


class OrgContext:
    """Simple organization context"""
    def __init__(self, org_id: UUID, user_id: Optional[any] = None):
        self.org_id = org_id
        self.user_id = user_id  # Can be int, UUID, or str depending on system
        self.permissions = []
    
    def has_permission(self, permission: str) -> bool:
        return permission in self.permissions


async def get_org_context(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> OrgContext:
    """
    SECURE: Get organization context from JWT token ONLY
    
    Security Fix (Nov 30, 2025): Removed X-Org-Id header fallback
    Multi-tenant SaaS requires server-verified org_id from JWT, not client headers
    """
    
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Provide Bearer token.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    try:
        token = credentials.credentials
        
        # Decode JWT with better error handling
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        except Exception as decode_error:
            # Log specific decode error but don't expose internals
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
        
        return OrgContext(org_id, user_id)
        
    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is
    except (JWTError, ValueError) as e:
        logger.error(f"JWT token validation failed: {e}")
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"}
        )
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
    def __init__(self, org_id: UUID, user_id: Optional[UUID] = None):
        self.org_id = org_id
        self.user_id = user_id
        self.permissions = []
    
    def has_permission(self, permission: str) -> bool:
        return permission in self.permissions


async def get_org_context(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    request: Request = None
) -> OrgContext:
    """Get organization context from JWT token or header"""
    
    # Try JWT token first
    if credentials:
        try:
            token = credentials.credentials
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            org_id_str = payload.get("org_id")
            user_id_str = payload.get("user_id")
            
            if org_id_str:
                org_id = UUID(org_id_str) if isinstance(org_id_str, str) else org_id_str
                user_id = UUID(user_id_str) if user_id_str else None
                return OrgContext(org_id, user_id)
        except (JWTError, ValueError) as e:
            logger.warning(f"JWT token invalid: {e}")
    
    # Fallback to X-Org-Id header
    if request:
        x_org_id = request.headers.get("x-org-id") or request.headers.get("X-Org-Id")
        if x_org_id:
            try:
                return OrgContext(UUID(x_org_id))
            except ValueError:
                pass
    
    raise HTTPException(
        status_code=401,
        detail="Authentication required. Provide Bearer token or X-Org-Id header."
    )
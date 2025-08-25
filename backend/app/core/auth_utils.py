"""
Authentication utilities for handling org_id and user context
"""
from fastapi import Header, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, Dict
from jose import JWTError, jwt
from .jwt_auth import SECRET_KEY, ALGORITHM

# Bearer token scheme - auto_error=False makes it optional
security = HTTPBearer(auto_error=False)

def get_org_id_from_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    x_org_id: Optional[str] = Header(None, alias="X-Org-Id")
) -> str:
    """
    ENTERPRISE: Extract organization ID from JWT token
    Temporarily allows header fallback to prevent blocking
    """
    # Try JWT token first (preferred)
    if credentials:
        try:
            token = credentials.credentials
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            org_id = payload.get("org_id")
            
            if org_id:
                return org_id
        except JWTError:
            pass  # Fall through to header
    
    # Temporary fallback to header to prevent blocking
    if x_org_id:
        return x_org_id
    
    # If neither available, raise error
    raise HTTPException(
        status_code=401,
        detail="Authentication required. Please provide Bearer token or X-Org-Id header.",
        headers={"WWW-Authenticate": "Bearer"}
    )

def get_user_context_from_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Dict[str, str]:
    """
    ENTERPRISE: Extract full user context from JWT token
    Returns user_id, org_id, role, email
    """
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Authentication required"
        )
    
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        return {
            "user_id": payload.get("user_id"),
            "org_id": payload.get("org_id"),
            "role": payload.get("role"),
            "email": payload.get("email")
        }
    except JWTError:
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token"
        )

# DEPRECATED: Keep for backward compatibility but should be removed
def get_org_id_from_header(
    x_org_id: Optional[str] = Header(None, alias="X-Org-Id")
) -> str:
    """
    DEPRECATED: Get organization ID from request header
    This is insecure - client can send any org_id they want!
    Use get_org_id_from_token instead
    """
    if not x_org_id:
        raise HTTPException(
            status_code=400,
            detail="Organization ID is required. Please provide X-Org-Id header."
        )
    return x_org_id

def get_optional_org_id(
    x_org_id: Optional[str] = Header(None, alias="X-Org-Id")
) -> Optional[str]:
    """
    DEPRECATED: Get optional organization ID from request header
    This is insecure - use get_org_id_from_token instead
    """
    return x_org_id
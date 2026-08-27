"""
JWT Authentication utilities
"""
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional
import jwt
from jwt import InvalidTokenError as JWTError
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .token_blacklist import is_token_blacklisted, blacklist_token
from ..env import is_production

# Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
IS_PRODUCTION = is_production()

if not SECRET_KEY or SECRET_KEY == "your-secret-key-here":
    if IS_PRODUCTION:
        raise RuntimeError(
            "SECURITY ERROR: JWT_SECRET_KEY must be set in production! "
            "Set it to a secure random string (min 32 chars)."
        )
    # Development fallback - silent unless DEBUG
    SECRET_KEY = "dev-only-insecure-key-never-use-in-production"

ALGORITHM = "HS256"
TOKEN_ISSUER = "aasopharma-api"
TOKEN_AUDIENCE = "aasopharma-api"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 if IS_PRODUCTION else 1440  # 1h prod, 24h dev

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """
    Create a JWT access token with jti for blacklist support.
    
    The jti (JWT ID) is a unique identifier that allows us to:
    - Blacklist specific tokens on logout
    - Track token usage
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    # Add jti (JWT ID) for blacklist support
    jti = str(uuid.uuid4())
    subject = data.get("auth_user_id") or data.get("user_id")
    to_encode.update({
        "exp": expire,
        "jti": jti,
        "iat": datetime.utcnow(),
        "sub": str(subject),
        "iss": TOKEN_ISSUER,
        "aud": TOKEN_AUDIENCE,
        "token_use": "access",
    })
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_jwt(token: str, check_blacklist: bool = True) -> dict:
    """
    SINGLE SOURCE OF TRUTH: Decode and validate a JWT token.
    
    This is the ONLY function that should decode JWT tokens.
    All other modules should import and use this function.
    
    Args:
        token: JWT token string
        check_blacklist: Whether to check if token is blacklisted (default: True)
        
    Returns:
        dict: Decoded payload
        
    Raises:
        JWTError: If token is invalid, expired, or blacklisted
    """
    payload = jwt.decode(
        token,
        SECRET_KEY,
        algorithms=[ALGORITHM],
        audience=TOKEN_AUDIENCE,
        issuer=TOKEN_ISSUER,
        options={"require": ["exp", "iat", "sub"]},
    )
    if payload.get("token_use") != "access":
        raise JWTError("Invalid token use")
    
    # Check if token is blacklisted (for logout support)
    if check_blacklist:
        jti = payload.get("jti")
        if jti and is_token_blacklisted(jti):
            raise JWTError("Token has been revoked")
    
    return payload


# ==============================================================================
# FASTAPI DEPENDENCIES - For use in route handlers
# ==============================================================================

from uuid import UUID

# Bearer token scheme
_security = HTTPBearer(auto_error=False)


def get_org_id_string(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_security)
) -> str:
    """
    FastAPI dependency to get org_id as string from JWT token.
    
    This replaces secure_auth.get_org_id_string() as single source of truth.
    
    Usage:
        @router.get("/items")
        def get_items(org_id: str = Depends(get_org_id_string)):
            ...
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide Bearer token.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    try:
        payload = decode_jwt(credentials.credentials)
        org_id = payload.get("org_id")
        
        if not org_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="org_id not found in token. Please login again."
            )
        return str(org_id)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"}
        )


def get_user_context_secure(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_security)
) -> dict:
    """
    FastAPI dependency to get full user context from JWT token.
    
    This replaces secure_auth.get_user_context_secure() as single source of truth.
    
    Returns:
        dict with user_id, org_id (as UUID), role, email, full_name
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    try:
        payload = decode_jwt(credentials.credentials)
        org_id_str = payload.get("org_id")
        
        if not org_id_str:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="org_id missing from token"
            )
        
        return {
            "user_id": payload.get("user_id"),
            "org_id": UUID(org_id_str) if isinstance(org_id_str, str) else org_id_str,
            "role": payload.get("role"),
            "email": payload.get("email"),
            "full_name": payload.get("full_name")
        }
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"}
        )

async def get_current_user_and_org(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_security),
):
    """
    Get current user and organization from JWT token.
    
    SECURITY: X-Org-Id header fallback REMOVED (Nov 30, 2025)
    JWT token is now REQUIRED - prevents client from bypassing auth.
    """
    
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Token provided - decode it
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = decode_jwt(credentials.credentials)
        
        # Handle both old and new token formats
        user_id = payload.get("user_id") or payload.get("sub")
        email = payload.get("email") or payload.get("sub")
        org_id = payload.get("org_id")
        
        # branch_id might not exist in old tokens - default to None
        branch_id = payload.get("branch_id")
        
        role = payload.get("role")
        
        # org_id MUST be in token - no fallback
        if not org_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="org_id missing from token. Please login again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        if not user_id and not email:
            raise credentials_exception
            
        return {
            "user_id": user_id,
            "email": email,
            "username": email,  # Keep for backward compatibility
            "org_id": org_id,
            "branch_id": branch_id,  # Will be None for old tokens
            "role": role,
            "full_name": payload.get("full_name"),
            "org_name": payload.get("org_name")
        }
    except JWTError as e:
        import logging
        logging.error(f"JWT decode error: {str(e)}")
        raise credentials_exception

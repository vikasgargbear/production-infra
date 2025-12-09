"""
SECURE Authentication Utilities - Token-based org_id extraction
Use these instead of get_org_id_from_header
"""
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, Dict
from jose import JWTError, jwt
from uuid import UUID
import logging

from .jwt_auth import SECRET_KEY, ALGORITHM

logger = logging.getLogger(__name__)

# Bearer token scheme
security = HTTPBearer(auto_error=False)


def get_org_id_secure(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    request: Request = None
) -> UUID:
    """
    SECURE: Get org_id from JWT token only
    This is the ONLY way org_id should be extracted in production

    Returns:
        UUID: Organization ID from JWT token

    Raises:
        HTTPException: If token is missing or invalid
    """
    # Try JWT token first (REQUIRED in production)
    if credentials:
        try:
            token = credentials.credentials
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            org_id_str = payload.get("org_id")

            if org_id_str:
                # Convert to UUID
                org_id = UUID(org_id_str) if isinstance(org_id_str, str) else org_id_str
                logger.debug(f"Extracted org_id from JWT: {org_id}")
                return org_id
            else:
                raise HTTPException(
                    status_code=401,
                    detail="org_id not found in JWT token"
                )
        except JWTError as e:
            logger.error(f"JWT decode error: {e}")
            raise HTTPException(
                status_code=401,
                detail="Invalid authentication token"
            )
        except ValueError as e:
            logger.error(f"Invalid UUID in org_id: {e}")
            raise HTTPException(
                status_code=401,
                detail="Invalid org_id format in token"
            )

    # REMOVED: X-Org-Id header fallback (SECURITY FIX - Nov 30, 2025)
    # Client-controlled headers are a security vulnerability in multi-tenant SaaS
    # org_id MUST come from JWT token only (cryptographically signed, server-verified)
    
    # No valid JWT token found
    raise HTTPException(
        status_code=401,
        detail="Authentication required. Provide Bearer token with valid JWT.",
        headers={"WWW-Authenticate": "Bearer"}
    )


def get_user_context_secure(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Dict[str, any]:
    """
    SECURE: Extract full user context from JWT token

    Returns:
        Dict with: user_id, org_id (as UUID), role, email, full_name

    Raises:
        HTTPException: If token is missing or invalid
    """
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Authentication required"
        )

    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        # Extract and validate org_id
        org_id_str = payload.get("org_id")
        if not org_id_str:
            raise HTTPException(
                status_code=401,
                detail="org_id missing from token"
            )

        return {
            "user_id": payload.get("user_id"),
            "org_id": UUID(org_id_str) if isinstance(org_id_str, str) else org_id_str,
            "role": payload.get("role"),
            "email": payload.get("email"),
            "full_name": payload.get("full_name")
        }
    except JWTError as e:
        logger.error(f"JWT decode error: {e}")
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token"
        )
    except ValueError as e:
        logger.error(f"Invalid data in token: {e}")
        raise HTTPException(
            status_code=401,
            detail="Invalid token data format"
        )


def get_org_id_string(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    request: Request = None
) -> str:
    """
    Helper that returns org_id as string instead of UUID
    For APIs that still expect string format
    """
    org_id_uuid = get_org_id_secure(credentials, request)
    return str(org_id_uuid)


# Migration helper - logs usage of deprecated function
def get_org_id_from_header_deprecated(
    x_org_id: Optional[str] = None
) -> str:
    """
    DEPRECATED - DO NOT USE
    Kept only for backward compatibility during migration
    This will be removed in future versions
    """
    logger.error("SECURITY WARNING: Using deprecated get_org_id_from_header - migrate to get_org_id_secure!")

    if not x_org_id:
        raise HTTPException(
            status_code=400,
            detail="DEPRECATED: This endpoint needs migration to JWT authentication"
        )
    return x_org_id

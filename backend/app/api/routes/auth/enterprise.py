"""
Enterprise Authentication API
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])
bearer = HTTPBearer(auto_error=False)


@router.post("/logout")
async def logout(
    req: Request,
) -> Dict[str, str]:
    """
    Logout user and invalidate session by blacklisting the token.

    The token is extracted from the Authorization header and added to the
    process token blacklist.  This endpoint deliberately performs no database
    audit write: canonical ``core.audit_events`` records reviewed row
    mutations and has no explicit session-logout append command.  Treating it
    as a replacement for the retired activity-log table would manufacture a
    contract the canonical model does not provide.
    """
    from ....core.auth.jwt_auth import decode_jwt
    from ....core.auth.token_blacklist import blacklist_token

    # Extract token from Authorization header
    auth_header = req.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    else:
        # No token provided - just return success (already logged out)
        return {
            "message": "Logged out successfully",
            "action": "clear_local_storage"
        }

    try:
        # Decode token (without blacklist check since we're logging out)
        payload = decode_jwt(token, check_blacklist=False)

        # Get jti and expiry for blacklist
        jti = payload.get("jti")
        exp = payload.get("exp")

        if jti and exp:
            # Add to blacklist until token expires naturally
            blacklist_token(jti, exp)
            logger.info(f"Logout: Token blacklisted - IP: {req.client.host}")
        else:
            logger.warning(f"Logout: Token without jti - IP: {req.client.host}")

    except Exception as e:
        # Token invalid or expired - that's fine, user is effectively logged out
        logger.info(f"Logout: Token already invalid - IP: {req.client.host}")

    return {
        "message": "Logged out successfully",
        "action": "clear_local_storage"
    }


@router.get("/verify-token")
async def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> Dict[str, Any]:
    """
    Verify if current token is valid (not expired, not blacklisted).
    
    **Use Case**: Check authentication status before sensitive operations
    
    Returns:
        - valid: True if token is valid
        - user_id: The user's ID
        - org_id: The organization ID
        - exp: Token expiry timestamp
    """
    from ....core.auth.jwt_auth import decode_jwt
    from jwt import InvalidTokenError as JWTError
    
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header"
        )

    token = credentials.credentials
    
    try:
        # Decode and validate token (includes blacklist check)
        payload = decode_jwt(token, check_blacklist=True)
        
        return {
            "valid": True,
            "user_id": payload.get("user_id") or payload.get("sub"),
            "org_id": payload.get("org_id"),
            "role": payload.get("role"),
            "exp": payload.get("exp"),
            "jti": payload.get("jti")
        }
        
    except JWTError as e:
        error_msg = str(e)
        if "revoked" in error_msg.lower():
            detail = "Token has been revoked (logged out)"
        elif "expired" in error_msg.lower():
            detail = "Token has expired"
        else:
            detail = "Invalid token"
            
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail
        )

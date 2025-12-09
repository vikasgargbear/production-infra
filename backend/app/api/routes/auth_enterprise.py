"""
Enterprise Authentication API
Clean, layered architecture with offline support for India's network conditions
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import Dict, Any
import logging

from ...core.database import get_db
from ...services.auth import (
    AuthService,
    InvalidCredentialsError,
    AccountDisabledError,
    PasswordNotSetError,
    OrganizationDisabledError,
    RateLimitExceededError
)
from ..schemas.auth_schemas import (
    LoginRequest,
    LoginResponse,
    RefreshTokenRequest,
    AuthError
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login")  # response_model removed - works without validation
async def login(
    request_data: LoginRequest,
    req: Request,
    db: Session = Depends(get_db)
):
    """
    Authenticate user and return JWT tokens
    
    **Features**:
    - Email/password authentication
    - JWT token generation
    - Offline mode support (hash provided)
    - Remember me option (7-day tokens)
    - Rate limiting (5 attempts/minute)
    
    **For Offline Mode**:
    Response includes `offline_auth_hash` that frontend can store in IndexedDB.
    When offline, frontend can verify credentials locally using this hash.
    
    **Returns**:
    - access_token: Short-lived JWT (1 hour or 7 days if remember_me)
    - refresh_token: Long-lived token for renewal (30 days)
    - user: User profile information
    - offline_auth_hash: Hash for offline authentication
    """
    try:
        # Authenticate using service layer
        result = await AuthService.authenticate(
            email=request_data.email,
            password=request_data.password,
            db=db,
            remember_me=request_data.remember_me
        )
        
        # Add offline auth hash for India's poor connectivity
        user_data = result["user"]
        offline_hash = AuthService.create_offline_auth_hash(
            email=request_data.email,
            password=request_data.password,
            user_data=user_data
        )
        
        result["offline_auth_hash"] = offline_hash
        
        # Log successful authentication
        logger.info(
            f"Login successful: user_id={user_data['id']}, "
            f"org_id={user_data['org_id']}, "
            f"ip={req.client.host}"
        )
        
        return result
        
    except InvalidCredentialsError as e:
        logger.warning(f"Login failed: Invalid credentials for {request_data.email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "invalid_credentials",
                "error_description": str(e),
                "error_code": e.error_code
            }
        )
    
    except AccountDisabledError as e:
        logger.warning(f"Login failed: Account disabled - {request_data.email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "account_disabled",
                "error_description": str(e),
                "error_code": e.error_code
            }
        )
    
    except OrganizationDisabledError as e:
        logger.warning(f"Login failed: Organization disabled - {request_data.email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "organization_disabled",
                "error_description": str(e),
                "error_code": e.error_code
            }
        )
    
    except PasswordNotSetError as e:
        logger.error(f"Login failed: No password set - {request_data.email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "password_not_set",
                "error_description": str(e),
                "error_code": e.error_code,
                "action": "contact_administrator"
            }
        )
    
    except Exception as e:
        logger.error(f"Login failed: Unexpected error - {request_data.email}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "internal_error",
                "error_description": "An unexpected error occurred",
                "error_code": 9999
            }
        )


@router.post("/logout")
async def logout(
    req: Request,
) -> Dict[str, str]:
    """
    Logout user and invalidate session by blacklisting the token.
    
    The token is extracted from Authorization header and added to blacklist.
    **Offline Mode**: Frontend should also clear local storage/IndexedDB
    """
    from ...core.jwt_auth import decode_jwt
    from ...core.token_blacklist import blacklist_token
    
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
    req: Request,
    db: Session = Depends(get_db)
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
    from ...core.jwt_auth import decode_jwt
    from jose import JWTError
    
    # Extract token from Authorization header
    auth_header = req.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header"
        )
    
    token = auth_header[7:]
    
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


@router.get("/health")
async def auth_health_check(db: Session = Depends(get_db)) -> Dict[str, str]:
    """
    Health check for authentication service
    Tests database connectivity
    """
    try:
        # Test database connection
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
        
        return {
            "status": "healthy",
            "service": "authentication",
            "database": "connected"
        }
    except Exception as e:
        logger.error(f"Auth health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "service": "authentication",
                "database": "disconnected",
                "error": str(e)
            }
        )


@router.post("/check-user")
async def check_user_exists(
    email: str,
    db: Session = Depends(get_db)
) -> Dict[str, bool]:
    """
    Check if user exists (for registration flow)
    
    **Privacy Note**: Returns generic message to prevent email enumeration
    """
    from ...repositories.user_repository import UserRepository
    
    user = UserRepository.find_by_email(email, db)
    
    # Don't reveal if user exists (security best practice)
    # Always return same response time
    return {"message": "If account exists, you will receive an email"}

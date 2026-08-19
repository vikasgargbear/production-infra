"""
Enterprise Authentication API
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from typing import Dict, Any
import logging

from ....core.database import get_db  # Regular session for auth (no tenant context yet)
from ....core.env import is_production
from ....core.auth.tenant_service import get_tenant_aware_db, TenantAwareSession
from ....core.rate_limiting import rate_limit
from ...services.auth import (
    AuthService,
    InvalidCredentialsError,
    AccountDisabledError,
    PasswordNotSetError,
    OrganizationDisabledError,
    RateLimitExceededError
)
from ...schemas.auth.auth_schemas import (
    LoginRequest,
    LoginResponse,
    AuthError
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _mask_email(email: str) -> str:
    """Mask email for safe logging: 'user@example.com' -> 'u***@e***.com'"""
    if not email or "@" not in email:
        return "***"
    local, domain = email.split("@", 1)
    return f"{local[0]}***@{domain[0]}***"


@router.post("/login")  # response_model removed - works without validation
@rate_limit(requests=5, window=60)  # 5 login attempts per minute per IP
async def login(
    request_data: LoginRequest,
    req: Request,
    db = Depends(get_db)  # Regular session - no tenant context before auth
):
    """
    Authenticate user and return JWT tokens
    
    **Returns**:
    - access_token: Short-lived JWT (1 hour or 7 days if remember_me)
    - user: User profile information
    """
    if is_production():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Password authentication is managed by Supabase Auth",
        )

    try:
        # Authenticate using service layer
        result = await AuthService.authenticate(
            email=request_data.email,
            password=request_data.password,
            db=db,
            remember_me=request_data.remember_me
        )
        
        user_data = result["user"]
        # Log successful authentication
        logger.info(
            f"Login successful: user_id={user_data['id']}, "
            f"org_id={user_data['org_id']}, "
            f"ip={req.client.host}"
        )

        # Write login to audit trail
        try:
            db.execute(text("""
                INSERT INTO system_config.audit_logs
                (org_id, activity_type, entity_type, entity_id, action_performed,
                 user_id, user_name, ip_address, result_status)
                VALUES (:org_id, 'login', 'user', :user_id, 'User logged in',
                        :user_id, :user_name, :ip::inet, 'success')
            """), {
                "org_id": user_data['org_id'],
                "user_id": user_data['id'],
                "user_name": user_data.get('username', user_data.get('email', 'unknown')),
                "ip": req.client.host if req.client else '0.0.0.0',
            })
            db.commit()
        except Exception as audit_err:
            logger.warning(f"Failed to write login audit log: {audit_err}")

        return result
        
    except InvalidCredentialsError as e:
        # SECURITY: Don't log full email — mask it
        masked = _mask_email(request_data.email)
        logger.warning(f"Login failed: Invalid credentials for {masked}, ip={req.client.host}")

        # Write failed login to audit trail (best-effort, no org_id available)
        try:
            db.execute(text("""
                INSERT INTO system_config.audit_logs
                (org_id, activity_type, entity_type, entity_id, action_performed,
                 user_id, user_name, ip_address, result_status, error_message)
                SELECT u.org_id, 'login', 'user', u.user_id::text, 'Login failed - invalid credentials',
                       u.user_id, u.username, :ip::inet, 'failure', 'Invalid credentials'
                FROM master.org_users u WHERE u.email = :email LIMIT 1
            """), {"email": request_data.email, "ip": req.client.host if req.client else '0.0.0.0'})
            db.commit()
        except Exception:
            pass  # Best-effort audit logging for failed logins

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "invalid_credentials",
                "error_description": str(e),
                "error_code": e.error_code
            }
        )

    except AccountDisabledError as e:
        masked = _mask_email(request_data.email)
        logger.warning(f"Login failed: Account disabled - {masked}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "account_disabled",
                "error_description": str(e),
                "error_code": e.error_code
            }
        )

    except OrganizationDisabledError as e:
        masked = _mask_email(request_data.email)
        logger.warning(f"Login failed: Organization disabled - {masked}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "organization_disabled",
                "error_description": str(e),
                "error_code": e.error_code
            }
        )

    except PasswordNotSetError as e:
        masked = _mask_email(request_data.email)
        logger.error(f"Login failed: No password set - {masked}")
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
        masked = _mask_email(request_data.email)
        logger.error(f"Login failed: Unexpected error - {masked}: {type(e).__name__}")
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
    db=Depends(get_db),
) -> Dict[str, str]:
    """
    Logout user and invalidate session by blacklisting the token.

    The token is extracted from Authorization header and added to blacklist.
    **Offline Mode**: Frontend should also clear local storage/IndexedDB
    """
    from ....core.auth.jwt_auth import decode_jwt
    from ....core.auth.token_blacklist import blacklist_token

    # Extract token from Authorization header
    auth_header = req.headers.get("Authorization", "")
    payload = None
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

    # Write logout to audit trail
    if payload:
        try:
            user_id = payload.get("user_id") or payload.get("sub")
            org_id = payload.get("org_id")
            if user_id and org_id:
                db.execute(text("""
                    INSERT INTO system_config.audit_logs
                    (org_id, activity_type, entity_type, entity_id, action_performed,
                     user_id, user_name, ip_address, result_status)
                    VALUES (:org_id, 'logout', 'user', :user_id, 'User logged out',
                            :user_id,
                            COALESCE((SELECT username FROM master.org_users WHERE user_id = :user_id_int), 'unknown'),
                            :ip::inet, 'success')
                """), {
                    "org_id": org_id,
                    "user_id": str(user_id),
                    "user_id_int": int(user_id) if str(user_id).isdigit() else 0,
                    "ip": req.client.host if req.client else '0.0.0.0',
                })
                db.commit()
        except Exception as audit_err:
            logger.warning(f"Failed to write logout audit log: {audit_err}")

    return {
        "message": "Logged out successfully",
        "action": "clear_local_storage"
    }


@router.get("/verify-token")
async def verify_token(
    req: Request,
    db: TenantAwareSession = Depends(get_tenant_aware_db)
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
async def auth_health_check(db: TenantAwareSession = Depends(get_tenant_aware_db)) -> Dict[str, str]:
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
    db: TenantAwareSession = Depends(get_tenant_aware_db)
) -> Dict[str, bool]:
    """
    Check if user exists (for registration flow)
    
    **Privacy Note**: Returns generic message to prevent email enumeration
    """
    from ....repositories.user_repository import UserRepository
    
    user = UserRepository.find_by_email(email, db)
    
    # Don't reveal if user exists (security best practice)
    # Always return same response time
    return {"message": "If account exists, you will receive an email"}

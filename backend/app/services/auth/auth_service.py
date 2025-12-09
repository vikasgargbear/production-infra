"""
Enterprise Authentication Service - Business Logic Layer
Handles authentication workflows with offline support
"""
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any
from datetime import timedelta
import logging
import hashlib

from ...core.jwt_auth import verify_password, create_access_token
from ...repositories.user_repository import UserRepository
from .exceptions import (
    InvalidCredentialsError, 
    AccountDisabledError,
    PasswordNotSetError,
    OrganizationDisabledError
)

logger = logging.getLogger(__name__)


class AuthService:
    """
    Core authentication service
    Supports both online and offline authentication
    """
    
    # Token expiry settings (optimized for India's connectivity)
    ACCESS_TOKEN_EXPIRY_SHORT = timedelta(hours=1)      # Standard: 1 hour
    ACCESS_TOKEN_EXPIRY_REMEMBER = timedelta(days=7)     # Remember me: 7 days
    REFRESH_TOKEN_EXPIRY = timedelta(days=30)            # Refresh: 30 days
    
    @staticmethod
    async def authenticate(
        email: str, 
        password: str, 
        db: Session,
        remember_me: bool = False
    ) -> Dict[str, Any]:
        """
        Authenticate user with email and password
        
        Args:
            email: User email (case-insensitive)
            password: Plain text password
            db: Database session
            remember_me: If True, issue longer-lived tokens
            
        Returns:
            Dict with access_token, refresh_token, and user info
            
        Raises:
            InvalidCredentialsError: Wrong email/password
            AccountDisabledError: User or org disabled
            PasswordNotSetError: User has no password configured
        """
        logger.info(f"Authentication attempt for email: {email}")
        
        # Step 1: Find user
        user_data = UserRepository.find_by_email(email, db)
        
        if not user_data:
            logger.warning(f"Authentication failed: User not found - {email}")
            # Don't reveal if email exists (security best practice)
            raise InvalidCredentialsError("Invalid email or password")
        

        
        # Step 2: Check account status
        if not user_data.get("is_active"):
            logger.warning(f"Authentication failed: User disabled - {email}")
            raise AccountDisabledError("Your account has been disabled")
        
        if not user_data.get("org_active"):
            logger.warning(f"Authentication failed: Organization disabled - {email}")
            raise OrganizationDisabledError("Your organization account is disabled")
        
        # Step 3: Check password exists
        password_hash = user_data.get("password_hash")
        if not password_hash:
            logger.error(f"Authentication failed: No password set for user {user_data['user_id']}")
            raise PasswordNotSetError(
                "Password not configured for this account. Contact administrator."
            )
        
        # Step 4: Verify password
        if not verify_password(password, password_hash):
            logger.warning(f"Authentication failed: Wrong password - {email}")
            # Record failed attempt for rate limiting
            # TODO: Increment failed_login_count in database
            raise InvalidCredentialsError("Invalid email or password")
        
        # Step 5: Prepare token data
        token_data = AuthService._prepare_token_data(user_data)
        
        # Step 6: Create tokens (longer expiry if remember_me)
        expiry = (AuthService.ACCESS_TOKEN_EXPIRY_REMEMBER 
                 if remember_me 
                 else AuthService.ACCESS_TOKEN_EXPIRY_SHORT)
        
        access_token = create_access_token(
            data=token_data,
            expires_delta=expiry
        )
        
        # Create refresh token (always 30 days)
        refresh_token_data = {
            "user_id": user_data["user_id"],
            "org_id": str(user_data["org_id"]),
            "type": "refresh"
        }
        refresh_token = create_access_token(
            data=refresh_token_data,
            expires_delta=AuthService.REFRESH_TOKEN_EXPIRY
        )
        
        # Step 7: Update last login (non-blocking)
        UserRepository.update_last_login(user_data["user_id"], db)
        
        # Step 8: Return response
        logger.info(f"Authentication successful for user {user_data['user_id']}")
        
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": int(expiry.total_seconds()),
            "user": {
                "id": user_data["user_id"],
                "email": user_data["email"],
                "full_name": user_data.get("full_name") or user_data["username"],
                "username": user_data["username"],
                "org_id": str(user_data["org_id"]),
                "org_name": user_data["org_name"],
                "role_id": user_data.get("role_id"),
                "branch_id": (user_data.get("branch_ids", [None])[0] 
                            if user_data.get("branch_ids") 
                            else user_data.get("default_branch_id")),
                "permissions": user_data.get("permissions", {})
            }
        }
    
    @staticmethod
    def _prepare_token_data(user_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Prepare data for JWT token payload.
        
        Uses data_access_level from roles table as single source of truth.
        No fallbacks - if data is missing, it should be fixed in the database.
        """
        # Branch IDs from user record
        branch_ids = user_data.get("branch_ids") or []
        
        # Map database data_access_level to BranchScope
        # Single source of truth: roles.data_access_level
        DATA_ACCESS_TO_SCOPE = {
            "organization": "all",     # CEO, Admin → all branches
            "region": "multi",         # Regional Manager → assigned branches
            "branch": "single",        # Store Manager → single branch
            "own": "single",           # Staff → their data only
        }
        
        data_access_level = user_data.get("data_access_level", "branch")
        branch_scope = DATA_ACCESS_TO_SCOPE.get(data_access_level, "single")
        
        # Admin flag overrides to ALL (from org_users.is_admin)
        if user_data.get("is_admin"):
            branch_scope = "all"
        
        return {
            "user_id": user_data["user_id"],
            "email": user_data["email"],
            "org_id": str(user_data["org_id"]),
            "role_id": user_data.get("role_id"),
            "branch_ids": [str(bid) for bid in branch_ids] if branch_ids else [],
            "branch_scope": branch_scope,
            "data_access_level": data_access_level,
            "is_admin": user_data.get("is_admin", False),
            "full_name": user_data.get("full_name")
        }
    
    @staticmethod
    def create_offline_auth_hash(email: str, password: str, user_data: Dict) -> str:
        """
        Create a hash for offline authentication
        Frontend can store this hash in IndexedDB for offline mode
        
        Returns: SHA256 hash of email+password+salt
        """
        # Create a deterministic hash for offline verification
        # user_data might have "id" or "user_id" depending on source
        user_id = user_data.get("user_id") or user_data.get("id")
        salt = str(user_id) + str(user_data["org_id"])
        combined = f"{email}:{password}:{salt}"
        return hashlib.sha256(combined.encode()).hexdigest()

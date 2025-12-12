"""
Enterprise-grade authentication schemas
Pydantic v2 models for request/response validation
"""
from pydantic import BaseModel, EmailStr, Field, field_validator, ConfigDict
from typing import Optional, List, Dict
from datetime import datetime
from enum import Enum
import re


# =============================================================================
# ENUMS
# =============================================================================

class UserRole(str, Enum):
    """User roles"""
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    MANAGER = "manager"
    STAFF = "staff"
    VIEWER = "viewer"
    CASHIER = "cashier"


class SessionStatus(str, Enum):
    """Session status"""
    ACTIVE = "active"
    EXPIRED = "expired"
    REVOKED = "revoked"


# =============================================================================
# LOGIN SCHEMAS
# =============================================================================

class LoginRequest(BaseModel):
    """Login request with validation"""
    
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=6, max_length=128, description="User password")
    remember_me: bool = Field(False, description="Extended session duration")

    @field_validator("email")
    @classmethod
    def email_lowercase(cls, v):
        """Normalize email to lowercase"""
        return v.lower().strip()

    model_config = ConfigDict(
        str_strip_whitespace=True,
        json_schema_extra={
            "example": {
                "email": "user@example.com",
                "password": "your_password_here",
                "remember_me": False
            }
        }
    )


class UserSummary(BaseModel):
    """User information summary"""
    
    id: int = Field(..., description="User ID")
    email: EmailStr
    full_name: Optional[str] = None
    username: str
    org_id: str = Field(..., description="Organization ID")
    org_name: str
    role_id: Optional[int] = None
    role_name: Optional[str] = None
    branch_id: Optional[int] = None
    branch_name: Optional[str] = None
    permissions: Dict = Field(default_factory=dict)
    is_active: bool = True

    model_config = ConfigDict(from_attributes=True)


class LoginResponse(BaseModel):
    """Successful login response"""
    
    access_token: str = Field(..., description="JWT access token")
    refresh_token: Optional[str] = Field(None, description="JWT refresh token")
    token_type: str = Field("bearer")
    expires_in: int = Field(..., description="Token expiry in seconds")
    user: UserSummary
    offline_auth_hash: Optional[str] = Field(None, description="Hash for offline auth")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "token_type": "bearer",
                "expires_in": 3600
            }
        }
    )


class RefreshTokenRequest(BaseModel):
    """Token refresh request"""
    
    refresh_token: str = Field(..., description="Valid refresh token")


class RefreshTokenResponse(BaseModel):
    """Token refresh response"""
    
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    expires_in: int


# =============================================================================
# PASSWORD SCHEMAS
# =============================================================================

class PasswordChangeRequest(BaseModel):
    """Password change request with validation"""
    
    current_password: str = Field(..., min_length=6)
    new_password: str = Field(..., min_length=12, max_length=128)
    confirm_password: str = Field(..., min_length=12, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v):
        """Validate password meets security requirements"""
        if len(v) < 12:
            raise ValueError("Password must be at least 12 characters")
        if not re.search(r'[A-Z]', v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r'[a-z]', v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r'[0-9]', v):
            raise ValueError("Password must contain at least one number")
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError("Password must contain at least one special character")
        return v

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, v, info):
        new_password = info.data.get("new_password")
        if new_password and v != new_password:
            raise ValueError("Passwords do not match")
        return v

    model_config = ConfigDict(str_strip_whitespace=True)


class PasswordResetRequest(BaseModel):
    """Password reset request"""
    
    email: EmailStr

    @field_validator("email")
    @classmethod
    def email_lowercase(cls, v):
        return v.lower().strip()


class PasswordResetConfirm(BaseModel):
    """Password reset confirmation"""
    
    token: str = Field(..., min_length=10)
    new_password: str = Field(..., min_length=12, max_length=128)
    confirm_password: str = Field(..., min_length=12, max_length=128)


# =============================================================================
# ERROR & SESSION SCHEMAS
# =============================================================================

class AuthError(BaseModel):
    """Structured error response"""
    
    error: str = Field(..., description="Error code")
    error_description: str = Field(..., description="Human-readable message")
    error_code: int = Field(..., description="Internal error code")
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "error": "invalid_credentials",
                "error_description": "The email or password is incorrect",
                "error_code": 1001
            }
        }
    )


class SessionInfo(BaseModel):
    """Active session information"""
    
    session_id: str
    user_id: int
    ip_address: str
    user_agent: str
    device_name: Optional[str] = None
    location: Optional[str] = None
    created_at: datetime
    last_active_at: datetime
    expires_at: datetime
    is_current: bool = False
    status: SessionStatus = SessionStatus.ACTIVE

    model_config = ConfigDict(from_attributes=True)


class SessionListResponse(BaseModel):
    """List of user sessions"""
    
    sessions: List[SessionInfo] = Field(default_factory=list)
    total: int = 0


# =============================================================================
# USER MANAGEMENT SCHEMAS
# =============================================================================

class UserCreate(BaseModel):
    """Schema for creating a user"""
    
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    full_name: Optional[str] = Field(None, max_length=100)
    password: str = Field(..., min_length=12, max_length=128)
    role_id: Optional[int] = None
    branch_id: Optional[int] = None
    is_active: bool = True

    @field_validator("email")
    @classmethod
    def email_lowercase(cls, v):
        return v.lower().strip()

    model_config = ConfigDict(str_strip_whitespace=True)


class UserUpdate(BaseModel):
    """Schema for updating a user"""
    
    full_name: Optional[str] = Field(None, max_length=100)
    role_id: Optional[int] = None
    branch_id: Optional[int] = None
    is_active: Optional[bool] = None
    permissions: Optional[Dict] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class UserResponse(BaseModel):
    """Schema for user response"""
    
    id: int
    email: EmailStr
    username: str
    full_name: Optional[str] = None
    org_id: str
    org_name: Optional[str] = None
    role_id: Optional[int] = None
    role_name: Optional[str] = None
    branch_id: Optional[int] = None
    branch_name: Optional[str] = None
    permissions: Dict = Field(default_factory=dict)
    is_active: bool = True
    last_login: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

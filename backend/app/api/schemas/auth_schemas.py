"""
Enterprise-Grade Authentication Schemas
Pydantic models for request/response validation
"""
from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, List, Dict
from datetime import datetime
from enum import Enum
import re


class LoginRequest(BaseModel):
    """Login request with validation"""
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=6, max_length=128, description="User password")
    remember_me: bool = Field(False, description="Extended session duration")
    
    @validator('email')
    def email_lowercase(cls, v):
        """Normalize email to lowercase"""
        return v.lower().strip()
    
    class Config:
        schema_extra = {
            "example": {
                "email": "user@example.com",
                "password": "your_password_here",
                "remember_me": False
            }
        }


class UserRole(str, Enum):
    """User roles enumeration"""
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    MANAGER = "manager"
    STAFF = "staff"
    VIEWER = "viewer"


class UserSummary(BaseModel):
    """User information summary"""
    id: int = Field(..., description="User ID")
    email: EmailStr = Field(..., description="Email address")
    full_name: Optional[str] = Field(None, description="Full name")
    username: str = Field(..., description="Username")
    org_id: str = Field(..., description="Organization ID")
    org_name: str = Field(..., description="Organization name")
    role_id: Optional[int] = Field(None, description="Role ID")
    branch_id: Optional[int] = Field(None, description="Default branch ID")
    permissions: Dict = Field(default_factory=dict, description="User permissions")
    
    class Config:
        schema_extra = {
            "example": {
                "id": 123,
                "email": "user@pharmacy.com",
                "full_name": "John Doe",
                "username": "john.doe",
                "org_id": "550e8400-e29b-41d4-a716-446655440000",
                "org_name": "ABC Pharmacy",
                "role_id": 2,
                "branch_id": 1,
                "permissions": {"invoice": ["read", "write"], "reports": ["read"]}
            }
        }


class LoginResponse(BaseModel):
    """Successful login response"""
    access_token: str = Field(..., description="JWT access token")
    refresh_token: Optional[str] = Field(None, description="JWT refresh token")
    token_type: str = Field("bearer", description="Token type")
    expires_in: int = Field(..., description="Token expiry in seconds")
    user: UserSummary = Field(..., description="User information")
    offline_auth_hash: Optional[str] = Field(None, description="Hash for offline authentication")
    
    class Config:
        schema_extra = {
            "example": {
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "token_type": "bearer",
                "expires_in": 3600,
                "user": {
                    "id": 123,
                    "email": "user@pharmacy.com",
                    "full_name": "John Doe",
                    "org_id": "550e8400-e29b-41d4-a716-446655440000",
                    "org_name": "ABC Pharmacy"
                }
            }
        }


class RefreshTokenRequest(BaseModel):
    """Token refresh request"""
    refresh_token: str = Field(..., description="Valid refresh token")


class PasswordChangeRequest(BaseModel):
    """Password change request with validation"""
    current_password: str = Field(..., min_length=6)
    new_password: str = Field(..., min_length=12, max_length=128)
    confirm_password: str = Field(..., min_length=12, max_length=128)
    
    @validator('new_password')
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
    
    @validator('confirm_password')
    def passwords_match(cls, v, values):
        if 'new_password' in values and v != values['new_password']:
            raise ValueError("Passwords do not match")
        return v


class AuthError(BaseModel):
    """Structured error response"""
    error: str = Field(..., description="Error code")
    error_description: str = Field(..., description="Human-readable error message")
    error_code: int = Field(..., description="Internal error code for tracking")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        schema_extra = {
            "example": {
                "error": "invalid_credentials",
                "error_description": "The email or password provided is incorrect",
                "error_code": 1001,
                "timestamp": "2025-11-30T10:30:00Z"
            }
        }


class SessionInfo(BaseModel):
    """Active session information"""
    session_id: str
    user_id: int
    ip_address: str
    user_agent: str
    created_at: datetime
    last_active_at: datetime
    expires_at: datetime
    is_current: bool = False

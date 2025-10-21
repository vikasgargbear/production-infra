"""
JWT Authentication utilities
"""
import os
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer

# Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-here")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 720  # 12 hours as requested

# Password hashing
# Configure bcrypt to avoid 72-byte initialization issues
# Use 10 rounds for faster authentication (still secure, but 4x faster than 12)
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__default_rounds=10,  # 10 rounds = ~0.7s, 12 rounds = ~2.9s
    bcrypt__ident="2b"
)

# OAuth2 scheme - auto_error=False makes it optional for backward compatibility
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash"""
    # Bcrypt has a 72 byte limit, truncate if needed
    if isinstance(plain_password, str):
        plain_password = plain_password.encode('utf-8')[:72].decode('utf-8', errors='ignore')
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Hash a password"""
    # Bcrypt has a 72 byte limit, truncate if needed
    if isinstance(password, str):
        password = password.encode('utf-8')[:72].decode('utf-8', errors='ignore')
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create a JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user_and_org(
    token: Optional[str] = Depends(oauth2_scheme),
    x_org_id: Optional[str] = Header(None, alias="X-Org-Id")
):
    """Get current user and organization from token or header (for backward compatibility)"""
    
    # If no token provided, check for X-Org-Id header (backward compatibility)
    if not token:
        if x_org_id:
            # Return minimal user context for header-based auth
            return {
                "user_id": None,
                "email": None,
                "username": None,
                "org_id": x_org_id,
                "branch_id": None,  # Will need to be looked up
                "role": None,
                "full_name": None,
                "org_name": None
            }
        else:
            # No authentication provided
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
                headers={"WWW-Authenticate": "Bearer"},
            )
    
    # Token provided - decode it
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        # Handle both old and new token formats
        user_id = payload.get("user_id") or payload.get("sub")
        email = payload.get("email") or payload.get("sub")
        org_id = payload.get("org_id")
        
        # branch_id might not exist in old tokens - default to None
        branch_id = payload.get("branch_id")
        
        role = payload.get("role")
        
        if not org_id:
            # Try to get from header as fallback
            org_id = x_org_id
            
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

def verify_user_org_access(user_id: str, org_id: str, db) -> bool:
    """Verify user has access to organization"""
    # Simple implementation - in production, check against database
    return True
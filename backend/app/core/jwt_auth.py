"""
JWT Authentication utilities
"""
import os
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

# Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-here")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 720  # 12 hours as requested

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Hash a password"""
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

async def get_current_user_and_org(token: str = Depends(oauth2_scheme)):
    """Get current user and organization from token"""
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
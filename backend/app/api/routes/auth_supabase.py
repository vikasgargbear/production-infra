"""
Supabase-based Authentication endpoints
Integrates with Supabase Auth for enterprise-grade authentication
"""
from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Dict, Any, Optional
from pydantic import BaseModel
import httpx
import os
import logging

from ...core.database import get_db
from ...core.supabase_auth import supabase_auth

logger = logging.getLogger(__name__)

router = APIRouter(tags=["authentication"])

class LoginRequest(BaseModel):
    email: str
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str

@router.post("/login")
async def login(
    request: LoginRequest,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Authenticate user via Supabase and return tokens
    """
    supabase_url = supabase_auth.supabase_url
    supabase_key = supabase_auth.supabase_anon_key or supabase_auth.supabase_service_key
    
    if not supabase_url or not supabase_key:
        # Fallback to local authentication if Supabase not configured
        logger.warning("Supabase not configured, using local authentication")
        
        # Check user in database with password
        from ...core.jwt_auth import verify_password, create_access_token
        from datetime import timedelta
        
        try:
            user = db.execute(text("""
                SELECT u.user_id, u.username, u.email, u.full_name,
                       u.org_id, u.is_active, u.password_hash,
                       u.role_id, u.branch_id,
                       o.org_name, o.is_active as org_active
                FROM master.org_users u
                JOIN master.organizations o ON u.org_id = o.org_id
                WHERE u.email = :email
            """), {"email": request.email}).fetchone()
        except Exception as e:
            logger.error(f"Database query failed during login: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error: {str(e)}"
            )
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )
        
        # Check password if password_hash exists
        if user.password_hash:
            if not verify_password(request.password, user.password_hash):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid credentials"
                )
        else:
            # No password set - reject login
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Password not configured for this account"
            )
        
        if not user.is_active or not user.org_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is not active"
            )
        
        # Use user's branch_id or get default branch
        branch_id = user.branch_id
        if not branch_id:
            branch_result = db.execute(text("""
                SELECT b.branch_id 
                FROM master.org_branches b
                WHERE b.org_id = :org_id 
                AND b.is_active = true
                ORDER BY b.branch_id
                LIMIT 1
            """), {"org_id": str(user.org_id)}).fetchone()
            branch_id = branch_result.branch_id if branch_result else None
        
        # Get permissions from roles table if role_id exists
        permissions = {}
        if user.role_id:
            try:
                role_result = db.execute(text("""
                    SELECT permissions FROM master.roles WHERE role_id = :role_id
                """), {"role_id": user.role_id}).fetchone()
                if role_result and role_result.permissions:
                    permissions = role_result.permissions
            except Exception:
                # If roles table doesn't exist or query fails, continue without permissions
                pass
        
        # Create proper JWT token
        access_token_expires = timedelta(minutes=1440)  # 24 hours
        access_token = create_access_token(
            data={
                "user_id": user.user_id,
                "email": user.email,
                "org_id": str(user.org_id),
                "role_id": user.role_id,
                "branch_id": branch_id,
                "permissions": permissions
            },
            expires_delta=access_token_expires
        )
        
        # Update last login
        try:
            db.execute(text("""
                UPDATE master.org_users 
                SET last_login = CURRENT_TIMESTAMP,
                    login_count = COALESCE(login_count, 0) + 1
                WHERE user_id = :user_id
            """), {"user_id": user.user_id})
            db.commit()
        except Exception:
            # If update fails, continue without updating login time
            pass
        
        # Return proper token response
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user.user_id,
                "email": user.email,
                "name": user.full_name or user.username,
                "org_id": str(user.org_id),
                "org_name": user.org_name,
                "role_id": user.role_id,
                "branch_id": branch_id,
                "permissions": permissions
            }
        }
    
    # Authenticate with Supabase
    try:
        url = f"{supabase_url}/auth/v1/token?grant_type=password"
        headers = {
            "apikey": supabase_key,
            "Content-Type": "application/json"
        }
        payload = {
            "email": request.email,
            "password": request.password
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers)
            
            if response.status_code != 200:
                logger.error(f"Supabase auth failed: {response.text}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid credentials"
                )
            
            auth_data = response.json()
            
            # Get user details from our database using email
            supabase_user_id = auth_data.get("user", {}).get("id")
            
            user = db.execute(text("""
                SELECT u.user_id, u.username, u.email, u.full_name,
                       u.org_id, u.is_active,
                       o.org_name, o.is_active as org_active
                FROM master.org_users u
                JOIN master.organizations o ON u.org_id = o.org_id
                WHERE u.email = :email
            """), {
                "email": request.email
            }).fetchone()
            
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="User not found in organization"
                )
            
            if not user.is_active or not user.org_active:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Account is not active"
                )
            
            # Update last login
            db.execute(text("""
                UPDATE master.org_users 
                SET last_login = CURRENT_TIMESTAMP,
                    login_count = COALESCE(login_count, 0) + 1
                WHERE user_id = :user_id
            """), {"user_id": user.user_id})
            db.commit()
            
            # Return Supabase tokens with our user info
            return {
                "access_token": auth_data.get("access_token"),
                "refresh_token": auth_data.get("refresh_token"),
                "token_type": "bearer",
                "expires_in": auth_data.get("expires_in"),
                "user": {
                    "id": user.user_id,
                    "email": user.email,
                    "name": user.full_name or user.username,
                    "org_id": str(user.org_id),
                    "org_name": user.org_name
                }
            }
            
    except httpx.RequestError as e:
        logger.error(f"Network error authenticating with Supabase: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable"
        )

@router.post("/refresh")
async def refresh_token(
    request: RefreshRequest,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Refresh access token using refresh token
    """
    supabase_url = supabase_auth.supabase_url
    supabase_key = supabase_auth.supabase_anon_key or supabase_auth.supabase_service_key
    
    if not supabase_url or not supabase_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service not configured"
        )
    
    try:
        url = f"{supabase_url}/auth/v1/token?grant_type=refresh_token"
        headers = {
            "apikey": supabase_key,
            "Content-Type": "application/json"
        }
        payload = {
            "refresh_token": request.refresh_token
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers)
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid refresh token"
                )
            
            return response.json()
            
    except httpx.RequestError as e:
        logger.error(f"Network error refreshing token: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable"
        )

@router.get("/profile")
async def get_profile(
    authorization: str = Header(None),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get current user profile from token
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header"
        )
    
    token = authorization.replace("Bearer ", "")
    
    # For local tokens
    if token.startswith("local_token_"):
        user_id = int(token.replace("local_token_", ""))
        user = db.execute(text("""
            SELECT u.user_id, u.username, u.email, u.full_name,
                   u.org_id, u.is_active,
                   o.org_name
            FROM master.org_users u
            JOIN master.organizations o ON u.org_id = o.org_id
            WHERE u.user_id = :user_id
        """), {"user_id": user_id}).fetchone()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        return {
            "id": user.user_id,
            "email": user.email,
            "name": user.full_name or user.username,
            "org_id": str(user.org_id),
            "org_name": user.org_name
        }
    
    # For Supabase tokens, validate with Supabase
    supabase_url = supabase_auth.supabase_url
    supabase_key = supabase_auth.supabase_anon_key or supabase_auth.supabase_service_key
    
    if not supabase_url or not supabase_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service not configured"
        )
    
    try:
        url = f"{supabase_url}/auth/v1/user"
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {token}"
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers)
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token"
                )
            
            supabase_user = response.json()
            
            # Get our user data
            user = db.execute(text("""
                SELECT u.user_id, u.username, u.email, u.full_name,
                       u.org_id, u.is_active,
                       o.org_name
                FROM master.org_users u
                JOIN master.organizations o ON u.org_id = o.org_id
                WHERE u.email = :email
            """), {
                "email": supabase_user.get("email")
            }).fetchone()
            
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="User not found in organization"
                )
            
            return {
                "id": user.user_id,
                "email": user.email,
                "name": user.full_name or user.username,
                "org_id": str(user.org_id),
                "org_name": user.org_name
            }
            
    except httpx.RequestError as e:
        logger.error(f"Network error validating token: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable"
        )

@router.post("/logout")
async def logout():
    """
    Logout (client should remove tokens)
    """
    return {"message": "Logged out successfully"}
"""
OAuth Authentication (Google, etc.)
Integrates with Supabase OAuth for social login
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy import text
from typing import Dict, Any, Optional
from pydantic import BaseModel, EmailStr
import httpx
import os
import logging
from datetime import timedelta

from ....core.tenant_service import get_tenant_aware_db, TenantAwareSession
from ....core.database import get_db
from sqlalchemy.orm import Session
from ....core.jwt_auth import create_access_token
from ....core.supabase_auth import supabase_auth
from ....repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth/oauth", tags=["OAuth Authentication"])


class OAuthCallbackRequest(BaseModel):
    """OAuth callback data from frontend"""
    provider: str  # "google", "github", etc.
    access_token: str
    refresh_token: Optional[str] = None
    user_email: EmailStr
    user_name: Optional[str] = None
    user_id: Optional[str] = None  # Provider's user ID


class GoogleLoginRequest(BaseModel):
    """Google OAuth ID token"""
    id_token: str


@router.get("/google/url")
async def get_google_oauth_url(
    redirect_uri: Optional[str] = None
) -> Dict[str, str]:
    """
    Get Google OAuth authorization URL
    
    **Usage**:
    1. Frontend calls this endpoint
    2. Redirect user to returned URL
    3. User authorizes on Google
    4. Google redirects to your callback URL with code
    5. Frontend sends code to /oauth/google/callback
    """
    supabase_url = supabase_auth.supabase_url
    
    if not supabase_url:
        raise HTTPException(
            status_code=500,
            detail="OAuth not configured. Set SUPABASE_URL environment variable."
        )
    
    # Default redirect URI (should match Supabase dashboard settings)
    if not redirect_uri:
        redirect_uri = os.getenv("OAUTH_REDIRECT_URI", "http://localhost:3000/auth/callback")
    
    # Supabase OAuth URL for Google
    oauth_url = (
        f"{supabase_url}/auth/v1/authorize"
        f"?provider=google"
        f"&redirect_to={redirect_uri}"
    )
    
    return {
        "url": oauth_url,
        "provider": "google",
        "redirect_uri": redirect_uri
    }


@router.post("/google/callback")
async def google_oauth_callback(
    request: OAuthCallbackRequest,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Handle Google OAuth callback
    
    **Flow**:
    1. User authenticates with Google
    2. Frontend receives Google user data
    3. Frontend sends to this endpoint
    4. We find/create user in database
    5. Return JWT tokens
    """
    try:
        # Verify user exists in our database
        user_data = UserRepository.find_by_email(request.user_email, db)
        
        if not user_data:
            # User doesn't exist - create them
            logger.info(f"Creating new user from Google OAuth: {request.user_email}")
            
            # For new OAuth users, we need to create organization first
            # This is a simplified version - you may want more logic here
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "user_not_found",
                    "message": "Account not found. Please contact administrator to create your account.",
                    "email": request.user_email
                }
            )
        
        # Check account status
        if not user_data.get("is_active"):
            raise HTTPException(
                status_code=403,
                detail="Account is disabled"
            )
        
        if not user_data.get("org_active"):
            raise HTTPException(
                status_code=403,
                detail="Organization account is disabled"
            )
        
        # Update last login
        UserRepository.update_last_login(user_data["user_id"], db)
        
        # Create JWT tokens
        token_data = {
            "user_id": user_data["user_id"],
            "email": user_data["email"],
            "org_id": str(user_data["org_id"]),
            "role_id": user_data.get("role_id"),
            "branch_id": (user_data.get("branch_ids", [None])[0] 
                        if user_data.get("branch_ids") 
                        else user_data.get("default_branch_id")),
            "permissions": user_data.get("permissions", {}),
            "auth_provider": "google"
        }
        
        access_token = create_access_token(
            data=token_data,
            expires_delta=timedelta(hours=1)
        )
        
        refresh_token = create_access_token(
            data={"user_id": user_data["user_id"], "org_id": str(user_data["org_id"]), "type": "refresh"},
            expires_delta=timedelta(days=30)
        )
        
        logger.info(f"Google OAuth login successful: {request.user_email}")
        
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": 3600,
            "user": {
                "id": user_data["user_id"],
                "email": user_data["email"],
                "full_name": user_data.get("full_name") or user_data["username"],
                "username": user_data["username"],
                "org_id": str(user_data["org_id"]),
                "org_name": user_data["org_name"],
                "role_id": user_data.get("role_id"),
                "branch_id": token_data["branch_id"],
                "permissions": user_data.get("permissions", {}),
                "auth_provider": "google"
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Google OAuth callback error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"OAuth authentication failed: {str(e)}"
        )


@router.post("/supabase/callback")
async def supabase_oauth_callback(
    code: str,
    db: TenantAwareSession = Depends(get_tenant_aware_db)
) -> Dict[str, Any]:
    """
    Handle Supabase OAuth callback (alternative method)
    
    **Usage**: If you want Supabase to handle the OAuth flow completely
    """
    supabase_url = supabase_auth.supabase_url
    supabase_key = supabase_auth.supabase_anon_key
    
    if not supabase_url or not supabase_key:
        raise HTTPException(
            status_code=500,
            detail="Supabase not configured"
        )
    
    try:
        # Exchange code for session
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{supabase_url}/auth/v1/token",
                params={"grant_type": "authorization_code"},
                json={"code": code},
                headers={
                    "apikey": supabase_key,
                    "Content-Type": "application/json"
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail="Failed to exchange OAuth code"
                )
            
            data = response.json()
            user_email = data.get("user", {}).get("email")
            
            if not user_email:
                raise HTTPException(
                    status_code=400,
                    detail="No email in OAuth response"
                )
            
            # Find user in database
            user_data = UserRepository.find_by_email(user_email, db)
            
            if not user_data:
                raise HTTPException(
                    status_code=403,
                    detail="User not found in database"
                )
            
            # Update last login
            UserRepository.update_last_login(user_data["user_id"], db)
            
            # Return tokens
            return {
                "access_token": data.get("access_token"),
                "refresh_token": data.get("refresh_token"),
                "token_type": "bearer",
                "user": {
                    "id": user_data["user_id"],
                    "email": user_data["email"],
                    "org_id": str(user_data["org_id"]),
                    "org_name": user_data["org_name"]
                }
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Supabase OAuth callback error: {e}")
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


@router.get("/providers")
async def list_oauth_providers() -> Dict[str, Any]:
    """
    List available OAuth providers
    """
    supabase_configured = bool(supabase_auth.supabase_url)
    
    providers = []
    
    if supabase_configured:
        providers.extend([
            {
                "name": "google",
                "display_name": "Google",
                "enabled": True,
                "icon": "google"
            },
            {
                "name": "github",
                "display_name": "GitHub",
                "enabled": False,  # Enable in Supabase dashboard if needed
                "icon": "github"
            }
        ])
    
    return {
        "providers": providers,
        "supabase_configured": supabase_configured,
        "message": "Configure OAuth providers in Supabase dashboard"
    }


@router.get("/status")
async def oauth_status() -> Dict[str, Any]:
    """Check OAuth configuration status"""
    supabase_url = supabase_auth.supabase_url
    
    return {
        "enabled": bool(supabase_url),
        "supabase_url": supabase_url if supabase_url else None,
        "providers_configured": ["google"] if supabase_url else [],
        "setup_required": not bool(supabase_url),
        "setup_instructions": "Set SUPABASE_URL environment variable in Railway"
    }

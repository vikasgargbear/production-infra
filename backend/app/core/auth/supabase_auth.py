"""
Supabase Auth Integration
Handles user authentication through Supabase Auth service
"""
import os
import httpx
from typing import Optional, Dict, Any
from fastapi import HTTPException
import logging

logger = logging.getLogger(__name__)

class SupabaseAuthService:
    """Service for managing Supabase authentication"""
    
    def __init__(self):
        # Get Supabase configuration from environment
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_anon_key = os.getenv("SUPABASE_ANON_KEY")
        self.supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        # If SUPABASE_URL not set, try to derive from DATABASE_URL
        if not self.supabase_url:
            database_url = os.getenv("DATABASE_URL")
            if database_url and "supabase.co" in database_url:
                # Extract project ref from DATABASE_URL
                # Format: postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
                import re
                match = re.search(r'@db\.([^.]+)\.supabase\.co', database_url)
                if match:
                    project_ref = match.group(1)
                    self.supabase_url = f"https://{project_ref}.supabase.co"
                    logger.info(f"Derived Supabase URL from DATABASE_URL: {self.supabase_url}")
        
        # SECURITY: Do NOT fallback to JWT_SECRET_KEY — it's a different key type
        # If SUPABASE_SERVICE_ROLE_KEY is not set, Supabase admin features are disabled
        
        if not all([self.supabase_url, self.supabase_service_key]):
            logger.warning("Supabase configuration not complete. Auth features may be limited.")
    
    async def create_auth_user(self, email: str, password: str, user_metadata: Dict[str, Any] = None) -> Optional[str]:
        """
        Create a user in Supabase Auth
        Returns the auth user ID if successful
        """
        if not self.supabase_url or not self.supabase_service_key:
            raise HTTPException(
                status_code=500,
                detail="Supabase authentication is not configured"
            )
        
        url = f"{self.supabase_url}/auth/v1/admin/users"
        headers = {
            "apikey": self.supabase_service_key,
            "Authorization": f"Bearer {self.supabase_service_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "email": email,
            "password": password,
            "email_confirm": True,  # Auto-confirm email for initial setup
            "user_metadata": user_metadata or {}
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, headers=headers)
                
                if response.status_code == 200 or response.status_code == 201:
                    data = response.json()
                    return data.get("id")
                else:
                    logger.error(f"Failed to create Supabase user: {response.text}")
                    raise HTTPException(
                        status_code=response.status_code,
                        detail=f"Failed to create user in authentication service: {response.text}"
                    )
        except httpx.RequestError as e:
            logger.error(f"Request error creating Supabase user: {e}")
            raise HTTPException(
                status_code=500,
                detail="Failed to connect to authentication service"
            )
    
    async def update_user_metadata(self, auth_user_id: str, metadata: Dict[str, Any]) -> bool:
        """Update user metadata in Supabase Auth"""
        if not self.supabase_url or not self.supabase_service_key:
            return False
        
        url = f"{self.supabase_url}/auth/v1/admin/users/{auth_user_id}"
        headers = {
            "apikey": self.supabase_service_key,
            "Authorization": f"Bearer {self.supabase_service_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "user_metadata": metadata
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.put(url, json=payload, headers=headers)
                return response.status_code == 200
        except Exception as e:
            logger.error(f"Error updating user metadata: {e}")
            return False
    
    async def delete_auth_user(self, auth_user_id: str) -> bool:
        """Delete a user from Supabase Auth"""
        if not self.supabase_url or not self.supabase_service_key:
            return False
        
        url = f"{self.supabase_url}/auth/v1/admin/users/{auth_user_id}"
        headers = {
            "apikey": self.supabase_service_key,
            "Authorization": f"Bearer {self.supabase_service_key}",
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.delete(url, headers=headers)
                return response.status_code == 200
        except Exception as e:
            logger.error(f"Error deleting auth user: {e}")
            return False

# Singleton instance
supabase_auth = SupabaseAuthService()
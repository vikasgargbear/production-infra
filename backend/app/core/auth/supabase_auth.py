"""
Supabase Auth Integration
Handles user authentication through Supabase Auth service
"""
import os
import base64
import binascii
import json
import httpx
from typing import Dict, Any
from fastapi import HTTPException
import logging

logger = logging.getLogger(__name__)

class SupabaseAuthService:
    """Service for managing Supabase authentication"""
    
    def __init__(self):
        # Get Supabase configuration from environment
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_anon_key = os.getenv("SUPABASE_ANON_KEY")
        
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
        
        # SECURITY: Do NOT fall back to JWT_SECRET_KEY; it is a different key type.
        if not all([self.supabase_url, self.supabase_anon_key]):
            logger.warning("Supabase user authentication is not configured.")

    async def get_user_from_access_token(self, access_token: str) -> Dict[str, Any]:
        """Resolve a first-party Supabase session, never delegated OAuth authority."""
        if not self.supabase_url or not self.supabase_anon_key:
            raise HTTPException(
                status_code=503,
                detail="Supabase authentication is not configured",
            )

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.supabase_url}/auth/v1/user",
                    headers={
                        "apikey": self.supabase_anon_key,
                        "Authorization": f"Bearer {access_token}",
                    },
                )
        except httpx.RequestError as exc:
            logger.error("Supabase user verification request failed: %s", exc)
            raise HTTPException(
                status_code=503,
                detail="Authentication service is unavailable",
            ) from exc

        if response.status_code != 200:
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired Supabase session",
                headers={"WWW-Authenticate": "Bearer"},
            )

        try:
            user = response.json()
        except ValueError as exc:
            raise HTTPException(status_code=401, detail="Invalid Supabase identity") from exc
        if not isinstance(user, dict) or not user.get("id") or not user.get("email"):
            raise HTTPException(status_code=401, detail="Supabase identity is incomplete")
        # /user above verifies this exact bearer with the configured provider.
        # Decoding below only RESTRICTS that verified identity; it is not local
        # unsigned authentication. Delegated OAuth tokens must not become ERP
        # sessions or approve their own organization connection.
        try:
            parts = access_token.split(".")
            if len(parts) != 3 or not all(parts):
                raise ValueError("Not a compact JWT")

            def unique_object(pairs):
                result = {}
                for key, value in pairs:
                    if key in result:
                        raise ValueError("Duplicate claim")
                    result[key] = value
                return result

            claims = json.loads(base64.b64decode(
                parts[1] + "=" * (-len(parts[1]) % 4), altchars=b"-_", validate=True,
            ), object_pairs_hook=unique_object)
            if (not isinstance(claims, dict)
                    or claims.get("sub") != user["id"]
                    or claims.get("iss") != self.supabase_url.rstrip("/") + "/auth/v1"
                    or claims.get("role") != "authenticated"
                    or claims.get("client_id") is not None):
                raise ValueError("Not a first-party session")
        except (ValueError, TypeError, UnicodeError, binascii.Error) as exc:
            raise HTTPException(
                status_code=401,
                detail="A first-party ERP sign-in session is required",
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc
        return user

# Singleton instance
supabase_auth = SupabaseAuthService()

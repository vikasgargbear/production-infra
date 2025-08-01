"""
Application dependencies
"""
from typing import Optional
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from .core.database import get_db
from .core.jwt_auth import oauth2_scheme, jwt, SECRET_KEY, ALGORITHM

async def get_current_org(token: str = Depends(oauth2_scheme)) -> str:
    """Get current organization ID from token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        org_id = payload.get("org_id")
        if not org_id:
            # Return default org ID for testing
            return "12de5e22-eee7-4d25-b3a7-d16d01c6170f"
        return org_id
    except:
        # Return default org ID for testing
        return "12de5e22-eee7-4d25-b3a7-d16d01c6170f"
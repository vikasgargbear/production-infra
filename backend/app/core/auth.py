"""
Authentication utilities
"""
from fastapi import Depends, HTTPException, status
from .jwt_auth import oauth2_scheme, jwt, SECRET_KEY, ALGORITHM

from .config import DEFAULT_ORG_ID
async def get_current_org(token: str = Depends(oauth2_scheme)) -> str:
    """Get current organization ID from token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        org_id = payload.get("org_id")
        if not org_id:
            # Return default org ID for testing
            return DEFAULT_ORG_ID
        return org_id
    except:
        # Return default org ID for testing
        return DEFAULT_ORG_ID
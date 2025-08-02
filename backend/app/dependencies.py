"""
Application dependencies
"""
from typing import Optional
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from .core.database import get_db
from .core.jwt_auth import oauth2_scheme, jwt, SECRET_KEY, ALGORITHM

from .core.config import DEFAULT_ORG_ID

async def get_current_org(token: Optional[str] = Depends(oauth2_scheme)) -> dict:
    """Get current organization context from token"""
    try:
        if token:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            org_id = payload.get("org_id", DEFAULT_ORG_ID)
        else:
            org_id = DEFAULT_ORG_ID
        
        # Return as dict to match stock_receive.py usage
        return {"org_id": org_id}
    except:
        # Return default org context for testing
        return {"org_id": DEFAULT_ORG_ID}
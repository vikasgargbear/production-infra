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

def get_current_org_id() -> str:
    """Get current organization ID - returns default for now"""
    return DEFAULT_ORG_ID

def get_current_user_id(db: Session = Depends(get_db)) -> Optional[int]:
    """
    Get current user ID - returns None or creates system user if needed
    This avoids hardcoding user_id=1 which may not exist
    """
    try:
        # First, try to get a system user
        from sqlalchemy import text
        result = db.execute(
            text("""
                SELECT user_id FROM master.org_users 
                WHERE org_id = :org_id 
                AND (username = 'system' OR username = 'api' OR is_active = true)
                ORDER BY 
                    CASE WHEN username = 'system' THEN 0 
                         WHEN username = 'api' THEN 1 
                         ELSE 2 END,
                    user_id
                LIMIT 1
            """),
            {"org_id": DEFAULT_ORG_ID}
        ).first()
        
        if result:
            return result.user_id
        
        # If no user exists, try to create a system user
        create_result = db.execute(
            text("""
                INSERT INTO master.org_users (
                    org_id, employee_code, username, email, 
                    password_hash, first_name, last_name, roles, is_active
                ) VALUES (
                    :org_id, 'SYSTEM', 'system', 'system@api.local',
                    'no-login', 'System', 'API', ARRAY['api_user'], true
                ) ON CONFLICT (org_id, username) DO UPDATE 
                SET is_active = true
                RETURNING user_id
            """),
            {"org_id": DEFAULT_ORG_ID}
        )
        db.commit()
        
        if create_result:
            return create_result.first().user_id
            
    except Exception as e:
        # Log the error but don't fail - return None
        print(f"Warning: Could not get/create user: {e}")
        pass
    
    return None  # Let the calling code handle nullable user_id
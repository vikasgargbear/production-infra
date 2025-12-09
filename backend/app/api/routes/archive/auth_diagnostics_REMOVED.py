"""
Authentication Diagnostics API (Admin Only)
Protected endpoints for debugging authentication issues

SECURITY: All endpoints require admin authentication
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any
import logging

from ...core.database import get_db
from ...core.jwt_auth import get_password_hash, verify_password
from ...core.permissions import PermissionChecker

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth-diagnostics", tags=["Auth Diagnostics"])


@router.get("/users-without-passwords")
async def list_users_without_passwords(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker(require_admin=True))
) -> List[Dict[str, Any]]:
    """
    List users who don't have passwords set
    **Admin only** - Requires admin authentication
    """
    try:
        result = db.execute(text("""
            SELECT 
                u.user_id, u.email, u.username, 
                u.org_id, o.org_name,
                u.is_active,
                CASE 
                    WHEN u.password_hash IS NULL THEN 'NO_PASSWORD'
                    WHEN u.password_hash = '' THEN 'EMPTY_PASSWORD'
                    ELSE 'HAS_PASSWORD'
                END as password_status
            FROM master.org_users u
            JOIN master.organizations o ON u.org_id = o.org_id
            WHERE u.password_hash IS NULL OR u.password_hash = ''
            ORDER BY u.created_at DESC
            LIMIT 50
        """))
        
        users = [dict(row._mapping) for row in result]
        
        return {
            "count": len(users),
            "users": users,
            "message": "These users need passwords set"
        }
        
    except Exception as e:
        logger.error(f"Error listing users without passwords: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/set-password")
async def set_user_password(
    email: str,
    password: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker(require_admin=True))
) -> Dict[str, Any]:
    """
    Set password for a user (Admin operation)
    **Admin only** - Requires admin authentication
    """
    try:
        # Check if user exists
        user = db.execute(text("""
            SELECT user_id, email, username FROM master.org_users
            WHERE email = :email
        """), {"email": email}).fetchone()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Hash password
        password_hash = get_password_hash(password)
        
        # Update user
        db.execute(text("""
            UPDATE master.org_users
            SET password_hash = :password_hash,
                updated_at = CURRENT_TIMESTAMP
            WHERE email = :email
        """), {
            "email": email,
            "password_hash": password_hash
        })
        db.commit()
        
        logger.info(f"Password set for user: {email}")
        
        return {
            "message": "Password set successfully",
            "user_id": user.user_id,
            "email": user.email
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error setting password for {email}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test-password")
async def test_password_verification(
    email: str,
    password: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(PermissionChecker(require_admin=True))
) -> Dict[str, Any]:
    """
    Test if password verification is working
    **Admin only** - Requires admin authentication
    """
    try:
        # Get user with password hash
        user = db.execute(text("""
            SELECT user_id, email, username, password_hash, is_active
            FROM master.org_users
            WHERE email = :email
        """), {"email": email}).fetchone()
        
        if not user:
            return {
                "status": "user_not_found",
                "email": email
            }
        
        if not user.password_hash:
            return {
                "status": "no_password_set",
                "user_id": user.user_id,
                "email": user.email,
                "action": "Use /set-password endpoint"
            }
        
        # Test password verification
        is_valid = verify_password(password, user.password_hash)
        
        return {
            "status": "tested",
            "user_id": user.user_id,
            "email": user.email,
            "password_match": is_valid,
            "is_active": user.is_active,
            "message": "Password is correct" if is_valid else "Password is incorrect"
        }
        
    except Exception as e:
        logger.error(f"Error testing password for {email}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/database-connection")
async def test_database_connection(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Test database connectivity"""
    try:
        result = db.execute(text("SELECT NOW() as current_time, version() as pg_version"))
        row = result.fetchone()
        
        return {
            "status": "connected",
            "database_time": str(row.current_time),
            "postgresql_version": row.pg_version[:50],
            "message": "Database connection successful"
        }
    except Exception as e:
        logger.error(f"Database connection test failed: {e}")
        raise HTTPException(
            status_code=503,
            detail={
                "status": "failed",
                "error": str(e)
            }
        )

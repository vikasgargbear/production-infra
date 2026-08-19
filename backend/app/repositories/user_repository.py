"""
Enterprise User Repository - Data Access Layer
Handles all database operations for users
"""
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, Dict, Any
from uuid import UUID
import logging

logger = logging.getLogger(__name__)


class UserRepository:
    """
    Repository pattern for user data access
    Separates data access from business logic
    """
    
    @staticmethod
    def find_by_auth_user_id(auth_user_id: UUID, db: Session) -> Optional[Dict[str, Any]]:
        """Resolve an active ERP membership from a verified Supabase identity."""
        result = db.execute(text("""
            SELECT
                u.user_id, u.auth_user_id, u.username, u.email, u.full_name,
                u.org_id, u.is_active, u.role_id, u.branch_ids, u.is_admin,
                o.org_name, o.is_active AS org_active,
                r.role_name, r.permissions, r.data_access_level
            FROM master.org_users u
            JOIN master.organizations o ON o.org_id = u.org_id
            LEFT JOIN master.roles r
              ON r.role_id = u.role_id
             AND r.org_id = u.org_id
            WHERE u.auth_user_id = :auth_user_id
            LIMIT 2
        """), {"auth_user_id": str(auth_user_id)})
        rows = result.fetchall()
        if not rows:
            return None
        if len(rows) != 1:
            raise RuntimeError("Supabase identity maps to multiple ERP memberships")

        row = rows[0]
        return {
            "user_id": row[0],
            "auth_user_id": row[1],
            "username": row[2],
            "email": row[3],
            "full_name": row[4],
            "org_id": row[5],
            "is_active": row[6],
            "role_id": row[7],
            "branch_ids": row[8] or [],
            "is_admin": row[9],
            "org_name": row[10],
            "org_active": row[11],
            "role_name": row[12],
            "permissions": row[13] or {},
            "data_access_level": row[14] or "branch",
        }
    
    @staticmethod
    def update_last_login(user_id: int, db: Session) -> bool:
        """Update user's last login timestamp"""
        try:
            db.execute(text("""
                UPDATE master.org_users 
                SET last_login = CURRENT_TIMESTAMP,
                    login_count = COALESCE(login_count, 0) + 1
                WHERE user_id = :user_id
            """), {"user_id": user_id})
            db.commit()
            return True
        except Exception as e:
            logger.warning(f"Failed to update last login for user {user_id}: {e}")
            return False

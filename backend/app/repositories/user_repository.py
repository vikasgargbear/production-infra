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
    def find_by_email(email: str, db: Session) -> Optional[Dict[str, Any]]:
        """
        Find user by email with org and role info
        Returns None if not found
        """
        try:
            result = db.execute(text("""
                SELECT 
                    u.user_id, u.username, u.email, u.full_name,
                    u.org_id, u.is_active, u.password_hash,
                    u.role_id, u.branch_ids,
                    o.org_name, o.is_active as org_active,
                    b.branch_id as default_branch_id,
                    r.role_name, r.permissions
                FROM master.org_users u
                JOIN master.organizations o ON u.org_id = o.org_id
                LEFT JOIN master.org_branches b ON b.org_id = u.org_id 
                    AND b.is_active = true
                LEFT JOIN master.roles r ON r.role_id = u.role_id
                WHERE u.email = :email
                ORDER BY b.branch_id
                LIMIT 1
            """), {"email": email.lower().strip()})
            
            row = result.fetchone()
            if not row:
                return None
            
            # Convert row to dict using column names
            return {
                "user_id": row[0],
                "username": row[1],
                "email": row[2],
                "full_name": row[3],
                "org_id": row[4],
                "is_active": row[5],
                "password_hash": row[6],
                "role_id": row[7],
                "branch_ids": row[8],
                "org_name": row[9],
                "org_active": row[10],
                "default_branch_id": row[11],
                "role_name": row[12],
                "permissions": row[13]
            }
            
        except Exception as e:
            logger.error(f"Error finding user by email {email}: {e}")
            raise
    
    @staticmethod
    def find_by_id(user_id: int, db: Session) -> Optional[Dict[str, Any]]:
        """Find user by ID"""
        try:
            result = db.execute(text("""
                SELECT 
                    u.user_id, u.username, u.email, u.full_name,
                    u.org_id, u.is_active, u.password_hash,
                    u.role_id, u.branch_ids,
                    o.org_name, o.is_active as org_active
                FROM master.org_users u
                JOIN master.organizations o ON u.org_id = o.org_id
                WHERE u.user_id = :user_id
            """), {"user_id": user_id})
            
            row = result.fetchone()
            return dict(row._mapping) if row else None
            
        except Exception as e:
            logger.error(f"Error finding user by ID {user_id}: {e}")
            raise
    
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
    
    @staticmethod
    def check_password_exists(user_id: int, db: Session) -> bool:
        """Check if user has a password set"""
        try:
            result = db.execute(text("""
                SELECT 
                    CASE 
                        WHEN password_hash IS NOT NULL AND password_hash != '' 
                        THEN true 
                        ELSE false 
                    END as has_password
                FROM master.org_users
                WHERE user_id = :user_id
            """), {"user_id": user_id})
            
            row = result.fetchone()
            return row.has_password if row else False
            
        except Exception as e:
            logger.error(f"Error checking password for user {user_id}: {e}")
            return False
    
    @staticmethod
    def list_users_needing_passwords(db: Session, org_id: Optional[UUID] = None):
        """Find users without passwords (for migration/admin)"""
        try:
            query = """
                SELECT user_id, email, username, org_id
                FROM master.org_users
                WHERE password_hash IS NULL OR password_hash = ''
            """
            params = {}
            
            if org_id:
                query += " AND org_id = :org_id"
                params["org_id"] = str(org_id)
            
            query += " ORDER BY created_at DESC LIMIT 100"
            
            result = db.execute(text(query), params)
            return [dict(row._mapping) for row in result]
            
        except Exception as e:
            logger.error(f"Error listing users without passwords: {e}")
            return []

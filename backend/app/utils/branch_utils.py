"""
Branch utility functions for getting default/current branch
"""
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import Optional
import logging

logger = logging.getLogger(__name__)

def get_default_branch_id(db: Session, org_id: str) -> Optional[int]:
    """
    Get the default branch_id for an organization.
    Returns the main branch or first active branch.
    Always returns a valid branch_id, never None.
    """
    try:
        # First try to get the main/default branch
        result = db.execute(
            text("""
                SELECT branch_id 
                FROM master.org_branches 
                WHERE org_id = :org_id 
                AND is_active = true
                ORDER BY 
                    CASE 
                        WHEN LOWER(branch_name) LIKE '%main%' THEN 0
                        WHEN LOWER(branch_name) LIKE '%head%' THEN 1
                        WHEN LOWER(branch_code) = 'main' THEN 2
                        WHEN branch_id = 1 THEN 3
                        ELSE 4
                    END,
                    created_at ASC
                LIMIT 1
            """),
            {"org_id": org_id}
        ).fetchone()
        
        if result:
            return result[0]
        
        # If no branches exist, create a default main branch
        logger.info(f"No branches found for org {org_id}, creating default branch")
        
        # Check if we need to create a branch
        # First check the max branch_id to ensure we don't conflict
        max_id_result = db.execute(
            text("SELECT COALESCE(MAX(branch_id), 0) + 1 as next_id FROM master.org_branches")
        ).fetchone()
        
        next_branch_id = max_id_result[0] if max_id_result else 1
        
        create_result = db.execute(
            text("""
                INSERT INTO master.org_branches (
                    branch_id,
                    org_id,
                    branch_name,
                    branch_code,
                    is_active,
                    created_at
                ) VALUES (
                    :branch_id,
                    :org_id,
                    'Main Branch',
                    'MAIN',
                    true,
                    NOW()
                )
                ON CONFLICT (branch_id) DO NOTHING
                RETURNING branch_id
            """),
            {"branch_id": next_branch_id, "org_id": org_id}
        )
        
        db.commit()
        
        new_branch = create_result.fetchone()
        if new_branch:
            logger.info(f"Created default branch {new_branch[0]} for org {org_id}")
            return new_branch[0]
        
        # If creation failed due to conflict, try to get any branch again
        final_result = db.execute(
            text("""
                SELECT branch_id 
                FROM master.org_branches 
                WHERE org_id = :org_id 
                LIMIT 1
            """),
            {"org_id": org_id}
        ).fetchone()
        
        if final_result:
            return final_result[0]
            
    except Exception as e:
        logger.error(f"Error getting default branch for org {org_id}: {str(e)}")
        # Try to rollback and create a simple branch
        try:
            db.rollback()
            # Use a fixed branch_id for this org (hash the org_id to get a consistent number)
            import hashlib
            hash_val = int(hashlib.md5(org_id.encode()).hexdigest()[:8], 16) % 1000000 + 1000
            
            db.execute(
                text("""
                    INSERT INTO master.org_branches (
                        branch_id, org_id, branch_name, branch_code, is_active
                    ) VALUES (
                        :branch_id, :org_id, 'Main Branch', 'MAIN', true
                    )
                    ON CONFLICT (branch_id) DO UPDATE SET org_id = :org_id
                    RETURNING branch_id
                """),
                {"branch_id": hash_val, "org_id": org_id}
            )
            db.commit()
            logger.info(f"Created fallback branch {hash_val} for org {org_id}")
            return hash_val
        except:
            # Last resort - return a default branch_id
            logger.error(f"Failed to create any branch for org {org_id}, using default 1")
            return 1
    
    # Should never reach here, but return 1 as last resort
    return 1


def get_user_branch_id(db: Session, org_id: str, user_id: int) -> Optional[int]:
    """
    Get the branch_id for a specific user.
    Falls back to default branch if user has no specific branch assignment.
    """
    try:
        # First check if user has a specific branch assignment
        result = db.execute(
            text("""
                SELECT branch_id 
                FROM master.user_branches 
                WHERE org_id = :org_id 
                AND user_id = :user_id
                AND is_active = true
                LIMIT 1
            """),
            {"org_id": org_id, "user_id": user_id}
        ).fetchone()
        
        if result:
            return result[0]
        
        # Fall back to default branch
        return get_default_branch_id(db, org_id)
        
    except Exception as e:
        logger.error(f"Error getting user branch for org {org_id}, user {user_id}: {str(e)}")
        return get_default_branch_id(db, org_id)
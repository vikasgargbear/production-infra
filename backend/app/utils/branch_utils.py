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
    """
    try:
        # First try to get the main/default branch
        result = db.execute(
            text("""
                SELECT branch_id 
                FROM public.org_branches 
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
        create_result = db.execute(
            text("""
                INSERT INTO public.org_branches (
                    org_id,
                    branch_name,
                    branch_code,
                    is_active,
                    created_at
                ) VALUES (
                    :org_id,
                    'Main Branch',
                    'MAIN',
                    true,
                    NOW()
                )
                ON CONFLICT DO NOTHING
                RETURNING branch_id
            """),
            {"org_id": org_id}
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
                FROM public.org_branches 
                WHERE org_id = :org_id 
                LIMIT 1
            """),
            {"org_id": org_id}
        ).fetchone()
        
        if final_result:
            return final_result[0]
            
    except Exception as e:
        logger.error(f"Error getting default branch for org {org_id}: {str(e)}")
        # Don't fail the entire operation if branch lookup fails
        # Return None and let the caller decide what to do
        return None
    
    return None


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
                FROM public.user_branches 
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
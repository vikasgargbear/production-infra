"""
Branch utility functions for managing branch-related operations.
"""

from sqlalchemy.orm import Session
from sqlalchemy import text


def get_default_branch_id(db: Session, org_id: str) -> int:
    """
    Get the default branch ID for an organization.
    
    Args:
        db: Database session
        org_id: Organization ID (UUID)
        
    Returns:
        Default branch ID for the organization
    """
    # For now, just return the first branch for the organization
    # since there's no is_default column in master.org_branches
    query = text("""
        SELECT branch_id 
        FROM master.org_branches 
        WHERE org_id = :org_id 
        ORDER BY branch_id 
        LIMIT 1
    """)
    
    result = db.execute(query, {"org_id": org_id}).first()
    
    if result:
        return result[0]
    
    # If no branch found, return 1 as fallback
    # This matches the behavior we had before
    return 1


def get_branch_name(db: Session, branch_id: int) -> str:
    """
    Get the name of a branch by its ID.
    
    Args:
        db: Database session
        branch_id: Branch ID
        
    Returns:
        Branch name
    """
    query = text("""
        SELECT branch_name 
        FROM master.org_branches 
        WHERE branch_id = :branch_id
    """)
    
    result = db.execute(query, {"branch_id": branch_id}).first()
    
    if result:
        return result[0]
    
    return "Unknown Branch"


def validate_branch_belongs_to_org(db: Session, branch_id: int, org_id: str) -> bool:
    """
    Validate that a branch belongs to a specific organization.
    
    Args:
        db: Database session
        branch_id: Branch ID to validate
        org_id: Organization ID (UUID)
        
    Returns:
        True if branch belongs to organization, False otherwise
    """
    query = text("""
        SELECT EXISTS(
            SELECT 1 
            FROM master.org_branches 
            WHERE branch_id = :branch_id 
            AND org_id = :org_id
        )
    """)
    
    result = db.execute(query, {"branch_id": branch_id, "org_id": org_id}).scalar()
    
    return bool(result)
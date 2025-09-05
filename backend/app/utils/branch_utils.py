"""
Branch utility functions for managing branch-related operations.
"""

from sqlalchemy.orm import Session
from sqlalchemy import text


def get_default_branch_id(db: Session, org_id: int) -> int:
    """
    Get the default branch ID for an organization.
    
    Args:
        db: Database session
        org_id: Organization ID
        
    Returns:
        Default branch ID for the organization
    """
    # Query to get the default branch for the organization
    query = text("""
        SELECT id 
        FROM organizations.branches 
        WHERE organization_id = :org_id 
        AND is_default = true
        LIMIT 1
    """)
    
    result = db.execute(query, {"org_id": org_id}).first()
    
    if result:
        return result[0]
    
    # If no default branch, get the first branch for the organization
    query = text("""
        SELECT id 
        FROM organizations.branches 
        WHERE organization_id = :org_id 
        ORDER BY id 
        LIMIT 1
    """)
    
    result = db.execute(query, {"org_id": org_id}).first()
    
    if result:
        return result[0]
    
    # If still no branch found, this is a critical error
    raise ValueError(f"No branch found for organization {org_id}")


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
        SELECT name 
        FROM organizations.branches 
        WHERE id = :branch_id
    """)
    
    result = db.execute(query, {"branch_id": branch_id}).first()
    
    if result:
        return result[0]
    
    return "Unknown Branch"


def validate_branch_belongs_to_org(db: Session, branch_id: int, org_id: int) -> bool:
    """
    Validate that a branch belongs to a specific organization.
    
    Args:
        db: Database session
        branch_id: Branch ID to validate
        org_id: Organization ID
        
    Returns:
        True if branch belongs to organization, False otherwise
    """
    query = text("""
        SELECT EXISTS(
            SELECT 1 
            FROM organizations.branches 
            WHERE id = :branch_id 
            AND organization_id = :org_id
        )
    """)
    
    result = db.execute(query, {"branch_id": branch_id, "org_id": org_id}).scalar()
    
    return bool(result)
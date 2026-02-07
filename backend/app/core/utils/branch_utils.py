"""
Branch utility functions for managing branch-related operations.
"""

from sqlalchemy.orm import Session
from sqlalchemy import text


def get_default_branch_id(db: Session, org_id: str) -> int:
    """
    Get the default branch ID for an organization.
    
    Priority:
    1. Branch marked as is_default_location = true
    2. First active branch for the organization
    
    Args:
        db: Database session
        org_id: Organization ID (UUID)
        
    Returns:
        Default branch ID for the organization
        
    Raises:
        ValueError: If no branch found for organization
    """
    # First try to get branch marked as default location
    query = text("""
        SELECT branch_id 
        FROM master.org_branches 
        WHERE org_id = :org_id 
        AND is_default_location = true
        AND is_active = true
        LIMIT 1
    """)
    
    result = db.execute(query, {"org_id": org_id}).first()
    
    if result:
        return result[0]
    
    # Fallback to first active branch
    query = text("""
        SELECT branch_id 
        FROM master.org_branches 
        WHERE org_id = :org_id 
        AND is_active = true
        ORDER BY branch_id 
        LIMIT 1
    """)
    
    result = db.execute(query, {"org_id": org_id}).first()
    
    if result:
        return result[0]
    
    # If no branch found, raise an error instead of returning hardcoded value
    raise ValueError(f"No active branch found for organization {org_id}")



def resolve_location_id(db: Session, org_id: str, branch_id: int = None, explicit_location_id: int = None) -> int:
    """
    Centralized location resolution for inventory operations.

    Priority:
    1. Explicit location_id (from request body)
    2. Default location for the given branch
    3. Any active location for the org
    4. Falls back to branch_id as location_id (legacy compat)

    Args:
        db: Database session
        org_id: Organization ID
        branch_id: Branch ID (from context or request)
        explicit_location_id: Location ID explicitly provided in request

    Returns:
        Resolved location_id
    """
    if explicit_location_id:
        return explicit_location_id

    # Try to find location for the given branch
    if branch_id:
        result = db.execute(text("""
            SELECT location_id FROM inventory.storage_locations
            WHERE org_id = :org_id AND branch_id = :branch_id AND is_active = true
            ORDER BY location_id LIMIT 1
        """), {"org_id": org_id, "branch_id": branch_id}).first()
        if result:
            return result[0]

    # Fallback: any active location for the org
    result = db.execute(text("""
        SELECT location_id FROM inventory.storage_locations
        WHERE org_id = :org_id AND is_active = true
        ORDER BY location_id LIMIT 1
    """), {"org_id": org_id}).first()
    if result:
        return result[0]

    # Last resort: use branch_id (legacy behavior, logged)
    import logging
    logging.getLogger(__name__).warning(
        f"No storage_location found for org {org_id}, branch {branch_id}. Using branch_id as location_id."
    )
    return branch_id or 1


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
"""
Authentication utilities for handling org_id and user context
"""
from fastapi import Header, HTTPException, Depends
from typing import Optional

def get_org_id_from_header(
    x_org_id: Optional[str] = Header(None, alias="X-Org-Id")
) -> str:
    """
    Get organization ID from request header
    Frontend should send X-Org-Id header with each request
    """
    if not x_org_id:
        raise HTTPException(
            status_code=400,
            detail="Organization ID is required. Please provide X-Org-Id header."
        )
    return x_org_id

def get_optional_org_id(
    x_org_id: Optional[str] = Header(None, alias="X-Org-Id")
) -> Optional[str]:
    """
    Get optional organization ID from request header
    Returns None if not provided
    """
    return x_org_id
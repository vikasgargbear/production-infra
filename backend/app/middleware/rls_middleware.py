"""
Row-Level Security (RLS) Middleware
Automatically sets org_id context for database queries to enforce multi-tenant isolation
"""
from fastapi import Request
from sqlalchemy import text
from jose import JWTError, jwt
import logging

from ..core.auth.jwt_auth import SECRET_KEY, ALGORITHM
from ..core.database import SessionLocal

logger = logging.getLogger(__name__)


async def set_org_context_middleware(request: Request, call_next):
    """
    Middleware to set PostgreSQL session variable for RLS enforcement

    This ensures that Row-Level Security policies can filter data by org_id
    even if application code forgets to add org_id filters
    """

    # Extract org_id from JWT token
    org_id = None

    # Try to get from Authorization header
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")

    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            org_id = payload.get("org_id")
            logger.debug(f"Extracted org_id from JWT: {org_id}")
        except JWTError as e:
            logger.warning(f"Failed to decode JWT: {e}")

    # Fallback to X-Org-Id header (temporary, for backward compatibility)
    if not org_id:
        org_id = request.headers.get("x-org-id") or request.headers.get("X-Org-Id")
        if org_id:
            logger.debug(f"Using org_id from header: {org_id}")

    # Set org_id in request state for easy access by endpoints
    request.state.org_id = org_id

    # If we have an org_id, set it in the database session
    if org_id:
        # Get database session
        db = SessionLocal()
        try:
            # Set the session variable for RLS
            # Using SET LOCAL ensures it only applies to current transaction
            db.execute(text("SET LOCAL app.current_org_id = :org_id"), {"org_id": org_id})
            db.commit()
            logger.debug(f"Set RLS context: app.current_org_id = {org_id}")
        except Exception as e:
            logger.error(f"Failed to set RLS context: {e}")
            db.rollback()
        finally:
            db.close()
    else:
        logger.warning("No org_id found in request - RLS will block all queries")

    # Continue processing request
    response = await call_next(request)

    return response


def get_org_id_from_request(request: Request) -> str:
    """
    Helper function to get org_id from request state
    Set by the middleware above
    """
    org_id = getattr(request.state, 'org_id', None)
    if not org_id:
        raise ValueError("org_id not found in request context")
    return org_id

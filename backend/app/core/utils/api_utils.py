"""
Common API Utilities for Enterprise Pharma ERP
Provides standardized response formats, error handling, and middleware

Usage:
    from ...core.utils.api_utils import (
        StandardResponse, handle_error, 
        get_request_id, add_cache_headers
    )
"""
from typing import Any, Dict, Optional, TypeVar, Generic
from pydantic import BaseModel
from fastapi import HTTPException, Request, Response
from fastapi.responses import JSONResponse
from datetime import datetime
import uuid
import logging

logger = logging.getLogger(__name__)

T = TypeVar('T')


# =============================================================================
# STANDARD RESPONSE ENVELOPE
# =============================================================================

class ResponseMeta(BaseModel):
    """Metadata for API responses"""
    request_id: str
    timestamp: str
    version: str = "v1"
    duration_ms: Optional[float] = None


class StandardResponse(BaseModel, Generic[T]):
    """
    Standard response envelope for all API responses
    
    Example:
        {
            "success": true,
            "data": {...},
            "meta": {
                "request_id": "abc12345",
                "timestamp": "2024-01-15T10:30:00Z",
                "version": "v1"
            }
        }
    """
    success: bool = True
    data: Any
    error: Optional[str] = None
    meta: ResponseMeta


class PaginatedResponse(BaseModel, Generic[T]):
    """Standard paginated response envelope"""
    success: bool = True
    data: Any
    pagination: Dict[str, Any]
    meta: ResponseMeta


def create_response(
    data: Any,
    request: Optional[Request] = None,
    duration_ms: Optional[float] = None
) -> Dict[str, Any]:
    """
    Create a standard response envelope
    
    Args:
        data: The response data
        request: FastAPI request object (for request_id)
        duration_ms: Request processing time
    """
    request_id = get_request_id(request) if request else str(uuid.uuid4())[:8]
    
    return {
        "success": True,
        "data": data,
        "meta": {
            "request_id": request_id,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "version": "v1",
            "duration_ms": duration_ms
        }
    }


def create_error_response(
    error: str,
    error_id: str,
    status_code: int = 500,
    request: Optional[Request] = None
) -> Dict[str, Any]:
    """Create a standard error response envelope"""
    request_id = get_request_id(request) if request else str(uuid.uuid4())[:8]
    
    return {
        "success": False,
        "error": error,
        "error_id": error_id,
        "meta": {
            "request_id": request_id,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "version": "v1"
        }
    }


# =============================================================================
# ERROR HANDLING
# =============================================================================

def handle_error(
    e: Exception, 
    operation: str, 
    entity_id: Optional[int] = None,
    request: Optional[Request] = None
) -> HTTPException:
    """
    Production-safe error handler.
    - Logs full error details for debugging
    - Returns sanitized message to client (no internal details)
    - Includes error_id for support tracking
    
    Usage:
        try:
            ...
        except Exception as e:
            raise handle_error(e, "create customer", customer_id)
    """
    error_id = str(uuid.uuid4())[:8]
    request_id = get_request_id(request) if request else "unknown"
    
    if entity_id:
        logger.error(
            f"[{error_id}][{request_id}] Error {operation} (id={entity_id}): {str(e)}", 
            exc_info=True
        )
    else:
        logger.error(
            f"[{error_id}][{request_id}] Error {operation}: {str(e)}", 
            exc_info=True
        )
    
    return HTTPException(
        status_code=500, 
        detail={
            "success": False,
            "error": f"Failed to {operation}",
            "error_id": error_id,
            "message": "An internal error occurred. Please contact support with the error_id."
        }
    )


# =============================================================================
# REQUEST ID TRACKING
# =============================================================================

def get_request_id(request: Optional[Request] = None) -> str:
    """
    Get or generate a request ID for tracking
    
    Checks X-Request-ID header first, then generates one if missing
    """
    if request:
        # Check for existing request ID header
        request_id = request.headers.get("X-Request-ID")
        if request_id:
            return request_id[:32]  # Limit length
        
        # Check if we already set one on this request
        if hasattr(request.state, 'request_id'):
            return request.state.request_id
    
    # Generate new request ID
    return str(uuid.uuid4())[:8]


def set_request_id(request: Request) -> str:
    """Set request ID on request state and return it"""
    request_id = get_request_id(request)
    request.state.request_id = request_id
    return request_id


# =============================================================================
# CACHE HEADERS
# =============================================================================

def add_cache_headers(
    response: Response, 
    max_age: int = 60,
    private: bool = True,
    must_revalidate: bool = True
) -> Response:
    """
    Add cache control headers to a response
    
    Args:
        response: FastAPI response object
        max_age: Cache duration in seconds (default: 60)
        private: If True, cache is private to user (default: True for tenant data)
        must_revalidate: If True, must check with server when stale
    """
    cache_parts = []
    
    if private:
        cache_parts.append("private")
    else:
        cache_parts.append("public")
    
    cache_parts.append(f"max-age={max_age}")
    
    if must_revalidate:
        cache_parts.append("must-revalidate")
    
    response.headers["Cache-Control"] = ", ".join(cache_parts)
    return response


def add_no_cache_headers(response: Response) -> Response:
    """Add headers to prevent caching (for sensitive/dynamic data)"""
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    return response


# =============================================================================
# PAGINATION HELPERS
# =============================================================================

def create_pagination_meta(
    total: int,
    page: int,
    per_page: int
) -> Dict[str, Any]:
    """Create standard pagination metadata"""
    total_pages = (total + per_page - 1) // per_page if per_page > 0 else 0
    
    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
        "has_next": page < total_pages,
        "has_prev": page > 1
    }

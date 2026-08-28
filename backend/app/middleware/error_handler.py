"""
Global Error Handler Middleware

Sanitizes error responses to prevent internal details from leaking to clients.
- Full stack traces go to server logs only
- Clients receive generic error messages
- HTTPExceptions pass through as-is (they are intentional)
"""
import logging
import traceback
import os

from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.exc import TimeoutError as SQLAlchemyTimeoutError
from starlette.middleware.base import BaseHTTPMiddleware

from ..core.env import is_production

logger = logging.getLogger(__name__)

_IS_PRODUCTION = is_production()
ERP_BUSY_DETAIL = {
    "error": "erp_busy",
    "message": "ERP is temporarily busy. Please retry shortly.",
}
ERP_BUSY_RETRY_AFTER_SECONDS = "2"


def database_busy_response() -> JSONResponse:
    """Return a typed, retryable response when the reviewed DB pool is full."""

    return JSONResponse(
        status_code=503,
        headers={"Retry-After": ERP_BUSY_RETRY_AFTER_SECONDS},
        content={"detail": ERP_BUSY_DETAIL},
    )


class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    """
    Catches unhandled exceptions and returns sanitized error responses.

    - HTTPException: passes through (intentional error responses)
    - All other exceptions: logs full details, returns generic 500
    """

    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)
        except HTTPException:
            # Let FastAPI handle HTTPExceptions normally
            raise
        except SQLAlchemyTimeoutError as exc:
            logger.warning(
                "Database pool unavailable on %s %s: %s",
                request.method,
                request.url.path,
                exc,
                extra={
                    "event_type": "database_pool_busy",
                    "method": request.method,
                    "path": str(request.url.path),
                },
            )
            return database_busy_response()
        except Exception as exc:
            # Log full details server-side
            logger.error(
                f"Unhandled exception on {request.method} {request.url.path}: "
                f"{type(exc).__name__}: {exc}",
                exc_info=True,
                extra={
                    "event_type": "unhandled_exception",
                    "method": request.method,
                    "path": str(request.url.path),
                }
            )

            return JSONResponse(
                status_code=500,
                content={
                    "detail": "An internal error occurred. Please try again or contact support.",
                    "error_code": "INTERNAL_ERROR"
                }
            )


def safe_error_detail(exc: Exception, context: str = "Operation") -> str:
    """
    Return a safe error message for HTTP responses.
    In production: generic message. In dev: includes exception type (not full trace).

    Usage in routes:
        from app.middleware.error_handler import safe_error_detail
        raise HTTPException(status_code=500, detail=safe_error_detail(e, "Creating invoice"))
    """
    if _IS_PRODUCTION:
        return f"{context} failed. Please try again or contact support."
    return f"{context} failed: {type(exc).__name__}: {exc}"


async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    FastAPI exception handler for unhandled exceptions.
    Register with: app.add_exception_handler(Exception, global_exception_handler)
    """
    if isinstance(exc, SQLAlchemyTimeoutError):
        logger.warning(
            "Database pool unavailable on %s %s: %s",
            request.method,
            request.url.path,
            exc,
            extra={
                "event_type": "database_pool_busy",
                "method": request.method,
                "path": str(request.url.path),
            },
        )
        return database_busy_response()

    logger.error(
        f"Unhandled exception on {request.method} {request.url.path}: "
        f"{type(exc).__name__}: {exc}",
        exc_info=True,
        extra={
            "event_type": "unhandled_exception",
            "method": request.method,
            "path": str(request.url.path),
        }
    )

    return JSONResponse(
        status_code=500,
        content={
            "detail": "An internal error occurred. Please try again or contact support.",
            "error_code": "INTERNAL_ERROR"
        }
    )

"""
Request Logging Middleware

Logs every API request with:
- method, path, status code, duration_ms
- user_id, org_id (from JWT if available)
- client IP
- X-Request-ID header for correlation

Also writes to system_config.api_logs table for auditing.
"""
import time
import logging

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from ..core.logging_config import (
    generate_request_id,
    request_id_var,
    user_id_var,
    org_id_var,
)

logger = logging.getLogger("app.requests")


class RequestLoggerMiddleware(BaseHTTPMiddleware):
    """
    Log all API requests with timing and correlation IDs.
    """

    # Paths to skip logging (health checks, docs)
    SKIP_PATHS = {"/", "/health", "/docs", "/openapi.json", "/redoc"}

    async def dispatch(self, request: Request, call_next):
        # Generate or reuse request ID
        req_id = request.headers.get("X-Request-ID") or generate_request_id()
        request_id_var.set(req_id)

        # Extract user/org from request state (set by auth middleware)
        uid = str(getattr(request.state, "user_id", "") or "")
        oid = str(getattr(request.state, "org_id", "") or "")
        user_id_var.set(uid)
        org_id_var.set(oid)

        start = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.perf_counter() - start) * 1000, 1)
            path = request.url.path
            if path not in self.SKIP_PATHS:
                logger.error(
                    f"{request.method} {path} 500 {duration_ms}ms",
                    extra={
                        "event_type": "request",
                        "method": request.method,
                        "path": path,
                        "status_code": 500,
                        "duration_ms": duration_ms,
                        "ip": request.client.host if request.client else "",
                    }
                )
            raise

        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        path = request.url.path

        # Add correlation header to response
        response.headers["X-Request-ID"] = req_id

        # Log (skip noisy health checks)
        if path not in self.SKIP_PATHS:
            log_fn = logger.info if response.status_code < 400 else logger.warning
            log_fn(
                f"{request.method} {path} {response.status_code} {duration_ms}ms",
                extra={
                    "event_type": "request",
                    "method": request.method,
                    "path": path,
                    "status_code": response.status_code,
                    "duration_ms": duration_ms,
                    "ip": request.client.host if request.client else "",
                }
            )

        return response

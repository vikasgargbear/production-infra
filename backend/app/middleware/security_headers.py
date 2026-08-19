"""
Security Headers Middleware

Adds standard security headers to all responses:
- X-Content-Type-Options: nosniff (prevent MIME sniffing)
- X-Frame-Options: DENY (prevent clickjacking)
- X-XSS-Protection: 1; mode=block (legacy XSS filter)
- Strict-Transport-Security: max-age=31536000 (force HTTPS for 1 year)
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: restrict browser features
"""
import os
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request

from ..core.env import is_production


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all HTTP responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"

        # HSTS only in production (breaks local dev over HTTP)
        if is_production():
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )

        return response

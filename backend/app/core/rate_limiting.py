"""
Rate Limiting Middleware for Pharma ERP
Provides protection against API abuse without external dependencies

Features:
- In-memory rate limiting (no Redis required)
- Per-org rate limiting (tenant-aware)
- Configurable limits per endpoint type
- Graceful handling with proper HTTP 429 responses

Usage:
    from ...core.rate_limiting import RateLimiter, rate_limit
    
    # Apply to endpoint
    @router.get("/customers")
    @rate_limit(requests=100, window=60)  # 100 requests per minute
    async def list_customers(...):
        ...
"""
from typing import Dict, Optional, Callable
from datetime import datetime, timedelta
from fastapi import Request, HTTPException
from functools import wraps
import logging
import time
from collections import defaultdict
import threading

logger = logging.getLogger(__name__)


# =============================================================================
# CONFIGURATION
# =============================================================================

class RateLimitConfig:
    """Rate limit configurations by endpoint type"""
    
    # Default limits (requests per minute)
    DEFAULT = {"requests": 100, "window": 60}
    
    # Stricter limits for write operations
    WRITE = {"requests": 30, "window": 60}
    
    # Looser limits for read operations
    READ = {"requests": 200, "window": 60}
    
    # Very strict for auth endpoints (prevent brute force)
    AUTH = {"requests": 10, "window": 60}
    
    # Batch operations
    BATCH = {"requests": 10, "window": 60}


# =============================================================================
# IN-MEMORY RATE LIMITER
# =============================================================================

class InMemoryRateLimiter:
    """
    Simple in-memory rate limiter using sliding window algorithm.
    Suitable for single-instance deployments.
    For multi-instance, use Redis-based limiter.
    """
    
    def __init__(self):
        # Structure: {key: [(timestamp, count), ...]}
        self._requests: Dict[str, list] = defaultdict(list)
        self._lock = threading.Lock()
        
        # Cleanup old entries periodically
        self._last_cleanup = time.time()
        self._cleanup_interval = 300  # 5 minutes
    
    def _cleanup_old_entries(self, window: int):
        """Remove entries older than window from all keys"""
        now = time.time()
        if now - self._last_cleanup < self._cleanup_interval:
            return
        
        self._last_cleanup = now
        cutoff = now - window
        
        keys_to_delete = []
        for key, timestamps in self._requests.items():
            # Remove old timestamps
            self._requests[key] = [ts for ts in timestamps if ts > cutoff]
            if not self._requests[key]:
                keys_to_delete.append(key)
        
        for key in keys_to_delete:
            del self._requests[key]
    
    def is_allowed(self, key: str, max_requests: int, window_seconds: int) -> tuple[bool, int, int]:
        """
        Check if request is allowed under rate limit.
        
        Args:
            key: Unique identifier (e.g., "org_id:endpoint")
            max_requests: Maximum requests allowed in window
            window_seconds: Time window in seconds
            
        Returns:
            Tuple of (is_allowed, remaining_requests, reset_time_seconds)
        """
        now = time.time()
        cutoff = now - window_seconds
        
        with self._lock:
            # Cleanup old entries occasionally
            self._cleanup_old_entries(window_seconds)
            
            # Get current request timestamps
            timestamps = self._requests[key]
            
            # Remove expired timestamps
            valid_timestamps = [ts for ts in timestamps if ts > cutoff]
            self._requests[key] = valid_timestamps
            
            # Check if under limit
            current_count = len(valid_timestamps)
            
            if current_count < max_requests:
                # Add new request
                self._requests[key].append(now)
                remaining = max_requests - current_count - 1
                reset_time = int(window_seconds - (now - min(valid_timestamps)) if valid_timestamps else window_seconds)
                return True, max(0, remaining), reset_time
            else:
                # Rate limited
                oldest = min(valid_timestamps) if valid_timestamps else now
                reset_time = int(oldest + window_seconds - now)
                return False, 0, max(1, reset_time)


# Global rate limiter instance
_rate_limiter = InMemoryRateLimiter()


# =============================================================================
# RATE LIMIT DECORATOR
# =============================================================================

def rate_limit(
    requests: int = 100,
    window: int = 60,
    key_func: Optional[Callable[[Request], str]] = None
):
    """
    Rate limiting decorator for FastAPI endpoints.
    
    Args:
        requests: Maximum requests allowed in window (default: 100)
        window: Time window in seconds (default: 60)
        key_func: Function to extract rate limit key from request
                  Default: uses org_id from request state
    
    Usage:
        @router.get("/customers")
        @rate_limit(requests=100, window=60)
        async def list_customers(...):
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Get request from kwargs (FastAPI injects it)
            request: Optional[Request] = kwargs.get('request')
            
            if request is None:
                # Try to find request in args
                for arg in args:
                    if isinstance(arg, Request):
                        request = arg
                        break
            
            if request is None:
                # No request object, skip rate limiting
                return await func(*args, **kwargs)
            
            # Generate rate limit key
            if key_func:
                key = key_func(request)
            else:
                # Default: use org_id + endpoint path
                org_id = getattr(request.state, 'org_id', 'anonymous')
                key = f"{org_id}:{request.url.path}"
            
            # Check rate limit
            allowed, remaining, reset_time = _rate_limiter.is_allowed(key, requests, window)
            
            if not allowed:
                logger.warning(f"Rate limit exceeded for {key}")
                raise HTTPException(
                    status_code=429,
                    detail={
                        "error": "Rate limit exceeded",
                        "message": f"Too many requests. Please try again in {reset_time} seconds.",
                        "retry_after": reset_time
                    },
                    headers={
                        "Retry-After": str(reset_time),
                        "X-RateLimit-Limit": str(requests),
                        "X-RateLimit-Remaining": "0",
                        "X-RateLimit-Reset": str(reset_time)
                    }
                )
            
            # Execute the actual function
            response = await func(*args, **kwargs)
            
            # TODO: Add rate limit headers to response
            # This would require returning a Response object
            
            return response
        
        return wrapper
    return decorator


# =============================================================================
# MIDDLEWARE (Alternative approach)
# =============================================================================

async def rate_limit_middleware(request: Request, call_next):
    """
    FastAPI middleware for global rate limiting.
    Add to app: app.middleware("http")(rate_limit_middleware)
    
    Note: Decorator approach is preferred for granular control.
    """
    # Skip rate limiting for health checks
    if request.url.path in ["/", "/health", "/docs", "/openapi.json"]:
        return await call_next(request)
    
    # Get org_id from request (if available)
    org_id = getattr(request.state, 'org_id', None)
    
    if org_id:
        key = f"{org_id}:{request.url.path}"
        config = RateLimitConfig.DEFAULT
        
        # Use stricter limits for write operations
        if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
            config = RateLimitConfig.WRITE
        
        allowed, remaining, reset_time = _rate_limiter.is_allowed(
            key, 
            config["requests"], 
            config["window"]
        )
        
        if not allowed:
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=429,
                content={
                    "error": "Rate limit exceeded",
                    "retry_after": reset_time
                },
                headers={
                    "Retry-After": str(reset_time),
                    "X-RateLimit-Limit": str(config["requests"]),
                    "X-RateLimit-Remaining": "0"
                }
            )
    
    return await call_next(request)


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_rate_limiter() -> InMemoryRateLimiter:
    """Get the global rate limiter instance"""
    return _rate_limiter


def reset_rate_limits():
    """Reset all rate limits (useful for testing)"""
    global _rate_limiter
    _rate_limiter = InMemoryRateLimiter()

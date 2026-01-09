"""
Simple in-memory cache utility for dashboard queries

P1-3: Dashboard caching for 90% performance improvement
Uses TTL (time-to-live) to auto-expire cached data

For production, replace with Redis for multi-server support.
"""
import time
from functools import wraps
from typing import Any, Callable, Dict, Optional
import hashlib
import json

# Simple in-memory cache with TTL
_cache: Dict[str, Dict[str, Any]] = {}


def cache_with_ttl(ttl: int = 300, key_prefix: str = ""):
    """
    Decorator to cache function results with TTL
    
    Args:
        ttl: Time to live in seconds (default: 5 minutes)
        key_prefix: Prefix for cache key
    
    Example:
        @cache_with_ttl(ttl=300, key_prefix="dashboard_stats")
        def get_dashboard_stats(db, org_id):
            # expensive query
            return results
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key from function name + args
            # Skip first arg (db session) from cache key
            cache_args = args[1:] if len(args) > 0 else args
            key_parts = [key_prefix, func.__name__, str(cache_args), str(sorted(kwargs.items()))]
            cache_key = hashlib.md5(json.dumps(key_parts).encode()).hexdigest()
            
            # Check cache
            now = time.time()
            if cache_key in _cache:
                cached_item = _cache[cache_key]
                if now - cached_item["timestamp"] < ttl:
                    print(f"[Cache HIT] {key_prefix}.{func.__name__}")
                    return cached_item["value"]
            
            # Cache miss - compute and store
            print(f"[Cache MISS] {key_prefix}.{func.__name__}")
            result = func(*args, **kwargs)
            _cache[cache_key] = {
                "value": result,
                "timestamp": now
            }
            
            return result
        
        return wrapper
    return decorator


def clear_cache(pattern: Optional[str] = None):
    """
    Clear cache entries
    
    Args:
        pattern: Optional pattern to match keys (None = clear all)
    """
    global _cache
    if pattern is None:
        cleared = len(_cache)
        _cache = {}
        print(f"[Cache] Cleared all {cleared} entries")
    else:
        # TODO: Implement pattern matching if needed
        pass

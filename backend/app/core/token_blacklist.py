"""
Token Blacklist Service
Simple in-memory token blacklist with TTL for invalidated tokens.
For production, use Redis for distributed deployments.
"""
import time
import threading
from typing import Optional, Set, Dict
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class TokenBlacklist:
    """
    In-memory token blacklist with automatic expiry cleanup.
    
    For production deployments with multiple servers, replace with Redis:
    - REDIS_URL environment variable
    - Use redis.setex() for automatic TTL
    
    Current implementation works for:
    - Single server deployments
    - Railway (single instance)
    """
    
    def __init__(self, cleanup_interval: int = 3600):
        """
        Initialize blacklist with cleanup interval.
        
        Args:
            cleanup_interval: Seconds between cleanup runs (default: 1 hour)
        """
        self._blacklist: Dict[str, float] = {}  # token_jti -> expiry_timestamp
        self._lock = threading.Lock()
        self._cleanup_interval = cleanup_interval
        self._last_cleanup = time.time()
    
    def add(self, token_jti: str, expires_at: float) -> None:
        """
        Add a token to the blacklist.
        
        Args:
            token_jti: JWT ID (jti claim) or token hash
            expires_at: Unix timestamp when token expires naturally
        """
        with self._lock:
            self._blacklist[token_jti] = expires_at
            logger.info(f"Token added to blacklist: {token_jti[:8]}...")
            
            # Run cleanup if needed
            self._maybe_cleanup()
    
    def is_blacklisted(self, token_jti: str) -> bool:
        """
        Check if a token is blacklisted.
        
        Args:
            token_jti: JWT ID to check
            
        Returns:
            True if blacklisted, False otherwise
        """
        with self._lock:
            if token_jti in self._blacklist:
                # Check if the blacklist entry has expired
                if time.time() < self._blacklist[token_jti]:
                    return True
                else:
                    # Expired entry, remove it
                    del self._blacklist[token_jti]
            return False
    
    def remove(self, token_jti: str) -> bool:
        """
        Remove a token from the blacklist.
        
        Returns:
            True if removed, False if not found
        """
        with self._lock:
            if token_jti in self._blacklist:
                del self._blacklist[token_jti]
                return True
            return False
    
    def _maybe_cleanup(self) -> None:
        """Clean up expired entries if cleanup interval has passed."""
        now = time.time()
        if now - self._last_cleanup >= self._cleanup_interval:
            self._cleanup()
            self._last_cleanup = now
    
    def _cleanup(self) -> None:
        """Remove all expired entries."""
        now = time.time()
        expired_keys = [k for k, v in self._blacklist.items() if v <= now]
        for key in expired_keys:
            del self._blacklist[key]
        
        if expired_keys:
            logger.debug(f"Cleaned up {len(expired_keys)} expired blacklist entries")
    
    @property
    def size(self) -> int:
        """Return current blacklist size."""
        with self._lock:
            return len(self._blacklist)


# Singleton instance
_blacklist: Optional[TokenBlacklist] = None


def get_token_blacklist() -> TokenBlacklist:
    """Get the singleton token blacklist instance."""
    global _blacklist
    if _blacklist is None:
        _blacklist = TokenBlacklist()
    return _blacklist


def blacklist_token(token_jti: str, expires_at: float) -> None:
    """
    Convenience function to blacklist a token.
    
    Args:
        token_jti: The JWT ID (jti) claim from the token
        expires_at: Unix timestamp when the token expires
    """
    get_token_blacklist().add(token_jti, expires_at)


def is_token_blacklisted(token_jti: str) -> bool:
    """
    Convenience function to check if a token is blacklisted.
    
    Args:
        token_jti: The JWT ID (jti) claim from the token
        
    Returns:
        True if token is blacklisted
    """
    return get_token_blacklist().is_blacklisted(token_jti)

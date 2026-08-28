"""
Auth API Routes Package
Contains authentication and authorization endpoints
"""
from .enterprise import router as auth_enterprise_router
from .oauth import router as auth_oauth_router
from .onboarding import router as auth_onboarding_router

__all__ = [
    "auth_enterprise_router",
    "auth_oauth_router",
    "auth_onboarding_router",
]

"""
Organization API Routes Package
Contains organization-scoped company settings.
"""
from .company import router as company_router

__all__ = [
    "company_router",
]

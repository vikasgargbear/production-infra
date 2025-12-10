"""
Organization API Routes Package
Contains company profile and initial setup
"""
from .company import router as company_router
from .initial_setup import router as initial_setup_router

__all__ = [
    "company_router",
    "initial_setup_router",
]

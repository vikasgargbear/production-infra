"""
Analytics API Routes Package
Contains dashboards and reporting endpoints
"""
from .dashboard import router as dashboard_router
from .collection import router as collection_router
from .outstanding import router as outstanding_router

__all__ = [
    "dashboard_router",
    "collection_router",
    "outstanding_router",
]

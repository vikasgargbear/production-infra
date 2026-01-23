"""
Compliance API Routes Package
Contains GST and regulatory compliance endpoints
"""
from .gst import router as gst_router
from .gstr2b import router as gstr2b_router
from .compliance import router as compliance_router

__all__ = [
    "gst_router",
    "gstr2b_router",
    "compliance_router",
]

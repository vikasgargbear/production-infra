"""
Purchase API Routes Package
Contains purchase orders, GRN, supplier invoices, and returns
"""
from .orders import router as orders_router
from .supplier_invoices import router as supplier_invoices_router
from .grn import router as grn_router
from .returns import router as returns_router
from .upload import router as upload_router

__all__ = [
    "orders_router",
    "supplier_invoices_router",
    "grn_router",
    "returns_router",
    "upload_router",
]

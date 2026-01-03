"""
Purchase API Routes Package
Contains purchase orders, GRN, supplier invoices

Note: Returns moved to top-level /returns module
"""
from .orders import router as orders_router
from .supplier_invoices import router as supplier_invoices_router
from .grn import router as grn_router
from .upload import router as upload_router

__all__ = [
    "orders_router",
    "supplier_invoices_router",
    "grn_router",
    "upload_router",
]

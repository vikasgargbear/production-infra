"""
Sales API Routes Package
Contains sales orders, invoices, challans, and returns
"""
from .orders import router as orders_router
from .sales_orders import router as sales_orders_router
from .invoices import router as invoices_router
from .challan import router as challan_router
from .returns import router as returns_router
from .conversions import router as conversions_router

__all__ = [
    "orders_router",
    "sales_orders_router",
    "invoices_router",
    "challan_router",
    "returns_router",
    "conversions_router",
]

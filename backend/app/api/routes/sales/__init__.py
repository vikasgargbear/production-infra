"""
Sales API Routes Package
Contains sales orders, invoices, challans, and returns
"""
from .orders import router as orders_router
from .sales_orders import router as sales_orders_router
from .invoices import router as invoices_router
from .direct_sales import router as direct_sales_router
from .challan import router as challan_router
from .quick_sale import router as quick_sale_router
from .returns import router as returns_router

__all__ = [
    "orders_router",
    "sales_orders_router",
    "invoices_router",
    "direct_sales_router",
    "challan_router",
    "quick_sale_router",
    "returns_router",
]

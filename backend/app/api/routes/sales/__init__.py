"""
Sales API Routes Package
Contains sales orders, invoices, challans, returns, and conversions

Modular organization:
- invoices/    - Invoice management
- orders/      - Sales order management (/sales-orders)
- challans/    - Delivery challan management
- returns/     - Sales returns management
- conversions/ - Document conversions (order→invoice, order→challan)
"""
# Modular imports from subfolders
from .invoices import router as invoices_router
from .orders import router as orders_router
from .challans import router as challan_router
from .returns import router as returns_router
from .conversions import router as conversions_router

__all__ = [
    "orders_router",
    "invoices_router",
    "challan_router",
    "returns_router",
    "conversions_router",
]

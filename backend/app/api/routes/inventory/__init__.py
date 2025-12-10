"""
Inventory API Routes Package
Contains stock management, adjustments, movements, and writeoffs
"""
from .stock import router as stock_router
from .adjustments import router as adjustments_router
from .movements import router as movements_router
from .receive import router as receive_router
from .writeoff import router as writeoff_router
from .dashboard import router as dashboard_router

__all__ = [
    "stock_router",
    "adjustments_router",
    "movements_router",
    "receive_router",
    "writeoff_router",
    "dashboard_router",
]

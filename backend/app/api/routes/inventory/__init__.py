"""
Inventory API Routes Package
Contains stock management, adjustments, movements, and writeoffs
"""
from .stock import router as stock_router
from .adjustments import router as adjustments_router
from .movements import router as movements_router
from .writeoff import router as writeoff_router

__all__ = [
    "stock_router",
    "adjustments_router",
    "movements_router",
    "writeoff_router",
]

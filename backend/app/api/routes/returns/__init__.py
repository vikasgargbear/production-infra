"""
Returns API Routes Module
Handles both sales returns and purchase returns
"""
from .sales import router as sales_returns_router
from .purchase import router as purchase_returns_router

__all__ = ["sales_returns_router", "purchase_returns_router"]

"""
Orders API Routes Module
Contains /orders and /sales-orders endpoints
"""
from .routes import router as orders_router
from .sales_orders import router as sales_orders_router

__all__ = ["orders_router", "sales_orders_router"]

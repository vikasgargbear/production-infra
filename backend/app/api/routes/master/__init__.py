"""
Master Data API Routes Package
Contains CRUD endpoints for master data entities
"""
from .customers import router as customers_router
from .suppliers import router as suppliers_router
from .products import router as products_router
from .branches import router as branches_router
from .departments import router as departments_router
from .employees import router as employees_router
from .bank_accounts import router as bank_accounts_router

__all__ = [
    "customers_router",
    "suppliers_router",
    "products_router",
    "branches_router",
    "departments_router",
    "employees_router",
    "bank_accounts_router",
]

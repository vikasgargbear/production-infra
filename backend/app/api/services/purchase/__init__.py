"""Canonical purchase-domain service exports.

Mounted routes resolve to the nested ``order``, ``grn``, and
``supplier_invoice.service`` boundaries. Retired top-level compatibility
services must not be reintroduced through this barrel.
"""

# Core calculations
from .calculations import PurchaseCalculator, CalculatedPurchaseItem, PurchaseTotals

# GRN operations
from .grn import GRNService, GRNRepository

# Supplier Invoice operations
from .supplier_invoice import SupplierInvoiceService

# Purchase Order operations
from .order import PurchaseOrderService, PurchaseOrderRepository

# Shared utilities
from .shared import PurchaseSharedRepository

__all__ = [
    # Calculations
    "PurchaseCalculator",
    "CalculatedPurchaseItem",
    "PurchaseTotals",
    
    # GRN
    "GRNService",
    "GRNRepository",
    
    # Supplier Invoice
    "SupplierInvoiceService",
    
    # Purchase Order
    "PurchaseOrderService",
    "PurchaseOrderRepository",
    
    # Shared
    "PurchaseSharedRepository",
]

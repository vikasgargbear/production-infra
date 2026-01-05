"""
Purchase Services Module
Follows same structure as sales module with subdirectories for each domain.

Structure:
├── calculations.py          # PurchaseCalculator for precise calculations
├── grn/                     # Goods Receipt Note operations
│   ├── grn_service.py       # Business logic
│   └── grn_repository.py    # Data access
├── supplier_invoice/        # Supplier invoice operations
│   ├── supplier_invoice_service.py
│   └── supplier_invoice_repository.py
├── order/                   # Purchase order operations
│   ├── order_service.py
│   └── order_repository.py
├── shared/                  # Common utilities
│   └── purchase_shared_repository.py
└── parsers/                 # PDF parsing utilities
"""

# Core calculations
from .calculations import PurchaseCalculator, CalculatedPurchaseItem, PurchaseTotals

# GRN operations
from .grn import GRNService, GRNRepository

# Supplier Invoice operations
from .supplier_invoice import SupplierInvoiceService, SupplierInvoiceRepository

# Purchase Order operations
from .order import PurchaseOrderService, PurchaseOrderRepository

# Shared utilities
from .shared import PurchaseSharedRepository

# Legacy support - also export from old location
# TODO: Migrate routes to use new imports, then remove this
from .purchase_service import PurchaseService

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
    "SupplierInvoiceRepository",
    
    # Purchase Order
    "PurchaseOrderService",
    "PurchaseOrderRepository",
    
    # Shared
    "PurchaseSharedRepository",
    
    # Legacy
    "PurchaseService",
]

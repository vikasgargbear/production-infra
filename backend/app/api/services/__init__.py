"""
Service layer for business logic

Organized by domain:
- sales/:     Order services
- purchase/:  Purchase services
- finance/:   Payment, Ledger, Credit Note services
- inventory/: Inventory services
- master/:    Product, Customer services
- returns/:   Return services (sales & purchase)
- settings/:  Settings services
- email/:     Email services

Note: InvoiceService temporarily disabled - requires type schema refactoring
"""
# Domain-organized services
from .sales.order_service import OrderService
from .returns.return_service import ReturnService
from .master.product.service import ProductService
from .master.customer.service import CustomerService
from .purchase.purchase_service import PurchaseService
from .finance.payment.service import PaymentService
from .finance.ledger.service import LedgerService
from .finance.credit_note.service import CreditNoteService
from .inventory.inventory_service import InventoryService
from .settings.settings_service import SettingsService, SettingsServiceSync, invalidate_settings_cache

# Core/shared services (remain at top level)
from .document_number_service import DocumentNumberService
from .dashboard_service import DashboardService
from .compliance.gst_service import GSTService  # Moved to compliance/

__all__ = [
    # Sales
    "OrderService",
    "ReturnService",
    # Master
    "CustomerService",
    "ProductService",
    # Purchase
    "PurchaseService",
    # Finance
    "PaymentService",
    "LedgerService",
    "CreditNoteService",
    # Inventory
    "InventoryService",
    # Settings
    "SettingsService",
    "SettingsServiceSync",
    "invalidate_settings_cache",
    # Core/Shared
    "DocumentNumberService",
    "DashboardService",
    "GSTService",
]
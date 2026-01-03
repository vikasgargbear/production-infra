"""
Service layer for business logic

Organized by domain:
- sales/:     Invoice, Order, Return services
- purchase/:  Purchase services
- finance/:   Payment, Ledger, Credit Note services
- inventory/: Inventory services
- master/:    Product, Customer services
"""
# Domain-organized services
from .sales.invoice_service import InvoiceService
from .sales.order_service import OrderService
from .sales.return_service import ReturnService
from .master.product_service import ProductService
from .master.customer_service import CustomerService
from .purchase.purchase_service import PurchaseService
from .finance.payment_service import PaymentService
from .finance.ledger_service import LedgerService
from .finance.credit_note_service import CreditNoteService
from .inventory.inventory_service import InventoryService

# Core/shared services (remain at top level)
from .document_number_service import DocumentNumberService
from .dashboard_service import DashboardService
from .gst_service import GSTService

__all__ = [
    # Sales
    "InvoiceService",
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
    # Core/Shared
    "DocumentNumberService",
    "DashboardService",
    "GSTService",
]
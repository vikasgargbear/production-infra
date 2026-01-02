"""
Service layer for business logic

Organized by domain:
- sales/: Invoice, Order, Return services
- master/: Product, Customer services
"""
# Re-export from submodules for backward compatibility
from .sales.invoice_service import InvoiceService
from .sales.order_service import OrderService
from .master.product_service import ProductService
from .master.customer_service import CustomerService

# Services still at top level
from .inventory_service import InventoryService
from .purchase_service import PurchaseService
from .payment_service import PaymentService
from .document_number_service import DocumentNumberService
from .return_service import ReturnService
from .ledger_service import LedgerService
from .credit_note_service import CreditNoteService
from .dashboard_service import DashboardService
from .gst_service import GSTService

__all__ = [
    # Sales
    "InvoiceService",
    "OrderService",
    # Master
    "CustomerService",
    "ProductService",
    # Other
    "InventoryService",
    "PurchaseService",
    "PaymentService",
    "DocumentNumberService",
    "ReturnService",
    "LedgerService",
    "CreditNoteService",
    "DashboardService",
    "GSTService",
]
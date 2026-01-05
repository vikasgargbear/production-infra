"""
Supplier Invoice Submodule
Follows same structure as sales/invoice/
"""
from .supplier_invoice_service import SupplierInvoiceService
from .supplier_invoice_repository import SupplierInvoiceRepository

__all__ = ["SupplierInvoiceService", "SupplierInvoiceRepository"]

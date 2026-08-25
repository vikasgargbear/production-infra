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

Legacy sales/master write services are retired; reviewed commands own writes.
"""
# Domain-organized services
from .returns.return_calculation import ReturnCalculator
from .master.customer.service import CustomerService
from .finance.payment.service import PaymentService
from .finance.adjustment_note_calculation import AdjustmentNoteCalculator
from .inventory.inventory_service import InventoryService
from .settings.settings_service import SettingsService, SettingsServiceSync, invalidate_settings_cache

# Core/shared services (remain at top level)
from .document_number_service import DocumentNumberService
from .dashboard_service import DashboardService
from .compliance.gst_service import GSTService  # Moved to compliance/

__all__ = [
    "ReturnCalculator",
    # Master
    "CustomerService",
    # Finance
    "PaymentService",
    "AdjustmentNoteCalculator",
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

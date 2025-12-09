"""
Version 1 API routers for enterprise pharma system
"""
from .customers import router as customers_router
from .orders import router as orders_router
from .inventory import router as inventory_router
from .billing import router as billing_router
from .payments import router as payments_router
from .invoices import router as invoices_router
from .order_items import router as order_items_router
from .users import router as users_router
from .suppliers import router as suppliers_router
from .purchases import router as purchases_router  # Renamed from purchase_enhanced
# delivery_challan.py archived - use challan.py via /enterprise-delivery-challan
from .dashboard import router as dashboard_router
from .stock_adjustments import router as stock_adjustments_router
from .tax_entries import router as tax_entries_router
from .purchase_upload import router as purchase_upload_router
from .purchases import router as purchase_enhanced_router  # Legacy alias
from .sale_returns import router as sale_returns_api_router
from .purchase_returns_enhanced import router as purchase_returns_router  # Use purchase_returns_enhanced
from .stock_movements import router as stock_movements_router
from .ledger import router as party_ledger_router  # Renamed from party_ledger_v2
from .credit_debit_notes import router as credit_debit_notes_router
from .sales import router as sales_router
from .collection_center import router as collection_center_router
from .bank_accounts import router as bank_accounts_router
from .employees import router as employees_router
from .departments import router as departments_router
from .branches import router as branches_router

__all__ = [
    "customers_router", 
    "orders_router", 
    "inventory_router", 
    "billing_router", 
    "payments_router", 
    "invoices_router",
    "order_items_router",
    "users_router", 
    "suppliers_router",
    "purchases_router",
    # "delivery_challan_router",  # Archived - use challan.py
    "dashboard_router",
    "stock_adjustments_router",
    "tax_entries_router",
    "purchase_upload_router",
    "purchase_enhanced_router",
    "sale_returns_api_router",
    "purchase_returns_router",
    "stock_movements_router",
    "party_ledger_router",
    "credit_debit_notes_router",
    "sales_router",
    "collection_center_router",
    "bank_accounts_router",
    "employees_router",
    "departments_router",
    "branches_router"
]
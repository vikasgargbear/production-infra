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
from .purchases import router as purchases_router
from .delivery_challan import router as delivery_challan_router
from .dashboard import router as dashboard_router
from .stock_adjustments import router as stock_adjustments_router
from .tax_entries import router as tax_entries_router
from .purchase_upload import router as purchase_upload_router
from .purchase_enhanced import router as purchase_enhanced_router
from .sale_returns import router as sale_returns_api_router
from .purchase_returns import router as purchase_returns_router
from .stock_movements import router as stock_movements_router
from .party_ledger import router as party_ledger_router
from .credit_debit_notes import router as credit_debit_notes_router
from .sales import router as sales_router
from .enterprise_orders import router as enterprise_orders_router
from .collection_center_simple import router as collection_center_router

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
    "delivery_challan_router",
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
    "enterprise_orders_router",
    "collection_center_router"
]
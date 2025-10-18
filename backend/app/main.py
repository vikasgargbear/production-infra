"""
FastAPI Main Application
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os

# Import routers
from .api.routes import (
    auth_supabase, customers, products_consolidated, sales, inventory, 
    payments, dashboard, billing, api_wrapper
)

# Import additional routers that are actually available
from .api.routes import (
    customers_router, orders_router, inventory_router, billing_router, 
    payments_router, invoices_router, order_items_router, users_router, 
    suppliers_router, purchases_router,  # Removed delivery_challan_router
    dashboard_router, stock_adjustments_router, tax_entries_router,
    purchase_upload_router, purchase_enhanced_router, sale_returns_api_router,
    purchase_returns_router, stock_movements_router, party_ledger_router,
    credit_debit_notes_router, sales_router,
    collection_center_router
)

# Import bank accounts directly
from .api.routes.bank_accounts import router as bank_accounts_router

# Import additional routers not in __init__.py
from .api.routes import stock_receive, enterprise_delivery_challan, inventory_batches, create_user, delivery_challan, stock_dashboard, sales_orders, grn, journal_entries, expense_claims, settings
# Import enhanced purchase returns and supplier invoices
from .api.routes import purchase_returns_enhanced, supplier_invoices
# Import org users APIs
from .api.routes import org_users, org_users_secure, role_management
# Import new APIs
from .api.routes import master_settings, schemes_discounts, loyalty_points, compliance, metadata, master_data_crud
# Import comprehensive enterprise API
from .api.routes import enterprise_api_complete
# Import GST API
from .api.routes import gst
# Import enterprise calculation service
from .api.routes import invoice_calculation, enterprise_calculations
# Import simple company API (no database dependencies)
from .api.routes import company_simple
# Import company API for company profile management
from .api.routes import company
# Import master data API
from .api.routes import master_data
# All temporary endpoints removed - using main endpoints only

# Lifecycle management
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("🚀 Starting Pharma ERP Backend...")
    yield
    # Shutdown
    print("👋 Shutting down...")

# Create FastAPI app
app = FastAPI(
    title="Pharma ERP API",
    description="Enterprise Pharma ERP System API",
    version="2.2.2",  # Fixed auth schema column names
    lifespan=lifespan
)

# Configure CORS - MUST be first middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for now to avoid CORS issues
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers including Content-Type for multipart/form-data
    expose_headers=["*"],
    max_age=3600,
)

# RLS handled by database dependency - no middleware needed

# Disable automatic trailing slash redirects to avoid CORS preflight issues
# This allows both /api/customers and /api/customers/ to work without redirects
app.router.redirect_slashes = False

# Handle OPTIONS requests for CORS preflight
@app.options("/{full_path:path}")
async def options_handler(full_path: str):
    """Handle CORS preflight requests"""
    return {"message": "OK", "status": "preflight_success"}

# Health check endpoint
@app.get("/")
async def root():
    return {
        "message": "Pharma ERP API",
        "version": "2.2.0",
        "status": "healthy",
        "deployment": "settings-api-added",
        "endpoints": {
            "health": "/health",
            "docs": "/docs",
            "api": "/api",
            "purchases": "/api/purchases",
            "purchase-upload": "/api/purchase-upload",
            "bank-accounts": "/api/bank-accounts"
        }
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "pharma-erp-backend",
        "version": "2.0.0"
    }


# Consolidated API prefix - no version numbers
from fastapi import APIRouter
api = APIRouter(prefix="/api")

# Register routes
api.include_router(auth_supabase.router, prefix="/auth", tags=["Authentication"])
api.include_router(customers.router, prefix="/customers", tags=["Customers"])
api.include_router(products_consolidated.router, prefix="/products", tags=["Products"])
api.include_router(sales.router, prefix="/sales", tags=["Sales"])
api.include_router(inventory.router, prefix="/inventory", tags=["Inventory"])
api.include_router(payments.router, prefix="/payments", tags=["Payments"])
api.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
api.include_router(billing.router, prefix="/billing", tags=["Billing"])
api.include_router(company.router, prefix="/company", tags=["Company"])
api.include_router(settings.router, prefix="/settings", tags=["Settings"])
api.include_router(bank_accounts_router, prefix="/bank-accounts", tags=["Bank Accounts"])
# Register additional routes from __init__.py
api.include_router(orders_router, tags=["Orders"])
api.include_router(invoices_router, tags=["Invoices"])
api.include_router(order_items_router, prefix="/order-items", tags=["Order Items"])
api.include_router(users_router, prefix="/users", tags=["Users"])
api.include_router(suppliers_router, prefix="/suppliers", tags=["Suppliers"])
api.include_router(purchases_router, prefix="/purchases", tags=["Purchases"])
api.include_router(dashboard_router, tags=["Dashboard API"])
# Include both - they have different functionality
api.include_router(delivery_challan.router, prefix="/delivery-challan", tags=["Delivery Challan"])
api.include_router(stock_adjustments_router, prefix="/stock-adjustments", tags=["Stock Adjustments"])
api.include_router(tax_entries_router, prefix="/tax-entries", tags=["Tax Entries"])
api.include_router(purchase_upload_router, prefix="/purchase-upload", tags=["Purchase Upload"])
api.include_router(purchase_enhanced_router, prefix="/purchase-enhanced", tags=["Purchase Enhanced"])
api.include_router(sale_returns_api_router, prefix="/sale-returns", tags=["Sale Returns"])
api.include_router(purchase_returns_router, prefix="/purchase-returns", tags=["Purchase Returns"])
api.include_router(purchase_returns_enhanced.router, prefix="/purchase-returns-enhanced", tags=["Purchase Returns Enhanced"])
api.include_router(supplier_invoices.router, prefix="/supplier-invoices", tags=["Supplier Invoices"])
api.include_router(stock_movements_router, prefix="/stock-movements", tags=["Stock Movements"])
api.include_router(party_ledger_router, prefix="/party-ledger", tags=["Party Ledger"])
api.include_router(credit_debit_notes_router, prefix="/credit-debit-notes", tags=["Credit/Debit Notes"])
api.include_router(collection_center_router, prefix="/collection-center", tags=["Collection Center"])
api.include_router(stock_receive.router, prefix="/stock", tags=["Stock Receive"])
api.include_router(enterprise_delivery_challan.router, prefix="/enterprise-delivery-challan", tags=["Enterprise Delivery Challan"])
api.include_router(inventory_batches.router, prefix="/inventory/batches", tags=["Inventory Batches"])
api.include_router(inventory_batches.router, prefix="/stock/batches", tags=["Stock Batches"])
api.include_router(stock_dashboard.router, prefix="/stock-dashboard", tags=["Stock Dashboard"])
api.include_router(create_user.router, prefix="/create-user", tags=["Setup"])
api.include_router(sales_orders.router, tags=["Sales Orders"])
api.include_router(grn.router, prefix="/grn", tags=["Goods Receipt Notes"])
api.include_router(journal_entries.router, prefix="/journal-entries", tags=["Journal Entries"])
api.include_router(expense_claims.router, prefix="/expense-claims", tags=["Expense Claims"])
api.include_router(gst.router, prefix="/gst", tags=["GST"])

# Initial setup route (doesn't require auth)
from .api.routes import initial_setup
api.include_router(initial_setup.router, prefix="/setup", tags=["Setup"])

# Register new APIs
api.include_router(master_settings.router, prefix="/master-settings", tags=["Master Settings"])
api.include_router(schemes_discounts.router, prefix="/schemes-discounts", tags=["Schemes & Discounts"])
api.include_router(loyalty_points.router, prefix="/loyalty-points", tags=["Loyalty Points"])
api.include_router(compliance.router, prefix="/compliance", tags=["Compliance"])
api.include_router(metadata.router, prefix="/metadata", tags=["Metadata"])
api.include_router(master_data_crud.router, tags=["Master Data CRUD"])

# Register comprehensive enterprise API
api.include_router(enterprise_api_complete.router, tags=["Enterprise ERP Complete"])

# Register enterprise calculation service
api.include_router(invoice_calculation.router, tags=["Invoice Calculations"])
api.include_router(enterprise_calculations.router, tags=["Enterprise Calculations"])

# Register simple company API
api.include_router(company_simple.router, tags=["Company"])

# Register master data API
api.include_router(master_data.router, prefix="/master", tags=["Master Data"])

# Register org users APIs
api.include_router(org_users.router, tags=["Organization Users"])
api.include_router(org_users_secure.router, tags=["Secure Organization Users"])
api.include_router(role_management.router, tags=["Role Management"])

# Enterprise tenant service handles security automatically

# Temporary debug endpoint for party ledger - ARCHIVED during cleanup
# from .api.routes import party_ledger_debug
# api.include_router(party_ledger_debug.router, tags=["Debug"])

# Payment allocation and improved ledger
from .api.routes import payment_allocation, party_ledger_v2
api.include_router(payment_allocation.router, tags=["Payment Allocation"])
api.include_router(party_ledger_v2.router, tags=["Party Ledger V2"])

# Customer Outstanding API with net position
from .api.routes import customer_outstanding
api.include_router(customer_outstanding.router, tags=["Customer Outstanding"])

# All endpoints consolidated - no temporary workarounds

# Include the PostgreSQL function wrappers
api.include_router(api_wrapper.router, prefix="/pg", tags=["PostgreSQL Functions"])

# Include the consolidated API
app.include_router(api)

# Test routes removed - using main endpoints only

# Migration routes removed after successful deployment

# Debug endpoints moved to archive - uncomment if needed for debugging
# from .api.routes import debug_invoice, database_fix, table_inspector, create_fixed_triggers
# app.include_router(debug_invoice.router)
# app.include_router(database_fix.router)
# app.include_router(table_inspector.router)
# app.include_router(create_fixed_triggers.router)

# No v1 routes - everything is consolidated under /api/

# PostgreSQL function wrapper endpoints
# Since frontend expects REST but backend has PostgreSQL functions
# We'll create wrapper endpoints
@api.get("/test-connection")
async def test_connection():
    """Test if backend is properly connected"""
    return {
        "status": "connected",
        "message": "Backend is running and accessible",
        "timestamp": "2024-01-15T12:00:00Z"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
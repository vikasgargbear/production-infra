"""
FastAPI Main Application
Reorganized with domain-based folder structure
"""
from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

# =============================================================================
# DOMAIN-BASED IMPORTS - Organized by module
# =============================================================================

# Auth Module
from .api.routes.auth import enterprise as auth_enterprise
from .api.routes.auth import oauth as auth_oauth
from .api.routes.auth import users
from .api.routes.auth import roles as role_management

# Master Data Module
from .api.routes.master import customers
from .api.routes.master import suppliers
from .api.routes.master import products
from .api.routes.master import branches
from .api.routes.master import departments
from .api.routes.master import employees
from .api.routes.master import bank_accounts

# Sales Module (modular structure)
from .api.routes.sales import (
    orders_router,
    invoices_router,
    challan_router,
    conversions_router,
)

# Returns Module (top-level, handles both sales and purchase returns)
from .api.routes.returns import sales_returns_router, purchase_returns_router

# Purchase Module
from .api.routes.purchase import orders as purchases
from .api.routes.purchase import supplier_invoices
from .api.routes.purchase import grn
from .api.routes.purchase import upload as purchase_upload

# Inventory Module
from .api.routes.inventory import stock as inventory
from .api.routes.inventory import adjustments as stock_adjustments
from .api.routes.inventory import movements as stock_movements
from .api.routes.inventory import receive as stock_receive
from .api.routes.inventory import writeoff as stock_writeoff
from .api.routes.inventory import dashboard as stock_dashboard

# Finance Module
from .api.routes.finance import payments
from .api.routes.finance import allocation as payment_allocation
from .api.routes.finance import ledger
from .api.routes.finance import journal as journal_entries
from .api.routes.finance import tax as tax_entries
from .api.routes.finance import credit_notes as credit_debit_notes
from .api.routes.finance import expenses as expense_claims

# Compliance Module
from .api.routes.compliance import gst
from .api.routes.compliance import compliance

# Reports Module (formerly Analytics)
from .api.routes.reports import dashboard
from .api.routes.reports import collection as collection_center
from .api.routes.reports import outstanding as customer_outstanding

# Organization Module
from .api.routes.org import company
from .api.routes.org import initial_setup

# Settings (already in folder)
from .api.routes.settings import router as settings_router

# Offline Sync
from .api.routes import sync as sync_router

# Standalone utilities (remain at root level)
from .api.routes import metadata
# from .api.routes import enterprise_calculations  # REMOVED: Moved to api/shared/calculations.py
# from .api.routes import schemes_discounts  # REMOVED: Moved to api/shared/discounts.py
from .api.routes import loyalty_points
from .api.routes import documents
from .api.routes import schema as schema_router  # Live database schema documentation
# from .api.routes import conversions  # REMOVED: File deleted
# from .api.routes import api_wrapper  # REMOVED: File deleted  
# from .api.routes import enterprise_api_complete  # REMOVED: File deleted

# =============================================================================
# APPLICATION SETUP
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Starting Pharma ERP Backend...")
    yield
    print("👋 Shutting down...")

app = FastAPI(
    title="Pharma ERP API",
    description="Enterprise Pharma ERP System API",
    version="3.0.0",  # Major version bump for folder restructure
    lifespan=lifespan
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

# Enable redirect_slashes so /batches/ redirects to /batches
# This prevents 405 errors from trailing slash mismatches
app.router.redirect_slashes = True

# REMOVED: Custom OPTIONS handler - let CORS middleware handle it
# The custom handler was returning JSON without CORS headers, causing CORS failures
# FastAPI's CORSMiddleware automatically handles OPTIONS requests properly

@app.get("/")
async def root():
    return {
        "message": "Pharma ERP API",
        "version": "3.0.0",
        "status": "healthy",
        "structure": "domain-based-folders"
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "pharma-erp-backend", "version": "3.0.0"}

# =============================================================================
# API ROUTER REGISTRATION
# =============================================================================

api = APIRouter(prefix="/api")

# --- Auth ---
api.include_router(auth_enterprise.router, tags=["Authentication"])
api.include_router(auth_oauth.router, tags=["OAuth"])
api.include_router(users.router, tags=["Users"])
api.include_router(role_management.router, tags=["Role Management"])

# --- Master Data ---
api.include_router(customers.router, prefix="/customers", tags=["Customers"])
api.include_router(suppliers.router, prefix="/suppliers", tags=["Suppliers"])
api.include_router(products.router, prefix="/products", tags=["Products"])
api.include_router(branches.router, prefix="/branches", tags=["Branches"])
api.include_router(departments.router, prefix="/departments", tags=["Departments"])
api.include_router(employees.router, prefix="/employees", tags=["Employees"])
api.include_router(bank_accounts.router, prefix="/bank-accounts", tags=["Bank Accounts"])

# --- Sales ---
api.include_router(orders_router, tags=["Sales Orders"])
api.include_router(invoices_router, tags=["Invoices"])
api.include_router(challan_router, prefix="/challan", tags=["Challan"])
api.include_router(conversions_router, prefix="/conversions", tags=["Conversions"])

# --- Returns (Sales & Purchase) ---
api.include_router(sales_returns_router, prefix="/sale-returns", tags=["Sale Returns"])
api.include_router(purchase_returns_router, prefix="/purchase-returns", tags=["Purchase Returns"])

# --- Purchase ---
api.include_router(purchases.router, prefix="/purchases", tags=["Purchases"])
api.include_router(supplier_invoices.router, prefix="/supplier-invoices", tags=["Supplier Invoices"])
api.include_router(grn.router, prefix="/grn", tags=["Goods Receipt Notes"])
api.include_router(purchase_upload.router, prefix="/purchase-upload", tags=["Purchase Upload"])

# --- Inventory ---
api.include_router(inventory.router, prefix="/inventory", tags=["Inventory"])
api.include_router(stock_adjustments.router, prefix="/stock-adjustments", tags=["Stock Adjustments"])
api.include_router(stock_movements.router, prefix="/stock-movements", tags=["Stock Movements"])
api.include_router(stock_receive.router, prefix="/stock", tags=["Stock Receive"])
api.include_router(stock_writeoff.router, tags=["Stock Write-off"])
api.include_router(stock_dashboard.router, prefix="/stock-dashboard", tags=["Stock Dashboard"])

# --- Finance ---
api.include_router(payments.router, prefix="/payments", tags=["Payments"])
api.include_router(payment_allocation.router, tags=["Payment Allocation"])
api.include_router(ledger.router, tags=["Ledger"])
api.include_router(journal_entries.router, prefix="/journal-entries", tags=["Journal Entries"])
api.include_router(tax_entries.router, prefix="/tax-entries", tags=["Tax Entries"])
api.include_router(credit_debit_notes.router, prefix="/credit-debit-notes", tags=["Credit/Debit Notes"])
api.include_router(expense_claims.router, prefix="/expense-claims", tags=["Expense Claims"])

# --- Compliance ---
api.include_router(gst.router, prefix="/gst", tags=["GST"])
api.include_router(compliance.router, prefix="/compliance", tags=["Compliance"])

# --- Analytics ---
api.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
api.include_router(collection_center.router, prefix="/collection-center", tags=["Collection Center"])
api.include_router(customer_outstanding.router, tags=["Customer Outstanding"])

# --- Organization ---
api.include_router(company.router, prefix="/company", tags=["Company"])
api.include_router(initial_setup.router, prefix="/setup", tags=["Setup"])

# --- Settings ---
api.include_router(settings_router, prefix="/settings", tags=["Settings"])

# --- Offline Sync ---
api.include_router(sync_router.router, tags=["Offline Sync"])

# --- Utilities ---
api.include_router(documents.router, tags=["Documents"])
api.include_router(metadata.router, prefix="/metadata", tags=["Metadata"])
# api.include_router(schemes_discounts.router, prefix="/schemes-discounts", tags=["Schemes & Discounts"])  # REMOVED: Moved to shared
api.include_router(loyalty_points.router, prefix="/loyalty-points", tags=["Loyalty Points"])
# api.include_router(conversions.router, tags=["Document Conversions"])  # DISABLED: Module removed
# api.include_router(enterprise_calculations.router, tags=["Enterprise Calculations"])  # REMOVED: Moved to shared
api.include_router(schema_router.router, tags=["Schema Documentation"])  # Live database schema
# api.include_router(enterprise_api_complete.router, tags=["Enterprise ERP Complete"])  # DISABLED: Module removed
# api.include_router(api_wrapper.router, prefix="/pg", tags=["PostgreSQL Functions"])  # DISABLED: Module removed

@api.get("/test-connection")
async def test_connection():
    return {"status": "connected", "message": "Backend is running"}

app.include_router(api)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

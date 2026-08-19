"""
FastAPI Main Application
Reorganized with domain-based folder structure
"""
import asyncio
import os
from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from sqlalchemy import text
from starlette.concurrency import run_in_threadpool

from .core.database import engine
from .core.logging_config import setup_logging
from .core.env import get_app_env, is_production, is_test_mode_enabled
from .core.api_contract import install_operation_registry
from .middleware.error_handler import global_exception_handler
from .middleware.security_headers import SecurityHeadersMiddleware
from .middleware.request_logger import RequestLoggerMiddleware

# =============================================================================
# DOMAIN-BASED IMPORTS - Organized by module
# =============================================================================

# Auth Module
from .api.routes.auth import enterprise as auth_enterprise
from .api.routes.auth import oauth as auth_oauth
from .api.routes.auth import users
from .api.routes.auth import roles as role_management

# Audit Module
from .api.routes.audit import audit_router

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
from .api.routes.inventory import writeoff as stock_writeoff

# Finance Module
from .api.routes.finance import payments
from .api.routes.finance import allocation as payment_allocation
from .api.routes.finance import ledger
from .api.routes.finance import journal as journal_entries
from .api.routes.finance import tax as tax_entries
from .api.routes.finance import credit_notes as credit_debit_notes
from .api.routes.finance import expenses as expense_claims

# Payroll Module
from .api.routes.payroll import (
    salary_structure_router,
    leave_policy_router,
    attendance_router,
    leave_router,
    payroll_run_router,
    salary_slips_router,
)

# Compliance Module
from .api.routes.compliance import gst
from .api.routes.compliance import gstr2b
from .api.routes.compliance import compliance

# Reports Module (formerly Analytics)
from .api.routes.reports import dashboard
from .api.routes.reports import collection as collection_center
from .api.routes.reports import outstanding as customer_outstanding

# Organization Module
from .api.routes.org import company

# Settings (already in folder)
from .api.routes.settings import router as settings_router

# Offline Sync
from .api.routes import sync as sync_router

# Standalone utilities (remain at root level)
from .api.routes import metadata
from .api.routes import calculations
from .api.routes.loyalty import router as loyalty_router
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
    # Initialize structured logging before anything else
    setup_logging()

    import logging
    logger = logging.getLogger(__name__)

    # SECURITY: Block TEST_MODE in production at startup
    env = get_app_env()
    if is_production() and is_test_mode_enabled():
        raise RuntimeError(
            "SECURITY ERROR: TEST_MODE=true is not allowed in production! "
            "Remove TEST_MODE env var or set APP_ENV/ENV=development."
        )

    if is_production():
        required = ("SUPABASE_URL", "SUPABASE_ANON_KEY", "CORS_ORIGINS", "APP_URL")
        missing = [name for name in required if not os.getenv(name, "").strip()]
        if missing:
            raise RuntimeError(
                "Missing required production configuration: " + ", ".join(missing)
            )

    logger.info("Starting Pharma ERP Backend...")
    yield
    logger.info("Shutting down...")

app = FastAPI(
    title="Pharma ERP API",
    description="Enterprise Pharma ERP System API",
    version="3.0.0",  # Major version bump for folder restructure
    lifespan=lifespan
)

# =============================================================================
# MIDDLEWARE STACK (order matters: last added = first executed)
# =============================================================================

# Global exception handler (catch-all for unhandled errors)
app.add_exception_handler(Exception, global_exception_handler)

# Security headers (X-Frame-Options, HSTS, etc.)
app.add_middleware(SecurityHeadersMiddleware)

# Request logging with correlation IDs
app.add_middleware(RequestLoggerMiddleware)

# CORS Configuration — env-based whitelist in production
_cors_origins_env = os.getenv("CORS_ORIGINS", "")
if _cors_origins_env:
    _allowed_origins = [o.strip() for o in _cors_origins_env.split(",") if o.strip()]
else:
    # Development fallback
    _allowed_origins = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]

if "*" in _allowed_origins:
    raise RuntimeError("CORS_ORIGINS cannot contain '*' when credentials are enabled")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Request-ID",
        "X-Idempotency-Key",
    ],
    expose_headers=[
        "X-Request-ID",
        "X-Idempotency-Key",
        "X-Idempotency-Replayed",
    ],
    max_age=3600,
)

# Disable redirect_slashes to prevent 307 redirects that break CORS
# 307 redirects during preflight OPTIONS requests fail CORS validation
app.router.redirect_slashes = False

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


READINESS_TIMEOUT_SECONDS = 5.0


def _database_is_ready() -> bool:
    with engine.connect() as connection:
        return connection.execute(text("SELECT 1")).scalar_one() == 1


@app.get("/ready", include_in_schema=False)
async def readiness_check():
    try:
        ready = await asyncio.wait_for(
            run_in_threadpool(_database_is_ready),
            timeout=READINESS_TIMEOUT_SECONDS,
        )
    except Exception:
        return JSONResponse(status_code=503, content={"status": "not_ready"})

    if not ready:
        return JSONResponse(status_code=503, content={"status": "not_ready"})
    return {"status": "ready"}

# =============================================================================
# API ROUTER REGISTRATION
# =============================================================================

api = APIRouter(prefix="/api")

# --- Auth ---
api.include_router(auth_enterprise.router, tags=["Authentication"])
api.include_router(auth_oauth.router, tags=["OAuth"])
api.include_router(users.router, tags=["Users"])
api.include_router(role_management.router, tags=["Role Management"])

# --- Audit ---
api.include_router(audit_router, tags=["Audit Trail"])

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
api.include_router(stock_writeoff.router, tags=["Stock Write-off"])

# --- Finance ---
api.include_router(payments.router, prefix="/payments", tags=["Payments"])
api.include_router(payment_allocation.router, tags=["Payment Allocation"])
api.include_router(ledger.router, tags=["Ledger"])
api.include_router(journal_entries.router, prefix="/journal-entries", tags=["Journal Entries"])
api.include_router(tax_entries.router, prefix="/tax-entries", tags=["Tax Entries"])
api.include_router(credit_debit_notes.router, prefix="/credit-debit-notes", tags=["Credit/Debit Notes"])
api.include_router(expense_claims.router, prefix="/expense-claims", tags=["Expense Claims"])

# --- Payroll ---
api.include_router(salary_structure_router, prefix="/payroll/salary-structures", tags=["Payroll"])
api.include_router(leave_policy_router, prefix="/payroll/leave-policies", tags=["Payroll"])
api.include_router(attendance_router, prefix="/payroll/attendance", tags=["Payroll"])
api.include_router(leave_router, prefix="/payroll/leave", tags=["Payroll"])
api.include_router(payroll_run_router, prefix="/payroll", tags=["Payroll"])
api.include_router(salary_slips_router, prefix="/payroll/slips", tags=["Payroll"])

# --- Compliance ---
api.include_router(gst.router, prefix="/gst", tags=["GST"])
api.include_router(gstr2b.router, prefix="/gst", tags=["GST"])
api.include_router(compliance.router, prefix="/compliance", tags=["Compliance"])

# --- Analytics ---
api.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
api.include_router(collection_center.router, prefix="/collection-center", tags=["Collection Center"])
api.include_router(customer_outstanding.router, tags=["Customer Outstanding"])

# --- Organization ---
api.include_router(company.router, prefix="/company", tags=["Company"])

# --- Settings ---
api.include_router(settings_router, prefix="/settings", tags=["Settings"])

# --- Offline Sync ---
api.include_router(sync_router.router, tags=["Offline Sync"])

# --- Utilities ---
api.include_router(documents.router, tags=["Documents"])
api.include_router(metadata.router, prefix="/metadata", tags=["Metadata"])
api.include_router(calculations.router)
api.include_router(loyalty_router, prefix="/loyalty", tags=["Loyalty Points"])
# api.include_router(conversions.router, tags=["Document Conversions"])  # DISABLED: Module removed
api.include_router(schema_router.router, tags=["Schema Documentation"])  # Live database schema

if not is_production():
    from .api.routes import test_routes  # TEST MODE verification
    api.include_router(test_routes.router, tags=["Testing"])
# api.include_router(enterprise_api_complete.router, tags=["Enterprise ERP Complete"])  # DISABLED: Module removed
# api.include_router(api_wrapper.router, prefix="/pg", tags=["PostgreSQL Functions"])  # DISABLED: Module removed

app.include_router(api)

# Attach the reviewed external-operation allowlist after all routes are mounted.
# This publishes policy metadata only; it does not implement an MCP transport.
install_operation_registry(app)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

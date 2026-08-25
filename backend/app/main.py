"""
FastAPI Main Application
Reorganized with domain-based folder structure
"""
import asyncio
import os
from fastapi import FastAPI, APIRouter
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from sqlalchemy import text
from starlette.concurrency import run_in_threadpool

from .core.database import engine
from .core.logging_config import setup_logging
from .core.env import get_app_env, is_production, is_test_mode_enabled
from .core.api_contract import install_operation_registry
from .core.read_only_router import (
    include_explicit_non_persistent_post_utilities,
    include_legacy_read_only_router,
)
from .middleware.error_handler import global_exception_handler
from .middleware.security_headers import SecurityHeadersMiddleware
from .middleware.request_logger import RequestLoggerMiddleware
from .middleware.global_cors import GlobalCORSEnabledFastAPI

# =============================================================================
# DOMAIN-BASED IMPORTS - Organized by module
# =============================================================================

# Auth Module
from .api.routes.auth import enterprise as auth_enterprise
from .api.routes.auth import oauth as auth_oauth

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
from .api.routes.purchase.upload import routes as purchase_upload_routes
from .api.routes import canonical_inventory_transfers

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
from .api.routes.finance.tax import routes as tax_entries_routes
from .api.routes.finance import credit_notes as credit_debit_notes
from .api.routes.finance import expenses as expense_claims

# Compliance Module
from .api.routes.compliance import gst
from .api.routes.compliance import gstr2b
from .api.routes.compliance import compliance

# Reports Module (formerly Analytics)
from .api.routes.reports import dashboard
from .api.routes.reports import collection as collection_center
from .api.routes.reports import outstanding as customer_outstanding

# Organization Module
from .api.routes.org import company_assets

# Standalone utilities (remain at root level)
from .api.routes import metadata
from .api.routes import calculations
from .api.routes import documents
from .api.routes import schema as schema_router  # Live database schema documentation
from .api.routes import (
    canonical_erp_reads,
    canonical_sales_chain_reads,
    canonical_goods_receipts,
    canonical_purchase_order_reads,
    canonical_return_reads,
    canonical_supplier_invoice_reads,
    canonical_supplier_payment_reads,
    canonical_payment_history_reads,
    canonical_party_ledger_reads,
    canonical_document_history_reads,
    canonical_inventory_reads,
    canonical_adjustment_note_reads,
)
from .api.routes import web_operator_actions
from .api.routes.internal import (
    mcp_actions,
    mcp_agent_grants,
    mcp_canonical_reads,
    mcp_canonical_resolution_reads,
    tax_provider,
)
from .infrastructure.operator_actions import install_sqlalchemy_operator_action_service
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
    install_sqlalchemy_operator_action_service()

    import logging
    logger = logging.getLogger(__name__)

    # SECURITY: Block TEST_MODE in production at startup
    env = get_app_env()
    if is_production() and is_test_mode_enabled():
        raise RuntimeError(
            "SECURITY ERROR: TEST_MODE=true is not allowed in production! "
            "Remove TEST_MODE env var or set APP_ENV=development."
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

app = GlobalCORSEnabledFastAPI(
    title="Pharma ERP API",
    description="Enterprise Pharma ERP System API",
    version="3.0.0",  # Major version bump for folder restructure
    lifespan=lifespan,
    global_cors_options={
        "allow_origins": _allowed_origins,
        "allow_credentials": True,
        "allow_methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        "allow_headers": [
            "Authorization",
            "Content-Type",
            "X-Request-ID",
            "X-Idempotency-Key",
            "X-Connection-Check",
        ],
        "expose_headers": [
            "X-Request-ID",
            "X-Idempotency-Key",
            "X-Idempotency-Replayed",
        ],
        "max_age": 3600,
    },
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
api.include_router(mcp_agent_grants.router)
api.include_router(mcp_canonical_reads.router)
api.include_router(mcp_canonical_resolution_reads.router)
api.include_router(mcp_actions.router)
api.include_router(web_operator_actions.router)
api.include_router(tax_provider.router)

# --- Audit ---
api.include_router(audit_router, tags=["Audit Trail"])

# Register canonical compatibility before legacy routes with overlapping paths.
api.include_router(canonical_erp_reads.router, tags=["Canonical ERP Reads"])
api.include_router(canonical_sales_chain_reads.router, tags=["Canonical Sales Chain Reads"])
api.include_router(canonical_purchase_order_reads.router)
api.include_router(canonical_goods_receipts.router, tags=["Canonical Goods Receipts"])
api.include_router(canonical_supplier_invoice_reads.router)
api.include_router(canonical_return_reads.router)
api.include_router(canonical_supplier_payment_reads.router)
api.include_router(canonical_payment_history_reads.router)
api.include_router(canonical_inventory_reads.router, tags=["Canonical Inventory Reads"])
api.include_router(canonical_adjustment_note_reads.router)
api.include_router(canonical_inventory_transfers.router, tags=["Canonical Inventory Transfers"])
include_legacy_read_only_router(api, canonical_party_ledger_reads.router)
api.include_router(canonical_document_history_reads.router)

# --- Master Data ---
# Bounded canonical product/customer/supplier/address mutations were registered
# above by canonical_erp_reads.  Only the later legacy master reads survive.
include_legacy_read_only_router(api, customers.router, prefix="/customers", tags=["Customers"])
include_legacy_read_only_router(api, suppliers.router, prefix="/suppliers", tags=["Suppliers"])
include_legacy_read_only_router(api, products.router, prefix="/products", tags=["Products"])
include_legacy_read_only_router(api, branches.router, prefix="/branches", tags=["Branches"])
include_legacy_read_only_router(api, departments.router, prefix="/departments", tags=["Departments"])
include_legacy_read_only_router(api, employees.router, prefix="/employees", tags=["Employees"])
include_legacy_read_only_router(api, bank_accounts.router, prefix="/bank-accounts", tags=["Bank Accounts"])

# --- Retired legacy business routers: reads only ---
# Canonical business writes are available only through /web/actions.  Keeping
# this fence at registration time prevents an unused legacy frontend method or
# a direct API caller from bypassing reviewed prepare/approve/execute commands.

# --- Sales ---
include_legacy_read_only_router(api, orders_router, tags=["Sales Orders"])
include_legacy_read_only_router(api, invoices_router, tags=["Invoices"])
include_legacy_read_only_router(api, challan_router, prefix="/challan", tags=["Challan"])
include_legacy_read_only_router(api, conversions_router, prefix="/conversions", tags=["Conversions"])

# --- Returns (Sales & Purchase) ---
include_legacy_read_only_router(api, sales_returns_router, prefix="/sale-returns", tags=["Sale Returns"])
include_legacy_read_only_router(api, purchase_returns_router, prefix="/purchase-returns", tags=["Purchase Returns"])

# --- Purchase ---
include_legacy_read_only_router(api, purchases.router, prefix="/purchases", tags=["Purchases"])
include_legacy_read_only_router(api, supplier_invoices.router, prefix="/supplier-invoices", tags=["Supplier Invoices"])
include_legacy_read_only_router(api, grn.router, prefix="/grn", tags=["Goods Receipt Notes"])
include_legacy_read_only_router(api, purchase_upload.router, prefix="/purchase-upload", tags=["Purchase Upload"])
include_explicit_non_persistent_post_utilities(
    api,
    purchase_upload.router,
    prefix="/purchase-upload",
    tags=["Purchase Upload"],
    routes={
        "/parse-invoice-safe": purchase_upload_routes.parse_purchase_invoice_safe,
        "/validate-invoice": purchase_upload_routes.validate_invoice_data,
    },
)

# --- Inventory ---
include_legacy_read_only_router(api, inventory.router, prefix="/inventory", tags=["Inventory"])
include_legacy_read_only_router(api, stock_adjustments.router, prefix="/stock-adjustments", tags=["Stock Adjustments"])
include_legacy_read_only_router(api, stock_movements.router, prefix="/stock-movements", tags=["Stock Movements"])
include_legacy_read_only_router(api, stock_writeoff.router, tags=["Stock Write-off"])

# --- Finance ---
include_legacy_read_only_router(api, payments.router, prefix="/payments", tags=["Payments"])
include_legacy_read_only_router(api, payment_allocation.router, tags=["Payment Allocation"])
api.include_router(ledger.router, tags=["Ledger"])
include_legacy_read_only_router(api, journal_entries.router, prefix="/journal-entries", tags=["Journal Entries"])
include_legacy_read_only_router(api, tax_entries.router, prefix="/tax-entries", tags=["Tax Entries"])
include_explicit_non_persistent_post_utilities(
    api,
    tax_entries.router,
    prefix="/tax-entries",
    tags=["Tax Entries"],
    routes={"/calculate": tax_entries_routes.calculate_tax},
)
include_legacy_read_only_router(api, credit_debit_notes.router, prefix="/credit-debit-notes", tags=["Credit/Debit Notes"])
include_legacy_read_only_router(api, expense_claims.router, prefix="/expense-claims", tags=["Expense Claims"])

# --- Compliance ---
include_legacy_read_only_router(api, gst.router, prefix="/gst", tags=["GST"])
include_explicit_non_persistent_post_utilities(
    api,
    gst.router,
    prefix="/gst",
    tags=["GST"],
    routes={"/calculate": gst.calculate_gst},
)
include_legacy_read_only_router(api, gstr2b.router, prefix="/gst", tags=["GST"])
include_legacy_read_only_router(api, compliance.router, prefix="/compliance", tags=["Compliance"])

# --- Analytics ---
api.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
# Aging and collection dashboards remain readable. Communication, campaign,
# and payment-recording side effects require reviewed operator commands.
include_legacy_read_only_router(api, collection_center.router, prefix="/collection-center", tags=["Collection Center"])
api.include_router(customer_outstanding.router, tags=["Customer Outstanding"])

# --- Organization ---
# Canonical company profile reads are mounted by canonical_erp_reads above.
# This narrow router preserves the asset read boundary while all company
# mutations remain fail-closed until reviewed core commands are available.
api.include_router(company_assets.router, prefix="/company", tags=["Company"])

# --- Settings ---
# Canonical feature settings are mounted by canonical_erp_reads. Legacy nested
# business-setting projections are deliberately not mounted: their behavior
# differs across FastAPI router implementations and they are not authoritative.

# --- Utilities ---
include_legacy_read_only_router(api, documents.router, tags=["Documents"])
api.include_router(metadata.router, prefix="/metadata", tags=["Metadata"])
include_explicit_non_persistent_post_utilities(
    api,
    calculations.router,
    routes={
        "/calculations/invoice": calculations.preview_invoice_totals,
        "/calculations/sales-order": calculations.preview_sales_order_totals,
        "/calculations/purchase-order": calculations.preview_purchase_order_totals,
        "/calculations/challan": calculations.preview_challan_totals,
        "/calculations/return": calculations.preview_return_totals,
        "/calculations/note": calculations.preview_note_totals,
    },
)
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

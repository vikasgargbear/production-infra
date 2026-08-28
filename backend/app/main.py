"""
FastAPI Main Application
Reorganized with domain-based folder structure
"""
import asyncio
import os
from typing import Optional
from fastapi import FastAPI, APIRouter
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from sqlalchemy import text
from starlette.concurrency import run_in_threadpool

from .core.database import (
    DATABASE_CONNECTION_MODE,
    DATABASE_TRANSPORT_REQUIREMENT,
    DATABASE_URL,
    attest_database_transport,
    engine,
    validate_required_database_peers,
)
from .core.logging_config import setup_logging
from .core.env import get_app_env, is_production, is_test_mode_enabled
from .core.api_contract import install_operation_registry
from .core.read_only_router import (
    include_explicit_non_persistent_post_utilities,
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
from .api.routes.auth import onboarding as auth_onboarding

# Purchase Module
from .api.routes.purchase import upload as purchase_upload
from .api.routes.purchase.upload import routes as purchase_upload_routes
from .api.routes import canonical_inventory_transfers

# Organization Module
from .api.routes.org import company_assets

# Standalone utilities (remain at root level)
from .api.routes import calculations
from .api.routes import schema as schema_router  # Live database schema documentation
from .api.routes import (
    canonical_erp_reads,
    canonical_sales_chain_reads,
    canonical_goods_receipts,
    canonical_purchase_order_reads,
    canonical_return_reads,
    canonical_supplier_invoice_reads,
    canonical_supplier_payment_reads,
    canonical_supplier_advance_reads,
    canonical_payment_history_reads,
    canonical_customer_receipt_reads,
    canonical_party_ledger_reads,
    canonical_document_history_reads,
    canonical_inventory_reads,
    canonical_adjustment_note_reads,
    canonical_controlled_operation_reads,
    canonical_reference_reads,
    canonical_evidence_uploads,
)
from .api.routes import web_operator_actions
from .api.routes.internal import (
    mcp_actions,
    mcp_agent_grants,
    mcp_canonical_reads,
    mcp_canonical_resolution_reads,
    mcp_master_commands,
    tax_provider,
)
from .infrastructure.operator_actions import install_sqlalchemy_operator_action_service
from .infrastructure.operator_actions.calculator_database import (
    dispose_calculator_engine,
)
from .infrastructure.tax_provider import dispose_tax_provider_engine

# =============================================================================
# APPLICATION SETUP
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize structured logging before anything else
    setup_logging()

    import logging
    logger = logging.getLogger(__name__)

    try:
        install_sqlalchemy_operator_action_service()

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
    finally:
        logger.info("Shutting down...")
        try:
            dispose_calculator_engine()
        finally:
            try:
                dispose_tax_provider_engine()
            finally:
                engine.dispose()

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

def _deployed_git_commit() -> Optional[str]:
    """Return the immutable build identity supplied by a supported platform."""

    for variable_name in ("RENDER_GIT_COMMIT", "RAILWAY_GIT_COMMIT_SHA"):
        value = os.getenv(variable_name, "").strip().lower()
        if len(value) == 40 and all(
            character in "0123456789abcdef" for character in value
        ):
            return value
    return None


@app.get("/")
async def root():
    return {
        "message": "Pharma ERP API",
        "version": "3.0.0",
        "status": "healthy",
        "structure": "domain-based-folders",
        "git_commit": _deployed_git_commit(),
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "pharma-erp-backend",
        "version": "3.0.0",
        "git_commit": _deployed_git_commit(),
    }


READINESS_TIMEOUT_SECONDS = 5.0


def _database_readiness() -> dict:
    validate_required_database_peers()
    with engine.connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT current_user AS principal,
                       role.rolsuper,
                       role.rolbypassrls,
                       pg_has_role(
                           current_user,
                           'erp_migration_owner',
                           'MEMBER'
                       ) AS migration_owner_member,
                       pg_has_role(
                           current_user,
                           'erp_app',
                           'USAGE'
                       ) AS command_authority,
                       pg_catalog.to_regrole('erp_session_authority') IS NOT NULL
                         AS session_role_exists,
                       CASE
                         WHEN pg_catalog.to_regrole('erp_session_authority') IS NULL
                           THEN false
                         ELSE pg_has_role(
                           current_user,
                           pg_catalog.to_regrole('erp_session_authority'),
                           'USAGE'
                         )
                       END AS session_authority,
                       current_setting('row_security') = 'on' AS row_security
                  FROM pg_catalog.pg_roles AS role
                 WHERE role.rolname=current_user
                """
            )
        ).mappings().one()

    principal_isolated = (
        row["principal"] == "erp_runtime"
        and not bool(row["rolsuper"])
        and not bool(row["rolbypassrls"])
        and not bool(row["migration_owner_member"])
    )
    row_security = bool(row["row_security"])
    transport_receipt = attest_database_transport(
        DATABASE_URL,
        DATABASE_TRANSPORT_REQUIREMENT,
    )
    required_ip_version = transport_receipt["ip_version"]
    if required_ip_version is not None and not (principal_isolated and row_security):
        raise RuntimeError(
            f"required direct IPv{required_ip_version} database transport is not ready"
        )

    return {
        "transport": DATABASE_CONNECTION_MODE,
        "principal": row["principal"],
        "principal_isolated": principal_isolated,
        "migration_owner_member": bool(row["migration_owner_member"]),
        "command_authority": bool(row["command_authority"]),
        "session_role_exists": bool(row["session_role_exists"]),
        "session_authority": bool(row["session_authority"]),
        "row_security": row_security,
        "ip_version": required_ip_version,
    }


@app.get("/ready", include_in_schema=False)
async def readiness_check():
    try:
        ready = await asyncio.wait_for(
            run_in_threadpool(_database_readiness),
            timeout=READINESS_TIMEOUT_SECONDS,
        )
    except Exception:
        return JSONResponse(status_code=503, content={"status": "not_ready"})

    if not ready:
        return JSONResponse(status_code=503, content={"status": "not_ready"})
    authority_open = (
        ready["principal_isolated"]
        and ready["command_authority"]
        and ready["session_role_exists"]
        and ready["session_authority"]
    )
    if not authority_open:
        return JSONResponse(
            status_code=503,
            content={"status": "maintenance", "database": ready},
        )
    return {"status": "ready", "database": ready}

# =============================================================================
# API ROUTER REGISTRATION
# =============================================================================

api = APIRouter(prefix="/api")

# --- Auth ---
api.include_router(auth_enterprise.router, tags=["Authentication"])
api.include_router(auth_oauth.router, tags=["OAuth"])
api.include_router(auth_onboarding.router)
api.include_router(mcp_agent_grants.router)
api.include_router(mcp_canonical_reads.router)
api.include_router(mcp_canonical_resolution_reads.router)
api.include_router(mcp_master_commands.router)
api.include_router(mcp_actions.router)
api.include_router(web_operator_actions.router)
api.include_router(tax_provider.router)

# Register canonical compatibility before legacy routes with overlapping paths.
api.include_router(canonical_erp_reads.router, tags=["Canonical ERP Reads"])
api.include_router(canonical_sales_chain_reads.router, tags=["Canonical Sales Chain Reads"])
api.include_router(canonical_purchase_order_reads.router)
api.include_router(canonical_goods_receipts.router, tags=["Canonical Goods Receipts"])
api.include_router(canonical_supplier_invoice_reads.router)
api.include_router(canonical_return_reads.router)
api.include_router(canonical_supplier_payment_reads.router)
api.include_router(canonical_supplier_advance_reads.router)
api.include_router(canonical_payment_history_reads.router)
api.include_router(canonical_customer_receipt_reads.router)
api.include_router(canonical_inventory_reads.router, tags=["Canonical Inventory Reads"])
api.include_router(canonical_adjustment_note_reads.router)
api.include_router(canonical_controlled_operation_reads.router)
api.include_router(canonical_inventory_transfers.router, tags=["Canonical Inventory Transfers"])
api.include_router(canonical_party_ledger_reads.router)
api.include_router(canonical_document_history_reads.router)
api.include_router(canonical_reference_reads.router, tags=["Canonical Reference Reads"])
api.include_router(canonical_evidence_uploads.router)

# --- Master Data ---
# Canonical product/customer/supplier/address mutations and every supported
# master read are registered by canonical_erp_reads above.  The retired master
# routers are intentionally absent: their integer details, aliases, and
# guessed account balances are not valid compatibility authorities.

# --- Retired legacy business routers: reads only ---
# Canonical business writes are available only through /web/actions.  Keeping
# this fence at registration time prevents an unused legacy frontend method or
# a direct API caller from bypassing reviewed prepare/approve/execute commands.

# Sales lists, UUID details, import contexts, acceptance readbacks and document
# history are provided by the canonical routers above.  The retired integer-ID
# sales routers are deliberately not mounted.

# Return eligibility, reasons, reviewed lifecycle, history, and posted readback
# are exposed only through canonical UUID resources above.  The retired
# integer-ID routers also contained direct inventory and financial mutations
# and are intentionally not imported or mounted.

# Purchase-order, supplier-invoice and goods-receipt reads are provided by the
# canonical routers above.  Only the bounded, non-persistent upload utilities
# remain reachable from the retired upload module.
include_explicit_non_persistent_post_utilities(
    api,
    purchase_upload.router,
    prefix="/purchase-upload",
    tags=["Purchase Upload"],
    routes={
        "/parse-invoice-safe": purchase_upload_routes.parse_purchase_invoice_safe,
    },
)

# Inventory reads and reviewed commands are mounted above through the canonical
# UUID routers.  The retired inventory, adjustment, movement and write-off
# routers used integer identifiers and pre-ledger stock tables, so none of
# their reads or writes is reachable.

# --- Finance ---
# Posted payment history, open-item allocation context/readback, and standalone
# adjustment-note context/readback are provided only by canonical UUID routers.
# The retired payment/allocation/note routers mixed integer identifiers, old
# outstanding projections, static reason/method lists, and silent zero/error
# fallbacks, so none of them is mounted.
# Expense-claim eligibility, review and posted readback are canonical web
# operator-action resources.  The legacy claim list/detail projections are not
# mounted.

# --- Compliance ---
# GST dashboard, filing status and statutory reports are published only by
# canonical_erp_reads.  The retired compliance routers queried pre-canonical
# GST/master tables, inferred filing facts, and exposed an unversioned 18%
# calculation default.  GST settings now come from the single effective
# tax.registrations row. Missing GSTR-2B and regulatory projections stay
# explicitly unavailable until authoritative canonical resources exist.

# --- Analytics ---
# Dashboard and report projections are mounted by canonical_erp_reads.  The
# retired reports.dashboard router queried the pre-canonical sales, inventory,
# parties and financial schemas and silently converted read failures to zero.
# Authoritative aging and collection totals are mounted by canonical_erp_reads.
# The retired collection router exposed invented follow-up, agent, campaign and
# efficiency facts; customer-outstanding also contained an unsafe first-org
# fallback.  Neither legacy report router is mounted.

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
# The retired metadata router published unversioned statutory and commercial
# choices (tax rates, state-name mappings, credit plans, payment terms and UOM
# labels), and silently substituted hard-coded data after database failures.
# Canonical workflows resolve these facts from their owning rows or reviewed
# reference-data releases.  Unsupported choice catalogs remain unavailable.
include_explicit_non_persistent_post_utilities(
    api,
    calculations.router,
    routes={
        "/calculations/invoice": calculations.preview_invoice_totals,
        "/calculations/sales-order": calculations.preview_sales_order_totals,
    },
)
api.include_router(schema_router.router, tags=["Schema Documentation"])  # Live database schema

if not is_production():
    from .api.routes import test_routes  # TEST MODE verification
    api.include_router(test_routes.router, tags=["Testing"])
app.include_router(api)

# Attach the reviewed external-operation allowlist after all routes are mounted.
# This publishes policy metadata only; it does not implement an MCP transport.
install_operation_registry(app)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

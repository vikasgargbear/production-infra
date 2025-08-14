"""
FastAPI Main Application
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os

# Import routers
from .api.routes import (
    auth, customers, products_consolidated, sales, inventory, 
    payments, dashboard, billing, api_wrapper, test_db
)

# Import additional routers that are actually available
from .api.routes import (
    customers_router, orders_router, inventory_router, billing_router, 
    payments_router, invoices_router, order_items_router, users_router, 
    suppliers_router, purchases_router,  # Removed delivery_challan_router
    dashboard_router, stock_adjustments_router, tax_entries_router,
    purchase_upload_router, purchase_enhanced_router, sale_returns_api_router,
    purchase_returns_router, stock_movements_router, party_ledger_router,
    credit_debit_notes_router, sales_router, enterprise_orders_router,
    collection_center_router
)

# Import additional routers not in __init__.py
from .api.routes import stock_receive, enterprise_delivery_challan, inventory_batches, create_user, delivery_challan
# Import new APIs
from .api.routes import master_settings, schemes_discounts, loyalty_points, compliance
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
    version="2.0.1",  # Auto-deploy test
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # React development server
        "http://localhost:3001",  # React development server (alternate port)
        "http://localhost:5173",  # Vite development server
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:5173",
        "https://pharma-frontend.railway.app",  # Production frontend
        "https://pharma-erp.vercel.app",  # Vercel deployment
        "https://*.vercel.app",  # Any Vercel preview
        "https://*.railway.app",  # Any Railway preview
        "*"  # Allow all origins temporarily for debugging
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoint
@app.get("/")
async def root():
    return {
        "message": "Pharma ERP API",
        "version": "2.0.0",
        "status": "healthy",
        "endpoints": {
            "health": "/health",
            "docs": "/docs",
            "api": "/api"
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
api.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api.include_router(customers.router, prefix="/customers", tags=["Customers"])
api.include_router(products_consolidated.router, prefix="/products", tags=["Products"])
api.include_router(sales.router, prefix="/sales", tags=["Sales"])
api.include_router(inventory.router, prefix="/inventory", tags=["Inventory"])
api.include_router(payments.router, prefix="/payments", tags=["Payments"])
api.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
api.include_router(billing.router, prefix="/billing", tags=["Billing"])
# Register additional routes from __init__.py
api.include_router(orders_router, tags=["Orders"])
api.include_router(invoices_router, tags=["Invoices"])
api.include_router(order_items_router, tags=["Order Items"])
api.include_router(users_router, tags=["Users"])
api.include_router(suppliers_router, tags=["Suppliers"])
api.include_router(purchases_router, tags=["Purchases"])
api.include_router(dashboard_router, tags=["Dashboard API"])
# Include both - they have different functionality
api.include_router(delivery_challan.router, tags=["Delivery Challan"])
api.include_router(stock_adjustments_router, tags=["Stock Adjustments"])
api.include_router(tax_entries_router, tags=["Tax Entries"])
api.include_router(purchase_upload_router, tags=["Purchase Upload"])
api.include_router(purchase_enhanced_router, tags=["Purchase Enhanced"])
api.include_router(sale_returns_api_router, tags=["Sale Returns"])
api.include_router(purchase_returns_router, tags=["Purchase Returns"])
api.include_router(stock_movements_router, tags=["Stock Movements"])
api.include_router(party_ledger_router, tags=["Party Ledger"])
api.include_router(credit_debit_notes_router, tags=["Credit/Debit Notes"])
api.include_router(enterprise_orders_router, tags=["Enterprise Orders"])
api.include_router(collection_center_router, tags=["Collection Center"])
api.include_router(stock_receive.router, tags=["Stock Receive"])
api.include_router(enterprise_delivery_challan.router, tags=["Enterprise Delivery Challan"])
api.include_router(inventory_batches.router, prefix="/inventory/batches", tags=["Inventory Batches"])
api.include_router(create_user.router, tags=["Setup"])

# Register new APIs
api.include_router(master_settings.router, tags=["Master Settings"])
api.include_router(schemes_discounts.router, tags=["Schemes & Discounts"])
api.include_router(loyalty_points.router, tags=["Loyalty Points"])
api.include_router(compliance.router, tags=["Compliance"])

# All endpoints consolidated - no temporary workarounds

# Include the PostgreSQL function wrappers
api.include_router(api_wrapper.router, prefix="/pg", tags=["PostgreSQL Functions"])

# Include the consolidated API
app.include_router(api)

# Include test routes for debugging
app.include_router(test_db.router)

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
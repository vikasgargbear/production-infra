"""
FastAPI Main Application
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os

# Import routers
from .api.routes import (
    auth, customers, products, sales, inventory, 
    payments, dashboard, billing, api_wrapper, test_db
)

# Import additional routers that are actually available
from .api.routes import (
    customers_router, orders_router, inventory_router, billing_router, 
    payments_router, invoices_router, order_items_router, users_router, 
    suppliers_router, purchases_router, delivery_challan_router, 
    dashboard_router, stock_adjustments_router, tax_entries_router,
    purchase_upload_router, purchase_enhanced_router, sale_returns_api_router,
    purchase_returns_router, stock_movements_router, party_ledger_router,
    credit_debit_notes_router, sales_router, enterprise_orders_router,
    collection_center_router
)

# Import additional routers not in __init__.py
from .api.routes import stock_receive, enterprise_delivery_challan

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
        "http://localhost:5173",  # Vite development server
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
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
            "api": "/api/v2"
        }
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "pharma-erp-backend",
        "version": "2.0.0"
    }

# API v2 prefix
from fastapi import APIRouter
api_v2 = APIRouter(prefix="/api/v2")

# Register routes
api_v2.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_v2.include_router(customers.router, prefix="/customers", tags=["Customers"])
api_v2.include_router(products.router, prefix="/products", tags=["Products"])
api_v2.include_router(sales.router, prefix="/sales", tags=["Sales"])
api_v2.include_router(inventory.router, prefix="/inventory", tags=["Inventory"])
api_v2.include_router(payments.router, prefix="/payments", tags=["Payments"])
api_v2.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
api_v2.include_router(billing.router, prefix="/billing", tags=["Billing"])
# Register additional routes from __init__.py
api_v2.include_router(orders_router, tags=["Orders"])
api_v2.include_router(invoices_router, tags=["Invoices"])
api_v2.include_router(order_items_router, tags=["Order Items"])
api_v2.include_router(users_router, tags=["Users"])
api_v2.include_router(suppliers_router, tags=["Suppliers"])
api_v2.include_router(purchases_router, tags=["Purchases"])
api_v2.include_router(delivery_challan_router, tags=["Delivery Challan"])
api_v2.include_router(stock_adjustments_router, tags=["Stock Adjustments"])
api_v2.include_router(tax_entries_router, tags=["Tax Entries"])
api_v2.include_router(purchase_upload_router, tags=["Purchase Upload"])
api_v2.include_router(purchase_enhanced_router, tags=["Purchase Enhanced"])
api_v2.include_router(sale_returns_api_router, tags=["Sale Returns"])
api_v2.include_router(purchase_returns_router, tags=["Purchase Returns"])
api_v2.include_router(stock_movements_router, tags=["Stock Movements"])
api_v2.include_router(party_ledger_router, tags=["Party Ledger"])
api_v2.include_router(credit_debit_notes_router, tags=["Credit/Debit Notes"])
api_v2.include_router(enterprise_orders_router, tags=["Enterprise Orders"])
api_v2.include_router(collection_center_router, tags=["Collection Center"])
api_v2.include_router(stock_receive.router, tags=["Stock Receive"])
api_v2.include_router(enterprise_delivery_challan.router, tags=["Enterprise Delivery Challan"])

# Include the PostgreSQL function wrappers
api_v2.include_router(api_wrapper.router, prefix="/pg", tags=["PostgreSQL Functions"])

# Include the v2 API
app.include_router(api_v2)

# Include test routes for debugging
app.include_router(test_db.router)

# Also include v1 routes for backward compatibility
api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_v1.include_router(customers.router, prefix="/customers", tags=["Customers"])
api_v1.include_router(products.router, prefix="/products", tags=["Products"])
api_v1.include_router(sales.router, prefix="/sales", tags=["Sales"])
api_v1.include_router(inventory.router, prefix="/inventory", tags=["Inventory"])
api_v1.include_router(payments.router, prefix="/payments", tags=["Payments"])
api_v1.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
api_v1.include_router(billing.router, prefix="/billing", tags=["Billing"])
# Register additional routes from __init__.py
api_v1.include_router(orders_router, tags=["Orders"])
api_v1.include_router(invoices_router, tags=["Invoices"])
api_v1.include_router(order_items_router, tags=["Order Items"])
api_v1.include_router(users_router, tags=["Users"])
api_v1.include_router(suppliers_router, tags=["Suppliers"])
api_v1.include_router(purchases_router, tags=["Purchases"])
api_v1.include_router(delivery_challan_router, tags=["Delivery Challan"])
api_v1.include_router(stock_adjustments_router, tags=["Stock Adjustments"])
api_v1.include_router(tax_entries_router, tags=["Tax Entries"])
api_v1.include_router(purchase_upload_router, tags=["Purchase Upload"])
api_v1.include_router(purchase_enhanced_router, tags=["Purchase Enhanced"])
api_v1.include_router(sale_returns_api_router, tags=["Sale Returns"])
api_v1.include_router(purchase_returns_router, tags=["Purchase Returns"])
api_v1.include_router(stock_movements_router, tags=["Stock Movements"])
api_v1.include_router(party_ledger_router, tags=["Party Ledger"])
api_v1.include_router(credit_debit_notes_router, tags=["Credit/Debit Notes"])
api_v1.include_router(enterprise_orders_router, tags=["Enterprise Orders"])
api_v1.include_router(collection_center_router, tags=["Collection Center"])
api_v1.include_router(stock_receive.router, tags=["Stock Receive"])
api_v1.include_router(enterprise_delivery_challan.router, tags=["Enterprise Delivery Challan"])

app.include_router(api_v1)

# PostgreSQL function wrapper endpoints
# Since frontend expects REST but backend has PostgreSQL functions
# We'll create wrapper endpoints
@api_v2.get("/test-connection")
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
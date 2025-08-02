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
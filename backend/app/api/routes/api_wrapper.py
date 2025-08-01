"""
API Wrapper for PostgreSQL Functions
Bridges REST endpoints to PostgreSQL stored functions
"""
from fastapi import APIRouter, Depends, Query, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any
from datetime import date, datetime
import json
from ...core.database import get_db

router = APIRouter()

# ============= CUSTOMER APIs =============

@router.get("/customers/search")
async def search_customers(
    q: str = Query(..., description="Search term"),
    customer_type: Optional[str] = Query(None, description="Customer type filter"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    Search customers using PostgreSQL function
    Wraps: api.search_customers()
    """
    try:
        result = db.execute(
            text("""
                SELECT api.search_customers(
                    p_search_term := :search_term,
                    p_customer_type := :customer_type,
                    p_limit := :limit,
                    p_offset := :offset
                )
            """),
            {
                "search_term": q,
                "customer_type": customer_type,
                "limit": limit,
                "offset": offset
            }
        ).scalar()
        
        return result if result else {"customers": [], "total": 0}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@router.get("/customers/{customer_id}")
async def get_customer_details(
    customer_id: int,
    db: Session = Depends(get_db)
):
    """
    Get customer details with ledger summary
    Wraps: api.get_customer_details()
    """
    try:
        result = db.execute(
            text("SELECT api.get_customer_details(:customer_id)"),
            {"customer_id": customer_id}
        ).scalar()
        
        if not result:
            raise HTTPException(status_code=404, detail="Customer not found")
            
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get customer: {str(e)}")

@router.post("/customers")
async def create_customer(
    customer_data: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """
    Create new customer
    Wraps: api.create_customer()
    """
    try:
        result = db.execute(
            text("SELECT api.create_customer(:customer_data::jsonb)"),
            {"customer_data": json.dumps(customer_data)}
        ).scalar()
        
        db.commit()
        return result
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create customer: {str(e)}")

# ============= PRODUCT APIs =============

@router.get("/products/search")
async def search_products(
    q: str = Query(..., description="Search term"),
    category_id: Optional[int] = None,
    is_narcotic: Optional[bool] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    Search products with filters
    Wraps: api.search_products()
    """
    try:
        result = db.execute(
            text("""
                SELECT api.search_products(
                    p_search_term := :search_term,
                    p_category_id := :category_id,
                    p_is_narcotic := :is_narcotic,
                    p_limit := :limit,
                    p_offset := :offset
                )
            """),
            {
                "search_term": q,
                "category_id": category_id,
                "is_narcotic": is_narcotic,
                "limit": limit,
                "offset": offset
            }
        ).scalar()
        
        return result if result else {"products": [], "total": 0}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@router.get("/products/{product_id}/stock")
async def get_product_stock(
    product_id: int,
    branch_id: Optional[int] = None,
    include_reserved: bool = Query(False),
    db: Session = Depends(get_db)
):
    """
    Get real-time stock availability
    Wraps: api.get_stock_availability()
    """
    try:
        result = db.execute(
            text("""
                SELECT api.get_stock_availability(
                    p_product_id := :product_id,
                    p_branch_id := :branch_id,
                    p_include_reserved := :include_reserved
                )
            """),
            {
                "product_id": product_id,
                "branch_id": branch_id,
                "include_reserved": include_reserved
            }
        ).scalar()
        
        return result if result else {"stock": [], "total_available": 0}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get stock: {str(e)}")

# ============= INVOICE APIs =============

@router.post("/invoices")
async def create_invoice(
    invoice_data: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """
    Create new invoice with all calculations
    Wraps: api.create_invoice()
    """
    try:
        # Ensure proper structure
        if "invoice_data" not in invoice_data:
            invoice_data = {"invoice_data": invoice_data}
            
        result = db.execute(
            text("SELECT api.create_invoice(:invoice_data::jsonb)"),
            {"invoice_data": json.dumps(invoice_data)}
        ).scalar()
        
        db.commit()
        return result
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create invoice: {str(e)}")

@router.get("/invoices/{invoice_id}")
async def get_invoice_details(
    invoice_id: int,
    db: Session = Depends(get_db)
):
    """
    Get complete invoice details
    Wraps: api.get_invoice_details()
    """
    try:
        result = db.execute(
            text("SELECT api.get_invoice_details(:invoice_id)"),
            {"invoice_id": invoice_id}
        ).scalar()
        
        if not result:
            raise HTTPException(status_code=404, detail="Invoice not found")
            
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get invoice: {str(e)}")

@router.get("/invoices")
async def search_invoices(
    customer_id: Optional[int] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    status: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    Search invoices with filters
    Wraps: api.search_invoices()
    """
    try:
        filters = {
            "customer_id": customer_id,
            "from_date": from_date.isoformat() if from_date else None,
            "to_date": to_date.isoformat() if to_date else None,
            "status": status
        }
        # Remove None values
        filters = {k: v for k, v in filters.items() if v is not None}
        
        result = db.execute(
            text("""
                SELECT api.search_invoices(
                    p_filters := :filters::jsonb,
                    p_limit := :limit,
                    p_offset := :offset
                )
            """),
            {
                "filters": json.dumps(filters),
                "limit": limit,
                "offset": offset
            }
        ).scalar()
        
        return result if result else {"invoices": [], "total": 0}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

# ============= PAYMENT APIs =============

@router.post("/payments")
async def record_payment(
    payment_data: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """
    Record customer payment with auto-allocation
    Wraps: api.record_payment()
    """
    try:
        if "payment_data" not in payment_data:
            payment_data = {"payment_data": payment_data}
            
        result = db.execute(
            text("SELECT api.record_payment(:payment_data::jsonb)"),
            {"payment_data": json.dumps(payment_data)}
        ).scalar()
        
        db.commit()
        return result
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to record payment: {str(e)}")

@router.get("/customers/{customer_id}/outstanding")
async def get_outstanding_invoices(
    customer_id: int,
    db: Session = Depends(get_db)
):
    """
    Get outstanding invoices for payment allocation
    Wraps: api.get_outstanding_invoices()
    """
    try:
        result = db.execute(
            text("SELECT api.get_outstanding_invoices(:customer_id)"),
            {"customer_id": customer_id}
        ).scalar()
        
        return result if result else {"invoices": [], "total_outstanding": 0}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get outstanding: {str(e)}")

# ============= INVENTORY APIs =============

@router.get("/inventory/reorder-alerts")
async def get_reorder_alerts(
    branch_id: Optional[int] = None,
    category_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Get products requiring reorder
    Wraps: api.get_reorder_alerts()
    """
    try:
        result = db.execute(
            text("""
                SELECT api.get_reorder_alerts(
                    p_branch_id := :branch_id,
                    p_category_id := :category_id
                )
            """),
            {
                "branch_id": branch_id,
                "category_id": category_id
            }
        ).scalar()
        
        return result if result else {"alerts": []}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get alerts: {str(e)}")

@router.get("/inventory/expiring-items")
async def get_expiring_items(
    days_to_expiry: int = Query(30, ge=1, le=365),
    branch_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Get items expiring soon
    Wraps: api.get_expiring_items()
    """
    try:
        result = db.execute(
            text("""
                SELECT api.get_expiring_items(
                    p_days_to_expiry := :days,
                    p_branch_id := :branch_id
                )
            """),
            {
                "days": days_to_expiry,
                "branch_id": branch_id
            }
        ).scalar()
        
        return result if result else {"items": []}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get expiring items: {str(e)}")

# ============= DASHBOARD APIs =============

@router.get("/dashboard/stats")
async def get_dashboard_stats(
    branch_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Get comprehensive dashboard statistics
    Wraps: api.get_dashboard_summary()
    """
    try:
        result = db.execute(
            text("SELECT api.get_dashboard_summary(:branch_id)"),
            {"branch_id": branch_id}
        ).scalar()
        
        return result if result else {}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get stats: {str(e)}")

@router.get("/dashboard/sales-analytics")
async def get_sales_analytics(
    from_date: date,
    to_date: date,
    group_by: str = Query("day", regex="^(day|week|month)$"),
    branch_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Get sales analytics with trends
    Wraps: api.get_sales_analytics()
    """
    try:
        result = db.execute(
            text("""
                SELECT api.get_sales_analytics(
                    p_from_date := :from_date,
                    p_to_date := :to_date,
                    p_group_by := :group_by,
                    p_branch_id := :branch_id
                )
            """),
            {
                "from_date": from_date,
                "to_date": to_date,
                "group_by": group_by,
                "branch_id": branch_id
            }
        ).scalar()
        
        return result if result else {"analytics": []}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get analytics: {str(e)}")

# ============= GST APIs =============

@router.get("/gst/gstr1")
async def generate_gstr1(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000),
    db: Session = Depends(get_db)
):
    """
    Generate GSTR-1 data
    Wraps: api.generate_gstr1_data()
    """
    try:
        result = db.execute(
            text("SELECT api.generate_gstr1_data(:month, :year)"),
            {"month": month, "year": year}
        ).scalar()
        
        return result if result else {"b2b": [], "b2c": [], "hsn": []}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate GSTR-1: {str(e)}")
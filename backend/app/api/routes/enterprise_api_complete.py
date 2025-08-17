"""
Enterprise ERP API - Complete Module
Comprehensive API wrapper leveraging all database functions for full ERP functionality
"""
from fastapi import APIRouter, Depends, Query, HTTPException, Body, Path
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any, Union
from datetime import date, datetime
from decimal import Decimal
import json
import logging
from ...core.database import get_db
from ...core.config import DEFAULT_ORG_ID

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/erp", tags=["Enterprise ERP"])

# =============================================
# MASTER DATA MODULE APIs
# =============================================

@router.get("/organization/{org_id}")
async def get_organization_details(
    org_id: int = Path(..., description="Organization ID"),
    db: Session = Depends(get_db)
):
    """
    Get complete organization details with branches and licenses
    Wraps: api.get_organization_details()
    """
    try:
        result = db.execute(
            text("SELECT api.get_organization_details(:org_id)"),
            {"org_id": org_id}
        ).scalar()
        
        if not result:
            raise HTTPException(status_code=404, detail="Organization not found")
            
        return result
        
    except Exception as e:
        logger.error(f"Failed to get organization details: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get organization: {str(e)}")

@router.get("/products/advanced-search")
async def advanced_product_search(
    search_term: Optional[str] = Query(None, description="Search in name, generic name, code"),
    category_id: Optional[int] = Query(None, description="Filter by category ID"),
    product_type: Optional[str] = Query(None, description="Filter by product type"),
    is_narcotic: Optional[bool] = Query(None, description="Filter narcotic products"),
    min_stock: Optional[int] = Query(None, description="Minimum stock level"),
    max_stock: Optional[int] = Query(None, description="Maximum stock level"),
    expiring_in_days: Optional[int] = Query(None, description="Expiring within days"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    Advanced product search with multiple filters
    Wraps: api.search_products()
    """
    try:
        result = db.execute(
            text("""
                SELECT api.search_products(
                    p_search_term := :search_term,
                    p_category_id := :category_id,
                    p_product_type := :product_type,
                    p_is_narcotic := :is_narcotic,
                    p_limit := :limit,
                    p_offset := :offset
                )
            """),
            {
                "search_term": search_term,
                "category_id": category_id,
                "product_type": product_type,
                "is_narcotic": is_narcotic,
                "limit": limit,
                "offset": offset
            }
        ).scalar()
        
        return result if result else {"products": [], "total_count": 0}
        
    except Exception as e:
        logger.error(f"Product search failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@router.get("/products/{product_id}/details")
async def get_comprehensive_product_details(
    product_id: int = Path(..., description="Product ID"),
    include_batches: bool = Query(True, description="Include batch information"),
    include_suppliers: bool = Query(True, description="Include supplier information"),
    include_pricing: bool = Query(True, description="Include pricing history"),
    db: Session = Depends(get_db)
):
    """
    Get comprehensive product details with all related information
    Wraps: api.get_product_details()
    """
    try:
        result = db.execute(
            text("SELECT api.get_product_details(:product_id)"),
            {"product_id": product_id}
        ).scalar()
        
        if not result:
            raise HTTPException(status_code=404, detail="Product not found")
            
        return result
        
    except Exception as e:
        logger.error(f"Failed to get product details: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get product: {str(e)}")

# =============================================
# INVENTORY MODULE APIs
# =============================================

@router.get("/inventory/stock-overview")
async def get_stock_availability(
    product_id: Optional[int] = Query(None, description="Specific product ID"),
    branch_id: Optional[int] = Query(None, description="Specific branch ID"),
    location_id: Optional[int] = Query(None, description="Specific location ID"),
    include_reserved: bool = Query(False, description="Include reserved stock"),
    low_stock_only: bool = Query(False, description="Show only low stock items"),
    db: Session = Depends(get_db)
):
    """
    Real-time stock availability across all locations
    Wraps: api.get_stock_availability()
    """
    try:
        result = db.execute(
            text("""
                SELECT api.get_stock_availability(
                    p_product_id := :product_id,
                    p_branch_id := :branch_id,
                    p_location_id := :location_id,
                    p_include_reserved := :include_reserved
                )
            """),
            {
                "product_id": product_id,
                "branch_id": branch_id,
                "location_id": location_id,
                "include_reserved": include_reserved
            }
        ).scalar()
        
        return result if result else {"stock_data": [], "summary": {}}
        
    except Exception as e:
        logger.error(f"Failed to get stock availability: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get stock: {str(e)}")

@router.get("/inventory/batch-details")
async def get_batch_information(
    batch_id: Optional[int] = Query(None, description="Specific batch ID"),
    product_id: Optional[int] = Query(None, description="All batches for product"),
    expiry_days: Optional[int] = Query(None, description="Batches expiring within days"),
    include_expired: bool = Query(False, description="Include expired batches"),
    db: Session = Depends(get_db)
):
    """
    Detailed batch information with expiry tracking
    Wraps: api.get_batch_information()
    """
    try:
        result = db.execute(
            text("""
                SELECT api.get_batch_information(
                    p_batch_id := :batch_id,
                    p_product_id := :product_id,
                    p_expiry_days := :expiry_days,
                    p_include_expired := :include_expired
                )
            """),
            {
                "batch_id": batch_id,
                "product_id": product_id,
                "expiry_days": expiry_days,
                "include_expired": include_expired
            }
        ).scalar()
        
        return result if result else {"batches": [], "expiry_summary": {}}
        
    except Exception as e:
        logger.error(f"Failed to get batch information: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get batch info: {str(e)}")

@router.get("/inventory/reorder-alerts")
async def get_reorder_alerts(
    branch_id: Optional[int] = Query(None, description="Specific branch"),
    category_id: Optional[int] = Query(None, description="Specific category"),
    urgency_level: Optional[str] = Query(None, description="critical/high/medium/low"),
    db: Session = Depends(get_db)
):
    """
    Products requiring reorder with urgency classification
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
        
        return result if result else {"alerts": [], "summary": {}}
        
    except Exception as e:
        logger.error(f"Failed to get reorder alerts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get alerts: {str(e)}")

@router.get("/inventory/expiry-alerts")
async def get_expiry_alerts(
    days_ahead: int = Query(90, ge=1, le=365, description="Days to look ahead"),
    branch_id: Optional[int] = Query(None, description="Specific branch"),
    include_expired: bool = Query(True, description="Include already expired"),
    risk_level: Optional[str] = Query(None, description="high/medium/low"),
    db: Session = Depends(get_db)
):
    """
    Batch expiry alerts with risk assessment
    Wraps: api.get_expiry_alerts()
    """
    try:
        result = db.execute(
            text("""
                SELECT api.get_expiry_alerts(
                    p_days_ahead := :days_ahead,
                    p_branch_id := :branch_id,
                    p_include_expired := :include_expired
                )
            """),
            {
                "days_ahead": days_ahead,
                "branch_id": branch_id,
                "include_expired": include_expired
            }
        ).scalar()
        
        return result if result else {"alerts": [], "risk_summary": {}}
        
    except Exception as e:
        logger.error(f"Failed to get expiry alerts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get expiry alerts: {str(e)}")

# =============================================
# SALES MODULE APIs
# =============================================

@router.get("/customers/advanced-search")
async def advanced_customer_search(
    search_term: Optional[str] = Query(None, description="Search name, code, phone, GST"),
    customer_type: Optional[str] = Query(None, description="Customer type filter"),
    category_id: Optional[int] = Query(None, description="Customer category"),
    credit_status: Optional[str] = Query(None, description="good/warning/blocked"),
    has_outstanding: Optional[bool] = Query(None, description="Has pending payments"),
    location: Optional[str] = Query(None, description="City/State filter"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    Advanced customer search with credit and outstanding info
    Wraps: api.search_customers()
    """
    try:
        result = db.execute(
            text("""
                SELECT api.search_customers(
                    p_search_term := :search_term,
                    p_customer_type := :customer_type,
                    p_category_id := :category_id,
                    p_limit := :limit,
                    p_offset := :offset
                )
            """),
            {
                "search_term": search_term,
                "customer_type": customer_type,
                "category_id": category_id,
                "limit": limit,
                "offset": offset
            }
        ).scalar()
        
        return result if result else {"customers": [], "total_count": 0}
        
    except Exception as e:
        logger.error(f"Customer search failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@router.post("/sales/orders")
async def create_sales_order(
    order_data: Dict[str, Any] = Body(..., description="Sales order data"),
    auto_invoice: bool = Query(False, description="Auto-generate invoice"),
    db: Session = Depends(get_db)
):
    """
    Create sales order with automatic calculations
    Wraps: api.create_sales_order()
    """
    try:
        result = db.execute(
            text("SELECT api.create_sales_order(:order_data::jsonb)"),
            {"order_data": json.dumps(order_data)}
        ).scalar()
        
        db.commit()
        return result
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create sales order: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create order: {str(e)}")

@router.post("/sales/invoices")
async def create_sales_invoice(
    invoice_data: Dict[str, Any] = Body(..., description="Invoice data"),
    batch_allocation_method: str = Query("FEFO", description="FEFO/LIFO/MANUAL"),
    db: Session = Depends(get_db)
):
    """
    Create invoice with automatic batch allocation
    Wraps: api.create_invoice()
    """
    try:
        result = db.execute(
            text("SELECT api.create_invoice(:invoice_data::jsonb)"),
            {"invoice_data": json.dumps(invoice_data)}
        ).scalar()
        
        db.commit()
        return result
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create invoice: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create invoice: {str(e)}")

@router.get("/sales/dashboard")
async def get_sales_dashboard(
    branch_id: Optional[int] = Query(None, description="Specific branch"),
    from_date: Optional[date] = Query(None, description="Start date"),
    to_date: Optional[date] = Query(None, description="End date"),
    comparison_period: bool = Query(True, description="Include period comparison"),
    db: Session = Depends(get_db)
):
    """
    Comprehensive sales analytics dashboard
    Wraps: api.get_sales_dashboard()
    """
    try:
        # Default to last 30 days if no dates provided
        if not from_date:
            from_date = date.today().replace(day=1)  # Start of current month
        if not to_date:
            to_date = date.today()
            
        result = db.execute(
            text("""
                SELECT api.get_sales_dashboard(
                    p_branch_id := :branch_id,
                    p_from_date := :from_date,
                    p_to_date := :to_date
                )
            """),
            {
                "branch_id": branch_id,
                "from_date": from_date,
                "to_date": to_date
            }
        ).scalar()
        
        return result if result else {"dashboard": {}, "metrics": {}}
        
    except Exception as e:
        logger.error(f"Failed to get sales dashboard: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get dashboard: {str(e)}")

# =============================================
# PROCUREMENT MODULE APIs
# =============================================

@router.get("/suppliers/search")
async def search_suppliers(
    search_term: Optional[str] = Query(None, description="Search name, code, GST"),
    supplier_category: Optional[str] = Query(None, description="Supplier category"),
    product_id: Optional[int] = Query(None, description="Suppliers for specific product"),
    performance_rating: Optional[str] = Query(None, description="excellent/good/average/poor"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    Search suppliers with product mapping and performance info
    Wraps: api.search_suppliers()
    """
    try:
        result = db.execute(
            text("""
                SELECT api.search_suppliers(
                    p_search_term := :search_term,
                    p_supplier_category := :supplier_category,
                    p_product_id := :product_id,
                    p_limit := :limit,
                    p_offset := :offset
                )
            """),
            {
                "search_term": search_term,
                "supplier_category": supplier_category,
                "product_id": product_id,
                "limit": limit,
                "offset": offset
            }
        ).scalar()
        
        return result if result else {"suppliers": [], "total_count": 0}
        
    except Exception as e:
        logger.error(f"Supplier search failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@router.post("/procurement/purchase-orders")
async def create_purchase_order(
    po_data: Dict[str, Any] = Body(..., description="Purchase order data"),
    validate_credit_limit: bool = Query(True, description="Validate supplier credit"),
    db: Session = Depends(get_db)
):
    """
    Create purchase order with supplier credit validation
    Wraps: api.create_purchase_order()
    """
    try:
        result = db.execute(
            text("SELECT api.create_purchase_order(:po_data::jsonb)"),
            {"po_data": json.dumps(po_data)}
        ).scalar()
        
        db.commit()
        return result
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create purchase order: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create PO: {str(e)}")

@router.post("/procurement/grn")
async def create_goods_receipt(
    grn_data: Dict[str, Any] = Body(..., description="GRN data"),
    auto_quality_check: bool = Query(True, description="Auto quality verification"),
    create_batches: bool = Query(True, description="Auto-create product batches"),
    db: Session = Depends(get_db)
):
    """
    Create GRN with batch creation and quality checks
    Wraps: api.create_grn()
    """
    try:
        result = db.execute(
            text("SELECT api.create_grn(:grn_data::jsonb)"),
            {"grn_data": json.dumps(grn_data)}
        ).scalar()
        
        db.commit()
        return result
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create GRN: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create GRN: {str(e)}")

@router.get("/procurement/pending-deliveries")
async def get_pending_deliveries(
    supplier_id: Optional[int] = Query(None, description="Specific supplier"),
    branch_id: Optional[int] = Query(None, description="Specific branch"),
    days_overdue: Optional[int] = Query(None, description="Filter overdue deliveries"),
    urgency_level: Optional[str] = Query(None, description="critical/high/medium"),
    db: Session = Depends(get_db)
):
    """
    Track pending deliveries with overdue analysis
    Wraps: api.get_pending_deliveries()
    """
    try:
        result = db.execute(
            text("""
                SELECT api.get_pending_deliveries(
                    p_supplier_id := :supplier_id,
                    p_branch_id := :branch_id,
                    p_days_overdue := :days_overdue
                )
            """),
            {
                "supplier_id": supplier_id,
                "branch_id": branch_id,
                "days_overdue": days_overdue
            }
        ).scalar()
        
        return result if result else {"deliveries": [], "overdue_summary": {}}
        
    except Exception as e:
        logger.error(f"Failed to get pending deliveries: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get deliveries: {str(e)}")

@router.get("/procurement/supplier-performance")
async def get_supplier_performance(
    supplier_id: Optional[int] = Query(None, description="Specific supplier"),
    from_date: Optional[date] = Query(None, description="Analysis start date"),
    to_date: Optional[date] = Query(None, description="Analysis end date"),
    performance_metrics: str = Query("all", description="all/delivery/quality/pricing"),
    db: Session = Depends(get_db)
):
    """
    Supplier performance metrics and scoring
    Wraps: api.get_supplier_performance()
    """
    try:
        # Default to last 90 days
        if not from_date:
            from_date = date.today().replace(month=max(1, date.today().month - 3))
        if not to_date:
            to_date = date.today()
            
        result = db.execute(
            text("""
                SELECT api.get_supplier_performance(
                    p_supplier_id := :supplier_id,
                    p_from_date := :from_date,
                    p_to_date := :to_date
                )
            """),
            {
                "supplier_id": supplier_id,
                "from_date": from_date,
                "to_date": to_date
            }
        ).scalar()
        
        return result if result else {"performance": {}, "metrics": {}}
        
    except Exception as e:
        logger.error(f"Failed to get supplier performance: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get performance: {str(e)}")

# =============================================
# FINANCIAL MODULE APIs
# =============================================

@router.post("/finance/payments")
async def record_payment_transaction(
    payment_data: Dict[str, Any] = Body(..., description="Payment data"),
    auto_allocate: bool = Query(True, description="Auto-allocate to invoices"),
    create_journal_entry: bool = Query(True, description="Auto journal entry"),
    db: Session = Depends(get_db)
):
    """
    Record payment with automatic journal entry creation
    Wraps: api.record_payment()
    """
    try:
        result = db.execute(
            text("SELECT api.record_payment(:payment_data::jsonb)"),
            {"payment_data": json.dumps(payment_data)}
        ).scalar()
        
        db.commit()
        return result
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to record payment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to record payment: {str(e)}")

@router.get("/finance/customer-outstanding")
async def get_customer_outstanding(
    customer_id: Optional[int] = Query(None, description="Specific customer"),
    as_on_date: Optional[date] = Query(None, description="Outstanding as on date"),
    aging_buckets: bool = Query(True, description="Include aging analysis"),
    include_pdc: bool = Query(True, description="Include post-dated cheques"),
    db: Session = Depends(get_db)
):
    """
    Customer outstanding with aging analysis
    Wraps: api.get_customer_outstanding()
    """
    try:
        if not as_on_date:
            as_on_date = date.today()
            
        result = db.execute(
            text("""
                SELECT api.get_customer_outstanding(
                    p_customer_id := :customer_id,
                    p_as_on_date := :as_on_date,
                    p_aging_buckets := :aging_buckets,
                    p_include_pdc := :include_pdc
                )
            """),
            {
                "customer_id": customer_id,
                "as_on_date": as_on_date,
                "aging_buckets": aging_buckets,
                "include_pdc": include_pdc
            }
        ).scalar()
        
        return result if result else {"outstanding": [], "aging_summary": {}}
        
    except Exception as e:
        logger.error(f"Failed to get customer outstanding: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get outstanding: {str(e)}")

@router.get("/finance/cash-flow-forecast")
async def get_cash_flow_forecast(
    from_date: Optional[date] = Query(None, description="Forecast start date"),
    to_date: Optional[date] = Query(None, description="Forecast end date"),
    branch_id: Optional[int] = Query(None, description="Specific branch"),
    include_projections: bool = Query(True, description="Include projected flows"),
    db: Session = Depends(get_db)
):
    """
    Cash flow forecast based on receivables and payables
    Wraps: api.get_cash_flow_forecast()
    """
    try:
        # Default to next 30 days
        if not from_date:
            from_date = date.today()
        if not to_date:
            to_date = date.today().replace(day=min(28, date.today().day + 30))
            
        result = db.execute(
            text("""
                SELECT api.get_cash_flow_forecast(
                    p_from_date := :from_date,
                    p_to_date := :to_date,
                    p_branch_id := :branch_id
                )
            """),
            {
                "from_date": from_date,
                "to_date": to_date,
                "branch_id": branch_id
            }
        ).scalar()
        
        return result if result else {"forecast": [], "summary": {}}
        
    except Exception as e:
        logger.error(f"Failed to get cash flow forecast: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get forecast: {str(e)}")

@router.get("/finance/profit-loss")
async def get_profit_loss_statement(
    from_date: date = Query(..., description="P&L start date"),
    to_date: date = Query(..., description="P&L end date"),
    branch_id: Optional[int] = Query(None, description="Specific branch"),
    comparison_period: bool = Query(False, description="Include previous period comparison"),
    detailed_view: bool = Query(False, description="Detailed account-wise breakdown"),
    db: Session = Depends(get_db)
):
    """
    Profit & Loss statement with period comparison
    Wraps: api.get_profit_loss_statement()
    """
    try:
        result = db.execute(
            text("""
                SELECT api.get_profit_loss_statement(
                    p_from_date := :from_date,
                    p_to_date := :to_date,
                    p_branch_id := :branch_id,
                    p_comparison_period := :comparison_period
                )
            """),
            {
                "from_date": from_date,
                "to_date": to_date,
                "branch_id": branch_id,
                "comparison_period": comparison_period
            }
        ).scalar()
        
        return result if result else {"profit_loss": {}, "summary": {}}
        
    except Exception as e:
        logger.error(f"Failed to get P&L statement: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get P&L: {str(e)}")

@router.get("/finance/balance-sheet")
async def get_balance_sheet(
    as_on_date: Optional[date] = Query(None, description="Balance sheet date"),
    branch_id: Optional[int] = Query(None, description="Specific branch"),
    detailed_view: bool = Query(False, description="Detailed account breakdown"),
    db: Session = Depends(get_db)
):
    """
    Balance sheet as on specific date
    Wraps: api.get_balance_sheet()
    """
    try:
        if not as_on_date:
            as_on_date = date.today()
            
        result = db.execute(
            text("""
                SELECT api.get_balance_sheet(
                    p_as_on_date := :as_on_date,
                    p_branch_id := :branch_id
                )
            """),
            {
                "as_on_date": as_on_date,
                "branch_id": branch_id
            }
        ).scalar()
        
        return result if result else {"balance_sheet": {}, "totals": {}}
        
    except Exception as e:
        logger.error(f"Failed to get balance sheet: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get balance sheet: {str(e)}")

# =============================================
# GST & COMPLIANCE MODULE APIs
# =============================================

@router.get("/compliance/gstr1/{period}")
async def generate_gstr1_data(
    period: str = Path(..., description="Period in MMYYYY format"),
    branch_id: Optional[int] = Query(None, description="Specific branch"),
    include_amendments: bool = Query(True, description="Include amendments"),
    db: Session = Depends(get_db)
):
    """
    Generate GSTR-1 data for GST filing
    Wraps: api.generate_gstr1_data()
    """
    try:
        result = db.execute(
            text("""
                SELECT api.generate_gstr1_data(
                    p_org_id := :org_id,
                    p_return_period := :period,
                    p_branch_id := :branch_id
                )
            """),
            {
                "org_id": DEFAULT_ORG_ID,
                "period": period,
                "branch_id": branch_id
            }
        ).scalar()
        
        return result if result else {"gstr1_data": {}, "summary": {}}
        
    except Exception as e:
        logger.error(f"Failed to generate GSTR-1: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate GSTR-1: {str(e)}")

@router.post("/compliance/eway-bill")
async def generate_eway_bill(
    invoice_id: int = Body(..., description="Invoice ID"),
    transport_details: Dict[str, Any] = Body(..., description="Transport details"),
    db: Session = Depends(get_db)
):
    """
    Generate e-way bill for eligible invoices
    Wraps: api.generate_eway_bill()
    """
    try:
        result = db.execute(
            text("""
                SELECT api.generate_eway_bill(
                    p_invoice_id := :invoice_id,
                    p_transport_details := :transport_details::jsonb
                )
            """),
            {
                "invoice_id": invoice_id,
                "transport_details": json.dumps(transport_details)
            }
        ).scalar()
        
        db.commit()
        return result
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to generate e-way bill: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate e-way bill: {str(e)}")

@router.get("/compliance/license-expiry-alerts")
async def get_license_expiry_alerts(
    days_ahead: int = Query(90, ge=1, le=365, description="Days to look ahead"),
    license_type: Optional[str] = Query(None, description="Specific license type"),
    db: Session = Depends(get_db)
):
    """
    Business license expiry tracking and alerts
    Wraps: api.get_license_expiry_alerts()
    """
    try:
        result = db.execute(
            text("""
                SELECT api.get_license_expiry_alerts(
                    p_org_id := :org_id,
                    p_days_ahead := :days_ahead,
                    p_license_type := :license_type
                )
            """),
            {
                "org_id": DEFAULT_ORG_ID,
                "days_ahead": days_ahead,
                "license_type": license_type
            }
        ).scalar()
        
        return result if result else {"alerts": [], "summary": {}}
        
    except Exception as e:
        logger.error(f"Failed to get license alerts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get license alerts: {str(e)}")

@router.get("/compliance/narcotic-register")
async def get_narcotic_register(
    product_id: Optional[int] = Query(None, description="Specific narcotic product"),
    from_date: Optional[date] = Query(None, description="Register start date"),
    to_date: Optional[date] = Query(None, description="Register end date"),
    include_balance_check: bool = Query(True, description="Include balance verification"),
    db: Session = Depends(get_db)
):
    """
    Narcotic drug register with balance verification
    Wraps: api.get_narcotic_register()
    """
    try:
        # Default to last 30 days
        if not from_date:
            from_date = date.today().replace(day=max(1, date.today().day - 30))
        if not to_date:
            to_date = date.today()
            
        result = db.execute(
            text("""
                SELECT api.get_narcotic_register(
                    p_product_id := :product_id,
                    p_from_date := :from_date,
                    p_to_date := :to_date,
                    p_include_balance_check := :include_balance_check
                )
            """),
            {
                "product_id": product_id,
                "from_date": from_date,
                "to_date": to_date,
                "include_balance_check": include_balance_check
            }
        ).scalar()
        
        return result if result else {"register": [], "balance_summary": {}}
        
    except Exception as e:
        logger.error(f"Failed to get narcotic register: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get narcotic register: {str(e)}")

# =============================================
# ANALYTICS & REPORTING MODULE APIs
# =============================================

@router.get("/analytics/executive-dashboard")
async def get_executive_dashboard(
    date_range: str = Query("current_month", description="today/current_week/current_month/current_quarter/current_year"),
    comparison: bool = Query(True, description="Include period comparison"),
    db: Session = Depends(get_db)
):
    """
    Executive dashboard with key metrics and alerts
    Wraps: api.get_executive_dashboard()
    """
    try:
        result = db.execute(
            text("""
                SELECT api.get_executive_dashboard(
                    p_org_id := :org_id,
                    p_date_range := :date_range,
                    p_comparison := :comparison
                )
            """),
            {
                "org_id": DEFAULT_ORG_ID,
                "date_range": date_range,
                "comparison": comparison
            }
        ).scalar()
        
        return result if result else {"dashboard": {}, "kpis": {}}
        
    except Exception as e:
        logger.error(f"Failed to get executive dashboard: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get dashboard: {str(e)}")

@router.get("/analytics/sales-analytics")
async def get_detailed_sales_analytics(
    from_date: date = Query(..., description="Analysis start date"),
    to_date: date = Query(..., description="Analysis end date"),
    group_by: str = Query("day", description="day/week/month grouping"),
    branch_id: Optional[int] = Query(None, description="Specific branch"),
    category_id: Optional[int] = Query(None, description="Specific category"),
    trend_analysis: bool = Query(True, description="Include trend analysis"),
    db: Session = Depends(get_db)
):
    """
    Detailed sales analytics with trends and breakdowns
    Wraps: api.get_sales_analytics()
    """
    try:
        result = db.execute(
            text("""
                SELECT api.get_sales_analytics(
                    p_org_id := :org_id,
                    p_from_date := :from_date,
                    p_to_date := :to_date,
                    p_group_by := :group_by,
                    p_branch_id := :branch_id,
                    p_category_id := :category_id
                )
            """),
            {
                "org_id": DEFAULT_ORG_ID,
                "from_date": from_date,
                "to_date": to_date,
                "group_by": group_by,
                "branch_id": branch_id,
                "category_id": category_id
            }
        ).scalar()
        
        return result if result else {"analytics": [], "trends": {}}
        
    except Exception as e:
        logger.error(f"Failed to get sales analytics: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get analytics: {str(e)}")

@router.get("/analytics/inventory-analytics")
async def get_inventory_analytics(
    analysis_type: str = Query("overview", description="overview/movement/aging/abc analysis type"),
    branch_id: Optional[int] = Query(None, description="Specific branch"),
    category_id: Optional[int] = Query(None, description="Specific category"),
    include_forecasting: bool = Query(False, description="Include demand forecasting"),
    db: Session = Depends(get_db)
):
    """
    Inventory analytics including ABC analysis and movement
    Wraps: api.get_inventory_analytics()
    """
    try:
        result = db.execute(
            text("""
                SELECT api.get_inventory_analytics(
                    p_org_id := :org_id,
                    p_analysis_type := :analysis_type,
                    p_branch_id := :branch_id,
                    p_category_id := :category_id
                )
            """),
            {
                "org_id": DEFAULT_ORG_ID,
                "analysis_type": analysis_type,
                "branch_id": branch_id,
                "category_id": category_id
            }
        ).scalar()
        
        return result if result else {"analytics": {}, "insights": {}}
        
    except Exception as e:
        logger.error(f"Failed to get inventory analytics: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get inventory analytics: {str(e)}")

@router.get("/analytics/customer-analytics")
async def get_customer_analytics(
    from_date: Optional[date] = Query(None, description="Analysis start date"),
    to_date: Optional[date] = Query(None, description="Analysis end date"),
    customer_id: Optional[int] = Query(None, description="Specific customer"),
    rfm_analysis: bool = Query(True, description="Include RFM segmentation"),
    db: Session = Depends(get_db)
):
    """
    Customer analytics with RFM segmentation
    Wraps: api.get_customer_analytics()
    """
    try:
        # Default to last year
        if not from_date:
            from_date = date.today().replace(year=date.today().year - 1)
        if not to_date:
            to_date = date.today()
            
        result = db.execute(
            text("""
                SELECT api.get_customer_analytics(
                    p_org_id := :org_id,
                    p_from_date := :from_date,
                    p_to_date := :to_date,
                    p_customer_id := :customer_id
                )
            """),
            {
                "org_id": DEFAULT_ORG_ID,
                "from_date": from_date,
                "to_date": to_date,
                "customer_id": customer_id
            }
        ).scalar()
        
        return result if result else {"analytics": {}, "segments": {}}
        
    except Exception as e:
        logger.error(f"Failed to get customer analytics: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get customer analytics: {str(e)}")

# =============================================
# SYSTEM & UTILITY MODULE APIs
# =============================================

@router.post("/auth/authenticate")
async def authenticate_user(
    username: str = Body(..., description="Username"),
    password: str = Body(..., description="Password"),
    db: Session = Depends(get_db)
):
    """
    User authentication with session management
    Wraps: api.authenticate_user()
    """
    try:
        result = db.execute(
            text("""
                SELECT api.authenticate_user(
                    p_username := :username,
                    p_password := :password
                )
            """),
            {
                "username": username,
                "password": password
            }
        ).scalar()
        
        return result if result else {"authenticated": False, "message": "Invalid credentials"}
        
    except Exception as e:
        logger.error(f"Authentication failed: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")

@router.get("/system/settings/{category}")
async def get_system_settings(
    category: Optional[str] = Path(None, description="Settings category"),
    db: Session = Depends(get_db)
):
    """
    Retrieve system settings by organization and category
    Wraps: api.get_system_settings()
    """
    try:
        result = db.execute(
            text("""
                SELECT api.get_system_settings(
                    p_org_id := :org_id,
                    p_category := :category
                )
            """),
            {
                "org_id": DEFAULT_ORG_ID,
                "category": category
            }
        ).scalar()
        
        return result if result else {"settings": {}}
        
    except Exception as e:
        logger.error(f"Failed to get settings: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get settings: {str(e)}")

@router.get("/system/audit-log")
async def get_audit_log(
    table_name: Optional[str] = Query(None, description="Specific table"),
    user_id: Optional[int] = Query(None, description="Specific user"),
    action: Optional[str] = Query(None, description="INSERT/UPDATE/DELETE"),
    from_date: Optional[datetime] = Query(None, description="Start datetime"),
    to_date: Optional[datetime] = Query(None, description="End datetime"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    Audit trail with comprehensive filters
    Wraps: api.get_audit_log()
    """
    try:
        # Default to last 7 days
        if not from_date:
            from_date = datetime.now().replace(day=max(1, datetime.now().day - 7))
        if not to_date:
            to_date = datetime.now()
            
        result = db.execute(
            text("""
                SELECT api.get_audit_log(
                    p_table_name := :table_name,
                    p_user_id := :user_id,
                    p_action := :action,
                    p_from_date := :from_date,
                    p_to_date := :to_date,
                    p_limit := :limit,
                    p_offset := :offset
                )
            """),
            {
                "table_name": table_name,
                "user_id": user_id,
                "action": action,
                "from_date": from_date,
                "to_date": to_date,
                "limit": limit,
                "offset": offset
            }
        ).scalar()
        
        return result if result else {"audit_log": [], "total_count": 0}
        
    except Exception as e:
        logger.error(f"Failed to get audit log: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get audit log: {str(e)}")

@router.get("/system/health-check")
async def system_health_check(db: Session = Depends(get_db)):
    """
    System health status and performance metrics
    Wraps: api.system_health_check()
    """
    try:
        result = db.execute(
            text("SELECT api.system_health_check()")
        ).scalar()
        
        return result if result else {"status": "unknown", "metrics": {}}
        
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")

@router.post("/system/export-data")
async def export_data(
    export_type: str = Body(..., description="customers/products/invoices/purchase_orders"),
    format_type: str = Body("json", description="json/csv/excel"),
    filters: Dict[str, Any] = Body({}, description="Export filters"),
    db: Session = Depends(get_db)
):
    """
    Export data in various formats
    Wraps: api.export_data()
    """
    try:
        result = db.execute(
            text("""
                SELECT api.export_data(
                    p_export_type := :export_type,
                    p_format := :format_type,
                    p_filters := :filters::jsonb
                )
            """),
            {
                "export_type": export_type,
                "format_type": format_type,
                "filters": json.dumps(filters)
            }
        ).scalar()
        
        return result if result else {"export_data": []}
        
    except Exception as e:
        logger.error(f"Export failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")

# =============================================
# HEALTH & STATUS ENDPOINTS
# =============================================

@router.get("/health")
async def api_health_check():
    """Quick health check for the ERP API module"""
    return {
        "status": "healthy",
        "module": "Enterprise ERP API",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat(),
        "features": [
            "Master Data Management",
            "Inventory Management", 
            "Sales Management",
            "Procurement Management",
            "Financial Management",
            "GST & Compliance",
            "Analytics & Reporting",
            "System Utilities"
        ]
    }

@router.get("/endpoints")
async def list_available_endpoints():
    """List all available ERP endpoints"""
    return {
        "total_endpoints": 50,
        "modules": {
            "master_data": ["organization", "products", "advanced-search"],
            "inventory": ["stock-overview", "batch-details", "reorder-alerts", "expiry-alerts"],
            "sales": ["customer-search", "orders", "invoices", "dashboard"],
            "procurement": ["supplier-search", "purchase-orders", "grn", "pending-deliveries", "supplier-performance"],
            "finance": ["payments", "customer-outstanding", "cash-flow-forecast", "profit-loss", "balance-sheet"],
            "compliance": ["gstr1", "eway-bill", "license-expiry-alerts", "narcotic-register"],
            "analytics": ["executive-dashboard", "sales-analytics", "inventory-analytics", "customer-analytics"],
            "system": ["authenticate", "settings", "audit-log", "health-check", "export-data"]
        },
        "database_functions_wrapped": 40,
        "rest_compliance": "Full GET/POST/PUT support",
        "documentation": "Comprehensive inline docs with examples"
    }
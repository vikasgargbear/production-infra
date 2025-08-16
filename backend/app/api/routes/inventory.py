"""
Inventory management endpoints for enterprise pharma system
Handles batch tracking, stock movements, and expiry management
"""
from typing import Optional, List
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

from ...core.database import get_db
from ...core.config import DEFAULT_ORG_ID
from ..schemas.inventory import (
    BatchCreate, BatchResponse, StockMovementCreate,
    StockMovementResponse, StockAdjustment,
    CurrentStock, ExpiryAlert,
    StockValuation, InventoryDashboard
)
from ..services.inventory_service import InventoryService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["inventory"])

@router.post("/batches", response_model=BatchResponse)
async def create_batch(
    batch: BatchCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new batch for a product
    
    - Validates product exists
    - Checks for duplicate batch numbers
    - Records initial stock movement
    - Tracks expiry dates
    """
    try:
        return InventoryService.create_batch(db, batch)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating batch: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create batch: {str(e)}")

@router.get("/batches/{batch_id}", response_model=BatchResponse)
async def get_batch(
    batch_id: int,
    db: Session = Depends(get_db)
):
    """Get batch details with stock calculations"""
    try:
        return InventoryService.get_batch(db, batch_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting batch: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get batch: {str(e)}")

@router.get("/batches")
async def list_batches(
    product_id: Optional[int] = None,
    expiring_in_days: Optional[int] = None,
    location: Optional[str] = None,
    include_expired: bool = False,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """
    List batches with filters
    
    - Filter by product, location, expiry
    - Option to include/exclude expired batches
    - Shows stock levels and values
    """
    try:
        query = """
            SELECT b.*, p.product_name, p.product_code,
                   b.expiry_date - CURRENT_DATE as days_to_expiry,
                   b.quantity_available * b.cost_per_unit as stock_value
            FROM inventory.batches b
            JOIN inventory.products p ON b.product_id = p.product_id
            WHERE b.org_id = :org_id
        """
        params = {"org_id": DEFAULT_ORG_ID}
        
        if product_id:
            query += " AND b.product_id = :product_id"
            params["product_id"] = product_id
        
        if location:
            query += " AND b.location_code ILIKE :location"
            params["location"] = f"%{location}%"
        
        if not include_expired:
            query += " AND (b.expiry_date IS NULL OR b.expiry_date > CURRENT_DATE)"
        
        if expiring_in_days:
            query += " AND b.expiry_date <= CURRENT_DATE + INTERVAL ':days days'"
            params["days"] = expiring_in_days
        
        # Get count
        count_query = f"SELECT COUNT(*) FROM ({query}) t"
        total = db.execute(text(count_query), params).scalar()
        
        # Get batches
        query += " ORDER BY b.expiry_date, b.batch_id LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        
        batches = []
        for row in result:
            batch = dict(row._mapping)
            batch["is_expired"] = batch.get("days_to_expiry", 0) <= 0
            batch["is_near_expiry"] = 0 < batch.get("days_to_expiry", 999) <= 90
            batches.append(batch)
        
        return {
            "total": total,
            "batches": batches
        }
        
    except Exception as e:
        logger.error(f"Error listing batches: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list batches: {str(e)}")

@router.get("/stock/current/{product_id}", response_model=CurrentStock)
async def get_current_stock(
    product_id: int,
    db: Session = Depends(get_db)
):
    """Get current stock summary for a product"""
    try:
        return InventoryService.get_current_stock(db, product_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting stock: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get stock: {str(e)}")

@router.get("/stock/current")
async def list_current_stock(
    category: Optional[str] = None,
    low_stock_only: bool = False,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """
    List current stock levels for all products
    
    - Shows total, available, and allocated quantities
    - Highlights low stock items
    - Includes stock valuation
    """
    try:
        query = """
            SELECT 
                p.product_id, p.product_code, p.product_name, p.category_id,
                COALESCE(b.total_quantity, 0) as total_quantity,
                COALESCE(b.available_quantity, 0) as available_quantity,
                COALESCE(b.allocated_quantity, 0) as allocated_quantity,
                COALESCE(b.total_batches, 0) as total_batches,
                COALESCE(b.expired_batches, 0) as expired_batches,
                COALESCE(b.near_expiry_batches, 0) as near_expiry_batches,
                COALESCE(b.total_value, 0) as total_value,
                COALESCE(b.average_cost, 0) as average_cost
            FROM inventory.products p
            LEFT JOIN (
                SELECT 
                    product_id,
                    COUNT(*) as total_batches,
                    SUM(quantity_available) as total_quantity,
                    SUM(quantity_available) as available_quantity,
                    SUM(COALESCE(quantity_reserved, 0)) as allocated_quantity,
                    SUM(quantity_available * cost_per_unit) as total_value,
                    AVG(cost_per_unit) as average_cost,
                    COUNT(CASE WHEN expiry_date <= CURRENT_DATE THEN 1 END) as expired_batches,
                    COUNT(CASE WHEN expiry_date > CURRENT_DATE AND expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN 1 END) as near_expiry_batches
                FROM inventory.batches
                WHERE org_id = :org_id
                GROUP BY product_id
            ) b ON p.product_id = b.product_id
            WHERE p.org_id = :org_id
        """
        params = {"org_id": DEFAULT_ORG_ID}
        
        if category:
            query += " AND p.category_id = :category"
            params["category"] = category
        
        if low_stock_only:
            query += " AND COALESCE(b.total_quantity, 0) <= 10"  # Low stock threshold
        
        # Get count
        count_query = f"SELECT COUNT(*) FROM ({query}) t"
        total = db.execute(text(count_query), params).scalar()
        
        # Get products
        query += " ORDER BY p.product_name LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        
        stocks = []
        for row in result:
            stock = dict(row._mapping)
            stock["is_below_minimum"] = stock["total_quantity"] < 10  # Default threshold
            stock["is_below_reorder"] = stock["total_quantity"] <= 20  # Default threshold
            stocks.append(CurrentStock(**stock))
        
        return {
            "total": total,
            "stocks": stocks
        }
        
    except Exception as e:
        logger.error(f"Error listing stock: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list stock: {str(e)}")

@router.post("/movements", response_model=StockMovementResponse)
async def record_stock_movement(
    movement: StockMovementCreate,
    db: Session = Depends(get_db)
):
    """
    Record a stock movement
    
    - Validates stock availability for outward movements
    - Updates batch quantities
    - Maintains movement history
    """
    try:
        return InventoryService.record_stock_movement(db, movement)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error recording movement: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to record movement: {str(e)}")

@router.get("/movements")
async def list_stock_movements(
    product_id: Optional[int] = None,
    movement_type: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """List stock movements with filters"""
    try:
        # Build movement query from transaction tables since inventory_movements was dropped
        query = """
            WITH movements AS (
                -- Sales movements (outbound)
                SELECT 
                    ii.invoice_item_id as movement_id,
                    'sale' as movement_type,
                    ii.product_id,
                    ii.batch_id,
                    0 as quantity_in,
                    ii.quantity as quantity_out,
                    i.invoice_date as movement_date,
                    i.invoice_number as reference_number,
                    i.org_id,
                    p.product_name,
                    p.product_code,
                    b.batch_number
                FROM sales.invoice_items ii
                JOIN sales.invoices i ON ii.invoice_id = i.invoice_id
                JOIN inventory.products p ON ii.product_id = p.product_id
                LEFT JOIN inventory.batches b ON ii.batch_id = b.batch_id
                WHERE i.org_id = :org_id
                
                UNION ALL
                
                -- Purchase movements (inbound)
                SELECT 
                    gi.grn_item_id as movement_id,
                    'purchase' as movement_type,
                    gi.product_id,
                    NULL as batch_id,  -- grn_items uses batch_number, not batch_id
                    gi.received_quantity as quantity_in,
                    0 as quantity_out,
                    g.received_at::date as movement_date,
                    g.grn_number as reference_number,
                    g.org_id,
                    p.product_name,
                    p.product_code,
                    gi.batch_number
                FROM procurement.grn_items gi
                JOIN procurement.goods_receipt_notes g ON gi.grn_id = g.grn_id
                JOIN inventory.products p ON gi.product_id = p.product_id
                WHERE g.org_id = :org_id
            )
            SELECT * FROM movements WHERE 1=1
        """
        params = {"org_id": DEFAULT_ORG_ID}
        
        if product_id:
            query += " AND product_id = :product_id"
            params["product_id"] = product_id
        
        if movement_type:
            query += " AND movement_type = :movement_type"
            params["movement_type"] = movement_type
        
        if from_date:
            query += " AND movement_date >= :from_date"
            params["from_date"] = from_date
        
        if to_date:
            query += " AND movement_date <= :to_date"
            params["to_date"] = to_date
        
        # Get count
        count_query = f"SELECT COUNT(*) FROM ({query}) t"
        total = db.execute(text(count_query), params).scalar()
        
        # Get movements
        query += " ORDER BY im.created_at DESC LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        movements = [dict(row._mapping) for row in result]
        
        return {
            "total": total,
            "movements": movements
        }
        
    except Exception as e:
        logger.error(f"Error listing movements: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list movements: {str(e)}")

@router.post("/stock/adjustment", response_model=StockMovementResponse)
async def adjust_stock(
    adjustment: StockAdjustment,
    db: Session = Depends(get_db)
):
    """
    Adjust stock for damage, expiry, counting, etc.
    
    - Records adjustment reason
    - Updates stock levels
    - Maintains audit trail
    """
    try:
        return InventoryService.process_stock_adjustment(db, adjustment, DEFAULT_ORG_ID)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error adjusting stock: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to adjust stock: {str(e)}")

@router.get("/expiry/alerts", response_model=List[ExpiryAlert])
async def get_expiry_alerts(
    days_ahead: int = Query(180, ge=1, le=365),
    alert_level: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get expiry alerts for products
    
    - Shows products expiring within specified days
    - Categorizes by alert level (critical, warning, info)
    - Includes stock value at risk
    """
    try:
        alerts = InventoryService.get_expiry_alerts(db, DEFAULT_ORG_ID, days_ahead)
        
        if alert_level:
            alerts = [a for a in alerts if a.alert_level == alert_level]
        
        return alerts
        
    except Exception as e:
        logger.error(f"Error getting expiry alerts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get expiry alerts: {str(e)}")

@router.get("/valuation", response_model=StockValuation)
async def get_stock_valuation(
    as_of_date: Optional[date] = None,
    db: Session = Depends(get_db)
):
    """
    Get stock valuation report
    
    - Total stock value
    - Expired stock value
    - Near-expiry stock value
    - Category-wise breakdown
    """
    try:
        return InventoryService.get_stock_valuation(db, DEFAULT_ORG_ID, as_of_date)
    except Exception as e:
        logger.error(f"Error getting valuation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get valuation: {str(e)}")

@router.get("/dashboard", response_model=InventoryDashboard)
async def get_inventory_dashboard(db: Session = Depends(get_db)):
    """
    Get inventory dashboard summary
    
    - Stock overview
    - Alert counts
    - Fast/slow moving products
    - Expiry alerts
    """
    try:
        return InventoryService.get_inventory_dashboard(db, DEFAULT_ORG_ID)
    except Exception as e:
        logger.error(f"Error getting dashboard: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get dashboard: {str(e)}")
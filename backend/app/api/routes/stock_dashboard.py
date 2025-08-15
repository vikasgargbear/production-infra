"""
Stock Dashboard API Router
Provides stock management dashboard data and metrics
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import datetime, date, timedelta

from ...core.database import get_db
from ...core.config import DEFAULT_ORG_ID

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stock", tags=["stock-dashboard"])

@router.get("/dashboard")
def get_stock_dashboard(db: Session = Depends(get_db)):
    """Get stock dashboard metrics"""
    try:
        dashboard_data = {}
        
        # Get total products
        total_products_query = """
            SELECT COUNT(*) as total_products
            FROM inventory.products
            WHERE org_id = :org_id AND is_active = true
        """
        result = db.execute(text(total_products_query), {"org_id": DEFAULT_ORG_ID})
        dashboard_data["total_products"] = result.scalar() or 0
        
        # Get total batches
        total_batches_query = """
            SELECT COUNT(*) as total_batches
            FROM inventory.batches
            WHERE org_id = :org_id
        """
        result = db.execute(text(total_batches_query), {"org_id": DEFAULT_ORG_ID})
        dashboard_data["total_batches"] = result.scalar() or 0
        
        # Get recent movements count (last 7 days)
        recent_movements_query = """
            SELECT COUNT(*) as recent_movements
            FROM inventory.inventory_movements
            WHERE org_id = :org_id 
              AND movement_date >= :week_ago
        """
        week_ago = datetime.now() - timedelta(days=7)
        result = db.execute(text(recent_movements_query), {
            "org_id": DEFAULT_ORG_ID,
            "week_ago": week_ago
        })
        dashboard_data["recent_movements"] = result.scalar() or 0
        
        # Get stock value estimate (simple calculation)
        try:
            stock_value_query = """
                SELECT COALESCE(SUM(current_stock * purchase_rate), 0) as stock_value
                FROM inventory.products
                WHERE org_id = :org_id 
                  AND current_stock > 0 
                  AND purchase_rate > 0
            """
            result = db.execute(text(stock_value_query), {"org_id": DEFAULT_ORG_ID})
            dashboard_data["estimated_stock_value"] = float(result.scalar() or 0)
        except:
            dashboard_data["estimated_stock_value"] = 0
        
        # Get low stock alerts count
        try:
            low_stock_query = """
                SELECT COUNT(*) as low_stock_count
                FROM inventory.products
                WHERE org_id = :org_id 
                  AND current_stock <= minimum_stock_level
                  AND minimum_stock_level > 0
                  AND is_active = true
            """
            result = db.execute(text(low_stock_query), {"org_id": DEFAULT_ORG_ID})
            dashboard_data["low_stock_alerts"] = result.scalar() or 0
        except:
            dashboard_data["low_stock_alerts"] = 0
        
        return {
            "success": True,
            "data": dashboard_data,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error fetching stock dashboard: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get stock dashboard: {str(e)}")

@router.get("/current")
def get_current_stock(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, description="Search products"),
    category: Optional[str] = Query(None, description="Filter by category"),
    low_stock_only: bool = Query(False, description="Show only low stock items"),
    db: Session = Depends(get_db)
):
    """Get current stock levels for all products"""
    try:
        query = """
            SELECT 
                p.product_id,
                p.product_name,
                p.brand_name,
                p.generic_name,
                p.category,
                p.current_stock,
                p.minimum_stock_level,
                p.maximum_stock_level,
                p.purchase_rate,
                p.selling_rate,
                p.pack_size,
                p.base_unit,
                CASE 
                    WHEN p.minimum_stock_level > 0 AND p.current_stock <= p.minimum_stock_level 
                    THEN 'low'
                    WHEN p.current_stock = 0 
                    THEN 'out_of_stock'
                    ELSE 'normal'
                END as stock_status,
                p.last_updated
            FROM inventory.products p
            WHERE p.org_id = :org_id AND p.is_active = true
        """
        params = {"org_id": DEFAULT_ORG_ID}
        
        if search:
            query += " AND (LOWER(p.product_name) LIKE LOWER(:search) OR LOWER(p.generic_name) LIKE LOWER(:search))"
            params["search"] = f"%{search}%"
        
        if category:
            query += " AND p.category = :category"
            params["category"] = category
            
        if low_stock_only:
            query += " AND p.minimum_stock_level > 0 AND p.current_stock <= p.minimum_stock_level"
        
        query += " ORDER BY p.product_name LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        products = [dict(row._mapping) for row in result]
        
        # Get total count for pagination
        count_query = """
            SELECT COUNT(*) 
            FROM inventory.products p
            WHERE p.org_id = :org_id AND p.is_active = true
        """
        count_params = {"org_id": DEFAULT_ORG_ID}
        
        if search:
            count_query += " AND (LOWER(p.product_name) LIKE LOWER(:search) OR LOWER(p.generic_name) LIKE LOWER(:search))"
            count_params["search"] = f"%{search}%"
        
        if category:
            count_query += " AND p.category = :category"
            count_params["category"] = category
            
        if low_stock_only:
            count_query += " AND p.minimum_stock_level > 0 AND p.current_stock <= p.minimum_stock_level"
        
        total_result = db.execute(text(count_query), count_params)
        total_count = total_result.scalar() or 0
        
        return {
            "success": True,
            "data": {
                "products": products,
                "total": total_count,
                "page": skip // limit + 1,
                "per_page": limit,
                "has_more": (skip + limit) < total_count
            }
        }
        
    except Exception as e:
        logger.error(f"Error fetching current stock: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get current stock: {str(e)}")

@router.get("/alerts")
def get_stock_alerts(db: Session = Depends(get_db)):
    """Get stock alerts for low stock and out of stock items"""
    try:
        query = """
            SELECT 
                p.product_id,
                p.product_name,
                p.brand_name,
                p.current_stock,
                p.minimum_stock_level,
                CASE 
                    WHEN p.current_stock = 0 THEN 'out_of_stock'
                    WHEN p.current_stock <= p.minimum_stock_level THEN 'low_stock'
                    ELSE 'normal'
                END as alert_type,
                p.category,
                p.last_updated
            FROM inventory.products p
            WHERE p.org_id = :org_id 
              AND p.is_active = true
              AND p.minimum_stock_level > 0
              AND p.current_stock <= p.minimum_stock_level
            ORDER BY 
                CASE WHEN p.current_stock = 0 THEN 1 ELSE 2 END,
                p.current_stock ASC,
                p.product_name
        """
        
        result = db.execute(text(query), {"org_id": DEFAULT_ORG_ID})
        alerts = [dict(row._mapping) for row in result]
        
        # Categorize alerts
        out_of_stock = [alert for alert in alerts if alert["alert_type"] == "out_of_stock"]
        low_stock = [alert for alert in alerts if alert["alert_type"] == "low_stock"]
        
        return {
            "success": True,
            "data": {
                "total_alerts": len(alerts),
                "out_of_stock": {
                    "count": len(out_of_stock),
                    "items": out_of_stock
                },
                "low_stock": {
                    "count": len(low_stock),
                    "items": low_stock
                }
            }
        }
        
    except Exception as e:
        logger.error(f"Error fetching stock alerts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get stock alerts: {str(e)}")

@router.get("/recent-movements")
def get_recent_movements(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db)
):
    """Get recent stock movements"""
    try:
        query = """
            SELECT 
                movement_id,
                movement_type,
                product_id,
                batch_id,
                quantity_in,
                quantity_out,
                movement_date,
                reference_number,
                notes,
                performed_by
            FROM inventory.inventory_movements
            WHERE org_id = :org_id
            ORDER BY movement_date DESC, movement_id DESC
            LIMIT :limit
        """
        
        result = db.execute(text(query), {
            "org_id": DEFAULT_ORG_ID,
            "limit": limit
        })
        movements = [dict(row._mapping) for row in result]
        
        return {
            "success": True,
            "data": movements
        }
        
    except Exception as e:
        logger.error(f"Error fetching recent movements: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get recent movements: {str(e)}")
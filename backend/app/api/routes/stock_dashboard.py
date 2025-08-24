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
from ...core.auth_utils import get_org_id_from_header

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
        
        # Get recent movements count (last 7 days) - using sales data from movement_summary view
        recent_movements_query = """
            SELECT COUNT(*) as recent_movements
            FROM inventory.movement_summary
            WHERE org_id = :org_id 
              AND movement_date >= :week_ago
        """
        week_ago = datetime.now() - timedelta(days=7)
        result = db.execute(text(recent_movements_query), {
            "org_id": DEFAULT_ORG_ID,
            "week_ago": week_ago
        })
        dashboard_data["recent_movements"] = result.scalar() or 0
        
        # Get stock value estimate from batches
        try:
            stock_value_query = """
                SELECT COALESCE(SUM(quantity_available * cost_per_unit), 0) as stock_value
                FROM inventory.batches
                WHERE org_id = :org_id 
                  AND quantity_available > 0 
                  AND cost_per_unit > 0
                  AND batch_status = 'active'
            """
            result = db.execute(text(stock_value_query), {"org_id": DEFAULT_ORG_ID})
            dashboard_data["estimated_stock_value"] = float(result.scalar() or 0)
        except:
            dashboard_data["estimated_stock_value"] = 0
        
        # Get low stock alerts count from aggregated batch data
        try:
            low_stock_query = """
                WITH product_stock AS (
                    SELECT 
                        p.product_id,
                        p.min_stock_quantity,
                        COALESCE(SUM(b.quantity_available), 0) as total_stock
                    FROM inventory.products p
                    LEFT JOIN inventory.batches b ON p.product_id = b.product_id 
                        AND b.org_id = :org_id 
                        AND b.batch_status = 'active'
                    WHERE p.org_id = :org_id AND p.is_active = true
                    GROUP BY p.product_id, p.min_stock_quantity
                )
                SELECT COUNT(*) as low_stock_count
                FROM product_stock
                WHERE min_stock_quantity > 0
                  AND total_stock <= min_stock_quantity
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
            WITH product_stock AS (
                SELECT 
                    p.product_id,
                    p.product_name,
                    p.generic_name,
                    p.min_stock_quantity as minimum_stock_level,
                    COALESCE(SUM(b.quantity_available), 0) as current_stock,
                    AVG(b.cost_per_unit) as avg_cost,
                    AVG(b.sale_price_per_unit) as avg_selling_price,
                    -- Get pack config from most recent batch
                    FIRST_VALUE(b.pack_size) OVER (PARTITION BY p.product_id ORDER BY b.batch_id DESC) as pack_size,
                    FIRST_VALUE(b.base_uom) OVER (PARTITION BY p.product_id ORDER BY b.batch_id DESC) as base_unit,
                    FIRST_VALUE(b.category_name) OVER (PARTITION BY p.product_id ORDER BY b.batch_id DESC) as category,
                    p.updated_at as last_updated,
                    ROW_NUMBER() OVER (PARTITION BY p.product_id ORDER BY p.product_id) as rn
                FROM inventory.products p
                LEFT JOIN inventory.batches b ON p.product_id = b.product_id 
                    AND b.org_id = :org_id 
                    AND b.batch_status = 'active'
                WHERE p.org_id = :org_id AND p.is_active = true
                GROUP BY p.product_id, p.product_name, p.generic_name, p.min_stock_quantity, p.updated_at, b.batch_id, b.pack_size, b.base_uom, b.category_name
            )
            SELECT 
                product_id,
                product_name,
                generic_name,
                category,
                current_stock,
                minimum_stock_level,
                minimum_stock_level as maximum_stock_level, -- Default to same as minimum
                avg_cost as purchase_rate,
                avg_selling_price as selling_rate,
                pack_size,
                base_unit,
                CASE 
                    WHEN minimum_stock_level > 0 AND current_stock <= minimum_stock_level 
                    THEN 'low'
                    WHEN current_stock = 0 
                    THEN 'out_of_stock'
                    ELSE 'normal'
                END as stock_status,
                last_updated
            FROM product_stock 
            WHERE rn = 1
        """
        params = {"org_id": DEFAULT_ORG_ID}
        
        if search:
            query += " AND (LOWER(product_name) LIKE LOWER(:search) OR LOWER(generic_name) LIKE LOWER(:search))"
            params["search"] = f"%{search}%"
        
        if category:
            query += " AND category = :category"
            params["category"] = category
            
        if low_stock_only:
            query += " AND minimum_stock_level > 0 AND current_stock <= minimum_stock_level"
        
        query += " ORDER BY product_name LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        products = [dict(row._mapping) for row in result]
        
        # Get total count for pagination
        count_query = """
            SELECT COUNT(DISTINCT p.product_id) 
            FROM inventory.products p
            WHERE p.org_id = :org_id AND p.is_active = true
        """
        count_params = {"org_id": DEFAULT_ORG_ID}
        
        if search:
            count_query += " AND (LOWER(p.product_name) LIKE LOWER(:search) OR LOWER(p.generic_name) LIKE LOWER(:search))"
            count_params["search"] = f"%{search}%"
        
        if category:
            count_query += " AND EXISTS (SELECT 1 FROM inventory.batches b WHERE b.product_id = p.product_id AND b.category_name = :category)"
            count_params["category"] = category
            
        if low_stock_only:
            count_query += """
                AND p.min_stock_quantity > 0 
                AND COALESCE((SELECT SUM(quantity_available) FROM inventory.batches WHERE product_id = p.product_id AND batch_status = 'active'), 0) <= p.min_stock_quantity
            """
        
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
            WITH product_alerts AS (
                SELECT 
                    p.product_id,
                    p.product_name,
                    p.generic_name,
                    COALESCE(SUM(b.quantity_available), 0) as current_stock,
                    p.min_stock_quantity as minimum_stock_level,
                    FIRST_VALUE(b.category_name) OVER (PARTITION BY p.product_id ORDER BY b.batch_id DESC) as category,
                    p.updated_at as last_updated
                FROM inventory.products p
                LEFT JOIN inventory.batches b ON p.product_id = b.product_id 
                    AND b.org_id = :org_id 
                    AND b.batch_status = 'active'
                WHERE p.org_id = :org_id 
                  AND p.is_active = true
                  AND p.min_stock_quantity > 0
                GROUP BY p.product_id, p.product_name, p.generic_name, p.min_stock_quantity, p.updated_at
                HAVING COALESCE(SUM(b.quantity_available), 0) <= p.min_stock_quantity
            )
            SELECT 
                product_id,
                product_name,
                generic_name as brand_name,
                current_stock,
                minimum_stock_level,
                CASE 
                    WHEN current_stock = 0 THEN 'out_of_stock'
                    WHEN current_stock <= minimum_stock_level THEN 'low_stock'
                    ELSE 'normal'
                END as alert_type,
                category,
                last_updated
            FROM product_alerts
            ORDER BY 
                CASE WHEN current_stock = 0 THEN 1 ELSE 2 END,
                current_stock ASC,
                product_name
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
        # Get recent movements from actual transaction tables since inventory_movements was dropped
        query = """
            WITH recent_movements AS (
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
                    'Sales Invoice' as notes,
                    i.created_by as performed_by
                FROM sales.invoice_items ii
                JOIN sales.invoices i ON ii.invoice_id = i.invoice_id
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
                    'Goods Receipt' as notes,
                    g.received_by as performed_by
                FROM procurement.grn_items gi
                JOIN procurement.goods_receipt_notes g ON gi.grn_id = g.grn_id
                WHERE g.org_id = :org_id
            )
            SELECT * FROM recent_movements
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
"""
Dashboard API Router
Provides analytics and dashboard data for the pharma system
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import date, datetime, timedelta

from ...database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])

@router.get("/stats")
def get_dashboard_stats(db: Session = Depends(get_db)):
    """Get overall dashboard statistics"""
    try:
        # Get basic counts
        stats_query = """
            SELECT 
                (SELECT COUNT(*) FROM products WHERE is_active = true) as total_products,
                (SELECT COUNT(*) FROM customers) as total_customers,
                (SELECT COUNT(*) FROM orders WHERE order_date >= CURRENT_DATE - INTERVAL '30 days') as orders_this_month,
                (SELECT COUNT(*) FROM suppliers) as total_suppliers,
                (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE order_date >= CURRENT_DATE - INTERVAL '30 days') as revenue_this_month,
                (SELECT COUNT(*) FROM batches WHERE quantity_available > 0) as active_batches,
                (SELECT COUNT(*) FROM batches WHERE expiry_date <= CURRENT_DATE + INTERVAL '30 days' AND quantity_available > 0) as expiring_soon
        """
        
        result = db.execute(text(stats_query))
        stats = dict(result.first()._mapping)
        
        # Get low stock alerts
        low_stock_query = """
            SELECT COUNT(*) as low_stock_products
            FROM (
                SELECT p.product_id, 
                       COALESCE(SUM(b.quantity_available), 0) as total_stock,
                       p.minimum_stock_level
                FROM products p
                LEFT JOIN batches b ON p.product_id = b.product_id AND b.quantity_available > 0
                WHERE p.is_active = true
                GROUP BY p.product_id, p.minimum_stock_level
                HAVING COALESCE(SUM(b.quantity_available), 0) <= COALESCE(p.minimum_stock_level, 0)
            ) as low_stock
        """
        
        low_stock_result = db.execute(text(low_stock_query))
        low_stock_count = low_stock_result.scalar()
        stats["low_stock_products"] = low_stock_count
        
        return stats
        
    except Exception as e:
        logger.error(f"Error fetching dashboard stats: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get dashboard stats: {str(e)}")

@router.get("/recent-orders")
def get_recent_orders(
    limit: int = Query(10, description="Number of recent orders to fetch"),
    db: Session = Depends(get_db)
):
    """Get recent orders for dashboard"""
    try:
        query = """
            SELECT 
                o.order_id,
                o.customer_id,
                c.customer_name,
                o.order_date,
                o.total_amount,
                o.order_status,
                o.delivery_status
            FROM orders o
            LEFT JOIN customers c ON o.customer_id = c.customer_id
            ORDER BY o.order_date DESC
            LIMIT :limit
        """
        
        result = db.execute(text(query), {"limit": limit})
        orders = [dict(row._mapping) for row in result]
        
        return orders
        
    except Exception as e:
        logger.error(f"Error fetching recent orders: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get recent orders: {str(e)}")

@router.get("/revenue")
def get_revenue_data(
    period: str = Query("monthly", description="Period: daily, weekly, monthly"),
    start_date: Optional[date] = Query(None, description="Start date for custom range"),
    end_date: Optional[date] = Query(None, description="End date for custom range"),
    db: Session = Depends(get_db)
):
    """Get revenue data for charts"""
    try:
        if period == "daily":
            # Last 30 days
            query = """
                SELECT 
                    DATE(order_date) as period,
                    COUNT(*) as order_count,
                    COALESCE(SUM(total_amount), 0) as revenue
                FROM orders 
                WHERE order_date >= CURRENT_DATE - INTERVAL '30 days'
                AND order_status IN ('confirmed', 'delivered')
                GROUP BY DATE(order_date)
                ORDER BY period DESC
            """
        elif period == "weekly":
            # Last 12 weeks
            query = """
                SELECT 
                    DATE_TRUNC('week', order_date) as period,
                    COUNT(*) as order_count,
                    COALESCE(SUM(total_amount), 0) as revenue
                FROM orders 
                WHERE order_date >= CURRENT_DATE - INTERVAL '12 weeks'
                AND order_status IN ('confirmed', 'delivered')
                GROUP BY DATE_TRUNC('week', order_date)
                ORDER BY period DESC
            """
        else:  # monthly
            query = """
                SELECT 
                    DATE_TRUNC('month', order_date) as period,
                    COUNT(*) as order_count,
                    COALESCE(SUM(total_amount), 0) as revenue
                FROM orders 
                WHERE order_date >= CURRENT_DATE - INTERVAL '12 months'
                AND order_status IN ('confirmed', 'delivered')
                GROUP BY DATE_TRUNC('month', order_date)
                ORDER BY period DESC
            """
        
        params = {}
        if start_date and end_date:
            query = query.replace("WHERE order_date >=", "WHERE order_date >= :start_date AND order_date <= :end_date AND order_date >=")
            params = {"start_date": start_date, "end_date": end_date}
        
        result = db.execute(text(query), params)
        revenue_data = [dict(row._mapping) for row in result]
        
        return revenue_data
        
    except Exception as e:
        logger.error(f"Error fetching revenue data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get revenue data: {str(e)}")

@router.get("/top-products")
def get_top_products(
    limit: int = Query(10, description="Number of top products"),
    period_days: int = Query(30, description="Period in days"),
    db: Session = Depends(get_db)
):
    """Get top selling products"""
    try:
        query = """
            SELECT 
                p.product_id,
                p.product_name,
                p.brand_name,
                SUM(oi.quantity) as total_quantity_sold,
                SUM(oi.quantity * oi.price) as total_revenue,
                COUNT(DISTINCT oi.order_id) as order_count
            FROM order_items oi
            JOIN products p ON oi.product_id = p.product_id
            JOIN orders o ON oi.order_id = o.order_id
            WHERE o.order_date >= CURRENT_DATE - INTERVAL ':period_days days'
            AND o.order_status IN ('confirmed', 'delivered')
            GROUP BY p.product_id, p.product_name, p.brand_name
            ORDER BY total_quantity_sold DESC
            LIMIT :limit
        """
        
        result = db.execute(text(query), {"limit": limit, "period_days": period_days})
        top_products = [dict(row._mapping) for row in result]
        
        return top_products
        
    except Exception as e:
        logger.error(f"Error fetching top products: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get top products: {str(e)}")

@router.get("/inventory-alerts")
def get_inventory_alerts(db: Session = Depends(get_db)):
    """Get inventory alerts (low stock, expiring soon)"""
    try:
        # Low stock products
        low_stock_query = """
            SELECT 
                p.product_id,
                p.product_name,
                p.brand_name,
                COALESCE(SUM(b.quantity_available), 0) as current_stock,
                p.minimum_stock_level,
                'low_stock' as alert_type
            FROM products p
            LEFT JOIN batches b ON p.product_id = b.product_id AND b.quantity_available > 0
            WHERE p.is_active = true
            GROUP BY p.product_id, p.product_name, p.brand_name, p.minimum_stock_level
            HAVING COALESCE(SUM(b.quantity_available), 0) <= COALESCE(p.minimum_stock_level, 0)
            AND p.minimum_stock_level > 0
            ORDER BY current_stock ASC
            LIMIT 20
        """
        
        # Expiring soon products
        expiring_query = """
            SELECT 
                b.batch_id,
                p.product_id,
                p.product_name,
                p.brand_name,
                b.batch_number,
                b.expiry_date,
                b.quantity_available,
                'expiring_soon' as alert_type
            FROM batches b
            JOIN products p ON b.product_id = p.product_id
            WHERE b.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
            AND b.quantity_available > 0
            ORDER BY b.expiry_date ASC
            LIMIT 20
        """
        
        low_stock_result = db.execute(text(low_stock_query))
        low_stock = [dict(row._mapping) for row in low_stock_result]
        
        expiring_result = db.execute(text(expiring_query))
        expiring = [dict(row._mapping) for row in expiring_result]
        
        return {
            "low_stock_products": low_stock,
            "expiring_products": expiring
        }
        
    except Exception as e:
        logger.error(f"Error fetching inventory alerts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get inventory alerts: {str(e)}")

@router.get("/customer-analytics")
def get_customer_analytics(
    limit: int = Query(10, description="Number of top customers"),
    period_days: int = Query(30, description="Period in days"),
    db: Session = Depends(get_db)
):
    """Get customer analytics"""
    try:
        query = """
            SELECT 
                c.customer_id,
                c.customer_name,
                c.customer_phone,
                COUNT(o.order_id) as total_orders,
                COALESCE(SUM(o.total_amount), 0) as total_spent,
                AVG(o.total_amount) as avg_order_value,
                MAX(o.order_date) as last_order_date
            FROM customers c
            LEFT JOIN orders o ON c.customer_id = o.customer_id 
                AND o.order_date >= CURRENT_DATE - INTERVAL ':period_days days'
                AND o.order_status IN ('confirmed', 'delivered')
            GROUP BY c.customer_id, c.customer_name, c.customer_phone
            HAVING COUNT(o.order_id) > 0
            ORDER BY total_spent DESC
            LIMIT :limit
        """
        
        result = db.execute(text(query), {"limit": limit, "period_days": period_days})
        customer_analytics = [dict(row._mapping) for row in result]
        
        return customer_analytics
        
    except Exception as e:
        logger.error(f"Error fetching customer analytics: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get customer analytics: {str(e)}")

@router.get("/financial-summary")
def get_financial_summary(
    start_date: Optional[date] = Query(None, description="Start date"),
    end_date: Optional[date] = Query(None, description="End date"),
    db: Session = Depends(get_db)
):
    """Get financial summary"""
    try:
        # Default to current month if no dates provided
        if not start_date:
            start_date = datetime.now().replace(day=1).date()
        if not end_date:
            end_date = datetime.now().date()
            
        query = """
            SELECT 
                COALESCE(SUM(CASE WHEN order_status IN ('confirmed', 'delivered') THEN total_amount END), 0) as total_revenue,
                COALESCE(SUM(CASE WHEN order_status = 'pending' THEN total_amount END), 0) as pending_orders_value,
                COALESCE(SUM(CASE WHEN order_status = 'cancelled' THEN total_amount END), 0) as cancelled_orders_value,
                COUNT(CASE WHEN order_status IN ('confirmed', 'delivered') THEN 1 END) as successful_orders,
                COUNT(CASE WHEN order_status = 'pending' THEN 1 END) as pending_orders,
                COUNT(CASE WHEN order_status = 'cancelled' THEN 1 END) as cancelled_orders,
                AVG(CASE WHEN order_status IN ('confirmed', 'delivered') THEN total_amount END) as avg_order_value
            FROM orders
            WHERE order_date >= :start_date AND order_date <= :end_date
        """
        
        result = db.execute(text(query), {"start_date": start_date, "end_date": end_date})
        financial_summary = dict(result.first()._mapping)
        
        return financial_summary
        
    except Exception as e:
        logger.error(f"Error fetching financial summary: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get financial summary: {str(e)}")
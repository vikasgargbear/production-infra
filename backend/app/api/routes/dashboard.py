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

from ...core.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/stats")
def get_dashboard_stats(db: Session = Depends(get_db)):
    """Get overall dashboard statistics"""
    try:
        # Get basic counts
        stats_query = """
            SELECT 
                (SELECT COUNT(*) FROM inventory.products WHERE is_active = true) as total_products,
                (SELECT COUNT(*) FROM parties.customers) as total_customers,
                (SELECT COUNT(*) FROM sales.orders WHERE order_date >= CURRENT_DATE - INTERVAL '30 days') as orders_this_month,
                (SELECT COUNT(*) FROM parties.suppliers) as total_suppliers,
                (SELECT COALESCE(SUM(final_amount), 0) FROM sales.orders WHERE order_date >= CURRENT_DATE - INTERVAL '30 days') as revenue_this_month,
                (SELECT COUNT(*) FROM inventory.batches WHERE quantity_available > 0) as active_batches,
                (SELECT COUNT(*) FROM inventory.batches WHERE expiry_date <= CURRENT_DATE + INTERVAL '30 days' AND quantity_available > 0) as expiring_soon
        """
        
        result = db.execute(text(stats_query))
        stats = dict(result.first()._mapping)
        
        # Get low stock alerts (using a threshold of 10 units as default)
        low_stock_query = """
            SELECT COUNT(*) as low_stock_products
            FROM (
                SELECT p.product_id, 
                       COALESCE(SUM(b.quantity_available), 0) as total_stock
                FROM inventory.products p
                LEFT JOIN inventory.batches b ON p.product_id = b.product_id AND b.quantity_available > 0
                WHERE p.is_active = true
                GROUP BY p.product_id
                HAVING COALESCE(SUM(b.quantity_available), 0) <= 10
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
                o.final_amount,
                o.order_status,
                o.delivery_status
            FROM sales.orders o
            LEFT JOIN parties.customers c ON o.customer_id = c.customer_id
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
                    COALESCE(SUM(final_amount), 0) as revenue
                FROM sales.orders 
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
                    COALESCE(SUM(final_amount), 0) as revenue
                FROM sales.orders 
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
                    COALESCE(SUM(final_amount), 0) as revenue
                FROM sales.orders 
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
                p.brand,
                SUM(oi.quantity) as total_quantity_sold,
                SUM(oi.quantity * oi.unit_price) as total_revenue,
                COUNT(DISTINCT oi.order_id) as order_count
            FROM sales.order_items oi
            JOIN inventory.products p ON oi.product_id = p.product_id
            JOIN sales.orders o ON oi.order_id = o.order_id
            WHERE o.order_date >= CURRENT_DATE - INTERVAL '30 days'
            AND o.order_status IN ('confirmed', 'delivered')
            GROUP BY p.product_id, p.product_name, p.brand
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
                p.brand,
                COALESCE(SUM(b.quantity_available), 0) as current_stock,
                10 as minimum_stock_level,
                'low_stock' as alert_type
            FROM inventory.products p
            LEFT JOIN inventory.batches b ON p.product_id = b.product_id AND b.quantity_available > 0
            WHERE p.is_active = true
            GROUP BY p.product_id, p.product_name, p.brand
            HAVING COALESCE(SUM(b.quantity_available), 0) <= 10
            ORDER BY current_stock ASC
            LIMIT 20
        """
        
        # Expiring soon products
        expiring_query = """
            SELECT 
                b.batch_id,
                p.product_id,
                p.product_name,
                p.brand,
                b.batch_number,
                b.expiry_date,
                b.quantity_available as quantity_available,
                'expiring_soon' as alert_type
            FROM inventory.batches b
            JOIN inventory.products p ON b.product_id = p.product_id
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
                c.primary_phone,
                COUNT(o.order_id) as total_orders,
                COALESCE(SUM(o.final_amount), 0) as total_spent,
                AVG(o.final_amount) as avg_order_value,
                MAX(o.order_date) as last_order_date
            FROM parties.customers c
            LEFT JOIN sales.orders o ON c.customer_id = o.customer_id 
                AND o.order_date >= CURRENT_DATE - INTERVAL '30 days'
                AND o.order_status IN ('confirmed', 'delivered')
            GROUP BY c.customer_id, c.customer_name, c.primary_phone
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
                COALESCE(SUM(CASE WHEN order_status IN ('confirmed', 'delivered') THEN final_amount END), 0) as total_revenue,
                COALESCE(SUM(CASE WHEN order_status = 'pending' THEN final_amount END), 0) as pending_orders_value,
                COALESCE(SUM(CASE WHEN order_status = 'cancelled' THEN final_amount END), 0) as cancelled_orders_value,
                COUNT(CASE WHEN order_status IN ('confirmed', 'delivered') THEN 1 END) as successful_orders,
                COUNT(CASE WHEN order_status = 'pending' THEN 1 END) as pending_orders,
                COUNT(CASE WHEN order_status = 'cancelled' THEN 1 END) as cancelled_orders,
                AVG(CASE WHEN order_status IN ('confirmed', 'delivered') THEN final_amount END) as avg_order_value
            FROM sales.orders
            WHERE order_date >= :start_date AND order_date <= :end_date
        """
        
        result = db.execute(text(query), {"start_date": start_date, "end_date": end_date})
        financial_summary = dict(result.first()._mapping)
        
        return financial_summary
        
    except Exception as e:
        logger.error(f"Error fetching financial summary: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get financial summary: {str(e)}")

# Add missing endpoints that tests expect

@router.get("/kpis")
def get_dashboard_kpis(
    org_id: Optional[str] = Query(None, description="Organization ID"),
    db: Session = Depends(get_db)
):
    """Get KPI summary for dashboard - matches test expectations"""
    try:
        # Alias to existing stats endpoint functionality
        return get_dashboard_stats(db)
    except Exception as e:
        logger.error(f"Error fetching dashboard KPIs: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get dashboard KPIs: {str(e)}")

@router.get("/sales-analytics")
def get_sales_analytics(
    org_id: Optional[str] = Query(None, description="Organization ID"),
    start_date: Optional[date] = Query(None, description="Start date"),
    end_date: Optional[date] = Query(None, description="End date"),
    db: Session = Depends(get_db)
):
    """Get sales analytics for dashboard"""
    try:
        # Use existing revenue endpoint with different name
        return get_revenue_data("monthly", start_date, end_date, db)
    except Exception as e:
        logger.error(f"Error fetching sales analytics: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get sales analytics: {str(e)}")

@router.get("/inventory-summary")
def get_inventory_summary(
    org_id: Optional[str] = Query(None, description="Organization ID"),
    db: Session = Depends(get_db)
):
    """Get inventory summary for dashboard"""
    try:
        query = """
            SELECT 
                COUNT(DISTINCT p.product_id) as total_products,
                COUNT(DISTINCT b.batch_id) as total_batches,
                COALESCE(SUM(b.quantity_available), 0) as total_quantity,
                COALESCE(SUM(b.quantity_available * COALESCE(b.cost_per_unit, 0)), 0) as total_value,
                COUNT(CASE WHEN b.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 1 END) as expiring_soon_count,
                COUNT(CASE WHEN COALESCE(b.quantity_available, 0) <= 10 THEN 1 END) as low_stock_count
            FROM inventory.products p
            LEFT JOIN inventory.batches b ON p.product_id = b.product_id
            WHERE p.is_active = true
        """
        
        result = db.execute(text(query))
        inventory_summary = dict(result.first()._mapping)
        
        return inventory_summary
    except Exception as e:
        logger.error(f"Error fetching inventory summary: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get inventory summary: {str(e)}")

@router.get("/top-customers")
def get_top_customers(
    org_id: Optional[str] = Query(None, description="Organization ID"),
    limit: int = Query(10, description="Number of top customers"),
    db: Session = Depends(get_db)
):
    """Get top customers - matches test expectations"""
    try:
        # Use existing customer analytics with different name
        return get_customer_analytics(limit, 30, db)
    except Exception as e:
        logger.error(f"Error fetching top customers: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get top customers: {str(e)}")

@router.get("/expiry-alerts")
def get_expiry_alerts(
    org_id: Optional[str] = Query(None, description="Organization ID"),
    days: int = Query(90, description="Days ahead for expiry check"),
    db: Session = Depends(get_db)
):
    """Get products expiring soon"""
    try:
        query = """
            SELECT 
                b.batch_id,
                p.product_id,
                p.product_name,
                p.brand,
                b.batch_number,
                b.expiry_date,
                b.quantity_available,
                (b.expiry_date - CURRENT_DATE) as days_to_expire
            FROM inventory.batches b
            JOIN inventory.products p ON b.product_id = p.product_id
            WHERE b.expiry_date <= CURRENT_DATE + INTERVAL '90 days'
            AND b.quantity_available > 0
            ORDER BY b.expiry_date ASC
            LIMIT 50
        """
        
        result = db.execute(text(query), {"days": days})
        expiry_alerts = [dict(row._mapping) for row in result]
        
        return {"expiring_products": expiry_alerts, "count": len(expiry_alerts)}
    except Exception as e:
        logger.error(f"Error fetching expiry alerts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get expiry alerts: {str(e)}")

@router.get("/low-stock-alerts")
def get_low_stock_alerts(
    org_id: Optional[str] = Query(None, description="Organization ID"),
    db: Session = Depends(get_db)
):
    """Get low stock products"""
    try:
        query = """
            SELECT 
                p.product_id,
                p.product_name,
                p.brand,
                COALESCE(SUM(b.quantity_available), 0) as current_stock,
                10 as minimum_stock_level,
                (10 - COALESCE(SUM(b.quantity_available), 0)) as stock_deficit
            FROM inventory.products p
            LEFT JOIN inventory.batches b ON p.product_id = b.product_id
            WHERE p.is_active = true
            GROUP BY p.product_id, p.product_name, p.brand
            HAVING COALESCE(SUM(b.quantity_available), 0) <= 10
            ORDER BY stock_deficit DESC
            LIMIT 50
        """
        
        result = db.execute(text(query))
        low_stock_alerts = [dict(row._mapping) for row in result]
        
        return {"low_stock_products": low_stock_alerts, "count": len(low_stock_alerts)}
    except Exception as e:
        logger.error(f"Error fetching low stock alerts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get low stock alerts: {str(e)}")

@router.get("/pending-payments")
def get_pending_payments(
    org_id: Optional[str] = Query(None, description="Organization ID"),
    db: Session = Depends(get_db)
):
    """Get pending payments summary"""
    try:
        query = """
            SELECT 
                'customer_receivables' as payment_type,
                COUNT(*) as count,
                COALESCE(SUM(current_outstanding), 0) as final_amount
            FROM parties.customers 
            WHERE current_outstanding > 0
            
            UNION ALL
            
            SELECT 
                'supplier_payables' as payment_type,
                COUNT(*) as count,
                COALESCE(SUM(current_outstanding), 0) as final_amount
            FROM parties.suppliers 
            WHERE current_outstanding > 0
            
            UNION ALL
            
            SELECT 
                'pending_invoices' as payment_type,
                COUNT(*) as count,
                COALESCE(SUM(final_amount - COALESCE(paid_amount, 0)), 0) as final_amount
            FROM sales.invoices 
            WHERE (payment_status != 'paid' OR payment_status IS NULL) 
            AND final_amount > COALESCE(paid_amount, 0)
        """
        
        result = db.execute(text(query))
        pending_payments = [dict(row._mapping) for row in result]
        
        # Calculate totals
        total_receivables = sum(row['final_amount'] for row in pending_payments if row['payment_type'] == 'customer_receivables')
        total_payables = sum(row['final_amount'] for row in pending_payments if row['payment_type'] == 'supplier_payables')
        
        return {
            "pending_payments": pending_payments,
            "summary": {
                "total_receivables": total_receivables,
                "total_payables": total_payables,
                "net_position": total_receivables - total_payables
            }
        }
    except Exception as e:
        logger.error(f"Error fetching pending payments: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get pending payments: {str(e)}")

@router.get("/recent-activities")
def get_recent_activities(
    org_id: Optional[str] = Query(None, description="Organization ID"),
    limit: int = Query(20, description="Number of recent activities"),
    db: Session = Depends(get_db)
):
    """Get recent business activities"""
    try:
        query = """
            SELECT 
                'order' as activity_type,
                o.order_id as reference_id,
                o.order_number as reference_number,
                'Order ' || o.order_status as activity_description,
                c.customer_name as party_name,
                o.final_amount,
                o.created_at as activity_date
            FROM sales.orders o
            LEFT JOIN parties.customers c ON o.customer_id = c.customer_id
            WHERE o.created_at >= CURRENT_DATE - INTERVAL '7 days'
            
            UNION ALL
            
            SELECT 
                'payment' as activity_type,
                p.payment_id as reference_id,
                p.payment_number as reference_number,
                'Payment ' || p.payment_status as activity_description,
                p.party_name,
                p.payment_amount as final_amount,
                p.created_at as activity_date
            FROM financial.payments p
            WHERE p.created_at >= CURRENT_DATE - INTERVAL '7 days'
            
            ORDER BY activity_date DESC
            LIMIT :limit
        """
        
        result = db.execute(text(query), {"limit": limit})
        recent_activities = [dict(row._mapping) for row in result]
        
        return {"activities": recent_activities, "count": len(recent_activities)}
    except Exception as e:
        logger.error(f"Error fetching recent activities: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get recent activities: {str(e)}")
"""
Dashboard Service - Analytics and KPIs

SECURITY: Uses TenantAwareSession for automatic org_id/branch_id filtering
Do NOT manually filter by org_id - TenantAwareSession handles it

Provides business logic for:
- Dashboard statistics and KPIs
- Revenue analytics
- Inventory alerts (low stock, expiring)
- Customer analytics
- Financial summaries
"""
from typing import Dict, Any, List, Optional
from datetime import date, timedelta
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

from ...core.constants import (
    OrderStatus, InvoicePaymentStatus, InvoiceStatus, 
    BatchStatus, BusinessLimits
)

logger = logging.getLogger(__name__)


class DashboardService:
    """
    Service for dashboard analytics and KPIs
    
    SECURITY NOTE: All methods expect TenantAwareSession which auto-filters by:
    - org_id: Always (hard tenant boundary)
    - branch_id: Based on user's branch_scope
    """
    
    @staticmethod
    def get_dashboard_stats(
        db: Session,
        org_id: str
    ) -> Dict[str, Any]:
        """
        Get overall dashboard statistics.
        TenantAwareSession auto-filters by org_id.
        """
        today = date.today()
        month_start = today.replace(day=1)
        
        # Get sales stats (TenantAwareSession auto-adds org_id)
        sales_stats = db.execute(text("""
            SELECT 
                COUNT(*) as total_orders,
                COUNT(*) FILTER (WHERE order_status = :pending) as pending_orders,
                COUNT(*) FILTER (WHERE order_date = CURRENT_DATE) as today_orders,
                COALESCE(SUM(final_amount), 0) as total_sales,
                COALESCE(SUM(CASE WHEN order_date = CURRENT_DATE THEN final_amount ELSE 0 END), 0) as today_sales,
                COALESCE(SUM(CASE WHEN order_date >= :month_start THEN final_amount ELSE 0 END), 0) as month_sales
            FROM sales.orders
            WHERE order_status != :cancelled
        """), {
            "pending": OrderStatus.PENDING.value,
            "cancelled": OrderStatus.CANCELLED.value,
            "month_start": month_start
        }).fetchone()
        
        # Get receivable stats
        receivable_stats = db.execute(text("""
            SELECT 
                COALESCE(SUM(final_amount - COALESCE(paid_amount, 0)), 0) as total_receivable,
                COUNT(*) as pending_invoices
            FROM sales.invoices
            WHERE invoice_status != :cancelled
            AND payment_status != :paid
        """), {
            "cancelled": InvoiceStatus.CANCELLED.value,
            "paid": InvoicePaymentStatus.PAID.value
        }).fetchone()
        
        # Get inventory stats
        inventory_stats = db.execute(text("""
            SELECT 
                COUNT(DISTINCT product_id) as total_products,
                COALESCE(SUM(quantity_available), 0) as total_stock,
                COUNT(*) FILTER (WHERE quantity_available <= reorder_level) as low_stock_count,
                COUNT(*) FILTER (WHERE expiry_date <= CURRENT_DATE + :expiry_days) as expiring_soon_count
            FROM inventory.batches b
            JOIN inventory.products p ON b.product_id = p.product_id
            WHERE b.batch_status = :active
        """), {
            "active": BatchStatus.ACTIVE.value,
            "expiry_days": BusinessLimits.EXPIRY_ALERT_DAYS
        }).fetchone()
        
        # Get customer count
        customer_count = db.execute(text("""
            SELECT COUNT(*) FROM parties.customers
            WHERE is_active = true
        """)).scalar() or 0
        
        return {
            "orders": {
                "total": sales_stats.total_orders or 0,
                "pending": sales_stats.pending_orders or 0,
                "today": sales_stats.today_orders or 0
            },
            "sales": {
                "total": float(sales_stats.total_sales or 0),
                "today": float(sales_stats.today_sales or 0),
                "month": float(sales_stats.month_sales or 0)
            },
            "receivables": {
                "total": float(receivable_stats.total_receivable or 0),
                "pending_invoices": receivable_stats.pending_invoices or 0
            },
            "inventory": {
                "total_products": inventory_stats.total_products or 0,
                "total_stock": float(inventory_stats.total_stock or 0),
                "low_stock_items": inventory_stats.low_stock_count or 0,
                "expiring_soon": inventory_stats.expiring_soon_count or 0
            },
            "customers": {
                "total": customer_count
            }
        }
    
    @staticmethod
    def get_recent_orders(
        db: Session,
        org_id: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get recent orders for dashboard.
        TenantAwareSession auto-filters by org_id.
        """
        result = db.execute(text("""
            SELECT 
                o.order_id, o.order_number, o.order_date, o.order_status,
                o.final_amount, o.payment_status,
                c.customer_name
            FROM sales.orders o
            LEFT JOIN parties.customers c ON o.customer_id = c.customer_id
            ORDER BY o.created_at DESC
            LIMIT :limit
        """), {"limit": limit})
        
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_revenue_data(
        db: Session,
        org_id: str,
        period: str = "monthly",
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Get revenue data for charts.
        TenantAwareSession auto-filters by org_id.
        """
        today = date.today()
        if not end_date:
            end_date = today
        if not start_date:
            if period == "daily":
                start_date = today - timedelta(days=30)
            elif period == "weekly":
                start_date = today - timedelta(weeks=12)
            else:
                start_date = today.replace(month=1, day=1)  # Year start
        
        if period == "daily":
            query = """
                SELECT 
                    invoice_date as period,
                    COALESCE(SUM(final_amount), 0) as revenue,
                    COUNT(*) as invoice_count
                FROM sales.invoices
                WHERE invoice_date BETWEEN :start_date AND :end_date
                AND invoice_status != :cancelled
                GROUP BY invoice_date
                ORDER BY invoice_date
            """
        elif period == "weekly":
            query = """
                SELECT 
                    DATE_TRUNC('week', invoice_date) as period,
                    COALESCE(SUM(final_amount), 0) as revenue,
                    COUNT(*) as invoice_count
                FROM sales.invoices
                WHERE invoice_date BETWEEN :start_date AND :end_date
                AND invoice_status != :cancelled
                GROUP BY DATE_TRUNC('week', invoice_date)
                ORDER BY period
            """
        else:  # monthly
            query = """
                SELECT 
                    DATE_TRUNC('month', invoice_date) as period,
                    COALESCE(SUM(final_amount), 0) as revenue,
                    COUNT(*) as invoice_count
                FROM sales.invoices
                WHERE invoice_date BETWEEN :start_date AND :end_date
                AND invoice_status != :cancelled
                GROUP BY DATE_TRUNC('month', invoice_date)
                ORDER BY period
            """
        
        result = db.execute(text(query), {
            "start_date": start_date,
            "end_date": end_date,
            "cancelled": InvoiceStatus.CANCELLED.value
        })
        
        data = []
        total_revenue = 0
        for row in result:
            period_data = {
                "period": row.period.isoformat() if row.period else None,
                "revenue": float(row.revenue),
                "invoice_count": row.invoice_count
            }
            data.append(period_data)
            total_revenue += float(row.revenue)
        
        return {
            "period_type": period,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "data": data,
            "total_revenue": total_revenue
        }
    
    @staticmethod
    def get_top_products(
        db: Session,
        org_id: str,
        limit: int = 10,
        period_days: int = 30
    ) -> List[Dict[str, Any]]:
        """
        Get top selling products.
        TenantAwareSession auto-filters by org_id.
        """
        start_date = date.today() - timedelta(days=period_days)
        
        result = db.execute(text("""
            SELECT 
                p.product_id, p.product_name, p.product_code,
                SUM(oi.quantity) as total_quantity,
                SUM(oi.line_total) as total_revenue
            FROM sales.order_items oi
            JOIN sales.orders o ON oi.order_id = o.order_id
            JOIN inventory.products p ON oi.product_id = p.product_id
            WHERE o.order_date >= :start_date
            AND o.order_status != :cancelled
            GROUP BY p.product_id, p.product_name, p.product_code
            ORDER BY total_revenue DESC
            LIMIT :limit
        """), {
            "start_date": start_date,
            "cancelled": OrderStatus.CANCELLED.value,
            "limit": limit
        })
        
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_inventory_alerts(
        db: Session,
        org_id: str
    ) -> Dict[str, Any]:
        """
        Get inventory alerts (low stock, expiring soon).
        TenantAwareSession auto-filters by org_id.
        """
        # Low stock items
        low_stock = db.execute(text("""
            SELECT 
                p.product_id, p.product_name, p.product_code,
                COALESCE(SUM(b.quantity_available), 0) as current_stock,
                p.reorder_level as min_stock
            FROM inventory.products p
            LEFT JOIN inventory.batches b ON p.product_id = b.product_id 
                AND b.batch_status = :active
            WHERE p.is_active = true
            GROUP BY p.product_id, p.product_name, p.product_code, p.reorder_level
            HAVING COALESCE(SUM(b.quantity_available), 0) <= p.reorder_level
            ORDER BY current_stock
            LIMIT 20
        """), {
            "active": BatchStatus.ACTIVE.value
        }).fetchall()
        
        # Expiring soon items
        expiring = db.execute(text("""
            SELECT 
                p.product_id, p.product_name, p.product_code,
                b.batch_number, b.expiry_date, b.quantity_available,
                b.expiry_date - CURRENT_DATE as days_to_expiry
            FROM inventory.batches b
            JOIN inventory.products p ON b.product_id = p.product_id
            WHERE b.batch_status = :active
            AND b.quantity_available > 0
            AND b.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + :days
            ORDER BY b.expiry_date
            LIMIT 20
        """), {
            "active": BatchStatus.ACTIVE.value,
            "days": BusinessLimits.EXPIRY_ALERT_DAYS
        }).fetchall()
        
        return {
            "low_stock": [dict(row._mapping) for row in low_stock],
            "expiring_soon": [dict(row._mapping) for row in expiring],
            "low_stock_count": len(low_stock),
            "expiring_count": len(expiring)
        }
    
    @staticmethod
    def get_top_customers(
        db: Session,
        org_id: str,
        limit: int = 10,
        period_days: int = 30
    ) -> List[Dict[str, Any]]:
        """
        Get top customers by order value.
        TenantAwareSession auto-filters by org_id.
        """
        start_date = date.today() - timedelta(days=period_days)
        
        result = db.execute(text("""
            SELECT 
                c.customer_id, c.customer_name, c.primary_phone,
                COUNT(o.order_id) as order_count,
                COALESCE(SUM(o.final_amount), 0) as total_value
            FROM parties.customers c
            JOIN sales.orders o ON c.customer_id = o.customer_id
            WHERE o.order_date >= :start_date
            AND o.order_status != :cancelled
            GROUP BY c.customer_id, c.customer_name, c.primary_phone
            ORDER BY total_value DESC
            LIMIT :limit
        """), {
            "start_date": start_date,
            "cancelled": OrderStatus.CANCELLED.value,
            "limit": limit
        })
        
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_financial_summary(
        db: Session,
        org_id: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Get financial summary.
        TenantAwareSession auto-filters by org_id.
        """
        today = date.today()
        if not start_date:
            start_date = today.replace(day=1)  # Start of current month
        if not end_date:
            end_date = today
        
        # Sales summary
        sales = db.execute(text("""
            SELECT 
                COUNT(*) as invoice_count,
                COALESCE(SUM(final_amount), 0) as total_sales,
                COALESCE(SUM(total_tax_amount), 0) as total_tax,
                COALESCE(SUM(discount_amount), 0) as total_discount
            FROM sales.invoices
            WHERE invoice_date BETWEEN :start_date AND :end_date
            AND invoice_status != :cancelled
        """), {
            "start_date": start_date,
            "end_date": end_date,
            "cancelled": InvoiceStatus.CANCELLED.value
        }).fetchone()
        
        # Collections summary
        collections = db.execute(text("""
            SELECT 
                COUNT(*) as payment_count,
                COALESCE(SUM(payment_amount), 0) as total_collected
            FROM financial.payments
            WHERE payment_date BETWEEN :start_date AND :end_date
            AND party_type = 'customer'
            AND payment_status != 'cancelled'
        """), {
            "start_date": start_date,
            "end_date": end_date
        }).fetchone()
        
        # Outstanding
        outstanding = db.execute(text("""
            SELECT COALESCE(SUM(final_amount - COALESCE(paid_amount, 0)), 0)
            FROM sales.invoices
            WHERE invoice_status != :cancelled
            AND payment_status != :paid
        """), {
            "cancelled": InvoiceStatus.CANCELLED.value,
            "paid": InvoicePaymentStatus.PAID.value
        }).scalar() or 0
        
        return {
            "period": {
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat()
            },
            "sales": {
                "invoice_count": sales.invoice_count or 0,
                "total": float(sales.total_sales or 0),
                "tax_collected": float(sales.total_tax or 0),
                "discounts_given": float(sales.total_discount or 0)
            },
            "collections": {
                "payment_count": collections.payment_count or 0,
                "total": float(collections.total_collected or 0)
            },
            "outstanding": float(outstanding)
        }
    
    @staticmethod
    def get_pending_payments(
        db: Session,
        org_id: str
    ) -> Dict[str, Any]:
        """
        Get pending payments summary.
        TenantAwareSession auto-filters by org_id.
        """
        # Customer receivables
        receivables = db.execute(text("""
            SELECT 
                COUNT(*) as invoice_count,
                COALESCE(SUM(final_amount - COALESCE(paid_amount, 0)), 0) as total,
                COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE 
                    THEN final_amount - COALESCE(paid_amount, 0) ELSE 0 END), 0) as overdue
            FROM sales.invoices
            WHERE invoice_status != :cancelled
            AND payment_status != :paid
        """), {
            "cancelled": InvoiceStatus.CANCELLED.value,
            "paid": InvoicePaymentStatus.PAID.value
        }).fetchone()
        
        # Supplier payables
        payables = db.execute(text("""
            SELECT 
                COUNT(*) as invoice_count,
                COALESCE(SUM(final_amount - COALESCE(paid_amount, 0)), 0) as total,
                COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE 
                    THEN final_amount - COALESCE(paid_amount, 0) ELSE 0 END), 0) as overdue
            FROM purchases.supplier_invoices
            WHERE invoice_status != :cancelled
            AND payment_status != :paid
        """), {
            "cancelled": InvoiceStatus.CANCELLED.value,
            "paid": InvoicePaymentStatus.PAID.value
        }).fetchone()
        
        return {
            "receivables": {
                "pending_invoices": receivables.invoice_count or 0,
                "total": float(receivables.total or 0),
                "overdue": float(receivables.overdue or 0)
            },
            "payables": {
                "pending_invoices": payables.invoice_count or 0,
                "total": float(payables.total or 0),
                "overdue": float(payables.overdue or 0)
            },
            "net_position": float(receivables.total or 0) - float(payables.total or 0)
        }
    
    @staticmethod
    def get_expiry_alerts(
        db: Session,
        org_id: str,
        days: int = 90
    ) -> List[Dict[str, Any]]:
        """
        Get products expiring within specified days.
        TenantAwareSession auto-filters by org_id.
        """
        result = db.execute(text("""
            SELECT 
                p.product_id, p.product_name, p.product_code,
                b.batch_id, b.batch_number, b.expiry_date, 
                b.quantity_available,
                b.expiry_date - CURRENT_DATE as days_to_expiry
            FROM inventory.batches b
            JOIN inventory.products p ON b.product_id = p.product_id
            WHERE b.batch_status = :active
            AND b.quantity_available > 0
            AND b.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + :days
            ORDER BY b.expiry_date
        """), {
            "active": BatchStatus.ACTIVE.value,
            "days": days
        })
        
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_low_stock_alerts(
        db: Session,
        org_id: str
    ) -> List[Dict[str, Any]]:
        """
        Get products with low stock.
        TenantAwareSession auto-filters by org_id.
        """
        result = db.execute(text("""
            SELECT 
                p.product_id, p.product_name, p.product_code,
                COALESCE(SUM(b.quantity_available), 0) as current_stock,
                p.reorder_level,
                p.reorder_level - COALESCE(SUM(b.quantity_available), 0) as shortage
            FROM inventory.products p
            LEFT JOIN inventory.batches b ON p.product_id = b.product_id 
                AND b.batch_status = :active
            WHERE p.is_active = true
            GROUP BY p.product_id, p.product_name, p.product_code, p.reorder_level
            HAVING COALESCE(SUM(b.quantity_available), 0) < p.reorder_level
            ORDER BY shortage DESC
        """), {
            "active": BatchStatus.ACTIVE.value
        })
        
        return [dict(row._mapping) for row in result]

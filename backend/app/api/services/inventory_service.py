"""
Inventory service layer for business logic
Handles batch management, stock movements, and expiry tracking
"""
from typing import Optional, List
from datetime import date, timedelta
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import text
from uuid import UUID
import logging

from ..schemas_v2.inventory import (
    BatchCreate, BatchResponse, StockMovementCreate,
    StockMovementResponse, StockAdjustment,
    CurrentStock, ExpiryAlert,
    StockValuation, InventoryDashboard
)

logger = logging.getLogger(__name__)


class InventoryService:
    """Service class for inventory-related business logic"""
    
    @staticmethod
    def calculate_days_to_expiry(expiry_date: date) -> int:
        """Calculate days until expiry"""
        if not expiry_date:
            return None
        return (expiry_date - date.today()).days
    
    @staticmethod
    def get_expiry_alert_level(days_to_expiry: int) -> str:
        """Determine alert level based on days to expiry"""
        if days_to_expiry <= 0:
            return "expired"
        elif days_to_expiry <= 30:
            return "critical"
        elif days_to_expiry <= 90:
            return "warning"
        elif days_to_expiry <= 180:
            return "info"
        return "normal"
    
    @staticmethod
    def create_batch(db: Session, batch_data: BatchCreate) -> BatchResponse:
        """Create a new batch with validation"""
        try:
            # Validate product exists
            product = db.execute(text("""
                SELECT product_id, product_name, product_code 
                FROM products WHERE product_id = :product_id
            """), {"product_id": batch_data.product_id}).fetchone()
            
            if not product:
                raise ValueError(f"Product {batch_data.product_id} not found")
            
            # Check for duplicate batch number
            existing = db.execute(text("""
                SELECT 1 FROM batches 
                WHERE product_id = :product_id AND batch_number = :batch_number
            """), {
                "product_id": batch_data.product_id,
                "batch_number": batch_data.batch_number
            }).scalar()
            
            if existing:
                raise ValueError(f"Batch {batch_data.batch_number} already exists for this product")
            
            # Create batch
            batch_dict = batch_data.dict()
            result = db.execute(text("""
                INSERT INTO batches (
                    org_id, product_id, batch_number, manufacturing_date,
                    expiry_date, quantity_received, quantity_available,
                    cost_price, mrp,
                    supplier_id, purchase_invoice_number, location_code, notes,
                    created_at, updated_at
                ) VALUES (
                    :org_id, :product_id, :batch_number, :manufacturing_date,
                    :expiry_date, :quantity_received, :quantity_available,
                    :cost_price, :mrp,
                    :supplier_id, :purchase_invoice_number, :location_code, :notes,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                ) RETURNING batch_id
            """), batch_dict)
            
            batch_id = result.scalar()
            
            # Record stock movement
            db.execute(text("""
                INSERT INTO inventory_movements (
                    org_id, product_id, batch_id, movement_type,
                    movement_date, quantity_in, reference_type,
                    notes, created_at
                ) VALUES (
                    :org_id, :product_id, :batch_id, 'purchase',
                    :movement_date, :quantity_in, 'batch_creation',
                    'New batch created', CURRENT_TIMESTAMP
                )
            """), {
                "org_id": batch_dict["org_id"],
                "product_id": batch_dict["product_id"],
                "batch_id": batch_id,
                "movement_date": date.today(),
                "quantity_in": batch_dict["quantity_received"]
            })
            
            db.commit()
            
            # Return created batch
            return InventoryService.get_batch(db, batch_id)
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error creating batch: {str(e)}")
            raise
    
    @staticmethod
    def get_batch(db: Session, batch_id: int) -> BatchResponse:
        """Get batch details with calculated fields"""
        result = db.execute(text("""
            SELECT b.*, p.product_name, p.product_code,
                   b.quantity_received - b.quantity_available as quantity_sold
            FROM batches b
            JOIN products p ON b.product_id = p.product_id
            WHERE b.batch_id = :batch_id
        """), {"batch_id": batch_id})
        
        batch = result.fetchone()
        if not batch:
            raise ValueError(f"Batch {batch_id} not found")
        
        batch_dict = dict(batch._mapping)
        
        # Calculate additional fields
        batch_dict["quantity_sold"] = batch_dict.get("quantity_sold", 0)
        batch_dict["stock_value"] = (
            Decimal(str(batch_dict["quantity_available"])) * 
            Decimal(str(batch_dict.get("cost_price", 0)))
        )
        
        if batch_dict["expiry_date"]:
            batch_dict["days_to_expiry"] = InventoryService.calculate_days_to_expiry(
                batch_dict["expiry_date"]
            )
            batch_dict["is_expired"] = batch_dict["days_to_expiry"] <= 0
            batch_dict["is_near_expiry"] = 0 < batch_dict["days_to_expiry"] <= 90
        
        return BatchResponse(**batch_dict)
    
    @staticmethod
    def get_current_stock(db: Session, product_id: int) -> CurrentStock:
        """Get current stock summary for a product"""
        # Get product details
        product = db.execute(text("""
            SELECT product_id, product_code, product_name,
                   minimum_stock_level, reorder_level
            FROM products WHERE product_id = :product_id
        """), {"product_id": product_id}).fetchone()
        
        if not product:
            raise ValueError(f"Product {product_id} not found")
        
        # Get batch summary
        batch_summary = db.execute(text("""
            SELECT 
                COUNT(*) as total_batches,
                COALESCE(SUM(quantity_available), 0) as total_quantity,
                COALESCE(SUM(quantity_available), 0) as available_quantity,
                COALESCE(SUM(quantity_sold), 0) as allocated_quantity,
                COALESCE(SUM(quantity_available * cost_price), 0) as total_value,
                COALESCE(AVG(cost_price), 0) as average_cost,
                COUNT(CASE WHEN expiry_date <= CURRENT_DATE THEN 1 END) as expired_batches,
                COUNT(CASE WHEN expiry_date > CURRENT_DATE AND expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN 1 END) as near_expiry_batches
            FROM batches
            WHERE product_id = :product_id
        """), {"product_id": product_id}).fetchone()
        
        stock_dict = dict(product._mapping)
        stock_dict.update(dict(batch_summary._mapping))
        
        # Check reorder levels
        total_qty = stock_dict["total_quantity"]
        stock_dict["is_below_minimum"] = (
            product.minimum_stock_level and 
            total_qty < product.minimum_stock_level
        )
        stock_dict["is_below_reorder"] = (
            product.reorder_level and 
            total_qty <= product.reorder_level
        )
        
        return CurrentStock(**stock_dict)
    
    @staticmethod
    def record_stock_movement(
        db: Session, 
        movement_data: StockMovementCreate
    ) -> StockMovementResponse:
        """Record a stock movement"""
        try:
            # Get current stock levels
            if movement_data.batch_id:
                current = db.execute(text("""
                    SELECT quantity_available FROM batches 
                    WHERE batch_id = :batch_id
                """), {"batch_id": movement_data.batch_id}).scalar()
            else:
                current = db.execute(text("""
                    SELECT COALESCE(SUM(quantity_available), 0) 
                    FROM batches WHERE product_id = :product_id
                """), {"product_id": movement_data.product_id}).scalar()
            
            stock_before = current or 0
            
            # Validate sufficient stock for outward movement
            if movement_data.quantity < 0 and abs(movement_data.quantity) > stock_before:
                raise ValueError("Insufficient stock for this movement")
            
            # Record movement
            movement_dict = movement_data.dict()
            # Set quantity_in and quantity_out based on movement direction
            if movement_data.quantity > 0:
                movement_dict["quantity_in"] = movement_data.quantity
                movement_dict["quantity_out"] = 0
            else:
                movement_dict["quantity_in"] = 0
                movement_dict["quantity_out"] = abs(movement_data.quantity)
            
            movement_dict.pop("quantity", None)
            movement_dict.pop("reason", None)
            movement_dict["stock_before"] = stock_before
            movement_dict["stock_after"] = stock_before + movement_data.quantity
            
            result = db.execute(text("""
                INSERT INTO inventory_movements (
                    org_id, product_id, batch_id, movement_type,
                    movement_date, quantity_in, quantity_out, reference_type, reference_id,
                    notes, performed_by, created_at
                ) VALUES (
                    :org_id, :product_id, :batch_id, :movement_type,
                    :movement_date, :quantity_in, :quantity_out, :reference_type, :reference_id,
                    :notes, :performed_by, CURRENT_TIMESTAMP
                ) RETURNING movement_id
            """), movement_dict)
            
            movement_id = result.scalar()
            
            # Update batch quantities if batch specified
            if movement_data.batch_id:
                db.execute(text("""
                    UPDATE batches
                    SET quantity_available = quantity_available + :quantity,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE batch_id = :batch_id
                """), {
                    "quantity": movement_data.quantity,
                    "batch_id": movement_data.batch_id
                })
            
            db.commit()
            
            # Get movement details
            result = db.execute(text("""
                SELECT im.*, p.product_name, p.product_code, b.batch_number
                FROM inventory_movements im
                JOIN products p ON im.product_id = p.product_id
                LEFT JOIN batches b ON im.batch_id = b.batch_id
                WHERE im.movement_id = :movement_id
            """), {"movement_id": movement_id})
            
            movement = dict(result.fetchone()._mapping)
            movement["stock_before"] = stock_before
            movement["stock_after"] = stock_before + movement_data.quantity
            
            return StockMovementResponse(**movement)
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error recording stock movement: {str(e)}")
            raise
    
    @staticmethod
    def process_stock_adjustment(
        db: Session, 
        adjustment: StockAdjustment,
        org_id: UUID
    ) -> StockMovementResponse:
        """Process a stock adjustment"""
        movement_data = StockMovementCreate(
            org_id=org_id,
            product_id=adjustment.product_id,
            batch_id=adjustment.batch_id,
            movement_type="adjustment",
            quantity=adjustment.quantity,
            reference_type="adjustment",
            reason=adjustment.reason,
            notes=adjustment.notes,
            performed_by=None  # Should come from auth
        )
        
        return InventoryService.record_stock_movement(db, movement_data)
    
    @staticmethod
    def get_expiry_alerts(
        db: Session, 
        org_id: UUID,
        days_ahead: int = 180
    ) -> List[ExpiryAlert]:
        """Get products expiring within specified days"""
        cutoff_date = date.today() + timedelta(days=days_ahead)
        
        result = db.execute(text("""
            SELECT 
                b.batch_id, b.product_id, p.product_name, p.product_code,
                b.batch_number, b.expiry_date, b.quantity_available,
                b.quantity_available * b.cost_price as stock_value,
                b.expiry_date - CURRENT_DATE as days_to_expiry
            FROM batches b
            JOIN products p ON b.product_id = p.product_id
            WHERE b.org_id = :org_id
                AND b.quantity_available > 0
                AND b.expiry_date <= :cutoff_date
            ORDER BY b.expiry_date, p.product_name
        """), {
            "org_id": org_id,
            "cutoff_date": cutoff_date
        })
        
        alerts = []
        for row in result:
            alert = dict(row._mapping)
            alert["alert_level"] = InventoryService.get_expiry_alert_level(
                alert["days_to_expiry"]
            )
            alerts.append(ExpiryAlert(**alert))
        
        return alerts
    
    @staticmethod
    def get_stock_valuation(
        db: Session,
        org_id: UUID,
        as_of_date: Optional[date] = None
    ) -> StockValuation:
        """Get stock valuation report"""
        if not as_of_date:
            as_of_date = date.today()
        
        # Overall summary
        summary = db.execute(text("""
            SELECT 
                COUNT(DISTINCT b.product_id) as total_products,
                COUNT(*) as total_batches,
                COALESCE(SUM(b.quantity_available), 0) as total_quantity,
                COALESCE(SUM(CASE WHEN b.expiry_date <= :as_of_date THEN b.quantity_available ELSE 0 END), 0) as expired_quantity,
                COALESCE(SUM(CASE 
                    WHEN b.expiry_date > :as_of_date AND b.expiry_date <= :as_of_date + INTERVAL '90 days' 
                    THEN b.quantity_available ELSE 0 END), 0) as near_expiry_quantity,
                COALESCE(SUM(b.quantity_available * b.cost_price), 0) as total_value,
                COALESCE(SUM(CASE 
                    WHEN b.expiry_date <= :as_of_date 
                    THEN b.quantity_available * b.cost_price ELSE 0 END), 0) as expired_value,
                COALESCE(SUM(CASE 
                    WHEN b.expiry_date > :as_of_date AND b.expiry_date <= :as_of_date + INTERVAL '90 days' 
                    THEN b.quantity_available * b.cost_price ELSE 0 END), 0) as near_expiry_value
            FROM batches b
            WHERE b.org_id = :org_id
                AND b.quantity_available > 0
        """), {
            "org_id": org_id,
            "as_of_date": as_of_date
        }).fetchone()
        
        valuation = dict(summary._mapping)
        valuation["valuation_date"] = as_of_date
        
        # Category-wise breakdown
        category_result = db.execute(text("""
            SELECT 
                p.category,
                COUNT(DISTINCT b.product_id) as products,
                COALESCE(SUM(b.quantity_available), 0) as quantity,
                COALESCE(SUM(b.quantity_available * b.cost_price), 0) as value
            FROM batches b
            JOIN products p ON b.product_id = p.product_id
            WHERE b.org_id = :org_id
                AND b.quantity_available > 0
            GROUP BY p.category
            ORDER BY value DESC
        """), {
            "org_id": org_id
        })
        
        valuation["category_wise"] = [
            dict(row._mapping) for row in category_result
        ]
        
        return StockValuation(**valuation)
    
    @staticmethod
    def get_inventory_dashboard(db: Session, org_id: UUID) -> InventoryDashboard:
        """Get inventory dashboard data"""
        # Stock overview
        overview = db.execute(text("""
            SELECT 
                COUNT(DISTINCT b.product_id) as total_products,
                COUNT(*) as total_batches,
                COALESCE(SUM(b.quantity_available * b.cost_price), 0) as total_stock_value
            FROM batches b
            WHERE b.org_id = :org_id AND b.quantity_available > 0
        """), {"org_id": org_id}).fetchone()
        
        # Alert counts
        alerts = db.execute(text("""
            SELECT 
                COUNT(DISTINCT CASE WHEN b.expiry_date <= CURRENT_DATE THEN b.product_id END) as expired_products,
                COUNT(DISTINCT CASE 
                    WHEN b.expiry_date > CURRENT_DATE AND b.expiry_date <= CURRENT_DATE + INTERVAL '90 days' 
                    THEN b.product_id END) as near_expiry_products,
                COUNT(DISTINCT CASE 
                    WHEN p.minimum_stock_level IS NOT NULL 
                    AND sq.total_quantity < p.minimum_stock_level 
                    THEN p.product_id END) as low_stock_products,
                COUNT(DISTINCT CASE 
                    WHEN sq.total_quantity = 0 
                    THEN p.product_id END) as out_of_stock_products
            FROM products p
            LEFT JOIN batches b ON p.product_id = b.product_id AND b.org_id = :org_id
            LEFT JOIN (
                SELECT product_id, SUM(quantity_available) as total_quantity
                FROM batches
                WHERE org_id = :org_id
                GROUP BY product_id
            ) sq ON p.product_id = sq.product_id
            WHERE p.org_id = :org_id
        """), {"org_id": org_id}).fetchone()
        
        # Today's activity
        activity = db.execute(text("""
            SELECT 
                COUNT(*) as todays_movements
            FROM inventory_movements
            WHERE org_id = :org_id AND DATE(created_at) = CURRENT_DATE
        """), {"org_id": org_id}).fetchone()
        
        # Pending orders
        pending = db.execute(text("""
            SELECT COUNT(*) as pending_orders
            FROM orders
            WHERE org_id = :org_id AND order_status IN ('pending', 'confirmed')
        """), {"org_id": org_id}).fetchone()
        
        # Fast moving products (last 30 days)
        fast_moving = db.execute(text("""
            SELECT 
                p.product_id, p.product_code, p.product_name,
                COALESCE(SUM(im.quantity_out), 0) as movement_quantity
            FROM products p
            LEFT JOIN inventory_movements im ON p.product_id = im.product_id
                AND im.org_id = :org_id
                AND im.movement_type = 'sale'
                AND im.created_at >= CURRENT_DATE - INTERVAL '30 days'
            WHERE p.org_id = :org_id
            GROUP BY p.product_id, p.product_code, p.product_name
            ORDER BY movement_quantity DESC
            LIMIT 10
        """), {"org_id": org_id})
        
        # Get expiry alerts
        expiry_alerts = InventoryService.get_expiry_alerts(db, org_id, days_ahead=90)
        
        dashboard = {
            **dict(overview._mapping),
            **dict(alerts._mapping),
            "todays_movements": activity.todays_movements,
            "pending_orders": pending.pending_orders,
            "fast_moving_products": [dict(row._mapping) for row in fast_moving],
            "slow_moving_products": [],  # Would need more complex query
            "expiry_alerts": expiry_alerts[:10]  # Top 10 alerts
        }
        
        return InventoryDashboard(**dashboard)
"""
Order service layer for business logic
Handles order processing, inventory validation, and invoice generation
"""
from typing import List, Dict, Any
from datetime import date, timedelta
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import text
from uuid import UUID
import logging

from ..schemas_v2.order import (
    ReturnRequest
)

logger = logging.getLogger(__name__)


class OrderService:
    """Service class for order-related business logic"""
    
    @staticmethod
    def generate_order_number(db: Session, org_id: UUID) -> str:
        """Generate unique order number"""
        # Format: ORD-YYYYMMDD-XXXX
        today = date.today()
        prefix = f"ORD-{today.strftime('%Y%m%d')}"
        
        # Get the next sequence number for today for this org
        result = db.execute(text("""
            SELECT COUNT(*) + 1 as next_num
            FROM orders
            WHERE order_number LIKE :prefix || '%' AND org_id = :org_id
        """), {"prefix": prefix, "org_id": org_id})
        
        next_num = result.scalar() or 1
        return f"{prefix}-{next_num:04d}"
    
    @staticmethod
    def validate_inventory(db: Session, items: List[dict], org_id: UUID) -> Dict[str, Any]:
        """Validate if items are available in inventory"""
        validation_results = []
        all_valid = True
        
        for item in items:
            # Check product exists and is active
            product = db.execute(text("""
                SELECT product_id, product_name, is_active
                FROM products
                WHERE product_id = :product_id AND org_id = :org_id
            """), {"product_id": item['product_id'], "org_id": org_id}).fetchone()
            
            if not product:
                validation_results.append({
                    "product_id": item['product_id'],
                    "valid": False,
                    "message": "Product not found"
                })
                all_valid = False
                continue
            
            if not product.is_active:
                validation_results.append({
                    "product_id": item['product_id'],
                    "valid": False,
                    "message": f"Product {product.product_name} is inactive"
                })
                all_valid = False
                continue
            
            # Check batch availability if specified
            if item.get('batch_id'):
                batch = db.execute(text("""
                    SELECT batch_id, batch_number, quantity_available, expiry_date
                    FROM batches
                    WHERE batch_id = :batch_id AND product_id = :product_id AND org_id = :org_id
                """), {
                    "batch_id": item['batch_id'],
                    "product_id": item['product_id'],
                    "org_id": org_id
                }).fetchone()
                
                if not batch:
                    validation_results.append({
                        "product_id": item['product_id'],
                        "valid": False,
                        "message": "Batch not found"
                    })
                    all_valid = False
                    continue
                
                if batch.quantity_available < item['quantity']:
                    validation_results.append({
                        "product_id": item['product_id'],
                        "valid": False,
                        "message": f"Insufficient stock in batch {batch.batch_number}. Available: {batch.quantity_available}"
                    })
                    all_valid = False
                    continue
                
                # Check expiry
                if batch.expiry_date and batch.expiry_date < date.today():
                    validation_results.append({
                        "product_id": item['product_id'],
                        "valid": False,
                        "message": f"Batch {batch.batch_number} has expired"
                    })
                    all_valid = False
                    continue
            else:
                # Check overall stock
                stock = db.execute(text("""
                    SELECT COALESCE(SUM(quantity_available), 0) as total_stock
                    FROM batches
                    WHERE product_id = :product_id AND org_id = :org_id
                        AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
                """), {"product_id": item['product_id'], "org_id": org_id}).scalar()
                
                if stock < item['quantity']:
                    validation_results.append({
                        "product_id": item['product_id'],
                        "valid": False,
                        "message": f"Insufficient stock for {product.product_name}. Available: {stock}"
                    })
                    all_valid = False
                    continue
            
            validation_results.append({
                "product_id": item['product_id'],
                "valid": True,
                "message": "Available"
            })
        
        return {
            "valid": all_valid,
            "items": validation_results
        }
    
    @staticmethod
    def calculate_order_totals(db: Session, items: List[dict], customer_discount: Decimal = Decimal("0"), org_id: UUID = None) -> Dict[str, Decimal]:
        """Calculate order totals with tax"""
        subtotal = Decimal("0")
        total_discount = Decimal("0")
        total_tax = Decimal("0")
        
        for item in items:
            # Get product details
            query_params = {"product_id": item['product_id']}
            if org_id:
                product = db.execute(text("""
                    SELECT mrp, gst_percent
                    FROM products
                    WHERE product_id = :product_id AND org_id = :org_id
                """), {"product_id": item['product_id'], "org_id": org_id}).fetchone()
            else:
                product = db.execute(text("""
                    SELECT mrp, gst_percent
                    FROM products
                    WHERE product_id = :product_id
                """), {"product_id": item['product_id']}).fetchone()
            
            if product:
                quantity = Decimal(str(item['quantity']))
                unit_price = Decimal(str(item.get('unit_price', product.mrp)))
                discount_percent = Decimal(str(item.get('discount_percent', 0)))
                
                # Calculate line subtotal
                line_subtotal = quantity * unit_price
                
                # Apply item discount
                item_discount = line_subtotal * discount_percent / 100
                line_subtotal_after_discount = line_subtotal - item_discount
                
                # Apply customer discount if no item discount
                if discount_percent == 0 and customer_discount > 0:
                    customer_discount_amount = line_subtotal * customer_discount / 100
                    line_subtotal_after_discount -= customer_discount_amount
                    total_discount += customer_discount_amount
                else:
                    total_discount += item_discount
                
                # Calculate tax
                tax_amount = line_subtotal_after_discount * Decimal(str(product.gst_percent)) / 100
                
                subtotal += line_subtotal
                total_tax += tax_amount
        
        return {
            "subtotal": subtotal,
            "discount": total_discount,
            "tax": total_tax,
            "total": subtotal - total_discount + total_tax
        }
    
    @staticmethod
    def allocate_inventory(db: Session, order_id: int, items: List[dict], org_id: UUID) -> bool:
        """Allocate inventory for order items using FIFO"""
        try:
            for item in items:
                remaining_quantity = item['quantity']
                
                if item.get('batch_id'):
                    # Allocate from specific batch
                    db.execute(text("""
                        UPDATE batches
                        SET quantity_available = quantity_available - :quantity,
                            quantity_sold = quantity_sold + :quantity,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE batch_id = :batch_id
                    """), {
                        "quantity": item['quantity'],
                        "batch_id": item['batch_id']
                    })
                    
                    # REMOVED: Orders should NOT deduct inventory
                    # Only invoices should deduct inventory
                    # This prevents inventory issues when creating challans
                    pass
                else:
                    # Auto-allocate using FIFO
                    batches = db.execute(text("""
                        SELECT batch_id, quantity_available
                        FROM batches
                        WHERE product_id = :product_id AND org_id = :org_id
                            AND quantity_available > 0
                            AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
                        ORDER BY expiry_date NULLS LAST, created_at
                    """), {"product_id": item['product_id'], "org_id": org_id})
                    
                    for batch in batches:
                        if remaining_quantity <= 0:
                            break
                        
                        allocation = min(remaining_quantity, batch.quantity_available)
                        
                        # Update batch
                        db.execute(text("""
                            UPDATE batches
                            SET quantity_available = quantity_available - :allocation,
                                quantity_sold = quantity_sold + :allocation,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE batch_id = :batch_id
                        """), {
                            "allocation": allocation,
                            "batch_id": batch.batch_id
                        })
                        
                        # REMOVED: Orders should NOT deduct inventory
                        # Only invoices should deduct inventory
                        pass
                        
                        remaining_quantity -= allocation
            
            return True
            
        except Exception as e:
            logger.error(f"Error allocating inventory: {str(e)}")
            return False
    
    @staticmethod
    def generate_invoice_number(db: Session) -> str:
        """Generate unique invoice number"""
        # Format: INV-YYYY-MM-XXXXX
        today = date.today()
        prefix = f"INV-{today.strftime('%Y-%m')}"
        
        # Get the next sequence number for this month
        result = db.execute(text("""
            SELECT COUNT(*) + 1 as next_num
            FROM invoices
            WHERE invoice_number LIKE :prefix || '%'
        """), {"prefix": prefix})
        
        next_num = result.scalar() or 1
        return f"{prefix}-{next_num:05d}"
    
    @staticmethod
    def process_return(db: Session, order_id: int, return_request: ReturnRequest) -> Dict[str, Any]:
        """Process order return"""
        # Get order details
        order = db.execute(text("""
            SELECT * FROM orders WHERE order_id = :order_id
        """), {"order_id": order_id}).fetchone()
        
        if not order:
            return {"success": False, "message": "Order not found"}
        
        if order.order_status not in ['delivered', 'invoiced']:
            return {"success": False, "message": "Only delivered orders can be returned"}
        
        # Calculate return amount
        if return_request.return_type == "full":
            return_amount = order.final_amount
            
            # Reverse all inventory allocations
            db.execute(text("""
                INSERT INTO inventory_movements (
                    product_id, batch_id, movement_type, movement_date,
                    quantity_in, reference_type, reference_id,
                    created_at, updated_at
                )
                SELECT 
                    product_id, batch_id, 'return', CURRENT_DATE,
                    COALESCE(quantity_out, 0), 'return', :order_id,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                FROM inventory_movements
                WHERE reference_type = 'order' AND reference_id = :order_id
            """), {"order_id": order_id})
            
            # Update batch quantities
            db.execute(text("""
                UPDATE batches b
                SET quantity_available = quantity_available + im.quantity_out,
                    quantity_sold = quantity_sold - im.quantity_out,
                    updated_at = CURRENT_TIMESTAMP
                FROM (
                    SELECT batch_id, SUM(COALESCE(quantity_out, 0)) as quantity_out
                    FROM inventory_movements
                    WHERE reference_type = 'order' AND reference_id = :order_id
                    GROUP BY batch_id
                ) im
                WHERE b.batch_id = im.batch_id
            """), {"order_id": order_id})
            
        else:
            # Partial return - calculate based on returned items
            return_amount = Decimal("0")
            # Implementation for partial returns would go here
        
        # Create return record
        return_id = db.execute(text("""
            INSERT INTO sales_returns (
                order_id, return_date, return_reason, return_type,
                return_amount, refund_method, status,
                created_at, updated_at
            ) VALUES (
                :order_id, CURRENT_DATE, :reason, :type,
                :amount, :method, 'approved',
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING return_id
        """), {
            "order_id": order_id,
            "reason": return_request.return_reason,
            "type": return_request.return_type,
            "amount": return_amount,
            "method": return_request.refund_method
        }).scalar()
        
        # Update order status
        db.execute(text("""
            UPDATE orders
            SET order_status = 'returned',
                updated_at = CURRENT_TIMESTAMP
            WHERE order_id = :order_id
        """), {"order_id": order_id})
        
        # Process refund based on method
        if return_request.refund_method == "credit_note":
            # Create credit note
            credit_note_number = f"CN-{date.today().strftime('%Y%m%d')}-{return_id:04d}"
            # Implementation for credit note generation would go here
        
        return {
            "success": True,
            "return_id": return_id,
            "return_amount": return_amount,
            "message": "Return processed successfully"
        }
    
    @staticmethod
    def get_order_dashboard(db: Session, org_id: UUID) -> Dict[str, Any]:
        """Get order dashboard statistics"""
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
        month_start = today.replace(day=1)
        
        # Overall stats
        stats = db.execute(text("""
            SELECT 
                COUNT(*) FILTER (WHERE order_status = 'pending') as pending_orders,
                COUNT(*) FILTER (WHERE order_status = 'processing') as processing_orders,
                COUNT(*) FILTER (WHERE order_status = 'delivered') as delivered_orders,
                COUNT(*) as total_orders
            FROM orders
            WHERE org_id = :org_id
        """), {"org_id": org_id}).fetchone()
        
        # Today's stats
        today_stats = db.execute(text("""
            SELECT COUNT(*) as orders, COALESCE(SUM(final_amount), 0) as amount
            FROM orders
            WHERE org_id = :org_id AND order_date = :today
        """), {"org_id": org_id, "today": today}).fetchone()
        
        # Week stats
        week_stats = db.execute(text("""
            SELECT COUNT(*) as orders, COALESCE(SUM(final_amount), 0) as amount
            FROM orders
            WHERE org_id = :org_id AND order_date >= :week_start
        """), {"org_id": org_id, "week_start": week_start}).fetchone()
        
        # Month stats
        month_stats = db.execute(text("""
            SELECT COUNT(*) as orders, COALESCE(SUM(final_amount), 0) as amount
            FROM orders
            WHERE org_id = :org_id AND order_date >= :month_start
        """), {"org_id": org_id, "month_start": month_start}).fetchone()
        
        # Top products
        top_products = db.execute(text("""
            SELECT 
                p.product_name,
                p.product_code,
                SUM(oi.quantity) as total_quantity,
                SUM(oi.line_total) as total_revenue
            FROM order_items oi
            JOIN products p ON oi.product_id = p.product_id
            JOIN orders o ON oi.order_id = o.order_id
            WHERE o.org_id = :org_id
                AND o.order_date >= :month_start
            GROUP BY p.product_id, p.product_name, p.product_code
            ORDER BY total_revenue DESC
            LIMIT 10
        """), {"org_id": org_id, "month_start": month_start}).fetchall()
        
        return {
            "total_orders": stats.total_orders,
            "pending_orders": stats.pending_orders,
            "processing_orders": stats.processing_orders,
            "delivered_orders": stats.delivered_orders,
            "today_orders": today_stats.orders,
            "today_amount": today_stats.amount,
            "week_orders": week_stats.orders,
            "week_amount": week_stats.amount,
            "month_orders": month_stats.orders,
            "month_amount": month_stats.amount,
            "top_products": [dict(row._mapping) for row in top_products]
        }
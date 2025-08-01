"""
Order management endpoints for enterprise pharma system
Handles complete order lifecycle from creation to delivery
"""
from typing import Optional
from datetime import date, datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

from ...database import get_db
from ...schemas_v2.order import (
    OrderCreate, OrderResponse, OrderListResponse, InvoiceRequest,
    InvoiceResponse, DeliveryUpdate, ReturnRequest
)
from ...services.order_service import OrderService
from ...services.customer_service import CustomerService
from ...services.invoice_service import InvoiceService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/orders", tags=["orders"])

# Default organization ID (should come from auth in production)
DEFAULT_ORG_ID = "12de5e22-eee7-4d25-b3a7-d16d01c6170f"


@router.post("/", response_model=OrderResponse)
async def create_order(
    order: OrderCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new order with items
    
    - Validates customer credit limit
    - Checks inventory availability
    - Calculates taxes and totals
    - Allocates inventory using FIFO
    """
    try:
        # Set org_id early
        org_id = order.org_id if order.org_id else DEFAULT_ORG_ID
        
        # Validate customer exists and has credit
        credit_check = CustomerService.validate_credit_limit(
            db, order.customer_id, Decimal("0"), org_id  # Will calculate actual amount
        )
        
        if not credit_check["valid"] and credit_check.get("message") == "Customer not found":
            raise HTTPException(status_code=404, detail="Customer not found")
        
        # REMOVED: Orders should NOT validate inventory
        # Only invoices should validate and deduct inventory
        # This allows creating orders/challans even when stock is low
        # Enterprise systems allow orders to be placed regardless of current stock
        items_dict = [item.dict() for item in order.items]
        
        # Get customer details
        customer = db.execute(text("""
            SELECT customer_name, phone, discount_percent 
            FROM customers 
            WHERE customer_id = :id AND org_id = :org_id
        """), {"id": order.customer_id, "org_id": org_id}).fetchone()
        
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        customer_discount = customer.discount_percent or Decimal("0")
        
        totals = OrderService.calculate_order_totals(
            db, items_dict, customer_discount, org_id
        )
        
        # Check credit limit with actual amount
        credit_check = CustomerService.validate_credit_limit(
            db, order.customer_id, totals["total"], org_id
        )
        
        if not credit_check["valid"]:
            raise HTTPException(status_code=400, detail=credit_check["message"])
        
        # Generate order number
        order_number = OrderService.generate_order_number(db, org_id)
        
        # Create order
        order_data = order.dict(exclude={"items"})
        order_data.update({
            "order_number": order_number,
            "order_status": "pending",
            "customer_name": customer.customer_name,
            "customer_phone": customer.phone,
            "subtotal_amount": totals["subtotal"],
            "discount_amount": totals["discount"],
            "tax_amount": totals["tax"],
            "round_off_amount": Decimal("0"),
            "final_amount": totals["total"],
            "paid_amount": Decimal("0"),
            "balance_amount": totals["total"],
            "payment_mode": "credit",
            "payment_status": "pending",
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        })
        
        # Ensure org_id is set (critical for multi-tenant queries)
        if "org_id" not in order_data:
            order_data["org_id"] = DEFAULT_ORG_ID
        
        # Ensure payment_terms has a value (it might be None even with schema default)
        if not order_data.get("payment_terms"):
            order_data["payment_terms"] = "credit"
        
        # Insert order
        result = db.execute(text("""
            INSERT INTO orders (
                org_id, order_number, customer_id, customer_name, customer_phone,
                order_date, delivery_date, order_type, payment_terms, order_status,
                subtotal_amount, discount_amount, tax_amount, round_off_amount, final_amount,
                paid_amount, balance_amount, payment_mode, payment_status,
                notes, created_at, updated_at
            ) VALUES (
                :org_id, :order_number, :customer_id, :customer_name, :customer_phone,
                :order_date, :delivery_date, :order_type, :payment_terms, :order_status,
                :subtotal_amount, :discount_amount, :tax_amount, :round_off_amount, :final_amount,
                :paid_amount, :balance_amount, :payment_mode, :payment_status,
                :notes, :created_at, :updated_at
            ) RETURNING order_id
        """), order_data)
        
        order_id = result.scalar()
        
        # Insert order items
        for item in order.items:
            item_data = item.dict()
            item_data["order_id"] = order_id
            
            # Add selling_price (same as unit_price for now)
            item_data["selling_price"] = item_data.get("selling_price", item_data["unit_price"])
            # Add total_price (same as line_total)
            item_data["total_price"] = item_data.get("line_total", 
                item_data["quantity"] * item_data["unit_price"] - 
                item_data.get("discount_amount", 0) + item_data.get("tax_amount", 0))
            
            db.execute(text("""
                INSERT INTO order_items (
                    order_id, product_id, batch_id, quantity,
                    unit_price, selling_price, discount_percent, discount_amount,
                    tax_percent, tax_amount, line_total, total_price
                ) VALUES (
                    :order_id, :product_id, :batch_id, :quantity,
                    :unit_price, :selling_price, :discount_percent, :discount_amount,
                    :tax_percent, :tax_amount, :line_total, :total_price
                )
            """), item_data)
        
        # Allocate inventory
        OrderService.allocate_inventory(db, order_id, items_dict, org_id)
        
        db.commit()
        
        # Return created order
        return await get_order(order_id, db)
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating order: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create order: {str(e)}")


@router.get("/", response_model=OrderListResponse)
async def list_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    customer_id: Optional[int] = None,
    status: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db)
):
    """
    List orders with filters and pagination
    
    - Filter by customer, status, date range
    - Includes customer details and totals
    """
    try:
        # Build query
        query = """
            SELECT o.*, c.customer_name, c.customer_code, c.phone as customer_phone
            FROM orders o
            JOIN customers c ON o.customer_id = c.customer_id
            WHERE o.org_id = :org_id
        """
        count_query = """
            SELECT COUNT(*) FROM orders o
            WHERE o.org_id = :org_id
        """
        
        params = {"org_id": DEFAULT_ORG_ID}
        
        # Add filters
        if customer_id:
            query += " AND o.customer_id = :customer_id"
            count_query += " AND customer_id = :customer_id"
            params["customer_id"] = customer_id
        
        if status:
            query += " AND o.order_status = :status"
            count_query += " AND order_status = :status"
            params["status"] = status
        
        if from_date:
            query += " AND o.order_date >= :from_date"
            count_query += " AND order_date >= :from_date"
            params["from_date"] = from_date
        
        if to_date:
            query += " AND o.order_date <= :to_date"
            count_query += " AND order_date <= :to_date"
            params["to_date"] = to_date
        
        # Get total count
        total = db.execute(text(count_query), params).scalar()
        
        # Get orders
        query += " ORDER BY o.order_date DESC, o.order_id DESC LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        
        orders = []
        # Collect all order data first
        order_rows = list(result)
        
        # Get all order items in a single batch query
        items_by_order = {}
        if order_rows:
            order_ids = [row.order_id for row in order_rows]
            items_result = db.execute(text("""
                SELECT oi.*, p.product_name, p.product_code
                FROM order_items oi
                JOIN products p ON oi.product_id = p.product_id
                WHERE oi.order_id = ANY(:order_ids)
                ORDER BY oi.order_id, oi.order_item_id
            """), {"order_ids": order_ids})
            
            # Group items by order_id
            for item in items_result:
                order_id = item.order_id
                if order_id not in items_by_order:
                    items_by_order[order_id] = []
                items_by_order[order_id].append(dict(item._mapping))
        
        # Build order responses
        for row in order_rows:
            order_dict = dict(row._mapping)
            
            # Add items from batch lookup
            order_dict["items"] = items_by_order.get(row.order_id, [])
            
            # Map final_amount to total_amount for schema compatibility
            order_dict["total_amount"] = order_dict.get("final_amount", 0)
            order_dict["balance_amount"] = order_dict["total_amount"] - order_dict.get("paid_amount", 0)
            
            orders.append(OrderResponse(**order_dict))
        
        return OrderListResponse(
            total=total,
            page=skip // limit + 1,
            per_page=limit,
            orders=orders
        )
        
    except Exception as e:
        logger.error(f"Error listing orders: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list orders: {str(e)}")


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: int,
    db: Session = Depends(get_db)
):
    """Get order details with items"""
    try:
        # Get order with customer details
        result = db.execute(text("""
            SELECT o.*, c.customer_name, c.customer_code, c.phone as customer_phone
            FROM orders o
            JOIN customers c ON o.customer_id = c.customer_id
            WHERE o.order_id = :id AND o.org_id = :org_id
        """), {"id": order_id, "org_id": DEFAULT_ORG_ID})
        
        order = result.fetchone()
        if not order:
            raise HTTPException(status_code=404, detail=f"Order {order_id} not found")
        
        order_dict = dict(order._mapping)
        
        # Get order items
        items_result = db.execute(text("""
            SELECT oi.*, p.product_name, p.product_code,
                   b.batch_number, b.expiry_date
            FROM order_items oi
            JOIN products p ON oi.product_id = p.product_id
            LEFT JOIN batches b ON oi.batch_id = b.batch_id
            WHERE oi.order_id = :order_id
        """), {"order_id": order_id})
        
        order_dict["items"] = [dict(item._mapping) for item in items_result]
        # Map final_amount to total_amount for schema compatibility
        order_dict["total_amount"] = order_dict.get("final_amount", 0)
        # balance_amount is already in the database, no need to recalculate
        
        # Add missing timestamp fields that might not be in the database
        order_dict["confirmed_at"] = order_dict.get("confirmed_at", None)
        order_dict["delivered_at"] = order_dict.get("delivered_at", None)
        
        return OrderResponse(**order_dict)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting order: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get order: {str(e)}")


@router.put("/{order_id}")
async def update_order(
    order_id: int,
    order_data: dict,
    db: Session = Depends(get_db)
):
    """Update order details"""
    try:
        # Check if order exists
        existing = db.execute(text("""
            SELECT order_id FROM orders 
            WHERE order_id = :id AND org_id = :org_id
        """), {"id": order_id, "org_id": DEFAULT_ORG_ID}).scalar()
        
        if not existing:
            raise HTTPException(status_code=404, detail=f"Order {order_id} not found")
        
        # Build update query dynamically based on provided fields
        update_fields = []
        params = {"order_id": order_id, "org_id": DEFAULT_ORG_ID}
        
        # List of allowed update fields
        allowed_fields = [
            "customer_id", "order_date", "delivery_date", "status", 
            "payment_status", "payment_mode", "total_amount", "discount", 
            "final_amount", "notes"
        ]
        
        for field, value in order_data.items():
            if field in allowed_fields:
                # Map frontend field names to database column names
                db_field = field
                if field == "status":
                    db_field = "order_status"
                
                update_fields.append(f"{db_field} = :{field}")
                params[field] = value
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No valid fields to update")
        
        # Add updated_at timestamp
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        
        # Execute update
        update_query = f"""
            UPDATE orders 
            SET {', '.join(update_fields)}
            WHERE order_id = :order_id AND org_id = :org_id
        """
        
        db.execute(text(update_query), params)
        db.commit()
        
        # Return updated order
        return await get_order(order_id, db)
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating order: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update order: {str(e)}")


@router.put("/{order_id}/confirm")
async def confirm_order(
    order_id: int,
    db: Session = Depends(get_db)
):
    """Confirm a pending order"""
    try:
        # Check order exists and is pending
        status = db.execute(text("""
            SELECT order_status FROM orders WHERE order_id = :id AND org_id = :org_id
        """), {"id": order_id, "org_id": DEFAULT_ORG_ID}).scalar()
        
        if not status:
            raise HTTPException(status_code=404, detail=f"Order {order_id} not found")
        
        if status != "pending":
            raise HTTPException(
                status_code=400, 
                detail=f"Order cannot be confirmed. Current status: {status}"
            )
        
        # Update status
        db.execute(text("""
            UPDATE orders
            SET order_status = 'confirmed',
                confirmed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE order_id = :id AND org_id = :org_id
        """), {"id": order_id, "org_id": DEFAULT_ORG_ID})
        
        db.commit()
        
        return {"message": f"Order {order_id} confirmed successfully"}
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error confirming order: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to confirm order: {str(e)}")


@router.post("/{order_id}/invoice", response_model=InvoiceResponse)
async def generate_invoice(
    order_id: int,
    invoice_request: InvoiceRequest,
    db: Session = Depends(get_db)
):
    """Generate invoice for an order"""
    try:
        # Check order exists and is confirmed
        order = db.execute(text("""
            SELECT order_status, order_number FROM orders WHERE order_id = :id AND org_id = :org_id
        """), {"id": order_id, "org_id": DEFAULT_ORG_ID}).fetchone()
        
        if not order:
            # Get helpful debugging info
            latest = db.execute(text("""
                SELECT MAX(order_id) as max_id FROM orders WHERE org_id = :org_id
            """), {"org_id": DEFAULT_ORG_ID}).scalar()
            
            raise HTTPException(
                status_code=404, 
                detail={
                    "error": f"Order {order_id} not found",
                    "latest_order_id": latest,
                    "message": f"Order {order_id} does not exist. The latest order in the system is #{latest}.",
                    "possible_issues": [
                        "The order creation may have failed",
                        "The frontend is using a cached/incorrect order ID",
                        "Try using the create-with-order endpoint instead"
                    ],
                    "solution": "Use POST /api/v1/invoices/create-with-order to create both order and invoice together"
                }
            )
        
        if order.order_status not in ["confirmed", "processing", "packed"]:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot generate invoice. Order status: {order.order_status}"
            )
        
        # Generate comprehensive invoice
        invoice_data = InvoiceService.generate_invoice_for_order(
            db, 
            order_id, 
            invoice_request.invoice_date,
            DEFAULT_ORG_ID
        )
        
        db.commit()
        
        return InvoiceResponse(**invoice_data)
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error generating invoice: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate invoice: {str(e)}")


@router.put("/{order_id}/deliver")
async def mark_delivered(
    order_id: int,
    delivery: DeliveryUpdate,
    db: Session = Depends(get_db)
):
    """Mark order as delivered"""
    try:
        # Check order exists and is ready for delivery
        status = db.execute(text("""
            SELECT order_status FROM orders WHERE order_id = :id AND org_id = :org_id
        """), {"id": order_id, "org_id": DEFAULT_ORG_ID}).scalar()
        
        if not status:
            raise HTTPException(status_code=404, detail=f"Order {order_id} not found")
        
        if status not in ["invoiced", "shipped"]:
            raise HTTPException(
                status_code=400,
                detail=f"Order cannot be delivered. Current status: {status}"
            )
        
        # Update order
        db.execute(text("""
            UPDATE orders
            SET order_status = 'delivered',
                delivered_at = CURRENT_TIMESTAMP,
                delivery_notes = :notes,
                updated_at = CURRENT_TIMESTAMP
            WHERE order_id = :id
        """), {
            "id": order_id,
            "notes": delivery.delivery_notes
        })
        
        # Release allocated inventory
        db.execute(text("""
            UPDATE batches b
            SET quantity_sold = quantity_sold - im.quantity_out
            FROM (
                SELECT batch_id, COALESCE(quantity_out, 0) as quantity_out
                FROM inventory_movements
                WHERE reference_type = 'order' 
                    AND reference_id = :order_id
                    AND movement_type = 'sale'
            ) im
            WHERE b.batch_id = im.batch_id
        """), {"order_id": order_id})
        
        db.commit()
        
        return {"message": f"Order {order_id} marked as delivered"}
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error marking delivered: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to mark delivered: {str(e)}")


@router.post("/{order_id}/return")
async def process_return(
    order_id: int,
    return_request: ReturnRequest,
    db: Session = Depends(get_db)
):
    """Process order return"""
    try:
        result = OrderService.process_return(db, order_id, return_request)
        
        if not result["success"]:
            raise HTTPException(status_code=400, detail=result["message"])
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing return: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process return: {str(e)}")


@router.get("/dashboard/stats")
async def get_order_dashboard(db: Session = Depends(get_db)):
    """Get order dashboard statistics"""
    try:
        stats = OrderService.get_order_dashboard(db, DEFAULT_ORG_ID)
        return stats
    except Exception as e:
        logger.error(f"Error getting dashboard: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get dashboard: {str(e)}")
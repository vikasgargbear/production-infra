"""
Sales Order management endpoints for enterprise pharma system
Handles sales order lifecycle from creation to conversion
"""
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

from ...core.database import get_db
from ...core.config import DEFAULT_ORG_ID
from ..schemas.order import (
    OrderCreate, OrderResponse, OrderListResponse, InvoiceRequest,
    InvoiceResponse, DeliveryUpdate, OrderUpdate
)
from ..services.order_service import OrderService
from ..services.customer_service import CustomerService
from ..services.invoice_service import InvoiceService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sales-orders", tags=["sales-orders"])

@router.get("/employees")
async def get_employees_for_created_by(
    db: Session = Depends(get_db),
    org_id: str = DEFAULT_ORG_ID
):
    """Get list of employees for 'Created By' dropdown"""
    try:
        result = db.execute(text("""
            SELECT user_id, full_name, email, role, is_active
            FROM master.org_users 
            WHERE org_id = :org_id AND is_active = true
            ORDER BY full_name
        """), {"org_id": org_id})
        
        employees = [dict(row._mapping) for row in result]
        return employees
        
    except Exception as e:
        logger.error(f"Error fetching employees: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", response_model=OrderResponse)
async def create_sales_order(
    order: OrderCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new sales order (no inventory reduction)
    
    - Validates customer exists
    - Validates product availability
    - Calculates taxes and totals
    - Creates order with 'pending' status
    - NO inventory allocation until approval
    """
    try:
        # Set org_id early
        org_id = order.org_id if order.org_id else DEFAULT_ORG_ID
        
        # Validate customer exists
        customer = db.execute(text("""
            SELECT customer_id, customer_name, primary_phone 
            FROM parties.customers 
            WHERE customer_id = :id AND org_id = :org_id
        """), {"id": order.customer_id, "org_id": org_id}).fetchone()
        
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        customer_discount = Decimal("0")  # Default to no customer discount for now
        
        # Validate products exist (but don't check inventory yet)
        items_dict = [item.dict() for item in order.items]
        for item in items_dict:
            product = db.execute(text("""
                SELECT product_id, product_name FROM inventory.products 
                WHERE product_id = :id AND org_id = :org_id
            """), {"id": item["product_id"], "org_id": org_id}).fetchone()
            
            if not product:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Product {item['product_id']} not found"
                )
        
        # Calculate totals
        totals = OrderService.calculate_order_totals(
            db, items_dict, customer_discount, org_id
        )
        
        # Generate order number
        order_number = OrderService.generate_order_number(db, org_id)
        
        # Create sales order (no inventory allocation)
        order_data = order.dict(exclude={"items"})
        order_data.update({
            "order_number": order_number,
            "order_status": "draft",  # Match schema values
            "order_type": "regular",  # Match schema pattern
            "customer_name": customer.customer_name,
            "customer_phone": customer.primary_phone,
            "subtotal_amount": totals["subtotal"],
            "discount_amount": totals["discount"],
            "tax_amount": totals["tax"],
            "total_amount": totals["total"],
            "fulfillment_status": "pending",
            "payment_status": "unpaid",
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        })
        
        # Ensure org_id and payment_terms
        if "org_id" not in order_data:
            order_data["org_id"] = DEFAULT_ORG_ID
        if not order_data.get("payment_terms"):
            order_data["payment_terms"] = "credit"
        
        # Get a valid user ID for created_by field
        user_result = db.execute(text("""
            SELECT user_id FROM master.org_users 
            WHERE org_id = :org_id AND is_active = true 
            LIMIT 1
        """), {"org_id": org_id})
        user = user_result.fetchone()
        created_by_user = user.user_id if user else 1
        
        # Insert sales order
        result = db.execute(text("""
            INSERT INTO sales.orders (
                org_id, order_number, order_date, customer_id, customer_name, customer_phone,
                order_type, delivery_date, payment_terms, subtotal_amount, discount_amount,
                tax_amount, total_amount, order_status, fulfillment_status, payment_status,
                notes, created_by, created_at, updated_at
            ) VALUES (
                :org_id, :order_number, :order_date, :customer_id, :customer_name, :customer_phone,
                :order_type, :delivery_date, :payment_terms, :subtotal_amount, :discount_amount,
                :tax_amount, :total_amount, :order_status, :fulfillment_status, :payment_status,
                :notes, :created_by, :created_at, :updated_at
            ) RETURNING order_id
        """), {**order_data, "created_by": created_by_user})
        
        order_id = result.scalar()
        
        # Insert order items
        for item in order.items:
            item_data = item.dict()
            item_data["order_id"] = order_id
            
            # Get product details including HSN code
            product_details = db.execute(text("""
                SELECT product_name, hsn_code FROM inventory.products 
                WHERE product_id = :product_id AND org_id = :org_id
            """), {"product_id": item_data["product_id"], "org_id": org_id}).fetchone()
            
            # Enhanced calculation logic - consistent with frontend
            quantity = Decimal(str(item_data["quantity"]))
            unit_price = Decimal(str(item_data["unit_price"]))
            discount_percent = Decimal(str(item_data.get("discount_percent", 0)))
            tax_percent = Decimal(str(item_data.get("tax_percent", 18)))
            free_quantity = Decimal(str(item_data.get("free_quantity", 0)))
            
            # Step 1: Base amount calculation
            gross_amount = quantity * unit_price
            
            # Step 2: Discount calculation
            discount_amount = (gross_amount * discount_percent) / 100
            
            # Step 3: Taxable amount (after discount)
            taxable_amount = gross_amount - discount_amount
            
            # Step 4: Tax calculations (GST components)
            # For intra-state: CGST + SGST, for inter-state: IGST
            cgst_percent = tax_percent / 2
            sgst_percent = tax_percent / 2 
            igst_percent = Decimal("0")  # Assume intra-state for now
            
            cgst_amount = (taxable_amount * cgst_percent) / 100
            sgst_amount = (taxable_amount * sgst_percent) / 100
            igst_amount = (taxable_amount * igst_percent) / 100
            
            tax_amount = cgst_amount + sgst_amount + igst_amount
            
            # Step 5: Final line total
            line_total = taxable_amount + tax_amount
            
            # Ensure no zero calculations
            if line_total <= 0:
                logger.warning(f"Line total is zero for product {item_data['product_id']}: qty={quantity}, price={unit_price}")
                line_total = Decimal("0.01")  # Minimum value to prevent zero
            
            # Build complete item data with all required fields - ensure proper decimal conversion
            complete_item_data = {
                "order_id": order_id,
                "product_id": item_data["product_id"],
                "product_name": product_details.product_name if product_details else f"Product {item_data['product_id']}",
                "hsn_code": product_details.hsn_code if product_details else None,
                "quantity": float(quantity),
                "uom": item_data.get("uom", "PCS"),
                "pack_type": item_data.get("pack_type", "Strip"),
                "pack_size": item_data.get("pack_size", 1),
                "base_quantity": float(quantity),  # Same as quantity for now
                "unit_price": float(unit_price),
                "mrp": item_data.get("mrp", float(unit_price * Decimal("1.2"))),  # Default MRP calculation
                "discount_percent": float(discount_percent),
                "discount_amount": float(discount_amount),
                "scheme_discount_percent": item_data.get("scheme_discount_percent", 0),
                "scheme_discount_amount": item_data.get("scheme_discount_amount", 0),
                "free_quantity": float(free_quantity),
                "scheme_code": item_data.get("scheme_code"),
                "taxable_amount": float(taxable_amount),
                "tax_percent": float(tax_percent),
                "tax_amount": float(tax_amount),
                "igst_percent": float(igst_percent),
                "cgst_percent": float(cgst_percent),
                "sgst_percent": float(sgst_percent),
                "cess_percent": item_data.get("cess_percent", 0),
                "line_total": float(line_total)
            }
            
            # Logging for debugging calculations
            logger.info(f"Item {item_data['product_id']}: Qty={quantity}, Price={unit_price}, "
                       f"Gross={gross_amount}, Discount={discount_amount}, "
                       f"Taxable={taxable_amount}, Tax={tax_amount}, Total={line_total}")
            
            db.execute(text("""
                INSERT INTO sales.order_items (
                    order_id, product_id, product_name, hsn_code,
                    quantity, uom, pack_type, pack_size, base_quantity,
                    unit_price, mrp, discount_percent, discount_amount,
                    scheme_discount_percent, scheme_discount_amount, free_quantity, scheme_code,
                    taxable_amount, tax_percent, tax_amount,
                    igst_percent, cgst_percent, sgst_percent, cess_percent,
                    line_total
                ) VALUES (
                    :order_id, :product_id, :product_name, :hsn_code,
                    :quantity, :uom, :pack_type, :pack_size, :base_quantity,
                    :unit_price, :mrp, :discount_percent, :discount_amount,
                    :scheme_discount_percent, :scheme_discount_amount, :free_quantity, :scheme_code,
                    :taxable_amount, :tax_percent, :tax_amount,
                    :igst_percent, :cgst_percent, :sgst_percent, :cess_percent,
                    :line_total
                )
            """), complete_item_data)
        
        # NO inventory allocation for sales orders - that happens on approval
        
        db.commit()
        
        # Return created order
        return await get_sales_order(order_id, db)
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating sales order: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create sales order: {str(e)}")

@router.get("/", response_model=OrderListResponse)
async def list_sales_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    customer_id: Optional[int] = None,
    status: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db)
):
    """
    List sales orders with filters and pagination
    """
    try:
        # Build query - only get sales orders
        query = """
            SELECT o.*, c.customer_name, c.customer_code, c.primary_phone as customer_phone
            FROM sales.orders o
            JOIN parties.customers c ON o.customer_id = c.customer_id
            WHERE o.org_id = :org_id AND o.order_type = 'regular'
        """
        count_query = """
            SELECT COUNT(*) FROM sales.orders o
            WHERE o.org_id = :org_id AND o.order_type = 'regular'
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
        order_rows = list(result)
        
        # Get items for all orders in batch
        items_by_order = {}
        if order_rows:
            order_ids = [row.order_id for row in order_rows]
            items_result = db.execute(text("""
                SELECT oi.*, p.product_name, p.product_code
                FROM sales.order_items oi
                JOIN inventory.products p ON oi.product_id = p.product_id
                WHERE oi.order_id = ANY(:order_ids)
                ORDER BY oi.order_id, oi.order_item_id
            """), {"order_ids": order_ids})
            
            for item in items_result:
                order_id = item.order_id
                if order_id not in items_by_order:
                    items_by_order[order_id] = []
                items_by_order[order_id].append(dict(item._mapping))
        
        # Build responses
        orders = []
        for row in order_rows:
            order_dict = dict(row._mapping)
            order_dict["items"] = items_by_order.get(row.order_id, [])
            order_dict["total_amount"] = order_dict.get("final_amount", 0)
            order_dict["balance_amount"] = order_dict["total_amount"] - order_dict.get("0 as paid_amount", 0)
            orders.append(OrderResponse(**order_dict))
        
        return OrderListResponse(
            total=total,
            page=skip // limit + 1,
            per_page=limit,
            orders=orders
        )
        
    except Exception as e:
        logger.error(f"Error listing sales orders: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list sales orders: {str(e)}")

@router.get("/{order_id}", response_model=OrderResponse)
async def get_sales_order(
    order_id: int,
    db: Session = Depends(get_db)
):
    """Get sales order details with items"""
    try:
        # Get order with customer details - only sales orders
        result = db.execute(text("""
            SELECT o.*, c.customer_name, c.customer_code, c.primary_primary_phone as customer_phone
            FROM sales.orders o
            JOIN parties.customers c ON o.customer_id = c.customer_id
            WHERE o.order_id = :id AND o.org_id = :org_id AND o.order_type = 'sales'
        """), {"id": order_id, "org_id": DEFAULT_ORG_ID})
        
        order = result.fetchone()
        if not order:
            raise HTTPException(status_code=404, detail=f"Sales order {order_id} not found")
        
        order_dict = dict(order._mapping)
        
        # Get order items
        items_result = db.execute(text("""
            SELECT oi.*, p.product_name, p.product_code,
                   b.batch_number, b.expiry_date
            FROM sales.order_items oi
            JOIN inventory.products p ON oi.product_id = p.product_id
            LEFT JOIN inventory.batches b ON oi.batch_id = b.batch_id
            WHERE oi.order_id = :order_id
        """), {"order_id": order_id})
        
        order_dict["items"] = [dict(item._mapping) for item in items_result]
        order_dict["total_amount"] = order_dict.get("final_amount", 0)
        order_dict["confirmed_at"] = order_dict.get("confirmed_at", None)
        order_dict["delivered_at"] = order_dict.get("delivered_at", None)
        
        return OrderResponse(**order_dict)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting sales order: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get sales order: {str(e)}")

@router.put("/{order_id}", response_model=OrderResponse)
async def update_sales_order(
    order_id: int,
    order_data: OrderUpdate,
    db: Session = Depends(get_db)
):
    """Update sales order details (only for pending orders)"""
    try:
        # Check if order exists and is editable
        existing = db.execute(text("""
            SELECT order_status FROM sales.orders 
            WHERE order_id = :id AND org_id = :org_id AND order_type = 'sales'
        """), {"id": order_id, "org_id": DEFAULT_ORG_ID}).fetchone()
        
        if not existing:
            raise HTTPException(status_code=404, detail=f"Sales order {order_id} not found")
        
        if existing.order_status not in ["pending", "draft"]:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot edit order with status: {existing.order_status}"
            )
        
        # Build update query
        update_fields = []
        params = {"order_id": order_id, "org_id": DEFAULT_ORG_ID}
        
        update_data = order_data.dict(exclude_unset=True)
        for field, value in update_data.items():
            if value is not None:
                update_fields.append(f"{field} = :{field}")
                params[field] = value
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        # Add updated timestamp
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        
        # Execute update
        update_query = f"""
            UPDATE sales.orders 
            SET {', '.join(update_fields)}
            WHERE order_id = :order_id AND org_id = :org_id
        """
        
        db.execute(text(update_query), params)
        db.commit()
        
        return await get_sales_order(order_id, db)
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating sales order: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update sales order: {str(e)}")

@router.post("/{order_id}/approve")
async def approve_sales_order(
    order_id: int,
    db: Session = Depends(get_db)
):
    """
    Approve sales order and allocate inventory
    This is when inventory gets reserved
    """
    try:
        # Check order exists and is pending
        order = db.execute(text("""
            SELECT order_status, customer_id FROM sales.orders 
            WHERE order_id = :id AND org_id = :org_id AND order_type = 'sales'
        """), {"id": order_id, "org_id": DEFAULT_ORG_ID}).fetchone()
        
        if not order:
            raise HTTPException(status_code=404, detail=f"Sales order {order_id} not found")
        
        if order.order_status != "pending":
            raise HTTPException(
                status_code=400, 
                detail=f"Order cannot be approved. Current status: {order.order_status}"
            )
        
        # Get order items for inventory validation
        items = db.execute(text("""
            SELECT product_id, batch_id, quantity, unit_price
            FROM sales.order_items 
            WHERE order_id = :order_id
        """), {"order_id": order_id}).fetchall()
        
        items_dict = [dict(item._mapping) for item in items]
        
        # NOW validate inventory availability
        inventory_check = OrderService.validate_inventory(db, items_dict, DEFAULT_ORG_ID)
        
        if not inventory_check["valid"]:
            failed_items = [
                f"Product {item['product_id']}: {item['message']}" 
                for item in inventory_check["items"] 
                if not item["valid"]
            ]
            raise HTTPException(
                status_code=400, 
                detail=f"Inventory validation failed: {'; '.join(failed_items)}"
            )
        
        # Check customer credit limit
        total_amount = db.execute(text("""
            SELECT final_amount FROM sales.orders WHERE order_id = :id
        """), {"id": order_id}).scalar()
        
        credit_check = CustomerService.validate_credit_limit(
            db, order.customer_id, total_amount, DEFAULT_ORG_ID
        )
        
        if not credit_check["valid"]:
            raise HTTPException(status_code=400, detail=credit_check["message"])
        
        # Update order status to approved
        db.execute(text("""
            UPDATE sales.orders
            SET order_status = 'approved',
                confirmed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE order_id = :id AND org_id = :org_id
        """), {"id": order_id, "org_id": DEFAULT_ORG_ID})
        
        # NOW allocate inventory
        OrderService.allocate_inventory(db, order_id, items_dict, DEFAULT_ORG_ID)
        
        db.commit()
        
        return {
            "message": f"Sales order {order_id} approved successfully", 
            "status": "approved",
            "inventory_allocated": True
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error approving sales order: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to approve sales order: {str(e)}")

@router.post("/{order_id}/convert-to-invoice", response_model=InvoiceResponse)
async def convert_to_invoice(
    order_id: int,
    invoice_request: InvoiceRequest,
    db: Session = Depends(get_db)
):
    """Convert approved sales order to invoice"""
    try:
        # Check order exists and is approved
        order = db.execute(text("""
            SELECT order_status, order_number FROM sales.orders 
            WHERE order_id = :id AND org_id = :org_id AND order_type = 'sales'
        """), {"id": order_id, "org_id": DEFAULT_ORG_ID}).fetchone()
        
        if not order:
            raise HTTPException(status_code=404, detail=f"Sales order {order_id} not found")
        
        if order.order_status not in ["approved", "confirmed"]:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot convert to invoice. Order status: {order.order_status}"
            )
        
        # Generate invoice
        invoice_data = InvoiceService.generate_invoice_for_order(
            db, 
            order_id, 
            invoice_request.invoice_date,
            DEFAULT_ORG_ID
        )
        
        # Update order status
        db.execute(text("""
            UPDATE sales.orders
            SET order_status = 'invoiced',
                updated_at = CURRENT_TIMESTAMP
            WHERE order_id = :id
        """), {"id": order_id})
        
        db.commit()
        
        return InvoiceResponse(**invoice_data)
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error converting to invoice: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to convert to invoice: {str(e)}")

@router.post("/{order_id}/convert-to-challan")
async def convert_to_challan(
    order_id: int,
    challan_date: Optional[date] = None,
    db: Session = Depends(get_db)
):
    """Convert approved sales order to delivery challan"""
    try:
        # Check order exists and is approved
        order = db.execute(text("""
            SELECT order_status FROM sales.orders 
            WHERE order_id = :id AND org_id = :org_id AND order_type = 'sales'
        """), {"id": order_id, "org_id": DEFAULT_ORG_ID}).fetchone()
        
        if not order:
            raise HTTPException(status_code=404, detail=f"Sales order {order_id} not found")
        
        if order.order_status not in ["approved", "confirmed"]:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot convert to challan. Order status: {order.order_status}"
            )
        
        # TODO: Implement challan generation service
        # For now, just update status
        db.execute(text("""
            UPDATE sales.orders
            SET order_status = 'shipped',
                updated_at = CURRENT_TIMESTAMP
            WHERE order_id = :id
        """), {"id": order_id})
        
        db.commit()
        
        return {
            "message": f"Sales order {order_id} converted to challan",
            "challan_date": challan_date or date.today(),
            "status": "shipped"
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error converting to challan: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to convert to challan: {str(e)}")

@router.post("/validate")
async def validate_sales_order(
    order_data: OrderCreate,
    db: Session = Depends(get_db)
):
    """Validate sales order data without creating it"""
    try:
        org_id = order_data.org_id if order_data.org_id else DEFAULT_ORG_ID
        
        # Validate customer
        customer = db.execute(text("""
            SELECT customer_id FROM parties.customers 
            WHERE customer_id = :id AND org_id = :org_id
        """), {"id": order_data.customer_id, "org_id": org_id}).fetchone()
        
        if not customer:
            return {"valid": False, "message": "Customer not found"}
        
        # Validate products
        for item in order_data.items:
            product = db.execute(text("""
                SELECT product_id FROM inventory.products 
                WHERE product_id = :id AND org_id = :org_id
            """), {"id": item.product_id, "org_id": org_id}).fetchone()
            
            if not product:
                return {"valid": False, "message": f"Product {item.product_id} not found"}
        
        return {"valid": True, "message": "Sales order data is valid"}
        
    except Exception as e:
        logger.error(f"Error validating sales order: {str(e)}")
        return {"valid": False, "message": f"Validation error: {str(e)}"}

@router.get("/dashboard/stats")
async def get_sales_order_dashboard(db: Session = Depends(get_db)):
    """Get sales order dashboard statistics"""
    try:
        # Get sales order specific stats
        stats = db.execute(text("""
            SELECT 
                COUNT(*) as total_orders,
                COUNT(*) FILTER (WHERE order_status = 'pending') as pending_orders,
                COUNT(*) FILTER (WHERE order_status = 'approved') as approved_orders,
                COUNT(*) FILTER (WHERE order_status = 'invoiced') as invoiced_orders,
                COALESCE(SUM(final_amount), 0) as total_value,
                COALESCE(SUM(final_amount) FILTER (WHERE order_date = CURRENT_DATE), 0) as today_value
            FROM sales.orders 
            WHERE org_id = :org_id AND order_type = 'sales'
        """), {"org_id": DEFAULT_ORG_ID}).fetchone()
        
        return {
            "total_orders": stats.total_orders,
            "pending_orders": stats.pending_orders,
            "approved_orders": stats.approved_orders,
            "invoiced_orders": stats.invoiced_orders,
            "total_value": float(stats.total_value),
            "today_value": float(stats.today_value)
        }
        
    except Exception as e:
        logger.error(f"Error getting sales order dashboard: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get dashboard: {str(e)}")
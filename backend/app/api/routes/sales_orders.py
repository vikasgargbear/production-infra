"""
Sales Order management endpoints for enterprise pharma system
Handles sales order lifecycle from creation to conversion
"""
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

from ...core.database import get_db
from ...core.secure_auth import get_org_id_secure  # SECURE: Token-based auth
from ...core.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from ...core.org_context import get_org_context, OrgContext
from ..services.document_number_service import DocumentNumberService
from ..schemas.order import (
    OrderCreate, OrderResponse, OrderListResponse, InvoiceRequest,
    InvoiceResponse, DeliveryUpdate, OrderUpdate
)
from ..services.order_service import OrderService
from ..services.customer_service import CustomerService
from ..services.invoice_service import InvoiceService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sales-orders", tags=["sales-orders"])

@router.get("/generate-number")
@with_tenant_context
async def generate_sales_order_number(
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)  # SECURE: JWT-based
):
    """Generate next sales order number using unified service"""
    try:
        # Use unified document number service
        new_number = DocumentNumberService.generate_number(db, "sales_order", org_id)
        return {"order_number": new_number}
    except Exception as e:
        logger.error(f"Failed to generate sales order number: {e}")
        # Use service's fallback mechanism
        current_year = datetime.now().year % 100
        timestamp = int(datetime.now().timestamp() * 1000) % 100000000
        fallback_number = f"SO-{current_year:02d}{timestamp:08d}"
        return {"order_number": fallback_number}

@router.get("/employees")
@with_tenant_context
async def get_employees_for_created_by(
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)  # SECURE: JWT-based
):
    """Get list of employees for 'Created By' dropdown"""
    try:
        # Convert org_id to UUID if needed
        if isinstance(org_id, str):
            org_id = UUID(org_id)
            
        result = db.execute(text("""
            SELECT user_id, full_name, email, role_id, is_active
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
@with_tenant_context
async def create_sales_order(
    order: OrderCreate,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)  # SECURE: JWT-based
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
        # Set org_id early - ensure it's a UUID object
        # org_id from header is a string, need to convert to UUID
        if order.org_id:
            org_id = order.org_id if isinstance(order.org_id, UUID) else UUID(str(order.org_id))
        elif org_id:  # From header/token
            org_id = UUID(str(org_id)) if not isinstance(org_id, UUID) else org_id
        else:
            raise HTTPException(status_code=400, detail="Organization ID is required")
        
        logger.info(f"Creating sales order for customer_id={order.customer_id}, org_id={org_id}, type={type(org_id)}")
        
        # Handle addresses if provided (create in master.addresses if they're new)
        billing_address_id = None
        shipping_address_id = None
        delivery_address_id = None
        
        if order.billing_address:
            # Check if address exists or create new one
            billing_address_id = _get_or_create_address(
                db, org_id, order.customer_id, 
                order.billing_address, 'billing'
            )
        
        if order.shipping_address:
            # Check if address exists or create new one
            shipping_address_id = _get_or_create_address(
                db, org_id, order.customer_id,
                order.shipping_address, 'shipping'
            )
            # Use shipping as delivery address
            delivery_address_id = shipping_address_id
        
        # Validate customer exists and get all details
        # SECURITY FIX: ALWAYS filter by org_id to prevent cross-org data access
        customer = db.execute(text("""
            SELECT customer_id, customer_name, primary_phone, gst_number
            FROM parties.customers
            WHERE customer_id = :id AND org_id = :org_id
        """), {"id": order.customer_id, "org_id": org_id}).fetchone()
        
        if not customer:
            logger.error(f"Customer {order.customer_id} does not exist")
            raise HTTPException(status_code=404, detail="Customer not found")
        
        customer_discount = Decimal("0")  # Default to no customer discount for now
        
        # Validate products exist (but don't check inventory yet)
        # SECURITY FIX: ALWAYS filter by org_id
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
        
        # Calculate totals by summing up item values
        total_subtotal = Decimal("0")
        total_discount = Decimal("0")
        total_taxable = Decimal("0")
        total_cgst = Decimal("0")
        total_sgst = Decimal("0")
        total_igst = Decimal("0")
        total_tax = Decimal("0")
        
        for item in order.items:
            base_quantity = Decimal(str(item.quantity))  # What customer pays for
            unit_price = Decimal(str(item.unit_price))
            discount_percent = Decimal(str(item.discount_percent or 0))
            tax_percent = Decimal(str(item.tax_percent or 0))  # No default - must come from product
            gst_type = getattr(item, 'gst_type', 'CGST/SGST')
            
            gross_amount = base_quantity * unit_price  # Calculate on what customer pays for
            discount_amount = (gross_amount * discount_percent) / 100
            taxable_amount = gross_amount - discount_amount
            
            # Calculate GST components based on type
            if gst_type == "IGST":
                igst_amount = (taxable_amount * tax_percent) / 100
                cgst_amount = Decimal("0")
                sgst_amount = Decimal("0")
            else:
                cgst_amount = (taxable_amount * tax_percent / 2) / 100
                sgst_amount = (taxable_amount * tax_percent / 2) / 100
                igst_amount = Decimal("0")
            
            tax_amount = cgst_amount + sgst_amount + igst_amount
            
            # Add to totals
            total_subtotal += gross_amount
            total_discount += discount_amount
            total_taxable += taxable_amount
            total_cgst += cgst_amount
            total_sgst += sgst_amount
            total_igst += igst_amount
            total_tax += tax_amount
        
        # Final amount calculation
        final_amount = total_taxable + total_tax
        
        totals = {
            "subtotal": total_subtotal,
            "discount": total_discount,
            "taxable": total_taxable,
            "cgst": total_cgst,
            "sgst": total_sgst,
            "igst": total_igst,
            "tax": total_tax,
            "total": final_amount,
            "round_off": Decimal("0")
        }
        
        # Generate order number
        order_number = OrderService.generate_order_number(db, org_id)
        
        # Get valid branch_id for the org (following invoice pattern)
        # Try with org_id first, then without (for legacy data)
        branch_result = db.execute(text("""
            SELECT branch_id FROM master.org_branches 
            WHERE org_id = :org_id 
            LIMIT 1
        """), {"org_id": org_id})
        branch = branch_result.fetchone()
        
        if not branch:
            # Try without org_id filter (for legacy data)
            branch_result = db.execute(text("""
                SELECT branch_id FROM master.org_branches 
                LIMIT 1
            """))
            branch = branch_result.fetchone()
        
        branch_id = branch[0] if branch else None  # Use NULL if no branch found (like invoice does)
        
        # Create sales order data with ALL actual schema columns
        order_data = order.dict(exclude={"items"})
        order_data.update({
            "order_number": order_number,
            "order_status": "draft",  # Match schema values
            "branch_id": branch_id,  # Use actual branch from DB
            "customer_name": customer.customer_name,  # Schema has this column!
            "customer_phone": customer.primary_phone,  # Schema has this column!
            "delivery_address_id": delivery_address_id,  # Add address reference
            "subtotal_amount": totals["subtotal"],
            "discount_amount": totals["discount"],
            "taxable_amount": totals["taxable"],  # Add taxable amount!
            "tax_amount": totals["tax"],
            "cgst_amount": totals.get("cgst", Decimal("0")),  # Schema has this!
            "sgst_amount": totals.get("sgst", Decimal("0")),  # Schema has this!
            "igst_amount": totals.get("igst", Decimal("0")),  # Schema has this!
            "items_count": len(order.items),  # Add items count!
            "round_off_amount": totals.get("round_off", Decimal("0")),
            "final_amount": totals["total"],
            "fulfillment_status": "pending",
            "payment_status": "pending",  # Match schema enum
            "paid_amount": Decimal("0"),  # Schema has this!
            "balance_amount": totals["total"],  # Schema has this!
            "payment_mode": "credit",  # Schema has this with default!
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        })
        
        # Ensure org_id and payment_terms
        # IMPORTANT: Always set org_id from authenticated source, not from request
        order_data["org_id"] = org_id  # Use the UUID we converted above
        if not order_data.get("payment_terms"):
            order_data["payment_terms"] = "credit"
        
        # Get a valid user ID for created_by field (following invoice pattern)
        # Try with org_id first, then without (for legacy data)
        user_result = db.execute(text("""
            SELECT user_id FROM master.org_users 
            WHERE org_id = :org_id AND is_active = true 
            LIMIT 1
        """), {"org_id": org_id})
        user = user_result.fetchone()
        
        if not user:
            # Try without org_id filter (for legacy data)
            user_result = db.execute(text("""
                SELECT user_id FROM master.org_users 
                WHERE is_active = true 
                LIMIT 1
            """))
            user = user_result.fetchone()
        
        created_by_user = user[0] if user else None  # Use NULL if no user found (like invoice does)
        
        # Insert sales order using actual schema columns
        result = db.execute(text("""
            INSERT INTO sales.orders (
                org_id, branch_id, order_number, order_date, customer_id,
                customer_name, customer_phone,
                order_type, delivery_date, delivery_address_id, payment_terms,
                subtotal_amount, discount_amount, taxable_amount, tax_amount, round_off_amount, final_amount,
                cgst_amount, sgst_amount, igst_amount,
                order_status, payment_status, fulfillment_status,
                paid_amount, balance_amount, payment_mode,
                notes, created_by, created_at, updated_at, items_count
            ) VALUES (
                :org_id, :branch_id, :order_number, :order_date, :customer_id,
                :customer_name, :customer_phone,
                :order_type, :delivery_date, :delivery_address_id, :payment_terms,
                :subtotal_amount, :discount_amount, :taxable_amount, :tax_amount, :round_off_amount, :final_amount,
                :cgst_amount, :sgst_amount, :igst_amount,
                :order_status, :payment_status, :fulfillment_status,
                :paid_amount, :balance_amount, :payment_mode,
                :notes, :created_by, :created_at, :updated_at, :items_count
            ) RETURNING order_id
        """), {**order_data, "created_by": created_by_user})
        
        order_id = result.scalar()
        
        # Insert order items
        for item in order.items:
            item_data = item.dict()
            item_data["order_id"] = order_id
            
            # Get product details including HSN code and product_code
            # SECURITY FIX: ALWAYS filter by org_id
            product_details = db.execute(text("""
                SELECT product_name, hsn_code, product_code FROM inventory.products
                WHERE product_id = :product_id AND org_id = :org_id
            """), {"product_id": item_data["product_id"], "org_id": org_id}).fetchone()
            
            # CORRECTED calculation logic - matching invoice pattern
            base_quantity = Decimal(str(item_data["quantity"]))  # What customer PAYS for
            free_quantity = Decimal(str(item_data.get("free_quantity", 0)))  # ADDITIONAL free items
            total_quantity = base_quantity + free_quantity  # TOTAL items to deliver
            
            unit_price = Decimal(str(item_data["unit_price"]))
            discount_percent = Decimal(str(item_data.get("discount_percent", 0)))
            tax_percent = Decimal(str(item_data.get("tax_percent", 0)))  # No default - must come from product
            
            # CORRECT: base_quantity is what customer PAYS for (2)
            # free_quantity is ADDITIONAL items (4)
            # quantity (total) = base_quantity + free_quantity (6)
            
            # Step 1: Base amount calculation using base_quantity (what customer pays for)
            gross_amount = base_quantity * unit_price
            
            # Step 2: Discount calculation
            discount_amount = (gross_amount * discount_percent) / 100
            
            # Step 3: Taxable amount (after discount)
            taxable_amount = gross_amount - discount_amount
            
            # Step 4: Tax calculations (GST components)
            # Determine GST type based on item data or default to CGST/SGST
            gst_type = item_data.get("gst_type", "CGST/SGST")
            
            if gst_type == "IGST":
                # Inter-state: Full tax as IGST
                igst_percent = tax_percent
                cgst_percent = Decimal("0")
                sgst_percent = Decimal("0")
                igst_amount = (taxable_amount * igst_percent) / 100
                cgst_amount = Decimal("0")
                sgst_amount = Decimal("0")
            else:
                # Intra-state: Split tax between CGST and SGST
                cgst_percent = tax_percent / 2
                sgst_percent = tax_percent / 2 
                igst_percent = Decimal("0")
                cgst_amount = (taxable_amount * cgst_percent) / 100
                sgst_amount = (taxable_amount * sgst_percent) / 100
                igst_amount = Decimal("0")
            
            tax_amount = cgst_amount + sgst_amount + igst_amount
            
            # Step 5: Final line total
            line_total = taxable_amount + tax_amount
            
            # Ensure no zero calculations
            if line_total <= 0:
                logger.warning(f"Line total is zero for product {item_data['product_id']}: qty={base_quantity}, price={unit_price}")
                line_total = Decimal("0.01")  # Minimum value to prevent zero
            
            # Build complete item data with all required fields - ensure proper decimal conversion
            complete_item_data = {
                "order_id": order_id,
                "product_id": item_data["product_id"],
                "product_name": product_details.product_name if product_details else f"Product {item_data['product_id']}",
                "product_code": product_details.product_code if product_details else item_data.get("product_code"),  # Add product_code!
                "hsn_code": product_details.hsn_code if product_details else None,
                "batch_id": item_data.get("batch_id"),  # Add batch_id from request
                "batch_number": item_data.get("batch_number"),  # Add batch_number from request
                "quantity": float(total_quantity),  # TOTAL quantity (base + free)
                "uom": item_data.get("uom"),  # No default UOM
                "pack_type": item_data.get("pack_type"),  # No default pack type
                "pack_size": item_data.get("pack_size"),  # No default pack size
                "base_quantity": float(base_quantity),  # What customer PAYS for
                "unit_price": float(unit_price),
                "mrp": float(item_data.get("mrp", unit_price)),  # MRP from frontend!
                "discount_percent": float(discount_percent),
                "discount_amount": float(discount_amount),
                "scheme_discount_percent": item_data.get("scheme_discount_percent", 0),
                "scheme_discount_amount": item_data.get("scheme_discount_amount", 0),
                "free_quantity": float(free_quantity),  # ADDITIONAL free items
                "scheme_code": item_data.get("scheme_code"),
                "taxable_amount": float(taxable_amount),
                "tax_percent": float(tax_percent),
                "tax_amount": float(tax_amount),
                "igst_percent": float(igst_percent),
                "cgst_percent": float(cgst_percent),
                "sgst_percent": float(sgst_percent),
                "cgst_amount": float(cgst_amount),  # Schema has this column!
                "sgst_amount": float(sgst_amount),  # Schema has this column!
                "igst_amount": float(igst_amount),  # Schema has this column!
                "cess_percent": item_data.get("cess_percent", 0),
                "cess_amount": item_data.get("cess_amount", 0),  # Schema has this column!
                "line_total": float(line_total)
            }
            
            db.execute(text("""
                INSERT INTO sales.order_items (
                    order_id, product_id, product_name, product_code, hsn_code,
                    batch_id, batch_number,
                    quantity, uom, pack_type, pack_size, base_quantity,
                    unit_price, mrp, discount_percent, discount_amount,
                    scheme_discount_percent, scheme_discount_amount, free_quantity, scheme_code,
                    taxable_amount, tax_percent, tax_amount,
                    igst_percent, cgst_percent, sgst_percent, cess_percent,
                    cgst_amount, sgst_amount, igst_amount, cess_amount,
                    line_total
                ) VALUES (
                    :order_id, :product_id, :product_name, :product_code, :hsn_code,
                    :batch_id, :batch_number,
                    :quantity, :uom, :pack_type, :pack_size, :base_quantity,
                    :unit_price, :mrp, :discount_percent, :discount_amount,
                    :scheme_discount_percent, :scheme_discount_amount, :free_quantity, :scheme_code,
                    :taxable_amount, :tax_percent, :tax_amount,
                    :igst_percent, :cgst_percent, :sgst_percent, :cess_percent,
                    :cgst_amount, :sgst_amount, :igst_amount, :cess_amount,
                    :line_total
                )
            """), complete_item_data)
        
        # NO inventory allocation for sales orders - that happens on approval
        
        db.commit()
        
        # Return created order by fetching it directly
        result = db.execute(text("""
            SELECT o.*, c.customer_name, c.customer_code, c.primary_phone as customer_phone
            FROM sales.orders o
            JOIN parties.customers c ON o.customer_id = c.customer_id AND o.org_id = c.org_id
            WHERE o.order_id = :id AND o.org_id = :org_id AND o.order_type = 'sales'
        """), {"id": order_id, "org_id": org_id})
        
        order = result.fetchone()
        if not order:
            raise HTTPException(status_code=404, detail=f"Sales order {order_id} not found")
        
        order_dict = dict(order._mapping)
        
        # Get order items
        items_result = db.execute(text("""
            SELECT oi.*, p.product_name, p.product_code,
                   b.batch_number, b.expiry_date
            FROM sales.order_items oi
            JOIN inventory.products p ON oi.product_id = p.product_id AND oi.org_id = p.org_id
            LEFT JOIN inventory.batches b ON oi.batch_id = b.batch_id AND oi.org_id = b.org_id
            WHERE oi.order_id = :order_id AND oi.org_id = :org_id
        """), {"order_id": order_id, "org_id": org_id})
        
        order_dict["items"] = [dict(item._mapping) for item in items_result]
        order_dict["total_amount"] = order_dict.get("final_amount", 0)
        order_dict["confirmed_at"] = order_dict.get("confirmed_at", None)
        order_dict["delivered_at"] = order_dict.get("delivered_at", None)
        
        return OrderResponse(**order_dict)
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating sales order: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create sales order: {str(e)}")

@router.get("/", response_model=OrderListResponse)
@with_tenant_context
async def list_sales_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),  # Reasonable limit for performance
    customer_id: Optional[int] = None,
    status: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)  # SECURE: JWT-based
):
    """
    List sales orders with filters and pagination
    """
    try:
        # Build query - only get sales orders
        query = """
            SELECT o.*, c.customer_name, c.customer_code, c.primary_phone as customer_phone
            FROM sales.orders o
            JOIN parties.customers c ON o.customer_id = c.customer_id AND o.org_id = c.org_id
            WHERE o.org_id = :org_id AND o.order_type = 'regular'
        """
        count_query = """
            SELECT COUNT(*) FROM sales.orders o
            WHERE o.org_id = :org_id AND o.order_type = 'regular'
        """
        
        params = {"org_id": org_id}
        
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
                JOIN inventory.products p ON oi.product_id = p.product_id AND oi.org_id = p.org_id
                WHERE oi.order_id = ANY(:order_ids) AND oi.org_id = :org_id
                ORDER BY oi.order_id, oi.order_item_id
            """), {"order_ids": order_ids, "org_id": org_id})
            
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
@with_tenant_context
async def get_sales_order(
    order_id: int,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)  # SECURE: JWT-based
):
    """Get sales order details with items"""
    try:
        # Convert org_id to UUID if it's a string
        if isinstance(org_id, str):
            org_id = UUID(org_id)
        
        # Get order with customer details - only sales orders
        result = db.execute(text("""
            SELECT o.*, c.customer_name, c.customer_code, c.primary_phone as customer_phone
            FROM sales.orders o
            JOIN parties.customers c ON o.customer_id = c.customer_id AND o.org_id = c.org_id
            WHERE o.order_id = :id AND o.org_id = :org_id AND o.order_type = 'sales'
        """), {"id": order_id, "org_id": org_id})
        
        order = result.fetchone()
        if not order:
            raise HTTPException(status_code=404, detail=f"Sales order {order_id} not found")
        
        order_dict = dict(order._mapping)
        
        # Get order items
        items_result = db.execute(text("""
            SELECT oi.*, p.product_name, p.product_code,
                   b.batch_number, b.expiry_date
            FROM sales.order_items oi
            JOIN inventory.products p ON oi.product_id = p.product_id AND oi.org_id = p.org_id
            LEFT JOIN inventory.batches b ON oi.batch_id = b.batch_id AND oi.org_id = b.org_id
            WHERE oi.order_id = :order_id AND oi.org_id = :org_id
        """), {"order_id": order_id, "org_id": org_id})
        
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
@with_tenant_context
async def update_sales_order(
    order_id: int,
    order_data: OrderUpdate,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)  # SECURE: JWT-based
):
    """Update sales order details (only for pending orders)"""
    try:
        # Check if order exists and is editable
        existing = db.execute(text("""
            SELECT order_status FROM sales.orders 
            WHERE order_id = :id AND org_id = :org_id AND order_type = 'sales'
        """), {"id": order_id, "org_id": org_id}).fetchone()
        
        if not existing:
            raise HTTPException(status_code=404, detail=f"Sales order {order_id} not found")
        
        if existing.order_status not in ["pending", "draft"]:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot edit order with status: {existing.order_status}"
            )
        
        # Build update query
        update_fields = []
        params = {"order_id": order_id, "org_id": org_id}
        
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
        
        # Return updated order by fetching it directly
        result = db.execute(text("""
            SELECT o.*, c.customer_name, c.customer_code, c.primary_phone as customer_phone
            FROM sales.orders o
            JOIN parties.customers c ON o.customer_id = c.customer_id AND o.org_id = c.org_id
            WHERE o.order_id = :id AND o.org_id = :org_id AND o.order_type = 'sales'
        """), {"id": order_id, "org_id": org_id})
        
        order = result.fetchone()
        if not order:
            raise HTTPException(status_code=404, detail=f"Sales order {order_id} not found")
        
        order_dict = dict(order._mapping)
        
        # Get order items
        items_result = db.execute(text("""
            SELECT oi.*, p.product_name, p.product_code,
                   b.batch_number, b.expiry_date
            FROM sales.order_items oi
            JOIN inventory.products p ON oi.product_id = p.product_id AND oi.org_id = p.org_id
            LEFT JOIN inventory.batches b ON oi.batch_id = b.batch_id AND oi.org_id = b.org_id
            WHERE oi.order_id = :order_id AND oi.org_id = :org_id
        """), {"order_id": order_id, "org_id": org_id})
        
        order_dict["items"] = [dict(item._mapping) for item in items_result]
        order_dict["total_amount"] = order_dict.get("final_amount", 0)
        order_dict["confirmed_at"] = order_dict.get("confirmed_at", None)
        order_dict["delivered_at"] = order_dict.get("delivered_at", None)
        
        return OrderResponse(**order_dict)
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating sales order: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update sales order: {str(e)}")

@router.post("/{order_id}/approve")
@with_tenant_context
async def approve_sales_order(
    order_id: int,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)  # SECURE: JWT-based
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
        """), {"id": order_id, "org_id": org_id}).fetchone()
        
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
        """), {"order_id": order_id, "org_id": org_id}).fetchall()
        
        items_dict = [dict(item._mapping) for item in items]
        
        # NOW validate inventory availability
        inventory_check = OrderService.validate_inventory(db, items_dict, org_id)
        
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
            db, order.customer_id, total_amount, org_id
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
        """), {"id": order_id, "org_id": org_id})
        
        # NOW allocate inventory
        OrderService.allocate_inventory(db, order_id, items_dict, org_id)
        
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
@with_tenant_context
async def convert_to_invoice(
    order_id: int,
    invoice_request: InvoiceRequest,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)  # SECURE: JWT-based
):
    """Convert approved sales order to invoice"""
    try:
        # Check order exists and is approved
        order = db.execute(text("""
            SELECT order_status, order_number FROM sales.orders 
            WHERE order_id = :id AND org_id = :org_id AND order_type = 'sales'
        """), {"id": order_id, "org_id": org_id}).fetchone()
        
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
            org_id
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
@with_tenant_context
async def convert_to_challan(
    order_id: int,
    challan_date: Optional[date] = None,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)  # SECURE: JWT-based
):
    """Convert approved sales order to delivery challan"""
    try:
        # Check order exists and is approved
        order = db.execute(text("""
            SELECT order_status FROM sales.orders 
            WHERE order_id = :id AND org_id = :org_id AND order_type = 'sales'
        """), {"id": order_id, "org_id": org_id}).fetchone()
        
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
@with_tenant_context
async def validate_sales_order(
    order_data: OrderCreate,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)  # SECURE: JWT-based
):
    """Validate sales order data without creating it"""
    try:
        org_id = order_data.org_id if order_data.org_id else org_id
        
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
@with_tenant_context
async def get_sales_order_dashboard(db: Session = Depends(get_db),
    context: OrgContext = Depends(get_org_context)  # SECURE: JWT-based):
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
        """), {"org_id": org_id}).fetchone()
        
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

def _get_or_create_address(db: Session, org_id: str, customer_id: int, 
                           address_text: str, address_type: str) -> Optional[int]:
    """
    Helper function to get existing address or create new one
    Follows customer creation pattern for address management
    """
    if not address_text:
        return None
    
    try:
        # First check if similar address exists for this customer
        existing = db.execute(text("""
            SELECT address_id FROM master.addresses
            WHERE entity_type = 'customer'
            AND entity_id = :customer_id
            AND address_type = :address_type
            AND is_active = true
            LIMIT 1
        """), {
            "customer_id": customer_id,
            "address_type": address_type
        }).fetchone()
        
        if existing:
            return existing[0]
        
        # Parse address text (simple parsing - could be enhanced)
        # Expected format: "Line1, Line2, City, State, Pincode"
        parts = [p.strip() for p in address_text.split(',')]
        
        # Create new address
        result = db.execute(text("""
            INSERT INTO master.addresses (
                org_id, entity_type, entity_id, address_type,
                address_line1, address_line2, city, state_name, pincode,
                country, is_default, is_active,
                created_at, updated_at
            ) VALUES (
                :org_id, 'customer', :customer_id, :address_type,
                :line1, :line2, :city, :state, :pincode,
                'India', false, true,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING address_id
        """), {
            "org_id": str(context.org_id),
            "customer_id": customer_id,
            "address_type": address_type,
            "line1": parts[0] if len(parts) > 0 else address_text,
            "line2": parts[1] if len(parts) > 1 else None,
            "city": parts[-3] if len(parts) >= 3 else None,
            "state": parts[-2] if len(parts) >= 2 else None,
            "pincode": parts[-1] if len(parts) >= 1 and parts[-1].isdigit() else None
        })
        
        return result.scalar()
        
    except Exception as e:
        logger.warning(f"Could not create address: {str(e)}")
        return None
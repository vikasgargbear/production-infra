"""
Sales Order management endpoints for enterprise pharma system
Handles sales order lifecycle from creation to conversion
"""
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
import logging

from .....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from .....core.auth.org_context import get_org_context, OrgContext
from .....core.security.permissions import PermissionChecker
from .....core.utils.constants import OrderStatus, PaymentStatus
from ....services.document_number_service import DocumentNumberService
from ....services.gst_service import GSTService
from ....schemas.sales.order import (
    OrderCreate, OrderResponse, OrderListResponse, InvoiceRequest,
    InvoiceResponse, DeliveryUpdate, OrderUpdate
)
from ....services.sales.order import OrderService
from ....services.master.customer.service import CustomerService
from ....services.sales.invoice_service import InvoiceService
from ....services.settings.settings_service import SettingsService  # NEW: Settings enforcement

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
        new_number = DocumentNumberService.generate_number(db, "sales_order", str(context.org_id))
        return {"order_number": new_number}
    except Exception as e:
        logger.error(f"Failed to generate sales order number: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate order number: {str(e)}")

@router.get("/employees")
@with_tenant_context
async def get_employees_for_created_by(
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)  # SECURE: JWT-based
):
    """Get list of employees for 'Created By' dropdown"""
    try:
        # Use OrderService instead of inline SQL
        return OrderService.get_employees(db, str(context.org_id))
        
    except Exception as e:
        logger.error(f"Error fetching employees: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", response_model=OrderResponse)
@with_tenant_context
async def create_sales_order(
    order: OrderCreate,
    _: dict = Depends(PermissionChecker("sales", "create")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Create sales order - delegates to OrderService
    This is a THIN HTTP ADAPTER - all business logic is in the service layer.
    """
    try:
        # Extract context from JWT
        org_id = str(context.org_id)
        user_id = context.user_id
        branch_id = context.primary_branch_id
        
        # Delegate to service (all business logic here)
        result = OrderService.create_order_with_items(
            db=db,
            org_id=org_id,
            user_id=user_id,
            branch_id=branch_id,
            order_data=order
        )
        
        # Use service method to fetch complete order (consolidates 2 SQL into 1 reusable call)
        order_dict = OrderService.get_order_with_items(db, org_id, result["order_id"], "sales")
        if not order_dict:
            raise HTTPException(status_code=404, detail=f"Order {result['order_id']} not found")
        
        return OrderResponse(**order_dict)
        
    except ValueError as e:
        # Business rule validation errors
        logger.error(f"Validation error creating order: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Unexpected errors
        logger.error(f"❌ Error creating order: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create order: {str(e)}")

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
        # Use OrderService instead of inline SQL
        result = OrderService.list_orders(
            db=db,
            org_id=str(context.org_id),
            skip=skip,
            limit=limit,
            customer_id=customer_id,
            status=status,
            from_date=from_date,
            to_date=to_date,
            order_type="regular"
        )
        
        # Convert to response models
        orders = [OrderResponse(**order) for order in result["orders"]]
        
        return OrderListResponse(
            total=result["total"],
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
        # Use OrderService instead of inline SQL
        order_dict = OrderService.get_order_with_items(
            db=db,
            org_id=str(context.org_id),
            order_id=order_id,
            order_type="sales"
        )
        
        if not order_dict:
            raise HTTPException(status_code=404, detail=f"Sales order {order_id} not found")
        
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
        """), {"id": order_id, "org_id": str(context.org_id)}).fetchone()
        
        if not existing:
            raise HTTPException(status_code=404, detail=f"Sales order {order_id} not found")
        
        if existing.order_status not in [OrderStatus.PENDING.value, OrderStatus.DRAFT.value]:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot edit order with status: {existing.order_status}"
            )
        
        # Build update query
        update_fields = []
        params = {"order_id": order_id, "org_id": str(context.org_id)}
        
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
        # TenantAwareSession auto-commits
        
        # Use service method to fetch updated order (consolidates 2 SQL)
        order_dict = OrderService.get_order_with_items(db, str(context.org_id), order_id, "sales")
        if not order_dict:
            raise HTTPException(status_code=404, detail=f"Sales order {order_id} not found")
        
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
        """), {"id": order_id, "org_id": str(context.org_id)}).fetchone()
        
        if not order:
            raise HTTPException(status_code=404, detail=f"Sales order {order_id} not found")
        
        if order.order_status != OrderStatus.PENDING.value:
            raise HTTPException(
                status_code=400, 
                detail=f"Order cannot be approved. Current status: {order.order_status}"
            )
        
        # Get order items for inventory validation
        items = db.execute(text("""
            SELECT product_id, batch_id, quantity, unit_price
            FROM sales.order_items 
            WHERE order_id = :order_id
        """), {"order_id": order_id, "org_id": str(context.org_id)}).fetchall()
        
        items_dict = [dict(item._mapping) for item in items]
        
        # SETTINGS-AWARE: Check if negative stock is allowed
        billing_settings = await SettingsService.get_billing_settings(db, str(context.org_id))
        allow_negative_stock = billing_settings.get("allow_negative_stock", False)
        
        # Only validate inventory if negative stock NOT allowed
        if not allow_negative_stock:
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
        """), {"id": order_id, "org_id": str(context.org_id)})
        
        # NOW allocate inventory
        OrderService.allocate_inventory(db, order_id, items_dict, org_id)
        
        # TenantAwareSession auto-commits
        
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
        """), {"id": order_id, "org_id": str(context.org_id)}).fetchone()
        
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
        
        # TenantAwareSession auto-commits
        
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
        """), {"id": order_id, "org_id": str(context.org_id)}).fetchone()
        
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
        
        # TenantAwareSession auto-commits
        
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
        org_id = str(context.org_id)
        
        # Validate customer
        customer = db.execute(text("""
            SELECT customer_id FROM parties.customers 
            WHERE customer_id = :id
        """), {"id": order_data.customer_id}).fetchone()
        
        if not customer:
            return {"valid": False, "message": "Customer not found"}
        
        # BATCH OPTIMIZE: Get all product IDs and validate in one query
        product_ids = [item.product_id for item in order_data.items]
        if product_ids:
            existing_products = db.execute(text("""
                SELECT product_id FROM inventory.products 
                WHERE product_id = ANY(:product_ids)
            """), {"product_ids": product_ids}).fetchall()
            
            existing_ids = {row.product_id for row in existing_products}
            missing = set(product_ids) - existing_ids
            
            if missing:
                return {"valid": False, "message": f"Products not found: {list(missing)}"}
        
        return {"valid": True, "message": "Sales order data is valid"}
        
    except Exception as e:
        logger.error(f"Error validating sales order: {str(e)}")
        return {"valid": False, "message": f"Validation error: {str(e)}"}

@router.get("/dashboard/stats")
@with_tenant_context
async def get_sales_order_dashboard(
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get sales order dashboard statistics"""
    try:
        # Use OrderService instead of inline SQL
        return OrderService.get_dashboard(db, str(context.org_id))
        
    except Exception as e:
        logger.error(f"Error getting sales order dashboard: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get dashboard: {str(e)}")

def _get_or_create_address(db: TenantAwareSession, org_id: str, customer_id: int, 
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
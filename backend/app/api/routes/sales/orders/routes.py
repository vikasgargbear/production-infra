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
from ....services.compliance.gst_service import GSTService
from ....schemas.sales.order import (
    OrderCreate, OrderResponse, OrderListResponse, InvoiceRequest,
    InvoiceResponse, DeliveryUpdate, OrderUpdate
)
from ....services.sales.order import OrderService
from ....services.master.customer.service import CustomerService
from ....services.settings.settings_service import SettingsService  # NEW: Settings enforcement

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sales-orders", tags=["sales-orders"])

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
        # Check if order exists and is editable using service method
        existing = OrderService.get_order_for_edit(db, order_id, str(context.org_id), "sales")
        
        if not existing:
            raise HTTPException(status_code=404, detail=f"Sales order {order_id} not found")
        
        if existing["order_status"] not in [OrderStatus.PENDING.value, OrderStatus.DRAFT.value]:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot edit order with status: {existing['order_status']}"
            )
        
        # Build update query using service method with field validation
        update_data = order_data.dict(exclude_unset=True)
        
        # Use service method for safe dynamic update with field validation
        if not OrderService.update_order_dynamic(db, order_id, str(context.org_id), update_data):
            raise HTTPException(status_code=400, detail="No valid fields to update")
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
        # Check order exists and is pending using service method
        order = OrderService.get_order_for_edit(db, order_id, str(context.org_id), "sales")
        
        if not order:
            raise HTTPException(status_code=404, detail=f"Sales order {order_id} not found")
        
        if order["order_status"] != OrderStatus.PENDING.value:
            raise HTTPException(
                status_code=400, 
                detail=f"Order cannot be approved. Current status: {order['order_status']}"
            )
        
        # Get order items for inventory validation using service method
        items_dict = OrderService.get_order_items_raw(db, order_id)
        
        # SETTINGS-AWARE: Check if negative stock is allowed
        billing_settings = await SettingsService.get_billing_settings(db, str(context.org_id))
        allow_negative_stock = billing_settings.get("allow_negative_stock", False)
        
        # Only validate inventory if negative stock NOT allowed
        if not allow_negative_stock:
            inventory_check = OrderService.validate_inventory(db, items_dict, str(context.org_id))
            
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
        
        # Check customer credit limit using service method
        total_amount = OrderService.get_order_final_amount(db, order_id)
        
        credit_check = CustomerService.validate_credit_limit(
            db, order["customer_id"], total_amount, str(context.org_id)
        )
        
        if not credit_check["valid"]:
            raise HTTPException(status_code=400, detail=credit_check["message"])
        
        # Update order status to approved using service method
        OrderService.approve_order(db, order_id, str(context.org_id))
        
        # NOW allocate inventory
        OrderService.allocate_inventory(db, order_id, items_dict, str(context.org_id))
        
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
    """
    Convert approved sales order to invoice.
    
    TODO: Implement using InvoiceService.create_invoice_with_items()
    The original implementation called a non-existent method.
    """
    raise HTTPException(
        status_code=501,
        detail="Order to Invoice conversion not yet implemented. Use direct invoice creation instead."
    )

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
        # Check order exists and is approved using service method
        order = OrderService.get_order_for_edit(db, order_id, str(context.org_id), "sales")
        
        if not order:
            raise HTTPException(status_code=404, detail=f"Sales order {order_id} not found")
        
        if order["order_status"] not in ["approved", "confirmed"]:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot convert to challan. Order status: {order['order_status']}"
            )
        
        # TODO: Implement challan generation service
        # For now, just update status using service method
        OrderService.update_order_status(db, order_id, "shipped")
        
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
        
        # Validate customer using service method
        if not CustomerService.customer_exists(db, order_data.customer_id):
            return {"valid": False, "message": "Customer not found"}
        
        # BATCH OPTIMIZE: Validate all product IDs using service method
        product_ids = [item.product_id for item in order_data.items]
        if product_ids:
            from ....services.master.product.service import ProductService
            validation = ProductService.validate_products_exist(db, product_ids)
            
            if not validation["valid"]:
                return {"valid": False, "message": f"Products not found: {validation['missing']}"}
        
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
    Helper function to get existing address or create new one.
    Uses CustomerService for address management (fixes context bug).
    """
    # Delegate to CustomerService which has the proper implementation
    return CustomerService.get_or_create_address(
        db=db,
        org_id=org_id,
        customer_id=customer_id,
        address_text=address_text,
        address_type=address_type
    )

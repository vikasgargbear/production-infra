"""
Order Items API Router
Manages individual items within orders
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
import logging

from ...core.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from ...core.org_context import get_org_context, OrgContext
from ...core.permissions import PermissionChecker
# get_org_id_string replaced with OrgContext
from ...models import OrderItem
from ...core.crud_base import create_crud

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/order-items", tags=["order-items"])

# Create CRUD instance
order_item_crud = create_crud(OrderItem)

@router.get("/")
@with_tenant_context
async def get_order_items(
    skip: int = 0,
    limit: int = 100,
    order_id: Optional[int] = Query(None, description="Filter by order ID"),
    product_id: Optional[int] = Query(None, description="Filter by product ID"),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get order items with optional filtering"""
    try:
        query = "SELECT * FROM sales.order_items WHERE 1=1"
        params = {}
        
        if order_id:
            query += " AND order_id = :order_id"
            params["order_id"] = order_id
            
        if product_id:
            query += " AND product_id = :product_id"
            params["product_id"] = product_id
            
        query += " ORDER BY order_item_id LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        order_items = [dict(row._mapping) for row in result]
        
        return order_items
        
    except Exception as e:
        logger.error(f"Error fetching order items: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get order items: {str(e)}")

@router.get("/{order_item_id}")
@with_tenant_context
async def get_order_item(order_item_id: int, _: dict = Depends(PermissionChecker("sales", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)):
    """Get a single order item by ID"""
    try:
        order_item = db.query(OrderItem).filter(OrderItem.order_item_id == order_item_id).first()
        if not order_item:
            raise HTTPException(status_code=404, detail="Order item not found")
        return order_item
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching order item {order_item_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get order item: {str(e)}")

@router.post("/")
@with_tenant_context
async def create_order_item(order_item_data: dict, _: dict = Depends(PermissionChecker("sales", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)):
    """Create a new order item"""
    try:
        order_item = OrderItem(**order_item_data)
        db.add(order_item)
        # TenantAwareSession auto-commits
        db.refresh(order_item)
        return order_item
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating order item: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create order item: {str(e)}")

@router.put("/{order_item_id}")
@with_tenant_context
async def update_order_item(order_item_id: int, order_item_data: dict, _: dict = Depends(PermissionChecker("sales", "edit")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)):
    """Update an order item"""
    try:
        order_item = db.query(OrderItem).filter(OrderItem.order_item_id == order_item_id).first()
        if not order_item:
            raise HTTPException(status_code=404, detail="Order item not found")
        
        for key, value in order_item_data.items():
            setattr(order_item, key, value)
        
        # TenantAwareSession auto-commits
        db.refresh(order_item)
        return order_item
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating order item {order_item_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update order item: {str(e)}")

@router.delete("/{order_item_id}")
@with_tenant_context
async def delete_order_item(order_item_id: int, _: dict = Depends(PermissionChecker("sales", "delete")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)):
    """Delete an order item"""
    try:
        order_item = db.query(OrderItem).filter(OrderItem.order_item_id == order_item_id).first()
        if not order_item:
            raise HTTPException(status_code=404, detail="Order item not found")
        
        db.delete(order_item)
        # TenantAwareSession auto-commits
        return {"message": "Order item deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting order item {order_item_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete order item: {str(e)}")
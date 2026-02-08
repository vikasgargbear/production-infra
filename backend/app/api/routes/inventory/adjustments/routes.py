"""
Stock Adjustments API Router
REFACTORED: Uses InventoryService for database operations
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
import logging
from ....services.document_number_service import DocumentNumberService
from ....services.inventory.inventory_service import InventoryService
from ....schemas.inventory.inventory import StockMovementCreate
from datetime import date, datetime
from decimal import Decimal

from .....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from .....core.auth.org_context import get_org_context, OrgContext
from .....core.security.permissions import PermissionChecker
from .....core.utils.branch_utils import get_default_branch_id, resolve_location_id

logger = logging.getLogger(__name__)

ADJUSTMENT_TYPE_MAPPING = {
    "damage": "stock_damage",
    "expiry": "stock_expiry",
    "count": "stock_count",
    "other": "stock_adjustment"
}

router = APIRouter(tags=["stock-adjustments"])


@router.get("/")
@with_tenant_context
async def get_stock_adjustments(
    skip: int = 0,
    limit: int = 100,
    product_id: Optional[int] = Query(None),
    batch_id: Optional[int] = Query(None),
    adjustment_type: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    _: dict = Depends(PermissionChecker("inventory", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get stock adjustments"""
    try:
        adjustments = InventoryService.list_stock_adjustments(
            db, str(context.org_id), product_id, batch_id,
            adjustment_type, start_date, end_date, limit, skip
        )
        return adjustments
    except Exception as e:
        logger.error(f"Error fetching stock adjustments: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get stock adjustments: {str(e)}")


@router.post("/")
@with_tenant_context
async def create_stock_adjustment(
    adjustment_data: dict,
    _: dict = Depends(PermissionChecker("inventory", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Create a stock adjustment"""
    try:
        org_id = str(context.org_id)
        batch = InventoryService.get_batch_for_adjustment(db, org_id, adjustment_data.get("batch_id"))
        
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        
        quantity_adjusted = adjustment_data.get("quantity_adjusted", 0)
        if quantity_adjusted < 0 and abs(quantity_adjusted) > batch.get("quantity_available", 0):
            raise HTTPException(status_code=400, detail=f"Insufficient stock. Available: {batch.get('quantity_available')}")
        
        movement_type = ADJUSTMENT_TYPE_MAPPING.get(adjustment_data.get("adjustment_type"), "stock_adjustment")
        
        movement_data = StockMovementCreate(
            org_id=context.org_id,
            product_id=batch.get("product_id"),
            batch_id=adjustment_data.get("batch_id"),
            movement_type=movement_type,
            movement_direction="in" if quantity_adjusted > 0 else "out",
            movement_date=adjustment_data.get("adjustment_date", date.today()),
            quantity=abs(quantity_adjusted),
            unit_cost=Decimal(str(batch.get("unit_cost", 0))),
            total_cost=Decimal(str(abs(quantity_adjusted) * float(batch.get("unit_cost", 0)))),
            location_id=resolve_location_id(db, org_id, context.primary_branch_id, adjustment_data.get("location_id")),
            reference_type="adjustment",
            reference_number=adjustment_data.get("reference_number") or DocumentNumberService.generate_number(db, "adjustment", org_id),
            reason=adjustment_data.get("reason"),
            created_by=context.user_id
        )
        
        movement_result = InventoryService.record_stock_movement(db, movement_data)
        db.commit()
        new_quantity = batch.get("quantity_available", 0) + quantity_adjusted

        return {
            "movement_id": movement_result.movement_id,
            "message": "Stock adjustment created successfully",
            "old_quantity": batch.get("quantity_available"),
            "new_quantity": new_quantity,
            "adjustment_type": movement_type
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating stock adjustment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create stock adjustment: {str(e)}")


@router.post("/physical-count")
@with_tenant_context
async def process_physical_count(
    count_data: dict,
    _: dict = Depends(PermissionChecker("inventory", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Process physical inventory count"""
    try:
        org_id = str(context.org_id)
        adjustments_created = []
        
        for item in count_data.get("count_items", []):
            batch_id = item.get("batch_id")
            counted_quantity = item.get("counted_quantity")
            
            batch = InventoryService.get_batch_for_adjustment(db, org_id, batch_id)
            if not batch:
                logger.warning(f"Batch {batch_id} not found during physical count")
                continue
            
            system_quantity = batch.get("quantity_available", 0)
            difference = counted_quantity - system_quantity
            
            if difference != 0:
                movement_data = StockMovementCreate(
                    org_id=context.org_id,
                    product_id=batch.get("product_id"),
                    batch_id=batch_id,
                    movement_type="stock_count",
                    movement_direction="in" if difference > 0 else "out",
                    movement_date=count_data.get("count_date", date.today()),
                    quantity=abs(difference),
                    location_id=resolve_location_id(db, org_id, context.primary_branch_id),
                    reference_type="physical_count",
                    reference_number=count_data.get("count_reference", f"COUNT-{datetime.now().strftime('%Y%m%d')}"),
                    reason=f"Physical count adjustment: System {system_quantity}, Counted {counted_quantity}",
                    created_by=context.user_id
                )
                
                movement_result = InventoryService.record_stock_movement(db, movement_data)
                adjustments_created.append({
                    "movement_id": movement_result.movement_id,
                    "batch_id": batch_id,
                    "system_quantity": system_quantity,
                    "counted_quantity": counted_quantity,
                    "difference": difference
                })

        db.commit()
        return {"message": "Physical count processed successfully", "adjustments_created": len(adjustments_created), "details": adjustments_created}
    except Exception as e:
        db.rollback()
        logger.error(f"Error processing physical count: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process physical count: {str(e)}")


@router.post("/expire-batches")
@with_tenant_context
async def expire_batches(
    _: dict = Depends(PermissionChecker("inventory", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Mark expired batches and create adjustments"""
    try:
        org_id = str(context.org_id)
        expired_batches = InventoryService.get_expired_batches(db, org_id)
        adjustments_created = []
        
        for batch in expired_batches:
            movement_data = StockMovementCreate(
                org_id=context.org_id,
                product_id=batch.get("product_id"),
                batch_id=batch.get("batch_id"),
                movement_type="stock_expiry",
                movement_direction="out",
                movement_date=date.today(),
                quantity=batch.get("quantity_available", 0),
                location_id=resolve_location_id(db, org_id, context.primary_branch_id),
                reference_type="expiry",
                reference_number=f"EXP-{batch.get('batch_number')}",
                reason=f"Batch expired on {batch.get('expiry_date')}",
                created_by=context.user_id
            )
            
            movement_result = InventoryService.record_stock_movement(db, movement_data)
            InventoryService.update_batch_status(db, batch.get("batch_id"), "expired")

            adjustments_created.append({
                "movement_id": movement_result.movement_id,
                "batch_id": batch.get("batch_id"),
                "batch_number": batch.get("batch_number"),
                "product_name": batch.get("product_name"),
                "quantity_expired": batch.get("quantity_available"),
                "expiry_date": str(batch.get("expiry_date"))
            })

        db.commit()
        return {"message": "Expired batches processed", "batches_expired": len(adjustments_created), "details": adjustments_created}
    except Exception as e:
        db.rollback()
        logger.error(f"Error processing expired batches: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process expired batches: {str(e)}")


@router.get("/analytics/summary")
@with_tenant_context
async def get_adjustment_analytics(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    _: dict = Depends(PermissionChecker("inventory", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get stock adjustment analytics"""
    try:
        analytics = InventoryService.get_adjustment_analytics(db, str(context.org_id), start_date, end_date)
        return analytics
    except Exception as e:
        logger.error(f"Error fetching adjustment analytics: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get adjustment analytics: {str(e)}")
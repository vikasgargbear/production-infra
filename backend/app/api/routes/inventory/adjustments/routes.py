"""
Stock Adjustments API Router (Simplified)
Uses existing inventory_movements table for adjustments
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
import logging
from ....services.document_number_service import DocumentNumberService
from ....services.inventory.inventory_service import InventoryService
from ....schemas.inventory.inventory import StockMovementCreate
from datetime import date, datetime
from decimal import Decimal

from .....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from .....core.auth.org_context import get_org_context, OrgContext
from .....core.security.permissions import PermissionChecker  # RBAC
from .....core.utils.branch_utils import get_default_branch_id

logger = logging.getLogger(__name__)

# Module-level constants
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
    product_id: Optional[int] = Query(None, description="Filter by product"),
    batch_id: Optional[int] = Query(None, description="Filter by batch"),
    adjustment_type: Optional[str] = Query(None, description="Filter by type: damage, expiry, count, other"),
    start_date: Optional[date] = Query(None, description="Filter from date"),
    end_date: Optional[date] = Query(None, description="Filter to date"),
    _: dict = Depends(PermissionChecker("inventory", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get stock adjustments from inventory movements"""
    try:
        # Use module-level type mapping
        
        # Query using actual database schema
        query = """
            SELECT 
                movement_id as adjustment_id,
                movement_date as adjustment_date,
                movement_type as adjustment_type,
                product_id,
                batch_id,
                CASE 
                    WHEN movement_direction = 'in' THEN quantity
                    ELSE -quantity
                END as quantity_adjusted,
                reason,
                reference_number,
                created_by as adjusted_by,
                created_at,
                org_id
            FROM inventory.inventory_movements
            WHERE movement_type IN ('stock_damage', 'stock_expiry', 'stock_count', 'stock_adjustment')
              AND org_id = :org_id
        """
        params = {"org_id": str(context.org_id)}
        
        if product_id:
            query += " AND product_id = :product_id"
            params["product_id"] = product_id
            
        if batch_id:
            query += " AND batch_id = :batch_id"
            params["batch_id"] = batch_id
            
        if adjustment_type:
            movement_type = ADJUSTMENT_TYPE_MAPPING.get(adjustment_type, 'stock_adjustment')
            query += " AND movement_type = :movement_type"
            params["movement_type"] = movement_type
            
        if start_date:
            query += " AND movement_date >= :start_date"
            params["start_date"] = start_date
            
        if end_date:
            query += " AND movement_date <= :end_date"
            params["end_date"] = end_date
            
        query += " ORDER BY movement_date DESC LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        adjustments = [dict(row._mapping) for row in result]
        
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
    """
    Create a stock adjustment using inventory movements
    """
    try:
        # Validate batch exists and get cost info
        batch = db.execute(
            text("""
                SELECT b.*, p.product_name,
                    COALESCE(b.cost_per_unit, 0) as unit_cost
                FROM inventory.batches b
                JOIN inventory.products p ON b.product_id = p.product_id
                WHERE b.batch_id = :batch_id AND b.org_id = :org_id
            """),
            {"batch_id": adjustment_data.get("batch_id"), "org_id": str(context.org_id)}
        ).first()
        
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
            
        quantity_adjusted = adjustment_data.get("quantity_adjusted", 0)
        
        # Check available quantity for negative adjustments
        if quantity_adjusted < 0 and abs(quantity_adjusted) > batch.quantity_available:
            raise HTTPException(
                status_code=400, 
                detail=f"Insufficient stock. Available: {batch.quantity_available}"
            )
        
        # Use module-level type mapping
        movement_type = ADJUSTMENT_TYPE_MAPPING.get(adjustment_data.get("adjustment_type"), "stock_adjustment")
        
        # Use InventoryService for stock movement (handles both movement record and batch update)
        movement_data = StockMovementCreate(
            org_id=context.org_id,
            product_id=batch.product_id,
            batch_id=adjustment_data.get("batch_id"),
            movement_type=movement_type,
            movement_direction="in" if quantity_adjusted > 0 else "out",
            movement_date=adjustment_data.get("adjustment_date", date.today()),
            quantity=abs(quantity_adjusted),
            unit_cost=Decimal(str(batch.unit_cost)) if batch.unit_cost else Decimal("0"),
            total_cost=Decimal(str(abs(quantity_adjusted) * float(batch.unit_cost))) if batch.unit_cost else Decimal("0"),
            location_id=adjustment_data.get("location_id") or context.primary_branch_id or get_default_branch_id(db, str(context.org_id)),
            reference_type="adjustment",
            reference_number=adjustment_data.get("reference_number") or DocumentNumberService.generate_number(db, "adjustment", str(context.org_id)),
            reason=adjustment_data.get("reason"),
            created_by=context.user_id
        )
        
        movement_result = InventoryService.record_stock_movement(db, movement_data)
        
        # Calculate new quantity for response
        new_quantity = batch.quantity_available + quantity_adjusted
        
        return {
            "movement_id": movement_result.movement_id,
            "message": "Stock adjustment created successfully",
            "old_quantity": batch.quantity_available,
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
    """
    Process physical inventory count
    Creates stock adjustments for differences
    """
    try:
        adjustments_created = []
        
        for item in count_data.get("count_items", []):
            batch_id = item.get("batch_id")
            counted_quantity = item.get("counted_quantity")
            
            # Get current quantity
            batch = db.execute(
                text("SELECT * FROM inventory.batches WHERE batch_id = :batch_id AND org_id = :org_id"),
                {"batch_id": batch_id, "org_id": str(context.org_id)}
            ).first()
            
            if not batch:
                logger.warning(f"Batch {batch_id} not found during physical count")
                continue
                
            system_quantity = batch.quantity_available
            difference = counted_quantity - system_quantity
            
            # Only adjust if there's a difference
            if difference != 0:
                # Use InventoryService for stock movement
                movement_data = StockMovementCreate(
                    org_id=context.org_id,
                    product_id=batch.product_id,
                    batch_id=batch_id,
                    movement_type="stock_count",
                    movement_direction="in" if difference > 0 else "out",
                    movement_date=count_data.get("count_date", date.today()),
                    quantity=abs(difference),
                    location_id=context.primary_branch_id or get_default_branch_id(db, str(context.org_id)),
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
        
        # TenantAwareSession auto-commits on success
        
        return {
            "message": "Physical count processed successfully",
            "adjustments_created": len(adjustments_created),
            "details": adjustments_created
        }
        
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
    """
    Mark expired batches and create stock adjustments
    """
    try:
        # Find expired batches
        expired_batches = db.execute(
            text("""
                SELECT b.*, p.product_name
                FROM inventory.batches b
                JOIN inventory.products p ON b.product_id = p.product_id
                WHERE b.expiry_date <= CURRENT_DATE
                AND b.quantity_available > 0
                AND b.batch_status != 'expired'
                AND b.org_id = :org_id
            """),
            {"org_id": str(context.org_id)}
        ).fetchall()
        
        adjustments_created = []
        
        for batch in expired_batches:
            # Use InventoryService for expiry movement
            movement_data = StockMovementCreate(
                org_id=context.org_id,
                product_id=batch.product_id,
                batch_id=batch.batch_id,
                movement_type="stock_expiry",
                movement_direction="out",
                movement_date=date.today(),
                quantity=batch.quantity_available,
                location_id=context.primary_branch_id or get_default_branch_id(db, str(context.org_id)),
                reference_type="expiry",
                reference_number=f"EXP-{batch.batch_number}",
                reason=f"Batch expired on {batch.expiry_date}",
                created_by=context.user_id
            )
            
            movement_result = InventoryService.record_stock_movement(db, movement_data)
            
            # Update batch status (additional business logic not in service)
            db.execute(
                text("""
                    UPDATE inventory.batches 
                    SET batch_status = 'expired'
                    WHERE batch_id = :batch_id
                """),
                {"batch_id": batch.batch_id}
            )
            
            adjustments_created.append({
                "movement_id": movement_result.movement_id,
                "batch_id": batch.batch_id,
                "batch_number": batch.batch_number,
                "product_name": batch.product_name,
                "quantity_expired": batch.quantity_available,
                "expiry_date": str(batch.expiry_date)
            })
        
        # TenantAwareSession auto-commits on success
        
        return {
            "message": "Expired batches processed",
            "batches_expired": len(adjustments_created),
            "details": adjustments_created
        }
        
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
        query = """
            SELECT 
                COUNT(*) as total_adjustments,
                SUM(quantity_in) as total_quantity_added,
                SUM(quantity_out) as total_quantity_removed,
                COUNT(DISTINCT product_id) as products_affected,
                COUNT(DISTINCT batch_id) as batches_affected,
                COUNT(CASE WHEN movement_type = 'stock_damage' THEN 1 END) as damage_adjustments,
                COUNT(CASE WHEN movement_type = 'stock_expiry' THEN 1 END) as expiry_adjustments,
                COUNT(CASE WHEN movement_type = 'stock_count' THEN 1 END) as count_adjustments
            FROM inventory.inventory_movements
            WHERE movement_type IN ('stock_damage', 'stock_expiry', 'stock_count', 'stock_adjustment')
              AND org_id = :org_id
        """
        params = {"org_id": str(context.org_id)}
        
        if start_date:
            query += " AND movement_date >= :start_date"
            params["start_date"] = start_date
            
        if end_date:
            query += " AND movement_date <= :end_date"
            params["end_date"] = end_date
        
        result = db.execute(text(query), params)
        analytics = dict(result.first()._mapping)
        
        return analytics
        
    except Exception as e:
        logger.error(f"Error fetching adjustment analytics: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get adjustment analytics: {str(e)}")
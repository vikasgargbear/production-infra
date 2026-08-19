"""
Inventory management endpoints
REFACTORED: Uses InventoryService for database operations
"""
from typing import Optional, List
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
import logging

from .....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from .....core.auth.org_context import get_org_context, OrgContext
from .....core.utils.api_utils import handle_error
from ....schemas.inventory.inventory import (
    BatchCreate, BatchResponse, StockMovementCreate,
    StockMovementResponse, StockAdjustment,
    CurrentStock, ExpiryAlert,
    StockValuation, InventoryDashboard
)
from ....services.inventory.inventory_service import InventoryService
from .....core.utils.constants import DateDefaults

logger = logging.getLogger(__name__)
router = APIRouter(tags=["inventory"])


@router.get("/")
@with_tenant_context
async def get_inventory_overview(
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get inventory overview"""
    try:
        result = InventoryService.get_inventory_overview(db)
        return {
            "total_products": result.get("total_products", 0),
            "products_in_stock": result.get("products_in_stock", 0),
            "total_quantity": result.get("total_quantity", 0)
        }
    except Exception as e:
        raise handle_error(e, "get inventory overview")


@router.post("/batches", response_model=BatchResponse)
@with_tenant_context
async def create_batch(
    batch: BatchCreate,
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Create a new batch"""
    try:
        return InventoryService.create_batch(db, batch, user_id=context.user_id, org_id=str(context.org_id), branch_id=context.primary_branch_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise handle_error(e, "create batch")


@router.get("/batches/{batch_id}", response_model=BatchResponse)
@with_tenant_context
async def get_batch(
    batch_id: int,
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get batch details"""
    try:
        return InventoryService.get_batch(db, batch_id, str(context.org_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise handle_error(e, "get batch", batch_id)


@router.get("/batches")
@router.get("/batches/")
@with_tenant_context
async def list_batches(
    product_id: Optional[int] = None,
    expiring_in_days: Optional[int] = None,
    location: Optional[str] = None,
    include_expired: bool = False,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """List batches with filters"""
    try:
        batches, total = InventoryService.list_batches(
            db, product_id, location, include_expired, expiring_in_days, limit, skip
        )
        
        for batch in batches:
            batch["is_expired"] = batch.get("days_to_expiry", 0) <= 0 if batch.get("days_to_expiry") is not None else False
            batch["is_near_expiry"] = 0 < batch.get("days_to_expiry", 999) <= DateDefaults.NEAR_EXPIRY_THRESHOLD
        
        return {"total": total, "batches": batches}
    except Exception as e:
        raise handle_error(e, "list batches")


@router.get("/stock/current/{product_id}", response_model=CurrentStock)
@with_tenant_context
async def get_current_stock(
    product_id: int,
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get current stock for a product"""
    try:
        return InventoryService.get_current_stock(db, product_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise handle_error(e, "get current stock", product_id)


@router.get("/stock/current")
@with_tenant_context
async def list_current_stock(
    category: Optional[str] = None,
    low_stock_only: bool = False,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """List current stock levels"""
    try:
        stocks, total = InventoryService.list_current_stock(db, category, low_stock_only, limit, skip)
        
        result = []
        for stock in stocks:
            reorder_level = stock.get("reorder_level") or 0
            total_qty = stock.get("total_quantity", 0)
            stock["is_below_minimum"] = False  # Determined by product settings
            stock["is_below_reorder"] = total_qty <= reorder_level if reorder_level > 0 else False
            result.append(CurrentStock(**stock))

        return {"total": total, "stocks": result}
    except Exception as e:
        raise handle_error(e, "list current stock")


@router.post("/movements", response_model=StockMovementResponse)
@with_tenant_context
async def record_stock_movement(
    movement: StockMovementCreate,
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Record a stock movement"""
    try:
        movement = movement.model_copy(update={
            "org_id": context.org_id,
            "created_by": context.user_id,
        })
        result = InventoryService.record_stock_movement(db, movement)
        db.commit()
        return result
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        raise handle_error(e, "record stock movement")


@router.get("/movements")
@with_tenant_context
async def list_stock_movements(
    product_id: Optional[int] = None,
    movement_type: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """List stock movements"""
    try:
        movements = InventoryService.list_inventory_movements(
            db, str(context.org_id), movement_type, product_id, None,
            None, str(from_date) if from_date else None, str(to_date) if to_date else None,
            "movement_date", "desc", limit, skip
        )
        total = InventoryService.count_inventory_movements(
            db, str(context.org_id), movement_type, product_id, None,
            str(from_date) if from_date else None, str(to_date) if to_date else None
        )
        return {"total": total, "movements": movements}
    except Exception as e:
        raise handle_error(e, "list stock movements")


@router.post("/stock/adjustment", response_model=StockMovementResponse)
@with_tenant_context
async def adjust_stock(
    adjustment: StockAdjustment,
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Adjust stock"""
    try:
        return InventoryService.process_stock_adjustment(db, adjustment, context.org_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise handle_error(e, "adjust stock")


@router.get("/expiry/alerts", response_model=List[ExpiryAlert])
@with_tenant_context
async def get_expiry_alerts(
    days_ahead: int = Query(180, ge=1, le=365),
    alert_level: Optional[str] = None,
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get expiry alerts"""
    try:
        alerts = InventoryService.get_expiry_alerts(db, context.org_id, days_ahead)
        if alert_level:
            alerts = [a for a in alerts if a.alert_level == alert_level]
        return alerts
    except Exception as e:
        raise handle_error(e, "get expiry alerts")


@router.get("/valuation", response_model=StockValuation)
@with_tenant_context
async def get_stock_valuation(
    as_of_date: Optional[date] = None,
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get stock valuation"""
    try:
        return InventoryService.get_stock_valuation(db, context.org_id, as_of_date)
    except Exception as e:
        raise handle_error(e, "get stock valuation")


@router.get("/dashboard", response_model=InventoryDashboard)
@with_tenant_context
async def get_inventory_dashboard(
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get inventory dashboard"""
    try:
        return InventoryService.get_inventory_dashboard(db, context.org_id)
    except Exception as e:
        raise handle_error(e, "get inventory dashboard")

"""
Stock Movement API Router
REFACTORED: Uses InventoryService for database operations
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
import logging
import uuid
from ....services.document_number_service import DocumentNumberService
from ....services.inventory.inventory_service import InventoryService

from .....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from .....core.auth.org_context import get_org_context, OrgContext
from .....core.security.permissions import PermissionChecker
from .....core.utils.branch_utils import get_default_branch_id, resolve_location_id
from .....core.utils.feature_flags import check_negative_stock_allowed
from .....core.money import money_json

logger = logging.getLogger(__name__)
router = APIRouter(tags=["stock-movements"])


@router.get("/")
@with_tenant_context
async def get_inventory_movements(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    movement_type: Optional[str] = Query(None),
    product_id: Optional[int] = Query(None),
    batch_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    sort: Optional[str] = Query("movement_date"),
    order: Optional[str] = Query("desc"),
    _: dict = Depends(PermissionChecker("inventory", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get inventory movements"""
    try:
        movements = InventoryService.list_inventory_movements(
            db, str(context.org_id), movement_type, product_id, batch_id,
            location_id, from_date, to_date, sort, order, limit, skip
        )
        total = InventoryService.count_inventory_movements(
            db, str(context.org_id), movement_type, product_id, batch_id, from_date, to_date
        )
        
        # Transform for frontend
        movements_list = []
        for m in movements:
            movements_list.append({
                "id": m.get("movement_id"),
                "movement_id": m.get("movement_id"),
                "movement_no": f"MOV-{m.get('movement_id')}",
                "movement_type": m.get("movement_type"),
                "movement_date": m.get("movement_date").isoformat() if m.get("movement_date") else None,
                "movement_direction": m.get("movement_direction"),
                "product_id": m.get("product_id"),
                "product_name": m.get("product_name"),
                "product_code": m.get("product_code"),
                "batch_id": m.get("batch_id"),
                "batch_number": m.get("batch_number"),
                "quantity": float(m.get("quantity")) if m.get("quantity") else 0,
                "unit_price": money_json(m.get("unit_price") or 0),
                "total_value": money_json(m.get("total_value") or 0),
                "reference_type": m.get("reference_type"),
                "reference_number": m.get("reference_number"),
                "from_location_id": m.get("from_location_id"),
                "from_location_name": m.get("from_location_name"),
                "to_location_id": m.get("to_location_id"),
                "to_location_name": m.get("to_location_name"),
                "reason": m.get("reason"),
                "notes": m.get("notes"),
                "created_at": m.get("created_at").isoformat() if m.get("created_at") else None,
                "created_by": m.get("created_by"),
                "created_by_name": m.get("created_by_name"),
                "status": "completed"
            })
        
        return {"success": True, "data": movements_list, "total": total, "movements": movements_list}
    except Exception as e:
        logger.error(f"Error fetching inventory movements: {e}")
        return {"success": False, "data": [], "movements": [], "total": 0, "error": str(e)}


@router.get("/reasons")
def get_movement_reasons():
    """Get predefined reasons for stock movements"""
    return {
        "receive_reasons": [
            {"value": "gift", "label": "Gift/Free Sample"},
            {"value": "transfer_in", "label": "Transfer from Another Location"},
            {"value": "found", "label": "Found/Recovered Stock"},
            {"value": "adjustment", "label": "Stock Adjustment"},
            {"value": "opening", "label": "Opening Stock"},
            {"value": "other", "label": "Other"}
        ],
        "issue_reasons": [
            {"value": "damaged", "label": "Damaged"},
            {"value": "expired", "label": "Expired"},
            {"value": "lost", "label": "Lost/Missing"},
            {"value": "sample", "label": "Free Sample Given"},
            {"value": "personal", "label": "Personal Use"},
            {"value": "transfer_out", "label": "Transfer to Another Location"},
            {"value": "adjustment", "label": "Stock Adjustment"},
            {"value": "other", "label": "Other"}
        ]
    }


@router.post("/receive")
@with_tenant_context
async def create_stock_receive(
    receive_data: dict,
    _: dict = Depends(PermissionChecker("inventory", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Create a stock receive entry — creates inventory_movement + updates batches + location_wise_stock"""
    try:
        from ....schemas.inventory.inventory import StockMovementCreate
        from datetime import date as date_type

        required_fields = ["product_id", "quantity", "movement_date", "reason"]
        for field in required_fields:
            if field not in receive_data:
                raise HTTPException(status_code=400, detail=f"Missing required field: {field}")

        org_id = str(context.org_id)
        movement_number = DocumentNumberService.generate_number(db, "stock_receipt", org_id)

        product = InventoryService.get_product_by_id(db, org_id, receive_data["product_id"])
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        location_id = resolve_location_id(db, org_id, context.primary_branch_id, receive_data.get("location_id"))

        logger.info(f"Stock receive: {movement_number} for product {receive_data['product_id']} qty {receive_data['quantity']}")

        # Use InventoryService.record_stock_movement for full audit trail
        movement_data = StockMovementCreate(
            org_id=context.org_id,
            product_id=receive_data["product_id"],
            batch_id=receive_data.get("batch_id"),
            movement_type="receive",
            movement_direction="in",
            movement_date=receive_data["movement_date"],
            quantity=receive_data["quantity"],
            reference_type="stock_receipt",
            reference_number=movement_number,
            location_id=location_id,
            reason=receive_data["reason"],
            notes=receive_data.get("notes"),
            created_by=context.user_id
        )
        result = InventoryService.record_stock_movement(db, movement_data)
        db.commit()

        return {
            "status": "success",
            "movement_id": result.movement_id,
            "movement_number": movement_number,
            "message": f"Stock receive {movement_number} created successfully"
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating stock receive: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/issue")
@with_tenant_context
async def create_stock_issue(
    issue_data: dict,
    _: dict = Depends(PermissionChecker("inventory", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Create a stock issue entry — creates inventory_movement + updates batches + location_wise_stock"""
    try:
        from ....schemas.inventory.inventory import StockMovementCreate

        required_fields = ["product_id", "quantity", "movement_date", "reason"]
        for field in required_fields:
            if field not in issue_data:
                raise HTTPException(status_code=400, detail=f"Missing required field: {field}")

        org_id = str(context.org_id)
        movement_number = DocumentNumberService.generate_number(db, "stock_issue", org_id)

        location_id = resolve_location_id(db, org_id, context.primary_branch_id, issue_data.get("location_id"))

        # Pre-check stock availability at location level
        stock = InventoryService.get_location_wise_stock(db, org_id, issue_data["product_id"], location_id, issue_data.get("batch_id"))
        if not stock:
            raise HTTPException(status_code=400, detail="No stock found for product at this location")

        allow_negative = check_negative_stock_allowed(db, org_id)
        if not allow_negative and stock["quantity_available"] < issue_data["quantity"]:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock. Available: {stock['quantity_available']}. Enable 'Allow Negative Stock' in Master Settings to proceed."
            )
        elif stock["quantity_available"] < issue_data["quantity"]:
            logger.warning(f"Stock going negative for product {issue_data['product_id']}")

        logger.info(f"Stock issue: {movement_number} for product {issue_data['product_id']} qty {issue_data['quantity']}")

        # Use InventoryService.record_stock_movement for full audit trail
        movement_data = StockMovementCreate(
            org_id=context.org_id,
            product_id=issue_data["product_id"],
            batch_id=issue_data.get("batch_id"),
            movement_type="issue",
            movement_direction="out",
            movement_date=issue_data["movement_date"],
            quantity=issue_data["quantity"],
            reference_type="stock_issue",
            reference_number=movement_number,
            location_id=location_id,
            reason=issue_data["reason"],
            notes=issue_data.get("notes"),
            created_by=context.user_id
        )
        result = InventoryService.record_stock_movement(db, movement_data)
        db.commit()

        return {
            "status": "success",
            "movement_id": result.movement_id,
            "movement_number": movement_number,
            "message": f"Stock issue {movement_number} created successfully"
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating stock issue: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transfer")
@with_tenant_context
async def create_stock_transfer(
    transfer_data: dict,
    _: dict = Depends(PermissionChecker("inventory", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Transfer stock between locations — atomic two-movement operation"""
    try:
        required_fields = ["product_id", "quantity", "movement_date", "source_location", "destination_location"]
        for field in required_fields:
            if field not in transfer_data:
                raise HTTPException(status_code=400, detail=f"Missing required field: {field}")

        if transfer_data["source_location"] == transfer_data["destination_location"]:
            raise HTTPException(status_code=400, detail="Source and destination locations must be different")

        org_id = str(context.org_id)
        movement_number = DocumentNumberService.generate_number(db, "stock_transfer", org_id)

        logger.info(
            f"Stock transfer: {movement_number} for product {transfer_data['product_id']} "
            f"qty {transfer_data['quantity']} from {transfer_data['source_location']} to {transfer_data['destination_location']}"
        )

        result = InventoryService.record_stock_transfer(
            db=db,
            org_id=context.org_id,
            product_id=transfer_data["product_id"],
            batch_id=transfer_data.get("batch_id"),
            quantity=transfer_data["quantity"],
            source_location_id=transfer_data["source_location"],
            destination_location_id=transfer_data["destination_location"],
            movement_date=transfer_data["movement_date"],
            reason=transfer_data.get("reason", "Stock transfer"),
            created_by=context.user_id,
            reference_number=movement_number,
        )
        db.commit()

        return {
            "status": "success",
            "movement_number": movement_number,
            "out_movement_id": result["out_movement_id"],
            "in_movement_id": result["in_movement_id"],
            "message": f"Stock transfer {movement_number} completed successfully"
        }
    except HTTPException:
        db.rollback()
        raise
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating stock transfer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/product/{product_id}/batches")
@with_tenant_context
async def get_product_batches(
    product_id: str,
    _: dict = Depends(PermissionChecker("inventory", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get available batches for a product"""
    try:
        batches = InventoryService.get_product_batches_with_stock(db, str(context.org_id), int(product_id))
        return {"product_id": product_id, "batches": batches}
    except Exception as e:
        logger.error(f"Error fetching product batches: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/near-expiry")
@with_tenant_context
async def get_near_expiry_stock(
    days: int = Query(90, description="Days to expiry"),
    _: dict = Depends(PermissionChecker("inventory", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get products nearing expiry"""
    try:
        items = InventoryService.get_near_expiry_stock(db, str(context.org_id), days)
        return {"days_threshold": days, "total_items": len(items), "items": items}
    except Exception as e:
        logger.error(f"Error fetching near expiry stock: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/low-stock")
@with_tenant_context
async def get_low_stock_items(
    _: dict = Depends(PermissionChecker("inventory", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get products with low stock"""
    try:
        items = InventoryService.get_low_stock_items(db, str(context.org_id))
        return {"total_items": len(items), "items": items}
    except Exception as e:
        logger.error(f"Error fetching low stock items: {e}")
        raise HTTPException(status_code=500, detail=str(e))

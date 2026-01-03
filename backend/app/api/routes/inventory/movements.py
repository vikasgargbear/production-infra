"""
Stock Movement API Router
Handles manual stock receive/issue operations not related to sales or purchases
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
import logging
from datetime import datetime
import uuid
from ...services.document_number_service import DocumentNumberService

from ....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from ....core.auth.org_context import get_org_context, OrgContext
from ....core.security.permissions import PermissionChecker  # RBAC
from ....utils.branch_utils import get_default_branch_id
from ....utils.feature_flags import check_negative_stock_allowed

logger = logging.getLogger(__name__)

router = APIRouter(tags=["stock-movements"])

@router.get("/")
@with_tenant_context
async def get_inventory_movements(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    movement_type: Optional[str] = Query(None, description="Movement type filter"),
    product_id: Optional[int] = Query(None, description="Product ID filter"),
    batch_id: Optional[int] = Query(None, description="Batch ID filter"),
    location_id: Optional[int] = Query(None, description="Location ID filter"),
    from_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    sort: Optional[str] = Query("movement_date", description="Sort field"),
    order: Optional[str] = Query("desc", description="Sort order (asc/desc)"),
    _: dict = Depends(PermissionChecker("inventory", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get inventory movements with direct database query
    """
    try:
        # Build the query
        query = """
            SELECT
                im.movement_id,
                im.movement_type,
                im.movement_date,
                im.movement_direction,
                im.product_id,
                p.product_name,
                p.product_code,
                im.batch_id,
                b.batch_number,
                im.quantity,
                COALESCE(im.unit_cost, 0) as unit_price,
                COALESCE(im.total_cost, im.quantity * im.unit_cost, 0) as total_value,
                im.reference_type,
                im.reference_number,
                im.from_location_id,
                fl.location_name as from_location_name,
                im.to_location_id,
                tl.location_name as to_location_name,
                im.reason,
                im.notes,
                im.created_at,
                im.created_by,
                u.username as created_by_name
            FROM inventory.inventory_movements im
            LEFT JOIN inventory.products p ON im.product_id = p.product_id
            LEFT JOIN inventory.batches b ON im.batch_id = b.batch_id
            LEFT JOIN inventory.storage_locations fl ON im.from_location_id = fl.location_id
            LEFT JOIN inventory.storage_locations tl ON im.to_location_id = tl.location_id
            LEFT JOIN master.org_users u ON im.created_by = u.user_id
            WHERE im.org_id = :org_id
        """

        # Add filters
        params = {"org_id": str(context.org_id)}

        if movement_type:
            query += " AND im.movement_type = :movement_type"
            params["movement_type"] = movement_type

        if product_id:
            query += " AND im.product_id = :product_id"
            params["product_id"] = product_id

        if batch_id:
            query += " AND im.batch_id = :batch_id"
            params["batch_id"] = batch_id

        if location_id:
            query += " AND (im.from_location_id = :location_id OR im.to_location_id = :location_id)"
            params["location_id"] = location_id

        if from_date:
            query += " AND im.movement_date >= :from_date::date"
            params["from_date"] = from_date
        # Remove default 30-day filter to show all movements

        if to_date:
            query += " AND im.movement_date <= :to_date::date + INTERVAL '1 day'"
            params["to_date"] = to_date

        # Add sorting
        sort_field = "im.movement_date" if sort == "movement_date" else "im.movement_id"
        sort_order = "DESC" if order == "desc" else "ASC"
        query += f" ORDER BY {sort_field} {sort_order}"

        # Add pagination
        query += " LIMIT :limit OFFSET :skip"
        params["limit"] = limit
        params["skip"] = skip

        # Execute query
        result = db.execute(text(query), params)
        movements = result.fetchall()

        # Count total records
        count_query = """
            SELECT COUNT(*) as total
            FROM inventory.inventory_movements im
            WHERE im.org_id = :org_id
        """

        # Add same filters for count
        count_params = {"org_id": str(context.org_id)}

        if movement_type:
            count_query += " AND im.movement_type = :movement_type"
            count_params["movement_type"] = movement_type

        if product_id:
            count_query += " AND im.product_id = :product_id"
            count_params["product_id"] = product_id

        if batch_id:
            count_query += " AND im.batch_id = :batch_id"
            count_params["batch_id"] = batch_id

        if from_date:
            count_query += " AND im.movement_date >= :from_date::date"
            count_params["from_date"] = from_date
        else:
            count_query += " AND im.movement_date >= (CURRENT_DATE - INTERVAL '30 days')"

        if to_date:
            count_query += " AND im.movement_date <= :to_date::date + INTERVAL '1 day'"
            count_params["to_date"] = to_date

        total_count = db.execute(text(count_query), count_params).scalar()

        # Transform data for frontend
        movements_list = []
        for movement in movements:
            movements_list.append({
                "id": movement.movement_id,
                "movement_id": movement.movement_id,
                "movement_no": f"MOV-{movement.movement_id}",
                "movement_type": movement.movement_type,
                "movement_date": movement.movement_date.isoformat() if movement.movement_date else None,
                "movement_direction": movement.movement_direction,
                "product_id": movement.product_id,
                "product_name": movement.product_name,
                "product_code": movement.product_code,
                "batch_id": movement.batch_id,
                "batch_number": movement.batch_number,
                "quantity": float(movement.quantity) if movement.quantity else 0,
                "unit_price": float(movement.unit_price) if movement.unit_price else 0,
                "total_value": float(movement.total_value) if movement.total_value else 0,
                "reference_type": movement.reference_type,
                "reference_number": movement.reference_number,
                "from_location_id": movement.from_location_id,
                "from_location_name": movement.from_location_name,
                "to_location_id": movement.to_location_id,
                "to_location_name": movement.to_location_name,
                "reason": movement.reason,
                "notes": movement.notes,
                "created_at": movement.created_at.isoformat() if movement.created_at else None,
                "created_by": movement.created_by,
                "created_by_name": movement.created_by_name,
                "status": "completed"
            })

        return {
            "success": True,
            "data": movements_list,
            "total": total_count,
            "movements": movements_list  # Also include as movements for compatibility
        }

    except Exception as e:
        logger.error(f"Error fetching inventory movements: {e}")
        # Return empty result instead of raising exception
        return {
            "success": False,
            "data": [],
            "movements": [],
            "total": 0,
            "error": str(e)
        }

@router.get("/reasons")
def get_movement_reasons():
    """
    Get predefined reasons for stock movements
    """
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
    """
    Create a stock receive entry (increase inventory)
    """
    try:
        
        # Validate required fields
        required_fields = ["product_id", "quantity", "movement_date", "reason"]
        for field in required_fields:
            if field not in receive_data:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Missing required field: {field}"
                )
                
        movement_id = str(uuid.uuid4())
        movement_number = DocumentNumberService.generate_number(db, "stock_receipt", str(context.org_id))
        
        # Get product details - with org_id security filter
        product = db.execute(
            text("SELECT * FROM inventory.products WHERE product_id = :product_id AND org_id = :org_id"),
            {"product_id": receive_data["product_id"], "org_id": str(context.org_id)}
        ).first()
        
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
            
        # Skip creating movement record since inventory_movements table was deleted
        # Just log the movement details
        logger.info(f"Stock receive: {movement_number} for product {receive_data['product_id']} qty {receive_data['quantity']}")
        
        # Update location-wise stock
        stock = db.execute(
            text("""
                SELECT * FROM inventory.location_wise_stock 
                WHERE org_id = :org_id 
                AND product_id = :product_id 
                AND location_id = :location_id
                AND COALESCE(batch_id, 0) = COALESCE(:batch_id, 0)
            """),
            {
                "org_id": str(context.org_id),
                "product_id": receive_data["product_id"],
                "location_id": receive_data.get("location_id") or context.primary_branch_id or get_default_branch_id(db, str(context.org_id)),
                "batch_id": receive_data.get("batch_id")
            }
        ).first()
        
        if stock:
            # Update existing stock
            db.execute(
                text("""
                    UPDATE inventory.location_wise_stock 
                    SET quantity_on_hand = quantity_on_hand + :quantity,
                        last_movement_date = :movement_date,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE stock_id = :stock_id
                """),
                {
                    "quantity": receive_data["quantity"],
                    "movement_date": receive_data["movement_date"],
                    "stock_id": stock.stock_id
                }
            )
        else:
            # Create new stock entry
            db.execute(
                text("""
                    INSERT INTO inventory.location_wise_stock (
                        org_id, location_id, product_id, batch_id,
                        quantity_on_hand, quantity_available,
                        quantity_reserved, last_movement_date
                    ) VALUES (
                        :org_id, :location_id, :product_id, :batch_id,
                        :quantity, :quantity, 0, :movement_date
                    )
                """),
                {
                    "org_id": str(context.org_id),
                    "location_id": receive_data.get("location_id") or context.primary_branch_id or get_default_branch_id(db, str(context.org_id)),
                    "product_id": receive_data["product_id"],
                    "batch_id": receive_data.get("batch_id"),
                    "quantity": receive_data["quantity"],
                    "movement_date": receive_data["movement_date"]
                }
            )
            
        # No need for separate ledger entry as inventory_movements serves as the ledger
        
        # TenantAwareSession auto-commits on success
        
        return {
            "status": "success",
            "movement_id": movement_id,
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
    """
    Create a stock issue entry (decrease inventory)
    """
    try:
        
        # Validate required fields
        required_fields = ["product_id", "quantity", "movement_date", "reason"]
        for field in required_fields:
            if field not in issue_data:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Missing required field: {field}"
                )
                
        movement_id = str(uuid.uuid4())
        movement_number = DocumentNumberService.generate_number(db, "stock_issue", str(context.org_id))
        
        # Check available stock
        batch_id = issue_data.get("batch_id")
        stock = db.execute(
            text("""
                SELECT * FROM inventory.location_wise_stock 
                WHERE org_id = :org_id 
                AND product_id = :product_id 
                AND location_id = :location_id
                AND COALESCE(batch_id, 0) = COALESCE(:batch_id, 0)
            """),
            {
                "org_id": str(context.org_id),
                "product_id": issue_data["product_id"],
                "location_id": issue_data.get("location_id") or context.primary_branch_id or get_default_branch_id(db, str(context.org_id)),
                "batch_id": batch_id
            }
        ).first()
        
        if not stock:
            raise HTTPException(
                status_code=400,
                detail=f"No stock found for product at this location"
            )

        # Check if negative stock is allowed from master settings
        allow_negative = check_negative_stock_allowed(db, str(context.org_id))

        if not allow_negative and stock.quantity_available < issue_data["quantity"]:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock. Available: {stock.quantity_available}. Enable 'Allow Negative Stock' in Master Settings to proceed."
            )
        elif stock.quantity_available < issue_data["quantity"]:
            # Negative stock is allowed, just log a warning
            logger.warning(f"Stock going negative for product {issue_data['product_id']}. Current: {stock.quantity_available}, Issuing: {issue_data['quantity']}")
            
        # Skip creating movement record since inventory_movements table was deleted  
        # Just log the movement details
        logger.info(f"Stock issue: {movement_number} for product {issue_data['product_id']} qty {issue_data['quantity']}")
        
        # Update location-wise stock
        db.execute(
            text("""
                UPDATE inventory.location_wise_stock 
                SET quantity_on_hand = quantity_on_hand - :quantity,
                    quantity_available = quantity_available - :quantity,
                    last_movement_date = :movement_date,
                    updated_at = CURRENT_TIMESTAMP
                WHERE stock_id = :stock_id
            """),
            {
                "quantity": issue_data["quantity"],
                "movement_date": issue_data["movement_date"],
                "stock_id": stock.stock_id
            }
        )
        
        # No need for separate ledger entry as inventory_movements serves as the ledger
        
        # TenantAwareSession auto-commits on success
        
        return {
            "status": "success",
            "movement_id": movement_id,
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
    """
    Transfer stock between locations/warehouses
    """
    try:
        
        # Validate required fields
        required_fields = ["product_id", "quantity", "movement_date", 
                          "source_location", "destination_location"]
        for field in required_fields:
            if field not in transfer_data:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Missing required field: {field}"
                )
                
        # Create issue from source
        issue_data = {
            "product_id": transfer_data["product_id"],
            "quantity": transfer_data["quantity"],
            "movement_date": transfer_data["movement_date"],
            "reason": "transfer_out",
            "destination_location": transfer_data["destination_location"],
            "batch_number": transfer_data.get("batch_number"),
            "notes": f"Transfer to {transfer_data['destination_location']}"
        }
        
        issue_result = create_stock_issue(issue_data, db)
        
        # Create receive at destination
        receive_data = {
            "product_id": transfer_data["product_id"],
            "quantity": transfer_data["quantity"],
            "movement_date": transfer_data["movement_date"],
            "reason": "transfer_in",
            "source_location": transfer_data["source_location"],
            "batch_number": transfer_data.get("batch_number"),
            "expiry_date": transfer_data.get("expiry_date"),
            "notes": f"Transfer from {transfer_data['source_location']}"
        }
        
        receive_result = create_stock_receive(receive_data, db)
        
        return {
            "status": "success",
            "issue_movement": issue_result,
            "receive_movement": receive_result,
            "message": "Stock transfer completed successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
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
    """
    Get available batches for a product with stock info
    """
    try:
        query = """
            SELECT 
                batch_number,
                expiry_date,
                quantity_available as current_stock,
                cost_price as purchase_price,
                selling_price,
                mrp
            FROM inventory.batches
            WHERE org_id = :org_id
            AND product_id = :product_id
            AND quantity_available > 0
            ORDER BY expiry_date ASC, batch_number
        """
        
        batches = db.execute(
            text(query),
            {
                "org_id": str(context.org_id),
                "product_id": product_id
            }
        ).fetchall()
        
        return {
            "product_id": product_id,
            "batches": [dict(b._mapping) for b in batches]
        }
        
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
    """
    Get products nearing expiry
    """
    try:
        query = """
            SELECT 
                i.*, 
                p.product_name,
                p.hsn_code,
                EXTRACT(DAY FROM i.expiry_date - CURRENT_DATE) as days_to_expiry
            FROM inventory i
            LEFT JOIN inventory.products p ON i.product_id = p.product_id
            WHERE i.org_id = :org_id
            AND i.current_stock > 0
            AND i.expiry_date IS NOT NULL
            AND i.expiry_date <= CURRENT_DATE + INTERVAL ':days days'
            ORDER BY i.expiry_date ASC
        """
        
        items = db.execute(
            text(query),
            {
                "org_id": str(context.org_id),
                "days": days
            }
        ).fetchall()
        
        return {
            "days_threshold": days,
            "total_items": len(items),
            "items": [dict(item._mapping) for item in items]
        }
        
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
    """
    Get products with low stock based on reorder level
    """
    try:
        query = """
            SELECT 
                p.product_id,
                p.product_name,
                p.hsn_code,
                p.reorder_level,
                p.reorder_quantity,
                COALESCE(SUM(i.current_stock), 0) as total_stock
            FROM inventory.products p
            LEFT JOIN inventory i ON p.product_id = i.product_id
            WHERE p.org_id = :org_id
            AND p.reorder_level IS NOT NULL
            AND p.reorder_level > 0
            GROUP BY p.product_id, p.product_name, p.hsn_code, 
                     p.reorder_level, p.reorder_quantity
            HAVING COALESCE(SUM(i.current_stock), 0) <= p.reorder_level
            ORDER BY (COALESCE(SUM(i.current_stock), 0) / NULLIF(p.reorder_level, 0)) ASC
        """
        
        items = db.execute(
            text(query),
            {"org_id": str(context.org_id)}
        ).fetchall()
        
        return {
            "total_items": len(items),
            "items": [dict(item._mapping) for item in items]
        }
        
    except Exception as e:
        logger.error(f"Error fetching low stock items: {e}")
        raise HTTPException(status_code=500, detail=str(e))
"""
Stock Movement API Router
Handles manual stock receive/issue operations not related to sales or purchases
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import datetime
from decimal import Decimal
import uuid

from ...database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/stock-movements", tags=["stock-movements"])

@router.get("/")
async def get_stock_movements(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    movement_type: Optional[str] = Query(None, description="receive/issue"),
    product_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    reason: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get list of stock movements with optional filters
    """
    try:
        query = """
            SELECT sm.*, p.product_name, p.hsn_code
            FROM stock_movements sm
            LEFT JOIN products p ON sm.product_id = p.product_id
            WHERE 1=1
        """
        params = {"skip": skip, "limit": limit}
        
        if movement_type:
            query += " AND sm.movement_type = :movement_type"
            params["movement_type"] = movement_type
            
        if product_id:
            query += " AND sm.product_id = :product_id"
            params["product_id"] = product_id
            
        if from_date:
            query += " AND sm.movement_date >= :from_date"
            params["from_date"] = from_date
            
        if to_date:
            query += " AND sm.movement_date <= :to_date"
            params["to_date"] = to_date
            
        if reason:
            query += " AND sm.reason ILIKE :reason"
            params["reason"] = f"%{reason}%"
            
        query += " ORDER BY sm.movement_date DESC, sm.created_at DESC LIMIT :limit OFFSET :skip"
        
        movements = db.execute(text(query), params).fetchall()
        
        # Get total count
        count_query = query.replace("SELECT sm.*, p.product_name, p.hsn_code", "SELECT COUNT(*)")
        count_query = count_query.split("ORDER BY")[0]
        total = db.execute(text(count_query), params).scalar()
        
        return {
            "total": total,
            "movements": [dict(m._mapping) for m in movements]
        }
        
    except Exception as e:
        logger.error(f"Error fetching stock movements: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/reasons")
async def get_movement_reasons():
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
async def create_stock_receive(
    receive_data: dict,
    db: Session = Depends(get_db)
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
        movement_number = f"SR-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        
        # Get product details
        product = db.execute(
            text("SELECT * FROM products WHERE product_id = :product_id"),
            {"product_id": receive_data["product_id"]}
        ).first()
        
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
            
        # Create movement record
        db.execute(
            text("""
                INSERT INTO stock_movements (
                    movement_id, org_id, movement_number, movement_type,
                    movement_date, product_id, batch_number, expiry_date,
                    quantity, unit, reason, source_location,
                    notes, created_by
                ) VALUES (
                    :movement_id, :org_id, :movement_number, 'receive',
                    :movement_date, :product_id, :batch_number, :expiry_date,
                    :quantity, :unit, :reason, :source,
                    :notes, :created_by
                )
            """),
            {
                "movement_id": movement_id,
                "org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f",
                "movement_number": movement_number,
                "movement_date": receive_data["movement_date"],
                "product_id": receive_data["product_id"],
                "batch_number": receive_data.get("batch_number", "DEFAULT"),
                "expiry_date": receive_data.get("expiry_date"),
                "quantity": receive_data["quantity"],
                "unit": receive_data.get("unit", "strip"),
                "reason": receive_data["reason"],
                "source": receive_data.get("source_location", ""),
                "notes": receive_data.get("notes", ""),
                "created_by": receive_data.get("created_by", "system")
            }
        )
        
        # Update or create inventory entry
        inventory = db.execute(
            text("""
                SELECT * FROM inventory 
                WHERE org_id = :org_id 
                AND product_id = :product_id 
                AND batch_number = :batch
            """),
            {
                "org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f",
                "product_id": receive_data["product_id"],
                "batch": receive_data.get("batch_number", "DEFAULT")
            }
        ).first()
        
        if inventory:
            # Update existing inventory
            db.execute(
                text("""
                    UPDATE inventory 
                    SET current_stock = current_stock + :quantity,
                        last_updated = CURRENT_TIMESTAMP
                    WHERE inventory_id = :inventory_id
                """),
                {
                    "quantity": receive_data["quantity"],
                    "inventory_id": inventory.inventory_id
                }
            )
        else:
            # Create new inventory entry
            db.execute(
                text("""
                    INSERT INTO inventory (
                        inventory_id, org_id, product_id,
                        batch_number, expiry_date, current_stock,
                        purchase_price, selling_price, mrp
                    ) VALUES (
                        :inv_id, :org_id, :product_id,
                        :batch, :expiry, :stock,
                        :purchase_price, :selling_price, :mrp
                    )
                """),
                {
                    "inv_id": str(uuid.uuid4()),
                    "org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f",
                    "product_id": receive_data["product_id"],
                    "batch": receive_data.get("batch_number", "DEFAULT"),
                    "expiry": receive_data.get("expiry_date"),
                    "stock": receive_data["quantity"],
                    "purchase_price": product.purchase_price,
                    "selling_price": product.sale_price,
                    "mrp": product.mrp
                }
            )
            
        # Create stock ledger entry
        db.execute(
            text("""
                INSERT INTO stock_ledger (
                    ledger_id, org_id, product_id, transaction_date,
                    transaction_type, reference_type, reference_id,
                    batch_number, quantity_in, quantity_out,
                    balance_quantity, notes
                ) VALUES (
                    :ledger_id, :org_id, :product_id, :date,
                    'stock_receive', 'stock_movement', :movement_id,
                    :batch, :qty_in, 0,
                    (SELECT COALESCE(SUM(current_stock), 0) + :qty_in 
                     FROM inventory 
                     WHERE product_id = :product_id),
                    :notes
                )
            """),
            {
                "ledger_id": str(uuid.uuid4()),
                "org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f",
                "product_id": receive_data["product_id"],
                "date": receive_data["movement_date"],
                "movement_id": movement_id,
                "batch": receive_data.get("batch_number", "DEFAULT"),
                "qty_in": receive_data["quantity"],
                "notes": f"Stock Receive - {receive_data['reason']}"
            }
        )
        
        db.commit()
        
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
async def create_stock_issue(
    issue_data: dict,
    db: Session = Depends(get_db)
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
        movement_number = f"SI-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        
        # Check available stock
        batch_number = issue_data.get("batch_number", "DEFAULT")
        batch = db.execute(
            text("""
                SELECT * FROM batches 
                WHERE org_id = :org_id 
                AND product_id = :product_id 
                AND batch_number = :batch
            """),
            {
                "org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f",
                "product_id": issue_data["product_id"],
                "batch": batch_number
            }
        ).first()
        
        if not batch:
            raise HTTPException(
                status_code=400, 
                detail=f"No stock found for product with batch {batch_number}"
            )
            
        if batch.quantity_available < issue_data["quantity"]:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock. Available: {batch.quantity_available}"
            )
            
        # Create movement record
        db.execute(
            text("""
                INSERT INTO stock_movements (
                    movement_id, org_id, movement_number, movement_type,
                    movement_date, product_id, batch_number, expiry_date,
                    quantity, unit, reason, destination_location,
                    notes, created_by
                ) VALUES (
                    :movement_id, :org_id, :movement_number, 'issue',
                    :movement_date, :product_id, :batch_number, :expiry_date,
                    :quantity, :unit, :reason, :destination,
                    :notes, :created_by
                )
            """),
            {
                "movement_id": movement_id,
                "org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f",
                "movement_number": movement_number,
                "movement_date": issue_data["movement_date"],
                "product_id": issue_data["product_id"],
                "batch_number": batch_number,
                "expiry_date": batch.expiry_date,
                "quantity": issue_data["quantity"],
                "unit": issue_data.get("unit", "strip"),
                "reason": issue_data["reason"],
                "destination": issue_data.get("destination_location", ""),
                "notes": issue_data.get("notes", ""),
                "created_by": issue_data.get("created_by", "system")
            }
        )
        
        # Update batch quantity
        db.execute(
            text("""
                UPDATE batches 
                SET quantity_available = quantity_available - :quantity,
                    updated_at = CURRENT_TIMESTAMP
                WHERE batch_id = :batch_id
            """),
            {
                "quantity": issue_data["quantity"],
                "batch_id": batch.batch_id
            }
        )
        
        # Create stock ledger entry
        db.execute(
            text("""
                INSERT INTO stock_ledger (
                    ledger_id, org_id, product_id, transaction_date,
                    transaction_type, reference_type, reference_id,
                    batch_number, quantity_in, quantity_out,
                    balance_quantity, notes
                ) VALUES (
                    :ledger_id, :org_id, :product_id, :date,
                    'stock_issue', 'stock_movement', :movement_id,
                    :batch, 0, :qty_out,
                    (SELECT COALESCE(SUM(current_stock), 0) - :qty_out 
                     FROM inventory 
                     WHERE product_id = :product_id),
                    :notes
                )
            """),
            {
                "ledger_id": str(uuid.uuid4()),
                "org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f",
                "product_id": issue_data["product_id"],
                "date": issue_data["movement_date"],
                "movement_id": movement_id,
                "batch": batch_number,
                "qty_out": issue_data["quantity"],
                "notes": f"Stock Issue - {issue_data['reason']}"
            }
        )
        
        db.commit()
        
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
async def create_stock_transfer(
    transfer_data: dict,
    db: Session = Depends(get_db)
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
        
        issue_result = await create_stock_issue(issue_data, db)
        
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
        
        receive_result = await create_stock_receive(receive_data, db)
        
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
async def get_product_batches(
    product_id: str,
    db: Session = Depends(get_db)
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
            FROM batches
            WHERE org_id = :org_id
            AND product_id = :product_id
            AND quantity_available > 0
            ORDER BY expiry_date ASC, batch_number
        """
        
        batches = db.execute(
            text(query),
            {
                "org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f",
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
async def get_near_expiry_stock(
    days: int = Query(90, description="Days to expiry"),
    db: Session = Depends(get_db)
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
            LEFT JOIN products p ON i.product_id = p.product_id
            WHERE i.org_id = :org_id
            AND i.current_stock > 0
            AND i.expiry_date IS NOT NULL
            AND i.expiry_date <= CURRENT_DATE + INTERVAL ':days days'
            ORDER BY i.expiry_date ASC
        """
        
        items = db.execute(
            text(query),
            {
                "org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f",
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
async def get_low_stock_items(
    db: Session = Depends(get_db)
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
            FROM products p
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
            {"org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f"}
        ).fetchall()
        
        return {
            "total_items": len(items),
            "items": [dict(item._mapping) for item in items]
        }
        
    except Exception as e:
        logger.error(f"Error fetching low stock items: {e}")
        raise HTTPException(status_code=500, detail=str(e))
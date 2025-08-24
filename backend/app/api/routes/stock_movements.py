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

from ...core.database import get_db
from ...core.auth_utils import get_org_id_from_header

logger = logging.getLogger(__name__)

router = APIRouter(tags=["stock-movements"])

@router.get("/")
def get_inventory_movements(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    movement_type: Optional[str] = Query(None, description="Movement type filter"),
    product_id: Optional[int] = Query(None, description="Product ID filter"),
    batch_id: Optional[int] = Query(None, description="Batch ID filter"),
    location_id: Optional[int] = Query(None, description="Location ID filter"),
    from_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get inventory movements using the database API function
    """
    try:
        # Prepare parameters for the database API function
        api_params = []
        
        # Convert parameter format for PostgreSQL function call
        if product_id is not None:
            api_params.append(f"p_product_id => {product_id}")
        else:
            api_params.append("p_product_id => NULL")
            
        if batch_id is not None:
            api_params.append(f"p_batch_id => {batch_id}")
        else:
            api_params.append("p_batch_id => NULL")
            
        if location_id is not None:
            api_params.append(f"p_location_id => {location_id}")
        else:
            api_params.append("p_location_id => NULL")
            
        if movement_type:
            api_params.append(f"p_movement_type => '{movement_type}'")
        else:
            api_params.append("p_movement_type => NULL")
            
        if from_date:
            api_params.append(f"p_from_date => '{from_date}'::date")
        else:
            api_params.append("p_from_date => (CURRENT_DATE - INTERVAL '30 days')::date")
            
        if to_date:
            api_params.append(f"p_to_date => '{to_date}'::date")
        else:
            api_params.append("p_to_date => CURRENT_DATE::date")
            
        api_params.append(f"p_limit => {limit}")
        
        # Call the database API function
        query = f"SELECT api.get_inventory_movements({', '.join(api_params)})"
        
        result = db.execute(text(query)).scalar()
        
        if result is None:
            return {
                "success": True,
                "data": {
                    "movements": [],
                    "total": 0
                }
            }
        
        # Extract movements from the JSON result
        movements_data = result.get('movements', [])
        
        # Apply client-side pagination if needed
        total_movements = len(movements_data)
        paginated_movements = movements_data[skip:skip + limit] if skip > 0 else movements_data
        
        # Transform the data to match frontend expectations
        transformed_movements = []
        for movement in paginated_movements:
            transformed_movement = {
                "id": movement.get("movement_id", ""),
                "movement_no": f"MOV-{movement.get('movement_id', '')}",
                "product_name": movement.get("product_name", ""),
                "movement_type": movement.get("movement_type", ""),
                "quantity": movement.get("quantity", 0),
                "reference_no": movement.get("reference_number", ""),
                "movement_date": movement.get("movement_date", ""),
                "reason": movement.get("narration", ""),
                "batch_no": movement.get("batch_number", ""),
                "location_from": "",
                "location_to": movement.get("location_name", ""),
                "created_by": movement.get("created_by", ""),
                "status": "completed"
            }
            transformed_movements.append(transformed_movement)
        
        return {
            "success": True,
            "data": {
                "movements": transformed_movements,
                "total": total_movements
            }
        }
        
    except Exception as e:
        logger.error(f"Error fetching inventory movements: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch inventory movements: {str(e)}")

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
def create_stock_receive(
    receive_data: dict,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
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
            text("SELECT * FROM inventory.products WHERE product_id = :product_id"),
            {"product_id": receive_data["product_id"]}
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
                "org_id": org_id,
                "product_id": receive_data["product_id"],
                "location_id": receive_data.get("location_id", 1),
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
                    "org_id": org_id,
                    "location_id": receive_data.get("location_id", 1),
                    "product_id": receive_data["product_id"],
                    "batch_id": receive_data.get("batch_id"),
                    "quantity": receive_data["quantity"],
                    "movement_date": receive_data["movement_date"]
                }
            )
            
        # No need for separate ledger entry as inventory_movements serves as the ledger
        
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
def create_stock_issue(
    issue_data: dict,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
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
                "org_id": org_id,
                "product_id": issue_data["product_id"],
                "location_id": issue_data.get("location_id", 1),
                "batch_id": batch_id
            }
        ).first()
        
        if not stock:
            raise HTTPException(
                status_code=400, 
                detail=f"No stock found for product at this location"
            )
            
        if stock.quantity_available < issue_data["quantity"]:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock. Available: {stock.quantity_available}"
            )
            
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
def create_stock_transfer(
    transfer_data: dict,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
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
def get_product_batches(
    product_id: str,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
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
                "org_id": org_id,
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
def get_near_expiry_stock(
    days: int = Query(90, description="Days to expiry"),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
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
                "org_id": org_id,
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
def get_low_stock_items(
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
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
            {"org_id": org_id}
        ).fetchall()
        
        return {
            "total_items": len(items),
            "items": [dict(item._mapping) for item in items]
        }
        
    except Exception as e:
        logger.error(f"Error fetching low stock items: {e}")
        raise HTTPException(status_code=500, detail=str(e))
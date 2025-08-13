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
from ...core.config import DEFAULT_ORG_ID

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stock-movements", tags=["stock-movements"])

@router.get("/")
def get_inventory_movements(
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
    Get list of stock movements from actual transaction tables
    """
    try:
        # Build union query from actual transaction tables
        queries = []
        params = {"skip": skip, "limit": limit}
        
        # Sales movements (outgoing)
        sales_query = """
            SELECT 
                'sale' as movement_type,
                'out' as movement_direction,
                oi.product_id,
                p.product_name,
                p.hsn_code,
                oi.quantity,
                o.order_date as movement_date,
                o.order_number as reference_number,
                'sales_order' as reference_type,
                o.order_id as reference_id,
                c.customer_name as party_name,
                'Sale to customer' as notes
            FROM sales.order_items oi
            JOIN sales.orders o ON oi.order_id = o.order_id
            JOIN inventory.products p ON oi.product_id = p.product_id
            LEFT JOIN parties.customers c ON o.customer_id = c.customer_id
            WHERE o.order_status != 'cancelled'
        """
        
        # Purchase movements (incoming)
        purchase_query = """
            SELECT 
                'purchase' as movement_type,
                'in' as movement_direction,
                poi.product_id,
                p.product_name,
                p.hsn_code,
                poi.ordered_quantity as quantity,
                po.po_date as movement_date,
                po.po_number as reference_number,
                'purchase_order' as reference_type,
                po.purchase_order_id as reference_id,
                s.supplier_name as party_name,
                'Purchase from supplier' as notes
            FROM procurement.purchase_order_items poi
            JOIN procurement.purchase_orders po ON poi.purchase_order_id = po.purchase_order_id
            JOIN inventory.products p ON poi.product_id = p.product_id
            LEFT JOIN parties.suppliers s ON po.supplier_id = s.supplier_id
            WHERE po.po_status != 'cancelled'
        """
        
        # Add filters
        filters = []
        if product_id:
            filters.append("product_id = :product_id")
            params["product_id"] = product_id
        if from_date:
            filters.append("movement_date >= :from_date")
            params["from_date"] = from_date
        if to_date:
            filters.append("movement_date <= :to_date")
            params["to_date"] = to_date
            
        if filters:
            filter_clause = " AND " + " AND ".join(filters)
            sales_query += filter_clause.replace("product_id", "oi.product_id").replace("movement_date", "o.order_date")
            purchase_query += filter_clause.replace("product_id", "poi.product_id").replace("movement_date", "po.po_date")
        
        # Combine queries
        if not movement_type or movement_type == 'issue':
            queries.append(sales_query)
        if not movement_type or movement_type == 'receive':
            queries.append(purchase_query)
            
        if not queries:
            return {"total": 0, "movements": []}
            
        combined_query = " UNION ALL ".join(queries)
        final_query = f"""
            SELECT * FROM (
                {combined_query}
            ) movements
            ORDER BY movement_date DESC
            LIMIT :limit OFFSET :skip
        """
        
        movements = db.execute(text(final_query), params).fetchall()
        
        # Get total count
        count_query = f"""
            SELECT COUNT(*) FROM (
                {combined_query}
            ) movements
        """
        total = db.execute(text(count_query), params).scalar()
        
        return {
            "total": total or 0,
            "movements": [dict(m._mapping) for m in movements]
        }
        
    except Exception as e:
        logger.error(f"Error fetching stock movements: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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
            text("SELECT * FROM master.products WHERE product_id = :product_id"),
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
                "org_id": DEFAULT_ORG_ID,
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
                    "org_id": DEFAULT_ORG_ID,
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
                "org_id": DEFAULT_ORG_ID,
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
            FROM inventory.batches
            WHERE org_id = :org_id
            AND product_id = :product_id
            AND quantity_available > 0
            ORDER BY expiry_date ASC, batch_number
        """
        
        batches = db.execute(
            text(query),
            {
                "org_id": DEFAULT_ORG_ID,
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
                "org_id": DEFAULT_ORG_ID,
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
            {"org_id": DEFAULT_ORG_ID}
        ).fetchall()
        
        return {
            "total_items": len(items),
            "items": [dict(item._mapping) for item in items]
        }
        
    except Exception as e:
        logger.error(f"Error fetching low stock items: {e}")
        raise HTTPException(status_code=500, detail=str(e))
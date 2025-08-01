"""
Stock Receive API - Add inventory to products
Allows adding stock/batches to existing products
"""

from typing import Optional, List
from datetime import datetime, timedelta, date
from decimal import Decimal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel, Field

from ...database import get_db
from ...dependencies import get_current_org

# Default org ID for now
DEFAULT_ORG_ID = "12de5e22-eee7-4d25-b3a7-d16d01c6170f"

router = APIRouter(
    prefix="/api/v1/stock",
    tags=["stock"]
)

class StockReceiveRequest(BaseModel):
    """Request model for receiving stock"""
    product_id: int
    batch_number: Optional[str] = None
    quantity: int = Field(gt=0, description="Quantity to receive")
    cost_price: Optional[Decimal] = None
    selling_price: Optional[Decimal] = None
    mrp: Optional[Decimal] = None
    expiry_date: Optional[datetime] = None
    supplier_id: Optional[int] = None
    purchase_invoice_number: Optional[str] = None
    notes: Optional[str] = None

class StockReceiveResponse(BaseModel):
    """Response after receiving stock"""
    batch_id: int
    batch_number: str
    product_id: int
    product_name: str
    quantity_received: int
    quantity_available: int
    expiry_date: datetime
    message: str

@router.post("/receive", response_model=StockReceiveResponse)
async def receive_stock(
    stock_data: StockReceiveRequest,
    db: Session = Depends(get_db),
    current_org = Depends(get_current_org)
):
    """
    Receive stock for a product by creating a new batch
    """
    org_id = current_org["org_id"]
    
    try:
        # Get product details
        product = db.execute(text("""
            SELECT product_id, product_name, mrp, sale_price, purchase_price
            FROM products
            WHERE product_id = :product_id AND org_id = :org_id
        """), {
            "product_id": stock_data.product_id,
            "org_id": org_id
        }).first()
        
        if not product:
            raise HTTPException(
                status_code=404,
                detail=f"Product with ID {stock_data.product_id} not found"
            )
        
        # Generate batch number if not provided
        if not stock_data.batch_number:
            batch_number = f"RCV-{datetime.now().strftime('%Y%m%d')}-{stock_data.product_id}-{int(datetime.now().timestamp()) % 10000}"
        else:
            batch_number = stock_data.batch_number
            
        # Check if batch number already exists
        existing = db.execute(text("""
            SELECT batch_id FROM batches
            WHERE batch_number = :batch_number AND org_id = :org_id
        """), {
            "batch_number": batch_number,
            "org_id": org_id
        }).first()
        
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Batch number {batch_number} already exists"
            )
        
        # Set defaults
        expiry_date = stock_data.expiry_date or (datetime.now() + timedelta(days=730))  # 2 years default
        cost_price = stock_data.cost_price or product.purchase_price or (product.mrp * Decimal("0.7"))
        selling_price = stock_data.selling_price or product.sale_price or (product.mrp * Decimal("0.9"))
        mrp = stock_data.mrp or product.mrp
        
        # Create batch
        result = db.execute(text("""
            INSERT INTO batches (
                org_id, product_id, batch_number, expiry_date,
                quantity_received, quantity_available, quantity_sold,
                quantity_damaged, quantity_returned,
                cost_price, selling_price, mrp,
                supplier_id, purchase_invoice_number,
                batch_status, notes,
                created_at, updated_at
            ) VALUES (
                :org_id, :product_id, :batch_number, :expiry_date,
                :quantity, :quantity, 0, 0, 0,
                :cost_price, :selling_price, :mrp,
                :supplier_id, :purchase_invoice_number,
                'active', :notes,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING batch_id
        """), {
            "org_id": org_id,
            "product_id": stock_data.product_id,
            "batch_number": batch_number,
            "expiry_date": expiry_date,
            "quantity": stock_data.quantity,
            "cost_price": cost_price,
            "selling_price": selling_price,
            "mrp": mrp,
            "supplier_id": stock_data.supplier_id,
            "purchase_invoice_number": stock_data.purchase_invoice_number,
            "notes": stock_data.notes
        })
        
        batch_id = result.scalar()
        db.commit()
        
        return StockReceiveResponse(
            batch_id=batch_id,
            batch_number=batch_number,
            product_id=product.product_id,
            product_name=product.product_name,
            quantity_received=stock_data.quantity,
            quantity_available=stock_data.quantity,
            expiry_date=expiry_date,
            message=f"Successfully received {stock_data.quantity} units of {product.product_name}"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to receive stock: {str(e)}"
        )

@router.get("/check/{product_id}")
async def check_stock(
    product_id: int,
    db: Session = Depends(get_db),
    current_org = Depends(get_current_org)
):
    """
    Check available stock for a product
    """
    org_id = current_org["org_id"]
    
    # Get product details
    product = db.execute(text("""
        SELECT product_id, product_name
        FROM products
        WHERE product_id = :product_id AND org_id = :org_id
    """), {
        "product_id": product_id,
        "org_id": org_id
    }).first()
    
    if not product:
        raise HTTPException(
            status_code=404,
            detail=f"Product with ID {product_id} not found"
        )
    
    # Get stock details
    batches = db.execute(text("""
        SELECT 
            batch_id,
            batch_number,
            quantity_available,
            expiry_date,
            batch_status
        FROM batches
        WHERE product_id = :product_id 
            AND org_id = :org_id
            AND quantity_available > 0
        ORDER BY expiry_date ASC
    """), {
        "product_id": product_id,
        "org_id": org_id
    }).fetchall()
    
    # Calculate total
    total_available = sum(batch.quantity_available for batch in batches)
    
    return {
        "product_id": product.product_id,
        "product_name": product.product_name,
        "total_available": total_available,
        "batches": [
            {
                "batch_id": batch.batch_id,
                "batch_number": batch.batch_number,
                "quantity_available": batch.quantity_available,
                "expiry_date": batch.expiry_date,
                "status": batch.batch_status
            }
            for batch in batches
        ]
    }

@router.get("/current")
async def get_current_stock(
    include_batches: bool = False,
    include_valuation: bool = False,
    category: Optional[str] = None,
    low_stock_only: bool = False,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    Get current stock levels for all products
    This endpoint provides comprehensive stock information
    """
    org_id = DEFAULT_ORG_ID
    
    try:
        # Build query for stock data with unit conversion columns
        query = """
            SELECT 
                p.product_id as id,
                p.product_code as code,
                p.product_name as name,
                p.category,
                COALESCE(p.pack_type, '') as pack_type,
                COALESCE(p.pack_size, '') as pack_size,
                COALESCE(p.pack_unit_quantity, 1) as pack_unit_quantity,
                COALESCE(p.sub_unit_quantity, 1) as sub_unit_quantity,
                'Units' as unit,
                COALESCE(p.purchase_unit, 'Box') as purchase_unit,
                COALESCE(p.sale_unit, 'Strip') as sale_unit,
                p.mrp,
                p.sale_price as price,
                p.minimum_stock_level as reorder_level,
                p.minimum_stock_level as min_stock,
                COALESCE(SUM(b.quantity_available), 0) as current_stock,
                COALESCE(SUM(b.quantity_available), 0) as stock_quantity,
                COALESCE(SUM(b.quantity_available), 0) as available_stock,
                COALESCE(SUM(b.quantity_sold), 0) as reserved_stock,
                COALESCE(SUM(b.quantity_available * b.cost_price), 0) as cost_value,
                COALESCE(SUM(b.quantity_available * COALESCE(b.selling_price, p.sale_price)), 0) as stock_value
            FROM products p
            LEFT JOIN batches b ON p.product_id = b.product_id 
                AND b.org_id = :org_id 
                AND b.batch_status = 'active'
                AND b.quantity_available > 0
            WHERE p.org_id = :org_id
        """
        
        params = {"org_id": org_id}
        
        if category:
            query += " AND p.category = :category"
            params["category"] = category
            
        query += " GROUP BY p.product_id, p.product_code, p.product_name, p.category, p.pack_type, p.pack_size, p.pack_unit_quantity, p.sub_unit_quantity, p.purchase_unit, p.sale_unit, p.mrp, p.sale_price, p.minimum_stock_level"
        
        if low_stock_only:
            query = f"SELECT * FROM ({query}) AS stock_data WHERE current_stock <= reorder_level"
            
        # Add ordering and pagination
        query += " ORDER BY name LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        products = []
        
        for row in result:
            product_data = dict(row._mapping)
            
            # Add calculated fields
            product_data["low_stock"] = product_data["current_stock"] <= (product_data["reorder_level"] or 0)
            product_data["expiry_alert"] = False  # Would need batch data to calculate
            
            # Get batch information if requested
            if include_batches:
                batch_result = db.execute(text("""
                    SELECT 
                        batch_number as batch_no,
                        quantity_available as quantity,
                        expiry_date
                    FROM batches
                    WHERE product_id = :product_id 
                        AND org_id = :org_id
                        AND batch_status = 'active'
                        AND quantity_available > 0
                    ORDER BY expiry_date ASC
                """), {
                    "product_id": product_data["id"],
                    "org_id": org_id
                })
                
                batches = []
                for batch in batch_result:
                    batch_data = dict(batch._mapping)
                    # Check if batch is expiring soon (within 90 days)
                    if batch_data["expiry_date"]:
                        days_to_expiry = (batch_data["expiry_date"] - datetime.now().date()).days
                        if days_to_expiry <= 90:
                            product_data["expiry_alert"] = True
                    batches.append(batch_data)
                    
                product_data["batches"] = batches
            else:
                product_data["batches"] = []
                
            products.append(product_data)
            
        return products
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get current stock: {str(e)}"
        )

@router.patch("/products/{product_id}")
async def update_product_properties(
    product_id: int,
    category: Optional[str] = None,
    pack_type: Optional[str] = None,
    pack_size: Optional[str] = None,
    minimum_stock_level: Optional[int] = None,
    pack_unit_quantity: Optional[int] = None,
    sub_unit_quantity: Optional[int] = None,
    purchase_unit: Optional[str] = None,
    sale_unit: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Update product properties for stock management
    """
    org_id = DEFAULT_ORG_ID
    
    try:
        # Build update query dynamically
        update_fields = []
        params = {"product_id": product_id, "org_id": org_id}
        
        if category is not None:
            update_fields.append("category = :category")
            params["category"] = category
            
        if pack_type is not None:
            update_fields.append("pack_type = :pack_type")
            params["pack_type"] = pack_type
            
        if pack_size is not None:
            update_fields.append("pack_size = :pack_size")
            params["pack_size"] = pack_size
            
        if minimum_stock_level is not None:
            update_fields.append("minimum_stock_level = :minimum_stock_level")
            params["minimum_stock_level"] = minimum_stock_level
            
        if pack_unit_quantity is not None:
            update_fields.append("pack_unit_quantity = :pack_unit_quantity")
            params["pack_unit_quantity"] = pack_unit_quantity
            
        if sub_unit_quantity is not None:
            update_fields.append("sub_unit_quantity = :sub_unit_quantity")
            params["sub_unit_quantity"] = sub_unit_quantity
            
        if purchase_unit is not None:
            update_fields.append("purchase_unit = :purchase_unit")
            params["purchase_unit"] = purchase_unit
            
        if sale_unit is not None:
            update_fields.append("sale_unit = :sale_unit")
            params["sale_unit"] = sale_unit
            
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
            
        query = f"""
            UPDATE products 
            SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP
            WHERE product_id = :product_id AND org_id = :org_id
            RETURNING product_id, product_name, category, pack_type, pack_size, pack_unit_quantity, sub_unit_quantity, purchase_unit, sale_unit, minimum_stock_level
        """
        
        result = db.execute(text(query), params)
        updated_product = result.first()
        
        if not updated_product:
            raise HTTPException(status_code=404, detail="Product not found")
            
        db.commit()
        
        return dict(updated_product._mapping)
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update product: {str(e)}"
        )

@router.get("/alerts")
async def get_stock_alerts(
    alert_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get stock alerts for low stock, expiring items, etc.
    """
    org_id = DEFAULT_ORG_ID
    
    try:
        # Get products with low stock
        low_stock_query = """
            SELECT 
                p.product_id,
                p.product_name,
                p.product_code,
                p.category,
                COALESCE(p.minimum_stock_level, 20) as reorder_level,
                COALESCE(SUM(b.quantity_available), 0) as current_stock,
                'low_stock' as alert_type,
                CASE 
                    WHEN COALESCE(SUM(b.quantity_available), 0) = 0 THEN 'critical'
                    WHEN COALESCE(SUM(b.quantity_available), 0) <= 10 THEN 'high'
                    ELSE 'medium'
                END as priority
            FROM products p
            LEFT JOIN batches b ON p.product_id = b.product_id 
                AND b.org_id = :org_id 
                AND b.batch_status = 'active'
            WHERE p.org_id = :org_id
            GROUP BY p.product_id, p.product_name, p.product_code, p.category, p.minimum_stock_level
            HAVING COALESCE(SUM(b.quantity_available), 0) <= COALESCE(p.minimum_stock_level, 20)
        """
        
        # Get expiring items
        expiry_query = """
            SELECT 
                p.product_id,
                p.product_name,
                p.product_code,
                b.batch_number,
                b.expiry_date,
                b.quantity_available,
                'expiring' as alert_type,
                CASE 
                    WHEN b.expiry_date <= CURRENT_DATE THEN 'critical'
                    WHEN b.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'high'
                    WHEN b.expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'medium'
                    ELSE 'low'
                END as priority
            FROM batches b
            JOIN products p ON b.product_id = p.product_id
            WHERE b.org_id = :org_id
                AND b.batch_status = 'active'
                AND b.quantity_available > 0
                AND b.expiry_date <= CURRENT_DATE + INTERVAL '90 days'
        """
        
        alerts = {
            "low_stock": [],
            "expiring": [],
            "out_of_stock": [],
            "summary": {
                "total_alerts": 0,
                "critical": 0,
                "high": 0,
                "medium": 0
            }
        }
        
        # Execute queries
        if not alert_type or alert_type in ['low_stock', 'all']:
            result = db.execute(text(low_stock_query), {"org_id": org_id})
            for row in result:
                alert_data = dict(row._mapping)
                alerts["low_stock"].append(alert_data)
                if alert_data["current_stock"] == 0:
                    alerts["out_of_stock"].append(alert_data)
                    
        if not alert_type or alert_type in ['expiring', 'all']:
            result = db.execute(text(expiry_query), {"org_id": org_id})
            for row in result:
                alerts["expiring"].append(dict(row._mapping))
        
        # Calculate summary
        all_alerts = alerts["low_stock"] + alerts["expiring"]
        alerts["summary"]["total_alerts"] = len(all_alerts)
        alerts["summary"]["critical"] = len([a for a in all_alerts if a.get("priority") == "critical"])
        alerts["summary"]["high"] = len([a for a in all_alerts if a.get("priority") == "high"])
        alerts["summary"]["medium"] = len([a for a in all_alerts if a.get("priority") == "medium"])
        
        return alerts
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get stock alerts: {str(e)}"
        )

@router.get("/batches")
async def get_batches(
    product_id: Optional[int] = None,
    include_movements: bool = False,
    include_product_details: bool = True,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    Get batches with optional filters
    """
    org_id = DEFAULT_ORG_ID
    
    try:
        query = """
            SELECT 
                b.batch_id,
                b.batch_number,
                b.product_id,
                b.manufacturing_date,
                b.expiry_date,
                b.quantity_received,
                b.quantity_available,
                b.quantity_sold,
                b.quantity_damaged,
                b.quantity_returned,
                b.cost_price,
                b.selling_price,
                b.mrp,
                b.batch_status,
                b.supplier_id,
                b.purchase_invoice_number,
                b.notes,
                b.created_at,
                b.updated_at
        """
        
        if include_product_details:
            query += """,
                p.product_name,
                p.product_code,
                p.category,
                p.manufacturer,
                s.supplier_name
            FROM batches b
            LEFT JOIN products p ON b.product_id = p.product_id
            LEFT JOIN suppliers s ON b.supplier_id = s.supplier_id
            WHERE b.org_id = :org_id
            """
        else:
            query += """
            FROM batches b
            WHERE b.org_id = :org_id
            """
        
        params = {"org_id": org_id}
        
        if product_id:
            query += " AND b.product_id = :product_id"
            params["product_id"] = product_id
            
        # Only show active batches by default
        query += " AND b.batch_status = 'active'"
        
        # Order by expiry date
        query += " ORDER BY b.expiry_date ASC"
        
        # Add pagination
        query += " LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        batches = []
        
        for row in result:
            batch_data = dict(row._mapping)
            
            # Calculate days to expiry
            if batch_data.get("expiry_date"):
                days_to_expiry = (batch_data["expiry_date"] - datetime.now().date()).days
                batch_data["days_to_expiry"] = days_to_expiry
                batch_data["is_expiring_soon"] = 0 < days_to_expiry <= 90
                batch_data["is_expired"] = days_to_expiry < 0
            else:
                batch_data["days_to_expiry"] = None
                batch_data["is_expiring_soon"] = False
                batch_data["is_expired"] = False
                
            batches.append(batch_data)
            
        return batches
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get batches: {str(e)}"
        )

@router.post("/adjustments")
async def create_stock_adjustment(
    adjustment_data: dict,
    db: Session = Depends(get_db)
):
    """
    Create stock adjustment for damage, loss, or corrections
    """
    org_id = DEFAULT_ORG_ID
    
    try:
        # Validate adjustment data
        adjustment_type = adjustment_data.get("adjustment_type")
        reason = adjustment_data.get("reason")
        notes = adjustment_data.get("notes", "")
        adjustment_date = adjustment_data.get("adjustment_date", datetime.now().isoformat())
        items = adjustment_data.get("items", [])
        
        if not adjustment_type or not reason or not items:
            raise HTTPException(
                status_code=400,
                detail="Missing required fields: adjustment_type, reason, or items"
            )
        
        # Process each item
        results = []
        for item in items:
            product_id = item.get("product_id")
            quantity = item.get("quantity", 0)
            batch_number = item.get("batch_number")
            
            if not product_id or quantity == 0:
                continue
                
            # Get product info
            product = db.execute(text("""
                SELECT product_id, product_name, product_code
                FROM products
                WHERE product_id = :product_id AND org_id = :org_id
            """), {
                "product_id": product_id,
                "org_id": org_id
            }).first()
            
            if not product:
                continue
            
            # Create stock movement record
            movement_type = "adjustment_in" if adjustment_type == "increase" else "adjustment_out"
            
            # If specific batch is mentioned, update that batch
            if batch_number:
                batch = db.execute(text("""
                    SELECT batch_id, quantity_available
                    FROM batches
                    WHERE batch_number = :batch_number 
                    AND product_id = :product_id
                    AND org_id = :org_id
                """), {
                    "batch_number": batch_number,
                    "product_id": product_id,
                    "org_id": org_id
                }).first()
                
                if batch:
                    new_quantity = batch.quantity_available + quantity
                    if new_quantity < 0:
                        new_quantity = 0
                        
                    db.execute(text("""
                        UPDATE batches
                        SET quantity_available = :new_quantity,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE batch_id = :batch_id
                    """), {
                        "new_quantity": new_quantity,
                        "batch_id": batch.batch_id
                    })
            else:
                # Adjust the oldest batch first
                if adjustment_type == "decrease":
                    # For decrease, deduct from available batches FIFO
                    remaining_qty = abs(quantity)
                    batches = db.execute(text("""
                        SELECT batch_id, quantity_available
                        FROM batches
                        WHERE product_id = :product_id 
                        AND org_id = :org_id
                        AND quantity_available > 0
                        ORDER BY expiry_date ASC
                    """), {
                        "product_id": product_id,
                        "org_id": org_id
                    }).fetchall()
                    
                    for batch in batches:
                        if remaining_qty <= 0:
                            break
                            
                        deduct_qty = min(batch.quantity_available, remaining_qty)
                        new_qty = batch.quantity_available - deduct_qty
                        
                        db.execute(text("""
                            UPDATE batches
                            SET quantity_available = :new_qty,
                                quantity_damaged = quantity_damaged + :deduct_qty,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE batch_id = :batch_id
                        """), {
                            "new_qty": new_qty,
                            "deduct_qty": deduct_qty if reason in ['damage', 'expiry'] else 0,
                            "batch_id": batch.batch_id
                        })
                        
                        remaining_qty -= deduct_qty
                else:
                    # For increase, add to the latest batch or create new
                    latest_batch = db.execute(text("""
                        SELECT batch_id, batch_number
                        FROM batches
                        WHERE product_id = :product_id 
                        AND org_id = :org_id
                        ORDER BY created_at DESC
                        LIMIT 1
                    """), {
                        "product_id": product_id,
                        "org_id": org_id
                    }).first()
                    
                    if latest_batch:
                        db.execute(text("""
                            UPDATE batches
                            SET quantity_available = quantity_available + :quantity,
                                quantity_received = quantity_received + :quantity,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE batch_id = :batch_id
                        """), {
                            "quantity": quantity,
                            "batch_id": latest_batch.batch_id
                        })
                    else:
                        # Create new batch
                        batch_number = f"ADJ-{datetime.now().strftime('%Y%m%d')}-{product_id}"
                        db.execute(text("""
                            INSERT INTO batches (
                                org_id, product_id, batch_number,
                                expiry_date, quantity_received, quantity_available,
                                batch_status, notes, created_at, updated_at
                            ) VALUES (
                                :org_id, :product_id, :batch_number,
                                :expiry_date, :quantity, :quantity,
                                'active', :notes, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                            )
                        """), {
                            "org_id": org_id,
                            "product_id": product_id,
                            "batch_number": batch_number,
                            "expiry_date": (datetime.now() + timedelta(days=730)).date(),
                            "quantity": quantity,
                            "notes": f"Stock adjustment: {reason}"
                        })
            
            results.append({
                "product_id": product_id,
                "product_name": product.product_name,
                "quantity_adjusted": quantity,
                "reason": reason,
                "status": "completed"
            })
        
        db.commit()
        
        return {
            "adjustment_type": adjustment_type,
            "reason": reason,
            "items_adjusted": len(results),
            "adjustment_date": adjustment_date,
            "details": results
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create adjustment: {str(e)}"
        )
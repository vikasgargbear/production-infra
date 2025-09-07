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

from ...core.database import get_db
from ...core.auth_utils import get_org_id_from_header
from ...dependencies import get_current_org

# Default org ID for now

router = APIRouter(
    tags=["stock"]
)

@router.get("/")
async def stock_overview(db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)):
    """Get stock overview and available operations"""
    try:
        # Simple stock stats
        result = db.execute(text("""
            SELECT 
                COUNT(DISTINCT product_id) as total_products,
                SUM(quantity_available) as total_quantity,
                COUNT(*) as total_batches,
                COUNT(CASE WHEN batch_status = 'active' THEN 1 END) as active_batches
            FROM inventory.batches
        """)).fetchone()
        
        return {
            "status": "Stock management service available",
            "total_products": result.total_products if result else 0,
            "total_quantity": int(result.total_quantity) if result and result.total_quantity else 0,
            "total_batches": result.total_batches if result else 0,
            "active_batches": result.active_batches if result else 0,
            "operations": ["Stock Receive", "Batch Management", "Stock Adjustments"]
        }
    except Exception as e:
        return {
            "status": "Stock management service available",
            "operations": ["Stock Receive", "Batch Management", "Stock Adjustments"],
            "error": "Could not load statistics"
        }

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
    # Pack configuration at batch level
    pack_type: Optional[str] = Field(None, description="Pack type (strip, box, bottle)")
    pack_size: Optional[int] = Field(None, description="Pack size (10, 100, etc)")
    pack_uom: Optional[str] = Field(None, description="Pack unit of measure")
    base_uom: Optional[str] = Field(None, description="Base unit of measure")
    units_per_pack: Optional[int] = Field(None, description="Units per pack")
    category_name: Optional[str] = Field(None, description="Product category")

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
,
):
    """
    Receive stock for a product by creating a new batch
    """
    org_id = current_org["org_id"]
    
    try:
        # Get product details
        product = db.execute(text("""
            SELECT product_id, product_name, mrp, sale_price, purchase_price
            FROM inventory.products
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
            SELECT batch_id FROM inventory.batches
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
        
        # Create batch with pack configuration and category
        result = db.execute(text("""
            INSERT INTO inventory.batches (
                org_id, product_id, batch_number, expiry_date,
                quantity_received, quantity_available, quantity_sold,
                quantity_damaged, quantity_returned,
                cost_price, selling_price, mrp,
                supplier_id, purchase_invoice_number,
                batch_status, notes,
                pack_type, pack_size, pack_uom, base_uom, units_per_pack,
                category_name, quality_status,
                created_at, updated_at
            ) VALUES (
                :org_id, :product_id, :batch_number, :expiry_date,
                :quantity, :quantity, 0, 0, 0,
                :cost_price, :selling_price, :mrp,
                :supplier_id, :purchase_invoice_number,
                'active', :notes,
                :pack_type, :pack_size, :pack_uom, :base_uom, :units_per_pack,
                :category_name, 'approved',
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
            "notes": stock_data.notes,
            # Pack configuration
            "pack_type": stock_data.pack_type or 'unit',
            "pack_size": stock_data.pack_size or 1,
            "pack_uom": stock_data.pack_uom or 'UNIT',
            "base_uom": stock_data.base_uom or 'UNIT',
            "units_per_pack": stock_data.units_per_pack or 1,
            "category_name": stock_data.category_name or 'General'
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
,
):
    """
    Check available stock for a product
    """
    org_id = current_org["org_id"]
    
    # Get product details
    product = db.execute(text("""
        SELECT product_id, product_name
        FROM inventory.products
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
        FROM inventory.batches
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
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get current stock levels for all products
    This endpoint provides comprehensive stock information
    """
    
    try:
        # Build query for stock data with batch-level pack configuration
        query = """
            WITH batch_summary AS (
                SELECT 
                    product_id,
                    SUM(quantity_available) as total_stock,
                    SUM(quantity_reserved) as total_reserved,
                    SUM(quantity_available * cost_per_unit) as total_cost_value,
                    SUM(quantity_available * COALESCE(sale_price_per_unit, 0)) as total_stock_value,
                    AVG(mrp_per_unit) as avg_mrp,
                    AVG(sale_price_per_unit) as avg_sale_price,
                    -- Get pack config from most recent batch
                    FIRST_VALUE(pack_type) OVER (PARTITION BY product_id ORDER BY batch_id DESC) as pack_type,
                    FIRST_VALUE(pack_size) OVER (PARTITION BY product_id ORDER BY batch_id DESC) as pack_size,
                    FIRST_VALUE(units_per_pack) OVER (PARTITION BY product_id ORDER BY batch_id DESC) as pack_unit_quantity,
                    FIRST_VALUE(tablets_per_strip) OVER (PARTITION BY product_id ORDER BY batch_id DESC) as sub_unit_quantity,
                    FIRST_VALUE(pack_uom) OVER (PARTITION BY product_id ORDER BY batch_id DESC) as purchase_unit,
                    FIRST_VALUE(base_uom) OVER (PARTITION BY product_id ORDER BY batch_id DESC) as sale_unit,
                    FIRST_VALUE(category_name) OVER (PARTITION BY product_id ORDER BY batch_id DESC) as category_name,
                    ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY batch_id DESC) as rn
                FROM inventory.batches
                WHERE org_id = :org_id AND batch_status = 'active' AND quality_status = 'approved'
                GROUP BY product_id, batch_id, pack_type, pack_size, units_per_pack, tablets_per_strip, pack_uom, base_uom, category_name
            )
            SELECT 
                p.product_id as id,
                p.product_code as code,
                p.product_name as name,
                p.category_id,
                COALESCE(bs.pack_type, 'unit') as pack_type,
                COALESCE(bs.pack_size, 1) as pack_size,
                COALESCE(bs.pack_unit_quantity, 1) as pack_unit_quantity,
                COALESCE(bs.sub_unit_quantity, 1) as sub_unit_quantity,
                COALESCE(bs.sale_unit, 'Units') as unit,
                COALESCE(bs.purchase_unit, 'Box') as purchase_unit,
                bs.sale_unit as sale_unit,  -- No default unit
                COALESCE(bs.category_name, 'General') as category,
                COALESCE(bs.avg_mrp, 0) as mrp,
                COALESCE(bs.avg_sale_price, 0) as price,
                p.min_stock_quantity as reorder_level,
                p.min_stock_quantity as min_stock,
                COALESCE(bs.total_stock, 0) as current_stock,
                COALESCE(bs.total_stock, 0) as stock_quantity,
                COALESCE(bs.total_stock, 0) as available_stock,
                COALESCE(bs.total_reserved, 0) as reserved_stock,
                COALESCE(bs.total_cost_value, 0) as cost_value,
                COALESCE(bs.total_stock_value, 0) as stock_value
            FROM inventory.products p
            LEFT JOIN batch_summary bs ON p.product_id = bs.product_id AND bs.rn = 1
            WHERE p.org_id = :org_id
        """
        
        params = {"org_id": org_id}
        
        if category:
            query += " AND (p.category_id = :category OR bs.category_name = :category)"
            params["category"] = category
        
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
                    FROM inventory.batches
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
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Update product properties for stock management
    """
    
    try:
        # Build update query dynamically
        update_fields = []
        params = {"product_id": product_id, "org_id": org_id}
        
        # Note: category, pack_type, pack_size are now stored in batches table
        # These updates will be handled by the batch update endpoint
        if category is not None or pack_type is not None or pack_size is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pack configuration and category updates should use /batches/product/{product_id} endpoint"
            )
            
        if minimum_stock_level is not None:
            update_fields.append("minimum_stock_level = :minimum_stock_level")
            params["minimum_stock_level"] = minimum_stock_level
            
        # Note: pack_unit_quantity, sub_unit_quantity, purchase_unit, sale_unit are now in batches table
        if (pack_unit_quantity is not None or sub_unit_quantity is not None or 
            purchase_unit is not None or sale_unit is not None):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pack configuration updates should use /batches/product/{product_id} endpoint"
            )
            
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
            
        query = f"""
            UPDATE inventory.products 
            SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP
            WHERE product_id = :product_id AND org_id = :org_id
            RETURNING product_id, product_name, min_stock_quantity as minimum_stock_level
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
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get stock alerts for low stock, expiring items, etc.
    """
    
    try:
        # Get products with low stock
        low_stock_query = """
            SELECT 
                p.product_id,
                p.product_name,
                p.product_code,
                p.category_id,
                COALESCE(p.minimum_stock_level, 20) as reorder_level,
                COALESCE(SUM(b.quantity_available), 0) as current_stock,
                'low_stock' as alert_type,
                CASE 
                    WHEN COALESCE(SUM(b.quantity_available), 0) = 0 THEN 'critical'
                    WHEN COALESCE(SUM(b.quantity_available), 0) <= 10 THEN 'high'
                    ELSE 'medium'
                END as priority
            FROM inventory.products p
            LEFT JOIN inventory.batches b ON p.product_id = b.product_id 
                AND b.org_id = :org_id 
                AND b.batch_status = 'active'
            WHERE p.org_id = :org_id
            GROUP BY p.product_id, p.product_name, p.product_code, p.category_id, p.minimum_stock_level
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
            FROM inventory.batches b
            JOIN inventory.products p ON b.product_id = p.product_id
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
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get batches with optional filters
    """
    
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
                p.category_id,
                p.manufacturer,
                s.supplier_name
            FROM inventory.batches b
            LEFT JOIN inventory.products p ON b.product_id = p.product_id
            LEFT JOIN suppliers s ON b.supplier_id = s.supplier_id
            WHERE b.org_id = :org_id
            """
        else:
            query += """
            FROM inventory.batches b
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
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Create stock adjustment for damage, loss, or corrections
    """
    
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
                FROM inventory.products
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
                    FROM inventory.batches
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
                        UPDATE inventory.batches
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
                        FROM inventory.batches
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
                            UPDATE inventory.batches
                            SET quantity_available = :new_qty,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE batch_id = :batch_id
                        """), {
                            "new_qty": new_qty,
                            "batch_id": batch.batch_id
                        })
                        
                        remaining_qty -= deduct_qty
                else:
                    # For increase, add to the latest batch or create new
                    latest_batch = db.execute(text("""
                        SELECT batch_id, batch_number
                        FROM inventory.batches
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
                            UPDATE inventory.batches
                            SET quantity_available = quantity_available + :quantity,
                                initial_quantity = initial_quantity + :quantity,
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
                            INSERT INTO inventory.batches (
                                org_id, product_id, batch_number,
                                expiry_date, initial_quantity, quantity_available,
                                batch_status, mrp_per_unit, source_type, created_at, updated_at
                            ) VALUES (
                                :org_id, :product_id, :batch_number,
                                :expiry_date, :quantity, :quantity,
                                'active', 0, 'adjustment', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                            )
                        """), {
                            "org_id": org_id,
                            "product_id": product_id,
                            "batch_number": batch_number,
                            "expiry_date": (datetime.now() + timedelta(days=730)).date(),
                            "quantity": quantity
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
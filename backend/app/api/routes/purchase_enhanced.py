"""
Enhanced Purchase Order Management with Items Support
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import datetime
from decimal import Decimal

from ...database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/purchases-enhanced", tags=["purchases-enhanced"])

@router.post("/with-items")
def create_purchase_with_items(purchase_data: dict, db: Session = Depends(get_db)):
    """
    Create a purchase order with line items
    Supports both manual entry and parsed invoice data
    """
    try:
        # Generate purchase number
        purchase_number = f"PO-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        
        # Get supplier name first
        supplier_name = None
        if purchase_data.get("supplier_id"):
            supplier_result = db.execute(
                text("SELECT supplier_name FROM suppliers WHERE supplier_id = :id"),
                {"id": purchase_data.get("supplier_id")}
            ).first()
            if supplier_result:
                supplier_name = supplier_result.supplier_name
        
        # Create purchase header
        result = db.execute(
            text("""
                INSERT INTO purchases (
                    org_id, purchase_number, purchase_date,
                    supplier_id, supplier_name, supplier_invoice_number, supplier_invoice_date,
                    subtotal_amount, discount_amount, tax_amount, 
                    other_charges, final_amount, purchase_status,
                    payment_status, payment_mode, notes, created_by
                ) VALUES (
                    '12de5e22-eee7-4d25-b3a7-d16d01c6170f', -- Default org
                    :purchase_number, :purchase_date,
                    :supplier_id, :supplier_name, :invoice_number, :invoice_date,
                    :subtotal, :discount, :tax, :other_charges, :total,
                    :status, :payment_status, :payment_mode, :notes, :created_by
                ) RETURNING purchase_id
            """),
            {
                "purchase_number": purchase_number,
                "purchase_date": purchase_data.get("purchase_date", datetime.now().date()),
                "supplier_id": purchase_data.get("supplier_id"),
                "supplier_name": supplier_name,
                "invoice_number": purchase_data.get("supplier_invoice_number"),
                "invoice_date": purchase_data.get("supplier_invoice_date"),
                "subtotal": Decimal(str(purchase_data.get("subtotal_amount", 0))),
                "discount": Decimal(str(purchase_data.get("discount_amount", 0))),
                "tax": Decimal(str(purchase_data.get("tax_amount", 0))),
                "other_charges": Decimal(str(purchase_data.get("other_charges", 0))),
                "total": Decimal(str(purchase_data.get("final_amount", 0))),
                "status": purchase_data.get("purchase_status", "draft"),
                "payment_status": purchase_data.get("payment_status", "pending"),
                "payment_mode": purchase_data.get("payment_mode", "cash"),
                "notes": purchase_data.get("notes"),
                "created_by": purchase_data.get("created_by")
            }
        )
        
        purchase_id = result.scalar()
        
        # Create purchase items if provided
        items = purchase_data.get("items", [])
        items_created = 0
        
        for item in items:
            # Calculate item totals if not provided
            quantity = Decimal(str(item.get("ordered_quantity", 0)))
            cost_price = Decimal(str(item.get("cost_price", 0)))
            discount_percent = Decimal(str(item.get("discount_percent", 0)))
            tax_percent = Decimal(str(item.get("tax_percent", 0)))
            
            # Calculate amounts
            subtotal = quantity * cost_price
            discount_amount = subtotal * discount_percent / 100
            taxable_amount = subtotal - discount_amount
            tax_amount = taxable_amount * tax_percent / 100
            total_price = taxable_amount + tax_amount
            
            # Generate batch number if not provided
            batch_number = item.get("batch_number")
            if not batch_number or batch_number.strip() == "":
                # Generate batch number: BATCH + YYMM + Random 4 digits
                batch_number = f"BATCH{datetime.now().strftime('%y%m')}{str(db.execute(text('SELECT floor(random() * 10000)::int')).scalar()).zfill(4)}"
            
            db.execute(
                text("""
                    INSERT INTO purchase_items (
                        purchase_id, product_id, product_name,
                        ordered_quantity, received_quantity, free_quantity,
                        purchase_uom, base_quantity,
                        cost_price, selling_price, mrp,
                        discount_percent, discount_amount,
                        tax_percent, tax_amount, total_price,
                        batch_number, manufacturing_date, expiry_date,
                        item_status, notes
                    ) VALUES (
                        :purchase_id, :product_id, :product_name,
                        :ordered_qty, :received_qty, :free_qty,
                        :uom, :base_qty,
                        :cost_price, :selling_price, :mrp,
                        :disc_percent, :disc_amount,
                        :tax_percent, :tax_amount, :total,
                        :batch_number, :mfg_date, :exp_date,
                        :status, :notes
                    )
                """),
                {
                    "purchase_id": purchase_id,
                    "product_id": item.get("product_id"),
                    "product_name": item.get("product_name"),
                    "ordered_qty": quantity,
                    "received_qty": item.get("received_quantity", 0),
                    "free_qty": item.get("free_quantity", 0),
                    "uom": item.get("purchase_uom", "NOS"),
                    "base_qty": item.get("base_quantity", quantity),
                    "cost_price": cost_price,
                    "selling_price": Decimal(str(item.get("selling_price", item.get("mrp", 0)))),
                    "mrp": Decimal(str(item.get("mrp", 0))),
                    "disc_percent": discount_percent,
                    "disc_amount": discount_amount,
                    "tax_percent": tax_percent,
                    "tax_amount": tax_amount,
                    "total": total_price,
                    "batch_number": batch_number,
                    "mfg_date": item.get("manufacturing_date"),
                    "exp_date": item.get("expiry_date"),
                    "status": item.get("item_status", "pending"),
                    "notes": item.get("notes")
                }
            )
            items_created += 1
        
        db.commit()
        
        return {
            "purchase_id": purchase_id,
            "purchase_number": purchase_number,
            "items_created": items_created,
            "message": "Purchase order created successfully"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating purchase with items: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create purchase: {str(e)}")

@router.get("/{purchase_id}/items")
def get_purchase_items(purchase_id: int, db: Session = Depends(get_db)):
    """Get all items for a purchase order"""
    try:
        items = db.execute(
            text("""
                SELECT 
                    pi.*,
                    p.product_name as product_full_name,
                    p.hsn_code,
                    p.category,
                    p.brand_name
                FROM purchase_items pi
                LEFT JOIN products p ON pi.product_id = p.product_id
                WHERE pi.purchase_id = :purchase_id
                ORDER BY pi.purchase_item_id
            """),
            {"purchase_id": purchase_id}
        ).fetchall()
        
        return [dict(item._mapping) for item in items]
        
    except Exception as e:
        logger.error(f"Error fetching purchase items: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get purchase items: {str(e)}")

@router.put("/{purchase_id}/items/{item_id}")
def update_purchase_item(
    purchase_id: int,
    item_id: int,
    item_data: dict,
    db: Session = Depends(get_db)
):
    """Update a purchase item"""
    try:
        # Verify item belongs to purchase
        check = db.execute(
            text("""
                SELECT purchase_item_id 
                FROM purchase_items 
                WHERE purchase_item_id = :item_id 
                AND purchase_id = :purchase_id
            """),
            {"item_id": item_id, "purchase_id": purchase_id}
        ).first()
        
        if not check:
            raise HTTPException(status_code=404, detail="Purchase item not found")
        
        # Update item
        updates = []
        params = {"item_id": item_id}
        
        allowed_fields = [
            "received_quantity", "free_quantity", "damaged_quantity",
            "batch_number", "manufacturing_date", "expiry_date",
            "item_status", "notes"
        ]
        
        for field in allowed_fields:
            if field in item_data:
                updates.append(f"{field} = :{field}")
                params[field] = item_data[field]
        
        if updates:
            db.execute(
                text(f"""
                    UPDATE purchase_items 
                    SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP
                    WHERE purchase_item_id = :item_id
                """),
                params
            )
            db.commit()
        
        return {"message": "Purchase item updated successfully"}
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating purchase item: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update purchase item: {str(e)}")

@router.post("/{purchase_id}/receive")
def receive_purchase_items(
    purchase_id: int,
    receive_data: dict,
    db: Session = Depends(get_db)
):
    """
    Receive items from a purchase order
    Creates batches and updates inventory
    """
    try:
        # Get purchase details
        purchase = db.execute(
            text("SELECT * FROM purchases WHERE purchase_id = :id"),
            {"id": purchase_id}
        ).first()
        
        if not purchase:
            raise HTTPException(status_code=404, detail="Purchase not found")
        
        if purchase.purchase_status == "received":
            raise HTTPException(status_code=400, detail="Purchase already received")
        
        received_items = receive_data.get("items", [])
        batches_created = 0
        
        for item in received_items:
            item_id = item.get("purchase_item_id")
            received_qty = item.get("received_quantity", 0)
            
            if received_qty <= 0:
                continue
            
            # Get purchase item details
            pi = db.execute(
                text("""
                    SELECT * FROM purchase_items 
                    WHERE purchase_item_id = :item_id 
                    AND purchase_id = :purchase_id
                """),
                {"item_id": item_id, "purchase_id": purchase_id}
            ).first()
            
            if not pi:
                continue
            
            # Create batch
            batch_id = db.execute(
                text("""
                    INSERT INTO batches (
                        org_id, product_id, batch_number,
                        manufacturing_date, expiry_date,
                        quantity_received, quantity_available,
                        cost_price, selling_price, mrp,
                        supplier_id, purchase_id,
                        purchase_invoice_number,
                        batch_status
                    ) VALUES (
                        '12de5e22-eee7-4d25-b3a7-d16d01c6170f',
                        :product_id, :batch_number,
                        :mfg_date, :exp_date,
                        :qty_received, :qty_available,
                        :cost, :selling, :mrp,
                        :supplier_id, :purchase_id,
                        :invoice_num,
                        'active'
                    ) RETURNING batch_id
                """),
                {
                    "product_id": pi.product_id,
                    "batch_number": item.get("batch_number", pi.batch_number),
                    "mfg_date": item.get("manufacturing_date", pi.manufacturing_date),
                    "exp_date": item.get("expiry_date", pi.expiry_date),
                    "qty_received": received_qty,
                    "qty_available": received_qty,
                    "cost": pi.cost_price,
                    "selling": pi.cost_price * Decimal("1.2"),  # Default 20% markup
                    "mrp": pi.mrp,
                    "supplier_id": purchase.supplier_id,
                    "purchase_id": purchase_id,
                    "invoice_num": purchase.supplier_invoice_number
                }
            ).scalar()
            
            # Create inventory movement
            db.execute(
                text("""
                    INSERT INTO inventory_movements (
                        org_id, movement_date, movement_type,
                        product_id, batch_id,
                        quantity_in, quantity_out,
                        reference_type, reference_id, reference_number,
                        notes
                    ) VALUES (
                        '12de5e22-eee7-4d25-b3a7-d16d01c6170f',
                        CURRENT_TIMESTAMP, 'purchase',
                        :product_id, :batch_id,
                        :qty_in, 0,
                        'purchase', :purchase_id, :purchase_number,
                        'Goods received from purchase'
                    )
                """),
                {
                    "product_id": pi.product_id,
                    "batch_id": batch_id,
                    "qty_in": received_qty,
                    "purchase_id": purchase_id,
                    "purchase_number": purchase.purchase_number
                }
            )
            
            # Update purchase item
            db.execute(
                text("""
                    UPDATE purchase_items 
                    SET received_quantity = :received_qty,
                        item_status = 'received'
                    WHERE purchase_item_id = :item_id
                """),
                {"received_qty": received_qty, "item_id": item_id}
            )
            
            batches_created += 1
        
        # Update purchase status
        db.execute(
            text("""
                UPDATE purchases 
                SET purchase_status = 'received',
                    grn_number = :grn_number,
                    grn_date = CURRENT_DATE
                WHERE purchase_id = :purchase_id
            """),
            {
                "grn_number": f"GRN-{purchase.purchase_number}",
                "purchase_id": purchase_id
            }
        )
        
        db.commit()
        
        return {
            "message": "Purchase items received successfully",
            "batches_created": batches_created,
            "grn_number": f"GRN-{purchase.purchase_number}"
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error receiving purchase items: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to receive items: {str(e)}")

@router.post("/{purchase_id}/receive-fixed")
def receive_purchase_items_fixed(
    purchase_id: int,
    receive_data: dict,
    db: Session = Depends(get_db)
):
    """
    Receive items - Fixed version that works with auto batch trigger
    Only updates purchase items and status, lets trigger create batches
    """
    try:
        # Get purchase
        purchase = db.execute(
            text("SELECT * FROM purchases WHERE purchase_id = :id"),
            {"id": purchase_id}
        ).first()
        
        if not purchase:
            raise HTTPException(status_code=404, detail="Purchase not found")
        
        if purchase.purchase_status == "received":
            raise HTTPException(status_code=400, detail="Purchase already received")
        
        # Update purchase items
        for item in receive_data.get("items", []):
            item_id = item.get("purchase_item_id")
            received_qty = item.get("received_quantity", 0)
            
            if received_qty <= 0:
                continue
            
            # Update item
            update_fields = ["received_quantity = :received_quantity"]
            params = {
                "item_id": item_id,
                "purchase_id": purchase_id,
                "received_quantity": received_qty
            }
            
            if item.get("batch_number"):
                update_fields.append("batch_number = :batch_number")
                params["batch_number"] = item["batch_number"]
            
            if item.get("expiry_date"):
                update_fields.append("expiry_date = :expiry_date")
                params["expiry_date"] = item["expiry_date"]
            
            db.execute(
                text(f"""
                    UPDATE purchase_items 
                    SET {', '.join(update_fields)},
                        item_status = 'received'
                    WHERE purchase_item_id = :item_id 
                    AND purchase_id = :purchase_id
                """),
                params
            )
        
        # Update purchase status - trigger will create batches
        grn_number = f"GRN-{purchase.purchase_number}"
        
        db.execute(
            text("""
                UPDATE purchases 
                SET purchase_status = 'received',
                    grn_number = :grn_number,
                    grn_date = CURRENT_DATE
                WHERE purchase_id = :purchase_id
            """),
            {"grn_number": grn_number, "purchase_id": purchase_id}
        )
        
        db.commit()
        
        # Count created batches
        batch_count = db.execute(
            text("SELECT COUNT(*) FROM batches WHERE purchase_id = :id"),
            {"id": purchase_id}
        ).scalar()
        
        return {
            "message": "Purchase received successfully",
            "purchase_id": purchase_id,
            "grn_number": grn_number,
            "batches_created": batch_count,
            "note": "Batches auto-created with generated numbers if needed"
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/pending-receipts")
def get_pending_receipts(
    supplier_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """Get purchases pending receipt"""
    try:
        query = """
            SELECT 
                p.*,
                s.supplier_name,
                COUNT(pi.purchase_item_id) as total_items,
                COUNT(CASE WHEN pi.received_quantity > 0 THEN 1 END) as received_items
            FROM purchases p
            JOIN suppliers s ON p.supplier_id = s.supplier_id
            LEFT JOIN purchase_items pi ON p.purchase_id = pi.purchase_id
            WHERE p.purchase_status IN ('draft', 'approved', 'partial')
        """
        params = {}
        
        if supplier_id:
            query += " AND p.supplier_id = :supplier_id"
            params["supplier_id"] = supplier_id
        
        query += " GROUP BY p.purchase_id, s.supplier_name ORDER BY p.purchase_date DESC"
        
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result]
        
    except Exception as e:
        logger.error(f"Error fetching pending receipts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get pending receipts: {str(e)}")
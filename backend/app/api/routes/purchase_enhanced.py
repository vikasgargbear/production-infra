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

from ...core.database import get_db
from ...core.config import DEFAULT_ORG_ID

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Purchase Enhanced"])

# Default org_id - should come from auth in production
DEFAULT_ORG_ID = "ad808530-1ddb-4377-ab20-67bef145d80d"

@router.get("/")
def get_purchases(
    skip: int = Query(0, description="Skip records"),
    limit: int = Query(25, description="Limit records"),
    offset: int = Query(0, description="Offset records"),
    search: Optional[str] = Query(None, description="Search term"),
    po_status: Optional[str] = Query(None, description="Filter by PO status"),
    supplier_id: Optional[int] = Query(None, description="Filter by supplier"),
    dateFilter: Optional[str] = Query(None, description="Date filter"),
    db: Session = Depends(get_db)
):
    """Get list of purchase orders with pagination and filtering"""
    try:
        # Build base query
        query = """
            SELECT 
                p.purchase_order_id,
                p.po_number,
                p.po_date,
                p.po_type,
                p.supplier_id,
                p.supplier_name,
                p.subtotal_amount,
                p.tax_amount,
                p.total_amount,
                p.po_status,
                p.payment_status,
                p.receipt_status,
                p.expected_delivery_date,
                p.created_at,
                COUNT(poi.po_item_id) as items_count
            FROM procurement.purchase_orders p
            LEFT JOIN procurement.purchase_order_items poi ON p.purchase_order_id = poi.purchase_order_id
            WHERE 1=1
        """
        
        params = {}
        
        # Add search filter
        if search:
            query += """ AND (
                p.po_number ILIKE :search OR 
                p.supplier_name ILIKE :search
            )"""
            params["search"] = f"%{search}%"
        
        # Add status filter
        if po_status:
            query += " AND p.po_status = :po_status"
            params["po_status"] = po_status
        
        # Add supplier filter
        if supplier_id:
            query += " AND p.supplier_id = :supplier_id"
            params["supplier_id"] = supplier_id
        
        # Add date filter
        if dateFilter:
            from datetime import datetime, timedelta
            today = datetime.now().date()
            
            if dateFilter == "today":
                query += " AND DATE(p.po_date) = :date"
                params["date"] = today
            elif dateFilter == "week":
                week_ago = today - timedelta(days=7)
                query += " AND DATE(p.po_date) >= :date"
                params["date"] = week_ago
            elif dateFilter == "month":
                month_ago = today - timedelta(days=30)
                query += " AND DATE(p.po_date) >= :date"
                params["date"] = month_ago
        
        # Group by and order
        query += """
            GROUP BY p.purchase_order_id, p.po_number, p.po_date, p.po_type,
                     p.supplier_id, p.supplier_name, p.subtotal_amount,
                     p.tax_amount, p.total_amount, p.po_status, p.payment_status,
                     p.receipt_status, p.expected_delivery_date, p.created_at
            ORDER BY p.po_date DESC, p.created_at DESC
        """
        
        # Get total count for pagination
        count_query = """
            SELECT COUNT(DISTINCT p.purchase_order_id) as total
            FROM procurement.purchase_orders p
            WHERE 1=1
        """
        
        # Apply same filters to count query
        if search:
            count_query += """ AND (
                p.po_number ILIKE :search OR 
                p.supplier_name ILIKE :search
            )"""
        
        if po_status:
            count_query += " AND p.po_status = :po_status"
        
        if supplier_id:
            count_query += " AND p.supplier_id = :supplier_id"
        
        if dateFilter and "date" in params:
            if dateFilter == "today":
                count_query += " AND DATE(p.po_date) = :date"
            else:
                count_query += " AND DATE(p.po_date) >= :date"
        
        # Execute count query
        count_result = db.execute(text(count_query), params)
        total_count = count_result.scalar() or 0
        
        # Add pagination to main query
        query += " LIMIT :limit OFFSET :offset"
        params["limit"] = limit
        params["offset"] = offset if offset else skip
        
        # Execute main query
        result = db.execute(text(query), params)
        purchases = [dict(row._mapping) for row in result]
        
        # Calculate pagination info
        total_pages = (total_count + limit - 1) // limit if limit > 0 else 1
        current_page = (offset // limit) + 1 if limit > 0 else 1
        
        return {
            "purchases": purchases,
            "pagination": {
                "total": total_count,
                "page": current_page,
                "per_page": limit,
                "total_pages": total_pages
            }
        }
        
    except Exception as e:
        logger.error(f"Error fetching purchases: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch purchases: {str(e)}")

@router.post("/direct-purchase-entry")
def create_direct_purchase_entry(purchase_data: dict, db: Session = Depends(get_db)):
    """
    Direct Purchase Entry (Bill Entry) - When goods are received with supplier invoice
    This creates supplier invoice and adds stock to inventory via batches
    For users who don't need separate PO workflow
    """
    import random
    
    try:
        # For Purchase Entry, we create a completed PO (since there's no separate supplier_invoice table)
        # This represents goods already received with bill
        po_number = f"BILL-{datetime.now().strftime('%Y%m%d')}-{random.randint(1000, 9999)}"
        
        # Create purchase order marked as completed (represents bill entry)
        po_result = db.execute(text("""
            INSERT INTO procurement.purchase_orders (
                org_id, branch_id, po_number, po_date, po_type,
                supplier_id, supplier_name,
                subtotal_amount, tax_amount, total_amount,
                po_status, receipt_status,
                created_at
            ) VALUES (
                :org_id, 1, :po_number, :po_date, 'regular',
                :supplier_id, :supplier_name,
                :subtotal, :tax, :total,
                'completed', 'received',
                CURRENT_TIMESTAMP
            ) RETURNING purchase_order_id
        """), {
            "org_id": DEFAULT_ORG_ID,
            "po_number": po_number,
            "po_date": purchase_data.get("purchase_date", datetime.now().date()),
            "supplier_id": purchase_data.get("supplier_id"),
            "supplier_name": purchase_data.get("supplier_name", "Direct Purchase"),
            "subtotal": purchase_data.get("subtotal_amount", 0),
            "tax": purchase_data.get("tax_amount", 0),
            "total": purchase_data.get("total_amount", 0)
        })
        
        po_row = po_result.fetchone()
        po_id = po_row.purchase_order_id
        
        # Process items and create batches
        items = purchase_data.get("items", [])
        for item in items:
            # Create PO item
            item_result = db.execute(text("""
                INSERT INTO procurement.purchase_order_items (
                    purchase_order_id, product_id, product_name,
                    ordered_quantity, unit_price, line_total,
                    tax_percentage, tax_amount, final_amount
                ) VALUES (
                    :purchase_order_id, :product_id, :product_name,
                    :quantity, :unit_price, :line_total,
                    :tax_percent, :tax_amount, :final_amount
                ) RETURNING po_item_id
            """), {
                "purchase_order_id": po_id,
                "product_id": item.get("product_id"),
                "product_name": item.get("product_name"),
                "quantity": item.get("quantity", 0),
                "unit_price": item.get("unit_price", 0),
                "line_total": item.get("quantity", 0) * item.get("unit_price", 0),
                "tax_percent": item.get("tax_percent", 12),
                "tax_amount": item.get("tax_amount", 0),
                "final_amount": item.get("total_amount", 0)
            })
            
            # Create batch automatically
            if item.get("batch_number") and item.get("expiry_date"):
                batch_result = db.execute(text("""
                    INSERT INTO inventory.batches (
                        org_id, product_id, supplier_id,
                        batch_number, expiry_date,
                        quantity_received, quantity_available,
                        cost_per_unit, selling_price, mrp,
                        batch_status, expiry_status,
                        created_at
                    ) VALUES (
                        :org_id, :product_id, :supplier_id,
                        :batch_number, :expiry_date,
                        :quantity, :quantity,
                        :cost_price, :selling_price, :mrp,
                        'active', 'fresh',
                        CURRENT_TIMESTAMP
                    ) RETURNING batch_id
                """), {
                    "org_id": DEFAULT_ORG_ID,
                    "product_id": item.get("product_id"),
                    "supplier_id": purchase_data.get("supplier_id"),
                    "batch_number": item.get("batch_number"),
                    "expiry_date": item.get("expiry_date"),
                    "quantity": item.get("quantity", 0),
                    "cost_price": item.get("unit_price", 0),
                    "selling_price": item.get("selling_price", item.get("mrp", 0)),
                    "mrp": item.get("mrp", 0)
                })
                
                batch = batch_result.fetchone()
                logger.info(f"Batch {batch.batch_id} created for product {item.get('product_id')}")
        
        db.commit()
        
        return {
            "success": True,
            "po_id": po_id,
            "po_number": po_number,
            "message": f"Purchase {po_number} created with {len(items)} items and batches"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error in simple purchase: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

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
                text("SELECT supplier_name FROM parties.suppliers WHERE supplier_id = :id"),
                {"id": purchase_data.get("supplier_id")}
            ).first()
            if supplier_result:
                supplier_name = supplier_result.supplier_name
        
        # Get or create system user if created_by not provided
        created_by = purchase_data.get("created_by")
        if not created_by:
            # Try to get system user
            user_result = db.execute(
                text("""
                    SELECT user_id FROM master.org_users 
                    WHERE org_id = :org_id AND is_active = true
                    ORDER BY user_id
                    LIMIT 1
                """),
                {"org_id": DEFAULT_ORG_ID}
            ).first()
            
            if user_result:
                created_by = user_result.user_id
            else:
                # Create system user
                try:
                    create_user = db.execute(
                        text("""
                            INSERT INTO master.org_users (
                                org_id, employee_code, username, email, password_hash,
                                first_name, last_name, roles, is_active
                            ) VALUES (
                                :org_id, 'SYSTEM', 'system', 'system@api.local', 'no-login',
                                'System', 'API', ARRAY['api_user'], true
                            ) RETURNING user_id
                        """),
                        {"org_id": DEFAULT_ORG_ID}
                    ).first()
                    created_by = create_user.user_id if create_user else None
                except:
                    pass
        
        if not created_by:
            raise HTTPException(
                status_code=400,
                detail="Unable to determine user for this operation. Please provide created_by field."
            )
        
        # Create purchase header
        result = db.execute(
            text("""
                INSERT INTO procurement.purchase_orders (
                    org_id, po_number, po_date,
                    supplier_id, supplier_name,
                    subtotal_amount, discount_amount, tax_amount, 
                    other_charges, total_amount, po_status,
                    payment_terms, notes, created_by, branch_id
                ) VALUES (
                    :org_id, -- Default org
                    :purchase_number, :po_date,
                    :supplier_id, :supplier_name,
                    :subtotal, :discount, :tax, :other_charges, :total,
                    :status, :payment_mode, :notes, :created_by, 1
                ) RETURNING purchase_order_id
            """),
            {
                "org_id": DEFAULT_ORG_ID,
                "purchase_number": purchase_number,
                "po_date": purchase_data.get("purchase_date", datetime.now().date()),
                "supplier_id": purchase_data.get("supplier_id"),
                "supplier_name": supplier_name,
                "subtotal": Decimal(str(purchase_data.get("subtotal_amount", 0))),
                "discount": Decimal(str(purchase_data.get("discount_amount", 0))),
                "tax": Decimal(str(purchase_data.get("tax_amount", 0))),
                "other_charges": Decimal(str(purchase_data.get("other_charges", 0))),
                "total": Decimal(str(purchase_data.get("final_amount", 0))),
                "status": purchase_data.get("purchase_status", "draft"),
                "payment_mode": purchase_data.get("payment_mode", "cash"),
                "notes": purchase_data.get("notes"),
                "created_by": created_by
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
                    INSERT INTO procurement.purchase_order_items (
                        purchase_order_id, product_id, product_name,
                        ordered_quantity, unit_price, free_quantity,
                        discount_percentage, discount_amount,
                        line_total, gst_percentage, tax_amount, final_amount
                    ) VALUES (
                        :purchase_order_id, :product_id, :product_name,
                        :ordered_qty, :unit_price, :free_qty,
                        :disc_percent, :disc_amount,
                        :line_total, :gst_percent, :tax_amount, :final_amount
                    )
                """),
                {
                    "purchase_order_id": purchase_id,
                    "product_id": item.get("product_id"),
                    "product_name": item.get("product_name"),
                    "ordered_qty": quantity,
                    "unit_price": cost_price,
                    "free_qty": item.get("free_quantity", 0),
                    "disc_percent": discount_percent,
                    "disc_amount": discount_amount,
                    "line_total": taxable_amount,
                    "gst_percent": tax_percent,
                    "tax_amount": tax_amount,
                    "final_amount": total_price
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
                    p.category_id,
                    p.brand_name
                FROM procurement.purchase_order_items pi
                LEFT JOIN inventory.products p ON pi.product_id = p.product_id
                WHERE pi.po_id = :purchase_id
                ORDER BY pi.po_item_id
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
                SELECT po_item_id 
                FROM procurement.purchase_order_items 
                WHERE po_item_id = :item_id 
                AND po_id = :purchase_id
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
                    UPDATE procurement.purchase_order_items 
                    SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP
                    WHERE po_item_id = :item_id
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
            text("SELECT * FROM procurement.purchase_orders WHERE purchase_order_id = :id"),
            {"id": purchase_id}
        ).first()
        
        if not purchase:
            raise HTTPException(status_code=404, detail="Purchase not found")
        
        if purchase.po_status == "received":
            raise HTTPException(status_code=400, detail="Purchase already received")
        
        received_items = receive_data.get("items", [])
        batches_created = 0
        
        for item in received_items:
            item_id = item.get("po_item_id")
            received_qty = item.get("received_quantity", 0)
            
            if received_qty <= 0:
                continue
            
            # Get purchase item details
            pi = db.execute(
                text("""
                    SELECT * FROM procurement.purchase_order_items 
                    WHERE po_item_id = :item_id 
                    AND po_id = :purchase_id
                """),
                {"item_id": item_id, "purchase_id": purchase_id}
            ).first()
            
            if not pi:
                continue
            
            # Create batch
            batch_id = db.execute(
                text("""
                    INSERT INTO inventory.batches (
                        org_id, product_id, batch_number,
                        manufacturing_date, expiry_date,
                        quantity_received, quantity_available,
                        cost_price, selling_price, mrp,
                        supplier_id, purchase_id,
                        purchase_invoice_number,
                        batch_status
                    ) VALUES (
                        DEFAULT_ORG_ID,
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
                    INSERT INTO inventory.inventory_movements (
                        org_id, movement_date, movement_type,
                        product_id, batch_id,
                        quantity_in, quantity_out,
                        reference_type, reference_id, reference_number,
                        notes
                    ) VALUES (
                        DEFAULT_ORG_ID,
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
                    "purchase_number": purchase.po_number
                }
            )
            
            # Update purchase item
            db.execute(
                text("""
                    UPDATE procurement.purchase_order_items 
                    SET received_quantity = :received_qty,
                        item_status = 'received'
                    WHERE po_item_id = :item_id
                """),
                {"received_qty": received_qty, "item_id": item_id}
            )
            
            batches_created += 1
        
        # Update purchase status
        db.execute(
            text("""
                UPDATE procurement.purchase_orders 
                SET po_status = 'received',
                    grn_number = :grn_number,
                    grn_date = CURRENT_DATE
                WHERE purchase_order_id = :purchase_id
            """),
            {
                "grn_number": f"GRN-{purchase.po_number}",
                "purchase_id": purchase_id
            }
        )
        
        db.commit()
        
        return {
            "message": "Purchase items received successfully",
            "batches_created": batches_created,
            "grn_number": f"GRN-{purchase.po_number}"
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
            text("SELECT * FROM procurement.purchase_orders WHERE purchase_order_id = :id"),
            {"id": purchase_id}
        ).first()
        
        if not purchase:
            raise HTTPException(status_code=404, detail="Purchase not found")
        
        if purchase.po_status == "received":
            raise HTTPException(status_code=400, detail="Purchase already received")
        
        # Update purchase items
        for item in receive_data.get("items", []):
            item_id = item.get("po_item_id")
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
                    UPDATE procurement.purchase_order_items 
                    SET {', '.join(update_fields)},
                        item_status = 'received'
                    WHERE po_item_id = :item_id 
                    AND po_id = :purchase_id
                """),
                params
            )
        
        # Update purchase status - trigger will create batches
        grn_number = f"GRN-{purchase.po_number}"
        
        db.execute(
            text("""
                UPDATE procurement.purchase_orders 
                SET po_status = 'received',
                    grn_number = :grn_number,
                    grn_date = CURRENT_DATE
                WHERE purchase_order_id = :purchase_id
            """),
            {"grn_number": grn_number, "purchase_id": purchase_id}
        )
        
        db.commit()
        
        # Count created batches
        batch_count = db.execute(
            text("SELECT COUNT(*) FROM inventory.batches WHERE purchase_id = :id"),
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
                COUNT(pi.po_item_id) as total_items,
                COUNT(CASE WHEN pi.received_quantity > 0 THEN 1 END) as received_items
            FROM procurement.purchase_orders p
            JOIN parties.suppliers s ON p.supplier_id = s.supplier_id
            LEFT JOIN procurement.purchase_order_items pi ON p.purchase_order_id = pi.purchase_order_id
            WHERE p.po_status IN ('draft', 'approved', 'partial')
        """
        params = {}
        
        if supplier_id:
            query += " AND p.supplier_id = :supplier_id"
            params["supplier_id"] = supplier_id
        
        query += " GROUP BY p.po_id, s.supplier_name ORDER BY p.po_date DESC"
        
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result]
        
    except Exception as e:
        logger.error(f"Error fetching pending receipts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get pending receipts: {str(e)}")
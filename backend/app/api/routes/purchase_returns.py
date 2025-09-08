"""
Purchase Return API Router
Handles returns of purchased items back to suppliers
Matches the structure of sales returns for consistency
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
from ..services.document_number_service import DocumentNumberService
from ...utils.branch_utils import get_default_branch_id

logger = logging.getLogger(__name__)

router = APIRouter(tags=["purchase-returns"])

@router.get("/")
async def get_purchase_returns(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    supplier_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get list of purchase returns with optional filters
    """
    try:
        query = """
            SELECT pr.*, s.supplier_name as party_name, 
                   -- Extract invoice ID from return number
                   SUBSTRING(pr.return_number FROM 'INV([0-9]+)$') as original_invoice_number
            FROM procurement.purchase_returns pr
            LEFT JOIN parties.suppliers s ON pr.supplier_id = s.supplier_id
            WHERE 1=1
        """
        params = {"skip": skip, "limit": limit}
        
        if supplier_id:
            query += " AND pr.supplier_id = :supplier_id"
            params["supplier_id"] = supplier_id
            
        if from_date:
            query += " AND pr.return_date >= :from_date"
            params["from_date"] = from_date
            
        if to_date:
            query += " AND pr.return_date <= :to_date"
            params["to_date"] = to_date
            
        query += " ORDER BY pr.created_at DESC LIMIT :limit OFFSET :skip"
        
        returns = db.execute(text(query), params).fetchall()
        
        return {
            "data": [dict(r._mapping) for r in returns],
            "total": len(returns),
            "skip": skip,
            "limit": limit
        }
        
    except Exception as e:
        logger.error(f"Error fetching purchase returns: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/returnable-purchases/")
async def get_returnable_purchases(
    supplier_id: Optional[str] = None,
    invoice_number: Optional[str] = None,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get purchase bills that can be returned
    """
    try:
        logger.info(f"Getting returnable purchases for supplier_id: {supplier_id}, invoice: {invoice_number}")
        query = """
            SELECT 
                p.po_id as purchase_id,
                p.po_number as invoice_number,
                p.po_date as invoice_date,
                p.supplier_id,
                s.supplier_name,
                s.gstin as supplier_gst,
                p.total_amount,
                COUNT(pi.po_item_id) as total_items
            FROM procurement.purchase_orders p
            LEFT JOIN parties.suppliers s ON p.supplier_id = s.supplier_id
            LEFT JOIN procurement.purchase_order_items pi ON p.po_id = pi.po_id
            WHERE 1=1
        """
        params = {}
        
        # Log all purchase statuses to debug
        status_check = db.execute(
            text("SELECT DISTINCT po_status FROM procurement.purchase_orders LIMIT 10")
        ).fetchall()
        logger.info(f"Available purchase statuses: {[s.po_status for s in status_check]}")
        
        if supplier_id:
            query += " AND p.supplier_id = :supplier_id"
            params["supplier_id"] = supplier_id
            
        if invoice_number:
            query += " AND p.po_number LIKE :invoice"
            params["invoice"] = f"%{invoice_number}%"
            
        query += """ 
            GROUP BY p.po_id, p.po_number, p.po_date,
                     p.supplier_id, s.supplier_name, s.gstin, p.total_amount
            ORDER BY p.supplier_invoice_date DESC
            LIMIT 50
        """
        
        purchases = db.execute(text(query), params).fetchall()
        
        logger.info(f"Found {len(purchases)} returnable purchases")
        
        # If no purchases found, check if we have any purchases at all
        if not purchases and supplier_id:
            total_count = db.execute(
                text("SELECT COUNT(*) FROM procurement.purchase_orders WHERE supplier_id = :supplier_id"),
                {"supplier_id": supplier_id}
            ).scalar()
            logger.info(f"Total purchases for supplier {supplier_id}: {total_count}")
        
        result = []
        for purchase in purchases:
            # Check how much has already been returned
            returned_query = """
                SELECT COALESCE(SUM(ri.return_quantity), 0) as total_returned
                FROM procurement.purchase_returns rr
                JOIN procurement.purchase_return_items ri ON rr.return_id = ri.return_id
                WHERE rr.return_number LIKE :invoice_pattern
            """
            total_returned = db.execute(
                text(returned_query), 
                {"invoice_pattern": f"%-INV{purchase.purchase_id}"}
            ).scalar() or 0
            
            purchase_dict = dict(purchase._mapping)
            purchase_dict["has_returns"] = total_returned > 0
            purchase_dict["can_return"] = True
            result.append(purchase_dict)
            
        return {"purchases": result}
        
    except Exception as e:
        logger.error(f"Error fetching returnable purchases: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/test-purchases/")
async def test_purchases(db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)):
    """Test endpoint to check purchases in database"""
    try:
        # Count total purchases
        total = db.execute(text("SELECT COUNT(*) FROM purchases")).scalar()
        
        # Get sample purchases
        samples = db.execute(
            text("""
                SELECT p.purchase_id, p.supplier_id, p.purchase_status, 
                       p.supplier_invoice_number, s.supplier_name
                FROM purchases p
                LEFT JOIN suppliers s ON p.supplier_id = s.supplier_id
                LIMIT 5
            """)
        ).fetchall()
        
        return {
            "total_purchases": total,
            "sample_purchases": [dict(s._mapping) for s in samples]
        }
    except Exception as e:
        logger.error(f"Error in test endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/purchase/{purchase_id}/items")
async def get_purchase_items_for_return(
    purchase_id: str,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get items from a specific purchase for return
    """
    try:
        # Get purchase details
        purchase = db.execute(
            text("SELECT * FROM purchases WHERE purchase_id = :purchase_id"),
            {"purchase_id": purchase_id}
        ).first()
        
        if not purchase:
            raise HTTPException(status_code=404, detail="Purchase not found")
            
        # Get items with return info
        # Note: Purchase items don't have batch_id directly, batches are created during GRN
        # For simplicity, we'll get available batches for each product from the purchase
        items_query = """
            SELECT 
                pi.*,
                p.product_name,
                p.hsn_code,
                NULL as batch_number,
                NULL as expiry_date,
                COALESCE(returned_qty.total_returned, 0) as returned_quantity
            FROM purchase_items pi
            LEFT JOIN inventory.products p ON pi.product_id = p.product_id
            LEFT JOIN (
                SELECT 
                    rr.return_number,
                    ri.product_id,
                    SUM(ri.return_quantity) as total_returned
                FROM procurement.purchase_return_items ri
                JOIN procurement.purchase_returns rr ON ri.return_id = rr.return_id  
                WHERE rr.return_number LIKE :invoice_pattern
                GROUP BY rr.return_number, ri.product_id
            ) returned_qty ON returned_qty.product_id = pi.product_id
            WHERE pi.purchase_id = :purchase_id
            GROUP BY pi.purchase_item_id, pi.product_id, pi.ordered_quantity, pi.received_quantity, 
                     pi.cost_price, p.product_name, p.hsn_code, returned_qty.total_returned
        """
        
        items = db.execute(
            text(items_query), 
            {"purchase_id": purchase_id, "invoice_pattern": f"%-INV{purchase_id}"}
        ).fetchall()
        
        result_items = []
        for item in items:
            item_dict = dict(item._mapping)
            # Use received_quantity as the base quantity for returns
            quantity = item.received_quantity or item.ordered_quantity
            returned_quantity = item.returned_quantity or 0
            item_dict["quantity"] = quantity
            item_dict["returnable_quantity"] = quantity - returned_quantity
            item_dict["can_return"] = item_dict["returnable_quantity"] > 0
            # Add some default values for compatibility
            item_dict["batch_id"] = None
            item_dict["rate"] = item.cost_price
            item_dict["tax_percent"] = 18  # Default GST rate
            result_items.append(item_dict)
            
        return {
            "purchase": dict(purchase._mapping),
            "items": result_items
        }
        
    except Exception as e:
        logger.error(f"Error fetching purchase items: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/supplier-invoice/{invoice_id}/returnable-items")
async def get_invoice_returnable_items(
    invoice_id: int,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get supplier invoice items with returnable quantities
    Works whether items came from GRN or direct purchase entry
    """
    try:
        # Check if supplier_invoice_items table has data
        items = db.execute(
            text("""
                SELECT 
                    sii.invoice_item_id,
                    sii.product_id,
                    p.product_name,
                    COALESCE(
                        sii.batch_id, 
                        -- Try to find batch by matching the stored batch_number
                        (SELECT batch_id FROM inventory.batches 
                         WHERE product_id = sii.product_id 
                         AND batch_number = sii.batch_number 
                         LIMIT 1),
                        -- If not found, get the most recent batch for this product from this supplier
                        (SELECT batch_id FROM inventory.batches 
                         WHERE product_id = sii.product_id 
                         AND supplier_id = si.supplier_id
                         ORDER BY created_at DESC 
                         LIMIT 1)
                    ) as batch_id,
                    COALESCE(
                        sii.batch_number,
                        -- If no batch_number stored, get it from the batch
                        (SELECT batch_number FROM inventory.batches 
                         WHERE product_id = sii.product_id 
                         AND supplier_id = si.supplier_id
                         ORDER BY created_at DESC 
                         LIMIT 1)
                    ) as batch_number,
                    sii.quantity as invoice_quantity,
                    COALESCE(sii.free_quantity, 0) as free_quantity,
                    sii.quantity - COALESCE(sii.free_quantity, 0) as paid_quantity,
                    COALESCE(sii.quantity_returned, 0) as already_returned,
                    sii.quantity - COALESCE(sii.quantity_returned, 0) as returnable_quantity,
                    sii.unit_price,
                    sii.discount_percent,
                    COALESCE(sii.cgst_percent + sii.sgst_percent + sii.igst_percent, 0) as tax_percent,
                    sii.total_amount,
                    p.hsn_code,
                    sii.unit
                FROM procurement.supplier_invoice_items sii
                JOIN inventory.products p ON sii.product_id = p.product_id
                JOIN procurement.supplier_invoices si ON si.supplier_invoice_id = sii.supplier_invoice_id
                WHERE sii.supplier_invoice_id = :invoice_id
                AND sii.quantity - COALESCE(sii.quantity_returned, 0) > 0
                ORDER BY sii.invoice_item_id
            """),
            {"invoice_id": invoice_id}
        ).fetchall()
        
        # Log the items found
        for item in items:
            logger.info(f"Returnable item: product_id={item.product_id}, batch_id={item.batch_id}, batch_number={item.batch_number}")
        
        # If no items in supplier_invoice_items, try to get from GRN
        if not items:
            items = db.execute(
                text("""
                    SELECT 
                        gi.grn_item_id as invoice_item_id,
                        gi.product_id,
                        p.product_name,
                        gi.batch_id,
                        gi.batch_number,
                        gi.received_quantity as invoice_quantity,
                        COALESCE(gi.free_quantity, 0) as free_quantity,
                        gi.received_quantity - COALESCE(gi.free_quantity, 0) as paid_quantity,
                        COALESCE(gi.quantity_returned, 0) as already_returned,
                        gi.received_quantity - COALESCE(gi.quantity_returned, 0) as returnable_quantity,
                        gi.unit_price,
                        gi.discount_percent,
                        gi.tax_percent,
                        gi.total_amount,
                        p.hsn_code,
                        gi.uom as unit
                    FROM procurement.supplier_invoices si
                    JOIN procurement.goods_receipt_notes grn ON si.grn_ids @> ARRAY[grn.grn_id]
                    JOIN procurement.grn_items gi ON grn.grn_id = gi.grn_id
                    JOIN inventory.products p ON gi.product_id = p.product_id
                    WHERE si.supplier_invoice_id = :invoice_id
                    AND gi.received_quantity - COALESCE(gi.quantity_returned, 0) > 0
                """),
                {"invoice_id": invoice_id}
            ).fetchall()
        
        result = []
        for item in items:
            result.append({
                "invoice_item_id": item.invoice_item_id,
                "product_id": item.product_id,
                "product_name": item.product_name,
                "batch_id": item.batch_id,
                "batch_number": item.batch_number,
                "invoice_quantity": float(item.invoice_quantity),
                "quantity": float(item.invoice_quantity),  # Add for compatibility
                "free_quantity": float(item.free_quantity) if hasattr(item, 'free_quantity') else 0,
                "paid_quantity": float(item.paid_quantity) if hasattr(item, 'paid_quantity') else float(item.invoice_quantity),
                "already_returned": float(item.already_returned),
                "returnable_quantity": float(item.returnable_quantity),
                "max_returnable_qty": float(item.returnable_quantity),
                "unit_price": float(item.unit_price) if item.unit_price else 0,
                "rate": float(item.unit_price) if item.unit_price else 0,  # Add for compatibility
                "discount_percent": float(item.discount_percent) if item.discount_percent else 0,
                "tax_percent": float(item.tax_percent) if item.tax_percent else 0,
                "gst_percent": float(item.tax_percent) if item.tax_percent else 0,  # Add for compatibility
                "hsn_code": item.hsn_code,
                "unit": item.unit,
                "can_return": float(item.returnable_quantity) > 0
            })
        
        return {"items": result}
        
    except Exception as e:
        logger.error(f"Error fetching returnable items: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/")
async def create_purchase_return(
    return_data: dict,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Create a new purchase return (RTV - Return to Vendor)
    """
    try:
        # Validate required fields
        if not return_data.get("items") or not any(item.get("selected") and item.get("quantity", 0) > 0 for item in return_data.get("items", [])):
            raise HTTPException(
                status_code=400,
                detail="At least one item must be returned"
            )
            
        # Generate return number using unified service
        purchase_id = return_data.get("purchase_id", "")
        return_number = DocumentNumberService.generate_number(db, "purchase_return", org_id)
        
        # Get supplier details to check for GST
        supplier = db.execute(
            text("""
                SELECT * FROM parties.suppliers 
                WHERE supplier_id = :supplier_id
            """),
            {"supplier_id": return_data.get("supplier_id")}
        ).fetchone()
        
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")
        
        # Calculate totals
        subtotal = Decimal("0")
        tax_amount = Decimal("0")
        cgst_amount = Decimal("0")
        sgst_amount = Decimal("0")
        igst_amount = Decimal("0")
        total_amount = Decimal("0")
        
        selected_items = [item for item in return_data.get("items", []) if item.get("selected") and item.get("quantity", 0) > 0]
        
        # Check if supplier is from different state for IGST
        is_igst = False
        # For now, assume CGST/SGST (same state). TODO: Check supplier state vs org state
        
        for item in selected_items:
            item_total = Decimal(str(item["quantity"])) * Decimal(str(item["rate"]))
            item_tax = (item_total * Decimal(str(item.get("tax_percent", 18)))) / 100
            
            if is_igst:
                igst_amount += item_tax
            else:
                # Split tax equally between CGST and SGST
                cgst_amount += item_tax / 2
                sgst_amount += item_tax / 2
            
            subtotal += item_total
            tax_amount += item_tax
            total_amount += item_total + item_tax
            
        # Get first user_id from org_users for this org (same pattern as sales returns)
        created_by = None
        try:
            user_result = db.execute(
                text("SELECT user_id FROM master.org_users WHERE org_id = :org_id LIMIT 1"),
                {"org_id": org_id}
            ).fetchone()
            if user_result:
                created_by = user_result.user_id
        except:
            pass
        
        if not created_by:
            # If no user exists for this org, create a default system user
            try:
                result = db.execute(
                    text("""
                        INSERT INTO master.org_users (org_id, username, email, full_name, role, is_active)
                        VALUES (:org_id, 'system', 'system@example.com', 'System User', 'admin', true)
                        RETURNING user_id
                    """),
                    {"org_id": org_id}
                ).fetchone()
                if result:
                    created_by = result.user_id
                    db.commit()
            except:
                # If creation fails (duplicate), try to get the system user
                user_result = db.execute(
                    text("SELECT user_id FROM master.org_users WHERE org_id = :org_id AND username = 'system' LIMIT 1"),
                    {"org_id": org_id}
                ).fetchone()
                if user_result:
                    created_by = user_result.user_id
        
        # Ensure we have a created_by value
        if not created_by:
            raise HTTPException(status_code=500, detail="Unable to determine user for return creation")
        
        # Generate debit note number only for GST suppliers
        debit_note_no = None
        if supplier.gst_number:
            # Get next debit note number
            last_dn = db.execute(
                text("""
                    SELECT debit_note_number FROM procurement.purchase_returns 
                    WHERE debit_note_number IS NOT NULL
                    ORDER BY created_at DESC LIMIT 1
                """)
            ).scalar()
            
            if last_dn and last_dn.startswith('DN-'):
                try:
                    last_num = int(last_dn.split('-')[1])
                    debit_note_no = f"DN-{last_num + 1:06d}"
                except:
                    debit_note_no = "DN-000001"
            else:
                debit_note_no = "DN-000001"
        
        # Create return record using purchase_returns table
        # Note: purchase_id can be NULL for direct invoice returns
        result = db.execute(
            text("""
                INSERT INTO procurement.purchase_returns (
                    org_id, branch_id, return_number, return_date,
                    return_type, supplier_id, supplier_invoice_id,
                    return_reason, 
                    return_amount, tax_amount, total_amount,
                    cgst_amount, sgst_amount, igst_amount,
                    debit_note_number, created_by
                ) VALUES (
                    :org_id, :branch_id, :return_number, :return_date,
                    'PURCHASE', :supplier_id, :supplier_invoice_id,
                    :reason,
                    :subtotal, :tax_amount, :total_amount,
                    :cgst_amount, :sgst_amount, :igst_amount,
                    :debit_note_no, :created_by
                )
                RETURNING return_id
            """),
            {
                "org_id": org_id,
                "branch_id": get_default_branch_id(db, org_id),
                "return_number": return_number,
                "return_date": return_data["return_date"],
                "supplier_id": return_data.get("supplier_id"),
                "supplier_invoice_id": return_data.get("original_purchase_id") or return_data.get("purchase_id"),
                "reason": return_data.get("return_reason", return_data.get("reason", "")),
                "subtotal": subtotal,
                "tax_amount": tax_amount,
                "total_amount": total_amount,
                "cgst_amount": cgst_amount,
                "sgst_amount": sgst_amount,
                "igst_amount": igst_amount,
                "debit_note_no": debit_note_no,
                "created_by": created_by
            }
        ).fetchone()
        
        return_id = result.return_id
        
        # Create return items and update inventory
        for item in selected_items:
            # Calculate item-level amounts
            item_quantity = Decimal(str(item["quantity"]))
            item_rate = Decimal(str(item["rate"]))
            item_subtotal = item_quantity * item_rate
            item_tax_percent = Decimal(str(item.get("tax_percent", 18)))
            item_tax_amount = (item_subtotal * item_tax_percent) / 100
            item_total = item_subtotal + item_tax_amount
            
            # Ensure batch_number is never empty
            batch_number = item.get("batch_number") or item.get("batch_no") or "NO_BATCH"
            
            # Insert return item
            db.execute(
                text("""
                    INSERT INTO procurement.purchase_return_items (
                        return_id, product_id,
                        batch_id, batch_number, return_quantity, 
                        unit_price, uom, return_value, tax_amount,
                        item_return_reason, disposition,
                        supplier_invoice_item_id
                    ) VALUES (
                        :return_id, :product_id,
                        :batch_id, :batch_number, :quantity, 
                        :rate, :uom, :return_value, :tax_amount,
                        :item_reason, :disposition,
                        :invoice_item_id
                    )
                """),
                {
                    "return_id": return_id,
                    "product_id": item["product_id"],
                    "batch_id": item.get("batch_id") if item.get("batch_id") else None,
                    "batch_number": batch_number,
                    "quantity": item_quantity,
                    "rate": item_rate,
                    "uom": item.get("unit", "PCS"),
                    "return_value": item_total,
                    "tax_amount": item_tax_amount,
                    "item_reason": item.get("reason", return_data.get("return_reason", "")),
                    "disposition": item.get("disposition", "RETURN_TO_SUPPLIER"),
                    "invoice_item_id": item.get("invoice_item_id") or item.get("id")
                }
            )
            
            # Update batch stock (decrease stock for returns to supplier)
            if item.get("batch_id"):
                db.execute(
                    text("""
                        UPDATE inventory.batches 
                        SET quantity_available = quantity_available - :quantity,
                            quantity_returned = COALESCE(quantity_returned, 0) + :quantity
                        WHERE batch_id = :batch_id
                    """),
                    {
                        "quantity": item_quantity,  # Use the Decimal variable we calculated
                        "batch_id": item.get("batch_id")
                    }
                )
                logger.info(f"Updated batch {item.get('batch_id')}: decreased available by {item_quantity}, increased returned by {item_quantity}")
            else:
                logger.warning(f"No batch_id for product {item.get('product_id')}, skipping batch stock update")
                
        # TODO: Update party ledger when table is available
        # For now, we'll skip ledger updates
            
        db.commit()
        
        return {
            "status": "success",
            "return_id": return_id,
            "return_number": return_number,
            "debit_note_no": debit_note_no,
            "has_gst": bool(supplier.gst_number),
            "subtotal": float(subtotal),
            "tax_amount": float(tax_amount),
            "total_amount": float(total_amount),
            "message": f"Purchase return created successfully{' with GST Debit Note: ' + debit_note_no if debit_note_no else ''}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating purchase return: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{return_id}/cancel")
async def cancel_purchase_return(
    return_id: int,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Cancel a purchase return
    """
    try:
        # Get return details
        purchase_return = db.execute(
            text("SELECT * FROM procurement.purchase_returns WHERE return_id = :return_id"),
            {"return_id": return_id}
        ).fetchone()
        
        if not purchase_return:
            raise HTTPException(status_code=404, detail="Return not found")
            
        if purchase_return.return_status == "cancelled":
            raise HTTPException(status_code=400, detail="Return already cancelled")
            
        # Get return items
        items = db.execute(
            text("SELECT * FROM procurement.purchase_return_items WHERE return_id = :return_id"),
            {"return_id": return_id}
        ).fetchall()
        
        # Reverse batch stock changes
        for item in items:
            if item.batch_id:
                db.execute(
                    text("""
                        UPDATE inventory.batches 
                        SET quantity_available = quantity_available + :quantity,
                            quantity_returned = quantity_returned - :quantity
                        WHERE batch_id = :batch_id
                    """),
                    {
                        "quantity": item.return_quantity,
                        "batch_id": item.batch_id
                    }
                )
            
        # TODO: Reverse ledger entry when party_ledger table is available
            
        # Update return status
        db.execute(
            text("""
                UPDATE procurement.purchase_returns 
                SET return_status = 'cancelled'
                WHERE return_id = :return_id
            """),
            {"return_id": return_id}
        )
        
        db.commit()
        
        return {"status": "success", "message": "Purchase return cancelled successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling purchase return: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{return_id}")
async def get_purchase_return_details(
    return_id: int,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get details of a specific purchase return
    """
    try:
        # Get return details
        return_query = """
            SELECT pr.*, s.supplier_name as party_name, s.gst_number as party_gst,
                   -- Extract invoice ID from return number
                   SUBSTRING(pr.return_number FROM 'INV([0-9]+)$') as original_invoice_number
            FROM procurement.purchase_returns pr
            LEFT JOIN parties.suppliers s ON pr.supplier_id = s.supplier_id
            WHERE pr.return_id = :return_id
        """
        
        return_data = db.execute(text(return_query), {"return_id": return_id}).fetchone()
        
        if not return_data:
            raise HTTPException(status_code=404, detail="Purchase return not found")
            
        # Get return items
        items_query = """
            SELECT 
                ri.*,
                p.product_name,
                p.hsn_code,
                b.batch_number,
                b.expiry_date
            FROM return_items ri
            LEFT JOIN inventory.products p ON ri.product_id = p.product_id
            LEFT JOIN inventory.batches b ON ri.batch_id = b.batch_id
            WHERE ri.return_id = :return_id
        """
        
        items = db.execute(text(items_query), {"return_id": return_id}).fetchall()
        
        return {
            "return": dict(return_data._mapping),
            "items": [dict(item._mapping) for item in items]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching purchase return details: {e}")
        raise HTTPException(status_code=500, detail=str(e))
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

from ...database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/purchase-returns", tags=["purchase-returns"])

@router.get("/")
async def get_purchase_returns(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    supplier_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get list of purchase returns with optional filters
    """
    try:
        query = """
            SELECT pr.*, s.supplier_name as party_name, 
                   -- Extract invoice ID from return number
                   SUBSTRING(pr.return_number FROM 'INV([0-9]+)$') as original_invoice_number
            FROM return_requests pr
            LEFT JOIN suppliers s ON pr.supplier_id = s.supplier_id
            WHERE pr.return_type = 'PURCHASE'
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
    db: Session = Depends(get_db)
):
    """
    Get purchase bills that can be returned
    """
    try:
        logger.info(f"Getting returnable purchases for supplier_id: {supplier_id}, invoice: {invoice_number}")
        query = """
            SELECT 
                p.purchase_id,
                p.supplier_invoice_number as invoice_number,
                p.supplier_invoice_date as invoice_date,
                p.supplier_id,
                s.supplier_name,
                s.gst_number as supplier_gst,
                p.final_amount as total_amount,
                COUNT(pi.purchase_item_id) as total_items
            FROM purchases p
            LEFT JOIN suppliers s ON p.supplier_id = s.supplier_id
            LEFT JOIN purchase_items pi ON p.purchase_id = pi.purchase_id
            WHERE 1=1
        """
        params = {}
        
        # Log all purchase statuses to debug
        status_check = db.execute(
            text("SELECT DISTINCT purchase_status FROM purchases LIMIT 10")
        ).fetchall()
        logger.info(f"Available purchase statuses: {[s.purchase_status for s in status_check]}")
        
        if supplier_id:
            query += " AND p.supplier_id = :supplier_id"
            params["supplier_id"] = supplier_id
            
        if invoice_number:
            query += " AND p.supplier_invoice_number LIKE :invoice"
            params["invoice"] = f"%{invoice_number}%"
            
        query += """ 
            GROUP BY p.purchase_id, p.supplier_invoice_number, p.supplier_invoice_date,
                     p.supplier_id, s.supplier_name, s.gst_number, p.final_amount
            ORDER BY p.supplier_invoice_date DESC
            LIMIT 50
        """
        
        purchases = db.execute(text(query), params).fetchall()
        
        logger.info(f"Found {len(purchases)} returnable purchases")
        
        # If no purchases found, check if we have any purchases at all
        if not purchases and supplier_id:
            total_count = db.execute(
                text("SELECT COUNT(*) FROM purchases WHERE supplier_id = :supplier_id"),
                {"supplier_id": supplier_id}
            ).scalar()
            logger.info(f"Total purchases for supplier {supplier_id}: {total_count}")
        
        result = []
        for purchase in purchases:
            # Check how much has already been returned
            returned_query = """
                SELECT COALESCE(SUM(ri.return_quantity), 0) as total_returned
                FROM return_requests rr
                JOIN return_items ri ON rr.return_id = ri.return_id
                WHERE rr.return_number LIKE :invoice_pattern AND rr.return_type = 'PURCHASE'
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
async def test_purchases(db: Session = Depends(get_db)):
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
    db: Session = Depends(get_db)
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
            LEFT JOIN products p ON pi.product_id = p.product_id
            LEFT JOIN (
                SELECT 
                    rr.return_number,
                    ri.product_id,
                    SUM(ri.return_quantity) as total_returned
                FROM return_items ri
                JOIN return_requests rr ON ri.return_id = rr.return_id  
                WHERE rr.return_number LIKE :invoice_pattern AND rr.return_type = 'PURCHASE'
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

@router.post("/")
async def create_purchase_return(
    return_data: dict,
    db: Session = Depends(get_db)
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
            
        # Generate return number with invoice reference
        purchase_id = return_data.get("purchase_id", "")
        return_number = f"PR-{datetime.now().strftime('%Y%m%d-%H%M%S')}-INV{purchase_id}"
        
        # Get supplier details to check for GST
        supplier = db.execute(
            text("""
                SELECT * FROM suppliers 
                WHERE supplier_id = :supplier_id
            """),
            {"supplier_id": return_data.get("supplier_id")}
        ).fetchone()
        
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")
        
        # Calculate totals
        subtotal = Decimal("0")
        tax_amount = Decimal("0")
        total_amount = Decimal("0")
        
        selected_items = [item for item in return_data.get("items", []) if item.get("selected") and item.get("quantity", 0) > 0]
        
        for item in selected_items:
            item_total = Decimal(str(item["quantity"])) * Decimal(str(item["rate"]))
            item_tax = (item_total * Decimal(str(item.get("tax_percent", 18)))) / 100
            subtotal += item_total
            tax_amount += item_tax
            total_amount += item_total + item_tax
            
        # Generate debit note number only for GST suppliers
        debit_note_no = None
        if supplier.gst_number:
            # Get next debit note number
            last_dn = db.execute(
                text("""
                    SELECT debit_note_number FROM return_requests 
                    WHERE return_type = 'PURCHASE' AND debit_note_number IS NOT NULL
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
        
        # Create return record using return_requests table
        # Note: purchase_id can be NULL for direct invoice returns
        result = db.execute(
            text("""
                INSERT INTO return_requests (
                    org_id, return_number, return_date,
                    return_type, purchase_id, supplier_id,
                    return_reason, return_status,
                    total_return_amount, debit_note_number
                ) VALUES (
                    :org_id, :return_number, :return_date,
                    'PURCHASE', NULL, :supplier_id,
                    :reason, 'approved',
                    :total_amount, :debit_note_no
                )
                RETURNING return_id
            """),
            {
                "org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f",  # Default org
                "return_number": return_number,
                "return_date": return_data["return_date"],
                "supplier_id": return_data.get("supplier_id"),
                "reason": return_data.get("return_reason", return_data.get("reason", "")),
                "total_amount": total_amount,
                "debit_note_no": debit_note_no
            }
        ).fetchone()
        
        return_id = result.return_id
        
        # Create return items and update inventory
        for item in selected_items:
            # Insert return item using existing return_items table
            db.execute(
                text("""
                    INSERT INTO return_items (
                        return_id, product_id,
                        batch_id, return_quantity, 
                        original_price, return_price
                    ) VALUES (
                        :return_id, :product_id,
                        :batch_id, :quantity, 
                        :rate, :rate
                    )
                """),
                {
                    "return_id": return_id,
                    "product_id": item["product_id"],
                    "batch_id": item.get("batch_id"),
                    "quantity": item["quantity"],
                    "rate": Decimal(str(item["rate"]))
                }
            )
            
            # Update batch stock (decrease stock for returns to supplier)
            if item.get("batch_id"):
                db.execute(
                    text("""
                        UPDATE batches 
                        SET quantity_available = quantity_available - :quantity,
                            quantity_returned = quantity_returned + :quantity
                        WHERE batch_id = :batch_id
                    """),
                    {
                        "quantity": item["quantity"],
                        "batch_id": item["batch_id"]
                    }
                )
            # Note: If no batch_id, we skip stock update as we can't track non-batch items
                
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
    db: Session = Depends(get_db)
):
    """
    Cancel a purchase return
    """
    try:
        # Get return details
        purchase_return = db.execute(
            text("SELECT * FROM return_requests WHERE return_id = :return_id AND return_type = 'PURCHASE'"),
            {"return_id": return_id}
        ).fetchone()
        
        if not purchase_return:
            raise HTTPException(status_code=404, detail="Return not found")
            
        if purchase_return.return_status == "cancelled":
            raise HTTPException(status_code=400, detail="Return already cancelled")
            
        # Get return items
        items = db.execute(
            text("SELECT * FROM return_items WHERE return_id = :return_id"),
            {"return_id": return_id}
        ).fetchall()
        
        # Reverse batch stock changes
        for item in items:
            if item.batch_id:
                db.execute(
                    text("""
                        UPDATE batches 
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
                UPDATE return_requests 
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
    db: Session = Depends(get_db)
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
            FROM return_requests pr
            LEFT JOIN suppliers s ON pr.supplier_id = s.supplier_id
            WHERE pr.return_id = :return_id AND pr.return_type = 'PURCHASE'
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
            LEFT JOIN products p ON ri.product_id = p.product_id
            LEFT JOIN batches b ON ri.batch_id = b.batch_id
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
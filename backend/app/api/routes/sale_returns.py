"""
Sale Return API Router
Handles returns of sold items with inventory and ledger adjustments
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

router = APIRouter(prefix="/api/v1/sale-returns", tags=["sale-returns"])

@router.get("/")
async def get_sale_returns(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    party_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get list of sale returns with optional filters
    """
    try:
        query = """
            SELECT sr.*, c.customer_name as party_name, 
                   -- Extract invoice number from return items remarks
                   (SELECT SUBSTRING(ri.remarks, 'Invoice: ([^,]+)')
                    FROM return_items ri 
                    WHERE ri.return_id = sr.return_id 
                    LIMIT 1) as original_invoice_number
            FROM return_requests sr
            LEFT JOIN customers c ON sr.customer_id = c.customer_id
            WHERE sr.return_type = 'SALES'
        """
        params = {"skip": skip, "limit": limit}
        
        if party_id:
            query += " AND sr.customer_id = :party_id"
            params["party_id"] = party_id
            
        if from_date:
            query += " AND sr.return_date >= :from_date"
            params["from_date"] = from_date
            
        if to_date:
            query += " AND sr.return_date <= :to_date"
            params["to_date"] = to_date
            
        query += " ORDER BY sr.return_date DESC, sr.created_at DESC LIMIT :limit OFFSET :skip"
        
        returns = db.execute(text(query), params).fetchall()
        
        # Get items for each return
        result = []
        for ret in returns:
            items_query = """
                SELECT sri.*, p.product_name, p.hsn_code
                FROM return_items sri
                LEFT JOIN products p ON sri.product_id = p.product_id
                WHERE sri.return_id = :return_id
            """
            items = db.execute(text(items_query), {"return_id": ret.return_id}).fetchall()
            
            return_dict = dict(ret._mapping)
            return_dict["items"] = [dict(item._mapping) for item in items]
            result.append(return_dict)
            
        # Get total count
        count_query = """
            SELECT COUNT(*) FROM return_requests sr WHERE 1=1 AND sr.return_type = 'SALES'
        """
        if party_id:
            count_query += " AND sr.customer_id = :party_id"
        if from_date:
            count_query += " AND sr.return_date >= :from_date"
        if to_date:
            count_query += " AND sr.return_date <= :to_date"
            
        total = db.execute(text(count_query), params).scalar()
        
        return {
            "total": total,
            "returns": result
        }
        
    except Exception as e:
        logger.error(f"Error fetching sale returns: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/returnable-invoices")
async def get_returnable_invoices(
    party_id: Optional[str] = None,
    invoice_number: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get sales invoices that can be returned
    """
    try:
        query = """
            SELECT 
                i.invoice_id,
                i.invoice_number,
                i.invoice_date,
                i.customer_id as party_id,
                p.party_name,
                i.total_amount as grand_total,
                COUNT(ii.item_id) as total_items
            FROM invoices i
            LEFT JOIN parties p ON i.customer_id = p.party_id
            LEFT JOIN invoice_items ii ON i.invoice_id = ii.invoice_id
            WHERE i.invoice_status = 'generated'
        """
        params = {}
        
        if party_id:
            query += " AND i.customer_id = :party_id"
            params["party_id"] = party_id
            
        if invoice_number:
            query += " AND i.invoice_number LIKE :invoice_number"
            params["invoice_number"] = f"%{invoice_number}%"
            
        query += """ 
            GROUP BY i.invoice_id, i.invoice_number, i.invoice_date, 
                     i.customer_id, p.party_name, i.total_amount
            ORDER BY i.invoice_date DESC
            LIMIT 50
        """
        
        invoices = db.execute(text(query), params).fetchall()
        
        result = []
        for inv in invoices:
            # Check how much has already been returned
            returned_query = """
                SELECT COALESCE(SUM(sri.return_quantity), 0) as total_returned
                FROM return_requests sr
                JOIN return_items sri ON sr.return_id = sri.return_id
                WHERE sr.order_id = :invoice_id AND sr.return_type = 'SALES'
            """
            total_returned = db.execute(
                text(returned_query), 
                {"invoice_id": inv.invoice_id}
            ).scalar()
            
            invoice_dict = dict(inv._mapping)
            invoice_dict["has_returns"] = total_returned > 0
            invoice_dict["can_return"] = True  # Can be refined based on business rules
            result.append(invoice_dict)
            
        return {"invoices": result}
        
    except Exception as e:
        logger.error(f"Error fetching returnable invoices: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/invoice/{invoice_id}/items")
async def get_invoice_items_for_return(
    invoice_id: str,
    db: Session = Depends(get_db)
):
    """
    Get items from a specific invoice for return
    """
    try:
        # Get invoice details
        invoice = db.execute(
            text("SELECT * FROM invoices WHERE invoice_id = :invoice_id"),
            {"invoice_id": invoice_id}
        ).first()
        
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
            
        # Get items with return info
        items_query = """
            SELECT 
                si.*,
                p.product_name,
                p.hsn_code,
                COALESCE(SUM(sri.return_quantity), 0) as returned_quantity
            FROM invoice_items ii
            LEFT JOIN products p ON ii.product_id = p.product_id
            LEFT JOIN (
                SELECT r.product_id, r.batch_id, SUM(r.return_quantity) as return_quantity
                FROM return_items r
                JOIN return_requests sr ON r.return_id = sr.return_id  
                WHERE sr.order_id = :invoice_id AND sr.return_type = 'SALES'
                GROUP BY r.product_id, r.batch_id
            ) sri ON (sri.product_id = ii.product_id AND (sri.batch_id = ii.batch_id OR (sri.batch_id IS NULL AND ii.batch_id IS NULL)))
            WHERE ii.invoice_id = :invoice_id
            GROUP BY ii.item_id, p.product_name, p.hsn_code
        """
        
        items = db.execute(text(items_query), {"invoice_id": invoice_id, "invoice_pattern": f"%Invoice: {invoice_id}%"}).fetchall()
        
        result_items = []
        for item in items:
            item_dict = dict(item._mapping)
            item_dict["returnable_quantity"] = item.quantity - item.returned_quantity
            item_dict["can_return"] = item_dict["returnable_quantity"] > 0
            result_items.append(item_dict)
            
        return {
            "sale": dict(sale._mapping),
            "items": result_items
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching invoice items: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/")
async def create_sale_return(
    return_data: dict,
    db: Session = Depends(get_db)
):
    """
    Create a new sale return and generate credit note if customer has GST
    """
    try:
        # Validate required fields
        required_fields = ["invoice_id", "customer_id", "return_date", "items"]
        for field in required_fields:
            if field not in return_data:
                # Handle both old and new field names
                if field == "invoice_id" and "original_sale_id" in return_data:
                    return_data["invoice_id"] = return_data["original_sale_id"]
                elif field == "customer_id" and "party_id" in return_data:
                    return_data["customer_id"] = return_data["party_id"]
                else:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Missing required field: {field}"
                    )
                
        if not return_data["items"]:
            raise HTTPException(
                status_code=400,
                detail="At least one item must be returned"
            )
            
        # Generate return number with invoice reference
        invoice_id = return_data.get("invoice_id", "")
        return_number = f"SR-{datetime.now().strftime('%Y%m%d-%H%M%S')}-INV{invoice_id}"
        
        # Get customer details to check for GST
        customer = db.execute(
            text("""
                SELECT customer_id, customer_name, gst_number
                FROM customers
                WHERE customer_id = :customer_id
            """),
            {"customer_id": return_data["customer_id"]}
        ).fetchone()
        
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
            
        # Generate credit note number if customer has GST
        credit_note_no = None
        if customer.gst_number:
            credit_note_no = f"CN-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        
        # Calculate totals
        subtotal = Decimal("0")
        tax_amount = Decimal("0")
        total_amount = Decimal("0")
        
        for item in return_data["items"]:
            item_total = Decimal(str(item["quantity"])) * Decimal(str(item["rate"]))
            # Always calculate tax (all customers paid it)
            item_tax = item_total * Decimal(str(item.get("tax_percent", 0))) / 100
            
            subtotal += item_total
            tax_amount += item_tax
            total_amount += item_total + item_tax
            
        # Create return record using return_requests table
        # Note: order_id can be NULL for direct invoice returns
        result = db.execute(
            text("""
                INSERT INTO return_requests (
                    org_id, return_number, return_date,
                    return_type, order_id, customer_id,
                    return_reason, return_status,
                    total_return_amount, credit_note_number
                ) VALUES (
                    :org_id, :return_number, :return_date,
                    'SALES', NULL, :customer_id,
                    :reason, 'approved',
                    :total_amount, :credit_note_no
                )
                RETURNING return_id
            """),
            {
                "org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f",  # Default org
                "return_number": return_number,
                "return_date": return_data["return_date"],
                "customer_id": return_data.get("customer_id", return_data.get("party_id")),
                "reason": return_data.get("return_reason", return_data.get("reason", "")),
                "total_amount": total_amount,
                "credit_note_no": credit_note_no
            }
        ).fetchone()
        
        return_id = result.return_id
        
        # Create return items and update inventory
        for item in return_data["items"]:
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
            
            # Update batch stock (increase stock for returns)
            if item.get("batch_id"):
                db.execute(
                    text("""
                        UPDATE batches 
                        SET quantity_available = quantity_available + :quantity,
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
        # For now, we'll skip ledger updates to avoid errors
        # The credit adjustment functionality will be added later
            
        db.commit()
        
        return {
            "status": "success",
            "return_id": return_id,
            "return_number": return_number,
            "credit_note_no": credit_note_no,
            "total_amount": float(total_amount),
            "has_gst": bool(customer.gst_number),
            "message": f"Sale return {return_number} created successfully" + (f" with credit note {credit_note_no}" if credit_note_no else "")
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating sale return: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{return_id}")
async def get_sale_return_detail(
    return_id: str,
    db: Session = Depends(get_db)
):
    """
    Get detailed information about a specific sale return
    """
    try:
        # Get return details
        return_query = """
            SELECT sr.*, c.customer_name as party_name, c.gst_number as party_gst,
                   -- Extract invoice number from return items remarks
                   (SELECT SUBSTRING(ri.remarks, 'Invoice: ([^,]+)')
                    FROM return_items ri 
                    WHERE ri.return_id = sr.return_id 
                    LIMIT 1) as original_invoice_number
            FROM return_requests sr
            LEFT JOIN customers c ON sr.customer_id = c.customer_id
            WHERE sr.return_id = :return_id AND sr.return_type = 'SALES'
        """
        
        sale_return = db.execute(
            text(return_query), 
            {"return_id": return_id}
        ).first()
        
        if not sale_return:
            raise HTTPException(status_code=404, detail="Sale return not found")
            
        # Get return items
        items_query = """
            SELECT sri.*, p.product_name, p.hsn_code,
                   b.batch_number, b.expiry_date
            FROM return_items sri
            LEFT JOIN products p ON sri.product_id = p.product_id
            LEFT JOIN batches b ON sri.batch_id = b.batch_id
            WHERE sri.return_id = :return_id
        """
        
        items = db.execute(
            text(items_query), 
            {"return_id": return_id}
        ).fetchall()
        
        result = dict(sale_return._mapping)
        result["items"] = [dict(item._mapping) for item in items]
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching sale return detail: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{return_id}")
async def cancel_sale_return(
    return_id: str,
    db: Session = Depends(get_db)
):
    """
    Cancel a sale return (if allowed by business rules)
    """
    try:
        # Check if return exists
        sale_return = db.execute(
            text("SELECT * FROM sale_returns WHERE return_id = :return_id"),
            {"return_id": return_id}
        ).first()
        
        if not sale_return:
            raise HTTPException(status_code=404, detail="Sale return not found")
            
        if sale_return.return_status == "cancelled":
            raise HTTPException(status_code=400, detail="Return already cancelled")
            
        # Get return items to reverse inventory
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
                        SET quantity_available = quantity_available - :quantity,
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
                UPDATE sale_returns 
                SET return_status = 'cancelled',
                    updated_at = CURRENT_TIMESTAMP
                WHERE return_id = :return_id
            """),
            {"return_id": return_id}
        )
        
        db.commit()
        
        return {
            "status": "success",
            "message": f"Sale return {sale_return.return_number} cancelled successfully"
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error cancelling sale return: {e}")
        raise HTTPException(status_code=500, detail=str(e))
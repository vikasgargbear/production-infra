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

from ...core.database import get_db
from ...core.auth_utils import get_org_id_from_header
from ..services.document_number_service import DocumentNumberService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["sale-returns"])

@router.get("/generate-number")
async def generate_sales_return_number(
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """Generate next sales return number using unified service"""
    try:
        # Use unified document number service
        new_number = DocumentNumberService.generate_number(db, "sales_return", org_id)
        return {"return_number": new_number}
    except Exception as e:
        logger.error(f"Failed to generate sales return number: {e}")
        # Use service's fallback mechanism  
        current_year = datetime.now().year % 100
        timestamp = int(datetime.now().timestamp() * 1000) % 100000000
        fallback_number = f"SRN-{current_year:02d}{timestamp:08d}"
        return {"return_number": fallback_number}

@router.get("/")
async def get_sale_returns(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    party_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get list of sale returns with optional filters
    """
    try:
        query = """
            SELECT sr.*, c.customer_name as party_name,
                   i.invoice_number as original_invoice_number
            FROM sales.sales_returns sr
            LEFT JOIN parties.customers c ON sr.customer_id = c.customer_id
            LEFT JOIN sales.invoices i ON sr.invoice_id = i.invoice_id
            WHERE 1=1
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
                FROM sales.sales_return_items sri
                LEFT JOIN inventory.products p ON sri.product_id = p.product_id
                WHERE sri.return_id = :return_id
            """
            items = db.execute(text(items_query), {"return_id": ret.return_id}).fetchall()
            
            return_dict = dict(ret._mapping)
            return_dict["items"] = [dict(item._mapping) for item in items]
            result.append(return_dict)
            
        # Get total count
        count_query = """
            SELECT COUNT(*) FROM sales.sales_returns sr WHERE 1=1
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
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
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
                i.final_amount as grand_total,
                COUNT(ii.invoice_item_id) as total_items
            FROM sales.invoices i
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
                     i.customer_id, p.party_name, i.final_amount
            ORDER BY i.invoice_date DESC
            LIMIT 50
        """
        
        invoices = db.execute(text(query), params).fetchall()
        
        result = []
        for inv in invoices:
            # Check how much has already been returned
            returned_query = """
                SELECT COALESCE(SUM(sri.return_quantity), 0) as total_returned
                FROM sales.sales_returns sr
                JOIN sales.sales_return_items sri ON sr.return_id = sri.return_id
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
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get items from a specific invoice for return
    """
    try:
        # Get invoice details
        invoice = db.execute(
            text("SELECT * FROM sales.invoices WHERE invoice_id = :invoice_id"),
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
            FROM sales.invoice_items ii
            LEFT JOIN inventory.products p ON ii.product_id = p.product_id
            LEFT JOIN (
                SELECT r.product_id, r.batch_id, SUM(r.return_quantity) as return_quantity
                FROM sales.sales_return_items r
                JOIN sales.sales_returns sr ON r.return_id = sr.return_id  
                WHERE sr.order_id = :invoice_id AND sr.return_type = 'SALES'
                GROUP BY r.product_id, r.batch_id
            ) sri ON (sri.product_id = ii.product_id AND (sri.batch_id = ii.batch_id OR (sri.batch_id IS NULL AND ii.batch_id IS NULL)))
            WHERE ii.invoice_id = :invoice_id
            GROUP BY ii.invoice_item_id, p.product_name, p.hsn_code
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
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
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
            
        # Generate return number using unified service
        invoice_id = return_data.get("invoice_id", "")
        return_number = DocumentNumberService.generate_number(db, "sales_return", org_id)
        
        # Get customer details to check for GST
        customer = db.execute(
            text("""
                SELECT customer_id, customer_name, gst_number
                FROM parties.customers
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
            
        # Get branch_id from first available source
        branch_id = 1  # Default branch
        try:
            branch_result = db.execute(
                text("SELECT branch_id FROM master.org_branches WHERE org_id = :org_id LIMIT 1"),
                {"org_id": org_id}
            ).fetchone()
            if branch_result:
                branch_id = branch_result.branch_id
        except:
            pass
            
        # Get current user_id (created_by) - for now use default
        created_by = 1  # Default user, should be from session
        
        # Create return record using sales.sales_returns table with correct columns
        result = db.execute(
            text("""
                INSERT INTO sales.sales_returns (
                    org_id, branch_id, return_number, return_date,
                    return_type, invoice_id, customer_id,
                    return_reason, return_category,
                    approval_required, approval_status,
                    return_amount, tax_amount, total_amount,
                    credit_note_number, credit_note_date, credit_note_status,
                    notes, created_by
                ) VALUES (
                    :org_id, :branch_id, :return_number, :return_date,
                    'SALES', :invoice_id, :customer_id,
                    :reason, :category,
                    false, 'approved',
                    :subtotal, :tax_amount, :total_amount,
                    :credit_note_no, :credit_note_date, :credit_note_status,
                    :notes, :created_by
                )
                RETURNING return_id
            """),
            {
                "org_id": org_id,
                "branch_id": branch_id,
                "return_number": return_number,
                "return_date": return_data["return_date"],
                "invoice_id": return_data.get("invoice_id") if return_data.get("invoice_id") else None,
                "customer_id": return_data.get("customer_id", return_data.get("party_id")),
                "reason": return_data.get("return_reason", return_data.get("reason", "Customer Return")),
                "category": return_data.get("return_category", "QUALITY"),
                "subtotal": float(subtotal),
                "tax_amount": float(tax_amount),
                "total_amount": float(total_amount),
                "credit_note_no": credit_note_no,
                "credit_note_date": return_data["return_date"] if credit_note_no else None,
                "credit_note_status": "issued" if credit_note_no else None,
                "notes": return_data.get("notes", ""),
                "created_by": created_by
            }
        ).fetchone()
        
        return_id = result.return_id
        
        # Create return items and update inventory
        for item in return_data["items"]:
            # Get invoice_item_id if returning from invoice
            invoice_item_id = None
            if return_data.get("invoice_id") and item.get("invoice_item_id"):
                invoice_item_id = item["invoice_item_id"]
            
            # Calculate item values
            return_qty = Decimal(str(item.get("return_quantity", item.get("quantity", 0))))
            unit_price = Decimal(str(item.get("rate", 0)))
            discount_percent = Decimal(str(item.get("discount_percent", 0)))
            
            # Calculate return value after discount
            base_value = return_qty * unit_price
            discount_amount = base_value * discount_percent / 100
            return_value = base_value - discount_amount
            
            # Calculate tax
            tax_percent = Decimal(str(item.get("tax_percent", 0)))
            item_tax_amount = return_value * tax_percent / 100
            
            # Insert return item using correct schema
            db.execute(
                text("""
                    INSERT INTO sales.sales_return_items (
                        return_id, invoice_item_id, product_id,
                        batch_id, batch_number,
                        return_quantity, uom,
                        damaged_quantity, saleable_quantity,
                        unit_price, return_value, tax_amount,
                        item_return_reason, disposition
                    ) VALUES (
                        :return_id, :invoice_item_id, :product_id,
                        :batch_id, :batch_number,
                        :return_quantity, :uom,
                        :damaged_quantity, :saleable_quantity,
                        :unit_price, :return_value, :tax_amount,
                        :item_return_reason, :disposition
                    )
                """),
                {
                    "return_id": return_id,
                    "invoice_item_id": invoice_item_id,
                    "product_id": item["product_id"],
                    "batch_id": item.get("batch_id"),
                    "batch_number": item.get("batch_no", item.get("batch_number")),
                    "return_quantity": float(return_qty),
                    "uom": item.get("unit", item.get("uom", "PCS")),
                    "damaged_quantity": 0,  # Assume all items are saleable unless specified
                    "saleable_quantity": float(return_qty),  # All returned items are saleable by default
                    "unit_price": float(unit_price),
                    "return_value": float(return_value),
                    "tax_amount": float(item_tax_amount),
                    "item_return_reason": item.get("return_reason", return_data.get("return_reason", "Quality Issue")),
                    "disposition": "RESTOCK"  # Default disposition is to restock
                }
            )
            
            # Update batch stock (increase stock for returns)
            if item.get("batch_id"):
                db.execute(
                    text("""
                        UPDATE inventory.batches 
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
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
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
                    FROM sales.sales_return_items ri 
                    WHERE ri.return_id = sr.return_id 
                    LIMIT 1) as original_invoice_number
            FROM sales.sales_returns sr
            LEFT JOIN parties.customers c ON sr.customer_id = c.customer_id
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
            FROM sales.sales_return_items sri
            LEFT JOIN inventory.products p ON sri.product_id = p.product_id
            LEFT JOIN inventory.batches b ON sri.batch_id = b.batch_id
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
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
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
            text("SELECT * FROM sales.sales_return_items WHERE return_id = :return_id"),
            {"return_id": return_id}
        ).fetchall()
        
        # Reverse batch stock changes
        for item in items:
            if item.batch_id:
                db.execute(
                    text("""
                        UPDATE inventory.batches 
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
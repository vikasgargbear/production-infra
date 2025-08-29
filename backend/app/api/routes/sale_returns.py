"""
Sale Return API Router
Handles returns of sold items with inventory and ledger adjustments
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import datetime
from decimal import Decimal
import uuid

from ...core.database import get_db
from ...core.auth_utils import get_org_id_from_header
from ..services.document_number_service import DocumentNumberService

# Pydantic models for request validation
class ReturnItem(BaseModel):
    product_id: int
    invoice_item_id: Optional[int] = None
    batch_id: Optional[int] = None
    batch_no: Optional[str] = None
    return_quantity: float
    quantity: Optional[float] = None  # Alias for return_quantity
    rate: float
    tax_percent: float = 0
    discount_percent: float = 0
    unit: str = "PCS"
    return_reason: Optional[str] = None

class SaleReturnCreate(BaseModel):
    customer_id: int
    invoice_id: Optional[int] = None
    return_date: str
    return_reason: str
    return_method: str = "credit_note"
    return_category: str = "QUALITY"
    notes: Optional[str] = ""
    items: List[ReturnItem]

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
                c.customer_name as party_name,
                i.final_amount as grand_total,
                i.paid_amount,
                COUNT(DISTINCT ii.invoice_item_id) as total_items,
                SUM(ii.quantity) as total_quantity
            FROM sales.invoices i
            LEFT JOIN parties.customers c ON i.customer_id = c.customer_id
            LEFT JOIN sales.invoice_items ii ON i.invoice_id = ii.invoice_id
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
                     i.customer_id, c.customer_name, i.final_amount, i.paid_amount
            ORDER BY i.invoice_date DESC
            LIMIT 50
        """
        
        invoices = db.execute(text(query), params).fetchall()
        
        result = []
        for inv in invoices:
            invoice_dict = dict(inv._mapping)
            invoice_dict["has_returns"] = False  # Will be checked separately if needed
            invoice_dict["returnable_quantity"] = float(inv.total_quantity) if inv.total_quantity else 0
            invoice_dict["can_return"] = True  # Allow all invoices to be returned
            result.append(invoice_dict)
            
        return {"invoices": result}
        
    except Exception as e:
        logger.error(f"Error fetching returnable invoices: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/invoice/{invoice_id}/returns")
async def get_returns_for_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get all returns for a specific invoice
    """
    try:
        # Get all returns for this invoice
        returns_query = """
            SELECT 
                sr.return_id,
                sr.return_number,
                sr.return_date,
                sr.return_reason,
                sr.total_amount,
                sr.credit_note_number,
                sr.credit_note_status,
                COUNT(sri.return_item_id) as item_count,
                SUM(sri.return_quantity) as total_quantity_returned
            FROM sales.sales_returns sr
            LEFT JOIN sales.sales_return_items sri ON sr.return_id = sri.return_id
            WHERE sr.invoice_id = :invoice_id
            GROUP BY sr.return_id, sr.return_number, sr.return_date, 
                     sr.return_reason, sr.total_amount, sr.credit_note_number, 
                     sr.credit_note_status
            ORDER BY sr.return_date DESC
        """
        
        returns = db.execute(text(returns_query), {"invoice_id": invoice_id}).fetchall()
        
        return {
            "invoice_id": invoice_id,
            "has_returns": len(returns) > 0,
            "return_count": len(returns),
            "returns": [dict(r._mapping) for r in returns] if returns else []
        }
        
    except Exception as e:
        logger.error(f"Error fetching returns for invoice: {e}")
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
            
        # Get items with comprehensive return info
        items_query = """
            SELECT 
                ii.*,
                p.product_name,
                p.hsn_code,
                COALESCE(ret.total_returned, 0) as returned_quantity,
                COALESCE(ret.saleable_returned, 0) as saleable_returned,
                COALESCE(ret.damaged_returned, 0) as damaged_returned,
                ret.return_numbers,
                ret.last_return_date
            FROM sales.invoice_items ii
            LEFT JOIN inventory.products p ON ii.product_id = p.product_id
            LEFT JOIN (
                SELECT 
                    sri.product_id,
                    sri.batch_id,
                    SUM(sri.return_quantity) as total_returned,
                    SUM(sri.saleable_quantity) as saleable_returned,
                    SUM(sri.damaged_quantity) as damaged_returned,
                    STRING_AGG(DISTINCT sr.return_number, ', ') as return_numbers,
                    MAX(sr.return_date) as last_return_date
                FROM sales.sales_return_items sri
                JOIN sales.sales_returns sr ON sri.return_id = sr.return_id
                WHERE sr.invoice_id = :invoice_id
                GROUP BY sri.product_id, sri.batch_id
            ) ret ON (ret.product_id = ii.product_id 
                     AND (ret.batch_id = ii.batch_id OR (ret.batch_id IS NULL AND ii.batch_id IS NULL)))
            WHERE ii.invoice_id = :invoice_id
        """
        
        items = db.execute(text(items_query), {"invoice_id": invoice_id}).fetchall()
        
        result_items = []
        for item in items:
            item_dict = dict(item._mapping)
            
            # Calculate returnable quantity (original - returned)
            original_qty = float(item.quantity) if item.quantity else 0
            returned_qty = float(item.returned_quantity) if item.returned_quantity else 0
            
            item_dict["original_quantity"] = original_qty
            item_dict["returned_quantity"] = returned_qty
            item_dict["returnable_quantity"] = max(0, original_qty - returned_qty)
            item_dict["can_return"] = item_dict["returnable_quantity"] > 0
            
            # Add return status
            if returned_qty > 0:
                if returned_qty >= original_qty:
                    item_dict["return_status"] = "FULLY_RETURNED"
                else:
                    item_dict["return_status"] = "PARTIALLY_RETURNED"
            else:
                item_dict["return_status"] = "NOT_RETURNED"
            
            # Include return history
            item_dict["return_numbers"] = item.return_numbers
            item_dict["last_return_date"] = item.last_return_date
            
            result_items.append(item_dict)
            
        return {
            "invoice": dict(invoice._mapping),
            "items": result_items
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching invoice items: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/")
async def create_sale_return(
    return_data: SaleReturnCreate,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Create a new sale return and generate credit note if customer has GST
    """
    try:
        # Convert Pydantic model to dict for easier manipulation
        return_dict = return_data.dict()
        
        if not return_dict["items"]:
            raise HTTPException(
                status_code=400,
                detail="At least one item must be returned"
            )
            
        # Generate return number using unified service
        invoice_id = return_dict.get("invoice_id", "")
        return_number = DocumentNumberService.generate_number(db, "sales_return", org_id)
        
        # Get customer details to check for GST
        customer = db.execute(
            text("""
                SELECT customer_id, customer_name, gst_number
                FROM parties.customers
                WHERE customer_id = :customer_id
            """),
            {"customer_id": return_dict["customer_id"]}
        ).fetchone()
        
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
            
        # Generate credit note number if customer has GST
        credit_note_no = None
        if customer.gst_number:
            credit_note_no = f"CN-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        
        # Calculate totals with proper discount handling
        subtotal = Decimal("0")  # This will be the taxable amount after discounts
        tax_amount = Decimal("0")
        cgst_amount = Decimal("0")
        sgst_amount = Decimal("0")
        igst_amount = Decimal("0")
        total_amount = Decimal("0")
        
        for item in return_dict["items"]:
            # Handle both return_quantity and quantity field names
            qty = Decimal(str(item.get("return_quantity") or item.get("quantity", 0)))
            rate = Decimal(str(item.get("rate", 0)))
            discount_percent = Decimal(str(item.get("discount_percent", 0)))
            tax_percent = Decimal(str(item.get("tax_percent", 0)))
            
            # Calculate with discount
            base_amount = qty * rate
            discount_amount = (base_amount * discount_percent) / 100
            taxable_amount = base_amount - discount_amount
            
            # Calculate tax on discounted amount
            item_tax = (taxable_amount * tax_percent) / 100
            
            # For intra-state, split tax into CGST and SGST
            # TODO: Check if inter-state based on customer state vs org state
            item_cgst = item_tax / 2
            item_sgst = item_tax / 2
            
            subtotal += taxable_amount  # Subtotal is the taxable amount after discount
            tax_amount += item_tax
            cgst_amount += item_cgst
            sgst_amount += item_sgst
            total_amount += taxable_amount + item_tax
            
        # Get branch_id from first available source
        branch_id = None
        try:
            branch_result = db.execute(
                text("SELECT branch_id FROM master.org_branches WHERE org_id = :org_id LIMIT 1"),
                {"org_id": org_id}
            ).fetchone()
            if branch_result:
                branch_id = branch_result.branch_id
        except:
            pass
        
        if not branch_id:
            # If no branch exists, create a default one
            branch_id = 1
            
        # Get first user_id from org_users for this org
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
                        INSERT INTO master.org_users (org_id, username, email, role, is_active)
                        VALUES (:org_id, 'system', 'system@pharma.local', 'admin', true)
                        ON CONFLICT (org_id, username) DO UPDATE SET username = 'system'
                        RETURNING user_id
                    """),
                    {"org_id": org_id}
                ).fetchone()
                created_by = result.user_id if result else 1
            except:
                # If all else fails, try to use 1 and hope it exists
                created_by = 1
        
        # Create return record using sales.sales_returns table with correct columns
        result = db.execute(
            text("""
                INSERT INTO sales.sales_returns (
                    org_id, branch_id, return_number, return_date,
                    return_type, invoice_id, customer_id,
                    return_reason, return_category,
                    approval_required, approval_status,
                    return_amount, tax_amount, total_amount,
                    cgst_amount, sgst_amount, igst_amount,
                    credit_note_number, credit_note_date, credit_note_status,
                    adjusted_amount, pending_amount,
                    notes, created_by
                ) VALUES (
                    :org_id, :branch_id, :return_number, :return_date,
                    'SALES', :invoice_id, :customer_id,
                    :reason, :category,
                    false, 'approved',
                    :subtotal, :tax_amount, :total_amount,
                    :cgst_amount, :sgst_amount, :igst_amount,
                    :credit_note_no, :credit_note_date, :credit_note_status,
                    0, :total_amount,
                    :notes, :created_by
                )
                RETURNING return_id
            """),
            {
                "org_id": org_id,
                "branch_id": branch_id,
                "return_number": return_number,
                "return_date": return_dict["return_date"],
                "invoice_id": return_dict.get("invoice_id") if return_dict.get("invoice_id") else None,
                "customer_id": return_dict["customer_id"],
                "reason": return_dict.get("return_reason", "Customer Return"),
                "category": return_dict.get("return_category", "QUALITY"),
                "subtotal": float(subtotal),
                "tax_amount": float(tax_amount),
                "total_amount": float(total_amount),
                "cgst_amount": float(cgst_amount),
                "sgst_amount": float(sgst_amount),
                "igst_amount": float(igst_amount),
                "credit_note_no": credit_note_no,
                "credit_note_date": return_dict["return_date"] if credit_note_no else None,
                "credit_note_status": "issued" if credit_note_no else None,
                "notes": return_dict.get("notes", ""),
                "created_by": created_by
            }
        ).fetchone()
        
        return_id = result.return_id
        
        # Create return items and update inventory
        for item in return_dict["items"]:
            # Get invoice_item_id if returning from invoice
            invoice_item_id = None
            if return_dict.get("invoice_id") and item.get("invoice_item_id"):
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
            
            # Get batch_id from batch_number if not provided
            batch_id = item.get("batch_id")
            batch_number = item.get("batch_no") or item.get("batch_number")
            
            # If we have batch_number but no batch_id, try to look it up
            if batch_number and not batch_id:
                batch_result = db.execute(
                    text("""
                        SELECT batch_id 
                        FROM inventory.batches 
                        WHERE batch_number = :batch_number 
                        AND product_id = :product_id
                        LIMIT 1
                    """),
                    {
                        "batch_number": batch_number,
                        "product_id": item["product_id"]
                    }
                ).fetchone()
                
                if batch_result:
                    batch_id = batch_result.batch_id
            
            # Determine disposition and quantities based on return reason
            item_return_reason = item.get("reason") or item.get("return_reason") or return_dict.get("return_reason", "Quality Issue")
            
            # Define reason categories that result in damaged/unsaleable items
            damaged_reasons = [
                "damaged", "broken", "expired", "expiry", "quality issue", "defective", 
                "contaminated", "leaking", "melted", "manufacturing defect"
            ]
            
            # Check if the reason indicates damaged/unsaleable items
            is_damaged = any(reason in item_return_reason.lower() for reason in damaged_reasons)
            
            if is_damaged:
                # Items are damaged and cannot be resold
                damaged_qty = float(return_qty)
                saleable_qty = 0
                disposition = "DESTROY"  # or "QUARANTINE" based on business rules
            else:
                # Items are saleable and can be restocked
                damaged_qty = 0
                saleable_qty = float(return_qty)
                disposition = "RESTOCK"
            
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
                    "batch_id": batch_id,
                    "batch_number": batch_number,
                    "return_quantity": float(return_qty),
                    "uom": item.get("unit", item.get("uom", "PCS")),
                    "damaged_quantity": damaged_qty,
                    "saleable_quantity": saleable_qty,
                    "unit_price": float(unit_price),
                    "return_value": float(return_value),
                    "tax_amount": float(item_tax_amount),
                    "item_return_reason": item_return_reason,
                    "disposition": disposition
                }
            )
            
            # Update batch stock (only increase for saleable items)
            if batch_id and saleable_qty > 0:
                db.execute(
                    text("""
                        UPDATE inventory.batches 
                        SET quantity_available = quantity_available + :saleable_qty,
                            quantity_returned = COALESCE(quantity_returned, 0) + :total_qty
                        WHERE batch_id = :batch_id
                    """),
                    {
                        "saleable_qty": saleable_qty,  # Only saleable items go back to available stock
                        "total_qty": float(return_qty),  # Track total returned (damaged + saleable)
                        "batch_id": batch_id
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
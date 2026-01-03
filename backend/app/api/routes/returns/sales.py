"""
Sale Return API Router
Handles returns of sold items with inventory and ledger adjustments

MODERNIZED: Uses TenantAwareSession + centralized schemas from schemas/returns.py
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

from ....core.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from ....core.org_context import get_org_context, OrgContext
from ....core.permissions import PermissionChecker  # RBAC
from ....core.constants import ReturnStatus, StockMovementType
from ...services.document_number_service import DocumentNumberService
from ...services.gst_service import GSTService
from ...services.inventory.inventory_service import InventoryService
from ...services.returns.return_service import ReturnService
from ...schemas.inventory.inventory import StockMovementCreate
from ...schemas.sales.returns import SalesReturnItem as ReturnItem, SalesReturnCreate as SaleReturnCreate
from ....utils.branch_utils import get_default_branch_id
from datetime import date

# Note: Schema classes moved to schemas/returns.py
# - ReturnItem (now SalesReturnItem)
# - SaleReturnCreate (now SalesReturnCreate)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["sale-returns"])

@router.get("/generate-number")
@with_tenant_context
async def generate_sales_return_number(
    _: dict = Depends(PermissionChecker("sales_returns", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Generate next sales return number using unified service"""
    try:
        org_id = str(context.org_id)
        # Use unified document number service
        new_number = DocumentNumberService.generate_number(db, "sales_return", org_id)
        return {"return_number": new_number}
    except Exception as e:
        logger.error(f"Failed to generate sales return number: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate return number: {str(e)}")

@router.get("/")
@with_tenant_context
async def get_sale_returns(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    party_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    _: dict = Depends(PermissionChecker("sales_returns", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    org_id = str(context.org_id)
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
@with_tenant_context
async def get_returnable_invoices(
    party_id: Optional[str] = None,
    invoice_number: Optional[str] = None,
    _: dict = Depends(PermissionChecker("sales_returns", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    org_id = str(context.org_id)
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
@with_tenant_context
async def get_returns_for_invoice(
    invoice_id: int,
    _: dict = Depends(PermissionChecker("sales_returns", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    org_id = str(context.org_id)
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

@router.get("/invoice/{invoice_id}/returnable-items")
@with_tenant_context
async def get_returnable_items(
    invoice_id: int,
    _: dict = Depends(PermissionChecker("sales_returns", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    org_id = str(context.org_id)
    """
    Get invoice items with accurate returnable quantities
    """
    try:
        # Get invoice items with already returned quantities
        items = db.execute(
            text("""
                SELECT 
                    ii.invoice_item_id,
                    ii.product_id,
                    p.product_name,
                    ii.batch_id,
                    ii.batch_number,
                    ii.quantity as invoice_quantity,
                    ii.free_quantity,
                    ii.quantity - COALESCE(ii.free_quantity, 0) as paid_quantity,
                    COALESCE(SUM(sri.return_quantity), 0) as already_returned,
                    ii.quantity - COALESCE(SUM(sri.return_quantity), 0) as returnable_quantity,
                    ii.unit_price,
                    ii.discount_percent,
                    ii.gst_percent as tax_percent,
                    ii.total_amount,
                    p.hsn_code,
                    ii.unit
                FROM sales.invoice_items ii
                JOIN inventory.products p ON ii.product_id = p.product_id
                LEFT JOIN sales.sales_return_items sri ON ii.invoice_item_id = sri.invoice_item_id
                WHERE ii.invoice_id = :invoice_id
                GROUP BY ii.invoice_item_id, p.product_name, p.hsn_code
                HAVING ii.quantity - COALESCE(SUM(sri.return_quantity), 0) > 0
                ORDER BY ii.invoice_item_id
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
                "already_returned": float(item.already_returned),
                "returnable_quantity": float(item.returnable_quantity),
                "max_returnable_qty": float(item.returnable_quantity),
                "unit_price": float(item.unit_price),
                "discount_percent": float(item.discount_percent) if item.discount_percent else 0,
                "tax_percent": float(item.tax_percent) if item.tax_percent else 0,
                "hsn_code": item.hsn_code,
                "unit": item.unit,
                "can_return": float(item.returnable_quantity) > 0
            })
        
        return {"items": result}
        
    except Exception as e:
        logger.error(f"Error fetching returnable items: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/invoice/{invoice_id}/items")
@with_tenant_context
async def get_invoice_items_for_return(
    invoice_id: str,
    _: dict = Depends(PermissionChecker("sales_returns", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    org_id = str(context.org_id)
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
@with_tenant_context
async def create_sale_return(
    return_data: SaleReturnCreate,
    _: dict = Depends(PermissionChecker("sales_returns", "create")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    org_id = str(context.org_id)
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
        
        # Calculate totals using ReturnService (DRY)
        # Determine GST type automatically based on org state vs customer state
        gst_type = GSTService.determine_gst_type(
            db=db,
            org_id=context.org_id,
            customer_id=return_dict["customer_id"]
        )
        totals = ReturnService.calculate_return_totals(return_dict["items"], gst_type)
        
        subtotal = totals["subtotal"]
        tax_amount = totals["tax_amount"]
        cgst_amount = totals["cgst_amount"]
        sgst_amount = totals["sgst_amount"]
        igst_amount = totals["igst_amount"]
        total_amount = totals["total_amount"]
            
        # SECURITY FIX: Get branch_id and created_by from authenticated context
        # Previously: Random first user/branch from DB - now uses JWT-verified values
        branch_id = context.primary_branch_id  # User's assigned branch from JWT
        created_by = context.user_id  # Authenticated user from JWT
        
        # Fallback to org's default location if user has no branch assigned
        if not branch_id:
            try:
                branch_id = get_default_branch_id(db, org_id)
            except ValueError as e:
                logger.error(f"No default branch for org {org_id}: {e}")
                raise HTTPException(status_code=400, detail="No active branch found for organization")
        
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
            free_qty = Decimal(str(item.get("free_quantity", 0)))
            unit_price = Decimal(str(item.get("rate", 0)))
            discount_percent = Decimal(str(item.get("discount_percent", 0)))
            
            # Calculate creditable quantity (only paid items get credit, not free items)
            creditable_qty = max(Decimal("0"), return_qty - free_qty)
            
            # Check if tax_percent was explicitly provided by frontend
            # Frontend can explicitly set tax_percent=0 to indicate "no GST return"
            tax_percent_provided = "tax_percent" in item and item["tax_percent"] is not None
            tax_percent = Decimal(str(item.get("tax_percent", 0)))
            
            # If this is from invoice and tax/discount NOT explicitly provided, fetch from original invoice item
            # This respects frontend's choice while providing fallback for missing values
            should_fetch_from_invoice = invoice_item_id and (
                (not tax_percent_provided) or 
                (discount_percent == 0 and "discount_percent" not in item)
            )
            
            if should_fetch_from_invoice:
                invoice_item_details = db.execute(
                    text("""
                        SELECT 
                            ii.gst_percent,
                            ii.discount_percent,
                            ii.unit_price,
                            ii.free_quantity as invoice_free_qty
                        FROM sales.invoice_items ii
                        WHERE ii.invoice_item_id = :invoice_item_id
                    """),
                    {"invoice_item_id": invoice_item_id}
                ).fetchone()
                
                if invoice_item_details:
                    # Only auto-fill if NOT explicitly provided by frontend
                    if not tax_percent_provided and invoice_item_details.gst_percent:
                        tax_percent = Decimal(str(invoice_item_details.gst_percent))
                        logger.info(f"Fetched tax_percent {tax_percent}% from invoice item {invoice_item_id}")
                    if "discount_percent" not in item and invoice_item_details.discount_percent:
                        discount_percent = Decimal(str(invoice_item_details.discount_percent))
                        logger.info(f"Fetched discount_percent {discount_percent}% from invoice item {invoice_item_id}")
            
            # Validate return quantity doesn't exceed invoice quantity
            if invoice_item_id:
                # Check how much has already been returned for this item
                already_returned = db.execute(
                    text("""
                        SELECT 
                            ii.quantity as invoice_qty,
                            COALESCE(SUM(sri.return_quantity), 0) as already_returned
                        FROM sales.invoice_items ii
                        LEFT JOIN sales.sales_return_items sri 
                            ON ii.invoice_item_id = sri.invoice_item_id
                        WHERE ii.invoice_item_id = :invoice_item_id
                        GROUP BY ii.quantity
                    """),
                    {"invoice_item_id": invoice_item_id}
                ).fetchone()
                
                if already_returned:
                    max_returnable = Decimal(str(already_returned.invoice_qty)) - Decimal(str(already_returned.already_returned))
                    if return_qty > max_returnable:
                        product_name = item.get("product_name", "Product")
                        raise HTTPException(
                            status_code=400,
                            detail=f"Cannot return {return_qty} units of {product_name}. Maximum returnable: {max_returnable}"
                        )
            
            # Calculate return value - check for manual override first
            if "return_value" in item and item["return_value"] is not None:
                # Manual override - use frontend-provided value
                return_value = Decimal(str(item["return_value"]))
                logger.info(f"Using manual return_value override: {return_value}")
            else:
                # Auto-calculate using creditable_qty (excludes free items)
                return_calc = ReturnService.calculate_return_value(
                    creditable_qty, unit_price, discount_percent, tax_percent
                )
                return_value = return_calc["return_value"]
                logger.info(f"Calculated return_value: {return_value} (creditable_qty={creditable_qty}, free_qty={free_qty})")
            
            # Calculate tax using GSTService for consistency
            gst = GSTService.calculate_gst_components(return_value, tax_percent, "CGST/SGST")
            item_tax_amount = gst["total_tax_amount"]
            
            # Resolve batch using ReturnService (eliminates ~30 lines of inline code)
            batch_id, batch_number = ReturnService.resolve_batch(
                db,
                product_id=item["product_id"],
                batch_number=item.get("batch_no") or item.get("batch_number"),
                batch_id=item.get("batch_id"),
                source_item_id=invoice_item_id,
                source_type="sales_invoice"
            )
            
            # Determine disposition using ReturnService (eliminates ~20 lines of inline code)
            item_return_reason = item.get("reason") or item.get("return_reason") or return_dict.get("return_reason", "Quality Issue")
            should_restock = item.get("restock", None)
            
            disposition, is_damaged = ReturnService.determine_disposition(
                item_return_reason, explicit_restock=should_restock
            )
            
            # Set quantities based on disposition
            if is_damaged or should_restock is False:
                damaged_qty = float(return_qty)
                saleable_qty = 0
            else:
                damaged_qty = 0
                saleable_qty = float(return_qty)
            
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
            
            # Update batch stock based on batch tracking
            if batch_id:
                # Have batch ID - can directly update the specific batch
                if saleable_qty > 0:
                    # Update both quantity_available and quantity_returned for restockable items
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
                else:
                    # Only update quantity_returned for non-restockable items (damaged/expired)
                    db.execute(
                        text("""
                            UPDATE inventory.batches 
                            SET quantity_returned = COALESCE(quantity_returned, 0) + :total_qty
                            WHERE batch_id = :batch_id
                        """),
                        {
                            "total_qty": float(return_qty),  # Track total returned
                            "batch_id": batch_id
                        }
                    )
            elif saleable_qty > 0:
                # No batch ID but item is restockable - put in quarantine for batch assignment
                # Find the oldest batch with available quantity
                oldest_batch = db.execute(
                    text("""
                        SELECT batch_id 
                        FROM inventory.batches 
                        WHERE product_id = :product_id
                        AND quantity_available > 0
                        ORDER BY expiry_date ASC NULLS LAST
                        LIMIT 1
                    """),
                    {"product_id": item["product_id"]}
                ).first()
                
                if oldest_batch:
                    # Update quantity_quarantine in the oldest batch
                    db.execute(
                        text("""
                            UPDATE inventory.batches 
                            SET quantity_quarantine = COALESCE(quantity_quarantine, 0) + :qty
                            WHERE batch_id = :batch_id
                        """),
                        {
                            "qty": saleable_qty,
                            "batch_id": oldest_batch.batch_id
                        }
                    )
                # Note: Items in quarantine need manual batch assignment later
            
            # Track inventory movement for return using InventoryService
            if batch_id or item["product_id"]:
                movement_quantity = float(return_qty)
                movement_type = 'RETURN' if saleable_qty > 0 else 'RETURN_DAMAGED'
                
                # Create movement note based on whether we have invoice
                movement_note = f"Return #{return_number}"
                if invoice_id:
                    movement_note = f"Return #{return_number} from Invoice ID: {invoice_id}"
                
                # Use InventoryService for stock movement
                movement_data = StockMovementCreate(
                    org_id=uuid.UUID(org_id) if isinstance(org_id, str) else org_id,
                    product_id=item["product_id"],
                    batch_id=batch_id,
                    movement_type=movement_type,
                    movement_direction="in",
                    movement_date=date.today(),
                    quantity=int(movement_quantity),
                    base_quantity=int(movement_quantity),
                    location_id=branch_id,
                    reference_type="SALES_RETURN",
                    reference_id=return_id,
                    reference_number=return_number,
                    reason=item_return_reason,
                    notes=movement_note,
                    created_by=created_by
                )
                
                InventoryService.record_stock_movement(db, movement_data)
                
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
@with_tenant_context
async def get_sale_return_detail(
    return_id: str,
    _: dict = Depends(PermissionChecker("sales_returns", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    org_id = str(context.org_id)
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
@with_tenant_context
async def cancel_sale_return(
    return_id: str,
    _: dict = Depends(PermissionChecker("sales_returns", "delete")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    org_id = str(context.org_id)
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
            
        if sale_return.return_status == ReturnStatus.CANCELLED.value:
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
                SET return_status = :cancelled_status,
                    updated_at = CURRENT_TIMESTAMP
                WHERE return_id = :return_id
            """),
            {"return_id": return_id, "cancelled_status": ReturnStatus.CANCELLED.value}
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
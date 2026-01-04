"""
Document Conversions API - Unified document conversion endpoints

MODERNIZED: Uses TenantAwareSession + PermissionChecker + OrgContext
Supports: SO→Invoice, SO→Challan, Challan→Invoice (single & bulk)
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
import logging
from datetime import date, datetime
from decimal import Decimal

from .....core.auth.tenant_service import TenantAwareSession, get_tenant_aware_db, with_tenant_context
from .....core.auth.org_context import OrgContext, get_org_context
from .....core.security.permissions import PermissionChecker
from ....services.document_number_service import DocumentNumberService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversions", tags=["Document Conversions"])


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class ConversionRequest(BaseModel):
    target_date: Optional[date] = Field(None, description="Date for the new document")
    notes: Optional[str] = None
    payment_mode: Optional[str] = Field("credit", description="Payment mode for invoices")
    discount_amount: Optional[Decimal] = Field(Decimal("0"), ge=0)


class BulkChallanToInvoiceRequest(BaseModel):
    challan_ids: List[int] = Field(..., min_length=1, description="List of challan IDs")
    invoice_date: Optional[date] = None
    discount_amount: Optional[Decimal] = Field(Decimal("0"), ge=0)
    notes: Optional[str] = None


class ConversionResponse(BaseModel):
    success: bool
    source_type: str
    source_id: int
    target_type: str
    target_id: int
    target_number: str
    message: str


# ============================================================================
# SALES ORDER CONVERSIONS
# ============================================================================

@router.post("/sales-order/{order_id}/to-invoice")
@with_tenant_context
async def convert_sales_order_to_invoice(
    order_id: int,
    request: ConversionRequest = ConversionRequest(),
    _: dict = Depends(PermissionChecker("invoices", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Convert approved sales order to invoice
    
    - Copies all order items to invoice items
    - Calculates GST based on org/customer state
    - Updates order status to 'invoiced'
    """
    try:
        org_id = str(context.org_id)
        user_id = context.user_id
        
        # Validate order
        order = db.execute(text("""
            SELECT o.order_id, o.order_number, o.order_status, o.customer_id,
                   o.subtotal_amount, o.discount_amount, o.tax_amount, o.final_amount,
                   c.customer_name, c.primary_phone, c.primary_email, c.gst_number
            FROM sales.orders o
            JOIN parties.customers c ON o.customer_id = c.customer_id
            WHERE o.order_id = :order_id AND o.org_id = :org_id
        """), {"order_id": order_id, "org_id": org_id}).fetchone()
        
        if not order:
            raise HTTPException(status_code=404, detail=f"Sales order {order_id} not found")
        
        if order.order_status not in ["approved", "confirmed"]:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot convert to invoice. Order status: {order.order_status}"
            )
        
        # Check if already invoiced
        existing = db.execute(text("""
            SELECT invoice_id FROM sales.invoices WHERE order_id = :order_id AND org_id = :org_id
        """), {"order_id": order_id, "org_id": org_id}).fetchone()
        
        if existing:
            raise HTTPException(status_code=400, detail=f"Order already has invoice: {existing.invoice_id}")
        
        # Generate invoice number
        invoice_number = DocumentNumberService.generate_number(db, "invoice", str(org_id))
        invoice_date = request.target_date or date.today()
        
        # Get org state for GST type
        org_state = db.execute(text("""
            SELECT business_settings->>'state' as state FROM master.organizations WHERE org_id = :org_id
        """), {"org_id": org_id}).scalar()
        
        is_interstate = org_state != order.state if org_state and order.state else False
        gst_type = "igst" if is_interstate else "cgst_sgst"
        
        # Calculate totals
        final_amount = float(order.total_amount) - float(request.discount_amount or 0)
        
        # Create invoice
        invoice_result = db.execute(text("""
            INSERT INTO sales.invoices (
                org_id, invoice_number, invoice_date, due_date,
                customer_id, customer_name, customer_phone, customer_email, customer_gstin,
                order_id, subtotal_amount, discount_amount, taxable_amount,
                tax_amount, final_amount, paid_amount,
                payment_status, invoice_status, gst_type,
                created_by, notes
            ) VALUES (
                :org_id, :invoice_number, :invoice_date, :due_date,
                :customer_id, :customer_name, :customer_phone, :customer_email, :customer_gstin,
                :order_id, :subtotal_amount, :discount_amount, :taxable_amount,
                :tax_amount, :final_amount, 0,
                'unpaid', 'generated', :gst_type,
                :created_by, :notes
            )
            RETURNING invoice_id
        """), {
            "org_id": org_id,
            "invoice_number": invoice_number,
            "invoice_date": invoice_date,
            "due_date": invoice_date,  # Could add credit days logic
            "customer_id": order.customer_id,
            "customer_name": order.customer_name,
            "customer_phone": order.primary_phone,
            "customer_email": order.primary_email,
            "customer_gstin": order.gst_number,
            "order_id": order_id,
            "subtotal_amount": order.subtotal_amount,
            "discount_amount": float(order.discount_amount or 0) + float(request.discount_amount or 0),
            "taxable_amount": float(order.subtotal_amount) - float(order.discount_amount or 0),
            "tax_amount": order.tax_amount,
            "final_amount": final_amount,
            "gst_type": gst_type,
            "created_by": user_id,
            "notes": request.notes
        })
        invoice_id = invoice_result.scalar()
        
        # Copy order items to invoice items
        db.execute(text("""
            INSERT INTO sales.invoice_items (
                invoice_id, product_id, product_name, hsn_code,
                batch_id, batch_number, quantity, unit_price, mrp,
                discount_percent, discount_amount, gst_percent,
                cgst_amount, sgst_amount, igst_amount,
                taxable_amount, total_amount
            )
            SELECT 
                :invoice_id, oi.product_id, oi.product_name, p.hsn_code,
                oi.batch_id, oi.batch_number, oi.quantity, oi.unit_price, oi.mrp,
                oi.discount_percent, oi.discount_amount, COALESCE(p.gst_percent, 0),
                CASE WHEN :is_interstate THEN 0 ELSE oi.tax_amount / 2 END,
                CASE WHEN :is_interstate THEN 0 ELSE oi.tax_amount / 2 END,
                CASE WHEN :is_interstate THEN oi.tax_amount ELSE 0 END,
                oi.taxable_amount, oi.line_total as total_amount
            FROM sales.order_items oi
            LEFT JOIN inventory.products p ON oi.product_id = p.product_id
            WHERE oi.order_id = :order_id
        """), {
            "invoice_id": invoice_id,
            "order_id": order_id,
            "is_interstate": is_interstate
        })
        
        # Update order status
        db.execute(text("""
            UPDATE sales.orders SET order_status = 'invoiced', updated_at = CURRENT_TIMESTAMP
            WHERE order_id = :order_id
        """), {"order_id": order_id})
        
        db.commit()
        
        return {
            "success": True,
            "source_type": "sales_order",
            "source_id": order_id,
            "source_number": order.order_number,
            "target_type": "invoice",
            "target_id": invoice_id,
            "target_number": invoice_number,
            "total_amount": final_amount,
            "message": f"Sales order {order.order_number} converted to invoice {invoice_number}"
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error converting SO to invoice: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to convert: {str(e)}")


@router.post("/sales-order/{order_id}/to-challan")
@with_tenant_context
async def convert_sales_order_to_challan(
    order_id: int,
    request: ConversionRequest = ConversionRequest(),
    _: dict = Depends(PermissionChecker("challans", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Convert approved sales order to delivery challan
    
    - Creates challan with all order items
    - Updates order status to 'shipped'
    """
    try:
        org_id = str(context.org_id)
        user_id = context.user_id
        branch_id = context.primary_branch_id
        
        # Validate order
        order = db.execute(text("""
            SELECT o.order_id, o.order_number, o.order_status, o.customer_id,
                   o.final_amount, c.customer_name
            FROM sales.orders o
            JOIN parties.customers c ON o.customer_id = c.customer_id
            WHERE o.order_id = :order_id AND o.org_id = :org_id
        """), {"order_id": order_id, "org_id": org_id}).fetchone()
        
        if not order:
            raise HTTPException(status_code=404, detail=f"Sales order {order_id} not found")
        
        if order.order_status not in ["approved", "confirmed"]:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot convert to challan. Order status: {order.order_status}"
            )
        
        # Generate challan number
        challan_date = request.target_date or date.today()
        date_part = challan_date.strftime("%Y%m%d")
        
        seq_result = db.execute(text("""
            SELECT COALESCE(MAX(CAST(SUBSTRING(challan_number FROM '[0-9]+$') AS BIGINT)), 0) + 1
            FROM challans WHERE org_id = :org_id AND challan_number LIKE :pattern
        """), {"org_id": org_id, "pattern": f"DC{date_part}%"}).scalar() or 1
        
        challan_number = f"DC{date_part}{seq_result:04d}"
        
        # Create challan
        challan_result = db.execute(text("""
            INSERT INTO challans (
                org_id, challan_number, challan_date, order_id,
                customer_id, delivery_address, status, total_amount,
                created_by, branch_id, notes
            ) VALUES (
                :org_id, :challan_number, :challan_date, :order_id,
                :customer_id, :delivery_address, 'pending', :total_amount,
                :created_by, :branch_id, :notes
            )
            RETURNING challan_id
        """), {
            "org_id": org_id,
            "challan_number": challan_number,
            "challan_date": challan_date,
            "order_id": order_id,
            "customer_id": order.customer_id,
            "delivery_address": None,  # Address in separate table
            "total_amount": order.total_amount,
            "created_by": user_id,
            "branch_id": branch_id,
            "notes": request.notes
        })
        challan_id = challan_result.scalar()
        
        # Copy order items to challan items
        db.execute(text("""
            INSERT INTO challan_items (
                challan_id, order_item_id, product_id, product_name,
                batch_id, batch_number, dispatched_quantity, unit_price
            )
            SELECT 
                :challan_id, oi.order_item_id, oi.product_id, oi.product_name,
                oi.batch_id, oi.batch_number, oi.quantity, oi.unit_price
            FROM sales.order_items oi
            WHERE oi.order_id = :order_id
        """), {"challan_id": challan_id, "order_id": order_id})
        
        # Update order status
        db.execute(text("""
            UPDATE sales.orders SET order_status = 'shipped', updated_at = CURRENT_TIMESTAMP
            WHERE order_id = :order_id
        """), {"order_id": order_id})
        
        db.commit()
        
        return {
            "success": True,
            "source_type": "sales_order",
            "source_id": order_id,
            "source_number": order.order_number,
            "target_type": "challan",
            "target_id": challan_id,
            "target_number": challan_number,
            "message": f"Sales order {order.order_number} converted to challan {challan_number}"
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error converting SO to challan: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to convert: {str(e)}")


# ============================================================================
# CHALLAN CONVERSIONS
# ============================================================================

@router.post("/challan/{challan_id}/to-invoice")
@with_tenant_context
async def convert_challan_to_invoice(
    challan_id: int,
    request: ConversionRequest = ConversionRequest(),
    _: dict = Depends(PermissionChecker("invoices", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Convert delivered challan to invoice
    
    - Uses challan items for invoice
    - Marks challan as invoiced
    """
    try:
        org_id = str(context.org_id)
        
        # Validate challan
        challan = db.execute(text("""
            SELECT c.challan_id, c.challan_number, c.order_id, c.customer_id,
                   c.status, c.invoice_id, c.total_amount,
                   cust.customer_name, cust.gst_number
            FROM challans c
            JOIN parties.customers cust ON c.customer_id = cust.customer_id
            WHERE c.challan_id = :challan_id AND c.org_id = :org_id
        """), {"challan_id": challan_id, "org_id": org_id}).fetchone()
        
        if not challan:
            raise HTTPException(status_code=404, detail=f"Challan {challan_id} not found")
        
        if challan.status != "delivered":
            raise HTTPException(
                status_code=400,
                detail=f"Cannot convert. Challan status must be 'delivered', got: {challan.status}"
            )
        
        if challan.invoice_id:
            raise HTTPException(status_code=400, detail=f"Challan already invoiced: {challan.invoice_id}")
        
        # Use bulk method with single challan
        return await _create_invoice_from_challans(
            db, org_id, context.user_id, [challan_id], 
            request.target_date, request.discount_amount, request.notes
        )
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error converting challan to invoice: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to convert: {str(e)}")


@router.post("/challan/bulk-to-invoice")
@with_tenant_context
async def convert_multiple_challans_to_invoice(
    request: BulkChallanToInvoiceRequest,
    _: dict = Depends(PermissionChecker("invoices", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Convert multiple delivered challans to single invoice
    
    - All challans must belong to same customer
    - All challans must be in 'delivered' status
    - Creates single consolidated invoice
    """
    try:
        org_id = str(context.org_id)
        
        return await _create_invoice_from_challans(
            db, org_id, context.user_id, request.challan_ids,
            request.invoice_date, request.discount_amount, request.notes
        )
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error converting challans to invoice: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to convert: {str(e)}")


async def _create_invoice_from_challans(
    db: TenantAwareSession, org_id: str, user_id: int,
    challan_ids: List[int], invoice_date: Optional[date],
    discount_amount: Optional[Decimal], notes: Optional[str]
):
    """Internal helper for challan to invoice conversion"""
    
    # Validate all challans
    challans = db.execute(text("""
        SELECT c.challan_id, c.challan_number, c.customer_id, c.status, c.invoice_id
        FROM challans c
        WHERE c.challan_id = ANY(:ids) AND c.org_id = :org_id
    """), {"ids": challan_ids, "org_id": org_id}).fetchall()
    
    if len(challans) != len(challan_ids):
        raise HTTPException(status_code=404, detail="One or more challans not found")
    
    # Validate same customer
    customer_ids = set(c.customer_id for c in challans)
    if len(customer_ids) > 1:
        raise HTTPException(status_code=400, detail="All challans must belong to same customer")
    
    # Validate status
    for c in challans:
        if c.status != "delivered":
            raise HTTPException(
                status_code=400,
                detail=f"Challan {c.challan_number} is not delivered (status: {c.status})"
            )
        if c.invoice_id:
            raise HTTPException(
                status_code=400,
                detail=f"Challan {c.challan_number} already has invoice {c.invoice_id}"
            )
    
    customer_id = challans[0].customer_id
    
    # Get customer details
    customer = db.execute(text("""
        SELECT customer_name, gst_number, primary_phone
        FROM parties.customers WHERE customer_id = :id AND org_id = :org_id
    """), {"id": customer_id, "org_id": org_id}).fetchone()
    
    # Get all challan items
    items = db.execute(text("""
        SELECT 
            ci.product_id, ci.product_name, ci.batch_id, ci.batch_number,
            ci.dispatched_quantity as quantity, ci.unit_price,
            COALESCE(p.hsn_code, '') as hsn_code,
            COALESCE(p.gst_percent, 18) as gst_percent,
            COALESCE(b.mrp_per_unit, 0) as mrp
        FROM challan_items ci
        LEFT JOIN inventory.products p ON ci.product_id = p.product_id
        LEFT JOIN inventory.batches b ON ci.batch_id = b.batch_id
        WHERE ci.challan_id = ANY(:ids)
    """), {"ids": challan_ids}).fetchall()
    
    # Calculate totals
    subtotal = Decimal("0")
    tax_total = Decimal("0")
    
    for item in items:
        line_total = Decimal(str(item.quantity)) * Decimal(str(item.unit_price))
        tax = line_total * Decimal(str(item.gst_percent)) / 100
        subtotal += line_total
        tax_total += tax
    
    final_amount = subtotal + tax_total - (discount_amount or Decimal("0"))
    
    # Generate invoice
    invoice_number = DocumentNumberService.generate_number(db, "invoice", str(org_id))
    inv_date = invoice_date or date.today()
    
    invoice_result = db.execute(text("""
        INSERT INTO sales.invoices (
            org_id, invoice_number, invoice_date, due_date,
            customer_id, customer_name, customer_phone, customer_gstin,
            subtotal_amount, discount_amount, tax_amount, final_amount,
            payment_status, invoice_status, created_by, notes
        ) VALUES (
            :org_id, :invoice_number, :invoice_date, :due_date,
            :customer_id, :customer_name, :customer_phone, :customer_gstin,
            :subtotal, :discount, :tax, :final,
            'unpaid', 'generated', :user_id, :notes
        )
        RETURNING invoice_id
    """), {
        "org_id": org_id,
        "invoice_number": invoice_number,
        "invoice_date": inv_date,
        "due_date": inv_date,
        "customer_id": customer_id,
        "customer_name": customer.customer_name,
        "customer_phone": customer.primary_phone,
        "customer_gstin": customer.gst_number,
        "subtotal": subtotal,
        "discount": discount_amount or 0,
        "tax": tax_total,
        "final": final_amount,
        "user_id": user_id,
        "notes": notes
    })
    invoice_id = invoice_result.scalar()
    
    # Create invoice items
    for item in items:
        line_total = Decimal(str(item.quantity)) * Decimal(str(item.unit_price))
        tax = line_total * Decimal(str(item.gst_percent)) / 100
        
        db.execute(text("""
            INSERT INTO sales.invoice_items (
                invoice_id, product_id, product_name, hsn_code,
                batch_id, batch_number, quantity, unit_price, mrp,
                gst_percent, taxable_amount, tax_amount, total_amount
            ) VALUES (
                :inv_id, :product_id, :product_name, :hsn,
                :batch_id, :batch_number, :qty, :price, :mrp,
                :gst, :taxable, :tax, :total
            )
        """), {
            "inv_id": invoice_id,
            "product_id": item.product_id,
            "product_name": item.product_name,
            "hsn": item.hsn_code,
            "batch_id": item.batch_id,
            "batch_number": item.batch_number,
            "qty": item.quantity,
            "price": item.unit_price,
            "mrp": item.mrp,
            "gst": item.gst_percent,
            "taxable": line_total,
            "tax": tax,
            "total": line_total + tax
        })
    
    # Mark challans as invoiced
    db.execute(text("""
        UPDATE challans SET invoice_id = :inv_id, invoiced_at = CURRENT_TIMESTAMP
        WHERE challan_id = ANY(:ids)
    """), {"inv_id": invoice_id, "ids": challan_ids})
    
    db.commit()
    
    return {
        "success": True,
        "source_type": "challans",
        "source_ids": challan_ids,
        "source_numbers": [c.challan_number for c in challans],
        "target_type": "invoice",
        "target_id": invoice_id,
        "target_number": invoice_number,
        "total_amount": float(final_amount),
        "message": f"Created invoice {invoice_number} from {len(challan_ids)} challan(s)"
    }


# ============================================================================
# UTILITY ENDPOINTS
# ============================================================================

@router.get("/eligible-challans")
@with_tenant_context
async def get_eligible_challans_for_invoice(
    customer_id: Optional[int] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    _: dict = Depends(PermissionChecker("invoices", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get delivered challans that haven't been invoiced yet
    
    Use this to select challans for bulk invoice creation
    """
    try:
        org_id = str(context.org_id)
        
        query = """
            SELECT 
                c.challan_id, c.challan_number, c.challan_date, c.order_id,
                c.customer_id, cust.customer_name, c.total_amount,
                COUNT(ci.challan_item_id) as item_count
            FROM challans c
            JOIN parties.customers cust ON c.customer_id = cust.customer_id
            LEFT JOIN challan_items ci ON c.challan_id = ci.challan_id
            WHERE c.org_id = :org_id
            AND c.status = 'delivered'
            AND c.invoice_id IS NULL
        """
        params = {"org_id": org_id}
        
        if customer_id:
            query += " AND c.customer_id = :customer_id"
            params["customer_id"] = customer_id
        
        if from_date:
            query += " AND c.challan_date >= :from_date"
            params["from_date"] = from_date
        
        if to_date:
            query += " AND c.challan_date <= :to_date"
            params["to_date"] = to_date
        
        query += """
            GROUP BY c.challan_id, c.challan_number, c.challan_date, c.order_id,
                     c.customer_id, cust.customer_name, c.total_amount
            ORDER BY c.challan_date DESC
        """
        
        result = db.execute(text(query), params)
        challans = [dict(row._mapping) for row in result]
        
        return {
            "eligible_challans": challans,
            "total_count": len(challans)
        }
        
    except Exception as e:
        logger.error(f"Error fetching eligible challans: {e}")
        raise HTTPException(status_code=500, detail=str(e))

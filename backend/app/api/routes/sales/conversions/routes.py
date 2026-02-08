"""
Document Conversions API - Unified document conversion endpoints
REFACTORED: Uses ConversionService for database operations
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
import logging
from datetime import date
from decimal import Decimal

from .....core.auth.tenant_service import TenantAwareSession, get_tenant_aware_db, with_tenant_context
from .....core.auth.org_context import OrgContext, get_org_context
from .....core.security.permissions import PermissionChecker
from ....services.document_number_service import DocumentNumberService
from ....services.sales.conversion.service import ConversionService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversions", tags=["Document Conversions"])


class ConversionRequest(BaseModel):
    target_date: Optional[date] = None
    notes: Optional[str] = None
    payment_mode: Optional[str] = "credit"
    discount_amount: Optional[Decimal] = Field(Decimal("0"), ge=0)


class BulkChallanToInvoiceRequest(BaseModel):
    challan_ids: List[int] = Field(..., min_length=1)
    invoice_date: Optional[date] = None
    discount_amount: Optional[Decimal] = Field(Decimal("0"), ge=0)
    notes: Optional[str] = None


@router.post("/sales-order/{order_id}/to-invoice")
@with_tenant_context
async def convert_sales_order_to_invoice(
    order_id: int, request: ConversionRequest = ConversionRequest(),
    _: dict = Depends(PermissionChecker("invoices", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Convert approved sales order to invoice"""
    try:
        org_id = str(context.org_id)
        user_id = context.user_id
        
        order = ConversionService.get_order_for_conversion(db, org_id, order_id)
        if not order:
            raise HTTPException(status_code=404, detail=f"Sales order {order_id} not found")
        if order["order_status"] not in ["approved", "confirmed"]:
            raise HTTPException(status_code=400, detail=f"Cannot convert. Order status: {order['order_status']}")
        
        existing = ConversionService.check_order_invoiced(db, org_id, order_id)
        if existing:
            raise HTTPException(status_code=400, detail=f"Order already has invoice: {existing}")
        
        invoice_number = DocumentNumberService.generate_number(db, "invoice", org_id)
        invoice_date = request.target_date or date.today()
        org_state = ConversionService.get_org_state(db, org_id)
        is_interstate = org_state != order.get("state") if org_state else False
        gst_type = "igst" if is_interstate else "cgst_sgst"
        final_amount = float(order["final_amount"]) - float(request.discount_amount or 0)
        
        invoice_id = ConversionService.create_invoice(db, {
            "org_id": org_id, "invoice_number": invoice_number, "invoice_date": invoice_date,
            "due_date": invoice_date, "customer_id": order["customer_id"],
            "customer_name": order["customer_name"], "customer_phone": order["primary_phone"],
            "customer_email": order["primary_email"], "customer_gstin": order["gst_number"],
            "order_id": order_id, "subtotal_amount": order["subtotal_amount"],
            "discount_amount": float(order.get("discount_amount") or 0) + float(request.discount_amount or 0),
            "taxable_amount": float(order["subtotal_amount"]) - float(order.get("discount_amount") or 0),
            "tax_amount": order["tax_amount"], "final_amount": final_amount,
            "gst_type": gst_type, "created_by": user_id, "notes": request.notes
        })
        
        ConversionService.copy_order_items_to_invoice(db, invoice_id, order_id, is_interstate)
        ConversionService.update_order_status(db, order_id, "invoiced")
        db.commit()
        
        return {"success": True, "source_type": "sales_order", "source_id": order_id,
                "source_number": order["order_number"], "target_type": "invoice",
                "target_id": invoice_id, "target_number": invoice_number,
                "total_amount": final_amount, "message": f"Sales order {order['order_number']} converted to invoice {invoice_number}"}
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
    order_id: int, request: ConversionRequest = ConversionRequest(),
    _: dict = Depends(PermissionChecker("challans", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Convert approved sales order to delivery challan"""
    try:
        org_id = str(context.org_id)
        user_id = context.user_id
        branch_id = context.primary_branch_id
        
        order = ConversionService.get_order_for_conversion(db, org_id, order_id)
        if not order:
            raise HTTPException(status_code=404, detail=f"Sales order {order_id} not found")
        if order["order_status"] not in ["approved", "confirmed"]:
            raise HTTPException(status_code=400, detail=f"Cannot convert. Order status: {order['order_status']}")
        
        challan_date = request.target_date or date.today()
        challan_number = DocumentNumberService.generate_number(db, "delivery_challan", org_id)
        
        challan_id = ConversionService.create_challan(db, {
            "org_id": org_id, "challan_number": challan_number, "challan_date": challan_date,
            "order_id": order_id, "customer_id": order["customer_id"], "delivery_address": None,
            "total_amount": order["final_amount"], "created_by": user_id,
            "branch_id": branch_id, "notes": request.notes
        })
        
        ConversionService.copy_order_items_to_challan(db, challan_id, order_id)
        ConversionService.update_order_status(db, order_id, "shipped")
        db.commit()
        
        return {"success": True, "source_type": "sales_order", "source_id": order_id,
                "source_number": order["order_number"], "target_type": "challan",
                "target_id": challan_id, "target_number": challan_number,
                "message": f"Sales order {order['order_number']} converted to challan {challan_number}"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error converting SO to challan: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to convert: {str(e)}")


@router.post("/challan/{challan_id}/to-invoice")
@with_tenant_context
async def convert_challan_to_invoice(
    challan_id: int, request: ConversionRequest = ConversionRequest(),
    _: dict = Depends(PermissionChecker("invoices", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Convert delivered challan to invoice"""
    try:
        return await _create_invoice_from_challans(db, str(context.org_id), context.user_id,
                                                   [challan_id], request.target_date, request.discount_amount, request.notes)
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
    """Convert multiple delivered challans to single invoice"""
    try:
        return await _create_invoice_from_challans(db, str(context.org_id), context.user_id,
                                                   request.challan_ids, request.invoice_date, request.discount_amount, request.notes)
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
    challans = ConversionService.get_challans_for_conversion(db, org_id, challan_ids)
    if len(challans) != len(challan_ids):
        raise HTTPException(status_code=404, detail="One or more challans not found")
    
    customer_ids = set(c["customer_id"] for c in challans)
    if len(customer_ids) > 1:
        raise HTTPException(status_code=400, detail="All challans must belong to same customer")
    
    for c in challans:
        if c["status"] != "delivered":
            raise HTTPException(status_code=400, detail=f"Challan {c['challan_number']} is not delivered")
        if c["invoice_id"]:
            raise HTTPException(status_code=400, detail=f"Challan {c['challan_number']} already has invoice")
    
    customer_id = challans[0]["customer_id"]
    customer = ConversionService.get_customer_details(db, org_id, customer_id)
    items = ConversionService.get_challan_items(db, challan_ids)
    
    subtotal, tax_total = Decimal("0"), Decimal("0")
    for item in items:
        line_total = Decimal(str(item["quantity"])) * Decimal(str(item["unit_price"]))
        tax = line_total * Decimal(str(item["gst_percent"])) / 100
        subtotal += line_total
        tax_total += tax
    
    final_amount = subtotal + tax_total - (discount_amount or Decimal("0"))
    invoice_number = DocumentNumberService.generate_number(db, "invoice", org_id)
    inv_date = invoice_date or date.today()
    
    invoice_id = ConversionService.create_invoice_simple(db, {
        "org_id": org_id, "invoice_number": invoice_number, "invoice_date": inv_date, "due_date": inv_date,
        "customer_id": customer_id, "customer_name": customer["customer_name"],
        "customer_phone": customer["primary_phone"], "customer_gstin": customer["gst_number"],
        "subtotal": subtotal, "discount": discount_amount or 0, "tax": tax_total, "final": final_amount,
        "user_id": user_id, "notes": notes
    })
    
    for item in items:
        line_total = Decimal(str(item["quantity"])) * Decimal(str(item["unit_price"]))
        tax = line_total * Decimal(str(item["gst_percent"])) / 100
        ConversionService.insert_invoice_item(db, {
            "inv_id": invoice_id, "product_id": item["product_id"], "product_name": item["product_name"],
            "hsn": item["hsn_code"], "batch_id": item["batch_id"], "batch_number": item["batch_number"],
            "qty": item["quantity"], "price": item["unit_price"], "mrp": item["mrp"],
            "gst": item["gst_percent"], "taxable": line_total, "tax": tax, "total": line_total + tax
        })
    
    ConversionService.mark_challans_invoiced(db, invoice_id, challan_ids)
    db.commit()
    
    return {"success": True, "source_type": "challans", "source_ids": challan_ids,
            "source_numbers": [c["challan_number"] for c in challans],
            "target_type": "invoice", "target_id": invoice_id, "target_number": invoice_number,
            "total_amount": float(final_amount), "message": f"Created invoice {invoice_number} from {len(challan_ids)} challan(s)"}


@router.get("/eligible-challans")
@with_tenant_context
async def get_eligible_challans_for_invoice(
    customer_id: Optional[int] = None, from_date: Optional[date] = None, to_date: Optional[date] = None,
    _: dict = Depends(PermissionChecker("invoices", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get delivered challans that haven't been invoiced yet"""
    try:
        challans = ConversionService.get_eligible_challans(db, str(context.org_id), customer_id, from_date, to_date)
        return {"eligible_challans": challans, "total_count": len(challans)}
    except Exception as e:
        logger.error(f"Error fetching eligible challans: {e}")
        raise HTTPException(status_code=500, detail=str(e))

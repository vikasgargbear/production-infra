"""
Supplier Invoice API Router
REFACTORED: Uses SupplierInvoiceService for database operations
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
import logging

from .....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from .....core.auth.org_context import get_org_context, OrgContext
from .....core.security.permissions import PermissionChecker
from ....services.purchase.supplier_invoice.service import SupplierInvoiceService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["supplier-invoices"])

@router.get("/")
@with_tenant_context
async def get_supplier_invoices(
    from_date: Optional[str] = None, to_date: Optional[str] = None,
    supplier_id: Optional[int] = None,
    skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=5000),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get all supplier invoices with GST details"""
    try:
        invoices = SupplierInvoiceService.list_supplier_invoices(db, str(context.org_id), from_date, to_date, supplier_id, limit, skip)
        result = []
        for invoice in invoices:
            for key in ['subtotal_amount', 'discount_amount', 'taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount', 'cess_amount', 'tax_amount', 'invoice_total']:
                if key in invoice and invoice[key] is not None:
                    invoice[key] = float(invoice[key])
            result.append(invoice)
        return result
    except Exception as e:
        logger.error(f"Error fetching supplier invoices: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/returnable/")
@with_tenant_context
async def get_returnable_invoices(
    supplier_id: Optional[int] = None, from_date: Optional[str] = None, to_date: Optional[str] = None,
    skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get supplier invoices that have returnable items"""
    try:
        invoices = SupplierInvoiceService.list_returnable_invoices(
            db,
            str(context.org_id),
            supplier_id,
            from_date,
            to_date,
            limit,
            skip,
        )
        result = []
        for invoice in invoices:
            invoice["invoice_type"] = "supplier"
            invoice["has_grn"] = bool(invoice.get("grn_ids") and len(invoice["grn_ids"]) > 0)
            result.append(invoice)
        return {"invoices": result, "total": len(result), "skip": skip, "limit": limit}
    except Exception as e:
        logger.error(f"Error fetching returnable invoices: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{invoice_id}")
@with_tenant_context
async def get_invoice_details(
    invoice_id: int,
    _: dict = Depends(PermissionChecker("purchase", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get detailed information about a supplier invoice"""
    try:
        invoice = SupplierInvoiceService.get_invoice_details(db, invoice_id)
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        return invoice
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching invoice details: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{invoice_id}/items")
@with_tenant_context
async def get_invoice_items(
    invoice_id: int,
    _: dict = Depends(PermissionChecker("purchase", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get items for a supplier invoice"""
    try:
        items = SupplierInvoiceService.get_invoice_items(db, invoice_id)
        if not items:
            items = SupplierInvoiceService.get_invoice_items_from_grn(db, invoice_id)
        return {"items": items, "total": len(items)}
    except Exception as e:
        logger.error(f"Error fetching invoice items: {e}")
        raise HTTPException(status_code=500, detail=str(e))

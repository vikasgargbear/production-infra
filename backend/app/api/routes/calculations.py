"""Read-only calculation previews backed by the same services as document writes."""

import time
from typing import Any, Dict, Sequence, Type, TypeVar
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ...core.auth.org_context import OrgContext, get_org_context
from ...core.auth.tenant_service import (
    TenantAwareSession,
    get_tenant_aware_db,
    with_tenant_context,
)
from ...core.security.permissions import PermissionChecker, check_permission
from ..services.compliance.gst_service import GSTService
from ..services.purchase.calculations import PurchaseCalculator
from ..services.returns.return_service import ReturnService
from ..services.finance.credit_note.service import CreditNoteService
from ..services.sales.invoice.invoice_service import InvoiceService
from ..services.sales.challan.service import ChallanService
from ..schemas.calculations import (
    InvoiceCalculationRequest,
    SalesOrderCalculationRequest,
    PurchaseCalculationRequest,
    ChallanCalculationRequest,
    ReturnCalculationRequest,
    NoteCalculationRequest,
    InvoiceCalculationPreviewResponse,
    ChallanCalculationPreviewResponse,
    NoteCalculationPreviewResponse,
    PurchaseCalculationPreviewResponse,
    ReturnCalculationPreviewResponse,
)


router = APIRouter(prefix="/calculations", tags=["Calculations"])


PreviewResponse = TypeVar("PreviewResponse", bound=BaseModel)


def _preview_response(
    result: Dict[str, Any],
    gst_type: str,
    response_type: Type[PreviewResponse],
    source_lines: Sequence[BaseModel],
) -> PreviewResponse:
    totals = dict(result)
    line_items = totals.pop("calculated_items")
    if len(line_items) != len(source_lines):
        raise ValueError("calculation response line count does not match request")
    identified_lines = []
    for index, line in enumerate(line_items):
        identified = dict(line)
        source = source_lines[index]
        if source.product_id is not None:
            identified["product_id"] = source.product_id
        batch_id = getattr(source, "batch_id", None)
        if batch_id is not None:
            identified["batch_id"] = batch_id
        identified_lines.append(identified)
    return response_type.model_validate({
        "success": True,
        "line_items": identified_lines,
        "totals": totals,
        "calculation_timestamp": int(time.time() * 1000),
        "gst_type": str(gst_type).strip().upper(),
    })


@router.post(
    "/invoice",
    response_model=InvoiceCalculationPreviewResponse,
    response_model_exclude_none=True,
)
@with_tenant_context
async def preview_invoice_totals(
    invoice_data: InvoiceCalculationRequest,
    _: dict = Depends(PermissionChecker("sales", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context),
):
    """Calculate an invoice without writing it; commit uses the same service method."""
    try:
        customer_id = invoice_data.customer_id
        if customer_id is not None and not isinstance(customer_id, UUID):
            gst_type = GSTService.determine_gst_type(
                db=db,
                org_id=str(context.org_id),
                branch_id=context.primary_branch_id,
                customer_id=int(customer_id),
            )
        else:
            gst_type = invoice_data.gst_type
        result = InvoiceService.calculate_invoice_totals(
            items=[item.model_dump() for item in invoice_data.items],
            gst_type=gst_type,
            freight_charges=invoice_data.freight_charges,
            insurance_charges=invoice_data.insurance_charges,
            other_charges=invoice_data.other_charges,
            discount_type=invoice_data.discount_type,
            discount_percent=invoice_data.discount_percent,
            discount_amount=invoice_data.discount_amount,
            exact_output=True,
        )
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return _preview_response(
        result, gst_type, InvoiceCalculationPreviewResponse, invoice_data.items
    )


@router.post(
    "/sales-order",
    response_model=InvoiceCalculationPreviewResponse,
    response_model_exclude_none=True,
)
@with_tenant_context
async def preview_sales_order_totals(
    order_data: SalesOrderCalculationRequest,
    _: dict = Depends(PermissionChecker("sales", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context),
):
    """Calculate a sales order without writing or allocating inventory."""
    try:
        customer_id = order_data.customer_id
        if not isinstance(customer_id, UUID):
            gst_type = GSTService.determine_gst_type(
                db=db,
                org_id=str(context.org_id),
                branch_id=context.primary_branch_id,
                customer_id=int(customer_id),
            )
        else:
            gst_type = order_data.gst_type
        items = []
        for item in order_data.items:
            item_data = item.model_dump()
            if item_data.get("tax_percent") is not None:
                item_data["gst_percent"] = item_data["tax_percent"]
            items.append(item_data)
        result = InvoiceService.calculate_invoice_totals(
            items=items,
            gst_type=gst_type,
            freight_charges=order_data.delivery_charges,
            insurance_charges=0,
            other_charges=order_data.other_charges,
            discount_type=order_data.discount_type,
            discount_percent=order_data.discount_percent,
            discount_amount=order_data.discount_amount,
            exact_output=True,
        )
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return _preview_response(
        result,
        gst_type,
        InvoiceCalculationPreviewResponse,
        order_data.items,
    )


@router.post(
    "/purchase-order",
    response_model=PurchaseCalculationPreviewResponse,
    response_model_exclude_none=True,
)
@with_tenant_context
async def preview_purchase_order_totals(
    purchase_data: PurchaseCalculationRequest,
    _: dict = Depends(PermissionChecker("procurement", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context),
):
    """Calculate a purchase order without trusting browser-computed totals."""
    try:
        supplier_id = purchase_data.supplier_id
        if supplier_id is not None and not isinstance(supplier_id, UUID):
            gst_type = GSTService.determine_gst_type(
                db=db,
                org_id=str(context.org_id),
                branch_id=context.primary_branch_id,
                supplier_id=int(supplier_id),
            )
        else:
            gst_type = purchase_data.gst_type

        result = PurchaseCalculator.calculate_totals(
            items=[item.model_dump() for item in purchase_data.items],
            gst_type=gst_type,
            freight_charges=purchase_data.freight_charges,
            insurance_charges=purchase_data.insurance_charges,
            other_charges=purchase_data.other_charges,
            exact_output=True,
        )
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return _preview_response(
        result,
        gst_type,
        PurchaseCalculationPreviewResponse,
        purchase_data.items,
    )


@router.post(
    "/challan",
    response_model=ChallanCalculationPreviewResponse,
    response_model_exclude_none=True,
)
@with_tenant_context
async def preview_challan_totals(
    challan_data: ChallanCalculationRequest,
    _: dict = Depends(PermissionChecker("sales", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context),
):
    """Calculate a delivery challan using the same path as commit."""
    try:
        customer_id = challan_data.customer_id
        if not isinstance(customer_id, UUID):
            gst_type = GSTService.determine_gst_type(
                db=db,
                org_id=str(context.org_id),
                branch_id=context.primary_branch_id,
                customer_id=int(customer_id),
            )
        else:
            gst_type = challan_data.gst_type
        result = ChallanService.calculate_challan_totals(
            items=[item.model_dump() for item in challan_data.items],
            gst_type=gst_type,
            freight_charges=challan_data.freight_charges,
            exact_output=True,
        )
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return _preview_response(
        result, gst_type, ChallanCalculationPreviewResponse, challan_data.items
    )


@router.post(
    "/return",
    response_model=ReturnCalculationPreviewResponse,
    response_model_exclude_none=True,
)
@with_tenant_context
async def preview_return_totals(
    return_data: ReturnCalculationRequest,
    user: dict = Depends(PermissionChecker()),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context),
):
    """Calculate sales or purchase returns with the commit-time rules."""
    required_module = "sales" if return_data.return_type == "sales" else "purchase"
    if not check_permission(user, required_module, "view"):
        raise HTTPException(
            status_code=403,
            detail=f"Permission denied: view on {required_module}",
        )
    try:
        party_kwargs: Dict[str, int] = {}
        if (return_data.return_type == "sales" and return_data.customer_id is not None
                and not isinstance(return_data.customer_id, UUID)):
            party_kwargs["customer_id"] = return_data.customer_id
        elif (return_data.return_type == "purchase" and return_data.supplier_id is not None
                and not isinstance(return_data.supplier_id, UUID)):
            party_kwargs["supplier_id"] = return_data.supplier_id

        gst_type = (
            GSTService.determine_gst_type(
                db=db,
                org_id=str(context.org_id),
                branch_id=context.primary_branch_id,
                **party_kwargs,
            )
            if party_kwargs and return_data.include_gst
            else return_data.gst_type
        )
        result = ReturnService.calculate_return_totals(
            [item.model_dump() for item in return_data.items],
            gst_type,
            include_gst=return_data.include_gst,
            cap_to_paid_quantity=return_data.return_type == "sales",
            exclude_free_quantity_from_taxable=return_data.return_type == "sales",
        )
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return _preview_response(
        result,
        gst_type,
        ReturnCalculationPreviewResponse,
        return_data.items,
    )


@router.post(
    "/note",
    response_model=NoteCalculationPreviewResponse,
    response_model_exclude_none=True,
)
@with_tenant_context
async def preview_note_totals(
    note_data: NoteCalculationRequest,
    _: dict = Depends(PermissionChecker("finance", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context),
):
    """Calculate a credit or debit note without writing ledger state."""
    try:
        party_kwargs: Dict[str, int] = {}
        if note_data.party_id is not None and not isinstance(note_data.party_id, UUID):
            party_kwargs[
                "supplier_id" if note_data.party_type == "supplier" else "customer_id"
            ] = note_data.party_id
        gst_type = (
            GSTService.determine_gst_type(
                db=db,
                org_id=str(context.org_id),
                branch_id=context.primary_branch_id,
                **party_kwargs,
            )
            if party_kwargs and note_data.include_gst
            else note_data.gst_type
        )
        result = CreditNoteService.calculate_note_totals({
            "include_gst": note_data.include_gst,
            "items": [item.model_dump() for item in note_data.items],
        }, gst_type)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return _preview_response(
        result,
        gst_type,
        NoteCalculationPreviewResponse,
        note_data.items,
    )

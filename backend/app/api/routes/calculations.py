"""Read-only calculation previews backed by the same services as document writes."""

import time
from typing import Any, Dict, Optional, Sequence, Type, TypeVar
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security import HTTPBearer
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security.permissions import PermissionChecker
from ..services.sales.calculation import calculate_sales_totals
from ..services.sales.tax_authority import resolve_sales_tax_authority
from ..schemas.calculations import (
    InvoiceCalculationRequest,
    SalesOrderCalculationRequest,
    InvoiceCalculationPreviewResponse,
)


router = APIRouter(
    prefix="/calculations",
    tags=["Calculations"],
    dependencies=[Security(HTTPBearer(auto_error=False))],
)


PreviewResponse = TypeVar("PreviewResponse", bound=BaseModel)


def _activate(db: Session, user: Dict[str, Any]) -> UUID:
    """Activate the canonical actor before any forced-RLS calculation reads."""
    org_id = UUID(str(user["org_id"]))
    db.execute(
        text("""
            SELECT erp_security.activate_context(:auth_user_id, :org_id),
                   pg_catalog.set_config('app.request_id', :request_id, true)
        """),
        {
            "auth_user_id": UUID(str(user["auth_user_id"])),
            "org_id": org_id,
            "request_id": str(uuid4()),
        },
    )
    return org_id


def _preview_response(
    result: Dict[str, Any],
    gst_type: str,
    response_type: Type[PreviewResponse],
    source_lines: Sequence[BaseModel],
    tax_authority_lines: Optional[Sequence[Any]] = None,
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
        if tax_authority_lines is not None:
            authority = tax_authority_lines[index]
            identified.update({
                "hsn_code": authority.hsn_code,
                "taxability": authority.taxability,
                "tax_code_version_id": authority.tax_code_version_id,
                "tax_release_id": authority.tax_release_id,
                "tax_version_number": authority.tax_version_number,
                "tax_effective_from": authority.tax_effective_from,
                "tax_effective_to": authority.tax_effective_to,
                "tax_ruleset_version": authority.tax_ruleset_version,
            })
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
def preview_invoice_totals(
    invoice_data: InvoiceCalculationRequest,
    user: dict = Depends(PermissionChecker("sales", "view")),
    db: Session = Depends(get_db),
):
    """Calculate an invoice without writing it; commit uses the same service method."""
    org_id = _activate(db, user)
    try:
        authority = resolve_sales_tax_authority(
            db,
            org_id=org_id,
            branch_id=invoice_data.branch_id,
            customer_account_id=invoice_data.customer_id,
            product_ids=[item.product_id for item in invoice_data.items],
            document_date=invoice_data.document_date,
        )
        items = []
        for source, resolved in zip(invoice_data.items, authority.lines):
            item = source.model_dump()
            item["resolved_gst_percent"] = resolved.gst_rate
            items.append(item)
        result = calculate_sales_totals(
            items=items,
            gst_type=authority.gst_type,
            freight_charges=invoice_data.freight_charges,
            insurance_charges=invoice_data.insurance_charges,
            other_charges=invoice_data.other_charges,
            discount_type=invoice_data.discount_type,
            discount_percent=invoice_data.discount_percent,
            discount_amount=invoice_data.discount_amount,
        )
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return _preview_response(
        result,
        authority.gst_type,
        InvoiceCalculationPreviewResponse,
        invoice_data.items,
        authority.lines,
    )


@router.post(
    "/sales-order",
    response_model=InvoiceCalculationPreviewResponse,
    response_model_exclude_none=True,
)
def preview_sales_order_totals(
    order_data: SalesOrderCalculationRequest,
    user: dict = Depends(PermissionChecker("sales", "view")),
    db: Session = Depends(get_db),
):
    """Calculate a sales order without writing or allocating inventory."""
    org_id = _activate(db, user)
    try:
        authority = resolve_sales_tax_authority(
            db,
            org_id=org_id,
            branch_id=order_data.branch_id,
            customer_account_id=order_data.customer_id,
            product_ids=[item.product_id for item in order_data.items],
            document_date=order_data.order_date,
        )
        items = []
        for item, resolved in zip(order_data.items, authority.lines):
            item_data = item.model_dump()
            item_data["resolved_gst_percent"] = resolved.gst_rate
            items.append(item_data)
        result = calculate_sales_totals(
            items=items,
            gst_type=authority.gst_type,
            freight_charges=order_data.delivery_charges,
            insurance_charges=0,
            other_charges=order_data.other_charges,
            discount_type=order_data.discount_type,
            discount_percent=order_data.discount_percent,
            discount_amount=order_data.discount_amount,
            rounding_policy=order_data.rounding_policy,
        )
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return _preview_response(
        result,
        authority.gst_type,
        InvoiceCalculationPreviewResponse,
        order_data.items,
        authority.lines,
    )

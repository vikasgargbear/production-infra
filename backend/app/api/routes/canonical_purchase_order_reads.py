"""Strict first-party readback for canonical purchase-order commands."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Literal, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security import HTTPBearer
from pydantic import BaseModel, ConfigDict, model_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security.permissions import PermissionChecker


router = APIRouter(
    dependencies=[Security(HTTPBearer(auto_error=False))],
    tags=["Canonical Purchase Order Reads"],
)


class CanonicalPurchaseOrderDetailLine(BaseModel):
    model_config = ConfigDict(extra="forbid")

    purchase_order_line_id: UUID
    line_number: int
    line_kind: Literal["product", "charge"]
    product_id: Optional[UUID]
    product_name: Optional[str]
    product_code: Optional[str]
    hsn_code: Optional[str]
    charge_code: Optional[str]
    uom_code: Optional[str]
    uom_conversion_id: Optional[UUID]
    billed_quantity: Optional[Decimal]
    free_quantity: Optional[Decimal]
    free_supply_tax_treatment: Optional[Literal[
        "excluded_from_taxable_value", "included_at_unit_rate"
    ]]
    quoted_unit_rate: Optional[Decimal]
    price_basis: Literal["tax_exclusive", "tax_inclusive"]
    gross_amount: Decimal
    line_discount_amount: Decimal
    document_discount_amount: Decimal
    net_value_amount: Decimal
    gst_taxable_value: Decimal
    cgst_rate: Decimal
    sgst_rate: Decimal
    igst_rate: Decimal
    cess_rate: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    cess_amount: Decimal
    line_total: Decimal

    @model_validator(mode="after")
    def validate_line_kind(self):
        if self.line_kind == "product":
            if (
                not self.product_id
                or not self.product_name
                or not self.product_code
                or not self.hsn_code
                or not self.uom_code
                or not self.uom_conversion_id
                or self.billed_quantity is None
                or self.free_quantity is None
                or self.free_supply_tax_treatment is None
                or self.quoted_unit_rate is None
                or self.charge_code is not None
            ):
                raise ValueError("canonical purchase-order product line is incomplete")
        elif (
            not self.charge_code
            or self.product_id is not None
            or self.product_name is not None
            or self.product_code is not None
            or self.hsn_code is not None
            or self.uom_code is not None
            or self.uom_conversion_id is not None
            or self.billed_quantity is not None
            or self.free_quantity is not None
        ):
            raise ValueError("canonical purchase-order charge line is incomplete")
        return self


class CanonicalPurchaseOrderDetailResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    purchase_order_id: UUID
    branch_id: UUID
    supplier_id: UUID
    supplier_name: str
    purchase_order_number: str
    order_date: date
    expected_delivery_date: Optional[date]
    status: Literal["approved"]
    supply_type: Literal["intra_state", "inter_state"]
    currency_code: str
    subtotal: Decimal
    discount_total: Decimal
    charges_total: Decimal
    net_value_total: Decimal
    taxable_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    cess_amount: Decimal
    rounding_adjustment: Decimal
    total_amount: Decimal
    calculation_ruleset_version: str
    row_version: int
    items: list[CanonicalPurchaseOrderDetailLine]

    @model_validator(mode="after")
    def validate_exact_totals(self):
        if not self.items:
            raise ValueError("canonical purchase order has no lines")
        product_lines = [line for line in self.items if line.line_kind == "product"]
        charge_lines = [line for line in self.items if line.line_kind == "charge"]
        checks = (
            (sum((line.gross_amount for line in product_lines), Decimal("0")), self.subtotal, "subtotal"),
            (sum((line.gross_amount for line in charge_lines), Decimal("0")), self.charges_total, "charges total"),
            (
                sum((line.line_discount_amount + line.document_discount_amount for line in self.items), Decimal("0")),
                self.discount_total,
                "discount total",
            ),
            (sum((line.net_value_amount for line in self.items), Decimal("0")), self.net_value_total, "net value total"),
            (sum((line.gst_taxable_value for line in self.items), Decimal("0")), self.taxable_amount, "taxable total"),
            (sum((line.cgst_amount for line in self.items), Decimal("0")), self.cgst_amount, "CGST total"),
            (sum((line.sgst_amount for line in self.items), Decimal("0")), self.sgst_amount, "SGST total"),
            (sum((line.igst_amount for line in self.items), Decimal("0")), self.igst_amount, "IGST total"),
            (sum((line.cess_amount for line in self.items), Decimal("0")), self.cess_amount, "cess total"),
            (
                sum((line.line_total for line in self.items), Decimal("0")) + self.rounding_adjustment,
                self.total_amount,
                "grand total",
            ),
        )
        for actual, expected, label in checks:
            if actual != expected:
                raise ValueError(f"canonical purchase-order {label} does not reconcile")
        return self


def _activate(db: Session, user: dict[str, Any]) -> UUID:
    org_id = UUID(str(user["org_id"]))
    db.execute(
        text(
            """
            SELECT erp_security.activate_context(:auth_user_id, :org_id),
                   pg_catalog.set_config('app.request_id', :request_id, true)
            """
        ),
        {
            "auth_user_id": UUID(str(user["auth_user_id"])),
            "org_id": org_id,
            "request_id": str(uuid4()),
        },
    )
    return org_id


def _rows(db: Session, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    return [dict(row._mapping) for row in db.execute(text(sql), params).fetchall()]


def _canonical_purchase_order_detail(
    db: Session,
    org_id: UUID,
    purchase_order_id: UUID,
) -> CanonicalPurchaseOrderDetailResponse:
    rows = _rows(
        db,
        """
        SELECT purchase.id AS purchase_order_id, purchase.branch_id,
               purchase.supplier_account_id AS supplier_id,
               party.legal_name AS supplier_name,
               purchase.purchase_order_number, purchase.order_date,
               purchase.expected_delivery_date, purchase.status,
               purchase.supply_type, purchase.currency_code,
               purchase.subtotal, purchase.discount_total, purchase.charges_total,
               purchase.net_value_total,
               purchase.gst_taxable_total AS taxable_amount,
               purchase.cgst_total AS cgst_amount,
               purchase.sgst_total AS sgst_amount,
               purchase.igst_total AS igst_amount,
               purchase.cess_total AS cess_amount, purchase.rounding_adjustment,
               purchase.grand_total AS total_amount,
               purchase.calculation_ruleset_version, purchase.row_version
          FROM procurement.purchase_orders purchase
          JOIN parties.supplier_accounts account
            ON account.org_id=purchase.org_id
           AND account.id=purchase.supplier_account_id
          JOIN parties.parties party
            ON party.org_id=account.org_id AND party.id=account.party_id
         WHERE purchase.org_id=:org_id AND purchase.id=:purchase_order_id
           AND purchase.status='approved'
        """,
        {"org_id": org_id, "purchase_order_id": purchase_order_id},
    )
    if len(rows) != 1:
        raise HTTPException(status_code=404, detail="Canonical purchase order not found")

    rows[0]["items"] = _rows(
        db,
        """
        SELECT line.id AS purchase_order_line_id, line.line_number,
               line.line_kind, line.product_id, product.name AS product_name,
               product.sku AS product_code, product.hsn_code,
               line.charge_code, line.uom_code,
               requested.uom_conversion_id,
               line.billed_quantity, line.free_quantity,
               line.free_supply_tax_treatment, line.quoted_unit_rate,
               line.price_basis, line.gross_amount, line.line_discount_amount,
               line.document_discount_amount, line.net_value_amount,
               line.gst_taxable_value,
               line.cgst_rate, line.sgst_rate, line.igst_rate, line.cess_rate,
               line.cgst_amount, line.sgst_amount, line.igst_amount,
               line.cess_amount, line.line_total
          FROM procurement.purchase_order_lines line
          LEFT JOIN catalog.products product
            ON product.org_id=line.org_id AND product.id=line.product_id
          JOIN LATERAL erp_automation_reads.purchase_order_uom_provenance(
               line.org_id, line.purchase_order_id
          ) requested ON requested.purchase_order_line_id=line.id
         WHERE line.org_id=:org_id AND line.purchase_order_id=:purchase_order_id
         ORDER BY line.line_number, line.id
        """,
        {"org_id": org_id, "purchase_order_id": purchase_order_id},
    )
    return CanonicalPurchaseOrderDetailResponse(**rows[0])


@router.get(
    "/canonical/purchase-orders/{purchase_order_id}",
    response_model=CanonicalPurchaseOrderDetailResponse,
)
def canonical_purchase_order_detail(
    purchase_order_id: UUID,
    user: dict = Depends(PermissionChecker("purchase", "view")),
    db: Session = Depends(get_db),
):
    """Read one command-created PO without falling through a legacy projection."""
    return _canonical_purchase_order_detail(db, _activate(db, user), purchase_order_id)


__all__ = [
    "CanonicalPurchaseOrderDetailLine",
    "CanonicalPurchaseOrderDetailResponse",
    "_canonical_purchase_order_detail",
    "canonical_purchase_order_detail",
    "router",
]

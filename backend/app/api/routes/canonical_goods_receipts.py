"""UUID-only canonical goods-receipt context and readback endpoints.

The receipt write itself remains owned by the reviewed operator-command
boundary.  These reads expose only the source facts needed to prepare that
command and the immutable inventory evidence produced after execution.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, Literal, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security import HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security.permissions import PermissionChecker


router = APIRouter(
    prefix="/canonical/goods-receipts",
    dependencies=[Security(HTTPBearer(auto_error=False))],
)
PURCHASE_USER = Depends(PermissionChecker("purchase", "view"))


def _activate(db: Session, user: Dict[str, Any]) -> UUID:
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


def _one(db: Session, sql: str, params: dict[str, Any]) -> Optional[dict[str, Any]]:
    row = db.execute(text(sql), params).mappings().one_or_none()
    return dict(row) if row is not None else None


def _rows(db: Session, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    return [dict(row) for row in db.execute(text(sql), params).mappings().all()]


class ReceiptLocation(BaseModel):
    id: UUID
    code: str
    name: str
    location_type: Literal["saleable", "quarantine", "cold_storage"]


class ReceiptMrpConversion(BaseModel):
    id: UUID
    from_uom_code: str
    to_uom_code: str
    multiplier: Decimal


class ReceiptContextLine(BaseModel):
    purchase_order_line_id: UUID
    line_number: int
    product_id: UUID
    product_name: str
    sku: str
    ordered_uom_code: str
    base_uom_code: str
    uom_conversion_factor: Decimal
    ordered_billed_quantity: Decimal
    ordered_free_quantity: Decimal
    remaining_billed_quantity: Decimal
    remaining_free_quantity: Decimal
    eligible_locations: list[ReceiptLocation]
    mrp_conversions: list[ReceiptMrpConversion]

    @model_validator(mode="after")
    def require_valid_remaining_context(self):
        if self.uom_conversion_factor <= 0:
            raise ValueError("receipt UOM conversion factor must be positive")
        if self.remaining_billed_quantity < 0 or self.remaining_free_quantity < 0:
            raise ValueError("receipt remaining quantities cannot be negative")
        if self.remaining_billed_quantity + self.remaining_free_quantity <= 0:
            raise ValueError("receipt line has no remaining quantity")
        if len({item.id for item in self.eligible_locations}) != len(
            self.eligible_locations
        ):
            raise ValueError("receipt locations must be unique")
        if len({item.id for item in self.mrp_conversions}) != len(
            self.mrp_conversions
        ):
            raise ValueError("receipt MRP conversions must be unique")
        return self


class ReceiptContextResponse(BaseModel):
    purchase_order_id: UUID
    purchase_order_number: str
    order_date: date
    total_amount: Decimal
    branch_id: UUID
    supplier_account_id: UUID
    supplier_name: str
    organization_timezone: str
    business_as_of: datetime
    status: Literal["approved", "partially_received"]
    lines: list[ReceiptContextLine]

    model_config = ConfigDict(extra="forbid")

    @field_validator("business_as_of")
    @classmethod
    def require_organization_local_clock(cls, value: datetime) -> datetime:
        if value.tzinfo is not None:
            raise ValueError("receipt business_as_of must be organization-local")
        return value

    @model_validator(mode="after")
    def require_receivable_lines(self):
        if not self.lines:
            raise ValueError("purchase order has no remaining canonical receipt lines")
        if len({line.purchase_order_line_id for line in self.lines}) != len(self.lines):
            raise ValueError("purchase order receipt lines must be unique")
        return self


class ReceiptInventoryEvidence(BaseModel):
    inventory_document_line_id: UUID
    inventory_document_id: UUID
    movement_kind: Literal["receipt"]
    entered_quantity: Decimal
    base_quantity: Decimal
    unit_cost: Decimal
    extended_cost: Decimal
    ledger_entry_id: UUID
    ledger_quantity_delta: Decimal
    ledger_value_delta: Decimal
    current_on_hand_quantity: Decimal
    current_inventory_value: Decimal
    current_average_unit_cost: Decimal


class ReceiptDetailLine(BaseModel):
    goods_receipt_line_id: UUID
    line_number: int
    purchase_order_line_id: UUID
    product_id: UUID
    product_name: str
    sku: str
    batch_id: UUID
    manufacturer_batch_number: str
    manufactured_on: Optional[str]
    expires_on: str
    mrp: Decimal
    batch_status: str
    location_id: UUID
    location_code: str
    location_name: str
    location_type: str
    uom_code: str
    received_quantity: Decimal
    accepted_quantity: Decimal
    rejected_quantity: Decimal
    free_quantity: Decimal
    base_accepted_quantity: Decimal
    base_free_quantity: Decimal
    qc_status: str
    qc_notes: Optional[str]
    unit_cost: Decimal
    extended_cost: Decimal
    inventory: ReceiptInventoryEvidence

    @model_validator(mode="after")
    def reconcile_inventory_evidence(self):
        expected_entered = self.accepted_quantity + self.free_quantity
        expected_base = self.base_accepted_quantity + self.base_free_quantity
        if self.inventory.entered_quantity != expected_entered:
            raise ValueError("inventory entered quantity does not reconcile to accepted plus free")
        if self.inventory.base_quantity != expected_base:
            raise ValueError("inventory base quantity does not reconcile to accepted plus free")
        if self.inventory.ledger_quantity_delta != expected_base:
            raise ValueError("stock ledger quantity does not reconcile to receipt base quantity")
        if self.inventory.unit_cost != self.unit_cost:
            raise ValueError("inventory unit cost does not reconcile to receipt unit cost")
        if self.inventory.extended_cost != self.extended_cost:
            raise ValueError("inventory line value does not reconcile to receipt extended cost")
        if self.inventory.ledger_value_delta != self.extended_cost:
            raise ValueError("stock ledger valuation does not reconcile to receipt extended cost")
        return self


class ReceiptDetailResponse(BaseModel):
    goods_receipt_id: UUID
    goods_receipt_number: str
    branch_id: UUID
    supplier_account_id: UUID
    supplier_name: str
    organization_timezone: str
    business_as_of: datetime
    purchase_order_id: UUID
    purchase_order_number: str
    received_at: str
    supplier_challan_number: Optional[str]
    supplier_challan_date: Optional[str]
    status: Literal["posted"]
    posted_at: str
    inventory_document_id: UUID
    inventory_document_number: str
    inventory_document_status: Literal["posted"]
    costing_method: Literal["moving_weighted_average"]
    total_abs_base_quantity: Decimal
    total_inventory_value: Decimal
    impact_scope: str = "inventory_only_reference_no_payable_or_itc"
    tax_impact: list[Any] = Field(default_factory=list, max_length=0)
    journal_impact: list[Any] = Field(default_factory=list, max_length=0)
    lines: list[ReceiptDetailLine]

    model_config = ConfigDict(extra="forbid")

    @field_validator("business_as_of")
    @classmethod
    def require_organization_local_clock(cls, value: datetime) -> datetime:
        if value.tzinfo is not None:
            raise ValueError("receipt business_as_of must be organization-local")
        return value

    @model_validator(mode="after")
    def reconcile_document_totals(self):
        if not self.lines:
            raise ValueError("posted goods receipt has no inventory evidence")
        if any(
            line.inventory.inventory_document_id != self.inventory_document_id
            for line in self.lines
        ):
            raise ValueError("receipt line references a different inventory document")
        if sum((line.inventory.base_quantity for line in self.lines), Decimal("0")) != self.total_abs_base_quantity:
            raise ValueError("inventory document quantity does not reconcile to receipt lines")
        if sum((line.inventory.extended_cost for line in self.lines), Decimal("0")) != self.total_inventory_value:
            raise ValueError("inventory document value does not reconcile to receipt lines")
        return self


@router.get(
    "/purchase-orders/{purchase_order_id}/context",
    response_model=ReceiptContextResponse,
)
def purchase_order_receipt_context(
    purchase_order_id: UUID,
    user: dict = PURCHASE_USER,
    db: Session = Depends(get_db),
):
    """Return exact remaining PO facts accepted by goods-receipt prepare."""

    org_id = _activate(db, user)
    return _canonical_purchase_order_receipt_context(
        db, org_id, purchase_order_id
    )


def _canonical_purchase_order_receipt_context(
    db: Session,
    org_id: UUID,
    purchase_order_id: UUID,
) -> ReceiptContextResponse:
    """Execute the runtime-role purchase-order receipt projection."""

    header = _one(db, """
        SELECT purchase_order.id AS purchase_order_id,
               purchase_order.purchase_order_number,
               purchase_order.order_date,
               purchase_order.grand_total AS total_amount,
               purchase_order.branch_id,
               purchase_order.supplier_account_id,
               party.legal_name AS supplier_name,
               organization.timezone AS organization_timezone,
               transaction_timestamp() AT TIME ZONE organization.timezone
                 AS business_as_of,
               purchase_order.status
          FROM procurement.purchase_orders purchase_order
          JOIN core.organizations organization
            ON organization.id=purchase_order.org_id
           AND organization.status='active'
          JOIN parties.supplier_accounts supplier
            ON supplier.org_id=purchase_order.org_id
           AND supplier.id=purchase_order.supplier_account_id
           AND supplier.status='active'
          JOIN parties.parties party
            ON party.org_id=supplier.org_id AND party.id=supplier.party_id
           AND party.status='active'
         WHERE purchase_order.org_id=:org_id
           AND purchase_order.id=:purchase_order_id
           AND purchase_order.status IN ('approved','partially_received')
           AND purchase_order.currency_code='INR'
           AND purchase_order.zero_rated_payment_mode='not_applicable'
           AND purchase_order.tax_charge_mechanism='normal'
    """, {"org_id": org_id, "purchase_order_id": purchase_order_id})
    if header is None:
        raise HTTPException(
            status_code=404,
            detail="Approved canonical purchase order is unavailable for receipt",
        )

    lines = _rows(db, """
        SELECT line.id AS purchase_order_line_id, line.line_number,
               line.product_id, product.name AS product_name, product.sku,
               line.uom_code AS ordered_uom_code,
               product.base_uom_code,
               line.uom_conversion_factor,
               line.billed_quantity AS ordered_billed_quantity,
               line.free_quantity AS ordered_free_quantity,
               (line.base_billed_quantity-COALESCE(received.base_billed,0))
                 / line.uom_conversion_factor AS remaining_billed_quantity,
               (line.base_free_quantity-COALESCE(received.base_free,0))
                 / line.uom_conversion_factor AS remaining_free_quantity,
               COALESCE(location_data.eligible_locations, '[]'::jsonb) AS eligible_locations,
               COALESCE(conversion_data.mrp_conversions, '[]'::jsonb) AS mrp_conversions
          FROM procurement.purchase_order_lines line
          JOIN catalog.products product
            ON product.org_id=line.org_id AND product.id=line.product_id
           AND product.status='active'
          LEFT JOIN LATERAL (
              SELECT COALESCE(SUM(receipt_line.base_accepted_quantity),0) AS base_billed,
                     COALESCE(SUM(receipt_line.base_free_quantity),0) AS base_free
                FROM procurement.goods_receipt_lines receipt_line
                JOIN procurement.goods_receipts receipt
                  ON receipt.org_id=receipt_line.org_id
                 AND receipt.id=receipt_line.goods_receipt_id
                 AND receipt.status='posted'
               WHERE receipt_line.org_id=line.org_id
                 AND receipt_line.purchase_order_line_id=line.id
          ) received ON true
          LEFT JOIN LATERAL (
              SELECT jsonb_agg(jsonb_build_object(
                         'id', location.id, 'code', location.code,
                         'name', location.name, 'location_type', location.location_type
                     ) ORDER BY location.location_type, location.code, location.id) AS eligible_locations
                FROM inventory.locations location
               WHERE location.org_id=line.org_id
                 AND location.branch_id=:branch_id
                 AND location.status='active'
                 AND location.location_type IN ('saleable','quarantine','cold_storage')
                 AND (NOT product.cold_chain_required OR (
                       location.location_type='cold_storage'
                       AND location.temperature_min_c IS NOT NULL
                       AND location.temperature_max_c IS NOT NULL
                       AND location.temperature_min_c>=product.minimum_storage_celsius
                       AND location.temperature_max_c<=product.maximum_storage_celsius))
          ) location_data ON true
          LEFT JOIN LATERAL (
              SELECT jsonb_agg(jsonb_build_object(
                         'id', conversion.id,
                         'from_uom_code', conversion.from_uom_code,
                         'to_uom_code', conversion.to_uom_code,
                         'multiplier', conversion.multiplier
                     ) ORDER BY (conversion.from_uom_code=line.uom_code) DESC,
                                conversion.from_uom_code, conversion.id) AS mrp_conversions
                FROM catalog.uom_conversions conversion
               WHERE conversion.org_id=line.org_id
                 AND conversion.product_id=line.product_id
                 AND conversion.to_uom_code=product.base_uom_code
                 AND conversion.status='active'
                 AND conversion.valid_from<=CURRENT_DATE
                 AND (conversion.valid_until IS NULL OR conversion.valid_until>=CURRENT_DATE)
          ) conversion_data ON true
         WHERE line.org_id=:org_id AND line.purchase_order_id=:purchase_order_id
           AND line.line_kind='product'
           AND (COALESCE(received.base_billed,0)<line.base_billed_quantity
                OR COALESCE(received.base_free,0)<line.base_free_quantity)
         ORDER BY line.line_number, line.id
    """, {
        "org_id": org_id,
        "purchase_order_id": purchase_order_id,
        "branch_id": header["branch_id"],
    })
    return ReceiptContextResponse.model_validate({**header, "lines": lines})


@router.get("/{goods_receipt_id}", response_model=ReceiptDetailResponse)
def goods_receipt_detail(
    goods_receipt_id: UUID,
    user: dict = PURCHASE_USER,
    db: Session = Depends(get_db),
):
    """Read one posted receipt with exact stock-ledger and valuation evidence."""

    org_id = _activate(db, user)
    return _canonical_goods_receipt_detail(db, org_id, goods_receipt_id)


def _canonical_goods_receipt_detail(
    db: Session,
    org_id: UUID,
    goods_receipt_id: UUID,
) -> ReceiptDetailResponse:
    """Execute the runtime-role canonical detail read after auth activation."""

    header = _one(db, """
        SELECT receipt.id AS goods_receipt_id,
               receipt.goods_receipt_number,
               receipt.branch_id,
               receipt.supplier_account_id,
               party.legal_name AS supplier_name,
               organization.timezone AS organization_timezone,
               transaction_timestamp() AT TIME ZONE organization.timezone
                 AS business_as_of,
               source.purchase_order_id,
               source.purchase_order_number,
               receipt.received_at::text AS received_at,
               receipt.supplier_challan_number,
               receipt.supplier_challan_date::text AS supplier_challan_date,
               receipt.status, receipt.posted_at::text AS posted_at,
               document.id AS inventory_document_id,
               document.document_number AS inventory_document_number,
               document.status AS inventory_document_status,
               document.costing_method_snapshot AS costing_method,
               document.total_abs_base_quantity,
               document.total_value AS total_inventory_value
          FROM procurement.goods_receipts receipt
          JOIN parties.supplier_accounts supplier
            ON supplier.org_id=receipt.org_id AND supplier.id=receipt.supplier_account_id
          JOIN parties.parties party
            ON party.org_id=supplier.org_id AND party.id=supplier.party_id
          JOIN core.organizations organization
            ON organization.id=receipt.org_id
           AND organization.status='active'
          JOIN inventory.inventory_documents document
            ON document.org_id=receipt.org_id AND document.goods_receipt_id=receipt.id
           AND document.document_type='purchase_receipt' AND document.status='posted'
          JOIN LATERAL (
              SELECT DISTINCT purchase_order.id AS purchase_order_id,
                     purchase_order.purchase_order_number
                FROM procurement.goods_receipt_lines receipt_line
                JOIN procurement.purchase_order_lines order_line
                  ON order_line.org_id=receipt_line.org_id
                 AND order_line.id=receipt_line.purchase_order_line_id
                JOIN procurement.purchase_orders purchase_order
                  ON purchase_order.org_id=order_line.org_id
                 AND purchase_order.id=order_line.purchase_order_id
               WHERE receipt_line.org_id=receipt.org_id
                 AND receipt_line.goods_receipt_id=receipt.id
          ) source ON true
         WHERE receipt.org_id=:org_id AND receipt.id=:goods_receipt_id
           AND receipt.status='posted'
    """, {"org_id": org_id, "goods_receipt_id": goods_receipt_id})
    if header is None:
        raise HTTPException(status_code=404, detail="Posted canonical goods receipt not found")

    lines = _rows(db, """
        SELECT receipt_line.id AS goods_receipt_line_id,
               receipt_line.line_number,
               receipt_line.purchase_order_line_id,
               receipt_line.product_id, product.name AS product_name, product.sku,
               receipt_line.batch_id,
               batch.batch_number AS manufacturer_batch_number,
               batch.manufactured_on::text AS manufactured_on,
               batch.expires_on::text AS expires_on,
               batch.mrp, batch.status AS batch_status,
               receipt_line.location_id, location.code AS location_code,
               location.name AS location_name, location.location_type,
               receipt_line.uom_code, receipt_line.received_quantity,
               receipt_line.accepted_quantity, receipt_line.rejected_quantity,
               receipt_line.free_quantity, receipt_line.base_accepted_quantity,
               receipt_line.base_free_quantity, receipt_line.qc_status,
               receipt_line.qc_notes, receipt_line.unit_cost,
               receipt_line.extended_cost,
               jsonb_build_object(
                   'inventory_document_line_id', inventory_line.id,
                   'inventory_document_id', inventory_line.inventory_document_id,
                   'movement_kind', inventory_line.movement_kind,
                   'entered_quantity', inventory_line.entered_quantity,
                   'base_quantity', inventory_line.base_quantity,
                   'unit_cost', inventory_line.unit_cost,
                   'extended_cost', inventory_line.extended_cost,
                   'ledger_entry_id', ledger.id,
                   'ledger_quantity_delta', ledger.quantity_delta,
                   'ledger_value_delta', ledger.value_delta,
                   'current_on_hand_quantity', balance.on_hand_quantity,
                   'current_inventory_value', balance.inventory_value,
                   'current_average_unit_cost', balance.average_unit_cost
               ) AS inventory
          FROM procurement.goods_receipt_lines receipt_line
          JOIN catalog.products product
            ON product.org_id=receipt_line.org_id AND product.id=receipt_line.product_id
          JOIN inventory.batches batch
            ON batch.org_id=receipt_line.org_id AND batch.id=receipt_line.batch_id
          JOIN inventory.locations location
            ON location.org_id=receipt_line.org_id AND location.id=receipt_line.location_id
          JOIN inventory.inventory_document_lines inventory_line
            ON inventory_line.org_id=receipt_line.org_id
           AND inventory_line.goods_receipt_line_id=receipt_line.id
          JOIN inventory.stock_ledger_entries ledger
            ON ledger.org_id=inventory_line.org_id
           AND ledger.inventory_document_line_id=inventory_line.id
           AND ledger.reverses_entry_id IS NULL
          JOIN inventory.stock_balances balance
            ON balance.org_id=receipt_line.org_id
           AND balance.location_id=receipt_line.location_id
           AND balance.product_id=receipt_line.product_id
           AND balance.batch_id=receipt_line.batch_id
         WHERE receipt_line.org_id=:org_id
           AND receipt_line.goods_receipt_id=:goods_receipt_id
         ORDER BY receipt_line.line_number, receipt_line.id
    """, {"org_id": org_id, "goods_receipt_id": goods_receipt_id})
    return ReceiptDetailResponse.model_validate({**header, "lines": lines})

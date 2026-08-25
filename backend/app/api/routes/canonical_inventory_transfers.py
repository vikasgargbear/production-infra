"""Canonical read context and immutable readback for inter-branch transfers."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated, Any, Dict
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Security
from fastapi.security import HTTPBearer
from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security.permissions import PermissionChecker


router = APIRouter(
    prefix="/canonical/inventory-transfers",
    dependencies=[Security(HTTPBearer(auto_error=False))],
)
INVENTORY_USER = Depends(PermissionChecker("inventory", "view"))
QuantityString = Annotated[str, StringConstraints(pattern=r"^-?(?:0|[1-9]\d{0,13})\.\d{6}$")]
PositiveQuantityString = Annotated[str, StringConstraints(pattern=r"^(?:0|[1-9]\d{0,13})\.\d{6}$")]
CostString = Annotated[str, StringConstraints(pattern=r"^(?:0|[1-9]\d{0,15})\.\d{4}$")]
MoneyString = Annotated[str, StringConstraints(pattern=r"^-?(?:0|[1-9]\d{0,17})\.\d{2}$")]
PositiveMoneyString = Annotated[str, StringConstraints(pattern=r"^(?:0|[1-9]\d{0,17})\.\d{2}$")]


def _require_positive_decimal(value: str) -> str:
    if Decimal(value) <= 0:
        raise ValueError("canonical transfer evidence must be greater than zero")
    return value


def _activate(db: Session, user: Dict[str, Any]) -> UUID:
    org_id = UUID(str(user["org_id"]))
    db.execute(
        text("""
            SELECT erp_security.activate_context(:auth_user_id, :org_id),
                   pg_catalog.set_config('app.request_id', :request_id, true)
        """),
        {"auth_user_id": UUID(str(user["auth_user_id"])), "org_id": org_id, "request_id": str(uuid4())},
    )
    return org_id


class EligibleTransferBatch(BaseModel):
    batch_id: UUID
    batch_number: str
    expires_on: str
    product_id: UUID
    uom_conversion_id: UUID
    selected_uom_code: str
    base_uom_code: str
    uom_multiplier: PositiveQuantityString
    available_base_quantity: PositiveQuantityString
    available_selected_quantity: PositiveQuantityString
    average_unit_cost: CostString
    inventory_value: PositiveMoneyString
    is_default: bool
    model_config = ConfigDict(extra="forbid")

    _positive_evidence = field_validator(
        "uom_multiplier",
        "available_base_quantity",
        "available_selected_quantity",
        "average_unit_cost",
        "inventory_value",
    )(_require_positive_decimal)


class TransferReadbackLine(BaseModel):
    inventory_document_line_id: UUID
    product_id: UUID
    batch_id: UUID
    from_location_id: UUID
    to_location_id: UUID
    base_quantity: PositiveQuantityString
    unit_cost: CostString
    extended_cost: PositiveMoneyString
    transfer_out_ledger_id: UUID
    transfer_out_branch_id: UUID
    transfer_out_location_id: UUID
    transfer_out_product_id: UUID
    transfer_out_batch_id: UUID
    transfer_out_quantity: QuantityString
    transfer_out_unit_cost: CostString
    transfer_out_value: MoneyString
    transfer_in_ledger_id: UUID
    transfer_in_branch_id: UUID
    transfer_in_location_id: UUID
    transfer_in_product_id: UUID
    transfer_in_batch_id: UUID
    transfer_in_quantity: QuantityString
    transfer_in_unit_cost: CostString
    transfer_in_value: MoneyString

    _positive_evidence = field_validator(
        "base_quantity", "unit_cost", "extended_cost"
    )(_require_positive_decimal)


class TransferReadbackResponse(BaseModel):
    id: UUID
    document_number: str
    status: str
    branch_id: UUID
    destination_branch_id: UUID
    document_date: str
    total_abs_base_quantity: PositiveQuantityString
    total_value: PositiveMoneyString
    row_version: int
    lines: list[TransferReadbackLine]
    model_config = ConfigDict(extra="forbid")

    _positive_totals = field_validator(
        "total_abs_base_quantity", "total_value"
    )(_require_positive_decimal)

    @field_validator("status")
    @classmethod
    def require_posted(cls, value: str) -> str:
        if value != "posted":
            raise ValueError("canonical transfer readback requires posted evidence")
        return value


@router.get("/eligible-batches", response_model=list[EligibleTransferBatch])
def get_eligible_transfer_batches(
    source_branch_id: UUID,
    source_location_id: UUID,
    destination_branch_id: UUID,
    destination_location_id: UUID,
    product_id: UUID,
    uom_conversion_id: UUID,
    transfer_date: date = Query(),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = INVENTORY_USER,
):
    if source_branch_id == destination_branch_id or source_location_id == destination_location_id:
        raise HTTPException(status_code=422, detail="Source and destination branches and locations must be distinct")
    org_id = _activate(db, current_user)
    rows = db.execute(text("""
        WITH scope AS (
          SELECT source_location.id AS source_location_id,destination_location.id AS destination_location_id
            FROM core.organizations organization
            JOIN core.branches source_branch ON source_branch.org_id=organization.id AND source_branch.id=:source_branch_id
            JOIN core.branches destination_branch ON destination_branch.org_id=organization.id AND destination_branch.id=:destination_branch_id
            JOIN inventory.locations source_location ON source_location.org_id=organization.id
              AND source_location.id=:source_location_id AND source_location.branch_id=source_branch.id
            JOIN inventory.locations destination_location ON destination_location.org_id=organization.id
              AND destination_location.id=:destination_location_id AND destination_location.branch_id=destination_branch.id
           WHERE organization.id=:org_id AND organization.status='active'
             AND source_branch.status='active' AND destination_branch.status='active'
             AND source_branch.id<>destination_branch.id AND source_location.id<>destination_location.id
             AND source_location.status='active' AND destination_location.status='active'
             AND source_location.location_type='saleable' AND destination_location.location_type='saleable'
             AND source_location.allows_sale AND destination_location.allows_sale
             AND NOT source_location.allows_negative_stock
             AND NOT destination_location.allows_negative_stock
             AND ROW(source_location.temperature_min_c,source_location.temperature_max_c)
                 IS NOT DISTINCT FROM ROW(destination_location.temperature_min_c,destination_location.temperature_max_c)
             AND CAST(:transfer_date AS date)=(transaction_timestamp() AT TIME ZONE organization.timezone)::date
             AND erp_security.can_access_branch(source_branch.id)
             AND erp_security.can_access_branch(destination_branch.id)
        ), authority AS (
          SELECT conversion.id,conversion.from_uom_code,conversion.to_uom_code,conversion.multiplier
            FROM catalog.uom_conversions conversion JOIN catalog.products product
              ON product.org_id=conversion.org_id AND product.id=conversion.product_id
           WHERE conversion.org_id=:org_id AND conversion.id=:uom_conversion_id
             AND conversion.product_id=:product_id AND conversion.status='active' AND product.status='active'
             AND NOT product.cold_chain_required AND NOT product.ndps_regulated
             AND conversion.to_uom_code=product.base_uom_code
             AND conversion.multiplier>0 AND conversion.valid_from<=CAST(:transfer_date AS date)
             AND (conversion.valid_until IS NULL OR conversion.valid_until>=CAST(:transfer_date AS date))
        ), eligible AS (
          SELECT batch.id,batch.batch_number,batch.expires_on,balance.on_hand_quantity,
                 balance.inventory_value,balance.average_unit_cost
            FROM inventory.batches batch JOIN inventory.stock_balances balance
              ON balance.org_id=batch.org_id AND balance.batch_id=batch.id AND balance.product_id=batch.product_id
            JOIN scope ON scope.source_location_id=balance.location_id
           WHERE batch.org_id=:org_id AND batch.product_id=:product_id AND batch.status='released'
             AND batch.released_at IS NOT NULL AND batch.expires_on>CAST(:transfer_date AS date)
             AND balance.branch_id=:source_branch_id AND balance.location_id=:source_location_id
             AND balance.on_hand_quantity>0
             AND trunc(balance.on_hand_quantity/(SELECT multiplier FROM authority),6)>=0.000001
             AND NOT EXISTS (SELECT 1 FROM compliance.recall_batches rb JOIN compliance.recalls recall
               ON recall.org_id=rb.org_id AND recall.id=rb.recall_id WHERE rb.org_id=batch.org_id AND rb.batch_id=batch.id
                AND recall.status IN ('initiated','in_progress') AND rb.status IN ('identified','quarantined'))
             AND NOT EXISTS (SELECT 1 FROM inventory.inventory_document_lines pending_line
               JOIN inventory.inventory_documents pending ON pending.org_id=pending_line.org_id
                AND pending.id=pending_line.inventory_document_id
              WHERE pending_line.org_id=batch.org_id AND pending.status IN ('draft','submitted','approved')
                AND pending_line.batch_id=batch.id
                AND :source_location_id IN (pending_line.from_location_id,pending_line.to_location_id))
        ), earliest AS (SELECT min(expires_on) expires_on FROM eligible)
        SELECT eligible.id AS batch_id,eligible.batch_number,eligible.expires_on::text,
               :product_id AS product_id,authority.id AS uom_conversion_id,
               authority.from_uom_code AS selected_uom_code,authority.to_uom_code AS base_uom_code,
               to_char(authority.multiplier,'FM99999999999999.000000') AS uom_multiplier,
               to_char(eligible.on_hand_quantity,'FM99999999999999.000000') AS available_base_quantity,
               to_char(trunc(eligible.on_hand_quantity/authority.multiplier,6),'FM99999999999999.000000') AS available_selected_quantity,
               to_char(eligible.average_unit_cost,'FM9999999999999999.0000') AS average_unit_cost,
               to_char(eligible.inventory_value,'FM99999999999999999999.00') AS inventory_value,
               row_number() OVER (ORDER BY eligible.expires_on,eligible.batch_number,eligible.id)=1 AS is_default
          FROM eligible JOIN earliest ON earliest.expires_on=eligible.expires_on CROSS JOIN authority
         ORDER BY eligible.expires_on,eligible.batch_number,eligible.id
    """), {
        "org_id": org_id, "source_branch_id": source_branch_id, "source_location_id": source_location_id,
        "destination_branch_id": destination_branch_id, "destination_location_id": destination_location_id,
        "product_id": product_id, "uom_conversion_id": uom_conversion_id, "transfer_date": transfer_date,
    }).mappings().all()
    return [dict(row) for row in rows]


@router.get("/{inventory_document_id}", response_model=TransferReadbackResponse)
def get_transfer_readback(
    inventory_document_id: UUID,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = INVENTORY_USER,
):
    org_id = _activate(db, current_user)
    header = db.execute(text("""
        SELECT id,document_number,status,branch_id,destination_branch_id,document_date::text,
               to_char(total_abs_base_quantity,'FM99999999999999.000000') AS total_abs_base_quantity,
               to_char(total_value,'FM99999999999999999999.00') AS total_value,row_version
          FROM inventory.inventory_documents WHERE org_id=:org_id AND id=:id AND document_type='transfer' AND status='posted'
           AND erp_security.can_access_branch(branch_id) AND erp_security.can_access_branch(destination_branch_id)
    """), {"org_id": org_id, "id": inventory_document_id}).mappings().one_or_none()
    if header is None:
        raise HTTPException(status_code=404, detail="Canonical transfer not found")
    lines = db.execute(text("""
        SELECT line.id AS inventory_document_line_id,line.product_id,line.batch_id,line.from_location_id,line.to_location_id,
               to_char(line.base_quantity,'FM99999999999999.000000') AS base_quantity,
               to_char(line.unit_cost,'FM9999999999999999.0000') AS unit_cost,
               to_char(line.extended_cost,'FM99999999999999999999.00') AS extended_cost,
               out_entry.id AS transfer_out_ledger_id,
               out_entry.branch_id AS transfer_out_branch_id,
               out_entry.location_id AS transfer_out_location_id,
               out_entry.product_id AS transfer_out_product_id,
               out_entry.batch_id AS transfer_out_batch_id,
               to_char(out_entry.quantity_delta,'FM99999999999999.000000') AS transfer_out_quantity,
               to_char(out_entry.unit_cost,'FM9999999999999999.0000') AS transfer_out_unit_cost,
               to_char(out_entry.value_delta,'FM99999999999999999999.00') AS transfer_out_value,
               in_entry.id AS transfer_in_ledger_id,
               in_entry.branch_id AS transfer_in_branch_id,
               in_entry.location_id AS transfer_in_location_id,
               in_entry.product_id AS transfer_in_product_id,
               in_entry.batch_id AS transfer_in_batch_id,
               to_char(in_entry.quantity_delta,'FM99999999999999.000000') AS transfer_in_quantity,
               to_char(in_entry.unit_cost,'FM9999999999999999.0000') AS transfer_in_unit_cost,
               to_char(in_entry.value_delta,'FM99999999999999999999.00') AS transfer_in_value
          FROM inventory.inventory_document_lines line
          LEFT JOIN inventory.stock_ledger_entries out_entry ON out_entry.org_id=line.org_id
            AND out_entry.inventory_document_id=line.inventory_document_id
            AND out_entry.inventory_document_line_id=line.id AND out_entry.entry_kind='transfer_out'
          LEFT JOIN inventory.stock_ledger_entries in_entry ON in_entry.org_id=line.org_id
            AND in_entry.inventory_document_id=line.inventory_document_id
            AND in_entry.inventory_document_line_id=line.id AND in_entry.entry_kind='transfer_in'
         WHERE line.org_id=:org_id AND line.inventory_document_id=:id ORDER BY line.line_number,line.id
    """), {"org_id": org_id, "id": inventory_document_id}).mappings().all()
    values = [dict(row) for row in lines]
    if not values:
        raise HTTPException(status_code=409, detail="Posted transfer has no inventory lines")
    for row in values:
        if row["transfer_out_ledger_id"] is None or row["transfer_in_ledger_id"] is None:
            raise HTTPException(status_code=409, detail="Posted transfer ledger evidence is incomplete")
        base = Decimal(row["base_quantity"])
        value = Decimal(row["extended_cost"])
        if (
            row["transfer_out_branch_id"] != header["branch_id"]
            or row["transfer_in_branch_id"] != header["destination_branch_id"]
            or row["transfer_out_location_id"] != row["from_location_id"]
            or row["transfer_in_location_id"] != row["to_location_id"]
            or row["transfer_out_product_id"] != row["product_id"]
            or row["transfer_in_product_id"] != row["product_id"]
            or row["transfer_out_batch_id"] != row["batch_id"]
            or row["transfer_in_batch_id"] != row["batch_id"]
            or Decimal(row["transfer_out_quantity"]) != -base
            or Decimal(row["transfer_in_quantity"]) != base
            or Decimal(row["transfer_out_unit_cost"]) != Decimal(row["unit_cost"])
            or Decimal(row["transfer_in_unit_cost"]) != Decimal(row["unit_cost"])
            or Decimal(row["transfer_out_value"]) != -value
            or Decimal(row["transfer_in_value"]) != value
        ):
            raise HTTPException(status_code=409, detail="Posted transfer ledger is not quantity/value balanced")
    if (
        sum((Decimal(row["base_quantity"]) for row in values), Decimal("0"))
        != Decimal(header["total_abs_base_quantity"])
        or sum((Decimal(row["extended_cost"]) for row in values), Decimal("0"))
        != Decimal(header["total_value"])
    ):
        raise HTTPException(status_code=409, detail="Posted transfer header does not reconcile to line evidence")
    return {**dict(header), "lines": values}

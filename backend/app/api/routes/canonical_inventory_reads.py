"""Exact, branch-scoped canonical inventory reads for the Stock Hub."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Security, status
from fastapi.security import HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, WithJsonSchema, model_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from ...core.auth import SECRET_KEY
from ...core.database import get_db
from ...core.security.permissions import PermissionChecker


router = APIRouter(dependencies=[Security(HTTPBearer(auto_error=False))])
INVENTORY_USER = Depends(PermissionChecker("inventory", "view"))


def _wire(scale: int):
    return lambda value: format(value, f".{scale}f")


def _schema(scale: int, *, signed: bool = False) -> dict[str, Any]:
    sign = "-?" if signed else ""
    return {
        "type": "string",
        "pattern": rf"^{sign}(?:0|[1-9][0-9]*)\.[0-9]{{{scale}}}$",
        "description": "Exact base-10 decimal string; never a JSON number.",
    }


ExactQuantity = Annotated[
    Decimal,
    Field(ge=0, max_digits=20, decimal_places=6),
    PlainSerializer(_wire(6), return_type=str, when_used="json"),
    WithJsonSchema(_schema(6), mode="serialization"),
]
SignedQuantity = Annotated[
    Decimal,
    Field(max_digits=20, decimal_places=6),
    PlainSerializer(_wire(6), return_type=str, when_used="json"),
    WithJsonSchema(_schema(6, signed=True), mode="serialization"),
]
ExactRate = Annotated[
    Decimal,
    Field(ge=0, max_digits=20, decimal_places=4),
    PlainSerializer(_wire(4), return_type=str, when_used="json"),
    WithJsonSchema(_schema(4), mode="serialization"),
]
ExactMoney = Annotated[
    Decimal,
    Field(ge=0, max_digits=20, decimal_places=2),
    PlainSerializer(_wire(2), return_type=str, when_used="json"),
    WithJsonSchema(_schema(2), mode="serialization"),
]
SignedMoney = Annotated[
    Decimal,
    Field(max_digits=20, decimal_places=2),
    PlainSerializer(_wire(2), return_type=str, when_used="json"),
    WithJsonSchema(_schema(2, signed=True), mode="serialization"),
]
ExactTemperature = Annotated[
    Decimal,
    Field(max_digits=9, decimal_places=6),
    PlainSerializer(_wire(6), return_type=str, when_used="json"),
    WithJsonSchema(_schema(6, signed=True), mode="serialization"),
]


class InventoryLocation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    location_id: UUID
    location_code: str
    location_name: str
    location_type: Literal[
        "saleable", "quarantine", "returns", "damaged", "cold_storage", "transit",
    ]
    location_status: Literal["active", "inactive", "blocked"]
    allows_sale: bool
    allows_negative_stock: bool
    temperature_min_c: Optional[ExactTemperature]
    temperature_max_c: Optional[ExactTemperature]


class InventoryBranch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    branch_id: UUID
    branch_code: str
    branch_name: str
    locations: list[InventoryLocation]


class InventoryContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    organization_id: UUID
    organization_timezone: str
    business_date: date
    branches: list[InventoryBranch]


class InventoryScope(BaseModel):
    model_config = ConfigDict(extra="forbid")
    branch_id: UUID
    branch_code: str
    branch_name: str
    location_id: Optional[UUID]
    location_code: Optional[str]
    location_name: Optional[str]


class CurrentStockRow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    product_id: UUID
    product_code: str
    product_name: str
    generic_name: Optional[str]
    hsn_code: Optional[str]
    product_type: Literal["medicine", "medical_device", "consumable"]
    unit: str
    category: Optional[str]
    total_quantity: SignedQuantity
    total_value: SignedMoney
    average_unit_cost: Optional[ExactRate]
    batch_count: int = Field(
        ge=0,
        description="Tracked batches with at least one scoped ledger entry, including exhausted batches.",
    )
    positive_stock_batch_count: int = Field(ge=0)
    exhausted_batch_count: int = Field(ge=0)
    negative_stock_batch_count: int = Field(ge=0)
    expired_batch_count: int = Field(
        ge=0,
        description="Expired batches whose scoped net on-hand quantity is positive.",
    )
    near_expiry_batch_count: int = Field(
        ge=0,
        description="Unexpired batches with positive stock expiring in the next 90 days.",
    )
    requires_cold_chain: bool

    @model_validator(mode="after")
    def validate_batch_partition(self):
        if self.batch_count != (
            self.positive_stock_batch_count
            + self.exhausted_batch_count
            + self.negative_stock_batch_count
        ):
            raise ValueError("tracked batch count does not reconcile by stock sign")
        return self


class CurrentStockSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    product_count: int = Field(ge=0)
    total_quantity: SignedQuantity
    total_value: SignedMoney
    batch_count: int = Field(
        ge=0,
        description="Tracked batches with at least one scoped ledger entry, including exhausted batches.",
    )
    positive_stock_batch_count: int = Field(ge=0)
    exhausted_batch_count: int = Field(ge=0)
    negative_stock_batch_count: int = Field(ge=0)

    @model_validator(mode="after")
    def validate_batch_partition(self):
        if self.batch_count != (
            self.positive_stock_batch_count
            + self.exhausted_batch_count
            + self.negative_stock_batch_count
        ):
            raise ValueError("tracked batch count does not reconcile by stock sign")
        return self


class CurrentStockPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scope: InventoryScope
    as_of: datetime
    business_date: date
    items: list[CurrentStockRow]
    total_count: int = Field(ge=0)
    summary: CurrentStockSummary
    next_cursor: Optional[str]

    @model_validator(mode="after")
    def validate_summary_identity(self):
        if self.total_count != self.summary.product_count:
            raise ValueError("current-stock total_count differs from summary product_count")
        return self


class BatchRow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    batch_id: UUID
    product_id: UUID
    product_code: str
    product_name: str
    batch_number: str
    manufactured_on: Optional[date]
    expires_on: Optional[date]
    expiry_state: Literal["undated", "expired", "expiring_30d", "near_expiry_90d", "current"]
    mrp: ExactRate
    status: Literal["quarantined", "released", "blocked", "recalled", "expired", "exhausted"]
    is_saleable: bool
    total_quantity: SignedQuantity
    total_value: SignedMoney
    average_unit_cost: Optional[ExactRate]


class BatchSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    batch_count: int = Field(
        ge=0,
        description="Tracked batches with at least one scoped ledger entry, at any net quantity.",
    )
    positive_stock_count: int = Field(ge=0)
    exhausted_batch_count: int = Field(ge=0)
    negative_stock_count: int = Field(ge=0)
    total_quantity: SignedQuantity
    total_value: SignedMoney
    expired_count: int = Field(ge=0)
    expiring_30d_count: int = Field(ge=0)
    near_expiry_90d_count: int = Field(ge=0)

    @model_validator(mode="after")
    def validate_batch_partition(self):
        if self.batch_count != (
            self.positive_stock_count
            + self.exhausted_batch_count
            + self.negative_stock_count
        ):
            raise ValueError("tracked batch count does not reconcile by stock sign")
        return self


class BatchPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scope: InventoryScope
    as_of: datetime
    business_date: date
    items: list[BatchRow]
    total_count: int = Field(ge=0)
    summary: BatchSummary
    next_cursor: Optional[str]

    @model_validator(mode="after")
    def validate_summary_identity(self):
        if self.total_count != self.summary.batch_count:
            raise ValueError("batch total_count differs from summary batch_count")
        return self


EntryKind = Literal[
    "receipt", "issue", "transfer_in", "transfer_out", "count_gain",
    "count_loss", "value_adjustment", "reversal",
]


class MovementRow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    movement_id: UUID
    posted_at: datetime
    entry_kind: EntryKind
    quantity_delta: SignedQuantity
    value_delta: SignedMoney
    absolute_quantity: ExactQuantity
    absolute_value: ExactMoney
    unit_cost: ExactRate
    branch_id: UUID
    branch_code: str
    branch_name: str
    location_id: UUID
    location_code: str
    location_name: str
    product_id: UUID
    product_code: str
    product_name: str
    batch_id: UUID
    batch_number: str
    inventory_document_id: UUID
    document_number: str
    reverses_entry_id: Optional[UUID]
    reversed_entry_kind: Optional[EntryKind]
    reversal_reconciled: Literal[True]
    posted_by: Optional[str]

    @model_validator(mode="after")
    def validate_ledger_semantics(self):
        if abs(self.quantity_delta) != self.absolute_quantity:
            raise ValueError("absolute_quantity differs from quantity_delta")
        if abs(self.value_delta) != self.absolute_value:
            raise ValueError("absolute_value differs from value_delta")
        if self.entry_kind == "value_adjustment" and (
            self.quantity_delta != 0 or self.value_delta == 0
        ):
            raise ValueError("value adjustment must have zero quantity and nonzero value")
        if self.entry_kind == "reversal":
            if self.reverses_entry_id is None or self.reversed_entry_kind is None:
                raise ValueError("reversal lineage is required")
            if self.quantity_delta == 0 and self.value_delta == 0:
                raise ValueError("reversal must carry an inverse delta")
        elif self.reverses_entry_id is not None or self.reversed_entry_kind is not None:
            raise ValueError("non-reversal cannot claim reversal lineage")
        if self.entry_kind in {"receipt", "transfer_in", "count_gain"} and (
            self.quantity_delta <= 0 or self.value_delta < 0
        ):
            raise ValueError("inbound ledger signs are invalid")
        if self.entry_kind in {"issue", "transfer_out", "count_loss"} and (
            self.quantity_delta >= 0 or self.value_delta > 0
        ):
            raise ValueError("outbound ledger signs are invalid")
        return self


class MovementSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    movement_count: int = Field(ge=0)
    gross_quantity: ExactQuantity
    net_quantity_delta: SignedQuantity
    gross_value: ExactMoney
    net_value_delta: SignedMoney


class MovementPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scope: InventoryScope
    as_of: datetime
    business_date: date
    items: list[MovementRow]
    total_count: int = Field(ge=0)
    summary: MovementSummary
    next_cursor: Optional[str]

    @model_validator(mode="after")
    def validate_summary_identity(self):
        if self.total_count != self.summary.movement_count:
            raise ValueError("movement total_count differs from summary movement_count")
        return self


def _activate(db: Session, user: dict[str, Any]) -> UUID:
    org_id = UUID(str(user["org_id"]))
    db.execute(
        text("""
            SELECT erp_security.activate_context(:auth_user_id, :org_id),
                   pg_catalog.set_config('app.request_id', gen_random_uuid()::text, true)
        """),
        {"auth_user_id": UUID(str(user["auth_user_id"])), "org_id": org_id},
    )
    return org_id


def _mappings(db: Session, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    return [dict(row._mapping) for row in db.execute(text(sql), params).fetchall()]


def _cursor(payload: dict[str, str]) -> str:
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    envelope = {
        "payload": payload,
        "signature": hmac.new(SECRET_KEY.encode(), raw, hashlib.sha256).hexdigest(),
    }
    encoded = json.dumps(envelope, separators=(",", ":"), sort_keys=True).encode()
    return base64.urlsafe_b64encode(encoded).decode().rstrip("=")


def _query_fingerprint(route: str, **values: Any) -> str:
    """Bind a cursor to its endpoint, authorized scope, and normalized filters."""
    payload = {"route": route, **{key: str(value) if value is not None else None
                                  for key, value in values.items()}}
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    return hashlib.sha256(raw).hexdigest()


def _require_cursor_query(decoded: Optional[dict[str, str]], expected: str) -> None:
    if decoded is not None and decoded["query"] != expected:
        raise HTTPException(
            status_code=422,
            detail="Inventory page cursor does not match the requested scope or filters",
        )


def _decode_cursor(cursor: Optional[str], keys: set[str]) -> Optional[dict[str, str]]:
    if cursor is None:
        return None
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        envelope = json.loads(base64.urlsafe_b64decode(padded).decode())
        if not isinstance(envelope, dict) or set(envelope) != {"payload", "signature"}:
            raise ValueError
        value = envelope["payload"]
        signature = envelope["signature"]
        if not isinstance(value, dict) or set(value) != keys or not isinstance(signature, str):
            raise ValueError
        raw = json.dumps(value, separators=(",", ":"), sort_keys=True).encode()
        expected = hmac.new(SECRET_KEY.encode(), raw, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError
        return {key: str(value[key]) for key in keys}
    except (ValueError, TypeError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=422, detail="Invalid inventory page cursor") from exc


def _cursor_uuid(value: str) -> UUID:
    try:
        return UUID(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid inventory page cursor") from exc


def _cursor_datetime(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value)
        if parsed.utcoffset() is None:
            raise ValueError
        return parsed
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid inventory page cursor") from exc


def _cursor_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid inventory page cursor") from exc


def _scope(
    db: Session,
    org_id: UUID,
    branch_id: UUID,
    location_id: Optional[UUID],
) -> InventoryScope:
    rows = _mappings(db, """
        SELECT branch.id AS branch_id, branch.code AS branch_code,
               branch.name AS branch_name, location.id AS location_id,
               location.code AS location_code, location.name AS location_name
          FROM core.branches branch
          LEFT JOIN inventory.locations location
            ON location.org_id=branch.org_id AND location.branch_id=branch.id
           AND location.id=:location_id AND location.status='active'
         WHERE branch.org_id=:org_id AND branch.id=:branch_id AND branch.status='active'
           AND erp_security.can_access_branch(branch.id)
           AND (:location_id IS NULL OR location.id IS NOT NULL)
    """, {"org_id": org_id, "branch_id": branch_id, "location_id": location_id})
    if len(rows) != 1:
        raise HTTPException(status_code=403, detail="Inventory branch or location is not accessible")
    return InventoryScope.model_validate(rows[0])


def _clock(db: Session, org_id: UUID) -> tuple[datetime, date, str]:
    row = _mappings(db, """
        SELECT transaction_timestamp() AS as_of, organization.timezone,
               (transaction_timestamp() AT TIME ZONE organization.timezone)::date AS business_date
          FROM core.organizations organization
         WHERE organization.id=:org_id AND organization.status='active'
    """, {"org_id": org_id})
    if len(row) != 1:
        raise HTTPException(status_code=503, detail="Organization business clock is unavailable")
    return row[0]["as_of"], row[0]["business_date"], row[0]["timezone"]


@router.get("/canonical/inventory/context", response_model=InventoryContext)
def inventory_context(user: dict = INVENTORY_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    _, business_date, timezone = _clock(db, org_id)
    rows = _mappings(db, """
        SELECT branch.id AS branch_id, branch.code AS branch_code, branch.name AS branch_name,
               location.id AS location_id, location.code AS location_code,
               location.name AS location_name, location.location_type,
               location.status AS location_status, location.allows_sale,
               location.allows_negative_stock, location.temperature_min_c,
               location.temperature_max_c
          FROM core.branches branch
          LEFT JOIN inventory.locations location
            ON location.org_id=branch.org_id AND location.branch_id=branch.id
           AND location.status='active'
         WHERE branch.org_id=:org_id AND branch.status='active'
           AND erp_security.can_access_branch(branch.id)
         ORDER BY branch.code, branch.id, location.code, location.id
    """, {"org_id": org_id})
    branches: dict[UUID, InventoryBranch] = {}
    for row in rows:
        branch_id = row["branch_id"]
        if branch_id not in branches:
            branches[branch_id] = InventoryBranch(
                branch_id=branch_id, branch_code=row["branch_code"],
                branch_name=row["branch_name"], locations=[],
            )
        if row["location_id"] is not None:
            branches[branch_id].locations.append(InventoryLocation(
                location_id=row["location_id"], location_code=row["location_code"],
                location_name=row["location_name"], location_type=row["location_type"],
                location_status=row["location_status"], allows_sale=row["allows_sale"],
                allows_negative_stock=row["allows_negative_stock"],
                temperature_min_c=row["temperature_min_c"],
                temperature_max_c=row["temperature_max_c"],
            ))
    return InventoryContext(
        organization_id=org_id, organization_timezone=timezone,
        business_date=business_date, branches=list(branches.values()),
    )


@router.get("/canonical/inventory/current-stock", response_model=CurrentStockPage)
def current_stock(
    branch_id: UUID,
    location_id: Optional[UUID] = None,
    search: Optional[str] = Query(None, max_length=100),
    limit: int = Query(100, ge=1, le=200),
    cursor: Optional[str] = None,
    user: dict = INVENTORY_USER,
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    scope = _scope(db, org_id, branch_id, location_id)
    clock_as_of, clock_business_date, _ = _clock(db, org_id)
    normalized_search = search.strip() if search and search.strip() else None
    query = _query_fingerprint(
        "current-stock", organization_id=org_id,
        branch_id=branch_id, location_id=location_id,
        search=normalized_search,
    )
    decoded = _decode_cursor(cursor, {"product_id", "as_of", "business_date", "query"})
    _require_cursor_query(decoded, query)
    as_of = _cursor_datetime(decoded["as_of"]) if decoded else clock_as_of
    business_date = _cursor_date(decoded["business_date"]) if decoded else clock_business_date
    after_id = _cursor_uuid(decoded["product_id"]) if decoded else None
    params = {
        "org_id": org_id, "branch_id": branch_id, "location_id": location_id,
        "search": normalized_search,
        "after_id": after_id, "limit": limit + 1, "business_date": business_date,
        "as_of": as_of,
    }
    base = """
        FROM (
          SELECT entry.product_id, entry.batch_id,
                 sum(entry.quantity_delta) AS quantity,
                 sum(entry.value_delta) AS value
            FROM inventory.stock_ledger_entries entry
           WHERE entry.org_id=:org_id AND entry.branch_id=:branch_id
             AND entry.posted_at<=:as_of
             AND (:location_id IS NULL OR entry.location_id=:location_id)
           GROUP BY entry.product_id, entry.batch_id
        ) stock
        JOIN catalog.products product ON product.org_id=:org_id AND product.id=stock.product_id
        JOIN inventory.batches batch ON batch.org_id=:org_id AND batch.id=stock.batch_id
        LEFT JOIN catalog.categories category
          ON category.org_id=product.org_id AND category.id=product.category_id
       WHERE (:search IS NULL OR product.name ILIKE '%%'||:search||'%%'
              OR product.sku ILIKE '%%'||:search||'%%'
              OR product.generic_name ILIKE '%%'||:search||'%%')
    """
    summary = _mappings(db, f"""
        SELECT count(DISTINCT stock.product_id) AS product_count,
               to_char(COALESCE(sum(stock.quantity),0),'FM99999999999999.000000') AS total_quantity,
               to_char(COALESCE(sum(stock.value),0),'FM999999999999999999.00') AS total_value,
               count(*) AS batch_count,
               count(*) FILTER (WHERE stock.quantity>0) AS positive_stock_batch_count,
               count(*) FILTER (WHERE stock.quantity=0) AS exhausted_batch_count,
               count(*) FILTER (WHERE stock.quantity<0) AS negative_stock_batch_count
        {base}
    """, params)[0]
    rows = _mappings(db, f"""
        SELECT stock.product_id, product.sku AS product_code, product.name AS product_name,
               product.generic_name, product.hsn_code, product.product_kind AS product_type,
               product.base_uom_code AS unit, category.name AS category,
               to_char(sum(stock.quantity),'FM99999999999999.000000') AS total_quantity,
               to_char(sum(stock.value),'FM999999999999999999.00') AS total_value,
               CASE WHEN sum(stock.quantity)=0 THEN NULL ELSE
                 to_char(round(sum(stock.value)/sum(stock.quantity),4),
                         'FM9999999999999999.0000') END AS average_unit_cost,
               count(*) AS batch_count,
               count(*) FILTER (WHERE stock.quantity>0) AS positive_stock_batch_count,
               count(*) FILTER (WHERE stock.quantity=0) AS exhausted_batch_count,
               count(*) FILTER (WHERE stock.quantity<0) AS negative_stock_batch_count,
               count(*) FILTER (
                 WHERE stock.quantity>0 AND batch.expires_on<=:business_date
               ) AS expired_batch_count,
               count(*) FILTER (
                 WHERE stock.quantity>0 AND batch.expires_on>:business_date
                   AND batch.expires_on<=:business_date+90
               ) AS near_expiry_batch_count,
               product.cold_chain_required AS requires_cold_chain
        {base} AND (:after_id IS NULL OR stock.product_id>:after_id)
        GROUP BY stock.product_id, product.sku, product.name, product.generic_name,
                 product.hsn_code, product.product_kind, product.base_uom_code,
                 category.name, product.cold_chain_required
        ORDER BY stock.product_id LIMIT :limit
    """, params)
    has_more = len(rows) > limit
    items = rows[:limit]
    return CurrentStockPage(
        scope=scope, as_of=as_of, business_date=business_date,
        items=items, total_count=summary["product_count"],
        summary=CurrentStockSummary.model_validate(summary),
        next_cursor=_cursor({
            "product_id": str(items[-1]["product_id"]),
            "as_of": as_of.isoformat(), "business_date": business_date.isoformat(),
            "query": query,
        }) if has_more else None,
    )


@router.get("/canonical/inventory/batches", response_model=BatchPage)
def batches(
    branch_id: UUID,
    location_id: Optional[UUID] = None,
    product_id: Optional[UUID] = None,
    search: Optional[str] = Query(None, max_length=100),
    limit: int = Query(100, ge=1, le=200),
    cursor: Optional[str] = None,
    user: dict = INVENTORY_USER,
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    scope = _scope(db, org_id, branch_id, location_id)
    clock_as_of, clock_business_date, _ = _clock(db, org_id)
    normalized_search = search.strip() if search and search.strip() else None
    query = _query_fingerprint(
        "batches", organization_id=org_id,
        branch_id=branch_id, location_id=location_id,
        product_id=product_id, search=normalized_search,
    )
    decoded = _decode_cursor(cursor, {"batch_id", "as_of", "business_date", "query"})
    _require_cursor_query(decoded, query)
    as_of = _cursor_datetime(decoded["as_of"]) if decoded else clock_as_of
    business_date = _cursor_date(decoded["business_date"]) if decoded else clock_business_date
    after_id = _cursor_uuid(decoded["batch_id"]) if decoded else None
    params = {
        "org_id": org_id, "branch_id": branch_id, "location_id": location_id,
        "product_id": product_id, "search": normalized_search,
        "after_id": after_id, "limit": limit + 1, "business_date": business_date,
        "as_of": as_of,
    }
    base = """
        FROM inventory.batches batch
        JOIN catalog.products product ON product.org_id=batch.org_id AND product.id=batch.product_id
        LEFT JOIN LATERAL (
          SELECT sum(balance.quantity_delta) AS quantity, sum(balance.value_delta) AS value,
                 sum(balance.quantity_delta) FILTER (
                   WHERE location.status='active'
                     AND location.location_type='saleable'
                     AND location.allows_sale
                     AND NOT location.allows_negative_stock
                 ) AS saleable_quantity
            FROM inventory.stock_ledger_entries balance
            JOIN inventory.locations location
              ON location.org_id=balance.org_id AND location.id=balance.location_id
           WHERE balance.org_id=batch.org_id AND balance.batch_id=batch.id
             AND balance.branch_id=:branch_id
             AND (:location_id IS NULL OR balance.location_id=:location_id)
             AND balance.posted_at<=:as_of
        ) stock ON true
       WHERE batch.org_id=:org_id AND stock.quantity IS NOT NULL
         AND (:product_id IS NULL OR batch.product_id=:product_id)
         AND (:search IS NULL OR batch.batch_number ILIKE '%%'||:search||'%%'
              OR product.name ILIKE '%%'||:search||'%%' OR product.sku ILIKE '%%'||:search||'%%')
    """
    summary = _mappings(db, f"""
        SELECT count(*) AS batch_count,
               count(*) FILTER (WHERE stock.quantity>0) AS positive_stock_count,
               count(*) FILTER (WHERE stock.quantity=0) AS exhausted_batch_count,
               count(*) FILTER (WHERE stock.quantity<0) AS negative_stock_count,
               to_char(COALESCE(sum(stock.quantity),0),'FM99999999999999.000000') AS total_quantity,
               to_char(COALESCE(sum(stock.value),0),'FM999999999999999999.00') AS total_value,
               count(*) FILTER (WHERE batch.expires_on<=:business_date) AS expired_count,
               count(*) FILTER (
                 WHERE batch.expires_on>:business_date AND batch.expires_on<=:business_date+30
               ) AS expiring_30d_count,
               count(*) FILTER (
                 WHERE batch.expires_on>:business_date+30 AND batch.expires_on<=:business_date+90
               ) AS near_expiry_90d_count
        {base}
    """, params)[0]
    rows = _mappings(db, f"""
        SELECT batch.id AS batch_id, batch.product_id, product.sku AS product_code,
               product.name AS product_name, batch.batch_number,
               batch.manufactured_on, batch.expires_on,
               CASE WHEN batch.expires_on IS NULL THEN 'undated'
                    WHEN batch.expires_on<=:business_date THEN 'expired'
                    WHEN batch.expires_on<=:business_date+30 THEN 'expiring_30d'
                    WHEN batch.expires_on<=:business_date+90 THEN 'near_expiry_90d'
                    ELSE 'current' END AS expiry_state,
               to_char(batch.mrp,'FM9999999999999999.0000') AS mrp,
               batch.status,
               (batch.status='released' AND batch.released_at IS NOT NULL
                AND (batch.expires_on IS NULL OR batch.expires_on>:business_date)
                AND COALESCE(stock.saleable_quantity,0)>0
                AND NOT EXISTS (
                  SELECT 1 FROM compliance.recall_batches recall_batch
                  JOIN compliance.recalls recall
                    ON recall.org_id=recall_batch.org_id AND recall.id=recall_batch.recall_id
                  WHERE recall_batch.org_id=batch.org_id AND recall_batch.batch_id=batch.id
                    AND recall.status IN ('initiated','in_progress')
                    AND recall_batch.status IN ('identified','quarantined')
                )) AS is_saleable,
               to_char(stock.quantity,'FM99999999999999.000000') AS total_quantity,
               to_char(stock.value,'FM999999999999999999.00') AS total_value,
               CASE WHEN stock.quantity=0 THEN NULL ELSE
                 to_char(round(stock.value/stock.quantity,4),'FM9999999999999999.0000')
               END AS average_unit_cost
        {base} AND (:after_id IS NULL OR batch.id>:after_id)
        ORDER BY batch.id LIMIT :limit
    """, params)
    has_more = len(rows) > limit
    items = rows[:limit]
    return BatchPage(
        scope=scope, as_of=as_of, business_date=business_date,
        items=items, total_count=summary["batch_count"],
        summary=BatchSummary.model_validate(summary),
        next_cursor=_cursor({
            "batch_id": str(items[-1]["batch_id"]),
            "as_of": as_of.isoformat(), "business_date": business_date.isoformat(),
            "query": query,
        }) if has_more else None,
    )


@router.get("/canonical/inventory/movements", response_model=MovementPage)
def movements(
    branch_id: UUID,
    location_id: Optional[UUID] = None,
    product_id: Optional[UUID] = None,
    batch_id: Optional[UUID] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = Query(100, ge=1, le=200),
    cursor: Optional[str] = None,
    user: dict = INVENTORY_USER,
    db: Session = Depends(get_db),
):
    if date_from and date_to and date_to < date_from:
        raise HTTPException(status_code=422, detail="date_to must be on or after date_from")
    org_id = _activate(db, user)
    scope = _scope(db, org_id, branch_id, location_id)
    clock_as_of, clock_business_date, _ = _clock(db, org_id)
    query = _query_fingerprint(
        "movements", organization_id=org_id,
        branch_id=branch_id, location_id=location_id,
        product_id=product_id, batch_id=batch_id,
        date_from=date_from, date_to=date_to,
    )
    decoded = _decode_cursor(
        cursor, {"posted_at", "movement_id", "as_of", "business_date", "query"},
    )
    _require_cursor_query(decoded, query)
    as_of = _cursor_datetime(decoded["as_of"]) if decoded else clock_as_of
    business_date = _cursor_date(decoded["business_date"]) if decoded else clock_business_date
    after_at = _cursor_datetime(decoded["posted_at"]) if decoded else None
    after_id = _cursor_uuid(decoded["movement_id"]) if decoded else None
    params = {
        "org_id": org_id, "branch_id": branch_id, "location_id": location_id,
        "product_id": product_id, "batch_id": batch_id, "date_from": date_from,
        "date_to": date_to, "after_at": after_at, "after_id": after_id,
        "limit": limit + 1, "as_of": as_of,
    }
    base = """
        FROM inventory.stock_ledger_entries entry
        JOIN core.branches branch ON branch.org_id=entry.org_id AND branch.id=entry.branch_id
        JOIN core.organizations organization ON organization.id=entry.org_id
        JOIN inventory.locations location ON location.org_id=entry.org_id AND location.id=entry.location_id
        JOIN catalog.products product ON product.org_id=entry.org_id AND product.id=entry.product_id
        JOIN inventory.batches batch ON batch.org_id=entry.org_id AND batch.id=entry.batch_id
        JOIN inventory.inventory_documents document
          ON document.org_id=entry.org_id AND document.id=entry.inventory_document_id
        LEFT JOIN inventory.stock_ledger_entries reversed
          ON reversed.org_id=entry.org_id AND reversed.id=entry.reverses_entry_id
        LEFT JOIN core.memberships membership
          ON membership.org_id=entry.org_id AND membership.id=entry.posted_by_membership_id
        LEFT JOIN core.users actor ON actor.id=membership.user_id
       WHERE entry.org_id=:org_id AND entry.branch_id=:branch_id
         AND entry.posted_at<=:as_of
         AND (:location_id IS NULL OR entry.location_id=:location_id)
         AND (:product_id IS NULL OR entry.product_id=:product_id)
         AND (:batch_id IS NULL OR entry.batch_id=:batch_id)
         AND (:date_from IS NULL OR (entry.posted_at AT TIME ZONE organization.timezone)::date>=:date_from)
         AND (:date_to IS NULL OR (entry.posted_at AT TIME ZONE organization.timezone)::date<=:date_to)
    """
    summary = _mappings(db, f"""
        SELECT count(*) AS movement_count,
               to_char(COALESCE(sum(abs(entry.quantity_delta)),0),'FM99999999999999.000000') AS gross_quantity,
               to_char(COALESCE(sum(entry.quantity_delta),0),'FM99999999999999.000000') AS net_quantity_delta,
               to_char(COALESCE(sum(abs(entry.value_delta)),0),'FM999999999999999999.00') AS gross_value,
               to_char(COALESCE(sum(entry.value_delta),0),'FM999999999999999999.00') AS net_value_delta
        {base}
    """, params)[0]
    rows = _mappings(db, f"""
        SELECT entry.id AS movement_id, entry.posted_at, entry.entry_kind,
               to_char(entry.quantity_delta,'FM99999999999999.000000') AS quantity_delta,
               to_char(entry.value_delta,'FM999999999999999999.00') AS value_delta,
               to_char(abs(entry.quantity_delta),'FM99999999999999.000000') AS absolute_quantity,
               to_char(abs(entry.value_delta),'FM999999999999999999.00') AS absolute_value,
               to_char(entry.unit_cost,'FM9999999999999999.0000') AS unit_cost,
               entry.branch_id, branch.code AS branch_code, branch.name AS branch_name,
               entry.location_id, location.code AS location_code, location.name AS location_name,
               entry.product_id, product.sku AS product_code, product.name AS product_name,
               entry.batch_id, batch.batch_number, entry.inventory_document_id,
               document.document_number, entry.reverses_entry_id,
               reversed.entry_kind AS reversed_entry_kind,
               CASE WHEN entry.entry_kind<>'reversal' THEN true ELSE
                 reversed.id IS NOT NULL
                 AND entry.quantity_delta=-reversed.quantity_delta
                 AND entry.value_delta=-reversed.value_delta
                 AND entry.branch_id=reversed.branch_id
                 AND entry.location_id=reversed.location_id
                 AND entry.product_id=reversed.product_id
                 AND entry.batch_id=reversed.batch_id
               END AS reversal_reconciled,
               actor.display_name AS posted_by
        {base}
          AND (:after_at IS NULL OR (entry.posted_at,entry.id)<(:after_at,:after_id))
        ORDER BY entry.posted_at DESC, entry.id DESC LIMIT :limit
    """, params)
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor = None
    if has_more:
        last = items[-1]
        next_cursor = _cursor({
            "posted_at": last["posted_at"].isoformat(),
            "movement_id": str(last["movement_id"]),
            "as_of": as_of.isoformat(), "business_date": business_date.isoformat(),
            "query": query,
        })
    return MovementPage(
        scope=scope, as_of=as_of, business_date=business_date,
        items=items, total_count=summary["movement_count"],
        summary=MovementSummary.model_validate(summary), next_cursor=next_cursor,
    )

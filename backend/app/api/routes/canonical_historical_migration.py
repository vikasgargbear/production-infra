"""Reviewed historical-data import and non-posting business insights."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
import hashlib
import json
from typing import Any, Literal, Optional
from uuid import UUID, NAMESPACE_URL, uuid4, uuid5

from fastapi import APIRouter, Depends, HTTPException, Query, Security
from fastapi.security import HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security.permissions import ExactPermissionChecker, PermissionChecker
from ..schemas.money import MoneyJSON


router = APIRouter(
    prefix="/canonical/migration-history",
    dependencies=[Security(HTTPBearer(auto_error=False))],
    tags=["Canonical Historical Migration"],
)
IMPORT_USER = Depends(ExactPermissionChecker("core.organization.manage"))
REPORT_USER = Depends(PermissionChecker("finance", "view"))

FactKind = Literal[
    "product",
    "batch",
    "party",
    "sales_invoice",
    "sales_invoice_line",
    "purchase_invoice",
    "sales_return",
    "purchase_return",
    "opening_item",
]


def _exact(value: Optional[Decimal]) -> Optional[str]:
    if value is None:
        return None
    if value == 0:
        value = abs(value)
    return format(value, "f")


def _activate(db: Session, user: dict[str, Any]) -> UUID:
    org_id = UUID(str(user["org_id"]))
    db.execute(
        text(
            """
            SELECT erp_security.activate_context(:auth_user_id,:org_id),
                   pg_catalog.set_config('app.request_id',:request_id,true)
            """
        ),
        {
            "auth_user_id": UUID(str(user["auth_user_id"])),
            "org_id": org_id,
            "request_id": str(uuid4()),
        },
    )
    return org_id


def _branch_scope(user: dict[str, Any]) -> Optional[list[UUID]]:
    organization_scope = (
        user.get("is_admin") is True
        or str(user.get("data_access_level") or "").lower() == "organization"
        or str(user.get("branch_scope") or "").lower() in {"all", "organization"}
    )
    if organization_scope:
        return None
    return [UUID(str(value)) for value in (user.get("branch_ids") or [])]


class HistoricalFactWrite(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    source_kind: FactKind
    record_key: str = Field(min_length=1, max_length=256)
    event_date: Optional[date] = None
    party_key: Optional[str] = Field(default=None, max_length=128)
    party_name: Optional[str] = Field(default=None, max_length=255)
    product_id: Optional[UUID] = None
    product_code: Optional[str] = Field(default=None, max_length=128)
    product_name: Optional[str] = Field(default=None, max_length=255)
    batch_number: Optional[str] = Field(default=None, max_length=128)
    quantity: Optional[Decimal] = Field(
        default=None, max_digits=20, decimal_places=6
    )
    taxable_amount: Optional[Decimal] = Field(
        default=None, max_digits=20, decimal_places=2
    )
    tax_amount: Optional[Decimal] = Field(
        default=None, max_digits=20, decimal_places=2
    )
    total_amount: Optional[Decimal] = Field(
        default=None, max_digits=20, decimal_places=2
    )
    outstanding_amount: Optional[Decimal] = Field(
        default=None, max_digits=20, decimal_places=2
    )
    inventory_value: Optional[Decimal] = Field(
        default=None, max_digits=20, decimal_places=2
    )
    side: Optional[Literal["receivable", "payable"]] = None
    selection_state: str = Field(min_length=1, max_length=64)
    payload: dict[str, Any]

    @model_validator(mode="after")
    def validate_kind(self):
        dated = {
            "batch",
            "sales_invoice",
            "sales_invoice_line",
            "purchase_invoice",
            "sales_return",
            "purchase_return",
            "opening_item",
        }
        if self.source_kind in dated and self.event_date is None:
            raise ValueError(f"{self.source_kind} requires event_date")
        if self.source_kind == "product" and (
            self.quantity is not None or self.inventory_value is not None
        ) and self.event_date is None:
            raise ValueError("product opening stock requires event_date")
        if self.source_kind == "batch" and (
            not self.batch_number or not (self.product_code or self.product_id)
        ):
            raise ValueError("batch requires batch_number and product identity")
        if self.source_kind == "sales_invoice_line" and not (
            self.product_code or self.product_id or self.product_name
        ):
            raise ValueError("sales invoice line requires product identity")
        if self.source_kind == "opening_item" and (
            self.outstanding_amount is None or self.side is None
        ):
            raise ValueError("opening item requires amount and receivable/payable side")
        if len(json.dumps(self.payload, separators=(",", ":"), default=str)) > 131072:
            raise ValueError("historical fact payload is too large")
        return self


class HistoricalImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    dataset_id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$")
    branch_id: UUID
    confirmation: str = Field(min_length=16, max_length=320)
    facts: list[HistoricalFactWrite] = Field(min_length=1, max_length=500)


class HistoricalImportResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inserted: int = Field(ge=0)
    replayed: int = Field(ge=0)
    accepted: int = Field(ge=1)


class OperationalCutoverRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    dataset_id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$")
    batch_size: int = Field(default=500, ge=1, le=500)
    confirmation: str = Field(min_length=16, max_length=320)


class OperationalCutoverResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    parties_promoted: int = Field(ge=0)
    parties_bound: int = Field(ge=0)
    parties_remaining: int = Field(ge=0)
    openings_promoted: int = Field(ge=0)
    openings_remaining: int = Field(ge=0)
    complete: bool


class OperationalCutoverStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_parties: int = Field(ge=0)
    bound_parties: int = Field(ge=0)
    source_openings: int = Field(ge=0)
    posted_openings: int = Field(ge=0)
    receivable: MoneyJSON
    payable: MoneyJSON


class ProductInventoryCutoverRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    dataset_id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$")
    location_id: UUID
    batch_size: int = Field(default=100, ge=1, le=100)
    confirmation: str = Field(min_length=16, max_length=400)


class ProductInventoryCutoverResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    products_created: int = Field(ge=0)
    products_replayed: int = Field(ge=0)
    products_remaining: int = Field(ge=0)
    negative_products_clamped: int = Field(ge=0)
    batches_bound: int = Field(ge=0)
    openings_posted: int = Field(ge=0)
    complete: bool


class ProductInventoryCutoverStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_products: int = Field(ge=0)
    quarantined_products: int = Field(ge=0)
    bound_products: int = Field(ge=0)
    setup_review_required: int = Field(ge=0)
    negative_products_clamped: int = Field(ge=0)
    source_batches: int = Field(ge=0)
    quarantined_batches: int = Field(ge=0)
    bound_batches: int = Field(ge=0)
    posted_openings: int = Field(ge=0)
    opening_quantity: str
    opening_value: MoneyJSON
    ledger_quantity: str
    ledger_value: MoneyJSON


class DocumentSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    invoice_count: int = Field(ge=0)
    taxable: MoneyJSON
    tax: MoneyJSON
    total: MoneyJSON


class ReturnSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sales_count: int = Field(ge=0)
    purchase_count: int = Field(ge=0)
    sales_total: MoneyJSON
    purchase_total: MoneyJSON


class OutstandingSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    receivable: MoneyJSON
    payable: MoneyJSON
    overdue_receivable: MoneyJSON
    item_count: int = Field(ge=0)


class InventorySummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    batch_count: int = Field(ge=0)
    quantity: str
    value: MoneyJSON
    near_expiry_batches: int = Field(ge=0)
    near_expiry_value: MoneyJSON


class MonthlySales(BaseModel):
    model_config = ConfigDict(extra="forbid")
    month: date
    invoices: int = Field(ge=0)
    total: MoneyJSON


class ProductInsight(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    quantity: str
    total: MoneyJSON


class CustomerInsight(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    invoices: int = Field(ge=0)
    total: MoneyJSON


class HistoricalInsightsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contract_version: Literal["1.0.0"]
    definition_version: Literal["historical-observed-v1"]
    currency_code: Literal["INR"]
    date_from: Optional[date]
    date_to: Optional[date]
    coverage: dict[str, int]
    sales: DocumentSummary
    purchases: DocumentSummary
    returns: ReturnSummary
    outstanding: OutstandingSummary
    inventory: InventorySummary
    monthly_sales: list[MonthlySales]
    top_products: list[ProductInsight]
    top_customers: list[CustomerInsight]
    limitations: list[str]


class HistoricalInvoiceArchiveItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    record_key: str
    invoice_number: str
    invoice_date: date
    customer_name: str
    line_count: int = Field(ge=0)
    taxable_amount: MoneyJSON
    tax_amount: MoneyJSON
    total_amount: MoneyJSON


class HistoricalInvoiceArchiveResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[HistoricalInvoiceArchiveItem]
    total: int = Field(ge=0)
    offset: int = Field(ge=0)
    limit: int = Field(ge=1, le=100)


def _wire_fact(
    *, org_id: UUID, dataset_id: str, branch_id: UUID, fact: HistoricalFactWrite
) -> dict[str, Any]:
    normalized = {
        "dataset_id": dataset_id,
        "source_kind": fact.source_kind,
        "record_key": fact.record_key,
        "branch_id": str(branch_id),
        "event_date": fact.event_date.isoformat() if fact.event_date else None,
        "party_key": fact.party_key,
        "party_name": fact.party_name,
        "product_id": str(fact.product_id) if fact.product_id else None,
        "product_code": fact.product_code,
        "product_name": fact.product_name,
        "batch_number": fact.batch_number,
        "quantity": _exact(fact.quantity),
        "taxable_amount": _exact(fact.taxable_amount),
        "tax_amount": _exact(fact.tax_amount),
        "total_amount": _exact(fact.total_amount),
        "outstanding_amount": _exact(fact.outstanding_amount),
        "inventory_value": _exact(fact.inventory_value),
        "side": fact.side,
        "selection_state": fact.selection_state,
        "payload": fact.payload,
    }
    canonical = json.dumps(
        normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    identity = f"aasopharma:{org_id}:{dataset_id}:{fact.source_kind}:{fact.record_key}"
    return {
        "id": str(uuid5(NAMESPACE_URL, identity)),
        **normalized,
        "row_sha256": hashlib.sha256(canonical).hexdigest(),
    }


@router.post("/facts", response_model=HistoricalImportResponse)
def import_historical_facts(
    request: HistoricalImportRequest,
    user: dict[str, Any] = IMPORT_USER,
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    expected = f"IMPORT-HISTORY:{org_id}:{request.dataset_id}"
    if request.confirmation != expected:
        raise HTTPException(status_code=409, detail="Historical import confirmation differs")
    wire = [
        _wire_fact(
            org_id=org_id,
            dataset_id=request.dataset_id,
            branch_id=request.branch_id,
            fact=fact,
        )
        for fact in request.facts
    ]
    try:
        result = db.execute(
            text(
                """
                SELECT erp_automation_commands.import_historical_migration_facts(
                  :org_id,CAST(:facts AS jsonb)
                )
                """
            ),
            {
                "org_id": org_id,
                "facts": json.dumps(wire, separators=(",", ":"), ensure_ascii=False),
            },
        ).scalar_one()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        detail = str(getattr(exc, "orig", exc)).splitlines()[0]
        if "differs from its imported identity" in detail:
            raise HTTPException(status_code=409, detail=detail) from exc
        raise HTTPException(status_code=422, detail="Historical import batch was rejected") from exc
    return HistoricalImportResponse.model_validate(result)


@router.post("/operational-cutover", response_model=OperationalCutoverResponse)
def promote_historical_operational_batch(
    request: OperationalCutoverRequest,
    user: dict[str, Any] = IMPORT_USER,
    db: Session = Depends(get_db),
):
    """Promote one bounded, replay-safe party/opening batch into the subledger."""
    org_id = _activate(db, user)
    expected = f"PROMOTE-HISTORY:{org_id}:{request.dataset_id}"
    if request.confirmation != expected:
        raise HTTPException(status_code=409, detail="Operational cutover confirmation differs")
    try:
        result = db.execute(
            text(
                """
                SELECT erp_automation_commands.promote_historical_operational_batch(
                  :org_id,:dataset_id,:batch_size
                )
                """
            ),
            {
                "org_id": org_id,
                "dataset_id": request.dataset_id,
                "batch_size": request.batch_size,
            },
        ).scalar_one()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        detail = str(getattr(exc, "orig", exc)).splitlines()[0]
        raise HTTPException(status_code=422, detail=detail) from exc
    return OperationalCutoverResponse.model_validate(result)


@router.get("/operational-cutover", response_model=OperationalCutoverStatus)
def historical_operational_cutover_status(
    dataset_id: str = Query(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"),
    user: dict[str, Any] = REPORT_USER,
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    result = db.execute(
        text(
            """
            SELECT erp_automation_reads.historical_operational_cutover_status(
              :org_id,:dataset_id
            )
            """
        ),
        {"org_id": org_id, "dataset_id": dataset_id},
    ).scalar_one()
    return OperationalCutoverStatus.model_validate(result)


@router.post(
    "/product-inventory-cutover",
    response_model=ProductInventoryCutoverResponse,
)
def promote_historical_product_inventory_batch(
    request: ProductInventoryCutoverRequest,
    user: dict[str, Any] = IMPORT_USER,
    db: Session = Depends(get_db),
):
    """Promote one bounded reviewed product/opening-inventory batch."""

    org_id = _activate(db, user)
    expected = (
        f"PROMOTE-HISTORICAL-INVENTORY:{org_id}:"
        f"{request.dataset_id}:{request.location_id}"
    )
    if request.confirmation != expected:
        raise HTTPException(
            status_code=409,
            detail="Historical product/inventory cutover confirmation differs",
        )
    try:
        result = db.execute(
            text(
                """
                SELECT erp_automation_commands.promote_historical_product_inventory_batch(
                  :org_id,:dataset_id,:location_id,:batch_size
                )
                """
            ),
            {
                "org_id": org_id,
                "dataset_id": request.dataset_id,
                "location_id": request.location_id,
                "batch_size": request.batch_size,
            },
        ).scalar_one()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        detail = str(getattr(exc, "orig", exc)).splitlines()[0]
        raise HTTPException(status_code=422, detail=detail) from exc
    return ProductInventoryCutoverResponse.model_validate(result)


@router.get(
    "/product-inventory-cutover",
    response_model=ProductInventoryCutoverStatus,
)
def historical_product_inventory_cutover_status(
    dataset_id: str = Query(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"),
    user: dict[str, Any] = REPORT_USER,
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    result = db.execute(
        text(
            """
            SELECT erp_automation_reads.historical_product_inventory_cutover_status(
              :org_id,:dataset_id
            )
            """
        ),
        {"org_id": org_id, "dataset_id": dataset_id},
    ).scalar_one()
    return ProductInventoryCutoverStatus.model_validate(result)


@router.get("/insights", response_model=HistoricalInsightsResponse)
def historical_insights(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    user: dict[str, Any] = REPORT_USER,
    db: Session = Depends(get_db),
):
    if date_from and date_to and date_to < date_from:
        raise HTTPException(status_code=422, detail="date_to must be on or after date_from")
    org_id = _activate(db, user)
    result = db.execute(
        text(
            """
            SELECT erp_automation_reads.historical_migration_insights(
              :org_id,:branch_ids,:date_from,:date_to
            )
            """
        ),
        {
            "org_id": org_id,
            "branch_ids": _branch_scope(user),
            "date_from": date_from,
            "date_to": date_to,
        },
    ).scalar_one()
    return HistoricalInsightsResponse.model_validate(result)


@router.get("/sales-invoices", response_model=HistoricalInvoiceArchiveResponse)
def historical_sales_invoices(
    search: str = Query(default="", max_length=100),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    user: dict[str, Any] = REPORT_USER,
    db: Session = Depends(get_db),
):
    """List imported sales evidence without presenting it as posted ERP state."""
    org_id = _activate(db, user)
    normalized_search = " ".join(search.casefold().split())
    result = db.execute(
        text(
            """
            SELECT erp_automation_reads.historical_sales_invoice_archive(
              :org_id,:branch_ids,:search,:offset,:limit
            )
            """
        ),
        {
            "org_id": org_id,
            "branch_ids": _branch_scope(user),
            "search": normalized_search,
            "offset": offset,
            "limit": limit,
        },
    ).scalar_one()
    return HistoricalInvoiceArchiveResponse.model_validate(result)

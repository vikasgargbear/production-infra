"""Hidden application routes backing published MCP entity-resolution tools."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, model_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from ....core.database import get_db
from .mcp_canonical_reads import (
    CanonicalDelegation,
    _require_operation,
    get_canonical_delegation,
)


router = APIRouter(
    prefix="/internal/mcp/resolution",
    tags=["Internal MCP"],
    include_in_schema=False,
)

_ALLOCATION_QUANTITY_QUANTUM = Decimal("0.000001")


def _allocation_quantity_units(value: Decimal) -> int:
    normalized = value.quantize(
        _ALLOCATION_QUANTITY_QUANTUM, rounding=ROUND_HALF_UP
    )
    return int(normalized / _ALLOCATION_QUANTITY_QUANTUM)


def _allocation_quantities_match(
    left: Decimal, right: Decimal, *, tolerance_units: int
) -> bool:
    return abs(
        _allocation_quantity_units(left) - _allocation_quantity_units(right)
    ) <= tolerance_units


class StrictDTO(BaseModel):
    model_config = ConfigDict(extra="forbid")


SearchMatchState = Literal["not_found", "partial_matches", "exact_match", "ambiguous"]
DocumentMatchState = Literal["not_found", "matched", "ambiguous"]


class CustomerMatch(StrictDTO):
    customer_account_id: UUID
    party_id: UUID
    customer_code: str
    legal_name: str
    trade_name: Optional[str]
    gstin: Optional[str]
    phone: Optional[str]
    account_status: str
    party_status: str
    row_version: int


class CustomerSearchResponse(StrictDTO):
    match_state: SearchMatchState
    requires_selection: bool
    exact_match_count: int
    results: list[CustomerMatch]


class LocationMatch(StrictDTO):
    location_id: UUID
    branch_id: UUID
    code: str
    name: str
    location_type: str
    allows_sale: bool
    status: str
    row_version: int


class LocationSearchResponse(StrictDTO):
    match_state: SearchMatchState
    requires_selection: bool
    exact_match_count: int
    results: list[LocationMatch]


class UomConversion(StrictDTO):
    uom_conversion_id: UUID
    from_uom_code: str
    to_uom_code: str
    conversion_factor: Decimal
    valid_from: date
    valid_until: Optional[date]


class StockBatchMatch(StrictDTO):
    product_id: UUID
    batch_id: UUID
    batch_number: str
    lot_kind: str
    batch_status: str
    manufactured_on: Optional[date]
    expires_on: Optional[date]
    mrp: Decimal
    mrp_uom_conversion_id: UUID
    mrp_marketed_uom_code: str
    mrp_base_uom_code: str
    mrp_pack_to_base_multiplier: Decimal
    batch_row_version: int
    branch_id: UUID
    location_id: UUID
    location_code: str
    location_name: str
    location_type: str
    uom_code: str
    uom_conversions: list[UomConversion]
    on_hand_quantity: Decimal
    reserved_quantity: Decimal
    available_quantity: Decimal
    stock_row_version: int
    fefo_expiry_tier: int


class StockBatchSearchResponse(StrictDTO):
    results: list[StockBatchMatch]


class DocumentResolution(StrictDTO):
    match_state: DocumentMatchState
    requires_selection: bool
    matched_count: int


def _mapping(row) -> dict:
    return dict(row._mapping)


def _nonempty(value: str, label: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise HTTPException(status_code=422, detail=f"{label} must not be blank")
    return normalized


def _require_branch(context: CanonicalDelegation) -> UUID:
    if context.branch_id is None:
        raise HTTPException(
            status_code=403,
            detail="This canonical resolution read requires one delegated branch",
        )
    return context.branch_id


def _lookup_parameters(
    document_id: Optional[UUID], document_number: Optional[str], fiscal_year: Optional[int]
) -> dict:
    if (document_id is None) == (document_number is None):
        raise HTTPException(
            status_code=422,
            detail="Provide exactly one opaque document_id or exact document_number",
        )
    if document_id is not None and fiscal_year is not None:
        raise HTTPException(status_code=422, detail="fiscal_year is valid only with document_number")
    return {
        "document_id": document_id,
        "document_number": _nonempty(document_number, "document_number")
        if document_number is not None
        else None,
        "fiscal_year": fiscal_year,
    }


def _search_state(rows: list[dict]) -> tuple[SearchMatchState, int]:
    exact_count = sum(1 for row in rows if row.pop("_exact_match", False))
    if exact_count > 1:
        return "ambiguous", exact_count
    if exact_count == 1:
        return "exact_match", exact_count
    return ("partial_matches" if rows else "not_found"), 0


@router.get("/customers", response_model=CustomerSearchResponse)
def canonical_customer_search(
    search_term: str = Query(..., max_length=128),
    limit: int = Query(20, ge=1, le=50),
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
) -> CustomerSearchResponse:
    _require_operation(context, "parties.customers.search")
    search = _nonempty(search_term, "search_term")
    rows = [
        _mapping(row)
        for row in db.execute(
            text(
                """
                SELECT customer.id AS customer_account_id, customer.party_id,
                       customer.customer_code, party.legal_name, party.trade_name,
                       registration.registration_number AS gstin, contact.phone,
                       customer.status AS account_status, party.status AS party_status,
                       customer.row_version,
                       (lower(customer.customer_code)=lower(:search)
                        OR lower(party.legal_name)=lower(:search)
                        OR lower(COALESCE(party.trade_name,''))=lower(:search)
                        OR lower(COALESCE(registration.registration_number,''))=lower(:search)
                        OR COALESCE(contact.phone,'')=:search) AS _exact_match
                  FROM parties.customer_accounts AS customer
                  JOIN parties.parties AS party
                    ON party.org_id=customer.org_id AND party.id=customer.party_id
                  LEFT JOIN LATERAL (
                      SELECT registration_number
                        FROM parties.tax_registrations
                       WHERE org_id=customer.org_id AND party_id=customer.party_id
                         AND registration_type='GSTIN' AND status='active'
                       ORDER BY valid_from DESC NULLS LAST, id LIMIT 1
                  ) AS registration ON true
                  LEFT JOIN LATERAL (
                      SELECT phone FROM parties.contacts
                       WHERE org_id=customer.org_id AND party_id=customer.party_id
                         AND status='active'
                       ORDER BY is_primary DESC, id LIMIT 1
                  ) AS contact ON true
                 WHERE customer.org_id=:org_id
                   AND customer.status IN ('active','on_hold')
                   AND party.status IN ('active','blocked')
                   AND (customer.customer_code ILIKE :pattern
                        OR party.legal_name ILIKE :pattern
                        OR COALESCE(party.trade_name,'') ILIKE :pattern
                        OR COALESCE(registration.registration_number,'') ILIKE :pattern
                        OR COALESCE(contact.phone,'') ILIKE :pattern)
                 ORDER BY _exact_match DESC, party.legal_name, customer.id
                 LIMIT :limit
                """
            ),
            {
                "org_id": context.organization_id,
                "search": search,
                "pattern": f"%{search}%",
                "limit": limit,
            },
        ).fetchall()
    ]
    state, exact_count = _search_state(rows)
    return CustomerSearchResponse(
        match_state=state,
        requires_selection=state in ("ambiguous", "partial_matches"),
        exact_match_count=exact_count,
        results=[CustomerMatch(**row) for row in rows],
    )


@router.get("/locations", response_model=LocationSearchResponse)
def canonical_location_search(
    search_term: str = Query(..., max_length=128),
    limit: int = Query(20, ge=1, le=50),
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
) -> LocationSearchResponse:
    _require_operation(context, "inventory.locations.search")
    branch_id = _require_branch(context)
    search = _nonempty(search_term, "search_term")
    rows = [
        _mapping(row)
        for row in db.execute(
            text(
                """
                SELECT id AS location_id, branch_id, code, name, location_type,
                       allows_sale, status, row_version,
                       (lower(code)=lower(:search) OR lower(name)=lower(:search)) AS _exact_match
                  FROM inventory.locations
                 WHERE org_id=:org_id AND branch_id=:branch_id
                   AND status IN ('active','blocked')
                   AND (lower(code)=lower(:search) OR lower(name)=lower(:search))
                 ORDER BY _exact_match DESC, code, id LIMIT :limit
                """
            ),
            {
                "org_id": context.organization_id,
                "branch_id": branch_id,
                "search": search,
                "limit": limit,
            },
        ).fetchall()
    ]
    state, exact_count = _search_state(rows)
    return LocationSearchResponse(
        match_state=state,
        requires_selection=state == "ambiguous",
        exact_match_count=exact_count,
        results=[LocationMatch(**row) for row in rows],
    )


@router.get("/stock-batches", response_model=StockBatchSearchResponse)
def canonical_stock_batch_search(
    product_id: UUID,
    location_id: Optional[UUID] = None,
    limit: int = Query(50, ge=1, le=100),
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
) -> StockBatchSearchResponse:
    _require_operation(context, "inventory.stock_batches.search")
    branch_id = _require_branch(context)
    rows = db.execute(
        text(
            """
            SELECT balance.product_id, batch.id AS batch_id, batch.batch_number,
                   batch.lot_kind, batch.status AS batch_status,
                   batch.manufactured_on, batch.expires_on, batch.mrp,
                   batch.mrp_uom_conversion_id,
                   mrp_conversion.from_uom_code AS mrp_marketed_uom_code,
                   mrp_conversion.to_uom_code AS mrp_base_uom_code,
                   mrp_conversion.multiplier AS mrp_pack_to_base_multiplier,
                   batch.row_version AS batch_row_version, balance.branch_id,
                   location.id AS location_id, location.code AS location_code,
                   location.name AS location_name, location.location_type,
                   product.base_uom_code AS uom_code,
                   conversions.uom_conversions, balance.on_hand_quantity,
                   COALESCE(reserved.quantity,0) AS reserved_quantity,
                   balance.on_hand_quantity-COALESCE(reserved.quantity,0) AS available_quantity,
                   balance.row_version AS stock_row_version,
                   dense_rank() OVER (
                     PARTITION BY balance.product_id, balance.location_id
                     ORDER BY batch.expires_on
                   )::integer AS fefo_expiry_tier
              FROM inventory.stock_balances AS balance
              JOIN inventory.batches AS batch
                ON batch.org_id=balance.org_id AND batch.id=balance.batch_id
              JOIN inventory.locations AS location
                ON location.org_id=balance.org_id AND location.id=balance.location_id
               AND location.branch_id=balance.branch_id
              JOIN catalog.products AS product
                ON product.org_id=balance.org_id AND product.id=balance.product_id
              JOIN catalog.uom_conversions AS mrp_conversion
                ON mrp_conversion.org_id=batch.org_id
               AND mrp_conversion.id=batch.mrp_uom_conversion_id
              LEFT JOIN LATERAL (
                  SELECT SUM(reservation.quantity) AS quantity
                    FROM inventory.reservations AS reservation
                   WHERE reservation.org_id=balance.org_id
                     AND reservation.branch_id=balance.branch_id
                     AND reservation.location_id=balance.location_id
                     AND reservation.product_id=balance.product_id
                     AND reservation.batch_id=balance.batch_id
                     AND reservation.status='active'
                     AND reservation.expires_at>transaction_timestamp()
              ) AS reserved ON true
              LEFT JOIN LATERAL (
                  SELECT COALESCE(
                           jsonb_agg(
                             jsonb_build_object(
                               'uom_conversion_id', conversion.id,
                               'from_uom_code', conversion.from_uom_code,
                               'to_uom_code', conversion.to_uom_code,
                               'conversion_factor', conversion.multiplier::text,
                               'valid_from', conversion.valid_from,
                               'valid_until', conversion.valid_until
                             ) ORDER BY conversion.from_uom_code,
                                        conversion.to_uom_code,
                                        conversion.valid_from, conversion.id
                           ), '[]'::jsonb
                         ) AS uom_conversions
                    FROM (
                      SELECT id, from_uom_code, to_uom_code, multiplier,
                             valid_from, valid_until
                        FROM catalog.uom_conversions
                       WHERE org_id=product.org_id AND product_id=product.id
                         AND status='active'
                         AND (valid_until IS NULL OR valid_until>=CURRENT_DATE)
                       ORDER BY from_uom_code, to_uom_code, valid_from, id
                       LIMIT 50
                    ) AS conversion
              ) AS conversions ON true
             WHERE balance.org_id=:org_id AND balance.branch_id=:branch_id
               AND balance.product_id=:product_id
               AND (:location_id IS NULL OR balance.location_id=CAST(:location_id AS uuid))
               AND balance.on_hand_quantity>0
               AND location.status='active'
               AND batch.lot_kind='manufacturer_batch'
               AND batch.status='released'
               AND batch.released_at IS NOT NULL
               AND batch.expires_on>CURRENT_DATE
             ORDER BY fefo_expiry_tier, batch.batch_number, batch.id LIMIT :limit
            """
        ),
        {
            "org_id": context.organization_id,
            "branch_id": branch_id,
            "product_id": product_id,
            "location_id": location_id,
            "limit": limit,
        },
    ).fetchall()
    return StockBatchSearchResponse(results=[StockBatchMatch(**_mapping(row)) for row in rows])


class SalesOrderLine(StrictDTO):
    order_line_id: UUID
    line_number: int
    line_kind: str
    product_id: Optional[UUID]
    charge_code: Optional[str]
    uom_code: Optional[str]
    base_billed_quantity: Optional[Decimal]
    base_free_quantity: Optional[Decimal]
    dispatched_base_billed_quantity: Decimal
    dispatched_base_free_quantity: Decimal
    remaining_base_billed_quantity: Optional[Decimal]
    remaining_base_free_quantity: Optional[Decimal]
    quoted_unit_rate: Optional[Decimal]
    line_total: Decimal


class SalesOrderDocument(StrictDTO):
    sales_order_id: UUID
    branch_id: UUID
    customer_account_id: UUID
    order_number: str
    fiscal_year: int
    order_date: date
    status: str
    currency_code: str
    grand_total: Decimal
    calculation_ruleset_version: str
    row_version: int
    lines: list[SalesOrderLine]


class SalesOrderResolutionResponse(DocumentResolution):
    document: Optional[SalesOrderDocument]


class SalesInvoiceDispatchAllocation(StrictDTO):
    invoice_line_id: UUID
    source_line_id: UUID
    invoice_dispatch_allocation_id: UUID
    inventory_document_id: UUID
    inventory_document_line_id: UUID
    dispatch_id: UUID
    dispatch_line_id: UUID
    dispatch_number: str
    dispatch_date: date
    product_id: UUID
    batch_id: UUID
    batch_number: str
    expires_on: Optional[date]
    from_location_id: UUID
    uom_code: str
    base_quantity: Decimal
    entered_quantity: Decimal
    billed_quantity: Decimal
    free_quantity: Decimal
    allocated_base_billed_quantity: Decimal
    allocated_base_free_quantity: Decimal
    returned_base_billed_quantity: Decimal
    returned_base_free_quantity: Decimal
    remaining_base_billed_quantity: Decimal
    remaining_base_free_quantity: Decimal

    @model_validator(mode="after")
    def validate_lineage_and_quantities(self):
        if self.source_line_id != self.dispatch_line_id:
            raise ValueError("dispatch source line identity does not match")
        if not _allocation_quantities_match(
            self.base_quantity,
            self.allocated_base_billed_quantity + self.allocated_base_free_quantity,
            tolerance_units=0,
        ):
            raise ValueError("dispatch base quantities do not reconcile")
        if not _allocation_quantities_match(
            self.entered_quantity,
            self.billed_quantity + self.free_quantity,
            tolerance_units=1,
        ):
            raise ValueError("dispatch entered quantities do not reconcile")
        return self


class SalesInvoiceDirectIssueAllocation(StrictDTO):
    invoice_line_id: UUID
    source_line_id: UUID
    command_request_id: UUID
    command_evidence_count: int
    request_line_count: int
    evidenced_allocation_count: int
    evidence_match_count: int
    inventory_document_id: UUID
    inventory_document_line_id: UUID
    batch_id: UUID
    batch_number: str
    expires_on: Optional[date]
    from_location_id: Optional[UUID]
    uom_code: str
    base_quantity: Decimal
    entered_quantity: Decimal
    base_billed_quantity: Decimal
    base_free_quantity: Decimal
    billed_quantity: Decimal
    free_quantity: Decimal
    unit_cost: Decimal
    extended_cost: Decimal

    @model_validator(mode="after")
    def validate_evidence_and_quantities(self):
        if (
            self.source_line_id != self.invoice_line_id
            or self.command_evidence_count != 1
            or self.request_line_count != 1
            or self.evidence_match_count != 1
            or self.evidenced_allocation_count < 1
        ):
            raise ValueError("direct issue requires exactly one matched command evidence")
        if not _allocation_quantities_match(
            self.base_quantity,
            self.base_billed_quantity + self.base_free_quantity,
            tolerance_units=0,
        ):
            raise ValueError("direct issue base quantities do not reconcile")
        if not _allocation_quantities_match(
            self.entered_quantity,
            self.billed_quantity + self.free_quantity,
            tolerance_units=1,
        ):
            raise ValueError("direct issue entered quantities do not reconcile")
        return self


class SalesInvoiceLine(StrictDTO):
    invoice_line_id: UUID
    line_number: int
    line_kind: str
    order_line_id: Optional[UUID]
    product_id: Optional[UUID]
    charge_code: Optional[str]
    uom_code: Optional[str]
    billed_quantity: Optional[Decimal]
    free_quantity: Optional[Decimal]
    base_billed_quantity: Optional[Decimal]
    base_free_quantity: Optional[Decimal]
    free_supply_tax_treatment: Optional[str]
    returned_base_billed_quantity: Decimal
    returned_base_free_quantity: Decimal
    returnable_base_billed_quantity: Optional[Decimal]
    returnable_base_free_quantity: Optional[Decimal]
    tax_code_version_id: UUID
    taxability_snapshot: str
    line_total: Decimal
    dispatch_allocations: list[SalesInvoiceDispatchAllocation]
    direct_issue_allocations: list[SalesInvoiceDirectIssueAllocation]

    @model_validator(mode="after")
    def validate_allocation_authority(self):
        if self.line_kind == "product":
            nonempty_sets = int(bool(self.dispatch_allocations)) + int(
                bool(self.direct_issue_allocations)
            )
            if nonempty_sets != 1:
                raise ValueError(
                    "posted product invoice line requires exactly one allocation source"
                )
        elif self.dispatch_allocations or self.direct_issue_allocations:
            raise ValueError("non-product invoice line cannot have inventory allocations")
        allocations = [*self.dispatch_allocations, *self.direct_issue_allocations]
        if any(value.invoice_line_id != self.invoice_line_id for value in allocations):
            raise ValueError("allocation invoice line identity does not match")
        if len({value.inventory_document_line_id for value in allocations}) != len(
            allocations
        ):
            raise ValueError("executed inventory line identities must be unique")
        if len({
            value.invoice_dispatch_allocation_id
            for value in self.dispatch_allocations
        }) != len(self.dispatch_allocations):
            raise ValueError("dispatch allocation identities must be unique")
        if self.direct_issue_allocations:
            if len({value.command_request_id for value in self.direct_issue_allocations}) != 1:
                raise ValueError("direct allocations must share one succeeded command")
            if len({value.inventory_document_id for value in self.direct_issue_allocations}) != 1:
                raise ValueError("direct allocations must share one inventory document")
            evidence_counts = {
                value.evidenced_allocation_count
                for value in self.direct_issue_allocations
            }
            if evidence_counts != {len(self.direct_issue_allocations)}:
                raise ValueError(
                    "direct physical allocation count does not match command evidence"
                )
        allocated_base_billed = sum(
            value.allocated_base_billed_quantity
            if isinstance(value, SalesInvoiceDispatchAllocation)
            else value.base_billed_quantity
            for value in allocations
        )
        allocated_base_free = sum(
            value.allocated_base_free_quantity
            if isinstance(value, SalesInvoiceDispatchAllocation)
            else value.base_free_quantity
            for value in allocations
        )
        if allocations and (
            not _allocation_quantities_match(
                allocated_base_billed, self.base_billed_quantity, tolerance_units=0
            )
            or not _allocation_quantities_match(
                allocated_base_free, self.base_free_quantity, tolerance_units=0
            )
            or not _allocation_quantities_match(
                sum(value.billed_quantity for value in allocations),
                self.billed_quantity,
                tolerance_units=1,
            )
            or not _allocation_quantities_match(
                sum(value.free_quantity for value in allocations),
                self.free_quantity,
                tolerance_units=1,
            )
        ):
            raise ValueError("allocation totals do not reconcile to invoice line")
        return self


class SalesInvoiceDocument(StrictDTO):
    sales_invoice_id: UUID
    branch_id: UUID
    customer_account_id: UUID
    seller_tax_registration_id: UUID
    customer_tax_registration_id: Optional[UUID]
    invoice_number: str
    fiscal_year: int
    invoice_date: date
    due_date: Optional[date]
    invoice_type: str
    supply_type: str
    place_of_supply_state_code: str
    currency_code: str
    grand_total: Decimal
    calculation_ruleset_version: str
    posted_at: datetime
    row_version: int
    lines: list[SalesInvoiceLine]


class SalesInvoiceResolutionResponse(DocumentResolution):
    document: Optional[SalesInvoiceDocument]


def _document_result(rows: list) -> tuple[DocumentMatchState, int]:
    if not rows:
        return "not_found", 0
    if len(rows) > 1:
        return "ambiguous", 2
    return "matched", 1


@router.get("/sales-orders", response_model=SalesOrderResolutionResponse)
def canonical_sales_order_get(
    sales_order_id: Optional[UUID] = None,
    order_number: Optional[str] = Query(None, max_length=64),
    fiscal_year: Optional[int] = Query(None, ge=2000, le=9999),
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
) -> SalesOrderResolutionResponse:
    _require_operation(context, "sales.orders.get")
    branch_id = _require_branch(context)
    params = _lookup_parameters(sales_order_id, order_number, fiscal_year)
    params.update(org_id=context.organization_id, branch_id=branch_id)
    rows = db.execute(
        text(
            """
            SELECT id AS sales_order_id, branch_id, customer_account_id,
                   order_number, fiscal_year, order_date, status, currency_code,
                   grand_total, calculation_ruleset_version, row_version
              FROM sales.orders
             WHERE org_id=:org_id AND branch_id=:branch_id AND status<>'cancelled'
               AND ((CAST(:document_id AS uuid) IS NOT NULL
                     AND id=CAST(:document_id AS uuid))
                    OR (CAST(:document_id AS uuid) IS NULL
                        AND order_number=:document_number
                        AND (:fiscal_year IS NULL OR fiscal_year=:fiscal_year)))
             ORDER BY fiscal_year DESC, id LIMIT 2
            """
        ),
        params,
    ).fetchall()
    state, count = _document_result(rows)
    if state != "matched":
        return SalesOrderResolutionResponse(
            match_state=state, requires_selection=state == "ambiguous",
            matched_count=count, document=None,
        )
    header = _mapping(rows[0])
    lines = db.execute(
        text(
            """
            SELECT line.id AS order_line_id, line.line_number, line.line_kind,
                   line.product_id, line.charge_code, line.uom_code,
                   line.base_billed_quantity, line.base_free_quantity,
                   COALESCE(dispatched.base_billed_quantity,0) AS dispatched_base_billed_quantity,
                   COALESCE(dispatched.base_free_quantity,0) AS dispatched_base_free_quantity,
                   CASE WHEN line.base_billed_quantity IS NULL THEN NULL ELSE
                     GREATEST(line.base_billed_quantity-COALESCE(dispatched.base_billed_quantity,0),0)
                   END AS remaining_base_billed_quantity,
                   CASE WHEN line.base_free_quantity IS NULL THEN NULL ELSE
                     GREATEST(line.base_free_quantity-COALESCE(dispatched.base_free_quantity,0),0)
                   END AS remaining_base_free_quantity,
                   line.quoted_unit_rate, line.line_total
              FROM sales.order_lines AS line
              LEFT JOIN LATERAL (
                  SELECT SUM(dispatch_line.base_billed_quantity) AS base_billed_quantity,
                         SUM(dispatch_line.base_free_quantity) AS base_free_quantity
                    FROM sales.dispatch_lines AS dispatch_line
                    JOIN sales.dispatches AS dispatch
                      ON dispatch.org_id=dispatch_line.org_id
                     AND dispatch.id=dispatch_line.dispatch_id
                     AND dispatch.status='posted'
                     AND dispatch.branch_id=:branch_id
                   WHERE dispatch_line.org_id=line.org_id
                     AND dispatch_line.order_line_id=line.id
              ) AS dispatched ON true
             WHERE line.org_id=:org_id AND line.order_id=:document_id
             ORDER BY line.line_number, line.id
            """
        ),
        {
            "org_id": context.organization_id,
            "branch_id": branch_id,
            "document_id": header["sales_order_id"],
        },
    ).fetchall()
    header["lines"] = [SalesOrderLine(**_mapping(row)) for row in lines]
    return SalesOrderResolutionResponse(
        match_state="matched", requires_selection=False, matched_count=1,
        document=SalesOrderDocument(**header),
    )


@router.get("/sales-invoices", response_model=SalesInvoiceResolutionResponse)
def canonical_sales_invoice_get(
    sales_invoice_id: Optional[UUID] = None,
    invoice_number: Optional[str] = Query(None, max_length=64),
    fiscal_year: Optional[int] = Query(None, ge=2000, le=9999),
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
) -> SalesInvoiceResolutionResponse:
    _require_operation(context, "sales.invoices.get")
    branch_id = _require_branch(context)
    params = _lookup_parameters(sales_invoice_id, invoice_number, fiscal_year)
    params.update(org_id=context.organization_id, branch_id=branch_id)
    rows = db.execute(
        text(
            """
            SELECT id AS sales_invoice_id, branch_id, customer_account_id,
                   seller_tax_registration_id, customer_tax_registration_id,
                   invoice_number, fiscal_year, invoice_date, due_date, invoice_type,
                   supply_type, place_of_supply_state_code, currency_code, grand_total,
                   calculation_ruleset_version, posted_at, row_version
              FROM sales.invoices
             WHERE org_id=:org_id AND branch_id=:branch_id AND status='posted'
               AND ((CAST(:document_id AS uuid) IS NOT NULL
                     AND id=CAST(:document_id AS uuid))
                    OR (CAST(:document_id AS uuid) IS NULL
                        AND invoice_number=:document_number
                        AND (:fiscal_year IS NULL OR fiscal_year=:fiscal_year)))
             ORDER BY fiscal_year DESC, id LIMIT 2
            """
        ),
        params,
    ).fetchall()
    state, count = _document_result(rows)
    if state != "matched":
        return SalesInvoiceResolutionResponse(
            match_state=state, requires_selection=state == "ambiguous",
            matched_count=count, document=None,
        )
    header = _mapping(rows[0])
    lines = db.execute(
        text(
            """
            SELECT line.id AS invoice_line_id, line.line_number, line.line_kind,
                   line.order_line_id, line.product_id, line.charge_code, line.uom_code,
                   line.billed_quantity, line.free_quantity,
                   line.base_billed_quantity, line.base_free_quantity,
                   line.free_supply_tax_treatment,
                   COALESCE(returned.base_billed_quantity,0) AS returned_base_billed_quantity,
                   COALESCE(returned.base_free_quantity,0) AS returned_base_free_quantity,
                   CASE WHEN line.base_billed_quantity IS NULL THEN NULL ELSE
                     GREATEST(line.base_billed_quantity-COALESCE(returned.base_billed_quantity,0),0)
                   END AS returnable_base_billed_quantity,
                   CASE WHEN line.base_free_quantity IS NULL THEN NULL ELSE
                     GREATEST(line.base_free_quantity-COALESCE(returned.base_free_quantity,0),0)
                   END AS returnable_base_free_quantity,
                   line.tax_code_version_id, line.taxability_snapshot, line.line_total
              FROM sales.invoice_lines AS line
              LEFT JOIN LATERAL (
                  SELECT SUM(return_line.base_billed_quantity) AS base_billed_quantity,
                         SUM(return_line.base_free_quantity) AS base_free_quantity
                    FROM sales.return_lines AS return_line
                    JOIN sales.returns AS return_header
                      ON return_header.org_id=return_line.org_id
                     AND return_header.id=return_line.return_id
                     AND return_header.status='posted'
                   WHERE return_line.org_id=line.org_id
                     AND return_line.invoice_line_id=line.id
              ) AS returned ON true
             WHERE line.org_id=:org_id AND line.invoice_id=:document_id
             ORDER BY line.line_number, line.id
            """
        ),
        {"org_id": context.organization_id, "document_id": header["sales_invoice_id"]},
    ).fetchall()
    allocation_rows = db.execute(
        text(
            """
            SELECT invoice_line.id AS invoice_line_id,
                   dispatch_line.id AS source_line_id,
                   allocation.id AS invoice_dispatch_allocation_id,
                   inventory_document.id AS inventory_document_id,
                   inventory_line.id AS inventory_document_line_id,
                   dispatch.id AS dispatch_id, dispatch_line.id AS dispatch_line_id,
                   dispatch.dispatch_number, dispatch.dispatch_date,
                   dispatch_line.product_id, dispatch_line.batch_id,
                   batch.batch_number, batch.expires_on,
                   dispatch_line.from_location_id, invoice_line.uom_code,
                   allocation.allocated_base_billed_quantity
                     +allocation.allocated_base_free_quantity AS base_quantity,
                   allocation.allocated_base_billed_quantity
                     /NULLIF(invoice_line.uom_conversion_factor,0)
                     +allocation.allocated_base_free_quantity
                     /NULLIF(invoice_line.uom_conversion_factor,0) AS entered_quantity,
                   allocation.allocated_base_billed_quantity
                     /NULLIF(invoice_line.uom_conversion_factor,0) AS billed_quantity,
                   allocation.allocated_base_free_quantity
                     /NULLIF(invoice_line.uom_conversion_factor,0) AS free_quantity,
                   allocation.allocated_base_billed_quantity,
                   allocation.allocated_base_free_quantity,
                   COALESCE(returned.base_billed_quantity,0) AS returned_base_billed_quantity,
                   COALESCE(returned.base_free_quantity,0) AS returned_base_free_quantity,
                   GREATEST(allocation.allocated_base_billed_quantity-
                            COALESCE(returned.base_billed_quantity,0),0)
                     AS remaining_base_billed_quantity,
                   GREATEST(allocation.allocated_base_free_quantity-
                            COALESCE(returned.base_free_quantity,0),0)
                     AS remaining_base_free_quantity
              FROM sales.invoice_lines AS invoice_line
              JOIN sales.invoice_dispatch_allocations AS allocation
                ON allocation.org_id=invoice_line.org_id
               AND allocation.invoice_line_id=invoice_line.id
              JOIN sales.dispatch_lines AS dispatch_line
                ON dispatch_line.org_id=allocation.org_id
               AND dispatch_line.id=allocation.dispatch_line_id
              JOIN sales.dispatches AS dispatch
                ON dispatch.org_id=dispatch_line.org_id
               AND dispatch.id=dispatch_line.dispatch_id
               AND dispatch.status='posted'
               AND dispatch.branch_id=:branch_id
              JOIN inventory.batches AS batch
                ON batch.org_id=dispatch_line.org_id
               AND batch.id=dispatch_line.batch_id
              JOIN inventory.inventory_document_lines AS inventory_line
                ON inventory_line.org_id=dispatch_line.org_id
               AND inventory_line.sales_dispatch_line_id=dispatch_line.id
              JOIN inventory.inventory_documents AS inventory_document
                ON inventory_document.org_id=inventory_line.org_id
               AND inventory_document.id=inventory_line.inventory_document_id
               AND inventory_document.sales_dispatch_id=dispatch.id
               AND inventory_document.document_type='sales_issue'
               AND inventory_document.status='posted'
               AND inventory_document.branch_id=:branch_id
              LEFT JOIN LATERAL (
                  SELECT SUM(return_line.base_billed_quantity) AS base_billed_quantity,
                         SUM(return_line.base_free_quantity) AS base_free_quantity
                    FROM sales.return_lines AS return_line
                    JOIN sales.returns AS return_header
                      ON return_header.org_id=return_line.org_id
                     AND return_header.id=return_line.return_id
                     AND return_header.status='posted'
                   WHERE return_line.org_id=allocation.org_id
                     AND return_line.invoice_dispatch_allocation_id=allocation.id
              ) AS returned ON true
             WHERE invoice_line.org_id=:org_id
               AND invoice_line.invoice_id=:document_id
             ORDER BY invoice_line.line_number, dispatch.dispatch_date,
                      dispatch.dispatch_number, dispatch_line.line_number,
                      allocation.id
            """
        ),
        {
            "org_id": context.organization_id,
            "branch_id": branch_id,
            "document_id": header["sales_invoice_id"],
        },
    ).fetchall()
    allocations_by_line: dict[UUID, list[SalesInvoiceDispatchAllocation]] = {}
    for row in allocation_rows:
        allocation = _mapping(row)
        invoice_line_id = allocation["invoice_line_id"]
        allocations_by_line.setdefault(invoice_line_id, []).append(
            SalesInvoiceDispatchAllocation(**allocation)
        )
    direct_issue_rows = db.execute(
        text(
            """
            SELECT invoice_line.id AS invoice_line_id,
                   (requested_line.request_line->>'line_id')::uuid AS source_line_id,
                   command_evidence.command_request_id,
                   command_evidence.command_evidence_count,
                   requested_line.request_line_count,
                   pg_catalog.jsonb_array_length(COALESCE(
                     requested_line.request_line->'batch_allocations', '[]'::jsonb
                   )) AS evidenced_allocation_count,
                   requested_allocation.evidence_match_count,
                   inventory_document.id AS inventory_document_id,
                   inventory_line.id AS inventory_document_line_id,
                   inventory_line.batch_id, batch.batch_number, batch.expires_on,
                   inventory_line.from_location_id, inventory_line.uom_code,
                   inventory_line.base_quantity,
                   inventory_line.entered_quantity,
                   pg_catalog.round((requested_allocation.request_allocation
                         ->>'billed_quantity')::numeric
                         *invoice_line.uom_conversion_factor, 6) AS base_billed_quantity,
                   pg_catalog.round((requested_allocation.request_allocation
                         ->>'free_quantity')::numeric
                         *invoice_line.uom_conversion_factor, 6) AS base_free_quantity,
                   (requested_allocation.request_allocation->>'billed_quantity')::numeric
                     AS billed_quantity,
                   (requested_allocation.request_allocation->>'free_quantity')::numeric
                     AS free_quantity,
                   inventory_line.unit_cost,
                   inventory_line.extended_cost
              FROM sales.invoice_lines AS invoice_line
              JOIN inventory.inventory_document_lines AS inventory_line
                ON inventory_line.org_id=invoice_line.org_id
               AND inventory_line.sales_invoice_line_id=invoice_line.id
              JOIN inventory.inventory_documents AS inventory_document
                ON inventory_document.org_id=inventory_line.org_id
               AND inventory_document.id=inventory_line.inventory_document_id
               AND inventory_document.sales_invoice_id=invoice_line.invoice_id
               AND inventory_document.document_type='sales_issue'
               AND inventory_document.status='posted'
               AND inventory_document.branch_id=:branch_id
              JOIN inventory.batches AS batch
                ON batch.org_id=inventory_line.org_id
               AND batch.id=inventory_line.batch_id
              LEFT JOIN LATERAL (
                  SELECT count(*)::integer AS command_evidence_count,
                         CASE WHEN count(*)=1 THEN
                           (array_agg(command.id ORDER BY command.id))[1]
                         END AS command_request_id,
                         CASE WHEN count(*)=1 THEN (array_agg(
                           pg_catalog.convert_from(command.request_bytes, 'UTF8')::jsonb
                           ORDER BY command.id
                         ))[1] END AS request_document
                    FROM automation.command_requests AS command
                   WHERE command.org_id=invoice_line.org_id
                     AND command.branch_id=:branch_id
                     AND command.capability_code='sales.invoice.prepare'
                     AND command.operation='sales.invoice.post'
                     AND command.target_resource_type='sales_invoice'
                     AND command.target_resource_id=invoice_line.invoice_id
                     AND command.status='succeeded'
                     AND command.result_resource_type='sales_invoice'
                     AND command.result_resource_id=invoice_line.invoice_id
                     AND command.response_status=200
                     AND command.request_hash=pg_catalog.sha256(
                         command.request_bytes
                     )
              ) AS command_evidence ON true
              LEFT JOIN LATERAL (
                  SELECT count(*)::integer AS request_line_count,
                         CASE WHEN count(*)=1 THEN
                           (array_agg(candidate.value))[1]
                         END AS request_line
                    FROM pg_catalog.jsonb_array_elements(COALESCE(
                      command_evidence.request_document->'lines', '[]'::jsonb
                    )) candidate(value)
                   WHERE candidate.value->>'line_id'=invoice_line.id::text
                     AND candidate.value->>'fulfillment_source'='direct_issue'
              ) requested_line ON true
              LEFT JOIN LATERAL (
                  SELECT count(*)::integer AS evidence_match_count,
                         CASE WHEN count(*)=1 THEN
                           (array_agg(candidate.value))[1]
                         END AS request_allocation
                    FROM pg_catalog.jsonb_array_elements(COALESCE(
                      requested_line.request_line->'batch_allocations', '[]'::jsonb
                    )) candidate(value)
                   WHERE candidate.value->>'inventory_line_id'=inventory_line.id::text
                     AND candidate.value->>'batch_id'=inventory_line.batch_id::text
              ) requested_allocation ON true
             WHERE invoice_line.org_id=:org_id
               AND invoice_line.invoice_id=:document_id
             ORDER BY invoice_line.line_number, inventory_line.line_number,
                      inventory_line.id
            """
        ),
        {
            "org_id": context.organization_id,
            "branch_id": branch_id,
            "document_id": header["sales_invoice_id"],
        },
    ).fetchall()
    direct_issues_by_line: dict[UUID, list[SalesInvoiceDirectIssueAllocation]] = {}
    for row in direct_issue_rows:
        allocation = _mapping(row)
        invoice_line_id = allocation["invoice_line_id"]
        direct_issues_by_line.setdefault(invoice_line_id, []).append(
            SalesInvoiceDirectIssueAllocation(**allocation)
        )
    line_models = []
    for row in lines:
        line = _mapping(row)
        line["dispatch_allocations"] = allocations_by_line.get(line["invoice_line_id"], [])
        line["direct_issue_allocations"] = direct_issues_by_line.get(
            line["invoice_line_id"], []
        )
        line_models.append(SalesInvoiceLine(**line))
    header["lines"] = line_models
    return SalesInvoiceResolutionResponse(
        match_state="matched", requires_selection=False, matched_count=1,
        document=SalesInvoiceDocument(**header),
    )


class PurchaseOrderLine(StrictDTO):
    purchase_order_line_id: UUID
    line_number: int
    line_kind: str
    product_id: Optional[UUID]
    charge_code: Optional[str]
    uom_code: Optional[str]
    base_billed_quantity: Optional[Decimal]
    base_free_quantity: Optional[Decimal]
    received_base_billed_quantity: Decimal
    received_base_free_quantity: Decimal
    remaining_receipt_base_billed_quantity: Optional[Decimal]
    remaining_receipt_base_free_quantity: Optional[Decimal]
    allocated_advance_amount: Decimal
    quoted_unit_rate: Optional[Decimal]
    line_total: Decimal


class PurchaseOrderDocument(StrictDTO):
    purchase_order_id: UUID
    branch_id: UUID
    supplier_account_id: UUID
    purchase_order_number: str
    fiscal_year: int
    order_date: date
    expected_delivery_date: Optional[date]
    status: str
    currency_code: str
    grand_total: Decimal
    calculation_ruleset_version: str
    row_version: int
    lines: list[PurchaseOrderLine]


class PurchaseOrderResolutionResponse(DocumentResolution):
    document: Optional[PurchaseOrderDocument]


class SupplierInvoiceReceiptAllocation(StrictDTO):
    supplier_invoice_receipt_allocation_id: UUID
    supplier_invoice_id: UUID
    supplier_invoice_line_id: UUID
    supplier_invoice_number: str
    supplier_invoice_date: date
    goods_receipt_id: UUID
    goods_receipt_line_id: UUID
    product_id: UUID
    batch_id: UUID
    location_id: UUID
    uom_code: str
    allocated_base_billed_quantity: Decimal
    allocated_base_free_quantity: Decimal
    returned_base_billed_quantity: Decimal
    returned_base_free_quantity: Decimal
    remaining_base_billed_quantity: Decimal
    remaining_base_free_quantity: Decimal


class GoodsReceiptLine(StrictDTO):
    goods_receipt_line_id: UUID
    line_number: int
    purchase_order_line_id: Optional[UUID]
    product_id: UUID
    batch_id: UUID
    location_id: UUID
    uom_code: str
    base_accepted_quantity: Decimal
    base_free_quantity: Decimal
    invoiced_base_billed_quantity: Decimal
    invoiced_base_free_quantity: Decimal
    invoiceable_base_billed_quantity: Decimal
    invoiceable_base_free_quantity: Decimal
    batch_number: str
    batch_status: str
    expires_on: Optional[date]
    batch_row_version: int
    unit_cost: Decimal
    receipt_allocations: list[SupplierInvoiceReceiptAllocation]


class GoodsReceiptDocument(StrictDTO):
    goods_receipt_id: UUID
    branch_id: UUID
    supplier_account_id: UUID
    goods_receipt_number: str
    fiscal_year: int
    received_at: datetime
    supplier_challan_number: Optional[str]
    supplier_challan_date: Optional[date]
    posted_at: datetime
    row_version: int
    lines: list[GoodsReceiptLine]


class GoodsReceiptResolutionResponse(DocumentResolution):
    document: Optional[GoodsReceiptDocument]


class SupplierInvoiceLine(StrictDTO):
    supplier_invoice_line_id: UUID
    line_number: int
    line_kind: str
    purchase_order_line_id: Optional[UUID]
    product_id: Optional[UUID]
    charge_code: Optional[str]
    uom_code: Optional[str]
    base_billed_quantity: Optional[Decimal]
    base_free_quantity: Optional[Decimal]
    returned_base_billed_quantity: Decimal
    returned_base_free_quantity: Decimal
    returnable_base_billed_quantity: Optional[Decimal]
    returnable_base_free_quantity: Optional[Decimal]
    tax_code_version_id: UUID
    taxability_snapshot: str
    itc_eligibility: str
    line_total: Decimal
    receipt_allocations: list[SupplierInvoiceReceiptAllocation]


class SupplierInvoiceDocument(StrictDTO):
    supplier_invoice_id: UUID
    branch_id: UUID
    supplier_account_id: UUID
    buyer_tax_registration_id: UUID
    supplier_tax_registration_id: Optional[UUID]
    supplier_invoice_number: str
    supplier_invoice_date: date
    received_date: date
    due_date: date
    fiscal_year: int
    supply_type: str
    currency_code: str
    grand_total: Decimal
    payable_open_item_id: Optional[UUID]
    payable_outstanding_amount: Optional[Decimal]
    calculation_ruleset_version: str
    posted_at: datetime
    row_version: int
    lines: list[SupplierInvoiceLine]


class SupplierInvoiceResolutionResponse(DocumentResolution):
    document: Optional[SupplierInvoiceDocument]


def _load_supplier_receipt_allocations(
    db: Session,
    organization_id: UUID,
    branch_id: UUID,
    *,
    goods_receipt_id: Optional[UUID] = None,
    supplier_invoice_id: Optional[UUID] = None,
) -> list[dict]:
    if (goods_receipt_id is None) == (supplier_invoice_id is None):
        raise RuntimeError("exactly one canonical receipt-lineage parent is required")
    rows = db.execute(
        text(
            """
            SELECT allocation.id AS supplier_invoice_receipt_allocation_id,
                   invoice.id AS supplier_invoice_id,
                   invoice_line.id AS supplier_invoice_line_id,
                   invoice.supplier_invoice_number, invoice.supplier_invoice_date,
                   receipt.id AS goods_receipt_id,
                   receipt_line.id AS goods_receipt_line_id,
                   receipt_line.product_id, receipt_line.batch_id,
                   receipt_line.location_id, receipt_line.uom_code,
                   allocation.allocated_base_billed_quantity,
                   allocation.allocated_base_free_quantity,
                   COALESCE(returned.base_billed_quantity,0) AS returned_base_billed_quantity,
                   COALESCE(returned.base_free_quantity,0) AS returned_base_free_quantity,
                   GREATEST(allocation.allocated_base_billed_quantity-
                            COALESCE(returned.base_billed_quantity,0),0)
                     AS remaining_base_billed_quantity,
                   GREATEST(allocation.allocated_base_free_quantity-
                            COALESCE(returned.base_free_quantity,0),0)
                     AS remaining_base_free_quantity
              FROM procurement.supplier_invoice_receipt_allocations AS allocation
              JOIN procurement.supplier_invoice_lines AS invoice_line
                ON invoice_line.org_id=allocation.org_id
               AND invoice_line.id=allocation.supplier_invoice_line_id
              JOIN procurement.supplier_invoices AS invoice
                ON invoice.org_id=invoice_line.org_id
               AND invoice.id=invoice_line.supplier_invoice_id
               AND invoice.status='posted'
               AND invoice.branch_id=:branch_id
              JOIN procurement.goods_receipt_lines AS receipt_line
                ON receipt_line.org_id=allocation.org_id
               AND receipt_line.id=allocation.goods_receipt_line_id
              JOIN procurement.goods_receipts AS receipt
                ON receipt.org_id=receipt_line.org_id
               AND receipt.id=receipt_line.goods_receipt_id
               AND receipt.status='posted'
               AND receipt.branch_id=:branch_id
              LEFT JOIN LATERAL (
                  SELECT SUM(return_line.base_billed_quantity) AS base_billed_quantity,
                         SUM(return_line.base_free_quantity) AS base_free_quantity
                    FROM procurement.purchase_return_lines AS return_line
                    JOIN procurement.purchase_returns AS return_header
                      ON return_header.org_id=return_line.org_id
                     AND return_header.id=return_line.purchase_return_id
                     AND return_header.status='posted'
                   WHERE return_line.org_id=allocation.org_id
                     AND return_line.supplier_invoice_receipt_allocation_id=allocation.id
              ) AS returned ON true
             WHERE allocation.org_id=:org_id
               AND ((CAST(:goods_receipt_id AS uuid) IS NOT NULL
                     AND receipt.id=CAST(:goods_receipt_id AS uuid))
                    OR (CAST(:supplier_invoice_id AS uuid) IS NOT NULL
                        AND invoice.id=CAST(:supplier_invoice_id AS uuid)))
             ORDER BY receipt.received_at, receipt.goods_receipt_number,
                      receipt_line.line_number, invoice_line.line_number,
                      allocation.id
            """
        ),
        {
            "org_id": organization_id,
            "branch_id": branch_id,
            "goods_receipt_id": goods_receipt_id,
            "supplier_invoice_id": supplier_invoice_id,
        },
    ).fetchall()
    return [_mapping(row) for row in rows]


@router.get("/purchase-orders", response_model=PurchaseOrderResolutionResponse)
def canonical_purchase_order_get(
    purchase_order_id: Optional[UUID] = None,
    purchase_order_number: Optional[str] = Query(None, max_length=64),
    fiscal_year: Optional[int] = Query(None, ge=2000, le=9999),
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
) -> PurchaseOrderResolutionResponse:
    _require_operation(context, "procurement.purchase_orders.get")
    branch_id = _require_branch(context)
    params = _lookup_parameters(purchase_order_id, purchase_order_number, fiscal_year)
    params.update(org_id=context.organization_id, branch_id=branch_id)
    rows = db.execute(
        text(
            """
            SELECT id AS purchase_order_id, branch_id, supplier_account_id,
                   purchase_order_number, fiscal_year, order_date,
                   expected_delivery_date, status, currency_code, grand_total,
                   calculation_ruleset_version, row_version
              FROM procurement.purchase_orders
             WHERE org_id=:org_id AND branch_id=:branch_id AND status<>'cancelled'
               AND ((CAST(:document_id AS uuid) IS NOT NULL
                     AND id=CAST(:document_id AS uuid))
                    OR (CAST(:document_id AS uuid) IS NULL
                        AND purchase_order_number=:document_number
                        AND (:fiscal_year IS NULL OR fiscal_year=:fiscal_year)))
             ORDER BY fiscal_year DESC, id LIMIT 2
            """
        ), params,
    ).fetchall()
    state, count = _document_result(rows)
    if state != "matched":
        return PurchaseOrderResolutionResponse(
            match_state=state, requires_selection=state == "ambiguous",
            matched_count=count, document=None,
        )
    header = _mapping(rows[0])
    lines = db.execute(
        text(
            """
            SELECT line.id AS purchase_order_line_id, line.line_number,
                   line.line_kind, line.product_id, line.charge_code, line.uom_code,
                   line.base_billed_quantity, line.base_free_quantity,
                   COALESCE(received.base_billed_quantity,0) AS received_base_billed_quantity,
                   COALESCE(received.base_free_quantity,0) AS received_base_free_quantity,
                   CASE WHEN line.base_billed_quantity IS NULL THEN NULL ELSE
                     GREATEST(line.base_billed_quantity-COALESCE(received.base_billed_quantity,0),0)
                   END AS remaining_receipt_base_billed_quantity,
                   CASE WHEN line.base_free_quantity IS NULL THEN NULL ELSE
                     GREATEST(line.base_free_quantity-COALESCE(received.base_free_quantity,0),0)
                   END AS remaining_receipt_base_free_quantity,
                   COALESCE(advance.gross_advance_amount,0) AS allocated_advance_amount,
                   line.quoted_unit_rate, line.line_total
              FROM procurement.purchase_order_lines AS line
              LEFT JOIN LATERAL (
                  SELECT SUM(receipt_line.base_accepted_quantity) AS base_billed_quantity,
                         SUM(receipt_line.base_free_quantity) AS base_free_quantity
                    FROM procurement.goods_receipt_lines AS receipt_line
                    JOIN procurement.goods_receipts AS receipt
                      ON receipt.org_id=receipt_line.org_id
                     AND receipt.id=receipt_line.goods_receipt_id
                     AND receipt.status='posted'
                   WHERE receipt_line.org_id=line.org_id
                     AND receipt_line.purchase_order_line_id=line.id
              ) AS received ON true
              LEFT JOIN LATERAL (
                  SELECT SUM(allocation.gross_advance_amount) AS gross_advance_amount
                    FROM procurement.purchase_order_advance_allocations AS allocation
                   WHERE allocation.org_id=line.org_id
                     AND allocation.purchase_order_line_id=line.id
                     AND allocation.status='posted'
                     AND NOT EXISTS (
                       SELECT 1 FROM procurement.purchase_order_advance_allocations AS reversal
                        WHERE reversal.org_id=allocation.org_id
                          AND reversal.reversal_of_allocation_id=allocation.id)
              ) AS advance ON true
             WHERE line.org_id=:org_id AND line.purchase_order_id=:document_id
             ORDER BY line.line_number, line.id
            """
        ), {"org_id": context.organization_id, "document_id": header["purchase_order_id"]},
    ).fetchall()
    header["lines"] = [PurchaseOrderLine(**_mapping(row)) for row in lines]
    return PurchaseOrderResolutionResponse(
        match_state="matched", requires_selection=False, matched_count=1,
        document=PurchaseOrderDocument(**header),
    )


@router.get("/goods-receipts", response_model=GoodsReceiptResolutionResponse)
def canonical_goods_receipt_get(
    goods_receipt_id: Optional[UUID] = None,
    goods_receipt_number: Optional[str] = Query(None, max_length=64),
    fiscal_year: Optional[int] = Query(None, ge=2000, le=9999),
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
) -> GoodsReceiptResolutionResponse:
    _require_operation(context, "procurement.goods_receipts.get")
    branch_id = _require_branch(context)
    params = _lookup_parameters(goods_receipt_id, goods_receipt_number, fiscal_year)
    params.update(org_id=context.organization_id, branch_id=branch_id)
    rows = db.execute(
        text(
            """
            SELECT id AS goods_receipt_id, branch_id, supplier_account_id,
                   goods_receipt_number, fiscal_year, received_at,
                   supplier_challan_number, supplier_challan_date, posted_at, row_version
              FROM procurement.goods_receipts
             WHERE org_id=:org_id AND branch_id=:branch_id AND status='posted'
               AND ((CAST(:document_id AS uuid) IS NOT NULL
                     AND id=CAST(:document_id AS uuid))
                    OR (CAST(:document_id AS uuid) IS NULL
                        AND goods_receipt_number=:document_number
                        AND (:fiscal_year IS NULL OR fiscal_year=:fiscal_year)))
             ORDER BY fiscal_year DESC, id LIMIT 2
            """
        ), params,
    ).fetchall()
    state, count = _document_result(rows)
    if state != "matched":
        return GoodsReceiptResolutionResponse(
            match_state=state, requires_selection=state == "ambiguous",
            matched_count=count, document=None,
        )
    header = _mapping(rows[0])
    lines = db.execute(
        text(
            """
            SELECT line.id AS goods_receipt_line_id, line.line_number,
                   line.purchase_order_line_id, line.product_id, line.batch_id,
                   line.location_id, line.uom_code, line.base_accepted_quantity,
                   line.base_free_quantity,
                   COALESCE(invoiced.base_billed_quantity,0) AS invoiced_base_billed_quantity,
                   COALESCE(invoiced.base_free_quantity,0) AS invoiced_base_free_quantity,
                   GREATEST(line.base_accepted_quantity-COALESCE(invoiced.base_billed_quantity,0),0)
                     AS invoiceable_base_billed_quantity,
                   GREATEST(line.base_free_quantity-COALESCE(invoiced.base_free_quantity,0),0)
                     AS invoiceable_base_free_quantity,
                   batch.batch_number, batch.status AS batch_status, batch.expires_on,
                   batch.row_version AS batch_row_version, line.unit_cost
              FROM procurement.goods_receipt_lines AS line
              JOIN inventory.batches AS batch
                ON batch.org_id=line.org_id AND batch.id=line.batch_id
              LEFT JOIN LATERAL (
                  SELECT SUM(allocation.allocated_base_billed_quantity) AS base_billed_quantity,
                         SUM(allocation.allocated_base_free_quantity) AS base_free_quantity
                    FROM procurement.supplier_invoice_receipt_allocations AS allocation
                    JOIN procurement.supplier_invoice_lines AS invoice_line
                      ON invoice_line.org_id=allocation.org_id
                     AND invoice_line.id=allocation.supplier_invoice_line_id
                    JOIN procurement.supplier_invoices AS invoice
                      ON invoice.org_id=invoice_line.org_id
                     AND invoice.id=invoice_line.supplier_invoice_id
                     AND invoice.status='posted'
                   WHERE allocation.org_id=line.org_id
                     AND allocation.goods_receipt_line_id=line.id
              ) AS invoiced ON true
             WHERE line.org_id=:org_id AND line.goods_receipt_id=:document_id
             ORDER BY line.line_number, line.id
            """
        ), {"org_id": context.organization_id, "document_id": header["goods_receipt_id"]},
    ).fetchall()
    allocation_rows = _load_supplier_receipt_allocations(
        db, context.organization_id, branch_id,
        goods_receipt_id=header["goods_receipt_id"]
    )
    allocations_by_receipt_line: dict[
        UUID, list[SupplierInvoiceReceiptAllocation]
    ] = {}
    for allocation in allocation_rows:
        receipt_line_id = allocation["goods_receipt_line_id"]
        allocations_by_receipt_line.setdefault(receipt_line_id, []).append(
            SupplierInvoiceReceiptAllocation(**allocation)
        )
    line_models = []
    for row in lines:
        line = _mapping(row)
        line["receipt_allocations"] = allocations_by_receipt_line.get(
            line["goods_receipt_line_id"], []
        )
        line_models.append(GoodsReceiptLine(**line))
    header["lines"] = line_models
    return GoodsReceiptResolutionResponse(
        match_state="matched", requires_selection=False, matched_count=1,
        document=GoodsReceiptDocument(**header),
    )


@router.get("/supplier-invoices", response_model=SupplierInvoiceResolutionResponse)
def canonical_supplier_invoice_get(
    supplier_invoice_id: Optional[UUID] = None,
    supplier_invoice_number: Optional[str] = Query(None, max_length=64),
    fiscal_year: Optional[int] = Query(None, ge=2000, le=9999),
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
) -> SupplierInvoiceResolutionResponse:
    _require_operation(context, "procurement.supplier_invoices.get")
    branch_id = _require_branch(context)
    params = _lookup_parameters(
        supplier_invoice_id, supplier_invoice_number, fiscal_year
    )
    params.update(org_id=context.organization_id, branch_id=branch_id)
    rows = db.execute(
        text(
            """
            SELECT invoice.id AS supplier_invoice_id, invoice.branch_id,
                   invoice.supplier_account_id, invoice.buyer_tax_registration_id,
                   invoice.supplier_tax_registration_id,
                   invoice.supplier_invoice_number, invoice.supplier_invoice_date,
                   invoice.received_date, invoice.due_date, invoice.fiscal_year,
                   invoice.supply_type, invoice.currency_code, invoice.grand_total,
                   payable.open_item_id AS payable_open_item_id,
                   payable.outstanding_amount AS payable_outstanding_amount,
                   invoice.calculation_ruleset_version, invoice.posted_at,
                   invoice.row_version
              FROM procurement.supplier_invoices AS invoice
              LEFT JOIN LATERAL (
                  SELECT item.id AS open_item_id,
                         GREATEST(item.principal_amount-COALESCE(applied.amount,0),0)
                           AS outstanding_amount
                    FROM finance.accounting_events AS event
                    JOIN finance.open_items AS item
                      ON item.org_id=event.org_id AND item.accounting_event_id=event.id
                    LEFT JOIN LATERAL (
                        SELECT SUM(allocation.amount) AS amount
                          FROM finance.allocations AS allocation
                         WHERE allocation.org_id=item.org_id
                           AND allocation.open_item_id=item.id
                           AND allocation.status='posted'
                           AND NOT EXISTS (
                             SELECT 1 FROM finance.allocations AS reversal
                              WHERE reversal.org_id=allocation.org_id
                                AND reversal.reversal_of_allocation_id=allocation.id)
                    ) AS applied ON true
                   WHERE event.org_id=invoice.org_id
                     AND event.supplier_invoice_id=invoice.id
                   ORDER BY item.id LIMIT 1
              ) AS payable ON true
             WHERE invoice.org_id=:org_id AND invoice.branch_id=:branch_id
               AND invoice.status='posted'
               AND ((CAST(:document_id AS uuid) IS NOT NULL
                     AND invoice.id=CAST(:document_id AS uuid))
                    OR (CAST(:document_id AS uuid) IS NULL
                        AND invoice.supplier_invoice_number=:document_number
                        AND (:fiscal_year IS NULL OR invoice.fiscal_year=:fiscal_year)))
             ORDER BY invoice.fiscal_year DESC, invoice.id LIMIT 2
            """
        ), params,
    ).fetchall()
    state, count = _document_result(rows)
    if state != "matched":
        return SupplierInvoiceResolutionResponse(
            match_state=state, requires_selection=state == "ambiguous",
            matched_count=count, document=None,
        )
    header = _mapping(rows[0])
    lines = db.execute(
        text(
            """
            SELECT line.id AS supplier_invoice_line_id, line.line_number,
                   line.line_kind, line.purchase_order_line_id, line.product_id,
                   line.charge_code, line.uom_code, line.base_billed_quantity,
                   line.base_free_quantity,
                   COALESCE(returned.base_billed_quantity,0) AS returned_base_billed_quantity,
                   COALESCE(returned.base_free_quantity,0) AS returned_base_free_quantity,
                   CASE WHEN line.base_billed_quantity IS NULL THEN NULL ELSE
                     GREATEST(line.base_billed_quantity-COALESCE(returned.base_billed_quantity,0),0)
                   END AS returnable_base_billed_quantity,
                   CASE WHEN line.base_free_quantity IS NULL THEN NULL ELSE
                     GREATEST(line.base_free_quantity-COALESCE(returned.base_free_quantity,0),0)
                   END AS returnable_base_free_quantity,
                   line.tax_code_version_id, line.taxability_snapshot,
                   line.itc_eligibility, line.line_total
              FROM procurement.supplier_invoice_lines AS line
              LEFT JOIN LATERAL (
                  SELECT SUM(return_line.base_billed_quantity) AS base_billed_quantity,
                         SUM(return_line.base_free_quantity) AS base_free_quantity
                    FROM procurement.supplier_invoice_receipt_allocations AS receipt_allocation
                    JOIN procurement.purchase_return_lines AS return_line
                      ON return_line.org_id=receipt_allocation.org_id
                     AND return_line.supplier_invoice_receipt_allocation_id=receipt_allocation.id
                    JOIN procurement.purchase_returns AS return_header
                      ON return_header.org_id=return_line.org_id
                     AND return_header.id=return_line.purchase_return_id
                     AND return_header.status='posted'
                   WHERE receipt_allocation.org_id=line.org_id
                     AND receipt_allocation.supplier_invoice_line_id=line.id
              ) AS returned ON true
             WHERE line.org_id=:org_id AND line.supplier_invoice_id=:document_id
             ORDER BY line.line_number, line.id
            """
        ), {"org_id": context.organization_id, "document_id": header["supplier_invoice_id"]},
    ).fetchall()
    allocation_rows = _load_supplier_receipt_allocations(
        db, context.organization_id, branch_id,
        supplier_invoice_id=header["supplier_invoice_id"],
    )
    allocations_by_invoice_line: dict[
        UUID, list[SupplierInvoiceReceiptAllocation]
    ] = {}
    for allocation in allocation_rows:
        invoice_line_id = allocation["supplier_invoice_line_id"]
        allocations_by_invoice_line.setdefault(invoice_line_id, []).append(
            SupplierInvoiceReceiptAllocation(**allocation)
        )
    line_models = []
    for row in lines:
        line = _mapping(row)
        line["receipt_allocations"] = allocations_by_invoice_line.get(
            line["supplier_invoice_line_id"], []
        )
        line_models.append(SupplierInvoiceLine(**line))
    header["lines"] = line_models
    return SupplierInvoiceResolutionResponse(
        match_state="matched", requires_selection=False, matched_count=1,
        document=SupplierInvoiceDocument(**header),
    )


class OpenItemMatch(StrictDTO):
    open_item_id: UUID
    party_id: UUID
    branch_id: UUID
    item_side: Literal["receivable", "payable"]
    document_number: str
    document_date: date
    due_date: date
    currency_code: str
    principal_amount: Decimal
    allocated_amount: Decimal
    outstanding_amount: Decimal
    source_kind: str
    source_id: UUID
    row_version: int


class OpenItemSearchResponse(StrictDTO):
    results: list[OpenItemMatch]


PaymentMethod = Literal["cash", "bank_transfer", "cheque", "card", "upi", "other"]


class SettlementChoice(StrictDTO):
    choice_kind: Literal["cash", "bank"]
    branch_id: UUID
    settlement_account_id: UUID
    settlement_account_code: str
    settlement_account_name: str
    currency_code: str
    settlement_account_row_version: int
    bank_account_id: Optional[UUID]
    bank_name: Optional[str]
    bank_account_row_version: Optional[int]
    supported_methods: list[PaymentMethod]


class SettlementChoiceSearchResponse(StrictDTO):
    results: list[SettlementChoice]


@router.get("/settlement-choices", response_model=SettlementChoiceSearchResponse)
def canonical_settlement_choice_search(
    currency_code: str = Query(..., min_length=3, max_length=3, pattern=r"^[A-Z]{3}$"),
    limit: int = Query(50, ge=1, le=100),
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
) -> SettlementChoiceSearchResponse:
    _require_operation(context, "finance.settlement_choices.search")
    branch_id = _require_branch(context)
    rows = db.execute(
        text(
            """
            SELECT CASE WHEN bank.id IS NULL THEN 'cash' ELSE 'bank' END
                     AS choice_kind,
                   CAST(:branch_id AS uuid) AS branch_id,
                   account.id AS settlement_account_id,
                   account.code AS settlement_account_code,
                   account.name AS settlement_account_name,
                   account.currency_code,
                   account.row_version AS settlement_account_row_version,
                   bank.id AS bank_account_id,
                   bank.bank_name,
                   bank.row_version AS bank_account_row_version,
                   CASE WHEN bank.id IS NULL
                        THEN ARRAY['cash']::text[]
                        ELSE ARRAY['bank_transfer','cheque','card','upi','other']::text[]
                   END AS supported_methods
              FROM finance.accounts AS account
              LEFT JOIN finance.bank_accounts AS bank
                ON bank.org_id=:org_id AND bank.account_id=account.id
               AND bank.currency_code=account.currency_code
               AND bank.status='active'
             WHERE account.org_id=:org_id AND account.status='active'
               AND account.account_type='asset'
               AND account.currency_code=:currency_code
             ORDER BY settlement_account_code, choice_kind, bank_name NULLS FIRST,
                      settlement_account_id, bank_account_id NULLS FIRST
             LIMIT :limit
            """
        ),
        {
            "org_id": context.organization_id,
            "branch_id": branch_id,
            "currency_code": currency_code,
            "limit": limit,
        },
    ).fetchall()
    return SettlementChoiceSearchResponse(
        results=[SettlementChoice(**_mapping(row)) for row in rows]
    )


@router.get("/open-items", response_model=OpenItemSearchResponse)
def canonical_open_item_search(
    party_id: UUID,
    item_side: Literal["receivable", "payable"],
    currency_code: str = Query(..., min_length=3, max_length=3, pattern=r"^[A-Z]{3}$"),
    due_on_or_before: Optional[date] = None,
    limit: int = Query(50, ge=1, le=100),
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
) -> OpenItemSearchResponse:
    _require_operation(context, "finance.open_items.search")
    branch_id = _require_branch(context)
    rows = db.execute(
        text(
            """
            SELECT item.id AS open_item_id, item.party_id,
                   COALESCE(advance.branch_id, journal_branch.branch_id) AS branch_id,
                   item.item_side, item.document_number, item.document_date,
                   item.due_date, item.currency_code, item.principal_amount,
                   COALESCE(applied.amount,0) AS allocated_amount,
                   item.principal_amount-COALESCE(applied.amount,0) AS outstanding_amount,
                   event.event_type AS source_kind,
                   COALESCE(event.sales_invoice_id, event.supplier_invoice_id,
                            event.adjustment_note_id,
                            event.purchase_order_advance_allocation_id,
                            event.payment_id, event.expense_claim_id,
                            event.inventory_document_id, event.withholding_id) AS source_id,
                   (1+COALESCE(applied.allocation_version,0))::bigint AS row_version
              FROM finance.open_items AS item
              JOIN finance.accounting_events AS event
                ON event.org_id=item.org_id AND event.id=item.accounting_event_id
              LEFT JOIN procurement.purchase_order_advance_allocations AS advance
                ON advance.org_id=item.org_id AND advance.prepayment_open_item_id=item.id
               AND advance.status='posted'
              LEFT JOIN LATERAL (
                  SELECT MIN(line.branch_id::text)::uuid AS branch_id,
                         COUNT(DISTINCT line.branch_id) AS branch_count
                    FROM finance.journal_lines AS line
                   WHERE line.org_id=event.org_id
                     AND line.journal_entry_id=event.journal_entry_id
              ) AS journal_branch ON journal_branch.branch_count=1
              LEFT JOIN LATERAL (
                  SELECT SUM(allocation.amount) FILTER (
                           WHERE allocation.status='posted'
                             AND NOT EXISTS (
                               SELECT 1 FROM finance.allocations AS reversal
                                WHERE reversal.org_id=allocation.org_id
                                  AND reversal.reversal_of_allocation_id=allocation.id)
                         ) AS amount,
                         COUNT(*) AS allocation_version
                    FROM finance.allocations AS allocation
                   WHERE allocation.org_id=item.org_id
                     AND allocation.open_item_id=item.id
              ) AS applied ON true
             WHERE item.org_id=:org_id AND item.party_id=:party_id
               AND item.item_side=:item_side AND item.currency_code=:currency_code
               AND item.status='open'
               AND (:due_on_or_before IS NULL OR item.due_date<=:due_on_or_before)
               AND COALESCE(advance.branch_id, journal_branch.branch_id)=:branch_id
               AND COALESCE(event.sales_invoice_id, event.supplier_invoice_id,
                            event.adjustment_note_id,
                            event.purchase_order_advance_allocation_id,
                            event.payment_id, event.expense_claim_id,
                            event.inventory_document_id, event.withholding_id) IS NOT NULL
               AND item.principal_amount-COALESCE(applied.amount,0)>0
             ORDER BY item.due_date, item.document_date, item.id LIMIT :limit
            """
        ),
        {
            "org_id": context.organization_id,
            "party_id": party_id,
            "branch_id": branch_id,
            "item_side": item_side,
            "currency_code": currency_code,
            "due_on_or_before": due_on_or_before,
            "limit": limit,
        },
    ).fetchall()
    return OpenItemSearchResponse(results=[OpenItemMatch(**_mapping(row)) for row in rows])

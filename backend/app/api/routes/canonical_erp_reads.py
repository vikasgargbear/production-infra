"""Canonical compatibility for the current ERP UI.

These endpoints preserve the UI's existing response field names while reading
and writing only the canonical schemas. Consequential document mutations still
use the reviewed operator-command boundary; the product mutation below creates
only a non-transactional draft.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_UP
from typing import Annotated, Any, Dict, Literal, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, Security, status
from fastapi.security import HTTPBearer
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    PlainSerializer,
    WithJsonSchema,
    model_validator,
)
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.money import money_json
from ...core.security.permissions import PermissionChecker
from ...infrastructure import canonical_write_commands
from ..schemas.money import MoneyJSON
from ..schemas.master.customer import CanonicalCustomerCreate
from ..schemas.master.supplier import CanonicalSupplierCreate

router = APIRouter(dependencies=[Security(HTTPBearer(auto_error=False))])
logger = logging.getLogger(__name__)


_MASTER_CREATE_SQLSTATE_RESPONSES = {
    "22023": (status.HTTP_422_UNPROCESSABLE_ENTITY, "Master data is invalid"),
    "22003": (status.HTTP_409_CONFLICT, "Master code sequence is exhausted"),
    "23505": (status.HTTP_409_CONFLICT, "Master data already exists"),
    "23503": (status.HTTP_409_CONFLICT, "Master data is already referenced"),
    "23514": (status.HTTP_409_CONFLICT, "Master data configuration is incomplete"),
    "P0002": (status.HTTP_409_CONFLICT, "Required canonical master data is missing"),
    "40001": (status.HTTP_503_SERVICE_UNAVAILABLE, "Master data changed; retry safely"),
    "42501": (status.HTTP_403_FORBIDDEN, "Master data creation is not authorized"),
    "55000": (status.HTTP_409_CONFLICT, "Idempotency key is not executable"),
}


def _raise_master_create_database_error(exc: DBAPIError) -> None:
    """Translate only reviewed database outcomes; unknown failures stay server errors."""

    original = exc.orig
    sqlstate = getattr(original, "sqlstate", None) or getattr(original, "pgcode", None)
    mapped = _MASTER_CREATE_SQLSTATE_RESPONSES.get(sqlstate)
    if mapped is None:
        raise exc
    http_status, detail = mapped
    logger.info("Canonical master create rejected", extra={"sqlstate": sqlstate})
    headers = {"Retry-After": "1"} if sqlstate == "40001" else None
    raise HTTPException(status_code=http_status, detail=detail, headers=headers) from exc


def _set_master_idempotency_headers(
    response: Response, idempotency_key: str, replayed: bool
) -> None:
    response.headers["X-Idempotency-Key"] = idempotency_key
    response.headers["X-Idempotency-Replayed"] = str(bool(replayed)).lower()


def _execute_canonical_product_create(
    db: Session,
    org_id: UUID,
    product: "CanonicalProductDraftCreate",
    idempotency_key: str,
):
    return db.execute(
        text("""
            SELECT product_id,product_code,idempotency_replayed
              FROM erp_master_commands.create_product_draft(
                :org_id,:name,:generic_name,:product_kind,
                :idempotency_key_hash,
                transaction_timestamp()+interval '24 hours'
              )
        """),
        {
            "org_id": org_id,
            "product_kind": product.product_kind,
            "name": product.product_name,
            "generic_name": product.generic_name,
            "idempotency_key_hash": hashlib.sha256(
                idempotency_key.encode("utf-8")
            ).digest(),
        },
    ).mappings().one()


def _execute_canonical_customer_create(
    db: Session,
    org_id: UUID,
    customer: CanonicalCustomerCreate,
    idempotency_key: str,
):
    return db.execute(text("""
        SELECT customer_account_id,party_id,customer_code,idempotency_replayed
          FROM erp_master_commands.create_customer(
            :org_id,:customer_name,:customer_type,:primary_phone,
            :primary_email,:contact_person_name,:address_line1,:address_line2,
            :city,:state_code,:postal_code,:gstin,:pan,:credit_limit,
            :credit_days,:idempotency_key_hash,
            transaction_timestamp()+interval '24 hours'
          )
    """), {
        "org_id": org_id, "customer_name": customer.customer_name,
        "customer_type": customer.customer_type,
        "primary_phone": customer.primary_phone,
        "primary_email": str(customer.primary_email) if customer.primary_email else None,
        "contact_person_name": customer.contact_person_name,
        "address_line1": customer.address_line1,
        "address_line2": customer.address_line2,
        "city": customer.city,"state_code": customer.state_code,
        "postal_code": customer.pincode,"gstin": customer.gst_number,
        "pan": customer.pan_number,
        "credit_limit": customer.credit_limit, "credit_days": customer.credit_days,
        "idempotency_key_hash": hashlib.sha256(
            idempotency_key.encode("utf-8")
        ).digest(),
    }).mappings().one()


def _execute_canonical_supplier_create(
    db: Session,
    org_id: UUID,
    supplier: CanonicalSupplierCreate,
    idempotency_key: str,
):
    return db.execute(text("""
        SELECT supplier_account_id,party_id,supplier_code,idempotency_replayed
          FROM erp_master_commands.create_supplier(
            :org_id,:supplier_name,:primary_phone,:primary_email,
            :contact_person_name,:address_line1,:address_line2,:city,
            :state_code,:postal_code,:gstin,:pan,:payment_days,
            :idempotency_key_hash,
            transaction_timestamp()+interval '24 hours'
          )
    """), {
        "org_id": org_id,"supplier_name": supplier.supplier_name,
        "primary_phone": supplier.primary_phone,
        "primary_email": str(supplier.primary_email) if supplier.primary_email else None,
        "contact_person_name": supplier.contact_person,
        "address_line1": supplier.address_line1,
        "address_line2": supplier.address_line2,"city": supplier.city,
        "state_code": supplier.state_code,"postal_code": supplier.pincode,
        "gstin": supplier.gst_number,"pan": supplier.pan_number,
        "payment_days": supplier.payment_days,
        "idempotency_key_hash": hashlib.sha256(
            idempotency_key.encode("utf-8")
        ).digest(),
    }).mappings().one()


def _quantity_wire(value: Decimal) -> str:
    return format(value, ".6f")


def _rate_wire(value: Decimal) -> str:
    return format(value, ".4f")


def _percent_wire(value: Decimal) -> str:
    return format(value, ".6f")


def _money_wire(value: Decimal) -> str:
    return format(value, ".2f")


def _exact_string_schema(scale: int, label: str) -> dict[str, Any]:
    return {
        "type": "string",
        "pattern": rf"^(?:0|[1-9][0-9]*)\.[0-9]{{{scale}}}$",
        "description": f"Exact non-negative {label}; never a JSON number.",
    }


ExactQuantity = Annotated[
    Decimal,
    Field(ge=0, max_digits=20, decimal_places=6),
    PlainSerializer(_quantity_wire, return_type=str, when_used="json"),
    WithJsonSchema(_exact_string_schema(6, "quantity"), mode="serialization"),
]
ExactRate = Annotated[
    Decimal,
    Field(ge=0, max_digits=20, decimal_places=4),
    PlainSerializer(_rate_wire, return_type=str, when_used="json"),
    WithJsonSchema(_exact_string_schema(4, "rate"), mode="serialization"),
]
ExactPercent = Annotated[
    Decimal,
    Field(ge=0, le=100, max_digits=20, decimal_places=6),
    PlainSerializer(_percent_wire, return_type=str, when_used="json"),
    WithJsonSchema(_exact_string_schema(6, "percentage"), mode="serialization"),
]
ExactMoney = Annotated[
    Decimal,
    Field(ge=0, max_digits=20, decimal_places=2),
    PlainSerializer(_money_wire, return_type=str, when_used="json"),
    WithJsonSchema(_exact_string_schema(2, "money amount"), mode="serialization"),
]


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


def _rows(db: Session, sql: str, params: dict) -> list[dict]:
    return [dict(row._mapping) for row in db.execute(text(sql), params).fetchall()]


def _range_params(org_id: UUID, date_from: Optional[str], date_to: Optional[str]) -> dict:
    return {"org_id": org_id, "date_from": date_from, "date_to": date_to}


def _money_fields(row: Dict[str, Any], fields: tuple[str, ...]) -> Dict[str, Any]:
    """Project canonical NUMERIC money as exact two-decimal JSON strings."""
    result = dict(row)
    for field in fields:
        result[field] = money_json(result.get(field) or 0)
    return result


def _validated_report_range(date_from: date, date_to: date) -> dict[str, date]:
    if date_to < date_from:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="date_to must be on or after date_from",
        )
    return {"date_from": date_from, "date_to": date_to}


_INVOICE_RANGE = """
    invoice.org_id=:org_id AND invoice.status NOT IN ('cancelled','reversed')
    AND (:date_from IS NULL OR invoice.invoice_date >= CAST(:date_from AS date))
    AND (:date_to IS NULL OR invoice.invoice_date <= CAST(:date_to AS date))
"""


MASTER_USER = Depends(PermissionChecker("master", "view"))
SALES_USER = Depends(PermissionChecker("sales", "view"))
PURCHASE_USER = Depends(PermissionChecker("purchase", "view"))
INVENTORY_USER = Depends(PermissionChecker("inventory", "view"))
FINANCE_USER = Depends(PermissionChecker("finance", "view"))


class CanonicalLogisticsModePolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transport_mode: Literal["in_person"]
    display_name: str
    requires_transporter_party: Literal[False]
    requires_vehicle: Literal[False]
    requires_transport_document: Literal[False]


class CanonicalDocumentPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    allowed_rounding_policies: list[Literal["none"]]
    default_rounding_policy: Literal["none"]
    allowed_zero_rated_payment_modes: list[
        Literal["not_applicable", "with_igst"]
    ]
    default_zero_rated_payment_mode: Literal["not_applicable"]
    allowed_tax_charge_mechanisms: list[Literal["normal"]]
    default_tax_charge_mechanism: Literal["normal"]
    allowed_price_bases: list[Literal["tax_exclusive"]]
    default_price_basis: Literal["tax_exclusive"]
    logistics_modes: list[CanonicalLogisticsModePolicy]
    default_transport_mode: Literal["in_person"]


class CanonicalBusinessContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    organization_id: UUID
    organization_timezone: str
    business_date: date
    document_policy: CanonicalDocumentPolicy


@router.get("/canonical/business-context", response_model=CanonicalBusinessContext)
def canonical_business_context(
    user: dict = Depends(PermissionChecker()),
    db: Session = Depends(get_db),
) -> CanonicalBusinessContext:
    """Return the server-owned wall-clock date for the active organization."""

    org_id = _activate(db, user)
    rows = _rows(
        db,
        """
        SELECT organization.id AS organization_id,
               organization.timezone AS organization_timezone,
               (transaction_timestamp() AT TIME ZONE organization.timezone)::date
                 AS business_date
          FROM core.organizations organization
         WHERE organization.id=:org_id AND organization.status='active'
        """,
        {"org_id": org_id},
    )
    if len(rows) != 1:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The active organization has no authoritative business clock",
        )
    return CanonicalBusinessContext.model_validate({
        **rows[0],
        "document_policy": {
            "allowed_rounding_policies": ["none"],
            "default_rounding_policy": "none",
            "allowed_zero_rated_payment_modes": ["not_applicable", "with_igst"],
            "default_zero_rated_payment_mode": "not_applicable",
            "allowed_tax_charge_mechanisms": ["normal"],
            "default_tax_charge_mechanism": "normal",
            "allowed_price_bases": ["tax_exclusive"],
            "default_price_basis": "tax_exclusive",
            "logistics_modes": [{
                "transport_mode": "in_person",
                "display_name": "In person (no carrier)",
                "requires_transporter_party": False,
                "requires_vehicle": False,
                "requires_transport_document": False,
            }],
            "default_transport_mode": "in_person",
        },
    })

def _validated_state_code(
    state_code: Optional[str], gstin: Optional[str]
) -> Optional[str]:
    """Keep the supplied canonical code consistent with its GSTIN authority.

    State-name conversion is intentionally absent.  The canonical schema does
    not yet contain a reviewed, versioned geography release, so accepting a
    human label and translating it in application code would make the API an
    untracked statutory authority.  GSTIN supplies its own state code; other
    addresses must supply the exact two-character code.
    """
    if gstin:
        gst_state = gstin[:2]
        if state_code and state_code != gst_state:
            raise HTTPException(
                status_code=422,
                detail="GSTIN state code does not match the address state code",
            )
        return gst_state
    return state_code


class CanonicalProductDraftCreate(BaseModel):
    """Small, honest product-draft contract for the canonical catalog."""

    product_name: str = Field(min_length=1, max_length=255)
    generic_name: Optional[str] = Field(default=None, max_length=255)
    product_kind: str = Field(pattern=r"^(medicine|medical_device|consumable)$")

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class CanonicalCustomerAddressWrite(BaseModel):
    address_line1: str = Field(min_length=1, max_length=255)
    address_line2: Optional[str] = Field(default=None, max_length=255)
    landmark: Optional[str] = Field(default=None, max_length=255)
    city: str = Field(min_length=1, max_length=128)
    state_code: str = Field(pattern=r"^[0-9]{2}$")
    pincode: str = Field(pattern=r"^[0-9]{6}$")
    address_type: Literal["billing", "shipping", "other"]
    is_default: bool
    row_version: Optional[int] = Field(default=None, ge=1)

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class CanonicalProductDraftUpdate(BaseModel):
    row_version: int = Field(ge=1)
    product_name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    generic_name: Optional[str] = Field(default=None, max_length=255)
    product_kind: Optional[str] = Field(
        default=None, pattern=r"^(medicine|medical_device|consumable)$"
    )

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    @model_validator(mode="after")
    def require_change(self):
        if not (self.model_fields_set - {"row_version"}):
            raise ValueError("At least one product field is required")
        return self


@router.get("/products")
@router.get("/products/")
def products(limit: int = Query(100, ge=1, le=500), skip: int = Query(0, ge=0),
             offset: Optional[int] = Query(None, ge=0),
             search: str = "", include_inactive: bool = False,
             user: dict = MASTER_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    effective_offset = offset if offset is not None else skip
    rows = _rows(db, """
        SELECT p.id AS product_id, p.sku AS product_code, p.name AS product_name,
               p.generic_name, p.product_kind AS product_type, p.base_uom_code AS unit,
               conversion.id AS uom_conversion_id,
               tax_version.taxability,
               (CASE WHEN tax_version.taxability IS NULL THEN NULL
                     WHEN tax_version.taxability='taxable' THEN tax_version.igst_rate
                     ELSE 0 END)::text AS gst_percent,
               CASE WHEN p.status='draft' AND p.hsn_code='0000' THEN NULL ELSE p.hsn_code END AS hsn_code,
               p.dosage_form, p.strength_display, p.drug_schedule,
               p.requires_prescription, p.cold_chain_required,
               p.status='active' AS is_active, p.status, p.row_version,
               p.created_at, p.updated_at,
               COALESCE(stock.current_stock, 0)::text AS current_stock
          FROM catalog.products p
          JOIN core.organizations organization
            ON organization.id=p.org_id AND organization.status='active'
          LEFT JOIN LATERAL (
              SELECT SUM(balance.on_hand_quantity) AS current_stock
                FROM inventory.stock_balances balance
               WHERE balance.org_id=p.org_id AND balance.product_id=p.id
          ) stock ON true
          LEFT JOIN LATERAL (
              SELECT id FROM catalog.uom_conversions
               WHERE org_id=p.org_id AND product_id=p.id
                 AND from_uom_code=p.base_uom_code AND to_uom_code=p.base_uom_code
                 AND status='active'
                 AND valid_from<=(transaction_timestamp() AT TIME ZONE organization.timezone)::date
                 AND (valid_until IS NULL OR valid_until>=(transaction_timestamp() AT TIME ZONE organization.timezone)::date)
               ORDER BY valid_from DESC, id LIMIT 1
          ) conversion ON true
          LEFT JOIN LATERAL (
              SELECT taxability, igst_rate
                FROM tax.tax_code_versions
               WHERE code=p.hsn_code AND code_kind='hsn' AND status='active'
                 AND effective_from<=(transaction_timestamp() AT TIME ZONE organization.timezone)::date
                 AND (effective_to IS NULL OR effective_to>=(transaction_timestamp() AT TIME ZONE organization.timezone)::date)
               ORDER BY effective_from DESC, version_number DESC, id LIMIT 1
          ) tax_version ON true
         WHERE p.org_id=:org_id
           AND (p.status IN ('active','blocked') OR (:include_drafts AND p.status='draft'))
           AND (:search='' OR p.name ILIKE :pattern OR p.sku ILIKE :pattern
                OR COALESCE(p.generic_name,'') ILIKE :pattern)
         ORDER BY p.name, p.id LIMIT :limit OFFSET :skip
    """, {"org_id": org_id, "search": search.strip(), "pattern": f"%{search.strip()}%",
            "include_drafts": include_inactive,
            "limit": limit, "skip": effective_offset})
    total = db.execute(text("""
        SELECT COUNT(*) FROM catalog.products product
         WHERE product.org_id=:org_id
           AND (product.status IN ('active','blocked') OR (:include_drafts AND product.status='draft'))
           AND (:search='' OR product.name ILIKE :pattern OR product.sku ILIKE :pattern
                OR COALESCE(product.generic_name,'') ILIKE :pattern)
    """), {
        "org_id": org_id,
        "include_drafts": include_inactive,
        "search": search.strip(),
        "pattern": f"%{search.strip()}%",
    }).scalar_one()
    return {"products": rows, "total": total, "offset": effective_offset, "limit": limit}


@router.post("/products/", status_code=status.HTTP_201_CREATED)
def create_product_draft(
    product: CanonicalProductDraftCreate,
    response: Response,
    idempotency_key: str = Header(
        ...,
        alias="X-Idempotency-Key",
        min_length=8,
        max_length=128,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$",
    ),
    user: dict = Depends(PermissionChecker("master", "create")),
    db: Session = Depends(get_db),
):
    """Create an unusable draft; regulatory activation remains a separate command.

    The canonical baseline currently requires an HSN-shaped value even for a
    draft. ``0000`` is an internal sentinel hidden by read projections and can
    never make the product active because activation also requires reviewed HSN
    release, manufacturer, and regulatory facts.
    """

    org_id = _activate(db, user)
    try:
        created = _execute_canonical_product_create(
            db, org_id, product, idempotency_key
        )
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        _raise_master_create_database_error(exc)

    _set_master_idempotency_headers(
        response, idempotency_key, created["idempotency_replayed"]
    )
    return {
        "product_id": created["product_id"],
        "product_code": created["product_code"],
        "product_name": product.product_name,
        "idempotency_replayed": created["idempotency_replayed"],
        "lifecycle_status": "draft",
        "message": "Product draft created; classification is required before sale",
    }


@router.put("/products/{product_id}")
def update_product_draft(
    product_id: UUID,
    product: CanonicalProductDraftUpdate,
    user: dict = Depends(PermissionChecker("master", "update")),
    db: Session = Depends(get_db),
):
    """Update only mutable identity fields while the product remains a draft."""

    org_id = _activate(db, user)
    try:
        updated = canonical_write_commands.update_product_draft(
            db,
            org_id=org_id,
            product_id=product_id,
            expected_row_version=product.row_version,
            fields=product.model_fields_set,
            product_name=product.product_name,
            generic_name=product.generic_name,
            product_kind=product.product_kind,
        )
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        _raise_master_create_database_error(exc)
    return {
        "product_id": updated["product_id"],
        "product_code": updated["product_code"],
        "product_name": updated["updated_product_name"],
        "row_version": updated["new_row_version"],
        "lifecycle_status": "draft",
        "message": "Product draft updated",
    }


@router.delete("/products/{product_id}")
def delete_product_draft(
    product_id: UUID,
    row_version: int = Query(..., ge=1),
    user: dict = Depends(PermissionChecker("master", "delete")),
    db: Session = Depends(get_db),
):
    """Delete an unused draft through its canonical database command."""

    org_id = _activate(db, user)
    try:
        deleted = canonical_write_commands.delete_product_draft(
            db,
            org_id=org_id,
            product_id=product_id,
            expected_row_version=row_version,
        )
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        _raise_master_create_database_error(exc)
    return {
        "success": True,
        "product_id": deleted["product_id"],
        "product_code": deleted["product_code"],
        "product_name": deleted["product_name"],
        "message": "Product draft deleted",
    }


@router.get("/products/all-with-batches")
@router.get("/products/search-with-batches")
def products_with_batches(
    page: int = Query(1, ge=1), page_size: int = Query(100, ge=1, le=500),
    q: str = "", user: dict = MASTER_USER, db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    offset = (page - 1) * page_size
    rows = _rows(db, """
        SELECT product.id AS product_id, product.sku AS product_code,
               product.name AS product_name, product.generic_name, product.hsn_code,
               product.base_uom_code AS unit, product.product_kind AS product_type,
               conversion.id AS uom_conversion_id,
               tax_version.taxability,
               (CASE WHEN tax_version.taxability IS NULL THEN NULL
                     WHEN tax_version.taxability='taxable' THEN tax_version.igst_rate
                     ELSE 0 END)::text AS gst_percent,
               product.status='active' AS is_active,
               COALESCE(batch_data.batches, '[]'::jsonb) AS batches,
               COALESCE(batch_data.total_quantity_available, 0)::text AS total_quantity_available
          FROM catalog.products product
          JOIN core.organizations organization
            ON organization.id=product.org_id AND organization.status='active'
          LEFT JOIN LATERAL (
              SELECT id FROM catalog.uom_conversions
               WHERE org_id=product.org_id AND product_id=product.id
                 AND from_uom_code=product.base_uom_code
                 AND to_uom_code=product.base_uom_code
                 AND status='active'
                 AND valid_from<=(transaction_timestamp() AT TIME ZONE organization.timezone)::date
                 AND (valid_until IS NULL OR valid_until>=(transaction_timestamp() AT TIME ZONE organization.timezone)::date)
               ORDER BY valid_from DESC, id LIMIT 1
          ) conversion ON true
          LEFT JOIN LATERAL (
              SELECT taxability, igst_rate
                FROM tax.tax_code_versions
               WHERE code=product.hsn_code AND code_kind='hsn' AND status='active'
                 AND effective_from<=(transaction_timestamp() AT TIME ZONE organization.timezone)::date
                 AND (effective_to IS NULL OR effective_to>=(transaction_timestamp() AT TIME ZONE organization.timezone)::date)
               ORDER BY effective_from DESC, version_number DESC, id LIMIT 1
          ) tax_version ON true
          LEFT JOIN LATERAL (
              SELECT jsonb_agg(jsonb_build_object(
                         'batch_id', batch.id, 'product_id', batch.product_id,
                         'batch_number', batch.batch_number,
                         'manufacturing_date', batch.manufactured_on,
                         'expiry_date', batch.expires_on, 'mrp_per_unit', batch.mrp::text,
                         'sale_price_per_unit', NULL,
                         'cost_per_unit', stock.average_unit_cost::text,
                         'quantity_available', COALESCE(stock.quantity_available, 0)::text,
                         'location_id', stock.location_id,
                         'branch_id', stock.branch_id,
                         'uom_conversion_id', conversion.id,
                         'batch_status', batch.status
                     ) ORDER BY batch.expires_on NULLS LAST, batch.batch_number) AS batches,
                     COALESCE(SUM(stock.quantity_available), 0) AS total_quantity_available
                FROM inventory.batches batch
                LEFT JOIN LATERAL (
                    SELECT SUM(balance.on_hand_quantity) AS quantity_available,
                           MAX(balance.average_unit_cost) AS average_unit_cost,
                           CASE WHEN COUNT(DISTINCT balance.location_id)=1
                                THEN (array_agg(DISTINCT balance.location_id))[1] END AS location_id,
                           CASE WHEN COUNT(DISTINCT balance.branch_id)=1
                                THEN (array_agg(DISTINCT balance.branch_id))[1] END AS branch_id
                      FROM inventory.stock_balances balance
                     WHERE balance.org_id=batch.org_id AND balance.batch_id=batch.id
                ) stock ON true
               WHERE batch.org_id=product.org_id AND batch.product_id=product.id
                 AND batch.status IN ('released','blocked')
          ) batch_data ON true
         WHERE product.org_id=:org_id AND product.status IN ('active','blocked')
           AND (:search='' OR product.name ILIKE :pattern OR product.sku ILIKE :pattern)
         ORDER BY product.name, product.id LIMIT :limit OFFSET :offset
    """, {"org_id": org_id, "search": q.strip(), "pattern": f"%{q.strip()}%",
            "limit": page_size, "offset": offset})
    total = db.execute(text("""
        SELECT COUNT(*)
          FROM catalog.products product
         WHERE product.org_id=:org_id AND product.status IN ('active','blocked')
           AND (:search='' OR product.name ILIKE :pattern OR product.sku ILIKE :pattern)
    """), {
        "org_id": org_id,
        "search": q.strip(),
        "pattern": f"%{q.strip()}%",
    }).scalar_one()
    return {"products": rows, "pagination": {
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "total_items": total,
        "has_more": offset + len(rows) < total,
    }}


@router.get("/products/{product_id}/batches")
def product_batches(
    product_id: UUID,
    user: dict = INVENTORY_USER,
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT batch.id AS batch_id, batch.product_id, product.name AS product_name,
               batch.batch_number, batch.manufactured_on AS manufacturing_date,
               batch.expires_on AS expiry_date, batch.mrp::text AS mrp_per_unit,
               batch.mrp::text AS sale_price_per_unit,
               conversion.id AS uom_conversion_id,
               balance.location_id, balance.branch_id,
               location.name AS location_name, branch.name AS branch_name,
               balance.average_unit_cost::text AS cost_per_unit,
               balance.on_hand_quantity::text AS quantity_available,
               (batch.expires_on - business_clock.business_date)::integer AS days_to_expiry,
               CASE WHEN batch.status='released'
                          AND batch.released_at IS NOT NULL
                          AND batch.expires_on>business_clock.business_date
                    THEN dense_rank() OVER (
                           PARTITION BY batch.product_id, balance.location_id,
                             (batch.status='released' AND batch.released_at IS NOT NULL
                              AND batch.expires_on>business_clock.business_date)
                           ORDER BY batch.expires_on
                         )::integer
                    ELSE NULL END AS fefo_expiry_tier,
               false AS has_pending_sync,
               tax_version.taxability,
               (CASE WHEN tax_version.taxability IS NULL THEN NULL
                     WHEN tax_version.taxability='taxable' THEN tax_version.igst_rate
                     ELSE 0 END)::text AS gst_percent,
               batch.status AS batch_status
          FROM inventory.batches batch
          JOIN catalog.products product
            ON product.org_id=batch.org_id AND product.id=batch.product_id
          JOIN core.organizations organization
            ON organization.id=batch.org_id AND organization.status='active'
          CROSS JOIN LATERAL (
              SELECT (transaction_timestamp() AT TIME ZONE organization.timezone)::date
                       AS business_date
          ) business_clock
          JOIN inventory.stock_balances balance
            ON balance.org_id=batch.org_id AND balance.batch_id=batch.id
           AND balance.product_id=batch.product_id AND balance.on_hand_quantity>0
          JOIN inventory.locations location
            ON location.org_id=balance.org_id AND location.id=balance.location_id
           AND location.status='active' AND location.allows_sale
          JOIN core.branches branch
            ON branch.org_id=balance.org_id AND branch.id=balance.branch_id
           AND branch.status='active'
          LEFT JOIN LATERAL (
              SELECT id FROM catalog.uom_conversions
               WHERE org_id=product.org_id AND product_id=product.id
                 AND from_uom_code=product.base_uom_code
                 AND to_uom_code=product.base_uom_code
                 AND status='active' AND valid_from<=business_clock.business_date
                 AND (valid_until IS NULL OR valid_until>=business_clock.business_date)
               ORDER BY valid_from DESC, id LIMIT 1
          ) conversion ON true
          LEFT JOIN LATERAL (
              SELECT taxability, igst_rate
                FROM tax.tax_code_versions
               WHERE code=product.hsn_code AND code_kind='hsn' AND status='active'
                 AND effective_from<=business_clock.business_date
                 AND (effective_to IS NULL OR effective_to>=business_clock.business_date)
               ORDER BY effective_from DESC, version_number DESC, id LIMIT 1
          ) tax_version ON true
         WHERE batch.org_id=:org_id AND batch.product_id=:product_id
           AND batch.status IN ('released','blocked')
         ORDER BY batch.expires_on NULLS LAST, batch.batch_number, location.name
    """, {"org_id": org_id, "product_id": product_id})
    return {"batches": rows}


@router.post(
    "/customers/",
    status_code=status.HTTP_201_CREATED,
    operation_id="create_canonical_customer",
)
def create_customer(
    customer: CanonicalCustomerCreate,
    response: Response,
    idempotency_key: str = Header(
        ...,
        alias="X-Idempotency-Key",
        min_length=8,
        max_length=128,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$",
    ),
    user: dict = Depends(PermissionChecker("master", "create")),
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    try:
        account = _execute_canonical_customer_create(
            db, org_id, customer, idempotency_key
        )
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        _raise_master_create_database_error(exc)
    _set_master_idempotency_headers(
        response, idempotency_key, account["idempotency_replayed"]
    )
    return {
        "customer_id": account["customer_account_id"],
        "party_id": account["party_id"],
        "customer_code": account["customer_code"],
        "customer_name": customer.customer_name,
        "primary_phone": customer.primary_phone,
        "primary_email": customer.primary_email,
        "gst_number": customer.gst_number,
        "customer_type": customer.customer_type,
        "credit_limit": customer.credit_limit,
        "credit_days": customer.credit_days,
        "is_active": True,
        "status": "active",
        "idempotency_replayed": account["idempotency_replayed"],
        "message": "Customer created",
    }


@router.post(
    "/suppliers/",
    status_code=status.HTTP_201_CREATED,
    operation_id="create_canonical_supplier",
)
def create_supplier(
    supplier: CanonicalSupplierCreate,
    response: Response,
    idempotency_key: str = Header(
        ...,
        alias="X-Idempotency-Key",
        min_length=8,
        max_length=128,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$",
    ),
    user: dict = Depends(PermissionChecker("master", "create")),
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    try:
        account = _execute_canonical_supplier_create(
            db, org_id, supplier, idempotency_key
        )
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        _raise_master_create_database_error(exc)
    _set_master_idempotency_headers(
        response, idempotency_key, account["idempotency_replayed"]
    )
    return {
        "supplier_id": account["supplier_account_id"],
        "party_id": account["party_id"],
        "supplier_code": account["supplier_code"],
        "supplier_name": supplier.supplier_name,
        "primary_phone": supplier.primary_phone,
        "primary_email": supplier.primary_email,
        "gst_number": supplier.gst_number,
        "payment_days": supplier.payment_days,
        "is_active": True,
        "status": "active",
        "idempotency_replayed": account["idempotency_replayed"],
        "message": "Supplier created",
    }


_PARTY_CONTACTS = """
    LEFT JOIN LATERAL (
        SELECT phone, email FROM parties.contacts c
         WHERE c.org_id=account.org_id AND c.party_id=account.party_id AND c.status='active'
         ORDER BY c.is_primary DESC, c.id LIMIT 1
    ) contact ON true
    LEFT JOIN LATERAL (
        SELECT registration_number, status AS registration_status
          FROM parties.tax_registrations r
         WHERE r.org_id=account.org_id AND r.party_id=account.party_id
           AND r.registration_type='GSTIN' AND r.status='active'
         ORDER BY r.valid_from DESC NULLS LAST, r.id LIMIT 1
    ) registration ON true
"""


@router.get("/customers")
@router.get("/customers/")
def customers(limit: int = Query(100, ge=1, le=1000), skip: int = Query(0, ge=0),
              search: str = "", user: dict = MASTER_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _rows(db, f"""
        SELECT account.id AS customer_id, account.customer_code,
               party.legal_name AS customer_name, party.trade_name,
               contact.phone AS primary_phone, contact.email AS primary_email,
               registration.registration_number AS gst_number,
               registration.registration_status AS gst_verification_status,
               COALESCE(substring(registration.registration_number from 1 for 2),
                        address.state_code) AS place_of_supply_state_code,
               account.credit_limit, account.credit_days,
               COALESCE(outstanding.current_outstanding,0) AS current_outstanding,
               party.party_kind AS customer_type, account.status='active' AS is_active,
               account.status, account.created_at, account.updated_at
          FROM parties.customer_accounts account
          JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
          {_PARTY_CONTACTS}
          LEFT JOIN LATERAL (
              SELECT state_code FROM parties.addresses
               WHERE org_id=account.org_id AND party_id=account.party_id
                 AND status='active'
               ORDER BY is_primary DESC, id LIMIT 1
          ) address ON true
          LEFT JOIN LATERAL (
              SELECT SUM(GREATEST(item.principal_amount-COALESCE(applied.amount,0),0))
                         AS current_outstanding
                FROM finance.open_items item
                JOIN finance.accounting_events event
                  ON event.org_id=item.org_id AND event.id=item.accounting_event_id
                 AND event.sales_invoice_id IS NOT NULL
                JOIN sales.invoices invoice
                  ON invoice.org_id=event.org_id AND invoice.id=event.sales_invoice_id
                 AND invoice.customer_account_id=account.id AND invoice.status='posted'
                LEFT JOIN LATERAL (
                    SELECT SUM(allocation.amount) AS amount
                      FROM finance.allocations allocation
                     WHERE allocation.org_id=item.org_id
                       AND allocation.open_item_id=item.id
                       AND allocation.status='posted'
                       AND allocation.reversal_of_allocation_id IS NULL
                       AND NOT EXISTS (
                           SELECT 1 FROM finance.allocations reversal
                            WHERE reversal.org_id=allocation.org_id
                              AND reversal.reversal_of_allocation_id=allocation.id
                       )
                ) applied ON true
               WHERE item.org_id=account.org_id
                 AND item.item_side='receivable' AND item.status<>'reversed'
          ) outstanding ON true
         WHERE account.org_id=:org_id AND account.status IN ('active','on_hold')
           AND (:search='' OR party.legal_name ILIKE :pattern
                OR account.customer_code ILIKE :pattern OR COALESCE(contact.phone,'') ILIKE :pattern)
         ORDER BY party.legal_name, account.id LIMIT :limit OFFSET :skip
    """, {"org_id": org_id, "search": search.strip(), "pattern": f"%{search.strip()}%",
            "limit": limit, "skip": skip})
    total = db.execute(text(f"""
        SELECT COUNT(*)
          FROM parties.customer_accounts account
          JOIN parties.parties party
            ON party.org_id=account.org_id AND party.id=account.party_id
          {_PARTY_CONTACTS}
         WHERE account.org_id=:org_id AND account.status IN ('active','on_hold')
           AND (:search='' OR party.legal_name ILIKE :pattern
                OR account.customer_code ILIKE :pattern
                OR COALESCE(contact.phone,'') ILIKE :pattern)
    """), {
        "org_id": org_id,
        "search": search.strip(),
        "pattern": f"%{search.strip()}%",
    }).scalar_one()
    return {"customers": rows, "total": total, "skip": skip, "limit": limit}


@router.get("/customers/all-with-addresses")
def customers_with_addresses(
    page: int = Query(1, ge=1), page_size: int = Query(100, ge=1, le=500),
    user: dict = MASTER_USER, db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    rows = _rows(db, f"""
        SELECT account.id AS customer_id, account.customer_code,
               party.legal_name AS customer_name, party.trade_name,
               contact.phone AS primary_phone, contact.email AS primary_email,
               registration.registration_number AS gst_number,
               registration.registration_status AS gst_verification_status,
               COALESCE(substring(registration.registration_number from 1 for 2),
                        primary_address.state_code) AS place_of_supply_state_code,
               account.credit_limit, account.credit_days,
               account.status='active' AS is_active, account.updated_at,
               COALESCE(address_data.addresses, '[]'::jsonb) AS addresses
          FROM parties.customer_accounts account
          JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
          {_PARTY_CONTACTS}
          LEFT JOIN LATERAL (
              SELECT state_code FROM parties.addresses
               WHERE org_id=account.org_id AND party_id=account.party_id
                 AND status='active'
               ORDER BY is_primary DESC, id LIMIT 1
          ) primary_address ON true
          LEFT JOIN LATERAL (
              SELECT jsonb_agg(jsonb_build_object(
                         'address_id', address.id, 'address_type', address.address_kind,
                         'address_line1', address.line1, 'address_line2', address.line2,
                         'city', address.city, 'state', address.state_code,
                         'pincode', address.postal_code, 'is_primary', address.is_primary
                     ) ORDER BY address.is_primary DESC, address.id) AS addresses
                FROM parties.addresses address
               WHERE address.org_id=account.org_id AND address.party_id=account.party_id
                 AND address.status='active'
          ) address_data ON true
         WHERE account.org_id=:org_id AND account.status IN ('active','on_hold')
         ORDER BY party.legal_name, account.id LIMIT :limit OFFSET :offset
    """, {"org_id": org_id, "limit": page_size, "offset": (page - 1) * page_size})
    total = db.execute(text("""
        SELECT COUNT(*) FROM parties.customer_accounts
         WHERE org_id=:org_id AND status IN ('active','on_hold')
    """), {"org_id": org_id}).scalar_one()
    offset = (page - 1) * page_size
    return {"customers": rows, "pagination": {
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "total_items": total,
        "has_more": offset + len(rows) < total,
    }}


def _customer_party_id(db: Session, org_id: UUID, customer_id: UUID) -> UUID:
    party_id = db.execute(text("""
        SELECT party_id
          FROM parties.customer_accounts
         WHERE org_id=:org_id AND id=:customer_id
           AND status IN ('active','on_hold')
    """), {"org_id": org_id, "customer_id": customer_id}).scalar()
    if party_id is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return party_id


@router.get("/customers/{customer_id:uuid}/addresses")
@router.get("/customers/{customer_id:uuid}/addresses/")
def customer_addresses(
    customer_id: UUID,
    user: dict = MASTER_USER,
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    party_id = _customer_party_id(db, org_id, customer_id)
    rows = _rows(db, """
        SELECT address.id AS address_id, address.id,
               address.address_kind AS address_type,
               address.line1 AS address_line1, address.line2 AS address_line2,
               address.landmark, address.city, address.state_code,
               address.state_code AS state, address.postal_code AS pincode,
               address.country_code AS country_code,
               address.is_primary AS is_default, contact.phone AS mobile,
               address.row_version
          FROM parties.addresses address
          LEFT JOIN LATERAL (
              SELECT phone FROM parties.contacts
               WHERE org_id=address.org_id AND party_id=address.party_id
                 AND status='active'
               ORDER BY is_primary DESC, id LIMIT 1
          ) contact ON true
         WHERE address.org_id=:org_id AND address.party_id=:party_id
           AND address.status='active'
         ORDER BY address.is_primary DESC, address.address_kind, address.id
    """, {"org_id": org_id, "party_id": party_id})
    return {"success": True, "data": rows, "customer_id": customer_id,
            "total_addresses": len(rows)}


@router.post(
    "/customers/{customer_id:uuid}/addresses/",
    status_code=status.HTTP_201_CREATED,
    operation_id="create_canonical_customer_address",
)
def create_customer_address(
    customer_id: UUID,
    address: CanonicalCustomerAddressWrite,
    user: dict = Depends(PermissionChecker("master", "create")),
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    party_id = _customer_party_id(db, org_id, customer_id)
    state_code = _validated_state_code(address.state_code, None)
    try:
        created = canonical_write_commands.create_party_address(
            db,
            org_id=org_id,
            party_id=party_id,
            address_kind=address.address_type,
            line1=address.address_line1,
            line2=address.address_line2,
            landmark=address.landmark,
            city=address.city,
            state_code=state_code,
            postal_code=address.pincode,
            make_primary=address.is_default,
        )
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        _raise_master_create_database_error(exc)
    return {
        "success": True,
        "address_id": created["address_id"],
        "row_version": created["row_version"],
        "idempotency_replayed": created["idempotency_replayed"],
        "customer_id": customer_id,
        "message": "Address created",
    }


@router.put(
    "/customers/{customer_id:uuid}/addresses/{address_id:uuid}",
    operation_id="update_canonical_customer_address",
)
def update_customer_address(
    customer_id: UUID,
    address_id: UUID,
    address: CanonicalCustomerAddressWrite,
    user: dict = Depends(PermissionChecker("master", "edit")),
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    party_id = _customer_party_id(db, org_id, customer_id)
    state_code = _validated_state_code(address.state_code, None)
    if address.row_version is None:
        raise HTTPException(
            status_code=422,
            detail="Canonical address row_version is required for an update",
        )
    try:
        updated = canonical_write_commands.update_party_address(
            db,
            org_id=org_id,
            party_id=party_id,
            address_id=address_id,
            expected_row_version=address.row_version,
            address_kind=address.address_type,
            line1=address.address_line1,
            line2=address.address_line2,
            landmark=address.landmark,
            city=address.city,
            state_code=state_code,
            postal_code=address.pincode,
            make_primary=address.is_default,
        )
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        _raise_master_create_database_error(exc)
    return {"success": True, "address_id": updated["address_id"],
            "row_version": updated["row_version"], "message": "Address updated"}


@router.get("/suppliers")
@router.get("/suppliers/")
def suppliers(limit: int = Query(100, ge=1, le=1000), skip: int = Query(0, ge=0),
              search: str = "", user: dict = MASTER_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    return _rows(db, f"""
        SELECT account.id AS supplier_id, account.supplier_code,
               party.legal_name AS supplier_name, party.trade_name,
               contact.phone AS primary_phone, contact.email AS primary_email,
               registration.registration_number AS gst_number,
               registration.registration_status AS gst_verification_status,
               account.payment_days,
               COALESCE(outstanding.current_outstanding,0) AS current_outstanding,
               party.party_kind AS supplier_type, account.status='active' AS is_active,
               account.status, account.created_at, account.updated_at
          FROM parties.supplier_accounts account
          JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
          {_PARTY_CONTACTS}
          LEFT JOIN LATERAL (
              SELECT SUM(GREATEST(item.principal_amount-COALESCE(applied.amount,0),0))
                         AS current_outstanding
                FROM finance.open_items item
                JOIN finance.accounting_events event
                  ON event.org_id=item.org_id AND event.id=item.accounting_event_id
                 AND event.supplier_invoice_id IS NOT NULL
                JOIN procurement.supplier_invoices invoice
                  ON invoice.org_id=event.org_id AND invoice.id=event.supplier_invoice_id
                 AND invoice.supplier_account_id=account.id AND invoice.status='posted'
                LEFT JOIN LATERAL (
                    SELECT SUM(allocation.amount) AS amount
                      FROM finance.allocations allocation
                     WHERE allocation.org_id=item.org_id
                       AND allocation.open_item_id=item.id
                       AND allocation.status='posted'
                       AND allocation.reversal_of_allocation_id IS NULL
                       AND NOT EXISTS (
                           SELECT 1 FROM finance.allocations reversal
                            WHERE reversal.org_id=allocation.org_id
                              AND reversal.reversal_of_allocation_id=allocation.id
                       )
                ) applied ON true
               WHERE item.org_id=account.org_id
                 AND item.item_side='payable' AND item.status<>'reversed'
          ) outstanding ON true
         WHERE account.org_id=:org_id AND account.status IN ('active','on_hold')
           AND (:search='' OR party.legal_name ILIKE :pattern
                OR account.supplier_code ILIKE :pattern OR COALESCE(contact.phone,'') ILIKE :pattern)
         ORDER BY party.legal_name, account.id LIMIT :limit OFFSET :skip
    """, {"org_id": org_id, "search": search.strip(), "pattern": f"%{search.strip()}%",
            "limit": limit, "skip": skip})


@router.get("/employees")
@router.get("/employees/")
def employees(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    search: str = "",
    include_inactive: bool = False,
    user: dict = MASTER_USER,
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT employee.id AS employee_id, employee.employee_number AS employee_code,
               employee.display_name AS employee_name, employee.legal_name AS full_name,
               employee.job_title AS designation, employee.work_email AS personal_email,
               employee.work_phone AS personal_mobile, employee.branch_id, branch.name AS branch_name,
               employee.department_id, department.name AS department_name,
               employee.employment_start_date AS date_of_joining,
               employee.status AS employment_status, employee.status='active' AS is_active,
               employee.created_at, employee.updated_at
          FROM hr.employees employee
          LEFT JOIN core.branches branch ON branch.org_id=employee.org_id AND branch.id=employee.branch_id
          LEFT JOIN hr.departments department ON department.org_id=employee.org_id AND department.id=employee.department_id
         WHERE employee.org_id=:org_id
           AND (:include_inactive OR employee.status='active')
           AND (:search='' OR employee.display_name ILIKE :pattern OR employee.employee_number ILIKE :pattern)
         ORDER BY employee.display_name, employee.id LIMIT :limit OFFSET :offset
    """, {"org_id": org_id, "search": search.strip(), "pattern": f"%{search.strip()}%",
            "include_inactive": include_inactive, "limit": limit, "offset": offset})
    total = db.execute(text("""
        SELECT COUNT(*) FROM hr.employees employee
         WHERE employee.org_id=:org_id
           AND (:include_inactive OR employee.status='active')
           AND (:search='' OR employee.display_name ILIKE :pattern
                OR employee.employee_number ILIKE :pattern)
    """), {
        "org_id": org_id,
        "include_inactive": include_inactive,
        "search": search.strip(),
        "pattern": f"%{search.strip()}%",
    }).scalar_one()
    return {"employees": rows, "total": total, "offset": offset, "limit": limit}


@router.get("/branches")
@router.get("/branches/")
def branches(user: dict = MASTER_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT id AS branch_id, code AS branch_code, name AS branch_name,
               address_line1, address_line2, city, state_code, postal_code AS pincode,
               phone, email, status='active' AS is_active, status
          FROM core.branches
         WHERE org_id=:org_id AND status='active'
         ORDER BY name, id
    """, {"org_id": org_id})
    return {"branches": rows, "total": len(rows)}


class CanonicalBankAccountRead(BaseModel):
    """Non-secret bank identity backed by the settlement ledger."""

    model_config = ConfigDict(extra="forbid")

    bank_account_id: UUID
    settlement_account_id: UUID
    settlement_account_code: str
    settlement_account_name: str
    bank_name: str
    account_holder_name: str
    ifsc: str
    currency_code: Literal["INR"]
    allows_bank_reconciliation: bool
    status: Literal["active"]


class CanonicalBankAccountList(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bank_accounts: list[CanonicalBankAccountRead]
    total: int = Field(ge=0)


@router.get("/bank-accounts", response_model=CanonicalBankAccountList)
@router.get("/bank-accounts/", response_model=CanonicalBankAccountList)
def canonical_bank_accounts(
    user: dict = FINANCE_USER,
    db: Session = Depends(get_db),
) -> CanonicalBankAccountList:
    """Return only active INR bank accounts with an active settlement ledger.

    Account numbers are encrypted canonical data and are deliberately absent
    from this projection.  A missing ledger association excludes the account;
    it is never replaced by an arbitrary account or a fabricated balance.
    """

    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT bank.id AS bank_account_id,
               settlement.id AS settlement_account_id,
               settlement.code AS settlement_account_code,
               settlement.name AS settlement_account_name,
               bank.bank_name,
               bank.account_holder_name,
               bank.ifsc,
               bank.currency_code,
               settlement.allows_bank_reconciliation,
               bank.status
          FROM finance.bank_accounts bank
          JOIN finance.accounts settlement
            ON settlement.org_id=bank.org_id
           AND settlement.id=bank.account_id
           AND settlement.status='active'
           AND settlement.account_type='asset'
           AND settlement.currency_code='INR'
         WHERE bank.org_id=:org_id
           AND bank.status='active'
           AND bank.currency_code='INR'
         ORDER BY bank.bank_name, bank.account_holder_name, bank.id
    """, {"org_id": org_id})
    return CanonicalBankAccountList(bank_accounts=rows, total=len(rows))


@router.get("/warehouses")
@router.get("/warehouses/")
def warehouses(user: dict = MASTER_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    return _rows(db, """
        SELECT location.id AS warehouse_id, location.code AS warehouse_code,
               location.name AS warehouse_name, location.location_type AS warehouse_type,
               location.branch_id, branch.name AS branch_name,
               location.allows_sale, location.allows_negative_stock,
               location.status='active' AS is_active, location.status
          FROM inventory.locations location
          JOIN core.branches branch ON branch.org_id=location.org_id AND branch.id=location.branch_id
         WHERE location.org_id=:org_id ORDER BY branch.name, location.name
    """, {"org_id": org_id})


@router.get("/units")
@router.get("/units/")
def units(user: dict = MASTER_USER, db: Session = Depends(get_db)):
    _activate(db, user)
    return _rows(db, """
        SELECT code AS unit_id, code AS unit_code, name AS unit_name, symbol,
               dimension AS unit_type, decimal_places, status='active' AS is_active, status
          FROM catalog.units_of_measure WHERE status='active' ORDER BY name, code
    """, {})


@router.get("/settings/company-info")
@router.get("/company/info")
@router.get("/company/profile")
def company_profile(user: dict = MASTER_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _rows(db, """
        WITH business_clock AS MATERIALIZED (
            SELECT erp_core_commands.current_organization_business_date()
                     AS business_date
        )
        SELECT organization.id AS org_id, organization.legal_name AS org_name,
               organization.legal_name, organization.trade_name, organization.pan AS pan_number,
               organization.cin AS cin_number,
               concat_ws(', ', organization.registered_address_line1,
                         organization.registered_address_line2) AS registered_address,
               organization.registered_city AS city,
               organization.registered_state_code AS state_code,
               organization.registered_state_code AS state,
               organization.registered_postal_code AS pincode,
               registration.gstin AS gst_number,
               ARRAY[branch.phone] AS contact_numbers,
               ARRAY[branch.email] AS email_addresses,
               COALESCE(license.licenses, '[]'::jsonb) AS licenses,
               COALESCE(bank.accounts, '[]'::jsonb) AS bank_accounts,
               organization.status, organization.updated_at
          FROM core.organizations organization
          CROSS JOIN business_clock
          LEFT JOIN LATERAL (
              SELECT gstin FROM tax.registrations
               WHERE org_id=organization.id AND status='active'
               ORDER BY effective_from DESC, id LIMIT 1
          ) registration ON true
          LEFT JOIN LATERAL (
              SELECT phone, email FROM core.branches
               WHERE org_id=organization.id AND status='active'
               ORDER BY code, id LIMIT 1
          ) branch ON true
          LEFT JOIN LATERAL (
              SELECT jsonb_agg(jsonb_build_object(
                         'id', id,
                         'license_type_code', license_type_code,
                         'license_number', license_number,
                         'valid_from', valid_from,
                         'valid_until', valid_until
                     ) ORDER BY license_type_code, id) AS licenses
                FROM compliance.licenses
               WHERE org_id=organization.id
                 AND organization_subject_id=organization.id
                 AND license_type_code IN (
                     'drug_wholesale_form_20b', 'drug_wholesale_form_21b'
                 )
                 AND status='active' AND valid_from<=business_clock.business_date
                 AND (valid_until IS NULL OR valid_until>=business_clock.business_date)
          ) license ON true
          LEFT JOIN LATERAL (
              SELECT jsonb_agg(jsonb_build_object(
                         'id', bank_account.id,
                         'bank_name', bank_account.bank_name,
                         'account_name', COALESCE(
                             bank_account.account_holder_name, ledger_account.name
                         ),
                         'ifsc_code', bank_account.ifsc,
                         'currency_code', bank_account.currency_code,
                         'allows_bank_reconciliation',
                             ledger_account.allows_bank_reconciliation
                     ) ORDER BY bank_account.bank_name, bank_account.id) AS accounts
                FROM finance.bank_accounts bank_account
                JOIN finance.accounts ledger_account
                  ON ledger_account.org_id=bank_account.org_id
                 AND ledger_account.id=bank_account.account_id
               WHERE bank_account.org_id=organization.id
                 AND bank_account.status='active'
                 AND ledger_account.status='active'
          ) bank ON true
         WHERE organization.id=:org_id AND organization.status='active'
    """, {"org_id": org_id})
    data = rows[0] if rows else None
    return {"success": data is not None, "data": data}


def _setting_rows(db: Session, org_id: UUID, namespaces: tuple[str, ...]) -> list[dict]:
    return _rows(db, """
        SELECT namespace, key, value_type, value_text, value_numeric,
               value_boolean, value_date, value_timestamptz
          FROM core.settings
         WHERE org_id=:org_id AND status='active' AND namespace=ANY(:namespaces)
         ORDER BY namespace, key
    """, {"org_id": org_id, "namespaces": list(namespaces)})


def _settings_object(rows: list[dict]) -> dict:
    result: dict[str, Any] = {}
    for row in rows:
        value = row.get(f"value_{row['value_type']}")
        result[row["key"]] = value
    return result


@router.get("/settings/features")
def feature_settings(user: dict = MASTER_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    return {"features": _settings_object(_setting_rows(
        db, org_id, ("features", "feature_flags", "erp.features")
    ))}


@router.get("/settings/system")
def system_settings(user: dict = MASTER_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    return _settings_object(_setting_rows(db, org_id, ("system", "erp.system")))


@router.get("/settings/integrations")
def integration_settings(user: dict = MASTER_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _setting_rows(db, org_id, ("integrations", "erp.integrations"))
    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        integration_id, _, field = row["key"].partition(".")
        item = grouped.setdefault(integration_id, {"id": integration_id,
            "name": integration_id.replace("_", " ").title(), "description": "",
            "enabled": False, "status": "inactive", "config": {}})
        value = _settings_object([row])[row["key"]]
        if field in {"enabled", "status", "name", "description"}:
            item[field] = value
        else:
            item["config"][field or row["key"]] = value
    return list(grouped.values())


@router.get("/taxes")
def tax_codes(user: dict = MASTER_USER, db: Session = Depends(get_db)):
    _activate(db, user)
    return _rows(db, """
        WITH business_clock AS MATERIALIZED (
            SELECT erp_core_commands.current_organization_business_date()
                     AS business_date
        )
        SELECT id AS tax_id, code AS tax_code, description AS tax_name,
               cgst_rate, sgst_rate, igst_rate, cess_rate,
               GREATEST(cgst_rate+sgst_rate, igst_rate)+cess_rate AS total_rate,
               taxability, effective_from, effective_to,
               status='active' AS is_active, status
          FROM tax.tax_code_versions
          CROSS JOIN business_clock
         WHERE status='active' AND effective_from<=business_clock.business_date
           AND (effective_to IS NULL OR effective_to>=business_clock.business_date)
         ORDER BY code, version_number DESC
    """, {})


class CanonicalReportPeriod(BaseModel):
    start: date
    end: date


class CanonicalTaxAmounts(BaseModel):
    cgst: MoneyJSON
    sgst: MoneyJSON
    igst: MoneyJSON
    cess: MoneyJSON
    total: MoneyJSON


class CanonicalGSTR1B2BRow(BaseModel):
    supply_class: str
    gst_number: str
    name: str
    invoices: int
    taxableValue: MoneyJSON
    cgst: MoneyJSON
    sgst: MoneyJSON
    igst: MoneyJSON
    cess: MoneyJSON
    totalTax: MoneyJSON


class CanonicalGSTR1B2CBucket(BaseModel):
    count: int
    taxableValue: MoneyJSON
    cgst: MoneyJSON
    sgst: MoneyJSON
    igst: MoneyJSON
    cess: MoneyJSON
    totalTax: MoneyJSON


class CanonicalGSTR1Summary(BaseModel):
    totalInvoices: int
    totalTaxableValue: MoneyJSON
    totalCGST: MoneyJSON
    totalSGST: MoneyJSON
    totalIGST: MoneyJSON
    totalCess: MoneyJSON
    totalTax: MoneyJSON
    creditAdjustment: MoneyJSON
    debitAdjustment: MoneyJSON
    netAdjustment: MoneyJSON


class CanonicalGSTR1Response(BaseModel):
    period: CanonicalReportPeriod
    b2b: list[CanonicalGSTR1B2BRow]
    b2c: dict[str, CanonicalGSTR1B2CBucket]
    notes: list[dict[str, Any]]
    summary: CanonicalGSTR1Summary


class CanonicalGSTR3BResponse(BaseModel):
    period: CanonicalReportPeriod
    outputTax: CanonicalTaxAmounts
    inputCredit: CanonicalTaxAmounts
    inputCreditReversed: CanonicalTaxAmounts
    payable: CanonicalTaxAmounts
    netPayable: MoneyJSON


def _ensure_gstr1_rule_coverage(
    db: Session, org_id: UUID, date_from: date, date_to: date,
) -> None:
    """Require one reviewed B2CL rule for every posted invoice date."""
    registry = _rows(db, "SELECT to_regclass('tax.gstr1_reporting_rule_versions') AS relation", {})
    if not registry or registry[0].get("relation") is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Versioned GSTR-1 reporting rules are not installed",
        )
    coverage = _rows(db, """
        SELECT COUNT(*) FILTER (WHERE candidate.rule_count<>1) AS invalid_dates
          FROM (
              SELECT invoice.invoice_date, COUNT(release.id) AS rule_count
                FROM sales.invoices invoice
                LEFT JOIN tax.gstr1_reporting_rule_versions rule
                  ON rule.effective_from<=invoice.invoice_date
                 AND (rule.effective_to IS NULL OR rule.effective_to>=invoice.invoice_date)
                 AND rule.status='active'
                LEFT JOIN core.reference_data_releases release
                  ON release.id=rule.release_id
                 AND release.dataset_kind='gst_reporting_rules'
                 AND release.status='active'
               WHERE invoice.org_id=:org_id AND invoice.status='posted'
                 AND invoice.invoice_date BETWEEN :date_from AND :date_to
               GROUP BY invoice.invoice_date
          ) candidate
    """, {"org_id": org_id, "date_from": date_from, "date_to": date_to})
    if coverage and int(coverage[0].get("invalid_dates") or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Exactly one reviewed GSTR-1 reporting rule must cover every invoice date",
        )


@router.get("/gst/settings")
def canonical_gst_settings(
    user: dict = Depends(PermissionChecker("gst", "view")),
    db: Session = Depends(get_db),
):
    """Return the one effective organization GST registration, if published."""
    org_id = _activate(db, user)
    rows = _rows(db, """
        WITH business_clock AS MATERIALIZED (
            SELECT erp_core_commands.current_organization_business_date()
                     AS business_date
        )
        SELECT id, branch_id, gstin, legal_name, trade_name, state_code,
               registration_type, business_vertical_code, effective_from,
               effective_to, status, row_version
          FROM tax.registrations
          CROSS JOIN business_clock
         WHERE org_id=:org_id AND status='active'
           AND effective_from<=business_clock.business_date
           AND (effective_to IS NULL OR effective_to>=business_clock.business_date)
         ORDER BY effective_from DESC, id
         LIMIT 2
    """, {"org_id": org_id})
    if len(rows) > 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Canonical GST registration is ambiguous",
        )
    return rows[0] if rows else None


@router.get("/gst/dashboard")
def gst_dashboard(
    period: Literal["current", "previous", "quarter", "year"] = Query("current"),
    user: dict = Depends(PermissionChecker("gst", "view")),
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    rows = _rows(db, """
        WITH business_clock AS MATERIALIZED (
            SELECT erp_core_commands.current_organization_business_date()
                     AS business_date
        ), period_bounds AS (
            SELECT CASE :period
                     WHEN 'previous' THEN (date_trunc('month', business_date)-interval '1 month')::date
                     WHEN 'quarter' THEN date_trunc('quarter', business_date)::date
                     WHEN 'year' THEN date_trunc('year', business_date)::date
                     ELSE date_trunc('month', business_date)::date
                   END AS date_from,
                   CASE :period
                     WHEN 'previous' THEN (date_trunc('month', business_date)-interval '1 day')::date
                     ELSE business_date
                   END AS date_to
              FROM business_clock
        )
        SELECT period.date_from, period.date_to,
               COALESCE(sales.total,0) AS output_tax,
               COALESCE(purchases.total,0) AS input_credit,
               COALESCE(sales.total,0)-COALESCE(purchases.total,0) AS net_payable,
               COALESCE(sales.invoice_count,0) AS total_invoices,
               COALESCE(purchases.supplier_count,0) AS total_suppliers,
               COALESCE(purchases.invoice_count,0) AS total_supplier_invoices,
               COALESCE(sales.cgst,0) AS cgst_amount,
               COALESCE(sales.sgst,0) AS sgst_amount,
               COALESCE(sales.igst,0) AS igst_amount,
               COALESCE(purchases.cgst,0) AS purchase_cgst_amount,
               COALESCE(purchases.sgst,0) AS purchase_sgst_amount,
               COALESCE(purchases.igst,0) AS purchase_igst_amount,
               COALESCE(purchase_adjustments.unsupported_count,0) AS unsupported_input_adjustments
          FROM period_bounds period
          CROSS JOIN LATERAL (
                SELECT SUM(CASE WHEN tax_document.document_effect='decrease' THEN -1 ELSE 1 END *
                           (tax_document.cgst_amount+tax_document.sgst_amount+
                            tax_document.igst_amount+tax_document.cess_amount)) total,
                       SUM(CASE WHEN tax_document.document_effect='decrease' THEN -tax_document.cgst_amount ELSE tax_document.cgst_amount END) cgst,
                       SUM(CASE WHEN tax_document.document_effect='decrease' THEN -tax_document.sgst_amount ELSE tax_document.sgst_amount END) sgst,
                       SUM(CASE WHEN tax_document.document_effect='decrease' THEN -tax_document.igst_amount ELSE tax_document.igst_amount END) igst,
                       count(DISTINCT tax_document.sales_invoice_id)
                         FILTER (WHERE tax_document.document_class='sales_invoice') invoice_count
                  FROM tax.documents tax_document
                 WHERE tax_document.org_id=:org_id
                   AND tax_document.direction='outward'
                   AND tax_document.document_class IN ('sales_invoice','adjustment_note')
                   AND tax_document.document_effect IN ('original','increase','decrease')
                   AND tax_document.document_date BETWEEN period.date_from AND period.date_to
          ) sales
          CROSS JOIN LATERAL (
                SELECT SUM(line.cgst_amount+line.sgst_amount+line.igst_amount+line.cess_amount) total,
                       SUM(line.cgst_amount) cgst, SUM(line.sgst_amount) sgst,
                       SUM(line.igst_amount) igst,
                       count(DISTINCT invoice.id) invoice_count,
                       count(DISTINCT invoice.supplier_account_id) supplier_count
                  FROM procurement.supplier_invoices invoice
                  JOIN procurement.supplier_invoice_lines line
                    ON line.org_id=invoice.org_id
                   AND line.supplier_invoice_id=invoice.id
                   AND line.itc_eligibility='eligible'
                 WHERE invoice.org_id=:org_id AND invoice.status='posted'
                   AND EXISTS (
                       SELECT 1 FROM tax.documents tax_document
                        WHERE tax_document.org_id=invoice.org_id
                          AND tax_document.supplier_invoice_id=invoice.id
                          AND tax_document.document_class='supplier_invoice'
                          AND tax_document.document_effect='original'
                   )
                   AND EXISTS (
                       SELECT 1
                         FROM erp_automation_reads.supplier_invoice_portal_provenance(
                              invoice.org_id, invoice.id
                         ) command
                         JOIN tax.portal_document_lines portal_line
                           ON portal_line.org_id=invoice.org_id
                          AND portal_line.id=command.portal_document_line_id
                          AND portal_line.document_type='invoice'
                         JOIN tax.portal_documents portal_document
                           ON portal_document.org_id=portal_line.org_id
                          AND portal_document.id=portal_line.portal_document_id
                          AND portal_document.portal_document_type='gstr2b'
                          AND portal_document.status='parsed'
                          AND portal_document.parsed_at IS NOT NULL
                         JOIN tax.return_periods return_period
                           ON return_period.org_id=portal_document.org_id
                          AND return_period.id=portal_document.return_period_id
                          AND return_period.registration_id=portal_document.registration_id
                        WHERE return_period.period_start>=period.date_from
                          AND return_period.period_end<=period.date_to
                   )
          ) purchases
          CROSS JOIN LATERAL (
                SELECT count(DISTINCT note.id) AS unsupported_count
                  FROM finance.adjustment_notes note
                  JOIN finance.adjustment_note_lines line
                    ON line.org_id=note.org_id
                   AND line.adjustment_note_id=note.id
                   AND line.itc_eligibility='eligible'
                  JOIN tax.portal_document_lines portal_line
                    ON portal_line.org_id=note.org_id
                   AND portal_line.id=note.counterparty_portal_document_line_id
                  JOIN tax.portal_documents portal_document
                    ON portal_document.org_id=portal_line.org_id
                   AND portal_document.id=portal_line.portal_document_id
                   AND portal_document.portal_document_type='gstr2b'
                   AND portal_document.status='parsed'
                   AND portal_document.parsed_at IS NOT NULL
                  JOIN tax.return_periods return_period
                    ON return_period.org_id=portal_document.org_id
                   AND return_period.id=portal_document.return_period_id
                   AND return_period.registration_id=portal_document.registration_id
                 WHERE note.org_id=:org_id AND note.status='posted'
                   AND note.side='purchase' AND note.gst_tax_treatment='statutory'
                   AND return_period.period_start>=period.date_from
                   AND return_period.period_end<=period.date_to
                   AND EXISTS (
                       SELECT 1 FROM tax.documents tax_document
                        WHERE tax_document.org_id=note.org_id
                          AND tax_document.adjustment_note_id=note.id
                          AND tax_document.document_class='adjustment_note'
                   )
          ) purchase_adjustments
    """, {"org_id": org_id, "period": period})
    summary = rows[0] if rows else {}
    period_start = summary.pop("date_from", None)
    period_end = summary.pop("date_to", None)
    output_tax = money_json(summary.pop("output_tax", 0))
    input_credit = money_json(summary.pop("input_credit", 0))
    net_payable = money_json(summary.pop("net_payable", 0))
    if int(summary.pop("unsupported_input_adjustments", 0) or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Eligible purchase adjustments require canonical GSTR-2B ITC projection",
        )
    summary = _money_fields(summary, (
        "cgst_amount", "sgst_amount", "igst_amount",
        "purchase_cgst_amount", "purchase_sgst_amount", "purchase_igst_amount",
    ))
    return {
        "period": {"key": period, "start": period_start, "end": period_end},
        "outputTax": output_tax,
        "inputCredit": input_credit,
        "netPayable": net_payable,
        "summary": summary,
    }


@router.get("/gst/reports/gstr1", response_model=CanonicalGSTR1Response)
def canonical_gstr1_report(
    date_from: date = Query(...),
    date_to: date = Query(...),
    user: dict = Depends(PermissionChecker("gst", "view")),
    db: Session = Depends(get_db),
):
    """Authoritative outward-supply projection; the browser performs no tax math."""
    org_id = _activate(db, user)
    params = {"org_id": org_id, **_validated_report_range(date_from, date_to)}
    _ensure_gstr1_rule_coverage(db, org_id, date_from, date_to)
    invoice_rows = _rows(db, """
        SELECT CASE WHEN COALESCE(invoice.buyer_gstin_snapshot,'')<>''
                    THEN 'b2b'
                    WHEN invoice.supply_type='inter_state'
                     AND invoice.grand_total>reporting_rule.b2cl_threshold_amount
                    THEN 'b2c_large'
                    ELSE 'b2c_small' END AS supply_class,
               COALESCE(invoice.buyer_gstin_snapshot,'') AS gst_number,
               invoice.buyer_legal_name_snapshot AS name,
               COUNT(DISTINCT invoice.id) AS invoices,
               COALESCE(SUM(tax_document.gst_taxable_value),0) AS taxable_value,
               COALESCE(SUM(tax_document.cgst_amount),0) AS cgst,
               COALESCE(SUM(tax_document.sgst_amount),0) AS sgst,
               COALESCE(SUM(tax_document.igst_amount),0) AS igst,
               COALESCE(SUM(tax_document.cess_amount),0) AS cess
          FROM tax.documents tax_document
          JOIN sales.invoices invoice
            ON invoice.org_id=tax_document.org_id
           AND invoice.id=tax_document.sales_invoice_id
           AND invoice.status='posted'
          JOIN LATERAL (
              SELECT rule.b2cl_threshold_amount
                FROM tax.gstr1_reporting_rule_versions rule
                JOIN core.reference_data_releases release ON release.id=rule.release_id
               WHERE release.dataset_kind='gst_reporting_rules'
                 AND release.status='active'
                 AND rule.status='active'
                 AND rule.effective_from<=invoice.invoice_date
                 AND (rule.effective_to IS NULL OR rule.effective_to>=invoice.invoice_date)
          ) reporting_rule ON true
         WHERE invoice.org_id=:org_id AND invoice.status='posted'
           AND tax_document.document_class='sales_invoice'
           AND tax_document.document_effect='original'
           AND invoice.invoice_date BETWEEN :date_from AND :date_to
         GROUP BY supply_class, invoice.buyer_gstin_snapshot,
                  invoice.buyer_legal_name_snapshot
         ORDER BY supply_class, gst_number, name
    """, params)
    note_rows = _rows(db, """
        SELECT note.id AS note_id, note.note_number, note.note_date,
               note.direction, note.party_id, party.legal_name AS party_name,
               note.gst_taxable_value AS taxable_amount,
               note.cgst_amount, note.sgst_amount, note.igst_amount,
               COALESCE(note.cess_amount,0) AS cess_amount
          FROM finance.adjustment_notes note
          JOIN parties.parties party
            ON party.org_id=note.org_id AND party.id=note.party_id
         WHERE note.org_id=:org_id AND note.status='posted' AND note.side='sales'
           AND note.note_date BETWEEN :date_from AND :date_to
         ORDER BY note.note_date, note.id
    """, params)

    def report_row(row: Dict[str, Any]) -> Dict[str, Any]:
        projected = _money_fields(row, ("taxable_value", "cgst", "sgst", "igst", "cess"))
        projected["taxableValue"] = projected.pop("taxable_value")
        projected["totalTax"] = money_json(sum(
            (Decimal(str(row.get(field) or 0)) for field in ("cgst", "sgst", "igst", "cess")),
            Decimal("0"),
        ))
        return projected

    b2b = [report_row(row) for row in invoice_rows if row["supply_class"] == "b2b"]
    b2c_source = {
        "small": [row for row in invoice_rows if row["supply_class"] == "b2c_small"],
        "large": [row for row in invoice_rows if row["supply_class"] == "b2c_large"],
    }

    def b2c_bucket(rows: list[dict]) -> Dict[str, Any]:
        return {
            "count": sum(int(row.get("invoices") or 0) for row in rows),
            "taxableValue": money_json(sum((Decimal(str(row.get("taxable_value") or 0)) for row in rows), Decimal("0"))),
            "cgst": money_json(sum((Decimal(str(row.get("cgst") or 0)) for row in rows), Decimal("0"))),
            "sgst": money_json(sum((Decimal(str(row.get("sgst") or 0)) for row in rows), Decimal("0"))),
            "igst": money_json(sum((Decimal(str(row.get("igst") or 0)) for row in rows), Decimal("0"))),
            "cess": money_json(sum((Decimal(str(row.get("cess") or 0)) for row in rows), Decimal("0"))),
            "totalTax": money_json(sum((
                Decimal(str(row.get(field) or 0))
                for row in rows for field in ("cgst", "sgst", "igst", "cess")
            ), Decimal("0"))),
        }

    invoice_count = sum(int(row.get("invoices") or 0) for row in invoice_rows)
    invoice_taxable = sum((Decimal(str(row.get("taxable_value") or 0)) for row in invoice_rows), Decimal("0"))
    tax_components = {
        field: sum((Decimal(str(row.get(field) or 0)) for row in invoice_rows), Decimal("0"))
        for field in ("cgst", "sgst", "igst", "cess")
    }
    credit_tax = sum((
        sum((Decimal(str(row.get(field) or 0)) for field in ("cgst_amount", "sgst_amount", "igst_amount", "cess_amount")), Decimal("0"))
        for row in note_rows if row["direction"] == "credit"
    ), Decimal("0"))
    debit_tax = sum((
        sum((Decimal(str(row.get(field) or 0)) for field in ("cgst_amount", "sgst_amount", "igst_amount", "cess_amount")), Decimal("0"))
        for row in note_rows if row["direction"] == "debit"
    ), Decimal("0"))
    notes = [_money_fields(row, (
        "taxable_amount", "cgst_amount", "sgst_amount", "igst_amount", "cess_amount",
    )) for row in note_rows]
    total_tax = sum(tax_components.values(), Decimal("0")) + debit_tax - credit_tax
    return {
        "period": {"start": date_from, "end": date_to},
        "b2b": b2b,
        "b2c": {key: b2c_bucket(rows) for key, rows in b2c_source.items()},
        "notes": notes,
        "summary": {
            "totalInvoices": invoice_count,
            "totalTaxableValue": money_json(invoice_taxable),
            "totalCGST": money_json(tax_components["cgst"]),
            "totalSGST": money_json(tax_components["sgst"]),
            "totalIGST": money_json(tax_components["igst"]),
            "totalCess": money_json(tax_components["cess"]),
            "totalTax": money_json(total_tax),
            "creditAdjustment": money_json(credit_tax),
            "debitAdjustment": money_json(debit_tax),
            "netAdjustment": money_json(debit_tax-credit_tax),
        },
    }


@router.get("/gst/reports/gstr3b", response_model=CanonicalGSTR3BResponse)
def canonical_gstr3b_report(
    date_from: date = Query(...),
    date_to: date = Query(...),
    user: dict = Depends(PermissionChecker("gst", "view")),
    db: Session = Depends(get_db),
):
    """Authoritative GSTR-3B header projection from posted document tax totals."""
    org_id = _activate(db, user)
    params = {"org_id": org_id, **_validated_report_range(date_from, date_to)}
    rows = _rows(db, """
        SELECT COALESCE(output.cgst,0) AS output_cgst,
               COALESCE(output.sgst,0) AS output_sgst,
               COALESCE(output.igst,0) AS output_igst,
               COALESCE(output.cess,0) AS output_cess,
               COALESCE(input.cgst,0)-COALESCE(reversal.cgst,0) AS input_cgst,
               COALESCE(input.sgst,0)-COALESCE(reversal.sgst,0) AS input_sgst,
               COALESCE(input.igst,0)-COALESCE(reversal.igst,0) AS input_igst,
               COALESCE(input.cess,0)-COALESCE(reversal.cess,0) AS input_cess,
               COALESCE(reversal.cgst,0) AS reversed_cgst,
               COALESCE(reversal.sgst,0) AS reversed_sgst,
               COALESCE(reversal.igst,0) AS reversed_igst,
               COALESCE(reversal.cess,0) AS reversed_cess,
               COALESCE(purchase_adjustments.unsupported_count,0) AS unsupported_input_adjustments
          FROM (
              SELECT SUM(CASE WHEN tax_document.document_effect='decrease' THEN -tax_document.cgst_amount ELSE tax_document.cgst_amount END) cgst,
                     SUM(CASE WHEN tax_document.document_effect='decrease' THEN -tax_document.sgst_amount ELSE tax_document.sgst_amount END) sgst,
                     SUM(CASE WHEN tax_document.document_effect='decrease' THEN -tax_document.igst_amount ELSE tax_document.igst_amount END) igst,
                     SUM(CASE WHEN tax_document.document_effect='decrease' THEN -tax_document.cess_amount ELSE tax_document.cess_amount END) cess
                FROM tax.documents tax_document
               WHERE tax_document.org_id=:org_id
                 AND tax_document.direction='outward'
                 AND tax_document.document_class IN ('sales_invoice','adjustment_note')
                 AND tax_document.document_effect IN ('original','increase','decrease')
                 AND tax_document.document_date BETWEEN :date_from AND :date_to
          ) output
          CROSS JOIN (
              SELECT SUM(line.cgst_amount) cgst, SUM(line.sgst_amount) sgst,
                     SUM(line.igst_amount) igst, SUM(line.cess_amount) cess
                FROM procurement.supplier_invoices invoice
                JOIN procurement.supplier_invoice_lines line
                  ON line.org_id=invoice.org_id
                 AND line.supplier_invoice_id=invoice.id
                 AND line.itc_eligibility='eligible'
               WHERE invoice.org_id=:org_id AND invoice.status='posted'
                 AND EXISTS (
                     SELECT 1 FROM tax.documents tax_document
                      WHERE tax_document.org_id=invoice.org_id
                        AND tax_document.supplier_invoice_id=invoice.id
                        AND tax_document.document_class='supplier_invoice'
                        AND tax_document.document_effect='original'
                 )
                 AND EXISTS (
                     SELECT 1
                       FROM erp_automation_reads.supplier_invoice_portal_provenance(
                            invoice.org_id, invoice.id
                       ) command
                       JOIN tax.portal_document_lines portal_line
                         ON portal_line.org_id=invoice.org_id
                        AND portal_line.id=command.portal_document_line_id
                        AND portal_line.document_type='invoice'
                       JOIN tax.portal_documents portal_document
                         ON portal_document.org_id=portal_line.org_id
                        AND portal_document.id=portal_line.portal_document_id
                        AND portal_document.portal_document_type='gstr2b'
                        AND portal_document.status='parsed'
                        AND portal_document.parsed_at IS NOT NULL
                       JOIN tax.return_periods return_period
                         ON return_period.org_id=portal_document.org_id
                        AND return_period.id=portal_document.return_period_id
                        AND return_period.registration_id=portal_document.registration_id
                      WHERE return_period.period_start>=:date_from
                        AND return_period.period_end<=:date_to
                 )
          ) input
          CROSS JOIN (
              SELECT SUM(event.cgst_amount) cgst,SUM(event.sgst_amount) sgst,
                     SUM(event.igst_amount) igst,SUM(event.cess_amount) cess
                FROM tax.input_credit_reversal_events event
                JOIN compliance.destructions destruction
                  ON destruction.org_id=event.org_id AND destruction.id=event.destruction_id
               WHERE event.org_id=:org_id AND event.status='posted'
                 AND destruction.destruction_date BETWEEN :date_from AND :date_to
                 AND EXISTS (SELECT 1 FROM tax.returns filing
                   JOIN tax.return_periods period ON period.org_id=filing.org_id
                     AND period.id=filing.return_period_id
                  WHERE filing.org_id=event.org_id AND filing.id=event.gstr3b_return_id
                    AND period.id=event.return_period_id
                    AND destruction.destruction_date BETWEEN period.period_start AND period.period_end)
          ) reversal
          CROSS JOIN (
              SELECT count(DISTINCT note.id) AS unsupported_count
                FROM finance.adjustment_notes note
                JOIN finance.adjustment_note_lines line
                  ON line.org_id=note.org_id
                 AND line.adjustment_note_id=note.id
                 AND line.itc_eligibility='eligible'
                JOIN tax.portal_document_lines portal_line
                  ON portal_line.org_id=note.org_id
                 AND portal_line.id=note.counterparty_portal_document_line_id
                JOIN tax.portal_documents portal_document
                  ON portal_document.org_id=portal_line.org_id
                 AND portal_document.id=portal_line.portal_document_id
                 AND portal_document.portal_document_type='gstr2b'
                 AND portal_document.status='parsed'
                 AND portal_document.parsed_at IS NOT NULL
                JOIN tax.return_periods return_period
                  ON return_period.org_id=portal_document.org_id
                 AND return_period.id=portal_document.return_period_id
                 AND return_period.registration_id=portal_document.registration_id
               WHERE note.org_id=:org_id AND note.status='posted'
                 AND note.side='purchase' AND note.gst_tax_treatment='statutory'
                 AND return_period.period_start>=:date_from
                 AND return_period.period_end<=:date_to
                 AND EXISTS (
                     SELECT 1 FROM tax.documents tax_document
                      WHERE tax_document.org_id=note.org_id
                        AND tax_document.adjustment_note_id=note.id
                        AND tax_document.document_class='adjustment_note'
                 )
          ) purchase_adjustments
    """, params)
    row = rows[0] if rows else {}
    if int(row.get("unsupported_input_adjustments") or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Eligible purchase adjustments require canonical GSTR-2B ITC projection",
        )
    output = {component: Decimal(str(row.get(f"output_{component}") or 0)) for component in ("cgst", "sgst", "igst", "cess")}
    input_credit = {component: Decimal(str(row.get(f"input_{component}") or 0)) for component in ("cgst", "sgst", "igst", "cess")}
    input_credit_reversed = {component: Decimal(str(row.get(f"reversed_{component}") or 0)) for component in ("cgst", "sgst", "igst", "cess")}
    payable = {component: max(Decimal("0"), output[component]-input_credit[component]) for component in output}
    output_total = sum(output.values(), Decimal("0"))
    input_total = sum(input_credit.values(), Decimal("0"))
    reversed_total = sum(input_credit_reversed.values(), Decimal("0"))
    return {
        "period": {"start": date_from, "end": date_to},
        "outputTax": {**{key: money_json(value) for key, value in output.items()}, "total": money_json(output_total)},
        "inputCredit": {**{key: money_json(value) for key, value in input_credit.items()}, "total": money_json(input_total)},
        "inputCreditReversed": {**{key: money_json(value) for key, value in input_credit_reversed.items()}, "total": money_json(reversed_total)},
        "payable": {**{key: money_json(value) for key, value in payable.items()}, "total": money_json(sum(payable.values(), Decimal("0")))},
        "netPayable": money_json(output_total-input_total),
    }


@router.get("/gst/returns/status")
def gst_returns_status(user: dict = Depends(PermissionChecker("gst", "view")),
                       db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT DISTINCT ON (return_row.return_type)
               return_row.return_type, return_row.status, period.due_date,
               return_row.filed_at
          FROM tax.returns return_row
          JOIN tax.return_periods period
            ON period.org_id=return_row.org_id AND period.id=return_row.return_period_id
         WHERE return_row.org_id=:org_id
         ORDER BY return_row.return_type, period.period_end DESC, return_row.revision DESC
    """, {"org_id": org_id})
    # Absence of a filed/draft return is not evidence of a filing status or due
    # date. GSTR-2B also has no canonical projection in this service yet.
    result = {"gstr1": {"status": None, "dueDate": None, "lastUpdated": None},
              "gstr3b": {"status": None, "dueDate": None, "lastUpdated": None},
              "gstr2b": {"status": None, "dueDate": None, "lastUpdated": None}}
    for row in rows:
        key = str(row["return_type"]).lower().replace("-", "")
        if key in result:
            result[key] = {"status": row["status"], "dueDate": row["due_date"],
                           "lastUpdated": row["filed_at"]}
    return result


def _sales_rows(db: Session, org_id: UUID, table_name: str, number_column: str,
                date_column: str, line_table: str, foreign_key: str,
                limit: int, offset: int, date_from: Optional[str] = None,
                date_to: Optional[str] = None, search: str = "",
                payment_status: Optional[str] = None,
                include_invoice_payments: bool = False) -> list[dict]:
    payment_status_expression = """
        CASE
          WHEN document.status IN ('cancelled','reversed') THEN 'cancelled'
          WHEN document.status <> 'posted' THEN 'pending'
          WHEN COALESCE(payment.paid_amount, 0) >= COALESCE(document.grand_total, 0)
            THEN 'paid'
          WHEN COALESCE(payment.paid_amount, 0) > 0 THEN 'partial'
          WHEN payment.due_date IS NOT NULL
               AND payment.due_date < business_clock.business_date
            THEN 'overdue'
          ELSE 'pending'
        END
    """
    payment_columns = f"""
               , payment.due_date,
               COALESCE(payment.paid_amount, 0) AS paid_amount,
               GREATEST(COALESCE(document.grand_total, 0)
                        - COALESCE(payment.paid_amount, 0), 0) AS pending_amount,
               {payment_status_expression} AS payment_status
    """ if include_invoice_payments else ""
    invoice_tax_columns = """
               document.buyer_gstin_snapshot AS customer_gst_number,
               COALESCE(document.gst_taxable_total, 0) AS taxable_amount,
               COALESCE(document.cgst_total, 0) AS cgst_amount,
               COALESCE(document.sgst_total, 0) AS sgst_amount,
               COALESCE(document.igst_total, 0) AS igst_amount,
               COALESCE(document.cess_total, 0) AS cess_amount,
    """ if include_invoice_payments else ""
    payment_join = """
          LEFT JOIN LATERAL (
              SELECT item.due_date, COALESCE(effective.paid_amount, 0) AS paid_amount
                FROM finance.accounting_events event
                JOIN finance.open_items item
                  ON item.org_id=event.org_id AND item.accounting_event_id=event.id
                 AND item.item_side='receivable' AND item.status<>'reversed'
                LEFT JOIN LATERAL (
                    SELECT COALESCE(SUM(allocation.amount), 0) AS paid_amount
                      FROM finance.allocations allocation
                     WHERE allocation.org_id=item.org_id
                       AND allocation.open_item_id=item.id
                       AND allocation.status='posted'
                       AND allocation.reversal_of_allocation_id IS NULL
                       AND NOT EXISTS (
                           SELECT 1 FROM finance.allocations reversal
                            WHERE reversal.org_id=allocation.org_id
                              AND reversal.reversal_of_allocation_id=allocation.id
                       )
                ) effective ON true
               WHERE event.org_id=document.org_id
                 AND event.sales_invoice_id=document.id
               ORDER BY item.created_at DESC, item.id DESC LIMIT 1
          ) payment ON true
    """ if include_invoice_payments else ""
    business_clock_join = """
          CROSS JOIN LATERAL (
              SELECT erp_core_commands.current_organization_business_date()
                       AS business_date
          ) business_clock
    """ if include_invoice_payments else ""
    search_filter = f"""
           AND (:search='' OR document.{number_column} ILIKE :search_pattern
                OR party.legal_name ILIKE :search_pattern)
    """
    invoice_filters = f"""
           AND (CAST(:payment_status AS text) IS NULL
                OR {payment_status_expression}=CAST(:payment_status AS text))
    """ if include_invoice_payments else ""
    params = {"org_id": org_id, "date_from": date_from, "date_to": date_to,
              "limit": limit, "offset": offset, "search": search.strip(),
              "search_pattern": f"%{search.strip()}%"}
    if include_invoice_payments:
        params.update({"payment_status": payment_status})
    return _rows(db, f"""
        SELECT document.id, document.id AS document_id,
               document.{number_column} AS document_number,
               document.{date_column} AS document_date, document.status,
               document.customer_account_id AS customer_id,
               party.legal_name AS customer_name,
               contact.phone AS customer_phone, contact.email AS customer_email,
               {invoice_tax_columns}
               COALESCE(document.grand_total, 0) AS total_amount,
               COALESCE(lines.items_count, 0) AS items_count,
               COALESCE(lines.items, '[]'::jsonb) AS items,
               COUNT(*) OVER() AS filtered_total,
               document.created_at, document.updated_at
               {payment_columns}
          FROM sales.{table_name} document
          {business_clock_join}
          JOIN parties.customer_accounts account
            ON account.org_id=document.org_id AND account.id=document.customer_account_id
          JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
          LEFT JOIN LATERAL (
              SELECT phone, email
                FROM parties.contacts
               WHERE org_id=party.org_id AND party_id=party.id AND status='active'
               ORDER BY is_primary DESC, id LIMIT 1
          ) contact ON true
          LEFT JOIN LATERAL (
              SELECT count(*) AS items_count,
                     jsonb_agg(jsonb_build_object(
                       'product_id', line.product_id, 'product_name', product.name,
                       'product_code', product.sku, 'hsn_code', product.hsn_code,
                       'quantity', line.billed_quantity,
                       'unit_price', line.quoted_unit_rate,
                       'tax_rate', line.cgst_rate + line.sgst_rate + line.igst_rate,
                       'gst_percent', line.cgst_rate + line.sgst_rate + line.igst_rate,
                       'taxable_amount', line.gst_taxable_value,
                       'cgst_amount', line.cgst_amount, 'sgst_amount', line.sgst_amount,
                       'igst_amount', line.igst_amount, 'line_total', line.line_total
                     ) ORDER BY line.line_number) AS items
                FROM sales.{line_table} line
                JOIN catalog.products product ON product.org_id=line.org_id AND product.id=line.product_id
               WHERE line.org_id=document.org_id AND line.{foreign_key}=document.id
          ) lines ON true
          {payment_join}
         WHERE document.org_id=:org_id
           AND (:date_from IS NULL OR document.{date_column} >= CAST(:date_from AS date))
           AND (:date_to IS NULL OR document.{date_column} <= CAST(:date_to AS date))
           {search_filter}
           {invoice_filters}
         ORDER BY document.{date_column} DESC, document.id DESC
         LIMIT :limit OFFSET :offset
    """, params)


@router.get("/invoices/")
def invoices(limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0),
             date_from: Optional[str] = None, date_to: Optional[str] = None,
             search: str = Query("", max_length=200),
             payment_status: Optional[str] = Query(
                 None, pattern="^(paid|partial|pending|overdue)$"
             ),
             user: dict = SALES_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _sales_rows(db, org_id, "invoices", "invoice_number", "invoice_date",
                       "invoice_lines", "invoice_id", limit, offset, date_from, date_to,
                       search, payment_status, include_invoice_payments=True)
    for row in rows:
        row.update(invoice_id=row["id"], invoice_number=row["document_number"],
                   invoice_date=row["document_date"])
    total = int(rows[0].get("filtered_total", len(rows))) if rows else 0
    for row in rows:
        row.pop("filtered_total", None)
    return {"invoices": rows, "total": total}


class CanonicalInvoiceExecutedBatchAllocation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_kind: Literal["direct_issue", "dispatch_allocation"]
    allocation_id: UUID
    invoice_line_id: UUID
    source_line_id: UUID
    command_request_id: Optional[UUID]
    command_evidence_count: int
    request_line_count: int
    evidenced_allocation_count: Optional[int]
    evidence_match_count: int
    inventory_document_id: UUID
    inventory_document_line_id: UUID
    invoice_dispatch_allocation_id: Optional[UUID]
    dispatch_id: Optional[UUID]
    dispatch_line_id: Optional[UUID]
    batch_id: UUID
    batch_number: str
    expiry_date: Optional[date]
    from_location_id: Optional[UUID]
    uom_code: str
    base_quantity: ExactQuantity
    entered_quantity: ExactQuantity
    base_billed_quantity: ExactQuantity
    base_free_quantity: ExactQuantity
    billed_quantity: ExactQuantity
    free_quantity: ExactQuantity

    @model_validator(mode="after")
    def validate_source_identity(self):
        if self.source_kind == "dispatch_allocation":
            if (
                self.command_request_id is not None
                or self.command_evidence_count != 0
                or self.request_line_count != 0
                or self.evidenced_allocation_count is not None
                or self.evidence_match_count != 0
                or not self.invoice_dispatch_allocation_id
                or not self.dispatch_id
                or not self.dispatch_line_id
                or self.source_line_id != self.dispatch_line_id
            ):
                raise ValueError("dispatch allocation requires dispatch lineage identities")
        elif (
            not self.command_request_id
            or self.command_evidence_count != 1
            or self.request_line_count != 1
            or not self.evidenced_allocation_count
            or self.evidence_match_count != 1
            or self.source_line_id != self.invoice_line_id
        ):
            raise ValueError("direct issue requires exactly one matched succeeded command evidence")
        elif self.invoice_dispatch_allocation_id or self.dispatch_id or self.dispatch_line_id:
            raise ValueError("direct issue cannot claim dispatch allocation identities")
        if self.entered_quantity != self.billed_quantity + self.free_quantity:
            raise ValueError("executed allocation entered quantities do not reconcile")
        return self


class CanonicalInvoiceDetailItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    product_id: UUID
    product_name: str
    product_code: str
    hsn_code: str
    uom_code: str
    unit: str
    quantity: ExactQuantity
    free_quantity: ExactQuantity
    base_billed_quantity: ExactQuantity
    base_free_quantity: ExactQuantity
    free_supply_tax_treatment: Literal[
        "excluded_from_taxable_value", "included_at_unit_rate"
    ]
    unit_price: ExactRate
    discount_percent: ExactPercent
    tax_rate: ExactPercent
    gst_percent: ExactPercent
    taxable_amount: ExactMoney
    cgst_amount: ExactMoney
    sgst_amount: ExactMoney
    igst_amount: ExactMoney
    cess_amount: ExactMoney
    line_total: ExactMoney
    batch_id: Optional[UUID]
    batch_number: Optional[str]
    expiry_date: Optional[date]
    batch_allocations: list[CanonicalInvoiceExecutedBatchAllocation]

    @model_validator(mode="after")
    def validate_allocation_set(self):
        if not self.batch_allocations:
            if self.batch_id or self.batch_number or self.expiry_date:
                raise ValueError("scalar batch identity requires an executed allocation")
            return self
        if len({value.source_kind for value in self.batch_allocations}) != 1:
            raise ValueError("invoice line cannot mix direct and dispatch allocations")
        if len({value.allocation_id for value in self.batch_allocations}) != len(
            self.batch_allocations
        ):
            raise ValueError("invoice allocation identities must be unique")
        if len({value.inventory_document_line_id for value in self.batch_allocations}) != len(
            self.batch_allocations
        ):
            raise ValueError("executed inventory line identities must be unique")
        if any(value.invoice_line_id != self.id for value in self.batch_allocations):
            raise ValueError("executed allocation invoice line identity does not match")
        if self.batch_allocations[0].source_kind == "direct_issue" and len({
            value.command_request_id for value in self.batch_allocations
        }) != 1:
            raise ValueError("direct allocations must share one succeeded command")
        if self.batch_allocations[0].source_kind == "direct_issue":
            if len({value.inventory_document_id for value in self.batch_allocations}) != 1:
                raise ValueError("direct allocations must share one inventory document")
            evidenced_counts = {
                value.evidenced_allocation_count for value in self.batch_allocations
            }
            if evidenced_counts != {len(self.batch_allocations)}:
                raise ValueError(
                    "direct physical allocation count does not match command evidence"
                )
        for allocation in self.batch_allocations:
            if allocation.base_quantity != (
                allocation.base_billed_quantity + allocation.base_free_quantity
            ):
                raise ValueError("executed allocation base quantities do not reconcile")
            if allocation.source_kind == "direct_issue" and (
                allocation.allocation_id != allocation.inventory_document_line_id
            ):
                raise ValueError("direct allocation identity must be its inventory line")
            if allocation.source_kind == "dispatch_allocation" and (
                allocation.allocation_id != allocation.invoice_dispatch_allocation_id
            ):
                raise ValueError("dispatch allocation identity must remain distinct")
        if (
            sum(
                (value.billed_quantity for value in self.batch_allocations),
                Decimal("0"),
            ) != self.quantity
            or sum(
                (value.free_quantity for value in self.batch_allocations),
                Decimal("0"),
            ) != self.free_quantity
            or sum(
                (value.base_billed_quantity for value in self.batch_allocations),
                Decimal("0"),
            ) != self.base_billed_quantity
            or sum(
                (value.base_free_quantity for value in self.batch_allocations),
                Decimal("0"),
            ) != self.base_free_quantity
        ):
            raise ValueError("executed allocations do not reconcile to invoice quantities")
        if len(self.batch_allocations) == 1:
            allocation = self.batch_allocations[0]
            if (
                self.batch_id != allocation.batch_id
                or self.batch_number != allocation.batch_number
                or self.expiry_date != allocation.expiry_date
            ):
                raise ValueError("scalar batch compatibility fields do not match allocation")
        elif self.batch_id or self.batch_number or self.expiry_date:
            raise ValueError("multi-allocation line cannot expose lossy scalar batch identity")
        return self


class CanonicalSalesOrderEligibleBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    batch_id: UUID
    batch_number: str
    expiry_date: date
    location_id: UUID
    location_name: str
    mrp: ExactRate
    available_quantity: ExactQuantity
    available_base_quantity: ExactQuantity
    fefo_priority: int = Field(ge=1)

    @model_validator(mode="after")
    def validate_positive_stock(self):
        if self.available_quantity <= 0 or self.available_base_quantity <= 0:
            raise ValueError("eligible dispatch batch must have positive stock")
        return self


class CanonicalSalesOrderDefaultBatchAllocation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    batch_id: UUID
    batch_number: str
    expiry_date: date
    location_id: UUID
    billed_quantity: ExactQuantity
    free_quantity: ExactQuantity
    base_billed_quantity: ExactQuantity
    base_free_quantity: ExactQuantity

    @model_validator(mode="after")
    def validate_positive_quantity(self):
        if self.billed_quantity + self.free_quantity <= 0:
            raise ValueError("default dispatch allocation requires a positive quantity")
        if self.base_billed_quantity + self.base_free_quantity <= 0:
            raise ValueError("default dispatch allocation requires a positive base quantity")
        return self


class CanonicalSalesOrderImportItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    source_document_kind: Literal["sales_order"]
    product_id: UUID
    product_name: str
    product_code: str
    hsn_code: str
    branch_id: UUID
    location_id: UUID
    uom_conversion_id: UUID
    uom_code: str
    unit: str
    quantity: ExactQuantity
    free_quantity: ExactQuantity
    free_supply_tax_treatment: Literal[
        "excluded_from_taxable_value", "included_at_unit_rate"
    ]
    unit_price: ExactRate
    discount_percent: ExactPercent
    tax_rate: ExactPercent
    gst_percent: ExactPercent
    taxable_amount: ExactMoney
    cgst_amount: ExactMoney
    sgst_amount: ExactMoney
    igst_amount: ExactMoney
    line_total: ExactMoney
    batch_id: Optional[UUID]
    batch_number: Optional[str]
    expiry_date: Optional[date]
    mrp: Optional[ExactRate]
    available_quantity: ExactQuantity
    eligible_batches: list[CanonicalSalesOrderEligibleBatch]
    default_batch_allocations: list[CanonicalSalesOrderDefaultBatchAllocation]

    @model_validator(mode="after")
    def validate_quantity(self):
        if self.quantity < 0 or self.free_quantity < 0:
            raise ValueError("order import quantities cannot be negative")
        if self.quantity + self.free_quantity <= 0:
            raise ValueError("order import line requires a positive quantity")
        if self.available_quantity < self.quantity + self.free_quantity:
            raise ValueError("order import stock does not cover its quantity")
        if not self.eligible_batches or not self.default_batch_allocations:
            raise ValueError("order import requires eligible stock and default allocations")
        eligible = {value.batch_id: value for value in self.eligible_batches}
        if len(eligible) != len(self.eligible_batches):
            raise ValueError("order import eligible batches must be unique")
        if any(value.location_id != self.location_id for value in self.eligible_batches):
            raise ValueError("order import eligible batches must use its selected location")
        if any(value.location_id != self.location_id for value in self.default_batch_allocations):
            raise ValueError("order import default allocations must use its selected location")
        if any(value.batch_id not in eligible for value in self.default_batch_allocations):
            raise ValueError("order import default allocation is not an eligible batch")
        if [value.fefo_priority for value in self.eligible_batches] != list(
            range(1, len(self.eligible_batches) + 1)
        ):
            raise ValueError("order import eligible batch FEFO priorities are incomplete")
        allocation_ids = [value.batch_id for value in self.default_batch_allocations]
        if len(allocation_ids) != len(set(allocation_ids)):
            raise ValueError("order import default allocations must use unique batches")
        eligible_order = {value.batch_id: index for index, value in enumerate(self.eligible_batches)}
        if allocation_ids != sorted(allocation_ids, key=eligible_order.__getitem__):
            raise ValueError("order import default allocations must follow eligible FEFO order")
        for allocation in self.default_batch_allocations:
            batch = eligible[allocation.batch_id]
            if (
                allocation.billed_quantity + allocation.free_quantity
                > batch.available_quantity
                or allocation.base_billed_quantity + allocation.base_free_quantity
                > batch.available_base_quantity
            ):
                raise ValueError("order import default allocation exceeds eligible stock")
        if self.available_quantity != sum(
            (value.available_quantity for value in self.eligible_batches),
            Decimal("0"),
        ):
            raise ValueError("order import available quantity does not reconcile eligible stock")
        if sum(
            (value.billed_quantity for value in self.default_batch_allocations),
            Decimal("0"),
        ) != self.quantity or sum(
            (value.free_quantity for value in self.default_batch_allocations),
            Decimal("0"),
        ) != self.free_quantity:
            raise ValueError("order import default allocations do not reconcile quantities")
        if len(self.default_batch_allocations) == 1:
            allocation = self.default_batch_allocations[0]
            if (
                self.batch_id != allocation.batch_id
                or self.batch_number != allocation.batch_number
                or self.expiry_date != allocation.expiry_date
            ):
                raise ValueError("order import scalar batch fields do not match its default")
        elif self.batch_id is not None or self.batch_number is not None or self.expiry_date is not None:
            raise ValueError("multi-batch order import cannot expose a scalar batch identity")
        return self


class CanonicalDispatchImportAllocation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_kind: Literal["dispatch_allocation"]
    allocation_id: UUID
    source_line_id: UUID
    command_request_id: UUID
    inventory_document_id: UUID
    inventory_document_line_id: UUID
    invoice_dispatch_allocation_id: None
    dispatch_id: UUID
    dispatch_line_id: UUID
    batch_id: UUID
    batch_number: str
    expiry_date: Optional[date]
    from_location_id: UUID
    base_quantity: ExactQuantity
    base_billed_quantity: ExactQuantity
    base_free_quantity: ExactQuantity
    billed_quantity: ExactQuantity
    free_quantity: ExactQuantity

    @model_validator(mode="after")
    def validate_lineage(self):
        if self.allocation_id != self.dispatch_line_id:
            raise ValueError("dispatch import allocation identity must be its dispatch line")
        if self.source_line_id != self.dispatch_line_id:
            raise ValueError("dispatch import source identity must be its dispatch line")
        if self.base_billed_quantity < 0 or self.base_free_quantity < 0:
            raise ValueError("dispatch import base quantities cannot be negative")
        if self.billed_quantity < 0 or self.free_quantity < 0:
            raise ValueError("dispatch import entered quantities cannot be negative")
        if self.base_quantity != self.base_billed_quantity + self.base_free_quantity:
            raise ValueError("dispatch import base quantities do not reconcile")
        return self


class CanonicalChallanImportItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    source_document_kind: Literal["delivery_challan"]
    product_id: UUID
    product_name: str
    product_code: str
    hsn_code: str
    branch_id: UUID
    uom_conversion_id: UUID
    uom_code: str
    unit: str
    quantity: ExactQuantity
    dispatched_quantity: ExactQuantity
    free_quantity: ExactQuantity
    free_supply_tax_treatment: Literal[
        "excluded_from_taxable_value", "included_at_unit_rate"
    ]
    unit_price: ExactRate
    discount_percent: ExactPercent
    tax_rate: ExactPercent
    gst_percent: ExactPercent
    taxable_amount: ExactMoney
    cgst_amount: ExactMoney
    sgst_amount: ExactMoney
    igst_amount: ExactMoney
    line_total: ExactMoney
    batch_id: UUID
    batch_number: str
    expiry_date: Optional[date]
    mrp: ExactRate
    batch_allocations: list[CanonicalDispatchImportAllocation]

    @model_validator(mode="after")
    def validate_allocation(self):
        if len(self.batch_allocations) != 1:
            raise ValueError("challan import line requires exactly one dispatch allocation")
        allocation = self.batch_allocations[0]
        if allocation.dispatch_line_id != self.id:
            raise ValueError("challan allocation does not belong to its source line")
        if (
            allocation.billed_quantity != self.quantity
            or allocation.free_quantity != self.free_quantity
        ):
            raise ValueError("challan allocation quantities do not reconcile")
        return self


class CanonicalSalesOrderImportDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    order_id: UUID
    id: UUID
    order_number: str
    order_date: date
    dispatch_context_date: date
    delivery_date: Optional[date]
    order_status: Literal["approved"]
    status: Literal["approved"]
    customer_id: UUID
    customer_name: str
    customer_phone: Optional[str]
    customer_email: Optional[str]
    customer_gst_number: Optional[str]
    billing_address: str
    billing_city: str
    billing_state: str
    billing_pincode: str
    shipping_address: str
    shipping_city: str
    shipping_state: str
    shipping_pincode: str
    total_amount: ExactMoney
    items: list[CanonicalSalesOrderImportItem]
    source_item_count: int = Field(exclude=True)
    importable_item_count: int = Field(exclude=True)
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def validate_item_cardinality(self):
        if (
            self.source_item_count <= 0
            or self.source_item_count != self.importable_item_count
            or self.importable_item_count != len(self.items)
        ):
            raise ValueError("sales-order import line cardinality is incomplete")
        return self


class CanonicalChallanImportDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    challan_id: UUID
    id: UUID
    challan_number: str
    challan_date: date
    status: Literal["posted"]
    customer_id: UUID
    customer_name: str
    customer_phone: Optional[str]
    customer_email: Optional[str]
    delivery_address: str
    delivery_city: str
    delivery_state: str
    delivery_pincode: str
    transport_company: Optional[str]
    vehicle_number: Optional[str]
    lr_number: Optional[str]
    items: list[CanonicalChallanImportItem]
    source_item_count: int = Field(exclude=True)
    importable_item_count: int = Field(exclude=True)
    total_amount: ExactMoney
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def validate_item_cardinality(self):
        if (
            self.source_item_count <= 0
            or self.source_item_count != self.importable_item_count
            or self.importable_item_count != len(self.items)
        ):
            raise ValueError("challan import line cardinality is incomplete")
        return self


class CanonicalInvoiceDetailResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    invoice_id: UUID
    invoice_number: str
    invoice_date: date
    status: str
    seller_legal_name: str
    seller_gstin: str
    seller_address: str
    customer_id: UUID
    customer_name: str
    customer_phone: Optional[str]
    customer_email: Optional[str]
    customer_gst_number: Optional[str]
    billing_address: str
    shipping_address: str
    due_date: Optional[date]
    currency_code: str
    taxable_amount: ExactMoney
    cgst_amount: ExactMoney
    sgst_amount: ExactMoney
    igst_amount: ExactMoney
    cess_amount: ExactMoney
    total_amount: ExactMoney
    items: list[CanonicalInvoiceDetailItem]
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def validate_posted_product_allocations(self):
        if self.status == "posted" and any(
            not item.batch_allocations for item in self.items
        ):
            raise ValueError(
                "posted product invoice lines require one nonempty allocation source"
            )
        return self


def _canonical_invoice_detail(db: Session, org_id: UUID, invoice_id: UUID) -> dict:
    rows = _rows(db, """
        SELECT invoice.id AS invoice_id, invoice.invoice_number,
               invoice.invoice_date, invoice.status,
               invoice.seller_legal_name_snapshot AS seller_legal_name,
               invoice.seller_gstin_snapshot AS seller_gstin,
               invoice.seller_address_snapshot AS seller_address,
               invoice.customer_account_id AS customer_id,
               party.legal_name AS customer_name,
               contact.phone AS customer_phone, contact.email AS customer_email,
               invoice.buyer_gstin_snapshot AS customer_gst_number,
               invoice.buyer_address_snapshot AS billing_address,
               invoice.buyer_address_snapshot AS shipping_address,
               invoice.due_date, invoice.currency_code,
               to_char(invoice.gst_taxable_total, 'FM999999999999999990.00') AS taxable_amount,
               to_char(invoice.cgst_total, 'FM999999999999999990.00') AS cgst_amount,
               to_char(invoice.sgst_total, 'FM999999999999999990.00') AS sgst_amount,
               to_char(invoice.igst_total, 'FM999999999999999990.00') AS igst_amount,
               to_char(invoice.cess_total, 'FM999999999999999990.00') AS cess_amount,
               to_char(invoice.grand_total, 'FM999999999999999990.00') AS total_amount,
               COALESCE(lines.items, '[]'::jsonb) AS items,
               invoice.created_at, invoice.updated_at
          FROM sales.invoices invoice
          JOIN parties.customer_accounts account
            ON account.org_id=invoice.org_id
           AND account.id=invoice.customer_account_id
          JOIN parties.parties party
            ON party.org_id=account.org_id AND party.id=account.party_id
          LEFT JOIN LATERAL (
              SELECT phone, email
                FROM parties.contacts
               WHERE org_id=party.org_id AND party_id=party.id AND status='active'
               ORDER BY is_primary DESC, id LIMIT 1
          ) contact ON true
          LEFT JOIN LATERAL (
              SELECT jsonb_agg(jsonb_build_object(
                         'id', line.id, 'source_document_kind', 'sales_order',
                         'product_id', line.product_id,
                         'product_name', product.name, 'product_code', product.sku,
                         'hsn_code', product.hsn_code, 'uom_code', line.uom_code,
                         'unit', line.uom_code, 'quantity',
                             to_char(line.billed_quantity, 'FM999999999999999990.000000'),
                         'free_quantity',
                             to_char(line.free_quantity, 'FM999999999999999990.000000'),
                         'base_billed_quantity',
                             to_char(line.base_billed_quantity, 'FM999999999999999990.000000'),
                         'base_free_quantity',
                             to_char(line.base_free_quantity, 'FM999999999999999990.000000'),
                         'free_supply_tax_treatment', line.free_supply_tax_treatment,
                         'unit_price',
                             to_char(line.quoted_unit_rate, 'FM999999999999999990.0000'),
                         'discount_percent', to_char(CASE
                             WHEN line.line_discount_kind='percent'
                             THEN line.line_discount_value ELSE 0 END,
                             'FM999999999999999990.000000'),
                         'tax_rate', to_char(
                             line.cgst_rate + line.sgst_rate + line.igst_rate,
                             'FM999999999999999990.000000'),
                         'gst_percent', to_char(
                             line.cgst_rate + line.sgst_rate + line.igst_rate,
                             'FM999999999999999990.000000'),
                         'taxable_amount',
                             to_char(line.gst_taxable_value, 'FM999999999999999990.00'),
                         'cgst_amount',
                             to_char(line.cgst_amount, 'FM999999999999999990.00'),
                         'sgst_amount',
                             to_char(line.sgst_amount, 'FM999999999999999990.00'),
                         'igst_amount',
                             to_char(line.igst_amount, 'FM999999999999999990.00'),
                         'cess_amount',
                             to_char(line.cess_amount, 'FM999999999999999990.00'),
                         'line_total',
                             to_char(line.line_total, 'FM999999999999999990.00'),
                         'batch_id', CASE WHEN allocation.allocation_count=1
                                          THEN allocation.batch_id END,
                         'batch_number', CASE WHEN allocation.allocation_count=1
                                              THEN allocation.batch_number END,
                         'expiry_date', CASE WHEN allocation.allocation_count=1
                                             THEN allocation.expiry_date END,
                         'batch_allocations', COALESCE(allocation.batch_allocations, '[]'::jsonb)
                     ) ORDER BY line.line_number) AS items
                FROM sales.invoice_lines line
                LEFT JOIN catalog.products product
                  ON product.org_id=line.org_id AND product.id=line.product_id
                LEFT JOIN LATERAL (
                    SELECT count(*) AS allocation_count,
                           (array_agg(executed.batch_id ORDER BY
                              executed.source_kind, executed.allocation_id))[1] AS batch_id,
                           (array_agg(executed.batch_number ORDER BY
                              executed.source_kind, executed.allocation_id))[1] AS batch_number,
                           (array_agg(executed.expiry_date ORDER BY
                              executed.source_kind, executed.allocation_id))[1] AS expiry_date,
                           jsonb_agg(jsonb_build_object(
                               'source_kind', executed.source_kind,
                               'allocation_id', executed.allocation_id,
                               'invoice_line_id', executed.invoice_line_id,
                               'source_line_id', executed.source_line_id,
                               'command_request_id', executed.command_request_id,
                               'command_evidence_count', executed.command_evidence_count,
                               'request_line_count', executed.request_line_count,
                               'evidenced_allocation_count',
                                   executed.evidenced_allocation_count,
                               'evidence_match_count', executed.evidence_match_count,
                               'inventory_document_id', executed.inventory_document_id,
                               'inventory_document_line_id', executed.inventory_document_line_id,
                               'invoice_dispatch_allocation_id',
                                   executed.invoice_dispatch_allocation_id,
                               'dispatch_id', executed.dispatch_id,
                               'dispatch_line_id', executed.dispatch_line_id,
                               'batch_id', executed.batch_id,
                               'batch_number', executed.batch_number,
                               'expiry_date', executed.expiry_date,
                               'from_location_id', executed.from_location_id,
                               'uom_code', executed.uom_code,
                               'base_quantity', to_char(
                                   executed.base_quantity,
                                   'FM999999999999999990.000000'),
                               'entered_quantity', to_char(
                                   executed.entered_quantity,
                                   'FM999999999999999990.000000'),
                               'base_billed_quantity', to_char(
                                   executed.base_billed_quantity,
                                   'FM999999999999999990.000000'),
                               'base_free_quantity', to_char(
                                   executed.base_free_quantity,
                                   'FM999999999999999990.000000'),
                               'billed_quantity', to_char(
                                   executed.billed_quantity,
                                   'FM999999999999999990.000000'),
                               'free_quantity', to_char(
                                   executed.free_quantity,
                                   'FM999999999999999990.000000')
                           ) ORDER BY executed.source_kind, executed.allocation_id)
                             AS batch_allocations
                      FROM (
                          SELECT 'direct_issue'::text AS source_kind,
                                 inventory_line.id AS allocation_id,
                                 line.id AS invoice_line_id,
                                 requested_allocation.invoice_line_id
                                   AS source_line_id,
                                 requested_allocation.command_request_id,
                                 CASE WHEN requested_allocation.command_request_id IS NULL
                                   THEN 0 ELSE 1 END AS command_evidence_count,
                                 CASE WHEN requested_allocation.command_request_id IS NULL
                                   THEN 0 ELSE 1 END AS request_line_count,
                                 requested_allocation.evidenced_allocation_count,
                                 CASE WHEN requested_allocation.command_request_id IS NULL
                                   THEN 0 ELSE 1 END AS evidence_match_count,
                                 inventory_line.inventory_document_id,
                                 inventory_line.id AS inventory_document_line_id,
                                 NULL::uuid AS invoice_dispatch_allocation_id,
                                 NULL::uuid AS dispatch_id,
                                 NULL::uuid AS dispatch_line_id,
                                 inventory_line.batch_id, batch.batch_number,
                                 batch.expires_on AS expiry_date,
                                 inventory_line.from_location_id,
                                 inventory_line.uom_code,
                                 inventory_line.base_quantity,
                                 inventory_line.entered_quantity,
                                 pg_catalog.round(
                                   requested_allocation.billed_quantity
                                     * line.uom_conversion_factor, 6
                                 ) AS base_billed_quantity,
                                 pg_catalog.round(
                                   requested_allocation.free_quantity
                                     * line.uom_conversion_factor, 6
                                 ) AS base_free_quantity,
                                 requested_allocation.billed_quantity,
                                 requested_allocation.free_quantity
                            FROM inventory.inventory_document_lines inventory_line
                            JOIN inventory.inventory_documents inventory_document
                             ON inventory_document.org_id=inventory_line.org_id
                             AND inventory_document.id=inventory_line.inventory_document_id
                             AND inventory_document.sales_invoice_id=invoice.id
                             AND inventory_document.branch_id=invoice.branch_id
                             AND inventory_document.document_type='sales_issue'
                             AND inventory_document.status='posted'
                            JOIN inventory.batches batch
                              ON batch.org_id=inventory_line.org_id
                             AND batch.id=inventory_line.batch_id
                            LEFT JOIN LATERAL erp_automation_reads.sales_invoice_direct_issue_provenance(
                                 invoice.org_id, invoice.branch_id, invoice.id
                            ) requested_allocation
                              ON requested_allocation.invoice_line_id=line.id
                             AND requested_allocation.inventory_document_line_id=inventory_line.id
                             AND requested_allocation.batch_id=inventory_line.batch_id
                           WHERE inventory_line.org_id=line.org_id
                             AND inventory_line.sales_invoice_line_id=line.id
                          UNION ALL
                          SELECT 'dispatch_allocation'::text AS source_kind,
                                 invoice_allocation.id AS allocation_id,
                                 line.id AS invoice_line_id,
                                 dispatch_line.id AS source_line_id,
                                 NULL::uuid AS command_request_id,
                                 0::integer AS command_evidence_count,
                                 0::integer AS request_line_count,
                                 NULL::integer AS evidenced_allocation_count,
                                 0::integer AS evidence_match_count,
                                 inventory_line.inventory_document_id,
                                 inventory_line.id AS inventory_document_line_id,
                                 invoice_allocation.id AS invoice_dispatch_allocation_id,
                                 dispatch.id AS dispatch_id,
                                 dispatch_line.id AS dispatch_line_id,
                                 dispatch_line.batch_id, batch.batch_number,
                                 batch.expires_on AS expiry_date,
                                 dispatch_line.from_location_id,
                                 line.uom_code,
                                 invoice_allocation.allocated_base_billed_quantity
                                   + invoice_allocation.allocated_base_free_quantity AS base_quantity,
                                 pg_catalog.round(
                                   (invoice_allocation.allocated_base_billed_quantity
                                     + invoice_allocation.allocated_base_free_quantity)
                                   / NULLIF(line.uom_conversion_factor, 0), 6
                                 ) AS entered_quantity,
                                 invoice_allocation.allocated_base_billed_quantity
                                   AS base_billed_quantity,
                                 invoice_allocation.allocated_base_free_quantity
                                   AS base_free_quantity,
                                 pg_catalog.round(
                                   invoice_allocation.allocated_base_billed_quantity
                                   / NULLIF(line.uom_conversion_factor, 0), 6
                                 ) AS billed_quantity,
                                 pg_catalog.round(
                                   invoice_allocation.allocated_base_free_quantity
                                   / NULLIF(line.uom_conversion_factor, 0), 6
                                 ) AS free_quantity
                            FROM sales.invoice_dispatch_allocations invoice_allocation
                            JOIN sales.dispatch_lines dispatch_line
                              ON dispatch_line.org_id=invoice_allocation.org_id
                             AND dispatch_line.id=invoice_allocation.dispatch_line_id
                            JOIN sales.dispatches dispatch
                              ON dispatch.org_id=dispatch_line.org_id
                             AND dispatch.id=dispatch_line.dispatch_id
                             AND dispatch.status='posted'
                            JOIN inventory.inventory_document_lines inventory_line
                              ON inventory_line.org_id=dispatch_line.org_id
                             AND inventory_line.sales_dispatch_line_id=dispatch_line.id
                            JOIN inventory.inventory_documents inventory_document
                             ON inventory_document.org_id=inventory_line.org_id
                             AND inventory_document.id=inventory_line.inventory_document_id
                             AND inventory_document.sales_dispatch_id=dispatch.id
                             AND inventory_document.branch_id=invoice.branch_id
                             AND inventory_document.document_type='sales_issue'
                             AND inventory_document.status='posted'
                            JOIN inventory.batches batch
                              ON batch.org_id=dispatch_line.org_id
                             AND batch.id=dispatch_line.batch_id
                           WHERE invoice_allocation.org_id=line.org_id
                             AND invoice_allocation.invoice_line_id=line.id
                      ) executed
                ) allocation ON true
               WHERE line.org_id=invoice.org_id AND line.invoice_id=invoice.id
                 AND line.product_id IS NOT NULL
          ) lines ON true
         WHERE invoice.org_id=:org_id AND invoice.id=:invoice_id
    """, {"org_id": org_id, "invoice_id": invoice_id})
    if len(rows) != 1:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return rows[0]


@router.get(
    "/canonical/invoices/{invoice_id}",
    response_model=CanonicalInvoiceDetailResponse,
    operation_id="canonical_invoice_exact_detail",
)
def canonical_invoice(
    invoice_id: UUID,
    user: dict = SALES_USER,
    db: Session = Depends(get_db),
):
    return _canonical_invoice_detail(db, _activate(db, user), invoice_id)


@router.get(
    "/invoices/{invoice_id:uuid}",
    response_model=CanonicalInvoiceDetailResponse,
    operation_id="canonical_invoice_uuid_compatibility_detail",
)
def canonical_invoice_compatibility_detail(
    invoice_id: UUID,
    user: dict = SALES_USER,
    db: Session = Depends(get_db),
):
    """Resolve UUID invoice list rows before the integer compatibility route."""
    return _canonical_invoice_detail(db, _activate(db, user), invoice_id)


_QUANTITY_QUANTUM = Decimal("0.000001")
_RATE_QUANTUM = Decimal("0.0001")
_MONEY_QUANTUM = Decimal("0.01")


def _dispatch_entered_availability(base_quantity: Decimal, factor: Decimal) -> Decimal:
    """Return a six-decimal entered-UOM quantity that never exceeds base stock."""
    return (base_quantity / factor).quantize(_QUANTITY_QUANTUM, rounding=ROUND_DOWN)


def _location_supports_value_backed_fefo(
    candidates: list[dict], required: Decimal, *,
    availability_field: str = "available_quantity",
) -> bool:
    remaining = required
    expiry_dates = sorted({candidate["expiry_date"] for candidate in candidates})
    for expiry_date in expiry_dates:
        expiry_candidates = [
            candidate for candidate in candidates
            if candidate["expiry_date"] == expiry_date
        ]
        expiry_available = sum(
            (candidate[availability_field] for candidate in expiry_candidates),
            Decimal("0"),
        )
        expected = min(remaining, expiry_available)
        value_backed_available = sum(
            (
                candidate[availability_field] for candidate in expiry_candidates
                if candidate["is_value_backed"]
            ),
            Decimal("0"),
        )
        if expected > value_backed_available:
            return False
        remaining -= expected
        if remaining == 0:
            return True
    return False


def _build_sales_order_dispatch_context(line_rows: list[dict]) -> list[dict]:
    """Choose one saleable location and build deterministic, advisory FEFO defaults.

    The command prepare resolver remains authoritative and re-locks every source row.
    This read projection intentionally uses no reservations or client-supplied stock.
    """
    prepared: list[tuple[dict, Decimal, Decimal, list[dict]]] = []
    eligible_location_sets: list[set[UUID]] = []

    for row in line_rows:
        candidate_count = int(row.get("uom_candidate_count") or 0)
        factor = Decimal(str(row.get("uom_conversion_factor") or 0))
        if candidate_count != 1 or row.get("uom_conversion_id") is None or factor <= 0:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Sales-order dispatch context requires one unambiguous active "
                    "UOM conversion per product line"
                ),
            )
        billed = Decimal(str(row["quantity"]))
        free = Decimal(str(row["free_quantity"]))
        dispatched_billed = Decimal(str(row.get("dispatched_billed_quantity") or 0))
        dispatched_free = Decimal(str(row.get("dispatched_free_quantity") or 0))
        if dispatched_billed > billed or dispatched_free > free:
            raise HTTPException(
                status_code=409,
                detail="Existing dispatch quantities exceed the approved sales-order ceiling",
            )
        billed -= dispatched_billed
        free -= dispatched_free
        required = billed + free
        if required == 0:
            continue
        raw_candidates = row.get("eligible_batches") or []
        candidates: list[dict] = []
        candidates_by_location: dict[UUID, list[dict]] = {}
        for raw in raw_candidates:
            candidate = dict(raw)
            location_id = UUID(str(candidate["location_id"]))
            base_available = Decimal(str(candidate["available_base_quantity"]))
            entered_available = _dispatch_entered_availability(base_available, factor)
            if entered_available <= 0:
                continue
            candidate["location_id"] = location_id
            candidate["batch_id"] = UUID(str(candidate["batch_id"]))
            candidate["available_base_quantity"] = base_available
            candidate["available_quantity"] = entered_available
            candidate["inventory_value"] = Decimal(str(candidate["inventory_value"]))
            candidate["average_unit_cost"] = Decimal(str(candidate["average_unit_cost"]))
            candidate["mrp"] = Decimal(str(candidate["mrp"]))
            candidate["is_value_backed"] = (
                candidate["inventory_value"] > 0
                and candidate["average_unit_cost"] > 0
            )
            candidates.append(candidate)
            candidates_by_location.setdefault(location_id, []).append(candidate)

        required_base = ((billed + free) * factor).quantize(_QUANTITY_QUANTUM)
        locations = {
            location_id for location_id, location_candidates in candidates_by_location.items()
            if _location_supports_value_backed_fefo(
                location_candidates, required_base,
                availability_field="available_base_quantity",
            )
        }
        eligible_location_sets.append(locations)
        prepared.append((dict(row), billed, free, candidates))

    common_locations = set.intersection(*eligible_location_sets) if eligible_location_sets else set()
    if not prepared:
        raise HTTPException(
            status_code=409,
            detail="The approved sales order is already fully dispatched",
        )
    for location_id in tuple(common_locations):
        required_by_product: dict[UUID, Decimal] = {}
        candidates_by_product: dict[UUID, list[dict]] = {}
        for row, billed, free, candidates in prepared:
            product_id = UUID(str(row["product_id"]))
            factor = Decimal(str(row["uom_conversion_factor"]))
            required_by_product[product_id] = (
                required_by_product.get(product_id, Decimal("0"))
                + ((billed + free) * factor).quantize(_QUANTITY_QUANTUM)
            )
            candidates_by_product.setdefault(product_id, [
                candidate for candidate in candidates
                if candidate["location_id"] == location_id
            ])
        if any(
            not _location_supports_value_backed_fefo(
                candidates_by_product[product_id], required,
                availability_field="available_base_quantity",
            )
            for product_id, required in required_by_product.items()
        ):
            common_locations.remove(location_id)
    if not common_locations:
        raise HTTPException(
            status_code=409,
            detail=(
                "No single saleable location has sufficient released, unexpired, "
                "value-backed FEFO stock for every sales-order line"
            ),
        )
    selected_location_id = min(common_locations, key=str)

    items: list[dict] = []
    stock_remaining_base: dict[tuple[UUID, UUID], Decimal] = {}
    stock_remaining_value: dict[tuple[UUID, UUID], Decimal] = {}
    for row, billed, free, candidates in prepared:
        factor = Decimal(str(row["uom_conversion_factor"]))
        product_id = UUID(str(row["product_id"]))
        location_candidates = sorted(
            (
                candidate for candidate in candidates
                if candidate["location_id"] == selected_location_id
                and candidate["is_value_backed"]
            ),
            key=lambda candidate: (
                candidate["expiry_date"], candidate["batch_number"],
                str(candidate["batch_id"]),
            ),
        )
        for candidate in location_candidates:
            key = (product_id, candidate["batch_id"])
            stock_remaining_base.setdefault(key, candidate["available_base_quantity"])
            stock_remaining_value.setdefault(key, candidate["inventory_value"])
        remaining_billed = billed
        remaining_free = free
        default_allocations: list[dict] = []
        eligible_batches: list[dict] = []
        for candidate in location_candidates:
            stock_key = (product_id, candidate["batch_id"])
            available_base = stock_remaining_base[stock_key]
            available = _dispatch_entered_availability(available_base, factor)
            if available <= 0:
                continue
            eligible_batches.append({
                **{
                    key: value for key, value in candidate.items()
                    if key not in {
                        "is_value_backed", "inventory_value", "average_unit_cost",
                    }
                },
                "available_quantity": available,
                "available_base_quantity": available_base,
                "fefo_priority": len(eligible_batches) + 1,
            })
            allocated_billed = min(remaining_billed, available)
            remaining_billed -= allocated_billed
            available -= allocated_billed
            allocated_free = min(remaining_free, available)
            remaining_free -= allocated_free
            if allocated_billed + allocated_free <= 0:
                continue
            issued_base = ((allocated_billed + allocated_free) * factor).quantize(
                _QUANTITY_QUANTUM
            )
            current_value = stock_remaining_value[stock_key]
            if issued_base == available_base:
                estimated_issue_value = current_value
            else:
                current_unit_cost = (current_value / available_base).quantize(
                    _RATE_QUANTUM, rounding=ROUND_HALF_UP,
                )
                estimated_issue_value = (issued_base * current_unit_cost).quantize(
                    _MONEY_QUANTUM, rounding=ROUND_HALF_UP,
                )
            if estimated_issue_value <= 0:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "The deterministic FEFO allocation has no positive inventory "
                        "value at accounting precision"
                    ),
                )
            stock_remaining_base[stock_key] -= issued_base
            stock_remaining_value[stock_key] -= estimated_issue_value
            default_allocations.append({
                "batch_id": candidate["batch_id"],
                "batch_number": candidate["batch_number"],
                "expiry_date": candidate["expiry_date"],
                "location_id": selected_location_id,
                "billed_quantity": allocated_billed,
                "free_quantity": allocated_free,
                "base_billed_quantity": (allocated_billed * factor).quantize(
                    _QUANTITY_QUANTUM
                ),
                "base_free_quantity": (allocated_free * factor).quantize(
                    _QUANTITY_QUANTUM
                ),
            })
        if remaining_billed != 0 or remaining_free != 0:
            raise HTTPException(
                status_code=409,
                detail="Sales-order dispatch context stock allocation is incomplete",
            )

        scalar = default_allocations[0] if len(default_allocations) == 1 else None
        scalar_candidate = next(
            (
                candidate for candidate in eligible_batches
                if scalar is not None and candidate["batch_id"] == scalar["batch_id"]
            ),
            None,
        )
        item = {
            key: value for key, value in row.items() if key not in {
                "line_number", "uom_candidate_count", "uom_conversion_factor",
                "dispatched_billed_quantity", "dispatched_free_quantity",
                "eligible_batches",
            }
        }
        item.update({
            "quantity": billed,
            "free_quantity": free,
            "location_id": selected_location_id,
            "batch_id": scalar["batch_id"] if scalar else None,
            "batch_number": scalar["batch_number"] if scalar else None,
            "expiry_date": scalar["expiry_date"] if scalar else None,
            "mrp": scalar_candidate["mrp"] if scalar_candidate else None,
            "available_quantity": sum(
                (candidate["available_quantity"] for candidate in eligible_batches),
                Decimal("0"),
            ),
            "eligible_batches": eligible_batches,
            "default_batch_allocations": default_allocations,
        })
        items.append(item)
    return items


@router.get(
    "/sales-orders/{order_id:uuid}",
    response_model=CanonicalSalesOrderImportDetail,
    operation_id="canonical_sales_order_uuid_compatibility_detail",
)
@router.get(
    "/canonical/sales-orders/{order_id}/import-detail",
    response_model=CanonicalSalesOrderImportDetail,
    operation_id="canonical_sales_order_import_detail",
)
def canonical_sales_order_compatibility_detail(
    order_id: UUID,
    dispatch_date: Optional[date] = None,
    user: dict = SALES_USER,
    db: Session = Depends(get_db),
):
    """Return a complete canonical order for invoice/challan import flows."""
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT document.id AS order_id, document.id,
               document.order_number, document.order_date,
               COALESCE(:dispatch_date, (transaction_timestamp()
                   AT TIME ZONE organization.timezone)::date) AS dispatch_context_date,
               document.requested_delivery_date AS delivery_date,
               document.status AS order_status, document.status,
               document.customer_account_id AS customer_id,
               party.legal_name AS customer_name,
               contact.phone AS customer_phone, contact.email AS customer_email,
               tax.registration_number AS customer_gst_number,
               billing.line1 AS billing_address,
               billing.city AS billing_city, billing.state_code AS billing_state,
               billing.postal_code AS billing_pincode,
               shipping.line1 AS shipping_address,
               shipping.city AS shipping_city, shipping.state_code AS shipping_state,
               shipping.postal_code AS shipping_pincode,
               to_char(document.grand_total, 'FM999999999999999990.00') AS total_amount,
               (SELECT count(*)
                  FROM sales.order_lines source_line
                 WHERE source_line.org_id=document.org_id
                   AND source_line.order_id=document.id
                   AND source_line.line_kind='product') AS source_item_count,
               document.created_at, document.updated_at
          FROM sales.orders document
          JOIN core.organizations organization
            ON organization.id=document.org_id AND organization.status='active'
          JOIN parties.customer_accounts account
            ON account.org_id=document.org_id AND account.id=document.customer_account_id
          JOIN parties.parties party
            ON party.org_id=account.org_id AND party.id=account.party_id
          JOIN parties.addresses billing
            ON billing.org_id=document.org_id AND billing.id=document.billing_address_id
          JOIN parties.addresses shipping
            ON shipping.org_id=document.org_id AND shipping.id=document.shipping_address_id
          LEFT JOIN LATERAL (
              SELECT phone, email
                FROM parties.contacts
               WHERE org_id=party.org_id AND party_id=party.id AND status='active'
               ORDER BY is_primary DESC, id LIMIT 1
          ) contact ON true
          LEFT JOIN LATERAL (
              SELECT registration_number
                FROM parties.tax_registrations
               WHERE org_id=party.org_id AND party_id=party.id
                 AND registration_type='GSTIN' AND status='active'
               ORDER BY verified_at DESC NULLS LAST, id LIMIT 1
          ) tax ON true
         WHERE document.org_id=:org_id AND document.id=:order_id
    """, {"org_id": org_id, "order_id": order_id, "dispatch_date": dispatch_date})
    if len(rows) != 1:
        raise HTTPException(status_code=404, detail="Sales order not found")
    result = rows[0]
    if result["status"] != "approved":
        raise HTTPException(
            status_code=409,
            detail="Only an approved, unfulfilled sales order can be imported",
        )
    if result["dispatch_context_date"] < result["order_date"]:
        raise HTTPException(
            status_code=409,
            detail="Dispatch context date cannot precede the approved sales order",
        )
    line_rows = _rows(db, """
        SELECT line.id, 'sales_order'::text AS source_document_kind,
               line.line_number, line.product_id,
               product.name AS product_name, product.sku AS product_code,
               product.hsn_code, document.branch_id,
               conversion.uom_conversion_id, conversion.candidate_count AS uom_candidate_count,
               line.uom_code, line.uom_code AS unit,
               line.uom_conversion_factor,
               line.billed_quantity AS quantity, line.free_quantity,
               line.free_supply_tax_treatment,
               line.quoted_unit_rate AS unit_price,
               CASE WHEN line.line_discount_kind='percent'
                    THEN line.line_discount_value ELSE 0 END AS discount_percent,
               line.cgst_rate + line.sgst_rate + line.igst_rate AS tax_rate,
               line.cgst_rate + line.sgst_rate + line.igst_rate AS gst_percent,
               line.gst_taxable_value AS taxable_amount,
               line.cgst_amount, line.sgst_amount, line.igst_amount, line.line_total,
               COALESCE(dispatched.billed_quantity, 0) AS dispatched_billed_quantity,
               COALESCE(dispatched.free_quantity, 0) AS dispatched_free_quantity,
               COALESCE(stock.eligible_batches, '[]'::jsonb) AS eligible_batches
          FROM sales.orders document
          JOIN core.organizations organization
            ON organization.id=document.org_id AND organization.status='active'
          JOIN sales.order_lines line
            ON line.org_id=document.org_id AND line.order_id=document.id
           AND line.line_kind='product' AND line.product_id IS NOT NULL
          JOIN catalog.products product
            ON product.org_id=line.org_id AND product.id=line.product_id
          LEFT JOIN LATERAL (
              SELECT CASE WHEN count(*)=1
                          THEN (array_agg(candidate.id ORDER BY candidate.id))[1]
                     END AS uom_conversion_id,
                     count(*)::integer AS candidate_count
                FROM catalog.uom_conversions candidate
               WHERE candidate.org_id=line.org_id
                 AND candidate.product_id=line.product_id
                 AND candidate.from_uom_code=line.uom_code
                 AND candidate.to_uom_code=product.base_uom_code
                 AND candidate.multiplier=line.uom_conversion_factor
                 AND candidate.status='active'
                 AND candidate.valid_from<=document.order_date
                 AND (candidate.valid_until IS NULL
                      OR candidate.valid_until>=document.order_date)
          ) conversion ON true
          LEFT JOIN LATERAL (
              SELECT sum(candidate_line.billed_quantity) AS billed_quantity,
                     sum(candidate_line.free_quantity) AS free_quantity
                FROM sales.dispatch_lines candidate_line
                JOIN sales.dispatches candidate_dispatch
                  ON candidate_dispatch.org_id=candidate_line.org_id
                 AND candidate_dispatch.id=candidate_line.dispatch_id
                 AND candidate_dispatch.status<>'cancelled'
               WHERE candidate_line.org_id=line.org_id
                 AND candidate_line.order_line_id=line.id
          ) dispatched ON true
          LEFT JOIN LATERAL (
              SELECT jsonb_agg(jsonb_build_object(
                         'batch_id', batch.id,
                         'batch_number', batch.batch_number,
                         'expiry_date', batch.expires_on,
                         'location_id', balance.location_id,
                         'location_name', location.name,
                         'mrp', batch.mrp,
                         'available_base_quantity', balance.on_hand_quantity,
                         'inventory_value', balance.inventory_value,
                         'average_unit_cost', balance.average_unit_cost
                     ) ORDER BY batch.expires_on, batch.batch_number, batch.id) AS eligible_batches
                FROM inventory.stock_balances balance
                JOIN inventory.batches batch
                  ON batch.org_id=balance.org_id AND batch.id=balance.batch_id
                 AND batch.product_id=balance.product_id
                 AND batch.lot_kind='manufacturer_batch'
                 AND batch.status='released' AND batch.released_at IS NOT NULL
                 AND batch.expires_on IS NOT NULL
                 AND batch.expires_on>CAST(:dispatch_date AS date)
                JOIN inventory.locations location
                  ON location.org_id=balance.org_id AND location.id=balance.location_id
                 AND location.branch_id=document.branch_id
                 AND location.status='active' AND location.allows_sale
               WHERE balance.org_id=line.org_id
                 AND balance.branch_id=document.branch_id
                 AND balance.product_id=line.product_id
                 AND balance.on_hand_quantity>0
          ) stock ON true
         WHERE document.org_id=:org_id AND document.id=:order_id
         ORDER BY line.line_number, line.id
    """, {
        "org_id": org_id, "order_id": order_id,
        "dispatch_date": result["dispatch_context_date"],
    })
    if int(result["source_item_count"]) <= 0 or len(line_rows) != int(result["source_item_count"]):
        raise HTTPException(
            status_code=409,
            detail="Sales-order dispatch context requires product-only canonical lines",
        )
    result["items"] = _build_sales_order_dispatch_context(line_rows)
    result["source_item_count"] = len(result["items"])
    result["importable_item_count"] = len(result["items"])
    return result


@router.get("/sales-orders/")
def sales_orders(limit: int = Query(100, ge=1, le=500), skip: int = Query(0, ge=0),
                 search: str = Query("", max_length=200),
                 user: dict = SALES_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _sales_rows(db, org_id, "orders", "order_number", "order_date",
                       "order_lines", "order_id", limit, skip, search=search)
    for row in rows:
        row.update(order_id=row["id"], order_number=row["document_number"],
                   order_date=row["document_date"])
    total = int(rows[0].get("filtered_total", len(rows))) if rows else 0
    for row in rows:
        row.pop("filtered_total", None)
    return {"orders": rows, "total": total, "page": skip // limit + 1,
            "per_page": limit, "total_pages": (total + limit - 1) // limit}


@router.get("/challan/")
def challans(limit: int = Query(100, ge=1, le=500), skip: int = Query(0, ge=0),
             user: dict = SALES_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    return _rows(db, """
        SELECT dispatch.id AS challan_id, dispatch.dispatch_number AS challan_number,
               dispatch.dispatch_date AS challan_date, dispatch.status,
               dispatch.customer_account_id AS customer_id, party.legal_name AS customer_name,
               dispatch.transporter_name, dispatch.vehicle_number, dispatch.created_at,
               0::numeric AS total_amount
          FROM sales.dispatches dispatch
          JOIN parties.customer_accounts account ON account.org_id=dispatch.org_id AND account.id=dispatch.customer_account_id
          JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
         WHERE dispatch.org_id=:org_id ORDER BY dispatch.dispatch_date DESC, dispatch.id DESC
         LIMIT :limit OFFSET :skip
    """, {"org_id": org_id, "limit": limit, "skip": skip})


@router.get(
    "/challan/{challan_id:uuid}",
    response_model=CanonicalChallanImportDetail,
    operation_id="canonical_challan_uuid_compatibility_detail",
)
@router.get(
    "/canonical/challans/{challan_id}/import-detail",
    response_model=CanonicalChallanImportDetail,
    operation_id="canonical_challan_import_detail",
)
def canonical_challan_compatibility_detail(
    challan_id: UUID,
    user: dict = SALES_USER,
    db: Session = Depends(get_db),
):
    """Return the canonical dispatch lines required by invoice import flows."""
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT dispatch.id AS challan_id, dispatch.id,
               dispatch.dispatch_number AS challan_number,
               dispatch.dispatch_date AS challan_date, dispatch.status,
               dispatch.customer_account_id AS customer_id,
               party.legal_name AS customer_name,
               contact.phone AS customer_phone, contact.email AS customer_email,
               dispatch.destination_address_line1 AS delivery_address,
               dispatch.destination_city AS delivery_city,
               dispatch.destination_state_code AS delivery_state,
               dispatch.destination_pincode AS delivery_pincode,
               dispatch.transporter_name AS transport_company,
               dispatch.vehicle_number,
               dispatch.transport_document_number AS lr_number,
               COALESCE(lines.items, '[]'::jsonb) AS items,
               to_char(
                   COALESCE(lines.total_amount, 0),
                   'FM999999999999999990.00'
               ) AS total_amount,
               (SELECT count(*) FROM sales.dispatch_lines source_line
                 WHERE source_line.org_id=dispatch.org_id
                   AND source_line.dispatch_id=dispatch.id) AS source_item_count,
               COALESCE(lines.importable_item_count, 0) AS importable_item_count,
               dispatch.created_at, dispatch.updated_at
          FROM sales.dispatches dispatch
          JOIN parties.customer_accounts account
            ON account.org_id=dispatch.org_id
           AND account.id=dispatch.customer_account_id
          JOIN parties.parties party
            ON party.org_id=account.org_id AND party.id=account.party_id
          LEFT JOIN LATERAL (
              SELECT phone, email
                FROM parties.contacts
               WHERE org_id=party.org_id AND party_id=party.id AND status='active'
               ORDER BY is_primary DESC, id LIMIT 1
          ) contact ON true
          LEFT JOIN LATERAL (
              SELECT jsonb_agg(jsonb_build_object(
                         'id', line.id, 'product_id', line.product_id,
                         'product_name', product.name, 'product_code', product.sku,
                         'hsn_code', product.hsn_code, 'branch_id', dispatch.branch_id,
                         'uom_conversion_id', conversion.id, 'uom_code', line.uom_code,
                         'unit', line.uom_code, 'quantity',
                             to_char(line.billed_quantity, 'FM999999999999999990.000000'),
                         'dispatched_quantity',
                             to_char(line.billed_quantity, 'FM999999999999999990.000000'),
                         'free_quantity',
                             to_char(line.free_quantity, 'FM999999999999999990.000000'),
                         'free_supply_tax_treatment', order_line.free_supply_tax_treatment,
                         'unit_price', to_char(
                             order_line.quoted_unit_rate,
                             'FM999999999999999990.0000'),
                         'discount_percent', to_char(CASE
                             WHEN order_line.line_discount_kind='percent'
                             THEN order_line.line_discount_value ELSE 0 END,
                             'FM999999999999999990.000000'),
                         'tax_rate', to_char(
                             order_line.cgst_rate + order_line.sgst_rate
                                 + order_line.igst_rate,
                             'FM999999999999999990.000000'),
                         'gst_percent', to_char(
                             order_line.cgst_rate + order_line.sgst_rate
                                 + order_line.igst_rate,
                             'FM999999999999999990.000000'),
                         'taxable_amount', to_char(
                             order_line.gst_taxable_value,
                             'FM999999999999999990.00'),
                         'cgst_amount', to_char(
                             order_line.cgst_amount,
                             'FM999999999999999990.00'),
                         'sgst_amount', to_char(
                             order_line.sgst_amount,
                             'FM999999999999999990.00'),
                         'igst_amount', to_char(
                             order_line.igst_amount,
                             'FM999999999999999990.00'),
                         'line_total', to_char(
                             order_line.line_total,
                             'FM999999999999999990.00'),
                         'batch_id', line.batch_id, 'batch_number', batch.batch_number,
                         'expiry_date', batch.expires_on, 'mrp', to_char(
                             batch.mrp, 'FM999999999999999990.0000'),
                         'batch_allocations', jsonb_build_array(jsonb_build_object(
                             'source_kind', 'dispatch_allocation',
                             'allocation_id', line.id,
                             'source_line_id', line.id,
                             'command_request_id', command.command_request_id,
                             'inventory_document_id', inventory_document.id,
                             'inventory_document_line_id', inventory_line.id,
                             'invoice_dispatch_allocation_id', NULL,
                             'dispatch_id', dispatch.id,
                             'dispatch_line_id', line.id,
                             'batch_id', line.batch_id,
                             'batch_number', batch.batch_number,
                             'expiry_date', batch.expires_on,
                             'from_location_id', line.from_location_id,
                             'base_quantity', to_char(
                                 inventory_line.base_quantity,
                                 'FM999999999999999990.000000'),
                             'base_billed_quantity', to_char(
                                 line.base_billed_quantity,
                                 'FM999999999999999990.000000'),
                             'base_free_quantity', to_char(
                                 line.base_free_quantity,
                                 'FM999999999999999990.000000'),
                             'billed_quantity', to_char(
                                 line.billed_quantity,
                                 'FM999999999999999990.000000'),
                             'free_quantity', to_char(
                                 line.free_quantity,
                                 'FM999999999999999990.000000')
                         ))
                     ) ORDER BY line.line_number) AS items,
                     SUM(order_line.line_total) AS total_amount,
                     count(*)::integer AS importable_item_count
                FROM sales.dispatch_lines line
                JOIN sales.order_lines order_line
                  ON order_line.org_id=line.org_id AND order_line.id=line.order_line_id
                JOIN catalog.products product
                  ON product.org_id=line.org_id AND product.id=line.product_id
                JOIN inventory.batches batch
                  ON batch.org_id=line.org_id AND batch.id=line.batch_id
                JOIN LATERAL (
                    SELECT candidate.id
                      FROM (
                            SELECT candidate_conversion.id,
                                   count(*) OVER () AS candidate_count
                              FROM catalog.uom_conversions candidate_conversion
                             WHERE candidate_conversion.org_id=line.org_id
                               AND candidate_conversion.product_id=line.product_id
                               AND candidate_conversion.from_uom_code=line.uom_code
                               AND candidate_conversion.to_uom_code=product.base_uom_code
                               AND candidate_conversion.multiplier=order_line.uom_conversion_factor
                               AND candidate_conversion.status='active'
                               AND candidate_conversion.valid_from<=dispatch.dispatch_date
                               AND (candidate_conversion.valid_until IS NULL
                                    OR candidate_conversion.valid_until>=dispatch.dispatch_date)
                           ) candidate
                     WHERE candidate.candidate_count=1
                ) conversion ON true
                JOIN LATERAL (
                    SELECT candidate.id
                      FROM (
                            SELECT candidate_document.id,
                                   count(*) OVER () AS candidate_count
                              FROM inventory.inventory_documents candidate_document
                             WHERE candidate_document.org_id=line.org_id
                               AND candidate_document.sales_dispatch_id=dispatch.id
                               AND candidate_document.document_type='sales_issue'
                               AND candidate_document.status='posted'
                           ) candidate
                     WHERE candidate.candidate_count=1
                ) inventory_document ON true
                JOIN LATERAL (
                    SELECT candidate.id, candidate.base_quantity
                      FROM (
                            SELECT candidate_line.id, candidate_line.base_quantity,
                                   count(*) OVER () AS candidate_count
                              FROM inventory.inventory_document_lines candidate_line
                             WHERE candidate_line.org_id=line.org_id
                               AND candidate_line.inventory_document_id=inventory_document.id
                               AND candidate_line.sales_dispatch_line_id=line.id
                               AND candidate_line.movement_kind='issue'
                               AND candidate_line.product_id=line.product_id
                               AND candidate_line.batch_id=line.batch_id
                               AND candidate_line.from_location_id=line.from_location_id
                           ) candidate
                     WHERE candidate.candidate_count=1
                ) inventory_line ON true
                JOIN LATERAL (
                    SELECT candidate.command_request_id
                      FROM erp_automation_reads.sales_dispatch_post_provenance(
                           dispatch.org_id, dispatch.id
                      ) candidate
                ) command ON true
               WHERE line.org_id=dispatch.org_id AND line.dispatch_id=dispatch.id
                 AND NOT EXISTS (
                       SELECT 1
                         FROM sales.invoice_dispatch_allocations consumed
                        WHERE consumed.org_id=line.org_id
                          AND consumed.dispatch_line_id=line.id
                 )
          ) lines ON true
         WHERE dispatch.org_id=:org_id AND dispatch.id=:challan_id
    """, {"org_id": org_id, "challan_id": challan_id})
    if len(rows) != 1:
        raise HTTPException(status_code=404, detail="Delivery challan not found")
    result = rows[0]
    if result["status"] != "posted":
        raise HTTPException(
            status_code=409,
            detail="Only a posted delivery challan can be imported into an invoice",
        )
    if (
        int(result["source_item_count"]) <= 0
        or int(result["source_item_count"]) != int(result["importable_item_count"])
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "Delivery challan is already invoiced or its posted command, inventory, "
                "dispatch, or UOM lineage is incomplete"
            ),
        )
    return result


@router.get("/purchases/")
def purchase_orders(limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0),
                    date_from: Optional[str] = None, date_to: Optional[str] = None,
                    from_date: Optional[str] = None, to_date: Optional[str] = None,
                    search: Optional[str] = Query(None, max_length=100),
                    status_filter: Optional[str] = Query(None, alias="status"),
                    user: dict = PURCHASE_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    range_from = date_from or from_date
    range_to = date_to or to_date
    rows = _rows(db, """
        SELECT purchase.id AS po_id, purchase.id AS purchase_order_id,
               purchase.purchase_order_number AS po_number, purchase.purchase_order_number AS order_number,
               purchase.order_date AS po_date, purchase.order_date,
               purchase.expected_delivery_date, purchase.status,
               purchase.supplier_account_id AS supplier_id, party.legal_name AS supplier_name,
               purchase.grand_total AS total_amount,
               COALESCE(lines.items_count,0) AS items_count,
               count(*) OVER() AS _total,
               purchase.created_at, purchase.updated_at
          FROM procurement.purchase_orders purchase
          JOIN parties.supplier_accounts account ON account.org_id=purchase.org_id AND account.id=purchase.supplier_account_id
          JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
          LEFT JOIN LATERAL (
              SELECT count(*) AS items_count
                FROM procurement.purchase_order_lines line
               WHERE line.org_id=purchase.org_id AND line.purchase_order_id=purchase.id
                 AND line.line_kind='product'
          ) lines ON true
         WHERE purchase.org_id=:org_id
           AND (:date_from IS NULL OR purchase.order_date >= CAST(:date_from AS date))
           AND (:date_to IS NULL OR purchase.order_date <= CAST(:date_to AS date))
           AND (:status IS NULL OR purchase.status=:status)
           AND (:search IS NULL OR purchase.purchase_order_number ILIKE '%%' || :search || '%%'
                OR party.legal_name ILIKE '%%' || :search || '%%')
         ORDER BY purchase.order_date DESC, purchase.id DESC
         LIMIT :limit OFFSET :offset
    """, {"org_id": org_id, "date_from": range_from, "date_to": range_to,
            "search": search.strip() if search and search.strip() else None,
            "status": status_filter, "limit": limit, "offset": offset})
    total = int(rows[0].pop("_total", 0)) if rows else 0
    for row in rows[1:]:
        row.pop("_total", None)
    return {"orders": rows, "purchases": rows, "total": total}


@router.get("/supplier-invoices/")
def supplier_invoices(limit: int = Query(100, ge=1, le=500), skip: int = Query(0, ge=0),
                      from_date: Optional[str] = None, to_date: Optional[str] = None,
                      search: Optional[str] = Query(None, max_length=100),
                      payment_status: Optional[Literal["paid", "partial", "pending", "overdue"]] = None,
                      user: dict = PURCHASE_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _rows(db, """
        WITH business_clock AS MATERIALIZED (
            SELECT erp_core_commands.current_organization_business_date()
                     AS business_date
        )
        SELECT invoice.id AS supplier_invoice_id,
               invoice.supplier_invoice_number AS invoice_number,
               invoice.supplier_invoice_date AS invoice_date, invoice.due_date,
               invoice.status, invoice.supplier_account_id AS supplier_id,
               invoice.supplier_legal_name_snapshot AS supplier_name,
               invoice.supplier_gstin_snapshot AS supplier_gst_number,
               invoice.gst_taxable_total AS taxable_amount,
               invoice.cgst_total AS cgst_amount,
               invoice.sgst_total AS sgst_amount,
               invoice.igst_total AS igst_amount,
               invoice.cess_total AS cess_amount,
               invoice.grand_total AS invoice_total, invoice.grand_total AS total_amount,
               GREATEST(invoice.grand_total-COALESCE(payable.outstanding_amount,invoice.grand_total),0) AS paid_amount,
               COALESCE(payable.outstanding_amount,invoice.grand_total) AS pending_amount,
               CASE
                 WHEN COALESCE(payable.outstanding_amount,invoice.grand_total)<=0 THEN 'paid'
                 WHEN COALESCE(payable.outstanding_amount,invoice.grand_total)<invoice.grand_total THEN 'partial'
                 WHEN invoice.due_date<business_clock.business_date THEN 'overdue'
                 ELSE 'pending'
               END AS payment_status,
               COALESCE(lines.items_count,0) AS items_count,
               count(*) OVER() AS _total,
               invoice.created_at, invoice.updated_at
          FROM procurement.supplier_invoices invoice
          CROSS JOIN business_clock
          LEFT JOIN LATERAL (
              SELECT GREATEST(item.principal_amount-COALESCE(applied.amount,0),0) AS outstanding_amount
                FROM finance.accounting_events event
                JOIN finance.open_items item
                  ON item.org_id=event.org_id AND item.accounting_event_id=event.id
                 AND item.item_side='payable' AND item.status<>'reversed'
                LEFT JOIN LATERAL (
                    SELECT SUM(allocation.amount) AS amount
                      FROM finance.allocations allocation
                     WHERE allocation.org_id=item.org_id AND allocation.open_item_id=item.id
                       AND allocation.status='posted'
                       AND allocation.reversal_of_allocation_id IS NULL
                       AND NOT EXISTS (
                           SELECT 1 FROM finance.allocations reversal
                            WHERE reversal.org_id=allocation.org_id
                              AND reversal.reversal_of_allocation_id=allocation.id)
                ) applied ON true
               WHERE event.org_id=invoice.org_id AND event.supplier_invoice_id=invoice.id
               ORDER BY item.id LIMIT 1
          ) payable ON true
          LEFT JOIN LATERAL (
              SELECT count(*) AS items_count
                FROM procurement.supplier_invoice_lines line
               WHERE line.org_id=invoice.org_id AND line.supplier_invoice_id=invoice.id
                 AND line.line_kind='product'
          ) lines ON true
         WHERE invoice.org_id=:org_id
           AND (:from_date IS NULL OR invoice.supplier_invoice_date >= CAST(:from_date AS date))
           AND (:to_date IS NULL OR invoice.supplier_invoice_date <= CAST(:to_date AS date))
           AND (:search IS NULL OR invoice.supplier_invoice_number ILIKE '%%' || :search || '%%'
                OR invoice.supplier_legal_name_snapshot ILIKE '%%' || :search || '%%')
           AND (:payment_status IS NULL OR CASE
                 WHEN COALESCE(payable.outstanding_amount,invoice.grand_total)<=0 THEN 'paid'
                 WHEN COALESCE(payable.outstanding_amount,invoice.grand_total)<invoice.grand_total THEN 'partial'
                 WHEN invoice.due_date<business_clock.business_date THEN 'overdue'
                 ELSE 'pending' END=:payment_status)
         ORDER BY invoice.supplier_invoice_date DESC, invoice.id DESC
         LIMIT :limit OFFSET :skip
    """, {"org_id": org_id, "from_date": from_date, "to_date": to_date,
            "search": search.strip() if search and search.strip() else None,
            "payment_status": payment_status, "limit": limit, "skip": skip})
    total = int(rows[0].pop("_total", 0)) if rows else 0
    for row in rows[1:]:
        row.pop("_total", None)
    return {"invoices": rows, "total": total}


@router.get("/supplier-invoices/returnable/")
def returnable_supplier_invoices(
    supplier_id: Optional[UUID] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    skip: int = Query(0, ge=0),
    user: dict = PURCHASE_USER,
    db: Session = Depends(get_db),
):
    """Posted supplier invoices with receipt allocations still eligible for return."""
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT invoice.id AS supplier_invoice_id, invoice.id AS invoice_id,
               invoice.supplier_invoice_number, invoice.supplier_invoice_number AS invoice_number,
               invoice.supplier_invoice_date AS invoice_date,
               invoice.supplier_account_id AS supplier_id,
               invoice.supplier_legal_name_snapshot AS supplier_name,
               invoice.grand_total AS total_amount, invoice.grand_total AS invoice_amount,
               count(*) OVER() AS _total
          FROM procurement.supplier_invoices invoice
         WHERE invoice.org_id=:org_id AND invoice.status='posted'
           AND (:supplier_id IS NULL OR invoice.supplier_account_id=CAST(:supplier_id AS uuid))
           AND (:from_date IS NULL OR invoice.supplier_invoice_date>=CAST(:from_date AS date))
           AND (:to_date IS NULL OR invoice.supplier_invoice_date<=CAST(:to_date AS date))
           AND EXISTS (
               SELECT 1
                 FROM procurement.supplier_invoice_lines invoice_line
                 JOIN procurement.supplier_invoice_receipt_allocations allocation
                   ON allocation.org_id=invoice_line.org_id
                  AND allocation.supplier_invoice_line_id=invoice_line.id
                 LEFT JOIN LATERAL (
                     SELECT COALESCE(SUM(return_line.base_billed_quantity),0) AS billed,
                            COALESCE(SUM(return_line.base_free_quantity),0) AS free
                       FROM procurement.purchase_return_lines return_line
                       JOIN procurement.purchase_returns return_header
                         ON return_header.org_id=return_line.org_id
                        AND return_header.id=return_line.purchase_return_id
                        AND return_header.status='posted'
                      WHERE return_line.org_id=allocation.org_id
                        AND return_line.supplier_invoice_receipt_allocation_id=allocation.id
                 ) returned ON true
                WHERE invoice_line.org_id=invoice.org_id
                  AND invoice_line.supplier_invoice_id=invoice.id
                  AND (allocation.allocated_base_billed_quantity>returned.billed
                       OR allocation.allocated_base_free_quantity>returned.free)
           )
         ORDER BY invoice.supplier_invoice_date DESC, invoice.id DESC
         LIMIT :limit OFFSET :skip
    """, {"org_id": org_id, "supplier_id": supplier_id, "from_date": from_date,
            "to_date": to_date, "limit": limit, "skip": skip})
    total = int(rows[0].pop("_total", 0)) if rows else 0
    for row in rows[1:]:
        row.pop("_total", None)
    return {"invoices": rows, "total": total, "skip": skip, "limit": limit}


@router.get("/purchase-returns/supplier-invoice/{invoice_id:uuid}/returnable-items")
def returnable_supplier_invoice_items(
    invoice_id: UUID,
    user: dict = PURCHASE_USER,
    db: Session = Depends(get_db),
):
    """Canonical receipt allocations remaining against one posted supplier invoice."""
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT allocation.id AS supplier_invoice_receipt_allocation_id,
               invoice_line.id AS invoice_item_id,
               receipt_line.id AS grn_item_id,
               receipt_line.product_id, product.name AS product_name,
               receipt_line.batch_id, batch.batch_number,
               invoice_line.uom_code AS unit,
               invoice_line.uom_code AS uom_code,
               product.base_uom_code,
               receipt_line.uom_code AS receipt_uom_code,
               invoice_line.uom_conversion_factor,
               invoice_line.quoted_unit_rate AS unit_price,
               CASE
                 WHEN invoice_line.line_discount_kind='percent' THEN invoice_line.line_discount_value
                 WHEN invoice_line.gross_amount>0
                   THEN round(invoice_line.line_discount_amount/invoice_line.gross_amount*100,6)
                 ELSE 0
               END AS discount_percent,
               GREATEST(invoice_line.cgst_rate+invoice_line.sgst_rate,invoice_line.igst_rate)
                 +invoice_line.cess_rate AS tax_percent,
               product.hsn_code,
               batch.expires_on AS expiry_date, batch.manufactured_on AS manufacturing_date,
               allocation.allocated_base_billed_quantity AS allocated_base_billed_quantity,
               allocation.allocated_base_free_quantity AS allocated_base_free_quantity,
               returned.base_billed AS returned_base_billed_quantity,
               returned.base_free AS returned_base_free_quantity,
               GREATEST(allocation.allocated_base_billed_quantity-returned.base_billed,0)
                 AS remaining_base_billed_quantity,
               GREATEST(allocation.allocated_base_free_quantity-returned.base_free,0)
                 AS remaining_base_free_quantity,
               allocation.allocated_base_billed_quantity
                 / NULLIF(invoice_line.uom_conversion_factor,0) AS invoice_quantity,
               allocation.allocated_base_free_quantity
                 / NULLIF(invoice_line.uom_conversion_factor,0) AS invoice_free_quantity,
               returned.base_billed / NULLIF(invoice_line.uom_conversion_factor,0)
                 AS already_returned,
               returned.base_free / NULLIF(invoice_line.uom_conversion_factor,0)
                 AS already_returned_free_quantity,
               GREATEST(allocation.allocated_base_billed_quantity-returned.base_billed,0)
                 / NULLIF(invoice_line.uom_conversion_factor,0) AS returnable_quantity,
               GREATEST(allocation.allocated_base_free_quantity-returned.base_free,0)
                 / NULLIF(invoice_line.uom_conversion_factor,0) AS returnable_free_quantity,
               GREATEST(allocation.allocated_base_billed_quantity-returned.base_billed,0)
                 / NULLIF(invoice_line.uom_conversion_factor,0) AS max_returnable_qty,
               (allocation.allocated_base_billed_quantity>returned.base_billed
                 OR allocation.allocated_base_free_quantity>returned.base_free) AS can_return
          FROM procurement.supplier_invoice_lines invoice_line
          JOIN procurement.supplier_invoices invoice
            ON invoice.org_id=invoice_line.org_id AND invoice.id=invoice_line.supplier_invoice_id
           AND invoice.status='posted'
          JOIN procurement.supplier_invoice_receipt_allocations allocation
            ON allocation.org_id=invoice_line.org_id
           AND allocation.supplier_invoice_line_id=invoice_line.id
          JOIN procurement.goods_receipt_lines receipt_line
            ON receipt_line.org_id=allocation.org_id
           AND receipt_line.id=allocation.goods_receipt_line_id
          JOIN procurement.goods_receipts receipt
            ON receipt.org_id=receipt_line.org_id AND receipt.id=receipt_line.goods_receipt_id
           AND receipt.status='posted'
          JOIN catalog.products product
            ON product.org_id=receipt_line.org_id AND product.id=receipt_line.product_id
          JOIN inventory.batches batch
            ON batch.org_id=receipt_line.org_id AND batch.id=receipt_line.batch_id
          LEFT JOIN LATERAL (
              SELECT COALESCE(SUM(return_line.base_billed_quantity),0) AS base_billed,
                     COALESCE(SUM(return_line.base_free_quantity),0) AS base_free
                FROM procurement.purchase_return_lines return_line
                JOIN procurement.purchase_returns return_header
                  ON return_header.org_id=return_line.org_id
                 AND return_header.id=return_line.purchase_return_id
                 AND return_header.status='posted'
               WHERE return_line.org_id=allocation.org_id
                 AND return_line.supplier_invoice_receipt_allocation_id=allocation.id
          ) returned ON true
         WHERE invoice_line.org_id=:org_id AND invoice_line.supplier_invoice_id=:invoice_id
           AND (allocation.allocated_base_billed_quantity>returned.base_billed
                OR allocation.allocated_base_free_quantity>returned.base_free)
         ORDER BY invoice_line.line_number, receipt.received_at, receipt_line.line_number
    """, {"org_id": org_id, "invoice_id": invoice_id})
    return {"items": rows}


@router.get("/grn")
@router.get("/grn/")
def goods_receipts(limit: int = Query(100, ge=1, le=500), skip: int = Query(0, ge=0),
                   search: Optional[str] = Query(None, max_length=100),
                   status_filter: Optional[str] = Query(None, alias="status"),
                   from_date: Optional[str] = None, to_date: Optional[str] = None,
                   user: dict = PURCHASE_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT receipt.id AS grn_id, receipt.goods_receipt_number AS grn_number,
               receipt.received_at AS grn_date, receipt.status AS grn_status,
               receipt.status='posted' AS stock_updated,
               receipt.supplier_account_id AS supplier_id, party.legal_name AS supplier_name,
               receipt.supplier_challan_number AS invoice_number,
               receipt.supplier_challan_number AS supplier_invoice_number,
               COALESCE(lines.items_count,0) AS items_count,
               COALESCE(lines.total_amount,0) AS total_amount,
               count(*) OVER() AS _total,
               receipt.created_at, receipt.updated_at
          FROM procurement.goods_receipts receipt
          JOIN core.organizations organization
            ON organization.id=receipt.org_id AND organization.status='active'
          JOIN parties.supplier_accounts account ON account.org_id=receipt.org_id AND account.id=receipt.supplier_account_id
          JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
          LEFT JOIN LATERAL (
              SELECT count(*) AS items_count, SUM(line.extended_cost) AS total_amount
                FROM procurement.goods_receipt_lines line
               WHERE line.org_id=receipt.org_id AND line.goods_receipt_id=receipt.id
          ) lines ON true
         WHERE receipt.org_id=:org_id
           AND (:from_date IS NULL OR
                (receipt.received_at AT TIME ZONE organization.timezone)::date
                  >=CAST(:from_date AS date))
           AND (:to_date IS NULL OR
                (receipt.received_at AT TIME ZONE organization.timezone)::date
                  <=CAST(:to_date AS date))
           AND (:status IS NULL OR receipt.status=:status)
           AND (:search IS NULL OR receipt.goods_receipt_number ILIKE '%%' || :search || '%%'
                OR party.legal_name ILIKE '%%' || :search || '%%'
                OR receipt.supplier_challan_number ILIKE '%%' || :search || '%%')
         ORDER BY receipt.received_at DESC, receipt.id DESC
         LIMIT :limit OFFSET :skip
    """, {"org_id": org_id, "search": search.strip() if search and search.strip() else None,
            "status": status_filter, "from_date": from_date, "to_date": to_date,
            "limit": limit, "skip": skip})
    total = int(rows[0].pop("_total", 0)) if rows else 0
    for row in rows[1:]:
        row.pop("_total", None)
    return {"grns": rows, "total": total}


@router.get("/gst/reports/credit-debit-notes")
def gst_adjustment_notes(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    note_type: str = "all",
    side: Optional[str] = None,
    user: dict = Depends(PermissionChecker("gst", "view")),
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT note.id AS note_id, note.note_number, note.note_date,
               CONCAT(note.side, '_', note.direction) AS note_type,
               note.side, note.direction, note.document_effect,
               note.party_id, party.legal_name AS party_name,
               note.gst_taxable_value AS taxable_amount,
               note.cgst_amount, note.sgst_amount, note.igst_amount,
               note.counterparty_payable_amount AS total_amount,
               note.status
          FROM finance.adjustment_notes note
          JOIN parties.parties party ON party.org_id=note.org_id AND party.id=note.party_id
         WHERE note.org_id=:org_id AND note.status='posted'
           AND (:from_date IS NULL OR note.note_date >= CAST(:from_date AS date))
           AND (:to_date IS NULL OR note.note_date <= CAST(:to_date AS date))
           AND (:side IS NULL OR note.side=:side)
           AND (:note_type='all' OR note.direction=:note_type
                OR CONCAT(note.side, '_', note.direction)=:note_type)
         ORDER BY note.note_date DESC, note.id DESC
    """, {"org_id": org_id, "from_date": from_date, "to_date": to_date,
            "side": side, "note_type": note_type})
    return {"notes": rows, "total": len(rows)}


@router.get("/accounts/chart")
@router.get("/journal-entries/chart-of-accounts")
def chart_of_accounts(user: dict = FINANCE_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    return _rows(db, """
        SELECT id AS account_id, code AS account_code, name AS account_name,
               account_type, parent_account_id, currency_code,
               allows_party_posting, allows_bank_reconciliation,
               status='active' AS is_active, status
          FROM finance.accounts WHERE org_id=:org_id ORDER BY code, id
    """, {"org_id": org_id})


class CanonicalUnpaidInvoice(BaseModel):
    invoice_id: UUID
    open_item_id: UUID
    branch_id: UUID
    invoice_number: str
    invoice_date: date
    customer_id: UUID
    customer_name: str
    total_amount: MoneyJSON
    allocated: MoneyJSON
    due: MoneyJSON
    payment_status: str


class CanonicalUnpaidInvoicesResponse(BaseModel):
    invoices: list[CanonicalUnpaidInvoice]
    invoice_count: int = Field(ge=0)

    @model_validator(mode="after")
    def validate_cardinality(self):
        if self.invoice_count != len(self.invoices):
            raise ValueError("unpaid invoice projection cardinality is incomplete")
        open_item_ids = [invoice.open_item_id for invoice in self.invoices]
        if len(open_item_ids) != len(set(open_item_ids)):
            raise ValueError("unpaid invoice projection repeats an open item")
        return self


class CanonicalInvoiceAllocationSummary(BaseModel):
    invoice_id: UUID
    invoice_number: str
    total_amount: MoneyJSON
    allocated_amount: MoneyJSON
    due_amount: MoneyJSON
    payment_status: str


class CanonicalInvoicePayment(BaseModel):
    allocation_id: UUID
    payment_id: UUID
    payment_number: str
    payment_date: date
    payment_amount: MoneyJSON
    allocated_amount: MoneyJSON
    allocation_date: date
    allocation_type: str = "manual"


class CanonicalInvoicePaymentsResponse(BaseModel):
    invoice: CanonicalInvoiceAllocationSummary
    payments: list[CanonicalInvoicePayment]


class CanonicalReceiptAllocationReadback(BaseModel):
    model_config = ConfigDict(extra="forbid")

    allocation_id: UUID
    open_item_id: UUID
    amount: MoneyJSON
    allocation_date: date


class CanonicalReceiptAllocationReversalReadback(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reversal_allocation_id: UUID
    original_allocation_id: UUID
    open_item_id: UUID
    amount: MoneyJSON
    reversal_date: date


class CanonicalReceiptJournalLineReadback(BaseModel):
    model_config = ConfigDict(extra="forbid")

    journal_line_id: UUID
    line_number: int = Field(gt=0)
    account_id: UUID
    party_id: Optional[UUID]
    transaction_debit: MoneyJSON
    transaction_credit: MoneyJSON
    functional_debit: MoneyJSON
    functional_credit: MoneyJSON


class CanonicalReceiptAdvanceReadback(BaseModel):
    model_config = ConfigDict(extra="forbid")

    open_item_id: UUID
    sales_order_id: UUID
    principal_amount: MoneyJSON
    allocated_amount: MoneyJSON
    residual_amount: MoneyJSON
    status: Literal["open", "settled"]


class CanonicalReceiptTerminalActionReadback(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action_payment_id: UUID
    action: Literal["cheque_clearance", "cheque_bounce"]
    action_date: date
    evidence_attachment_id: UUID
    journal_entry_id: UUID
    journal_number: str
    journal_debit_total: MoneyJSON
    journal_credit_total: MoneyJSON


class CanonicalCustomerReceiptReadback(BaseModel):
    model_config = ConfigDict(extra="forbid")

    payment_id: UUID
    payment_number: str
    row_version: int = Field(ge=1)
    payment_date: date
    branch_id: UUID
    party_id: UUID
    settlement_account_id: UUID
    bank_account_id: Optional[UUID]
    payment_method: Literal["cash", "cheque", "bank_transfer", "card", "upi"]
    payment_purpose: Literal["commercial_settlement", "customer_advance"]
    sales_order_id: Optional[UUID]
    evidence_attachment_id: UUID
    instrument_number: Optional[str]
    instrument_date: Optional[date]
    drawee_bank_name: Optional[str]
    account_payee_confirmed: Optional[bool]
    external_reference: str
    amount: MoneyJSON
    status: Literal["posted"]
    journal_entry_id: UUID
    journal_number: str
    journal_debit_total: MoneyJSON
    journal_credit_total: MoneyJSON
    allocations: list[CanonicalReceiptAllocationReadback]
    reversed_allocations: list[CanonicalReceiptAllocationReversalReadback]
    advance: Optional[CanonicalReceiptAdvanceReadback]
    terminal_actions: list[CanonicalReceiptTerminalActionReadback]
    journal_lines: list[CanonicalReceiptJournalLineReadback]
    allocation_reconciled: Literal[True]
    journal_balanced: Literal[True]

    @model_validator(mode="after")
    def validate_accounting_evidence(self):
        amount = Decimal(self.amount)
        open_items = [allocation.open_item_id for allocation in self.allocations]
        if len(open_items) != len(set(open_items)):
            raise ValueError("posted receipt readback repeats an open item")
        allocation_total = sum(
            (Decimal(row.amount) for row in self.allocations), Decimal("0")
        )
        reversal_total = sum(
            (Decimal(row.amount) for row in self.reversed_allocations), Decimal("0")
        )
        bounced = bool(self.terminal_actions and self.terminal_actions[0].action == "cheque_bounce")
        if self.payment_purpose == "commercial_settlement":
            if self.advance is not None or (
                (bounced and (self.allocations or not self.reversed_allocations or reversal_total != amount))
                or (not bounced and (not self.allocations or self.reversed_allocations or allocation_total != amount))
            ):
                raise ValueError("posted invoice receipt allocations do not reconcile")
        elif self.allocations or self.reversed_allocations or self.advance is None:
            raise ValueError("posted customer advance requires zero invoice allocations")
        elif Decimal(self.advance.principal_amount) != amount:
            raise ValueError("customer advance principal does not reconcile to receipt")
        elif self.advance.sales_order_id != self.sales_order_id:
            raise ValueError("customer advance sales-order lineage does not reconcile")
        if self.payment_method == "cheque":
            if not all((self.instrument_number, self.instrument_date,
                        self.drawee_bank_name, self.account_payee_confirmed)):
                raise ValueError("cheque receipt readback lacks instrument evidence")
        elif any((self.instrument_number, self.instrument_date,
                  self.drawee_bank_name, self.account_payee_confirmed)):
            raise ValueError("non-cheque receipt carries cheque instrument evidence")
        if len(self.terminal_actions) > 1:
            raise ValueError("customer cheque has more than one terminal action")
        if len(self.journal_lines) != 2:
            raise ValueError("posted receipt requires exactly two journal lines")
        debit = sum((Decimal(row.transaction_debit) for row in self.journal_lines), Decimal("0"))
        credit = sum((Decimal(row.transaction_credit) for row in self.journal_lines), Decimal("0"))
        functional_debit = sum((Decimal(row.functional_debit) for row in self.journal_lines), Decimal("0"))
        functional_credit = sum((Decimal(row.functional_credit) for row in self.journal_lines), Decimal("0"))
        if not (
            debit == credit == functional_debit == functional_credit == amount
            and Decimal(self.journal_debit_total) == amount
            and Decimal(self.journal_credit_total) == amount
        ):
            raise ValueError("posted receipt journal does not balance to payment")
        settlement_lines = [
            row for row in self.journal_lines
            if row.account_id == self.settlement_account_id
            and Decimal(row.transaction_debit) == amount
            and Decimal(row.transaction_credit) == 0
        ]
        receivable_lines = [
            row for row in self.journal_lines
            if row.party_id == self.party_id
            and Decimal(row.transaction_credit) == amount
            and Decimal(row.transaction_debit) == 0
        ]
        if len(settlement_lines) != 1 or len(receivable_lines) != 1:
            raise ValueError("posted receipt settlement and receivable journal identities are invalid")
        return self


def _canonical_receivable_rows(
    db: Session,
    org_id: UUID,
    user: Dict[str, Any],
) -> list[dict]:
    """Return visible invoice receivables after effective allocations."""
    branch_ids = [UUID(str(value)) for value in (user.get("branch_ids") or [])]
    organization_scope = (
        user.get("is_admin") is True
        or str(user.get("data_access_level") or "").lower() == "organization"
        or str(user.get("branch_scope") or "").lower() in {"all", "organization"}
    )
    return _rows(db, """
        WITH business_clock AS MATERIALIZED (
            SELECT erp_core_commands.current_organization_business_date()
                     AS business_date
        ), effective_allocations AS (
            SELECT allocation.org_id, allocation.open_item_id,
                   COALESCE(SUM(allocation.amount), 0) AS allocated_amount,
                   MAX(allocation.allocation_date) AS last_payment_date
              FROM finance.allocations allocation
             WHERE allocation.org_id=:org_id
               AND allocation.status='posted'
               AND allocation.reversal_of_allocation_id IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM finance.allocations reversal
                    WHERE reversal.org_id=allocation.org_id
                      AND reversal.reversal_of_allocation_id=allocation.id
               )
             GROUP BY allocation.org_id, allocation.open_item_id
        ), receivables AS (
            SELECT item.org_id, item.id AS open_item_id,
                   invoice.branch_id,
                   invoice.id AS sales_invoice_id, invoice.customer_account_id,
                   item.party_id,
                   item.document_number, item.document_date, item.due_date,
                   item.principal_amount,
                   GREATEST(item.principal_amount-COALESCE(applied.allocated_amount,0),0)
                     AS outstanding_amount,
                   GREATEST(business_clock.business_date-item.due_date,0)
                     AS days_overdue,
                   applied.last_payment_date
              FROM finance.open_items item
              CROSS JOIN business_clock
              JOIN finance.accounting_events event
                ON event.org_id=item.org_id AND event.id=item.accounting_event_id
               AND event.sales_invoice_id IS NOT NULL
              JOIN sales.invoices invoice
                ON invoice.org_id=event.org_id AND invoice.id=event.sales_invoice_id
               AND invoice.status='posted'
              LEFT JOIN effective_allocations applied
                ON applied.org_id=item.org_id AND applied.open_item_id=item.id
             WHERE item.org_id=:org_id AND item.item_side='receivable'
               AND item.status='open'
               AND (:organization_scope
                    OR invoice.branch_id=ANY(CAST(:branch_ids AS uuid[])))
               AND item.principal_amount-COALESCE(applied.allocated_amount,0)>0
        )
        SELECT account.id AS customer_id, party.id AS party_id,
               party.legal_name AS customer_name,
               COALESCE(contact.phone,'') AS phone,
               COALESCE(contact.email,'') AS email,
               COALESCE(address.location,'') AS location,
               account.credit_limit,
               SUM(receivable.outstanding_amount) AS total_outstanding,
               SUM(receivable.outstanding_amount)
                   FILTER (WHERE receivable.days_overdue>0) AS overdue_amount,
               COUNT(*) AS invoice_count,
               COUNT(*) FILTER (WHERE receivable.days_overdue>0) AS overdue_invoices,
               MAX(receivable.days_overdue) AS max_overdue_days,
               MIN(receivable.document_date) AS oldest_invoice_date,
               MAX(receivable.last_payment_date) AS last_payment_date,
               SUM(receivable.outstanding_amount)
                   FILTER (WHERE receivable.days_overdue=0) AS current,
               COUNT(*) FILTER (WHERE receivable.days_overdue=0) AS current_count,
               SUM(receivable.outstanding_amount)
                   FILTER (WHERE receivable.days_overdue BETWEEN 1 AND 30) AS days_1_30,
               COUNT(*) FILTER (WHERE receivable.days_overdue BETWEEN 1 AND 30) AS days_1_30_count,
               SUM(receivable.outstanding_amount)
                   FILTER (WHERE receivable.days_overdue BETWEEN 31 AND 60) AS days_31_60,
               COUNT(*) FILTER (WHERE receivable.days_overdue BETWEEN 31 AND 60) AS days_31_60_count,
               SUM(receivable.outstanding_amount)
                   FILTER (WHERE receivable.days_overdue BETWEEN 61 AND 90) AS days_61_90,
               COUNT(*) FILTER (WHERE receivable.days_overdue BETWEEN 61 AND 90) AS days_61_90_count,
               SUM(receivable.outstanding_amount)
                   FILTER (WHERE receivable.days_overdue>90) AS over_90,
               COUNT(*) FILTER (WHERE receivable.days_overdue>90) AS over_90_count,
               jsonb_agg(jsonb_build_object(
                   'invoice_id', receivable.sales_invoice_id,
                   'open_item_id', receivable.open_item_id,
                   'branch_id', receivable.branch_id,
                   'invoice_number', receivable.document_number,
                   'invoice_date', receivable.document_date,
                   'due_date', receivable.due_date,
                   'original_amount', receivable.principal_amount,
                   'paid_amount', receivable.principal_amount-receivable.outstanding_amount,
                   'current_outstanding', receivable.outstanding_amount,
                   'days_overdue', receivable.days_overdue,
                   'aging_bucket', CASE
                       WHEN receivable.days_overdue=0 THEN 'current'
                       WHEN receivable.days_overdue<=30 THEN '1-30'
                       WHEN receivable.days_overdue<=60 THEN '31-60'
                       WHEN receivable.days_overdue<=90 THEN '61-90'
                       ELSE 'over_90' END,
                   'status', CASE
                       WHEN receivable.days_overdue>0 THEN 'overdue'
                       WHEN receivable.outstanding_amount<receivable.principal_amount THEN 'partial'
                       ELSE 'pending' END
               ) ORDER BY receivable.due_date, receivable.open_item_id) AS invoices
          FROM receivables receivable
          JOIN parties.parties party
            ON party.org_id=receivable.org_id AND party.id=receivable.party_id
          JOIN parties.customer_accounts account
            ON account.org_id=receivable.org_id
           AND account.id=receivable.customer_account_id
           AND account.party_id=party.id
          LEFT JOIN LATERAL (
              SELECT party_contact.phone, party_contact.email
                FROM parties.contacts party_contact
               WHERE party_contact.org_id=party.org_id
                 AND party_contact.party_id=party.id AND party_contact.status='active'
               ORDER BY party_contact.is_primary DESC, party_contact.created_at,
                        party_contact.id LIMIT 1
          ) contact ON true
          LEFT JOIN LATERAL (
              SELECT concat_ws(', ', party_address.line1, party_address.city,
                                      party_address.state_code) AS location
                FROM parties.addresses party_address
               WHERE party_address.org_id=party.org_id
                 AND party_address.party_id=party.id AND party_address.status='active'
               ORDER BY party_address.is_primary DESC, party_address.created_at,
                        party_address.id LIMIT 1
          ) address ON true
         WHERE party.org_id=:org_id
         GROUP BY account.id, party.id, party.legal_name, contact.phone,
                  contact.email, address.location, account.credit_limit
         ORDER BY total_outstanding DESC, party.legal_name, party.id
    """, {
        "org_id": org_id,
        "organization_scope": organization_scope,
        "branch_ids": branch_ids,
    })


@router.get(
    "/payment-allocation/unpaid-invoices",
    response_model=CanonicalUnpaidInvoicesResponse,
)
def canonical_unpaid_invoices(
    customer_id: Optional[UUID] = None,
    user: dict = FINANCE_USER,
    db: Session = Depends(get_db),
):
    """Return branch-visible canonical receivables for payment selection."""
    org_id = _activate(db, user)
    parties = _canonical_receivable_rows(db, org_id, user)
    invoices = []
    for party in parties:
        if customer_id is not None and party.get("customer_id") != customer_id:
            continue
        for invoice in party.get("invoices") or []:
            invoices.append({
                "invoice_id": invoice.get("invoice_id"),
                "open_item_id": invoice.get("open_item_id"),
                "branch_id": invoice.get("branch_id"),
                "invoice_number": invoice.get("invoice_number"),
                "invoice_date": invoice.get("invoice_date"),
                "customer_id": party.get("customer_id"),
                "customer_name": party.get("customer_name"),
                "total_amount": money_json(invoice.get("original_amount")),
                "allocated": money_json(invoice.get("paid_amount")),
                "due": money_json(invoice.get("current_outstanding")),
                "payment_status": invoice.get("status"),
            })
    invoices.sort(key=lambda row: (str(row.get("invoice_date") or ""), str(row.get("invoice_id"))))
    return {"invoices": invoices, "invoice_count": len(invoices)}


@router.get(
    "/payment-allocation/invoice/{invoice_id}/payments",
    response_model=CanonicalInvoicePaymentsResponse,
)
def canonical_invoice_payments(
    invoice_id: UUID,
    user: dict = FINANCE_USER,
    db: Session = Depends(get_db),
):
    """Return branch-visible posted allocations for a canonical sales invoice."""
    org_id = _activate(db, user)
    branch_ids = [UUID(str(value)) for value in (user.get("branch_ids") or [])]
    organization_scope = (
        user.get("is_admin") is True
        or str(user.get("data_access_level") or "").lower() == "organization"
        or str(user.get("branch_scope") or "").lower() in {"all", "organization"}
    )
    params = {
        "org_id": org_id,
        "invoice_id": invoice_id,
        "organization_scope": organization_scope,
        "branch_ids": branch_ids,
    }
    summaries = _rows(db, """
        WITH effective_allocations AS (
            SELECT allocation.org_id, allocation.open_item_id,
                   COALESCE(SUM(allocation.amount), 0) AS allocated_amount
              FROM finance.allocations allocation
             WHERE allocation.org_id=:org_id
               AND allocation.status='posted'
               AND allocation.reversal_of_allocation_id IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM finance.allocations reversal
                    WHERE reversal.org_id=allocation.org_id
                      AND reversal.reversal_of_allocation_id=allocation.id
               )
             GROUP BY allocation.org_id, allocation.open_item_id
        )
        SELECT invoice.id AS invoice_id, invoice.invoice_number,
               item.principal_amount AS total_amount,
               COALESCE(applied.allocated_amount, 0) AS allocated_amount,
               GREATEST(item.principal_amount-COALESCE(applied.allocated_amount,0),0)
                 AS due_amount,
               CASE
                 WHEN COALESCE(applied.allocated_amount,0)<=0 THEN 'pending'
                 WHEN applied.allocated_amount<item.principal_amount THEN 'partial'
                 ELSE 'paid'
               END AS payment_status
          FROM sales.invoices invoice
          JOIN finance.accounting_events event
            ON event.org_id=invoice.org_id AND event.sales_invoice_id=invoice.id
          JOIN finance.open_items item
            ON item.org_id=event.org_id AND item.accounting_event_id=event.id
           AND item.item_side='receivable' AND item.status<>'reversed'
          LEFT JOIN effective_allocations applied
            ON applied.org_id=item.org_id AND applied.open_item_id=item.id
         WHERE invoice.org_id=:org_id AND invoice.id=:invoice_id
           AND invoice.status='posted'
           AND (:organization_scope OR invoice.branch_id=ANY(CAST(:branch_ids AS uuid[])))
         ORDER BY item.created_at, item.id LIMIT 1
    """, params)
    if not summaries:
        raise HTTPException(status_code=404, detail="Invoice not found")
    summary = summaries[0]
    payment_rows = _rows(db, """
        SELECT allocation.id AS allocation_id,
               payment.id AS payment_id,
               payment.payment_number,
               payment.payment_date,
               payment.amount AS payment_amount,
               allocation.amount AS allocated_amount,
               allocation.allocation_date
          FROM sales.invoices invoice
          JOIN finance.accounting_events event
            ON event.org_id=invoice.org_id AND event.sales_invoice_id=invoice.id
          JOIN finance.open_items item
            ON item.org_id=event.org_id AND item.accounting_event_id=event.id
           AND item.item_side='receivable'
          JOIN finance.allocations allocation
            ON allocation.org_id=item.org_id AND allocation.open_item_id=item.id
           AND allocation.status='posted'
           AND allocation.reversal_of_allocation_id IS NULL
          JOIN finance.payments payment
            ON payment.org_id=allocation.org_id AND payment.id=allocation.payment_id
           AND payment.status='posted'
         WHERE invoice.org_id=:org_id AND invoice.id=:invoice_id
           AND invoice.status='posted'
           AND (:organization_scope OR invoice.branch_id=ANY(CAST(:branch_ids AS uuid[])))
           AND NOT EXISTS (
               SELECT 1 FROM finance.allocations reversal
                WHERE reversal.org_id=allocation.org_id
                  AND reversal.reversal_of_allocation_id=allocation.id
           )
         ORDER BY allocation.allocation_date DESC, allocation.id
    """, params)
    return {
        "invoice": {
            "invoice_id": summary["invoice_id"],
            "invoice_number": summary["invoice_number"],
            "total_amount": money_json(summary["total_amount"]),
            "allocated_amount": money_json(summary["allocated_amount"]),
            "due_amount": money_json(summary["due_amount"]),
            "payment_status": summary["payment_status"],
        },
        "payments": [{
            **row,
            "payment_amount": money_json(row["payment_amount"]),
            "allocated_amount": money_json(row["allocated_amount"]),
            "allocation_type": "manual",
        } for row in payment_rows],
    }


@router.get(
    "/payment-allocation/payment/{payment_id:uuid}/readback",
    response_model=CanonicalCustomerReceiptReadback,
)
def canonical_customer_receipt_readback(
    payment_id: UUID,
    user: dict = FINANCE_USER,
    db: Session = Depends(get_db),
):
    """Return posted allocation and balanced-journal evidence for one receipt."""
    org_id = _activate(db, user)
    branch_ids = [UUID(str(value)) for value in (user.get("branch_ids") or [])]
    organization_scope = (
        user.get("is_admin") is True
        or str(user.get("data_access_level") or "").lower() == "organization"
        or str(user.get("branch_scope") or "").lower() in {"all", "organization"}
    )
    params = {
        "org_id": org_id,
        "payment_id": payment_id,
        "organization_scope": organization_scope,
        "branch_ids": branch_ids,
    }
    headers = _rows(db, """
        SELECT payment.id AS payment_id, payment.payment_number,payment.row_version,
               payment.payment_date, payment.branch_id, payment.party_id,
               payment.settlement_account_id, payment.bank_account_id,
               payment.payment_method, payment.payment_purpose,
               payment.sales_order_id, payment.evidence_attachment_id,
               payment.instrument_number, payment.instrument_date,
               payment.drawee_bank_name, payment.account_payee_confirmed,
               payment.external_reference, payment.amount, payment.status,
               journal.id AS journal_entry_id, journal.journal_number,
               journal.transaction_debit_total AS journal_debit_total,
               journal.transaction_credit_total AS journal_credit_total
          FROM finance.payments payment
          JOIN finance.accounting_events event
            ON event.org_id=payment.org_id AND event.payment_id=payment.id
          JOIN finance.journal_entries journal
            ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id
           AND journal.status IN ('posted','reversed')
         WHERE payment.org_id=:org_id AND payment.id=:payment_id
           AND payment.direction='receipt'
           AND payment.payment_purpose IN ('commercial_settlement','customer_advance')
           AND payment.status='posted'
           AND (:organization_scope
                OR payment.branch_id=ANY(CAST(:branch_ids AS uuid[])))
    """, params)
    if len(headers) != 1:
        raise HTTPException(status_code=404, detail="Canonical customer receipt not found")
    allocations = _rows(db, """
        SELECT allocation.id AS allocation_id, allocation.open_item_id,
               allocation.amount, allocation.allocation_date
          FROM finance.allocations allocation
          JOIN finance.payments payment
            ON payment.org_id=allocation.org_id AND payment.id=allocation.payment_id
         WHERE allocation.org_id=:org_id AND allocation.payment_id=:payment_id
           AND allocation.status='posted'
           AND allocation.reversal_of_allocation_id IS NULL
           AND (:organization_scope
                OR payment.branch_id=ANY(CAST(:branch_ids AS uuid[])))
           AND NOT EXISTS (
               SELECT 1 FROM finance.allocations reversal
                WHERE reversal.org_id=allocation.org_id
                  AND reversal.reversal_of_allocation_id=allocation.id
           )
         ORDER BY allocation.allocation_date, allocation.id
    """, params)
    reversed_allocations = _rows(db, """
        SELECT reversal.id AS reversal_allocation_id,
               original.id AS original_allocation_id,
               original.open_item_id,reversal.amount,
               reversal.allocation_date AS reversal_date
          FROM finance.allocations original
          JOIN finance.allocations reversal
            ON reversal.org_id=original.org_id
           AND reversal.reversal_of_allocation_id=original.id
           AND reversal.status='reversed'
         WHERE original.org_id=:org_id AND original.payment_id=:payment_id
           AND original.status='posted'
           AND original.reversal_of_allocation_id IS NULL
         ORDER BY reversal.allocation_date,reversal.id
    """, params)
    journal_lines = _rows(db, """
        SELECT line.id AS journal_line_id, line.line_number, line.account_id,
               line.party_id, line.transaction_debit, line.transaction_credit,
               line.functional_debit, line.functional_credit
          FROM finance.accounting_events event
          JOIN finance.payments payment
            ON payment.org_id=event.org_id AND payment.id=event.payment_id
          JOIN finance.journal_entries journal
            ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id
           AND journal.status IN ('posted','reversed')
          JOIN finance.journal_lines line
            ON line.org_id=journal.org_id AND line.journal_entry_id=journal.id
         WHERE event.org_id=:org_id AND event.payment_id=:payment_id
           AND (:organization_scope
                OR payment.branch_id=ANY(CAST(:branch_ids AS uuid[])))
         ORDER BY line.line_number, line.id
    """, params)
    advance_rows = _rows(db, """
        SELECT item.id AS open_item_id, payment.sales_order_id,
               item.principal_amount,
               COALESCE(SUM(allocation.amount) FILTER (
                 WHERE allocation.status='posted'
                   AND allocation.reversal_of_allocation_id IS NULL
                   AND NOT EXISTS (
                     SELECT 1 FROM finance.allocations reversal
                      WHERE reversal.org_id=allocation.org_id
                        AND reversal.reversal_of_allocation_id=allocation.id
                   )),0) AS allocated_amount,
               item.principal_amount-COALESCE(SUM(allocation.amount) FILTER (
                 WHERE allocation.status='posted'
                   AND allocation.reversal_of_allocation_id IS NULL
                   AND NOT EXISTS (
                     SELECT 1 FROM finance.allocations reversal
                      WHERE reversal.org_id=allocation.org_id
                        AND reversal.reversal_of_allocation_id=allocation.id
                   )),0) AS residual_amount,
               item.status
          FROM finance.payments payment
          JOIN finance.accounting_events event
            ON event.org_id=payment.org_id AND event.payment_id=payment.id
          JOIN finance.open_items item
            ON item.org_id=event.org_id AND item.accounting_event_id=event.id
           AND item.item_side='payable'
          LEFT JOIN finance.allocations allocation
            ON allocation.org_id=item.org_id AND allocation.open_item_id=item.id
         WHERE payment.org_id=:org_id AND payment.id=:payment_id
           AND payment.payment_purpose='customer_advance'
         GROUP BY item.id,payment.sales_order_id,item.principal_amount,item.status
    """, params)
    terminal_actions = _rows(db, """
        SELECT terminal.id AS action_payment_id,
               terminal.payment_purpose AS action,
               terminal.payment_date AS action_date,
               terminal.evidence_attachment_id,
               journal.id AS journal_entry_id,journal.journal_number,
               journal.transaction_debit_total AS journal_debit_total,
               journal.transaction_credit_total AS journal_credit_total
          FROM finance.payments terminal
          JOIN finance.accounting_events event
            ON event.org_id=terminal.org_id AND event.payment_id=terminal.id
          JOIN finance.journal_entries journal
            ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id
           AND journal.status='posted'
         WHERE terminal.org_id=:org_id AND terminal.related_payment_id=:payment_id
           AND terminal.payment_purpose IN ('cheque_clearance','cheque_bounce')
           AND terminal.status='posted'
         ORDER BY terminal.payment_date,terminal.id
    """, params)
    header = headers[0]
    allocation_total = sum(
        (Decimal(str(row["amount"])) for row in allocations), Decimal("0")
    )
    reversal_total = sum(
        (Decimal(str(row["amount"])) for row in reversed_allocations), Decimal("0")
    )
    line_debit = sum(
        (Decimal(str(row["transaction_debit"])) for row in journal_lines),
        Decimal("0"),
    )
    line_credit = sum(
        (Decimal(str(row["transaction_credit"])) for row in journal_lines),
        Decimal("0"),
    )
    amount = Decimal(str(header["amount"]))
    advance = advance_rows[0] if len(advance_rows) == 1 else None
    if len(advance_rows) > 1:
        raise HTTPException(status_code=409, detail="Customer advance open item is ambiguous")
    is_invoice_receipt = header["payment_purpose"] == "commercial_settlement"
    bounced = len(terminal_actions) == 1 and terminal_actions[0]["action"] == "cheque_bounce"
    return {
        **header,
        "amount": money_json(header["amount"]),
        "journal_debit_total": money_json(header["journal_debit_total"]),
        "journal_credit_total": money_json(header["journal_credit_total"]),
        "allocations": [{**row, "amount": money_json(row["amount"])} for row in allocations],
        "reversed_allocations": [{
            **row, "amount": money_json(row["amount"]),
        } for row in reversed_allocations],
        "advance": None if advance is None else {
            **advance,
            "principal_amount": money_json(advance["principal_amount"]),
            "allocated_amount": money_json(advance["allocated_amount"]),
            "residual_amount": money_json(advance["residual_amount"]),
        },
        "terminal_actions": [{
            **row,
            "journal_debit_total": money_json(row["journal_debit_total"]),
            "journal_credit_total": money_json(row["journal_credit_total"]),
        } for row in terminal_actions],
        "journal_lines": [{
            **row,
            "transaction_debit": money_json(row["transaction_debit"]),
            "transaction_credit": money_json(row["transaction_credit"]),
            "functional_debit": money_json(row["functional_debit"]),
            "functional_credit": money_json(row["functional_credit"]),
        } for row in journal_lines],
        "allocation_reconciled": (
            (allocation_total == 0 and reversal_total == amount)
            if is_invoice_receipt and bounced
            else allocation_total == amount and reversal_total == 0
            if is_invoice_receipt
            else allocation_total == reversal_total == 0 and advance is not None
            and Decimal(str(advance["principal_amount"])) == amount
            and (not bounced or Decimal(str(advance["allocated_amount"])) == amount)
        ),
        "journal_balanced": line_debit == line_credit == amount,
    }


@router.get(
    "/payment-allocation/payment/{payment_id:uuid}/cheque-action-readback",
    response_model=CanonicalCustomerReceiptReadback,
)
def canonical_customer_cheque_action_readback(
    payment_id: UUID,
    user: dict = FINANCE_USER,
    db: Session = Depends(get_db),
):
    """Return the original receipt plus the exact succeeded terminal cheque action."""
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT terminal.related_payment_id AS original_payment_id
          FROM finance.payments terminal
         WHERE terminal.org_id=:org_id AND terminal.id=:payment_id
           AND terminal.payment_purpose IN ('cheque_clearance','cheque_bounce')
           AND terminal.status='posted' AND terminal.related_payment_id IS NOT NULL
    """, {"org_id": org_id, "payment_id": payment_id})
    if len(rows) != 1:
        raise HTTPException(status_code=404, detail="Canonical cheque action not found")
    return canonical_customer_receipt_readback(
        payment_id=rows[0]["original_payment_id"], user=user, db=db
    )


def _amount(rows: list[dict], key: str):
    return sum((row.get(key) or 0 for row in rows), 0)


def _count(rows: list[dict], key: str) -> int:
    return sum((int(row.get(key) or 0) for row in rows), 0)


@router.get("/ledger/aging")
def canonical_ledger_aging(
    party_type: Literal["customer", "supplier"] = Query("customer"),
    user: dict = FINANCE_USER,
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    if party_type == "supplier":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Canonical supplier payable aging is not available",
        )

    rows = _canonical_receivable_rows(db, org_id, user)
    money_fields = (
        "total_outstanding", "current", "overdue_amount", "days_1_30",
        "days_31_60", "days_61_90", "over_90", "credit_limit",
    )
    projected_rows = []
    for source in rows:
        row = _money_fields(source, money_fields)
        row["invoices"] = [
            _money_fields(invoice, ("original_amount", "paid_amount", "current_outstanding"))
            for invoice in (source.get("invoices") or [])
        ]
        projected_rows.append(row)
    return {"party_type": party_type, "aging_data": projected_rows, "summary": {
        "total": money_json(_amount(rows, "total_outstanding")),
        "current": money_json(_amount(rows, "current")),
        "overdue": money_json(_amount(rows, "overdue_amount")),
        "party_count": len(rows),
        "1_30": money_json(_amount(rows, "days_1_30")),
        "31_60": money_json(_amount(rows, "days_31_60")),
        "61_90": money_json(_amount(rows, "days_61_90")),
        "over_90": money_json(_amount(rows, "over_90")),
        "current_count": _count(rows, "current_count"),
        "1_30_count": _count(rows, "days_1_30_count"),
        "31_60_count": _count(rows, "days_31_60_count"),
        "61_90_count": _count(rows, "days_61_90_count"),
        "over_90_count": _count(rows, "over_90_count"),
    }}


@router.get("/collection-center/collection/aging-data")
def canonical_collection_aging(
    user: dict = FINANCE_USER,
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    rows = _canonical_receivable_rows(db, org_id, user)
    collection_rows = _rows(db, """
        WITH business_clock AS MATERIALIZED (
            SELECT erp_core_commands.current_organization_business_date()
                     AS business_date
        )
        SELECT COALESCE(SUM(amount) FILTER (
                   WHERE payment_date=business_clock.business_date),0)
                   AS today_collections,
               COALESCE(SUM(amount) FILTER (
                   WHERE payment_date>=business_clock.business_date-6),0)
                   AS week_collections,
               COALESCE(SUM(amount) FILTER (
                   WHERE payment_date>=date_trunc(
                       'month',business_clock.business_date
                   )::date),0)
                   AS month_collections
          FROM finance.payments
          CROSS JOIN business_clock
         WHERE org_id=:org_id AND direction='receipt' AND status='posted'
           AND reversal_of_payment_id IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM finance.payments reversal
                WHERE reversal.org_id=payments.org_id
                  AND reversal.reversal_of_payment_id=payments.id
           )
    """, {"org_id": org_id})
    collections = collection_rows[0] if collection_rows else {}
    total_outstanding = _amount(rows, "total_outstanding")
    month_collections = collections.get("month_collections") or 0

    parties = []
    for row in rows:
        outstanding = row.get("total_outstanding") or 0
        overdue_days = int(row.get("max_overdue_days") or 0)
        parties.append({
            "id": row["customer_id"], "partyId": row["party_id"],
            "name": row["customer_name"], "phone": row.get("phone"),
            "email": row.get("email"), "location": row.get("location"),
            "outstandingAmount": money_json(outstanding),
            "overdueAmount": money_json(row.get("overdue_amount") or 0),
            "daysOverdue": overdue_days,
            "creditLimit": money_json(row.get("credit_limit") or 0),
            "oldestInvoiceDate": row.get("oldest_invoice_date"),
            "lastPayment": row.get("last_payment_date"),
            "agingStatus": "overdue" if overdue_days > 0 else "current",
            "agingBand": ("90+" if overdue_days > 90 else "61-90" if overdue_days > 60
                          else "31-60" if overdue_days > 30 else "1-30" if overdue_days > 0
                          else "current"),
            "agingBreakdown": [
                {"range": "Current", "amount": money_json(row.get("current") or 0)},
                {"range": "1-30", "amount": money_json(row.get("days_1_30") or 0)},
                {"range": "31-60", "amount": money_json(row.get("days_31_60") or 0)},
                {"range": "61-90", "amount": money_json(row.get("days_61_90") or 0)},
                {"range": "90+", "amount": money_json(row.get("over_90") or 0)},
            ],
        })

    return {"summary": {
        "totalOutstanding": money_json(total_outstanding),
        "overdueAmount": money_json(_amount(rows, "overdue_amount")),
        "currentDayCollections": money_json(collections.get("today_collections") or 0),
        "currentWeekCollections": money_json(collections.get("week_collections") or 0),
        "currentMonthCollections": money_json(month_collections),
        "collectionEfficiency": None,
    }, "parties": parties}


def _sales_daily(db: Session, params: dict) -> list[dict]:
    return _rows(db, f"""
        SELECT invoice.invoice_date AS date,
               count(*) AS invoice_count,
               count(DISTINCT invoice.customer_account_id) AS customer_count,
               COALESCE(SUM(invoice.grand_total),0) AS total_sales,
               COALESCE(AVG(invoice.grand_total),0) AS avg_order_value
          FROM sales.invoices invoice WHERE {_INVOICE_RANGE}
         GROUP BY invoice.invoice_date ORDER BY invoice.invoice_date
    """, params)


def _sales_summary_totals(db: Session, params: dict) -> dict:
    rows = _rows(db, f"""
        SELECT COALESCE(SUM(invoice.grand_total),0) AS total_sales,
               count(*) AS total_invoices,
               COALESCE(AVG(invoice.grand_total),0) AS avg_invoice_value,
               count(DISTINCT invoice.customer_account_id) AS unique_customers
          FROM sales.invoices invoice WHERE {_INVOICE_RANGE}
    """, params)
    return rows[0]


def _comparison_percent(current: Any, previous: Any) -> Optional[Decimal]:
    current_value = Decimal(str(current))
    previous_value = Decimal(str(previous))
    if previous_value == 0:
        return None
    return (current_value - previous_value) / abs(previous_value) * Decimal("100")


@router.get("/sales/analytics/summary")
def sales_analytics_summary(date_from: date, date_to: date,
                            user: dict = SALES_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    period = _validated_report_range(date_from, date_to)
    current = _sales_summary_totals(db, _range_params(org_id, **period))
    previous_to = period["date_from"] - timedelta(days=1)
    previous_from = previous_to - (period["date_to"] - period["date_from"])
    previous = _sales_summary_totals(
        db, _range_params(org_id, previous_from, previous_to),
    )
    current.update({
        "comparison_period": {"date_from": previous_from, "date_to": previous_to},
        "sales_growth": _comparison_percent(current["total_sales"], previous["total_sales"]),
        "invoices_growth": _comparison_percent(current["total_invoices"], previous["total_invoices"]),
        "average_invoice_growth": _comparison_percent(
            current["avg_invoice_value"], previous["avg_invoice_value"],
        ),
        "customers_growth": _comparison_percent(
            current["unique_customers"], previous["unique_customers"],
        ),
    })
    return current


@router.get("/sales/analytics/trend")
@router.get("/sales/analytics/by-date")
def sales_analytics_by_date(date_from: Optional[str] = None, date_to: Optional[str] = None,
                            user: dict = SALES_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    if date_from is None or date_to is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Both date_from and date_to are required for sales analytics",
        )
    period = _validated_report_range(date_from, date_to)
    return _sales_daily(db, _range_params(org_id, **period))


@router.get("/dashboard/sales-analytics")
def dashboard_sales_analytics(
    date_from: date,
    date_to: date,
    user: dict = SALES_USER,
    db: Session = Depends(get_db),
):
    """Return one exact, dashboard-specific daily sales projection.

    Every sales analytics route exposes one name for each fact so browser
    clients cannot guess among compatibility aliases.
    """

    org_id = _activate(db, user)
    period = _validated_report_range(date_from, date_to)
    return _rows(db, f"""
        SELECT invoice.invoice_date AS date,
               count(*) AS invoice_count,
               COALESCE(SUM(invoice.grand_total),0) AS revenue
          FROM sales.invoices invoice WHERE {_INVOICE_RANGE}
         GROUP BY invoice.invoice_date ORDER BY invoice.invoice_date
    """, _range_params(org_id, **period))


def _payment_rows(db: Session, params: dict, method: Optional[str] = None,
                  status: Optional[str] = None) -> list[dict]:
    query_params = {**params, "method": method, "status": status}
    return _rows(db, """
        SELECT payment.id, payment.amount, payment.payment_method AS method,
               payment.status, payment.payment_date AS date,
               COALESCE(payment.external_reference,payment.payment_number) AS reference,
               party.legal_name AS customer,
               CASE WHEN payment.direction='receipt' THEN 'received' ELSE 'sent' END AS type,
               payment.direction, payment.memo AS description
          FROM finance.payments payment
          LEFT JOIN parties.parties party ON party.org_id=payment.org_id AND party.id=payment.party_id
         WHERE payment.org_id=:org_id
           AND (:date_from IS NULL OR payment.payment_date >= CAST(:date_from AS date))
           AND (:date_to IS NULL OR payment.payment_date <= CAST(:date_to AS date))
           AND (:method IS NULL OR payment.payment_method=:method)
           AND (:status IS NULL OR payment.status=:status)
         ORDER BY payment.payment_date DESC, payment.id DESC
    """, query_params)


@router.get("/payments/analytics/list")
def payment_analytics_list(date_from: Optional[str] = None, date_to: Optional[str] = None,
                           method: Optional[str] = None, status: Optional[str] = None,
                           user: dict = FINANCE_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    return {"payments": _payment_rows(db, _range_params(org_id, date_from, date_to), method, status)}


@router.get("/payments/analytics/summary")
def payment_analytics_summary(date_from: Optional[str] = None, date_to: Optional[str] = None,
                              user: dict = FINANCE_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _payment_rows(db, _range_params(org_id, date_from, date_to))
    received = sum((row["amount"] or 0) for row in rows if row["direction"] == "receipt")
    sent = sum((row["amount"] or 0) for row in rows if row["direction"] == "disbursement")
    methods: dict[str, Any] = {}
    statuses: dict[str, int] = {}
    for row in rows:
        methods[row["method"]] = methods.get(row["method"], 0) + (row["amount"] or 0)
        statuses[row["status"]] = statuses.get(row["status"], 0) + 1
    return {"total_received": received, "total_sent": sent, "net_flow": received - sent,
            "pending_payments": sum(1 for row in rows if row["status"] in {"draft", "submitted", "approved"}),
            "completed_payments": sum(1 for row in rows if row["status"] == "posted"),
            "failed_payments": sum(1 for row in rows if row["status"] in {"rejected", "cancelled", "reversed"}),
            "avg_transaction_value": (received + sent) / len(rows) if rows else 0,
            "method_breakdown": methods, "status_breakdown": statuses}


@router.get("/payments/analytics/trends")
def payment_analytics_trends(date_from: Optional[str] = None, date_to: Optional[str] = None,
                             user: dict = FINANCE_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    params = _range_params(org_id, date_from, date_to)
    rows = _rows(db, """
        SELECT payment_date AS day, to_char(payment_date,'YYYY-MM') AS month,
               SUM(amount) FILTER (WHERE direction='receipt') AS received,
               SUM(amount) FILTER (WHERE direction='disbursement') AS sent
          FROM finance.payments WHERE org_id=:org_id
           AND (:date_from IS NULL OR payment_date >= CAST(:date_from AS date))
           AND (:date_to IS NULL OR payment_date <= CAST(:date_to AS date))
         GROUP BY payment_date ORDER BY payment_date
    """, params)
    monthly: dict[str, list] = {}
    for row in rows:
        bucket = monthly.setdefault(row["month"], [0, 0])
        bucket[0] += row["received"] or 0
        bucket[1] += row["sent"] or 0
    return {"daily": {"labels": [str(row["day"]) for row in rows],
                       "inflow": [row["received"] or 0 for row in rows],
                       "outflow": [row["sent"] or 0 for row in rows]},
            "monthly": {"labels": list(monthly),
                        "received": [value[0] for value in monthly.values()],
                        "sent": [value[1] for value in monthly.values()]}}


def _dashboard_stats_totals(db: Session, params: dict) -> dict:
    rows = _rows(db, f"""
        WITH business_clock AS MATERIALIZED (
            SELECT organization.timezone,
                   erp_core_commands.current_organization_business_date()
                     AS business_date
              FROM core.organizations organization
             WHERE organization.id=:org_id AND organization.status='active'
        )
        SELECT COALESCE(SUM(invoice.grand_total),0) AS total_revenue,
               count(*) AS total_invoices,
               count(DISTINCT invoice.customer_account_id) AS purchasing_customers,
               (SELECT count(*) FROM sales.orders sales_order
                 WHERE sales_order.org_id=:org_id
                   AND sales_order.status NOT IN ('cancelled','reversed')
                   AND (:date_from IS NULL OR sales_order.order_date >= CAST(:date_from AS date))
                   AND (:date_to IS NULL OR sales_order.order_date <= CAST(:date_to AS date))) AS total_orders,
               (SELECT count(*) FROM parties.customer_accounts customer
                 WHERE customer.org_id=:org_id) AS total_customers,
               (SELECT count(*) FROM parties.customer_accounts customer
                 WHERE customer.org_id=:org_id
                   AND (:date_from IS NULL OR
                        (customer.created_at AT TIME ZONE business_clock.timezone)::date
                          >= CAST(:date_from AS date))
                   AND (:date_to IS NULL OR
                        (customer.created_at AT TIME ZONE business_clock.timezone)::date
                          <= CAST(:date_to AS date))) AS new_customers
          FROM sales.invoices invoice
          CROSS JOIN business_clock
         WHERE {_INVOICE_RANGE}
    """, params)
    return rows[0]


@router.get("/dashboard/stats")
def dashboard_stats(date_from: Optional[date] = None, date_to: Optional[date] = None,
                    user: dict = SALES_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    current = _dashboard_stats_totals(db, _range_params(org_id, date_from, date_to))
    current.update({
        "comparison_period": None,
        "revenue_change": None,
        "orders_change": None,
        "new_customers_change": None,
    })
    if date_from is None or date_to is None:
        if date_from is not None or date_to is not None:
            raise HTTPException(
                status_code=422,
                detail="Both date_from and date_to are required for dashboard comparison",
            )
        return current

    period = _validated_report_range(date_from, date_to)
    previous_to = period["date_from"] - timedelta(days=1)
    previous_from = previous_to - (period["date_to"] - period["date_from"])
    previous = _dashboard_stats_totals(
        db, _range_params(org_id, previous_from, previous_to),
    )
    current.update({
        "comparison_period": {"date_from": previous_from, "date_to": previous_to},
        "revenue_change": _comparison_percent(
            current["total_revenue"], previous["total_revenue"],
        ),
        "orders_change": _comparison_percent(
            current["total_orders"], previous["total_orders"],
        ),
        "new_customers_change": _comparison_percent(
            current["new_customers"], previous["new_customers"],
        ),
    })
    return current


@router.get("/dashboard/inventory-summary")
def dashboard_inventory_summary(user: dict = INVENTORY_USER, db: Session = Depends(get_db)):
    """Return exact inventory facts without inventing a reorder threshold.

    ``out_of_stock_products`` is knowable from the stock ledger projection.
    "Low stock" is not: the canonical catalog currently has no effective-dated
    reorder policy.  Omitting that fact is intentional and prevents a random
    quantity threshold from becoming business truth.
    """

    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT organization.timezone AS organization_timezone,
               (transaction_timestamp() AT TIME ZONE organization.timezone)::date
                 AS business_date,
               transaction_timestamp() AS as_of,
               product_totals.active_products,
               product_totals.stock_value,
               product_totals.out_of_stock_products
          FROM core.organizations organization
          CROSS JOIN LATERAL (
              SELECT count(*) AS active_products,
                     COALESCE(SUM(COALESCE(stock.inventory_value,0)),0) AS stock_value,
                     count(*) FILTER (
                         WHERE COALESCE(stock.on_hand_quantity,0)<=0
                     ) AS out_of_stock_products
                FROM catalog.products product
                LEFT JOIN LATERAL (
                    SELECT SUM(balance.on_hand_quantity) AS on_hand_quantity,
                           SUM(balance.inventory_value) AS inventory_value
                      FROM inventory.stock_balances balance
                     WHERE balance.org_id=product.org_id
                       AND balance.product_id=product.id
                ) stock ON true
               WHERE product.org_id=organization.id AND product.status='active'
          ) product_totals
         WHERE organization.id=:org_id AND organization.status='active'
    """, {"org_id": org_id})
    if len(rows) != 1:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The active organization has no authoritative inventory dashboard context",
        )
    return rows[0]


@router.get("/dashboard/top-products")
def dashboard_top_products(
    date_from: date,
    date_to: date,
    limit: int = Query(5, ge=1, le=50),
    user: dict = SALES_USER,
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    period = _validated_report_range(date_from, date_to)
    return _rows(db, f"""
        SELECT product.id, product.name,
               SUM(line.line_total) AS revenue,
               SUM(line.billed_quantity) AS sales
          FROM sales.invoice_lines line
          JOIN sales.invoices invoice
            ON invoice.org_id=line.org_id AND invoice.id=line.invoice_id
          JOIN catalog.products product
            ON product.org_id=line.org_id AND product.id=line.product_id
         WHERE {_INVOICE_RANGE} AND product.status='active'
         GROUP BY product.id, product.name
         ORDER BY revenue DESC, product.name, product.id
         LIMIT :limit
    """, {**_range_params(org_id, **period), "limit": limit})


@router.get("/dashboard/top-customers")
def dashboard_top_customers(
    date_from: date,
    date_to: date,
    limit: int = Query(5, ge=1, le=50),
    user: dict = SALES_USER,
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    period = _validated_report_range(date_from, date_to)
    return _rows(db, f"""
        SELECT account.id, party.legal_name AS name,
               SUM(invoice.grand_total) AS revenue,
               count(*) AS orders
          FROM sales.invoices invoice
          JOIN parties.customer_accounts account
            ON account.org_id=invoice.org_id AND account.id=invoice.customer_account_id
          JOIN parties.parties party
            ON party.org_id=account.org_id AND party.id=account.party_id
         WHERE {_INVOICE_RANGE}
         GROUP BY account.id, party.legal_name
         ORDER BY revenue DESC, party.legal_name, account.id
         LIMIT :limit
    """, {**_range_params(org_id, **period), "limit": limit})


def _tax_totals(db: Session, params: dict) -> dict:
    rows = _rows(db, """
        SELECT COALESCE(output.cgst,0) cgst_collected, COALESCE(output.sgst,0) sgst_collected,
               COALESCE(output.igst,0) igst_collected, COALESCE(output.total,0) total_output_tax,
               COALESCE(input.cgst,0) cgst_paid, COALESCE(input.sgst,0) sgst_paid,
               COALESCE(input.igst,0) igst_paid, COALESCE(input.total,0) total_input_tax
          FROM (SELECT SUM(cgst_total) cgst, SUM(sgst_total) sgst, SUM(igst_total) igst,
                       SUM(cgst_total+sgst_total+igst_total+cess_total) total
                  FROM sales.invoices WHERE org_id=:org_id AND status NOT IN ('cancelled','reversed')
                   AND (:date_from IS NULL OR invoice_date >= CAST(:date_from AS date))
                   AND (:date_to IS NULL OR invoice_date <= CAST(:date_to AS date))) output
          CROSS JOIN (SELECT SUM(cgst_total) cgst, SUM(sgst_total) sgst, SUM(igst_total) igst,
                             SUM(cgst_total+sgst_total+igst_total+cess_total) total
                        FROM procurement.supplier_invoices
                       WHERE org_id=:org_id AND status NOT IN ('cancelled','reversed')
                         AND (:date_from IS NULL OR supplier_invoice_date >= CAST(:date_from AS date))
                         AND (:date_to IS NULL OR supplier_invoice_date <= CAST(:date_to AS date))) input
    """, params)
    return rows[0]


@router.get("/tax-entries/analytics/summary")
def tax_analytics_summary(date_from: Optional[str] = None, date_to: Optional[str] = None,
                          user: dict = Depends(PermissionChecker("gst", "view")),
                          db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    result = _tax_totals(db, _range_params(org_id, date_from, date_to))
    pending = _rows(db, """
        SELECT count(*) AS pending_returns
          FROM tax.returns return_row
         WHERE return_row.org_id=:org_id
           AND return_row.status IN ('draft','validated')
           AND NOT EXISTS (
               SELECT 1 FROM tax.returns later_revision
                WHERE later_revision.org_id=return_row.org_id
                  AND later_revision.return_period_id=return_row.return_period_id
                  AND later_revision.return_type=return_row.return_type
                  AND later_revision.revision>return_row.revision
           )
    """, {"org_id": org_id})[0]
    # No canonical scoring policy exists. Expose the authoritative pending count
    # and make the synthetic percentage explicitly unavailable.
    result.update({"pending_returns": pending["pending_returns"], "compliance_score": None})
    return result


@router.get("/tax-entries/gstr1/summary")
def tax_gstr1_summary(date_from: Optional[str] = None, date_to: Optional[str] = None,
                     user: dict = Depends(PermissionChecker("gst", "view")),
                     db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    totals = _tax_totals(db, _range_params(org_id, date_from, date_to))
    monthly = _rows(db, """
        SELECT to_char(date_trunc('month',invoice_date),'YYYY-MM') AS month,
               SUM(cgst_total) AS cgst, SUM(sgst_total) AS sgst, SUM(igst_total) AS igst
          FROM sales.invoices WHERE org_id=:org_id AND status NOT IN ('cancelled','reversed')
           AND (:date_from IS NULL OR invoice_date >= CAST(:date_from AS date))
           AND (:date_to IS NULL OR invoice_date <= CAST(:date_to AS date))
         GROUP BY date_trunc('month',invoice_date) ORDER BY date_trunc('month',invoice_date)
    """, _range_params(org_id, date_from, date_to))
    return {"total_cgst": totals["cgst_collected"], "total_sgst": totals["sgst_collected"],
            "total_igst": totals["igst_collected"], "monthly_summary": monthly}

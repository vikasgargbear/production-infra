"""Canonical compatibility for the current ERP UI.

These endpoints preserve the UI's existing response field names while reading
and writing only the canonical schemas. Consequential document mutations still
use the reviewed operator-command boundary; the product mutation below creates
only a non-transactional draft.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Any, Dict, Literal, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Security, status
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
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.money import money_json
from ...core.security.permissions import PermissionChecker
from ..schemas.money import MoneyJSON
from ..schemas.master.customer import CanonicalCustomerCreate
from ..schemas.master.supplier import CanonicalSupplierCreate

router = APIRouter(dependencies=[Security(HTTPBearer(auto_error=False))])
logger = logging.getLogger(__name__)


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


class CanonicalBusinessContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    organization_id: UUID
    organization_timezone: str
    business_date: date


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
    return CanonicalBusinessContext.model_validate(rows[0])

INDIAN_STATE_CODES = {
    "Andaman and Nicobar Islands": "35", "Andhra Pradesh": "37",
    "Arunachal Pradesh": "12", "Assam": "18", "Bihar": "10",
    "Chandigarh": "04", "Chhattisgarh": "22",
    "Dadra and Nagar Haveli and Daman and Diu": "26", "Delhi": "07",
    "Goa": "30", "Gujarat": "24", "Haryana": "06",
    "Himachal Pradesh": "02", "Jammu and Kashmir": "01", "Jharkhand": "20",
    "Karnataka": "29", "Kerala": "32", "Ladakh": "38",
    "Lakshadweep": "31", "Madhya Pradesh": "23", "Maharashtra": "27",
    "Manipur": "14", "Meghalaya": "17", "Mizoram": "15", "Nagaland": "13",
    "Odisha": "21", "Puducherry": "34", "Punjab": "03",
    "Rajasthan": "08", "Sikkim": "11", "Tamil Nadu": "33",
    "Telangana": "36", "Tripura": "16", "Uttar Pradesh": "09",
    "Uttarakhand": "05", "West Bengal": "19",
}


def _state_code(state_name: Optional[str], gstin: Optional[str]) -> Optional[str]:
    if gstin:
        gst_state = gstin[:2]
        if state_name and INDIAN_STATE_CODES.get(state_name) != gst_state:
            raise HTTPException(status_code=422, detail="GSTIN state does not match the address state")
        return gst_state
    if not state_name:
        return None
    code = INDIAN_STATE_CODES.get(state_name)
    if code is None:
        raise HTTPException(status_code=422, detail=f"Unsupported Indian state: {state_name}")
    return code


def _party_posting_account(db: Session, org_id: UUID, account_type: str) -> UUID:
    account_id = db.execute(text("""
        SELECT id FROM finance.accounts
         WHERE org_id=:org_id AND account_type=:account_type
           AND allows_party_posting AND status='active' AND currency_code='INR'
         ORDER BY code, id LIMIT 1
    """), {"org_id": org_id, "account_type": account_type}).scalar()
    if account_id is None:
        raise HTTPException(
            status_code=409,
            detail=f"No active INR party-posting {account_type} account is configured",
        )
    return account_id


class CanonicalProductDraftCreate(BaseModel):
    """Small, honest product-draft contract for the canonical catalog."""

    product_name: str = Field(min_length=1, max_length=255)
    product_code: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._/-]*$",
    )
    generic_name: Optional[str] = Field(default=None, max_length=255)
    product_kind: str = Field(default="medicine", pattern=r"^(medicine|medical_device|consumable)$")

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class CanonicalCustomerAddressWrite(BaseModel):
    address_line1: str = Field(min_length=1, max_length=255)
    address_line2: Optional[str] = Field(default=None, max_length=255)
    landmark: Optional[str] = Field(default=None, max_length=255)
    city: str = Field(min_length=1, max_length=128)
    state: str = Field(min_length=1, max_length=128)
    pincode: str = Field(pattern=r"^[0-9]{6}$")
    address_type: Literal["billing", "shipping", "other"] = "shipping"
    is_default: bool = False

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class CanonicalProductDraftUpdate(BaseModel):
    product_name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    generic_name: Optional[str] = Field(default=None, max_length=255)
    product_kind: Optional[str] = Field(
        default=None, pattern=r"^(medicine|medical_device|consumable)$"
    )

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    @model_validator(mode="after")
    def require_change(self):
        if not self.model_fields_set:
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
               CASE WHEN tax_version.taxability IS NULL THEN NULL
                    WHEN tax_version.taxability='taxable' THEN tax_version.igst_rate
                    ELSE 0 END AS gst_percent,
               CASE WHEN p.status='draft' AND p.hsn_code='0000' THEN NULL ELSE p.hsn_code END AS hsn_code,
               p.dosage_form, p.strength_display, p.drug_schedule,
               p.requires_prescription, p.cold_chain_required,
               p.status='active' AS is_active, p.status, p.created_at, p.updated_at,
               COALESCE(stock.current_stock, 0) AS current_stock
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
    duplicate = db.execute(
        text("""
            SELECT 1 FROM catalog.products
             WHERE org_id=:org_id AND lower(btrim(name))=lower(btrim(:name))
             LIMIT 1
        """),
        {"org_id": org_id, "name": product.product_name},
    ).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="Product name already exists")

    sku = product.product_code or f"DRAFT-{uuid4().hex[:12].upper()}"
    try:
        created = db.execute(
            text("""
                INSERT INTO catalog.products (
                    org_id, sku, product_kind, name, generic_name,
                    base_uom_code, hsn_code, cold_chain_required, status
                ) VALUES (
                    :org_id, :sku, :product_kind, :name, :generic_name,
                    'EA', '0000', false, 'draft'
                )
                RETURNING id, sku, name
            """),
            {
                "org_id": org_id,
                "sku": sku,
                "product_kind": product.product_kind,
                "name": product.product_name,
                "generic_name": product.generic_name,
            },
        ).one()
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        constraint_name = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
        logger.warning(
            "Canonical product draft insert rejected by constraint=%s",
            constraint_name or "unknown",
            exc_info=True,
        )
        detail = (
            "Product code already exists"
            if constraint_name == "products_sku_uq"
            else "Product draft does not satisfy the canonical catalog rules"
        )
        raise HTTPException(status_code=409, detail=detail) from exc

    return {
        "product_id": created.id,
        "product_code": created.sku,
        "product_name": created.name,
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
    fields = product.model_fields_set
    updated = db.execute(
        text("""
            UPDATE catalog.products
               SET name = CASE WHEN :set_name THEN :name ELSE name END,
                   generic_name = CASE WHEN :set_generic THEN :generic_name ELSE generic_name END,
                   product_kind = CASE WHEN :set_kind THEN :product_kind ELSE product_kind END,
                   updated_at = transaction_timestamp(),
                   row_version = row_version + 1
             WHERE org_id=:org_id AND id=:product_id AND status='draft'
             RETURNING id, sku, name
        """),
        {
            "org_id": org_id,
            "product_id": product_id,
            "set_name": "product_name" in fields,
            "name": product.product_name,
            "set_generic": "generic_name" in fields,
            "generic_name": product.generic_name,
            "set_kind": "product_kind" in fields,
            "product_kind": product.product_kind,
        },
    ).first()
    if updated is None:
        db.rollback()
        raise HTTPException(status_code=409, detail="Only existing product drafts can be edited")
    db.commit()
    return {
        "product_id": updated.id,
        "product_code": updated.sku,
        "product_name": updated.name,
        "lifecycle_status": "draft",
        "message": "Product draft updated",
    }


@router.delete("/products/{product_id}")
def delete_product_draft(
    product_id: UUID,
    user: dict = Depends(PermissionChecker("master", "delete")),
    db: Session = Depends(get_db),
):
    """Delete only an unused draft; active catalog records are immutable here."""

    org_id = _activate(db, user)
    try:
        deleted = db.execute(text("""
            DELETE FROM catalog.products
             WHERE org_id=:org_id AND id=:product_id AND status='draft'
         RETURNING id, sku, name
        """), {"org_id": org_id, "product_id": product_id}).first()
        if deleted is None:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail="Only an existing unused product draft can be deleted",
            )
        db.commit()
    except HTTPException:
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This draft is already referenced and cannot be deleted",
        ) from exc
    return {
        "success": True,
        "product_id": deleted.id,
        "product_code": deleted.sku,
        "product_name": deleted.name,
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
               CASE WHEN tax_version.taxability IS NULL THEN NULL
                    WHEN tax_version.taxability='taxable' THEN tax_version.igst_rate
                    ELSE 0 END AS gst_percent,
               product.status='active' AS is_active,
               COALESCE(batch_data.batches, '[]'::jsonb) AS batches,
               COALESCE(batch_data.total_quantity_available, 0) AS total_quantity_available
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
                         'expiry_date', batch.expires_on, 'mrp_per_unit', batch.mrp,
                         'sale_price_per_unit', NULL,
                         'cost_per_unit', stock.average_unit_cost,
                         'quantity_available', COALESCE(stock.quantity_available, 0),
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
               batch.expires_on AS expiry_date, batch.mrp AS mrp_per_unit,
               batch.mrp AS sale_price_per_unit,
               conversion.id AS uom_conversion_id,
               balance.location_id, balance.branch_id,
               location.name AS location_name, branch.name AS branch_name,
               balance.average_unit_cost AS cost_per_unit,
               balance.on_hand_quantity AS quantity_available,
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
               CASE WHEN tax_version.taxability IS NULL THEN NULL
                    WHEN tax_version.taxability='taxable' THEN tax_version.igst_rate
                    ELSE 0 END AS gst_percent,
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


def _insert_party_contact_address_and_tax(
    db: Session,
    *,
    org_id: UUID,
    legal_name: str,
    party_kind: str,
    pan: Optional[str],
    contact_name: str,
    phone: Optional[str],
    email: Optional[str],
    address_line1: Optional[str],
    address_line2: Optional[str],
    city: Optional[str],
    state_name: Optional[str],
    postal_code: Optional[str],
    gstin: Optional[str],
) -> UUID:
    duplicate = db.execute(text("""
        SELECT 1 FROM parties.parties
         WHERE org_id=:org_id AND lower(btrim(legal_name))=lower(btrim(:legal_name))
           AND status IN ('draft','active','blocked') LIMIT 1
    """), {"org_id": org_id, "legal_name": legal_name}).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="A party with this legal name already exists")

    party_id = db.execute(text("""
        INSERT INTO "parties"."parties" (
            org_id, party_kind, legal_name, pan, pan_verification_status, status
        ) VALUES (:org_id, :party_kind, :legal_name, :pan, 'unverified', 'draft')
        RETURNING id
    """), {
        "org_id": org_id, "party_kind": party_kind,
        "legal_name": legal_name, "pan": pan,
    }).scalar_one()

    if phone or email:
        db.execute(text("""
            INSERT INTO "parties"."contacts" (
                org_id, party_id, contact_kind, name, email, phone, is_primary, status
            ) VALUES (
                :org_id, :party_id, 'business', :name, :email, :phone, true, 'active'
            )
        """), {
            "org_id": org_id, "party_id": party_id, "name": contact_name,
            "email": str(email) if email else None, "phone": phone,
        })

    address_values = [address_line1, city, state_name, postal_code]
    if any(address_values) and not all(address_values):
        raise HTTPException(
            status_code=422,
            detail="Address line, city, state, and pincode must be supplied together",
        )
    state_code = _state_code(state_name, gstin)
    if all(address_values):
        db.execute(text("""
            INSERT INTO "parties"."addresses" (
                org_id, party_id, address_kind, line1, line2, city, state_code,
                postal_code, country_code, is_primary, status
            ) VALUES (
                :org_id, :party_id, 'billing', :line1, :line2, :city, :state_code,
                :postal_code, 'IN', true, 'active'
            )
        """), {
            "org_id": org_id, "party_id": party_id, "line1": address_line1,
            "line2": address_line2, "city": city, "state_code": state_code,
            "postal_code": postal_code,
        })

    if gstin:
        db.execute(text("""
            INSERT INTO "parties"."tax_registrations" (
                org_id, party_id, registration_type, registration_number,
                registered_legal_name, state_code, taxpayer_type, status
            ) VALUES (
                :org_id, :party_id, 'GSTIN', :gstin,
                :legal_name, :state_code, 'regular', 'pending_verification'
            )
        """), {
            "org_id": org_id, "party_id": party_id, "gstin": gstin,
            "legal_name": legal_name, "state_code": state_code,
        })

    activated_party = db.execute(text("""
        UPDATE parties.parties
           SET status='active', updated_at=transaction_timestamp(), row_version=row_version+1
         WHERE org_id=:org_id AND id=:party_id AND status='draft'
     RETURNING id
    """), {"org_id": org_id, "party_id": party_id}).scalar_one_or_none()
    if activated_party is None:
        raise HTTPException(status_code=409, detail="Party activation failed")
    return party_id


@router.post(
    "/customers/",
    status_code=status.HTTP_201_CREATED,
    operation_id="create_canonical_customer",
)
def create_customer(
    customer: CanonicalCustomerCreate,
    user: dict = Depends(PermissionChecker("master", "create")),
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    receivable_account_id = _party_posting_account(db, org_id, "asset")
    try:
        party_id = _insert_party_contact_address_and_tax(
            db,
            org_id=org_id,
            legal_name=customer.customer_name,
            party_kind="individual" if customer.customer_type == "individual" else "organization",
            pan=customer.pan_number,
            contact_name=customer.contact_person_name or customer.customer_name,
            phone=customer.primary_phone,
            email=customer.primary_email,
            address_line1=customer.address_line1,
            address_line2=customer.address_line2,
            city=customer.city,
            state_name=customer.state,
            postal_code=customer.pincode,
            gstin=customer.gst_number,
        )
        customer_code = customer.customer_code or f"CUST-{uuid4().hex[:10].upper()}"
        account = db.execute(text("""
            INSERT INTO "parties"."customer_accounts" (
                org_id, party_id, customer_code, credit_limit, credit_days,
                default_receivable_account_id, status
            ) VALUES (
                :org_id, :party_id, :code, :credit_limit, :credit_days,
                :account_id, 'active'
            ) RETURNING id
        """), {
            "org_id": org_id, "party_id": party_id, "code": customer_code,
            "credit_limit": customer.credit_limit, "credit_days": customer.credit_days,
            "account_id": receivable_account_id,
        }).scalar_one()
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Customer code or contact already exists") from exc
    return {
        "customer_id": account,
        "party_id": party_id,
        "customer_code": customer_code,
        "customer_name": customer.customer_name,
        "primary_phone": customer.primary_phone,
        "primary_email": customer.primary_email,
        "gst_number": customer.gst_number,
        "customer_type": customer.customer_type,
        "credit_limit": customer.credit_limit,
        "credit_days": customer.credit_days,
        "is_active": True,
        "status": "active",
        "message": "Customer created",
    }


@router.post(
    "/suppliers/",
    status_code=status.HTTP_201_CREATED,
    operation_id="create_canonical_supplier",
)
def create_supplier(
    supplier: CanonicalSupplierCreate,
    user: dict = Depends(PermissionChecker("master", "create")),
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    payable_account_id = _party_posting_account(db, org_id, "liability")
    try:
        party_id = _insert_party_contact_address_and_tax(
            db,
            org_id=org_id,
            legal_name=supplier.supplier_name,
            party_kind="organization",
            pan=supplier.pan_number,
            contact_name=supplier.contact_person or supplier.supplier_name,
            phone=supplier.primary_phone,
            email=supplier.primary_email,
            address_line1=supplier.address_line1,
            address_line2=supplier.address_line2,
            city=supplier.city,
            state_name=supplier.state,
            postal_code=supplier.pincode,
            gstin=supplier.gst_number,
        )
        supplier_code = supplier.supplier_code or f"SUP-{uuid4().hex[:10].upper()}"
        account = db.execute(text("""
            INSERT INTO "parties"."supplier_accounts" (
                org_id, party_id, supplier_code, payment_days,
                default_payable_account_id, status
            ) VALUES (
                :org_id, :party_id, :code, :payment_days, :account_id, 'active'
            ) RETURNING id
        """), {
            "org_id": org_id, "party_id": party_id, "code": supplier_code,
            "payment_days": supplier.payment_days,
            "account_id": payable_account_id,
        }).scalar_one()
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Supplier code or contact already exists") from exc
    return {
        "supplier_id": account,
        "party_id": party_id,
        "supplier_code": supplier_code,
        "supplier_name": supplier.supplier_name,
        "primary_phone": supplier.primary_phone,
        "primary_email": supplier.primary_email,
        "gst_number": supplier.gst_number,
        "payment_days": supplier.payment_days,
        "is_active": True,
        "status": "active",
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
    state_code = _state_code(address.state, None)
    try:
        if address.is_default:
            db.execute(text("""
                UPDATE "parties"."addresses"
                   SET is_primary=false
                 WHERE org_id=:org_id AND party_id=:party_id
                   AND address_kind=:kind AND status='active'
            """), {"org_id": org_id, "party_id": party_id, "kind": address.address_type})
        address_id = db.execute(text("""
            INSERT INTO parties.addresses (
                org_id, party_id, address_kind, line1, line2, landmark,
                city, state_code, postal_code, country_code, is_primary, status
            ) VALUES (
                :org_id, :party_id, :kind, :line1, :line2, :landmark,
                :city, :state_code, :postal_code, 'IN',
                CASE WHEN :is_default THEN true ELSE NOT EXISTS (
                    SELECT 1 FROM parties.addresses
                     WHERE org_id=:org_id AND party_id=:party_id
                       AND address_kind=:kind AND status='active'
                ) END,
                'active'
            ) RETURNING id
        """), {
            "org_id": org_id, "party_id": party_id,
            "kind": address.address_type, "line1": address.address_line1,
            "line2": address.address_line2, "landmark": address.landmark,
            "city": address.city, "state_code": state_code,
            "postal_code": address.pincode, "is_default": address.is_default,
        }).scalar_one()
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Address conflicts with existing customer data") from exc
    return {"success": True, "address_id": address_id, "customer_id": customer_id,
            "message": "Address created"}


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
    state_code = _state_code(address.state, None)
    try:
        if address.is_default:
            db.execute(text("""
                UPDATE "parties"."addresses"
                   SET is_primary=false
                 WHERE org_id=:org_id AND party_id=:party_id
                   AND address_kind=:kind AND id<>:address_id AND status='active'
            """), {"org_id": org_id, "party_id": party_id,
                     "address_id": address_id, "kind": address.address_type})
        updated = db.execute(text("""
            UPDATE "parties"."addresses"
               SET address_kind=:kind, line1=:line1, line2=:line2,
                   landmark=:landmark, city=:city, state_code=:state_code,
                   postal_code=:postal_code,
                   is_primary=CASE WHEN :is_default THEN true ELSE NOT EXISTS (
                       SELECT 1 FROM parties.addresses other
                        WHERE other.org_id=:org_id AND other.party_id=:party_id
                          AND other.address_kind=:kind AND other.id<>:address_id
                          AND other.status='active' AND other.is_primary
                   ) END,
                   updated_at=transaction_timestamp(), row_version=row_version+1
             WHERE org_id=:org_id AND party_id=:party_id AND id=:address_id
               AND status='active'
         RETURNING id, row_version
        """), {
            "org_id": org_id, "party_id": party_id, "address_id": address_id,
            "kind": address.address_type, "line1": address.address_line1,
            "line2": address.address_line2, "landmark": address.landmark,
            "city": address.city, "state_code": state_code,
            "postal_code": address.pincode, "is_default": address.is_default,
        }).mappings().first()
        if updated is None:
            raise HTTPException(status_code=404, detail="Customer address not found")
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Address conflicts with existing customer data") from exc
    return {"success": True, "address_id": updated["id"],
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
                 AND status='active' AND valid_from<=CURRENT_DATE
                 AND (valid_until IS NULL OR valid_until>=CURRENT_DATE)
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
        SELECT id AS tax_id, code AS tax_code, description AS tax_name,
               cgst_rate, sgst_rate, igst_rate, cess_rate,
               GREATEST(cgst_rate+sgst_rate, igst_rate)+cess_rate AS total_rate,
               taxability, effective_from, effective_to,
               status='active' AS is_active, status
          FROM tax.tax_code_versions
         WHERE status='active' AND effective_from<=current_date
           AND (effective_to IS NULL OR effective_to>=current_date)
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


@router.get("/gst/dashboard")
def gst_dashboard(
    period: Literal["current", "previous", "quarter", "year"] = Query("current"),
    user: dict = Depends(PermissionChecker("gst", "view")),
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    rows = _rows(db, """
        WITH period_bounds AS (
            SELECT CASE :period
                     WHEN 'previous' THEN (date_trunc('month', CURRENT_DATE)-interval '1 month')::date
                     WHEN 'quarter' THEN date_trunc('quarter', CURRENT_DATE)::date
                     WHEN 'year' THEN date_trunc('year', CURRENT_DATE)::date
                     ELSE date_trunc('month', CURRENT_DATE)::date
                   END AS date_from,
                   CASE :period
                     WHEN 'previous' THEN (date_trunc('month', CURRENT_DATE)-interval '1 day')::date
                     ELSE CURRENT_DATE
                   END AS date_to
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
                         FROM automation.command_requests command
                         JOIN tax.portal_document_lines portal_line
                           ON portal_line.org_id=command.org_id
                          AND portal_line.id=NULLIF(
                              pg_catalog.convert_from(command.request_bytes,'UTF8')::jsonb
                              ->>'portal_document_line_id',''
                          )::uuid
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
                        WHERE command.org_id=invoice.org_id
                          AND command.target_resource_type='supplier_invoice'
                          AND command.target_resource_id=invoice.id
                          AND command.result_resource_type='supplier_invoice'
                          AND command.result_resource_id=invoice.id
                          AND command.capability_code='procurement.supplier_invoice.prepare'
                          AND command.operation='procurement.supplier_invoice.post'
                          AND command.status='succeeded'
                          AND return_period.period_start>=period.date_from
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
               COALESCE(input.cgst,0) AS input_cgst,
               COALESCE(input.sgst,0) AS input_sgst,
               COALESCE(input.igst,0) AS input_igst,
               COALESCE(input.cess,0) AS input_cess,
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
                       FROM automation.command_requests command
                       JOIN tax.portal_document_lines portal_line
                         ON portal_line.org_id=command.org_id
                        AND portal_line.id=NULLIF(
                            pg_catalog.convert_from(command.request_bytes,'UTF8')::jsonb
                            ->>'portal_document_line_id',''
                        )::uuid
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
                      WHERE command.org_id=invoice.org_id
                        AND command.target_resource_type='supplier_invoice'
                        AND command.target_resource_id=invoice.id
                        AND command.result_resource_type='supplier_invoice'
                        AND command.result_resource_id=invoice.id
                        AND command.capability_code='procurement.supplier_invoice.prepare'
                        AND command.operation='procurement.supplier_invoice.post'
                        AND command.status='succeeded'
                        AND return_period.period_start>=:date_from
                        AND return_period.period_end<=:date_to
                 )
          ) input
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
    payable = {component: max(Decimal("0"), output[component]-input_credit[component]) for component in output}
    output_total = sum(output.values(), Decimal("0"))
    input_total = sum(input_credit.values(), Decimal("0"))
    return {
        "period": {"start": date_from, "end": date_to},
        "outputTax": {**{key: money_json(value) for key, value in output.items()}, "total": money_json(output_total)},
        "inputCredit": {**{key: money_json(value) for key, value in input_credit.items()}, "total": money_json(input_total)},
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
          WHEN payment.due_date IS NOT NULL AND payment.due_date < CURRENT_DATE
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
    batch_id: UUID
    batch_number: str
    expiry_date: Optional[date]
    mrp: ExactRate
    available_quantity: ExactQuantity

    @model_validator(mode="after")
    def validate_quantity(self):
        if self.quantity < 0 or self.free_quantity < 0:
            raise ValueError("order import quantities cannot be negative")
        if self.quantity + self.free_quantity <= 0:
            raise ValueError("order import line requires a positive quantity")
        if self.available_quantity < self.quantity + self.free_quantity:
            raise ValueError("order import reservation does not cover its quantity")
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
                                 (requested_line.request_line->>'line_id')::uuid
                                   AS source_line_id,
                                 command_evidence.command_request_id,
                                 command_evidence.command_evidence_count,
                                 requested_line.request_line_count,
                                 pg_catalog.jsonb_array_length(COALESCE(
                                   requested_line.request_line->'batch_allocations',
                                   '[]'::jsonb
                                 )) AS evidenced_allocation_count,
                                 requested_allocation.evidence_match_count,
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
                                   (requested_allocation.request_allocation
                                      ->>'billed_quantity')::numeric
                                     * line.uom_conversion_factor, 6
                                 ) AS base_billed_quantity,
                                 pg_catalog.round(
                                   (requested_allocation.request_allocation
                                      ->>'free_quantity')::numeric
                                     * line.uom_conversion_factor, 6
                                 ) AS base_free_quantity,
                                 (requested_allocation.request_allocation
                                    ->>'billed_quantity')::numeric
                                   AS billed_quantity,
                                 (requested_allocation.request_allocation
                                    ->>'free_quantity')::numeric
                                   AS free_quantity
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
                            LEFT JOIN LATERAL (
                                SELECT count(*)::integer AS command_evidence_count,
                                       CASE WHEN count(*)=1 THEN
                                         (array_agg(command.id ORDER BY command.id))[1]
                                       END AS command_request_id,
                                       CASE WHEN count(*)=1 THEN (array_agg(
                                         pg_catalog.convert_from(
                                           command.request_bytes, 'UTF8'
                                         )::jsonb ORDER BY command.id
                                       ))[1] END AS request_document
                                  FROM automation.command_requests command
                                 WHERE command.org_id=invoice.org_id
                                   AND command.branch_id=invoice.branch_id
                                   AND command.capability_code='sales.invoice.prepare'
                                   AND command.operation='sales.invoice.post'
                                   AND command.target_resource_type='sales_invoice'
                                   AND command.target_resource_id=invoice.id
                                   AND command.status='succeeded'
                                   AND command.result_resource_type='sales_invoice'
                                   AND command.result_resource_id=invoice.id
                                   AND command.response_status=200
                                   AND command.request_hash=pg_catalog.sha256(
                                       command.request_bytes
                                   )
                            ) command_evidence ON true
                            LEFT JOIN LATERAL (
                                SELECT count(*)::integer AS request_line_count,
                                       CASE WHEN count(*)=1 THEN
                                         (array_agg(candidate.value))[1]
                                       END AS request_line
                                  FROM pg_catalog.jsonb_array_elements(COALESCE(
                                    command_evidence.request_document->'lines',
                                    '[]'::jsonb
                                  )) candidate(value)
                                 WHERE candidate.value->>'line_id'=line.id::text
                                   AND candidate.value->>'fulfillment_source'='direct_issue'
                            ) requested_line ON true
                            LEFT JOIN LATERAL (
                                SELECT count(*)::integer AS evidence_match_count,
                                       CASE WHEN count(*)=1 THEN
                                         (array_agg(candidate.value))[1]
                                       END AS request_allocation
                                  FROM pg_catalog.jsonb_array_elements(COALESCE(
                                    requested_line.request_line->'batch_allocations',
                                    '[]'::jsonb
                                  )) candidate(value)
                                 WHERE candidate.value->>'inventory_line_id'
                                         =inventory_line.id::text
                                   AND candidate.value->>'batch_id'
                                         =inventory_line.batch_id::text
                            ) requested_allocation ON true
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
    user: dict = SALES_USER,
    db: Session = Depends(get_db),
):
    """Return a complete canonical order for invoice/challan import flows."""
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT document.id AS order_id, document.id,
               document.order_number, document.order_date,
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
               COALESCE(lines.items, '[]'::jsonb) AS items,
               (SELECT count(*)
                  FROM sales.order_lines source_line
                 WHERE source_line.org_id=document.org_id
                   AND source_line.order_id=document.id
                   AND source_line.line_kind='product') AS source_item_count,
               COALESCE(lines.importable_item_count, 0) AS importable_item_count,
               document.created_at, document.updated_at
          FROM sales.orders document
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
          LEFT JOIN LATERAL (
              SELECT jsonb_agg(jsonb_build_object(
                         'id', line.id, 'source_document_kind', 'sales_order',
                         'product_id', line.product_id,
                         'product_name', product.name, 'product_code', product.sku,
                         'hsn_code', product.hsn_code, 'branch_id', document.branch_id,
                         'location_id', reservation.location_id,
                         'uom_conversion_id', conversion.id,
                         'uom_code', line.uom_code,
                         'unit', line.uom_code, 'quantity',
                             to_char(line.billed_quantity, 'FM999999999999999990.000000'),
                         'free_quantity',
                             to_char(line.free_quantity, 'FM999999999999999990.000000'),
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
                         'line_total',
                             to_char(line.line_total, 'FM999999999999999990.00'),
                         'batch_id', reservation.batch_id,
                         'batch_number', reservation.batch_number,
                         'expiry_date', reservation.expiry_date,
                         'mrp', to_char(
                             reservation.mrp, 'FM999999999999999990.0000'),
                         'available_quantity', to_char(
                             reservation.available_quantity,
                             'FM999999999999999990.000000')
                     ) ORDER BY line.line_number) AS items,
                     count(*)::integer AS importable_item_count
                FROM sales.order_lines line
                JOIN catalog.products product
                  ON product.org_id=line.org_id AND product.id=line.product_id
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
                               AND candidate_conversion.multiplier=line.uom_conversion_factor
                               AND candidate_conversion.status='active'
                               AND candidate_conversion.valid_from<=document.order_date
                               AND (candidate_conversion.valid_until IS NULL
                                    OR candidate_conversion.valid_until>=document.order_date)
                           ) candidate
                     WHERE candidate.candidate_count=1
                ) conversion ON true
                JOIN LATERAL (
                    SELECT candidate.batch_id, candidate.batch_number,
                           candidate.expiry_date, candidate.mrp,
                           candidate.location_id,
                           pg_catalog.round(
                               candidate.quantity
                               / NULLIF(line.uom_conversion_factor, 0), 6
                           )
                               AS available_quantity
                      FROM (
                            SELECT held.batch_id, batch.batch_number,
                                   batch.expires_on AS expiry_date, batch.mrp,
                                   held.location_id, held.quantity,
                                   count(*) OVER () AS candidate_count
                              FROM inventory.reservations held
                              JOIN inventory.batches batch
                                ON batch.org_id=held.org_id AND batch.id=held.batch_id
                             WHERE held.org_id=line.org_id
                               AND held.order_line_id=line.id
                               AND held.branch_id=document.branch_id
                               AND held.status='active'
                               AND held.expires_at>transaction_timestamp()
                           ) candidate
                     WHERE candidate.candidate_count=1
                ) reservation ON true
               WHERE line.org_id=document.org_id AND line.order_id=document.id
                 AND line.line_kind='product' AND line.product_id IS NOT NULL
          ) lines ON true
         WHERE document.org_id=:org_id AND document.id=:order_id
    """, {"org_id": org_id, "order_id": order_id})
    if len(rows) != 1:
        raise HTTPException(status_code=404, detail="Sales order not found")
    result = rows[0]
    if result["status"] != "approved":
        raise HTTPException(
            status_code=409,
            detail="Only an approved, unfulfilled sales order can be imported",
        )
    if (
        int(result["source_item_count"]) <= 0
        or int(result["source_item_count"]) != int(result["importable_item_count"])
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "Sales-order import requires exactly one active canonical batch "
                "reservation and one unambiguous UOM conversion per product line; "
                "multi-reservation orders are not available yet"
            ),
        )
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
                      FROM (
                            SELECT candidate_command.id AS command_request_id,
                                   count(*) OVER () AS candidate_count
                              FROM automation.command_requests candidate_command
                             WHERE candidate_command.org_id=dispatch.org_id
                               AND candidate_command.capability_code='sales.dispatch.prepare'
                               AND candidate_command.status='succeeded'
                               AND candidate_command.result_resource_id=dispatch.id
                           ) candidate
                     WHERE candidate.candidate_count=1
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
                 WHEN invoice.due_date<CURRENT_DATE THEN 'overdue'
                 ELSE 'pending'
               END AS payment_status,
               COALESCE(lines.items_count,0) AS items_count,
               count(*) OVER() AS _total,
               invoice.created_at, invoice.updated_at
          FROM procurement.supplier_invoices invoice
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
                 WHEN invoice.due_date<CURRENT_DATE THEN 'overdue'
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
          JOIN parties.supplier_accounts account ON account.org_id=receipt.org_id AND account.id=receipt.supplier_account_id
          JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
          LEFT JOIN LATERAL (
              SELECT count(*) AS items_count, SUM(line.extended_cost) AS total_amount
                FROM procurement.goods_receipt_lines line
               WHERE line.org_id=receipt.org_id AND line.goods_receipt_id=receipt.id
          ) lines ON true
         WHERE receipt.org_id=:org_id
           AND (:from_date IS NULL OR receipt.received_at::date>=CAST(:from_date AS date))
           AND (:to_date IS NULL OR receipt.received_at::date<=CAST(:to_date AS date))
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


@router.get("/sale-returns/")
def sales_returns(limit: int = Query(100, ge=1, le=500), skip: int = Query(0, ge=0),
                  offset: Optional[int] = Query(None, ge=0),
                  search: str = Query("", max_length=200),
                  status: Optional[str] = None, from_date: Optional[str] = None,
                  to_date: Optional[str] = None,
                  user: dict = Depends(PermissionChecker("returns", "view")),
                  db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    effective_offset = offset if offset is not None else skip
    rows = _rows(db, """
        SELECT return_row.id AS return_id, return_row.return_number,
               return_row.return_date, return_row.status,
               return_row.customer_account_id AS customer_id,
               party.legal_name AS customer_name, return_row.grand_total AS total_amount,
               return_row.reason_code AS reason,
               invoice.invoice_number AS original_document_no,
               invoice.invoice_number AS original_invoice_number,
               COALESCE(lines.items_count, 0) AS items_count,
               COUNT(*) OVER() AS filtered_total,
               return_row.created_at, return_row.updated_at
          FROM sales.returns return_row
          JOIN parties.customer_accounts account
            ON account.org_id=return_row.org_id AND account.id=return_row.customer_account_id
          JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
          JOIN sales.invoices invoice
            ON invoice.org_id=return_row.org_id AND invoice.id=return_row.invoice_id
          LEFT JOIN LATERAL (
              SELECT count(*) AS items_count FROM sales.return_lines line
               WHERE line.org_id=return_row.org_id AND line.return_id=return_row.id
          ) lines ON true
         WHERE return_row.org_id=:org_id
           AND (:status IS NULL OR return_row.status=:status)
           AND (:from_date IS NULL OR return_row.return_date>=CAST(:from_date AS date))
           AND (:to_date IS NULL OR return_row.return_date<=CAST(:to_date AS date))
           AND (:search='' OR return_row.return_number ILIKE :search_pattern
                OR invoice.invoice_number ILIKE :search_pattern
                OR party.legal_name ILIKE :search_pattern)
         ORDER BY return_row.return_date DESC, return_row.id DESC
         LIMIT :limit OFFSET :offset
    """, {"org_id": org_id, "limit": limit, "offset": effective_offset,
            "search": search.strip(), "search_pattern": f"%{search.strip()}%",
            "status": status, "from_date": from_date, "to_date": to_date})
    total = int(rows[0].get("filtered_total", len(rows))) if rows else 0
    for row in rows:
        row.pop("filtered_total", None)
    return {"returns": rows, "sales_returns": rows, "total": total}


@router.get("/purchase-returns/")
def purchase_returns(limit: int = Query(100, ge=1, le=500), skip: int = Query(0, ge=0),
                     offset: Optional[int] = Query(None, ge=0),
                     search: str = Query("", max_length=200),
                     status: Optional[str] = None, from_date: Optional[str] = None,
                     to_date: Optional[str] = None,
                     user: dict = Depends(PermissionChecker("returns", "view")),
                     db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    effective_offset = offset if offset is not None else skip
    rows = _rows(db, """
        SELECT return_row.id AS return_id,
               return_row.purchase_return_number AS return_number,
               return_row.return_date, return_row.status,
               return_row.supplier_account_id AS supplier_id,
               party.legal_name AS supplier_name, return_row.grand_total AS total_amount,
               return_row.reason_code AS reason,
               invoice.supplier_invoice_number AS original_document_no,
               invoice.supplier_invoice_number AS original_invoice_number,
               COALESCE(lines.items_count, 0) AS items_count,
               COUNT(*) OVER() AS filtered_total,
               return_row.created_at, return_row.updated_at
          FROM procurement.purchase_returns return_row
          JOIN parties.supplier_accounts account
            ON account.org_id=return_row.org_id AND account.id=return_row.supplier_account_id
          JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
          LEFT JOIN procurement.supplier_invoices invoice
            ON invoice.org_id=return_row.org_id AND invoice.id=return_row.supplier_invoice_id
          LEFT JOIN LATERAL (
              SELECT count(*) AS items_count FROM procurement.purchase_return_lines line
               WHERE line.org_id=return_row.org_id AND line.purchase_return_id=return_row.id
          ) lines ON true
         WHERE return_row.org_id=:org_id
           AND (:status IS NULL OR return_row.status=:status)
           AND (:from_date IS NULL OR return_row.return_date>=CAST(:from_date AS date))
           AND (:to_date IS NULL OR return_row.return_date<=CAST(:to_date AS date))
           AND (:search='' OR return_row.purchase_return_number ILIKE :search_pattern
                OR COALESCE(invoice.supplier_invoice_number, '') ILIKE :search_pattern
                OR party.legal_name ILIKE :search_pattern)
         ORDER BY return_row.return_date DESC, return_row.id DESC
         LIMIT :limit OFFSET :offset
    """, {"org_id": org_id, "limit": limit, "offset": effective_offset,
            "search": search.strip(), "search_pattern": f"%{search.strip()}%",
            "status": status, "from_date": from_date, "to_date": to_date})
    total = int(rows[0].get("filtered_total", len(rows))) if rows else 0
    for row in rows:
        row.pop("filtered_total", None)
    return {"returns": rows, "purchase_returns": rows, "total": total}


@router.get("/gst/reports/tax/gstr2a")
def gstr2a(user: dict = Depends(PermissionChecker("gst", "view")),
           db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT invoice.id AS invoice_id,
               invoice.supplier_invoice_number AS invoice_number,
               invoice.supplier_invoice_date AS invoice_date,
               invoice.supplier_legal_name_snapshot AS supplier_name,
               invoice.supplier_gstin_snapshot AS supplier_gst_number,
               invoice.gst_taxable_total AS taxable_amount,
               invoice.cgst_total AS cgst_amount, invoice.sgst_total AS sgst_amount,
               invoice.igst_total AS igst_amount, invoice.grand_total AS total_amount
          FROM procurement.supplier_invoices invoice
         WHERE invoice.org_id=:org_id AND invoice.status<>'cancelled'
         ORDER BY invoice.supplier_invoice_date DESC, invoice.id DESC
    """, {"org_id": org_id})
    return {"invoices": rows, "summary": {"totalInvoices": len(rows),
            "totalTaxableValue": sum((row["taxable_amount"] or 0) for row in rows),
            "totalCGST": sum((row["cgst_amount"] or 0) for row in rows),
            "totalSGST": sum((row["sgst_amount"] or 0) for row in rows),
            "totalIGST": sum((row["igst_amount"] or 0) for row in rows)}}


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


@router.get("/reports/tax/hsn")
def hsn_summary(from_date: Optional[str] = None, to_date: Optional[str] = None,
                user: dict = Depends(PermissionChecker("gst", "view")),
                db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT COALESCE(product.hsn_code,'N/A') AS hsn_code,
               product.name AS description, SUM(line.billed_quantity) AS quantity,
               SUM(line.gst_taxable_value) AS taxable_value,
               SUM(line.cgst_amount) AS cgst, SUM(line.sgst_amount) AS sgst,
               SUM(line.igst_amount) AS igst, SUM(line.cess_amount) AS cess,
               SUM(line.cgst_amount + line.sgst_amount + line.igst_amount + line.cess_amount)
                   AS tax_amount,
               CASE WHEN SUM(line.gst_taxable_value)=0 THEN 0
                    ELSE ROUND(
                        SUM(line.cgst_amount + line.sgst_amount + line.igst_amount)
                        * 100 / SUM(line.gst_taxable_value),
                        2
                    ) END AS tax_rate,
               SUM(line.line_total) AS total_value
          FROM sales.invoice_lines line
          JOIN sales.invoices invoice ON invoice.org_id=line.org_id AND invoice.id=line.invoice_id
          JOIN catalog.products product ON product.org_id=line.org_id AND product.id=line.product_id
         WHERE line.org_id=:org_id AND invoice.status NOT IN ('cancelled','reversed')
           AND (:date_from IS NULL OR invoice.invoice_date >= CAST(:date_from AS date))
           AND (:date_to IS NULL OR invoice.invoice_date <= CAST(:date_to AS date))
         GROUP BY product.hsn_code, product.name ORDER BY product.hsn_code, product.name
    """, _range_params(org_id, from_date, to_date))
    return {"hsn_summary": rows}


@router.get("/inventory/stock/current")
def current_stock(limit: int = Query(200, ge=1, le=1000), offset: int = Query(0, ge=0),
                  user: dict = INVENTORY_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    return _rows(db, """
        SELECT balance.product_id, product.sku AS product_code,
               product.name AS product_name, product.generic_name,
               product.hsn_code, product.product_kind AS product_type,
               product.base_uom_code AS unit,
               category.name AS category,
               SUM(balance.on_hand_quantity) AS total_quantity_available,
               SUM(balance.inventory_value) AS total_value,
               CASE WHEN SUM(balance.on_hand_quantity)=0 THEN 0
                    ELSE ROUND(SUM(balance.inventory_value) / SUM(balance.on_hand_quantity), 4)
                END AS cost_per_unit,
               COUNT(DISTINCT balance.batch_id) AS total_batches,
               COUNT(DISTINCT balance.batch_id) FILTER (
                   WHERE batch.expires_on < CURRENT_DATE
               ) AS expired_batches,
               COUNT(DISTINCT balance.batch_id) FILTER (
                   WHERE batch.expires_on BETWEEN CURRENT_DATE AND CURRENT_DATE + 90
               ) AS near_expiry_batches,
               product.cold_chain_required AS requires_cold_chain
          FROM inventory.stock_balances balance
          JOIN catalog.products product ON product.org_id=balance.org_id AND product.id=balance.product_id
          JOIN inventory.batches batch ON batch.org_id=balance.org_id AND batch.id=balance.batch_id
          LEFT JOIN catalog.categories category
            ON category.org_id=product.org_id AND category.id=product.category_id
         WHERE balance.org_id=:org_id
         GROUP BY balance.product_id, product.sku, product.name, product.generic_name,
                  product.hsn_code, product.product_kind, product.base_uom_code,
                  category.name, product.cold_chain_required
         ORDER BY product.name, balance.product_id
         LIMIT :limit OFFSET :offset
    """, {"org_id": org_id, "limit": limit, "offset": offset})


@router.get("/inventory/batches/")
def batches(limit: int = Query(200, ge=1, le=1000), offset: int = Query(0, ge=0),
            user: dict = INVENTORY_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    return _rows(db, """
        SELECT batch.id AS batch_id, batch.product_id, product.name AS product_name,
               product.sku AS product_code, batch.batch_number,
               batch.manufactured_on AS manufacturing_date, batch.expires_on AS expiry_date,
               batch.mrp, batch.status, batch.status IN ('released','blocked') AS is_active,
               COALESCE(stock.quantity, 0) AS quantity
          FROM inventory.batches batch
          JOIN catalog.products product ON product.org_id=batch.org_id AND product.id=batch.product_id
          LEFT JOIN LATERAL (
              SELECT SUM(on_hand_quantity) AS quantity FROM inventory.stock_balances balance
               WHERE balance.org_id=batch.org_id AND balance.batch_id=batch.id
          ) stock ON true
         WHERE batch.org_id=:org_id ORDER BY batch.expires_on NULLS LAST, product.name
         LIMIT :limit OFFSET :offset
    """, {"org_id": org_id, "limit": limit, "offset": offset})


@router.get("/payments/search")
def payments(limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0),
             user: dict = FINANCE_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT payment.id AS payment_id, payment.payment_number, payment.payment_date,
               payment.direction, payment.party_id, party.legal_name AS party_name,
               payment.payment_method AS payment_mode, payment.amount,
               payment.external_reference AS reference_number, payment.memo AS notes,
               payment.status, payment.created_at, payment.updated_at
          FROM finance.payments payment
          LEFT JOIN parties.parties party ON party.org_id=payment.org_id AND party.id=payment.party_id
         WHERE payment.org_id=:org_id ORDER BY payment.payment_date DESC, payment.id DESC
         LIMIT :limit OFFSET :offset
    """, {"org_id": org_id, "limit": limit, "offset": offset})
    return {"payments": rows, "total": len(rows)}


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


class CanonicalCustomerReceiptReadback(BaseModel):
    model_config = ConfigDict(extra="forbid")

    payment_id: UUID
    payment_number: str
    payment_date: date
    branch_id: UUID
    party_id: UUID
    settlement_account_id: UUID
    payment_method: Literal["bank_transfer", "card", "upi"]
    external_reference: str
    amount: MoneyJSON
    status: Literal["posted"]
    journal_entry_id: UUID
    journal_number: str
    journal_debit_total: MoneyJSON
    journal_credit_total: MoneyJSON
    allocations: list[CanonicalReceiptAllocationReadback]
    journal_lines: list[CanonicalReceiptJournalLineReadback]
    allocation_reconciled: Literal[True]
    journal_balanced: Literal[True]

    @model_validator(mode="after")
    def validate_accounting_evidence(self):
        amount = Decimal(self.amount)
        if not self.allocations:
            raise ValueError("posted receipt readback requires allocation evidence")
        open_items = [allocation.open_item_id for allocation in self.allocations]
        if len(open_items) != len(set(open_items)):
            raise ValueError("posted receipt readback repeats an open item")
        if sum((Decimal(row.amount) for row in self.allocations), Decimal("0")) != amount:
            raise ValueError("posted receipt allocations do not reconcile to payment")
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
        WITH effective_allocations AS (
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
                   GREATEST(CURRENT_DATE-item.due_date,0) AS days_overdue,
                   applied.last_payment_date
              FROM finance.open_items item
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
        SELECT payment.id AS payment_id, payment.payment_number,
               payment.payment_date, payment.branch_id, payment.party_id,
               payment.settlement_account_id, payment.payment_method,
               payment.external_reference, payment.amount, payment.status,
               journal.id AS journal_entry_id, journal.journal_number,
               journal.transaction_debit_total AS journal_debit_total,
               journal.transaction_credit_total AS journal_credit_total
          FROM finance.payments payment
          JOIN finance.accounting_events event
            ON event.org_id=payment.org_id AND event.payment_id=payment.id
          JOIN finance.journal_entries journal
            ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id
           AND journal.status='posted'
         WHERE payment.org_id=:org_id AND payment.id=:payment_id
           AND payment.direction='receipt'
           AND payment.payment_purpose='commercial_settlement'
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
    journal_lines = _rows(db, """
        SELECT line.id AS journal_line_id, line.line_number, line.account_id,
               line.party_id, line.transaction_debit, line.transaction_credit,
               line.functional_debit, line.functional_credit
          FROM finance.accounting_events event
          JOIN finance.payments payment
            ON payment.org_id=event.org_id AND payment.id=event.payment_id
          JOIN finance.journal_entries journal
            ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id
           AND journal.status='posted'
          JOIN finance.journal_lines line
            ON line.org_id=journal.org_id AND line.journal_entry_id=journal.id
         WHERE event.org_id=:org_id AND event.payment_id=:payment_id
           AND (:organization_scope
                OR payment.branch_id=ANY(CAST(:branch_ids AS uuid[])))
         ORDER BY line.line_number, line.id
    """, params)
    header = headers[0]
    allocation_total = sum(
        (Decimal(str(row["amount"])) for row in allocations), Decimal("0")
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
    return {
        **header,
        "amount": money_json(header["amount"]),
        "journal_debit_total": money_json(header["journal_debit_total"]),
        "journal_credit_total": money_json(header["journal_credit_total"]),
        "allocations": [{**row, "amount": money_json(row["amount"])} for row in allocations],
        "journal_lines": [{
            **row,
            "transaction_debit": money_json(row["transaction_debit"]),
            "transaction_credit": money_json(row["transaction_credit"]),
            "functional_debit": money_json(row["functional_debit"]),
            "functional_credit": money_json(row["functional_credit"]),
        } for row in journal_lines],
        "allocation_reconciled": allocation_total == amount,
        "journal_balanced": line_debit == line_credit == amount,
    }


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
        SELECT COALESCE(SUM(amount) FILTER (
                   WHERE payment_date=CURRENT_DATE),0) AS today_collections,
               COALESCE(SUM(amount) FILTER (
                   WHERE payment_date>=CURRENT_DATE-interval '6 days'),0) AS week_collections,
               COALESCE(SUM(amount) FILTER (
                   WHERE payment_date>=date_trunc('month',CURRENT_DATE)::date),0)
                   AS month_collections
          FROM finance.payments
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
        SELECT invoice.invoice_date AS date, invoice.invoice_date AS period,
               count(*) AS order_count, count(*) AS invoice_count,
               count(DISTINCT invoice.customer_account_id) AS customer_count,
               count(DISTINCT invoice.customer_account_id) AS unique_customers,
               COALESCE(SUM(invoice.grand_total),0) AS total_sales,
               COALESCE(SUM(invoice.grand_total),0) AS revenue,
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
    return _sales_daily(db, _range_params(org_id, date_from, date_to))


@router.get("/dashboard/sales-analytics")
def dashboard_sales_analytics(
    date_from: date,
    date_to: date,
    user: dict = SALES_USER,
    db: Session = Depends(get_db),
):
    """Return one exact, dashboard-specific daily sales projection.

    The general sales analytics response retains compatibility aliases for its
    report consumers.  The executive dashboard contract deliberately exposes
    only one name for each fact so the browser cannot guess among aliases.
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


def _customer_analytics_rows(db: Session, params: dict) -> list[dict]:
    return _rows(db, """
        SELECT account.id AS customer_id, account.id, party.legal_name AS customer_name,
               party.legal_name AS name, party.party_kind AS customer_type,
               address.city, account.created_at, account.credit_limit,
               COALESCE(sales.total_purchases,0) AS total_purchases,
               COALESCE(sales.total_purchases,0) AS lifetime_value,
               sales.last_purchase_date, COALESCE(sales.avg_order_value,0) AS avg_order_value,
               COALESCE(sales.purchase_frequency,0) AS purchase_frequency,
               COALESCE(open_item_data.outstanding_amount,0) AS outstanding_amount
          FROM parties.customer_accounts account
          JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
          LEFT JOIN LATERAL (
              SELECT city FROM parties.addresses
               WHERE org_id=account.org_id AND party_id=account.party_id AND status='active'
               ORDER BY is_primary DESC, id LIMIT 1
          ) address ON true
          LEFT JOIN LATERAL (
              SELECT SUM(invoice.grand_total) total_purchases, MAX(invoice.invoice_date) last_purchase_date,
                     AVG(invoice.grand_total) avg_order_value, count(*) purchase_frequency
                FROM sales.invoices invoice
               WHERE invoice.org_id=account.org_id AND invoice.customer_account_id=account.id
                 AND invoice.status NOT IN ('cancelled','reversed')
                 AND (:date_from IS NULL OR invoice.invoice_date >= CAST(:date_from AS date))
                 AND (:date_to IS NULL OR invoice.invoice_date <= CAST(:date_to AS date))
          ) sales ON true
          LEFT JOIN LATERAL (
              SELECT SUM(principal_amount) outstanding_amount FROM finance.open_items item
               WHERE item.org_id=account.org_id AND item.party_id=account.party_id
                 AND item.item_side='receivable' AND item.status='open'
          ) open_item_data ON true
         WHERE account.org_id=:org_id ORDER BY total_purchases DESC, party.legal_name
    """, params)


@router.get("/customers/analytics/list")
def customer_analytics_list(date_from: Optional[str] = None, date_to: Optional[str] = None,
                            user: dict = SALES_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    return _customer_analytics_rows(db, _range_params(org_id, date_from, date_to))


@router.get("/customers/analytics/summary")
def customer_analytics_summary(date_from: Optional[str] = None, date_to: Optional[str] = None,
                               user: dict = SALES_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _customer_analytics_rows(db, _range_params(org_id, date_from, date_to))
    total = len(rows)
    active = sum(1 for row in rows if row["last_purchase_date"] is not None)
    revenue = sum((row["total_purchases"] or 0) for row in rows)
    return {"total_customers": total, "active_customers": active,
            "inactive_customers": total - active, "total_customer_revenue": revenue,
            "average_lifetime_value": revenue / total if total else 0}


@router.get("/customers/analytics/segments")
def customer_analytics_segments(date_from: Optional[str] = None, date_to: Optional[str] = None,
                                user: dict = SALES_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT party.party_kind AS segment, count(*) AS count
          FROM parties.customer_accounts account
          JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
         WHERE account.org_id=:org_id GROUP BY party.party_kind ORDER BY party.party_kind
    """, {"org_id": org_id})
    return {str(row["segment"] or "Retail"): row["count"] for row in rows}


@router.get("/customers/analytics/acquisition")
def customer_analytics_acquisition(date_from: Optional[str] = None, date_to: Optional[str] = None,
                                   user: dict = SALES_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    return _rows(db, """
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, count(*) AS customers
          FROM parties.customer_accounts WHERE org_id=:org_id
           AND (:date_from IS NULL OR created_at::date >= CAST(:date_from AS date))
           AND (:date_to IS NULL OR created_at::date <= CAST(:date_to AS date))
         GROUP BY date_trunc('month', created_at) ORDER BY date_trunc('month', created_at)
    """, _range_params(org_id, date_from, date_to))


def _inventory_analytics_rows(db: Session, org_id: UUID) -> list[dict]:
    return _rows(db, """
        SELECT product.id AS product_id, product.id, product.name AS product_name, product.name,
               COALESCE(category.name,'Uncategorized') AS category,
               batch.batch_number, batch.expires_on AS expiry_date,
               COALESCE(stock.quantity,0) AS total_quantity_available,
               COALESCE(stock.quantity,0) AS quantity,
               COALESCE(stock.value,0) AS stock_value,
               COALESCE(stock.unit_price,0) AS unit_price,
               0::numeric AS min_stock_level, 0::numeric AS max_stock_level,
               restock.last_restocked, COALESCE(movement.turnover_rate,0) AS turnover_rate
          FROM catalog.products product
          LEFT JOIN catalog.categories category ON category.org_id=product.org_id AND category.id=product.category_id
          LEFT JOIN LATERAL (
              SELECT SUM(on_hand_quantity) quantity, SUM(inventory_value) value,
                     MAX(average_unit_cost) unit_price
                FROM inventory.stock_balances balance
               WHERE balance.org_id=product.org_id AND balance.product_id=product.id
          ) stock ON true
          LEFT JOIN LATERAL (
              SELECT batch_number, expires_on FROM inventory.batches
               WHERE org_id=product.org_id AND product_id=product.id AND status='active'
               ORDER BY expires_on NULLS LAST, id LIMIT 1
          ) batch ON true
          LEFT JOIN LATERAL (
              SELECT MAX(posted_at) last_restocked FROM inventory.stock_ledger_entries entry
               WHERE entry.org_id=product.org_id AND entry.product_id=product.id
                 AND entry.entry_kind IN ('receipt','transfer_in','count_gain')
          ) restock ON true
          LEFT JOIN LATERAL (
              SELECT ABS(SUM(quantity_delta)) turnover_rate FROM inventory.stock_ledger_entries entry
               WHERE entry.org_id=product.org_id AND entry.product_id=product.id
                 AND entry.entry_kind IN ('issue','transfer_out')
                 AND entry.posted_at >= current_date - interval '30 days'
          ) movement ON true
         WHERE product.org_id=:org_id AND product.status='active'
         ORDER BY product.name, product.id
    """, {"org_id": org_id})


@router.get("/inventory/list")
def inventory_analytics_list(user: dict = INVENTORY_USER, db: Session = Depends(get_db)):
    return _inventory_analytics_rows(db, _activate(db, user))


@router.get("/inventory/stock-status")
def inventory_stock_status(user: dict = INVENTORY_USER, db: Session = Depends(get_db)):
    rows = _inventory_analytics_rows(db, _activate(db, user))
    return {"total_products": len(rows),
            "out_of_stock": sum(1 for row in rows if (row["total_quantity_available"] or 0) <= 0),
            "stock_value": sum((row["stock_value"] or 0) for row in rows)}


@router.get("/inventory/movements")
def inventory_movements(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    product_id: Optional[UUID] = None,
    batch_id: Optional[UUID] = None,
    user: dict = INVENTORY_USER,
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    return _rows(db, """
        SELECT entry.id, entry.posted_at AS date, entry.posted_at AS movement_date,
               entry.entry_kind,
               CASE WHEN entry.entry_kind IN ('receipt','transfer_in','count_gain') THEN 'In'
                    WHEN entry.entry_kind IN ('issue','transfer_out','count_loss') THEN 'Out'
                    ELSE 'Adjustment' END AS type,
               CASE WHEN entry.entry_kind IN ('receipt','transfer_in','count_gain') THEN 'in'
                    WHEN entry.entry_kind IN ('issue','transfer_out','count_loss') THEN 'out'
                    ELSE 'adjustment' END AS movement_type,
               ABS(entry.quantity_delta) AS quantity, entry.unit_cost,
               entry.product_id, product.name AS product_name,
               entry.batch_id, batch.batch_number,
               document.document_number AS reference,
               document.document_number AS reference_number,
               actor.display_name AS user_name,
               'completed' AS status
          FROM inventory.stock_ledger_entries entry
          JOIN catalog.products product ON product.org_id=entry.org_id AND product.id=entry.product_id
          JOIN inventory.batches batch
            ON batch.org_id=entry.org_id AND batch.id=entry.batch_id
          LEFT JOIN inventory.inventory_documents document
            ON document.org_id=entry.org_id AND document.id=entry.inventory_document_id
          LEFT JOIN core.memberships membership
            ON membership.org_id=entry.org_id AND membership.id=entry.posted_by_membership_id
          LEFT JOIN core.users actor ON actor.id=membership.user_id
         WHERE entry.org_id=:org_id
           AND (:date_from IS NULL OR entry.posted_at::date >= CAST(:date_from AS date))
           AND (:date_to IS NULL OR entry.posted_at::date <= CAST(:date_to AS date))
           AND (:product_id IS NULL OR entry.product_id=:product_id)
           AND (:batch_id IS NULL OR entry.batch_id=:batch_id)
         ORDER BY entry.posted_at DESC, entry.id DESC LIMIT 500
    """, {
        **_range_params(org_id, date_from, date_to),
        "product_id": product_id,
        "batch_id": batch_id,
    })


@router.get("/inventory/categories")
def inventory_categories(user: dict = INVENTORY_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    return _rows(db, """
        SELECT category.id, category.name, count(product.id) AS product_count
          FROM catalog.categories category
          LEFT JOIN catalog.products product
            ON product.org_id=category.org_id AND product.category_id=category.id AND product.status='active'
         WHERE category.org_id=:org_id AND category.status='active'
         GROUP BY category.id, category.name ORDER BY category.name
    """, {"org_id": org_id})


def _product_performance_rows(db: Session, org_id: UUID) -> list[dict]:
    return _rows(db, """
        SELECT product.id, product.name, COALESCE(category.name,'Uncategorized') AS category,
               COALESCE(sales.quantity,0) AS sales, COALESCE(sales.revenue,0) AS revenue,
               COALESCE(sales.revenue - sales.estimated_cost,0) AS profit,
               CASE WHEN COALESCE(sales.revenue,0)=0 THEN 0
                    ELSE ((sales.revenue-sales.estimated_cost)/sales.revenue)*100 END AS margin,
               COALESCE(stock.quantity,0) AS stock,
               CASE WHEN COALESCE(stock.quantity,0)=0 THEN COALESCE(sales.quantity,0)
                    ELSE COALESCE(sales.quantity,0)/NULLIF(stock.quantity,0) END AS turnover,
               CASE WHEN COALESCE(sales.quantity,0)>0 THEN 'up' ELSE 'stable' END AS trend,
               0::numeric AS trend_value
          FROM catalog.products product
          LEFT JOIN catalog.categories category ON category.org_id=product.org_id AND category.id=product.category_id
          LEFT JOIN LATERAL (
              SELECT SUM(line.billed_quantity) quantity, SUM(line.line_total) revenue,
                     SUM(line.billed_quantity * COALESCE(cost.average_unit_cost,0)) estimated_cost
                FROM sales.invoice_lines line
                JOIN sales.invoices invoice ON invoice.org_id=line.org_id AND invoice.id=line.invoice_id
                LEFT JOIN LATERAL (
                    SELECT MAX(average_unit_cost) average_unit_cost FROM inventory.stock_balances balance
                     WHERE balance.org_id=line.org_id AND balance.product_id=line.product_id
                ) cost ON true
               WHERE line.org_id=product.org_id AND line.product_id=product.id
                 AND invoice.status NOT IN ('cancelled','reversed')
          ) sales ON true
          LEFT JOIN LATERAL (
              SELECT SUM(on_hand_quantity) quantity FROM inventory.stock_balances balance
               WHERE balance.org_id=product.org_id AND balance.product_id=product.id
          ) stock ON true
         WHERE product.org_id=:org_id AND product.status='active' ORDER BY revenue DESC, product.name
    """, {"org_id": org_id})


@router.get("/products/analytics/performance")
def product_performance(user: dict = INVENTORY_USER, db: Session = Depends(get_db)):
    return {"products": _product_performance_rows(db, _activate(db, user))}


@router.get("/products/categories")
def product_categories(user: dict = INVENTORY_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT name FROM catalog.categories WHERE org_id=:org_id AND status='active' ORDER BY name
    """, {"org_id": org_id})
    return {"categories": [row["name"] for row in rows]}


@router.get("/products/analytics/summary")
def product_analytics_summary(user: dict = INVENTORY_USER, db: Session = Depends(get_db)):
    rows = _product_performance_rows(db, _activate(db, user))
    margins = [row["margin"] or 0 for row in rows]
    categories: dict[str, dict[str, Any]] = {}
    for row in rows:
        bucket = categories.setdefault(row["category"], {"revenue": 0, "profit": 0, "count": 0})
        bucket["revenue"] += row["revenue"] or 0
        bucket["profit"] += row["profit"] or 0
        bucket["count"] += 1
    return {"total_products": len(rows), "high_margin_products": sum(1 for value in margins if value > 25),
            "fast_moving_products": sum(1 for row in rows if (row["turnover"] or 0) > 10),
            "low_stock_products": sum(1 for row in rows if (row["stock"] or 0) <= 0),
            "avg_margin": sum(margins) / len(margins) if margins else 0,
            "category_performance": categories,
            "trends": {"labels": [], "revenue": [], "margin": []}}


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


def _financial_totals(db: Session, params: dict) -> dict:
    rows = _rows(db, f"""
        SELECT COALESCE(sales.revenue,0) total_revenue,
               COALESCE(expenses.total,0) operating_expenses,
               COALESCE(sales.revenue,0)-COALESCE(expenses.total,0) gross_profit,
               COALESCE(sales.revenue,0)-COALESCE(expenses.total,0) net_profit,
               COALESCE(receivables.total,0) accounts_receivable,
               COALESCE(payables.total,0) accounts_payable
          FROM (SELECT SUM(invoice.grand_total) revenue FROM sales.invoices invoice
                 WHERE {_INVOICE_RANGE}) sales
          CROSS JOIN (SELECT SUM(line.functional_debit-line.functional_credit) total
                        FROM finance.journal_lines line
                        JOIN finance.journal_entries entry ON entry.org_id=line.org_id AND entry.id=line.journal_entry_id
                        JOIN finance.accounts account ON account.org_id=line.org_id AND account.id=line.account_id
                       WHERE line.org_id=:org_id AND account.account_type='expense' AND entry.status='posted'
                         AND (:date_from IS NULL OR entry.posting_date >= CAST(:date_from AS date))
                         AND (:date_to IS NULL OR entry.posting_date <= CAST(:date_to AS date))) expenses
          CROSS JOIN (SELECT SUM(principal_amount) total FROM finance.open_items
                       WHERE org_id=:org_id AND item_side='receivable' AND status='open') receivables
          CROSS JOIN (SELECT SUM(principal_amount) total FROM finance.open_items
                       WHERE org_id=:org_id AND item_side='payable' AND status='open') payables
    """, params)
    return rows[0]


@router.get("/financial/summary")
def financial_summary(date_from: Optional[date] = None, date_to: Optional[date] = None,
                      user: dict = FINANCE_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    result = _financial_totals(db, _range_params(org_id, date_from, date_to))
    if date_from is None or date_to is None:
        if date_from is not None or date_to is not None:
            raise HTTPException(
                status_code=422,
                detail="Both date_from and date_to are required for a financial comparison",
            )
        result.update({
            "comparison_period": None,
            "previous_revenue": None,
            "revenue_change": None,
            "revenue_change_percent": None,
            "previous_gross_profit": None,
            "gross_profit_change": None,
            "gross_profit_change_percent": None,
            "previous_net_profit": None,
            "net_profit_change": None,
            "net_profit_change_percent": None,
            "previous_operating_expenses": None,
            "operating_expenses_change": None,
            "operating_expenses_change_percent": None,
            "previous_accounts_receivable": None,
            "receivable_change": None,
            "receivable_change_percent": None,
            "previous_accounts_payable": None,
            "payable_change": None,
            "payable_change_percent": None,
        })
        return result

    period = _validated_report_range(date_from, date_to)
    previous_to = period["date_from"] - timedelta(days=1)
    previous_from = previous_to - (period["date_to"] - period["date_from"])
    previous = _financial_totals(
        db,
        _range_params(org_id, previous_from, previous_to),
    )

    def comparison(field: str) -> tuple[Decimal, Decimal, Optional[Decimal]]:
        current_value = Decimal(str(result[field]))
        previous_value = Decimal(str(previous[field]))
        change = current_value - previous_value
        percent = None if previous_value == 0 else (
            change / abs(previous_value) * Decimal("100")
        )
        return previous_value, change, percent

    revenue = comparison("total_revenue")
    gross_profit = comparison("gross_profit")
    net_profit = comparison("net_profit")
    operating_expenses = comparison("operating_expenses")
    result.update({
        "comparison_period": {
            "date_from": previous_from,
            "date_to": previous_to,
        },
        "previous_revenue": revenue[0],
        "revenue_change": revenue[1],
        "revenue_change_percent": revenue[2],
        "previous_gross_profit": gross_profit[0],
        "gross_profit_change": gross_profit[1],
        "gross_profit_change_percent": gross_profit[2],
        "previous_net_profit": net_profit[0],
        "net_profit_change": net_profit[1],
        "net_profit_change_percent": net_profit[2],
        "previous_operating_expenses": operating_expenses[0],
        "operating_expenses_change": operating_expenses[1],
        "operating_expenses_change_percent": operating_expenses[2],
        # Open-item balances are current snapshots. Without an effective-dated
        # snapshot source, a prior receivable/payable value would be invented.
        "previous_accounts_receivable": None,
        "receivable_change": None,
        "receivable_change_percent": None,
        "previous_accounts_payable": None,
        "payable_change": None,
        "payable_change_percent": None,
    })
    return result


@router.get("/financial/cash-flow")
def financial_cash_flow(date_from: Optional[str] = None, date_to: Optional[str] = None,
                        user: dict = FINANCE_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    return _rows(db, """
        SELECT to_char(payment_date,'YYYY-MM-DD') AS period,
               COALESCE(SUM(amount) FILTER (WHERE direction='receipt'),0) AS income,
               COALESCE(SUM(amount) FILTER (WHERE direction='disbursement'),0) AS expenses,
               COALESCE(SUM(CASE WHEN direction='receipt' THEN amount ELSE -amount END),0) AS net_flow
          FROM finance.payments WHERE org_id=:org_id AND status='posted'
           AND (:date_from IS NULL OR payment_date >= CAST(:date_from AS date))
           AND (:date_to IS NULL OR payment_date <= CAST(:date_to AS date))
         GROUP BY payment_date ORDER BY payment_date
    """, _range_params(org_id, date_from, date_to))


@router.get("/financial/transactions")
def financial_transactions(date_from: Optional[str] = None, date_to: Optional[str] = None,
                           limit: int = Query(10, ge=1, le=100),
                           user: dict = FINANCE_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _payment_rows(db, _range_params(org_id, date_from, date_to))[:limit]
    return [{"id": row["id"], "date": row["date"],
             "type": "income" if row["direction"] == "receipt" else "expense",
             "category": row["method"], "description": row["description"],
             "amount": row["amount"], "status": "paid" if row["status"] == "posted" else "pending",
             "reference": row["reference"]} for row in rows]


@router.get("/financial/expense-breakdown")
def financial_expense_breakdown(date_from: Optional[str] = None, date_to: Optional[str] = None,
                                user: dict = FINANCE_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    return _rows(db, """
        SELECT account.name AS category,
               COALESCE(SUM(line.functional_debit-line.functional_credit),0) AS amount
          FROM finance.journal_lines line
          JOIN finance.journal_entries entry ON entry.org_id=line.org_id AND entry.id=line.journal_entry_id
          JOIN finance.accounts account ON account.org_id=line.org_id AND account.id=line.account_id
         WHERE line.org_id=:org_id AND account.account_type='expense' AND entry.status='posted'
           AND (:date_from IS NULL OR entry.posting_date >= CAST(:date_from AS date))
           AND (:date_to IS NULL OR entry.posting_date <= CAST(:date_to AS date))
         GROUP BY account.id, account.name ORDER BY amount DESC
    """, _range_params(org_id, date_from, date_to))


def _dashboard_stats_totals(db: Session, params: dict) -> dict:
    rows = _rows(db, f"""
        SELECT COALESCE(SUM(invoice.grand_total),0) AS total_revenue,
               count(*) AS total_invoices,
               count(DISTINCT invoice.customer_account_id) AS purchasing_customers,
               (SELECT count(*) FROM sales.orders sales_order
                 WHERE sales_order.org_id=:org_id
                   AND sales_order.status NOT IN ('cancelled','reversed')
                   AND (:date_from IS NULL OR sales_order.order_date >= CAST(:date_from AS date))
                   AND (:date_to IS NULL OR sales_order.order_date <= CAST(:date_to AS date))) AS total_orders,
               (SELECT count(*) FROM parties.customer_accounts
                 WHERE org_id=:org_id) AS total_customers,
               (SELECT count(*) FROM parties.customer_accounts
                 WHERE org_id=:org_id
                   AND (:date_from IS NULL OR created_at::date >= CAST(:date_from AS date))
                   AND (:date_to IS NULL OR created_at::date <= CAST(:date_to AS date))) AS new_customers
          FROM sales.invoices invoice WHERE {_INVOICE_RANGE}
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


def _profit_loss(db: Session, org_id: UUID, year: int, month: Optional[int]) -> tuple[list[dict], dict]:
    params = {"org_id": org_id, "year": year, "month": month}
    accounts = _rows(db, """
        SELECT account.account_type, account.name,
               CASE WHEN account.account_type='income'
                    THEN SUM(line.functional_credit-line.functional_debit)
                    ELSE SUM(line.functional_debit-line.functional_credit) END AS amount
          FROM finance.journal_lines line
          JOIN finance.journal_entries entry ON entry.org_id=line.org_id AND entry.id=line.journal_entry_id
          JOIN finance.accounts account ON account.org_id=line.org_id AND account.id=line.account_id
         WHERE line.org_id=:org_id AND entry.status='posted'
           AND EXTRACT(year FROM entry.posting_date)=:year
           AND (:month IS NULL OR EXTRACT(month FROM entry.posting_date)=:month)
           AND account.account_type IN ('income','expense')
         GROUP BY account.account_type, account.id, account.name ORDER BY account.account_type, account.name
    """, params)
    revenue = sum((row["amount"] or 0) for row in accounts if row["account_type"] == "income")
    expenses = sum((row["amount"] or 0) for row in accounts if row["account_type"] == "expense")
    net = revenue - expenses
    items = [{"label": "Revenue", "amount": revenue, "isHeader": True}]
    items.extend({"label": row["name"], "amount": row["amount"], "indent": 1}
                 for row in accounts if row["account_type"] == "income")
    items.extend([{"label": "Sales Revenue", "amount": revenue, "isSubtotal": True},
                  {"label": "Expenses", "amount": expenses, "isHeader": True}])
    items.extend({"label": row["name"], "amount": row["amount"], "indent": 1}
                 for row in accounts if row["account_type"] == "expense")
    items.extend([{"label": "Total Operating Expenses", "amount": expenses, "isSubtotal": True},
                  {"label": "Net Profit", "amount": net, "isSubtotal": True}])
    return items, {"revenue": revenue, "expenses": expenses, "net": net}


@router.get("/reports/profit-loss")
def profit_loss(year: int, month: Optional[int] = None, user: dict = FINANCE_USER,
                db: Session = Depends(get_db)):
    items, _ = _profit_loss(db, _activate(db, user), year, month)
    return {"items": items}


@router.get("/reports/profit-loss/trends")
def profit_loss_trends(year: int, user: dict = FINANCE_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT EXTRACT(month FROM entry.posting_date)::int AS month,
               SUM(CASE WHEN account.account_type='income'
                        THEN line.functional_credit-line.functional_debit ELSE 0 END) revenue,
               SUM(CASE WHEN account.account_type='expense'
                        THEN line.functional_debit-line.functional_credit ELSE 0 END) expenses
          FROM finance.journal_lines line
          JOIN finance.journal_entries entry ON entry.org_id=line.org_id AND entry.id=line.journal_entry_id
          JOIN finance.accounts account ON account.org_id=line.org_id AND account.id=line.account_id
         WHERE line.org_id=:org_id AND entry.status='posted'
           AND EXTRACT(year FROM entry.posting_date)=:year
         GROUP BY EXTRACT(month FROM entry.posting_date) ORDER BY month
    """, {"org_id": org_id, "year": year})
    return {"labels": [str(row["month"]) for row in rows],
            "revenue": [row["revenue"] or 0 for row in rows],
            "expenses": [row["expenses"] or 0 for row in rows],
            "netProfit": [(row["revenue"] or 0)-(row["expenses"] or 0) for row in rows]}


@router.get("/reports/profit-loss/summary")
def profit_loss_summary(year: int, month: Optional[int] = None, user: dict = FINANCE_USER,
                        db: Session = Depends(get_db)):
    _, totals = _profit_loss(db, _activate(db, user), year, month)
    revenue = totals["revenue"]
    margin = (totals["net"] / revenue * 100) if revenue else 0
    return {"grossMargin": margin, "operatingMargin": margin,
            "netMargin": margin, "ebitdaMargin": margin}

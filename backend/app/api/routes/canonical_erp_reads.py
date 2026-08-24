"""Canonical compatibility for the current ERP UI.

These endpoints preserve the UI's existing response field names while reading
and writing only the canonical schemas. Consequential document mutations still
use the reviewed operator-command boundary; the product mutation below creates
only a non-transactional draft.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Literal, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Security, status
from fastapi.security import HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security.permissions import PermissionChecker
from ..schemas.master.customer import CustomerCreate
from ..schemas.master.supplier import SupplierCreate

router = APIRouter(dependencies=[Security(HTTPBearer(auto_error=False))])
logger = logging.getLogger(__name__)


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


def _reject_unreviewed_party_fields(kind: str, values: dict[str, Any]) -> None:
    entered = [label for field, label in (
        ("drug_license_number", "drug license"),
        ("fssai_number", "FSSAI license"),
        ("bank_name", "supplier bank details"),
        ("account_number", "supplier bank details"),
        ("ifsc_code", "supplier bank details"),
        ("internal_notes", "internal notes"),
    ) if values.get(field)]
    if values.get("discount_percent"):
        entered.append("default discount")
    if entered:
        fields = ", ".join(sorted(set(entered)))
        raise HTTPException(
            status_code=422,
            detail=f"{kind} {fields} require their dedicated reviewed workflow",
        )


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


class CanonicalCustomerCreate(CustomerCreate):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class CanonicalSupplierCreate(SupplierCreate):
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
    return _rows(db, """
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
          LEFT JOIN LATERAL (
              SELECT SUM(balance.on_hand_quantity) AS current_stock
                FROM inventory.stock_balances balance
               WHERE balance.org_id=p.org_id AND balance.product_id=p.id
          ) stock ON true
          LEFT JOIN LATERAL (
              SELECT id FROM catalog.uom_conversions
               WHERE org_id=p.org_id AND product_id=p.id
                 AND from_uom_code=p.base_uom_code AND to_uom_code=p.base_uom_code
                 AND status='active' AND valid_from<=CURRENT_DATE
                 AND (valid_until IS NULL OR valid_until>=CURRENT_DATE)
               ORDER BY valid_from DESC, id LIMIT 1
          ) conversion ON true
          LEFT JOIN LATERAL (
              SELECT taxability, igst_rate
                FROM tax.tax_code_versions
               WHERE code=p.hsn_code AND code_kind='hsn' AND status='active'
                 AND effective_from<=CURRENT_DATE
                 AND (effective_to IS NULL OR effective_to>=CURRENT_DATE)
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
          LEFT JOIN LATERAL (
              SELECT id FROM catalog.uom_conversions
               WHERE org_id=product.org_id AND product_id=product.id
                 AND from_uom_code=product.base_uom_code
                 AND to_uom_code=product.base_uom_code
                 AND status='active' AND valid_from<=CURRENT_DATE
                 AND (valid_until IS NULL OR valid_until>=CURRENT_DATE)
               ORDER BY valid_from DESC, id LIMIT 1
          ) conversion ON true
          LEFT JOIN LATERAL (
              SELECT taxability, igst_rate
                FROM tax.tax_code_versions
               WHERE code=product.hsn_code AND code_kind='hsn' AND status='active'
                 AND effective_from<=CURRENT_DATE
                 AND (effective_to IS NULL OR effective_to>=CURRENT_DATE)
               ORDER BY effective_from DESC, version_number DESC, id LIMIT 1
          ) tax_version ON true
          LEFT JOIN LATERAL (
              SELECT jsonb_agg(jsonb_build_object(
                         'batch_id', batch.id, 'product_id', batch.product_id,
                         'batch_number', batch.batch_number,
                         'manufacturing_date', batch.manufactured_on,
                         'expiry_date', batch.expires_on, 'mrp_per_unit', batch.mrp,
                         'sale_price_per_unit', batch.mrp,
                         'cost_per_unit', COALESCE(stock.average_unit_cost, 0),
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
    return {"products": rows, "pagination": {"page": page, "page_size": page_size,
            "total_pages": 1, "has_more": len(rows) == page_size}}


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
               batch.expires_on - CURRENT_DATE AS days_to_expiry,
               false AS has_pending_sync,
               tax_version.taxability,
               CASE WHEN tax_version.taxability IS NULL THEN NULL
                    WHEN tax_version.taxability='taxable' THEN tax_version.igst_rate
                    ELSE 0 END AS gst_percent,
               batch.status AS batch_status
          FROM inventory.batches batch
          JOIN catalog.products product
            ON product.org_id=batch.org_id AND product.id=batch.product_id
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
                 AND status='active' AND valid_from<=CURRENT_DATE
                 AND (valid_until IS NULL OR valid_until>=CURRENT_DATE)
               ORDER BY valid_from DESC, id LIMIT 1
          ) conversion ON true
          LEFT JOIN LATERAL (
              SELECT taxability, igst_rate
                FROM tax.tax_code_versions
               WHERE code=product.hsn_code AND code_kind='hsn' AND status='active'
                 AND effective_from<=CURRENT_DATE
                 AND (effective_to IS NULL OR effective_to>=CURRENT_DATE)
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
    values = customer.model_dump()
    _reject_unreviewed_party_fields("Customer", values)
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
        "customer_code": customer_code,
        "customer_name": customer.customer_name,
        "primary_phone": customer.primary_phone,
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
    values = supplier.model_dump()
    _reject_unreviewed_party_fields("Supplier", values)
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
            "payment_days": supplier.payment_days or supplier.credit_days,
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
        "supplier_code": supplier_code,
        "supplier_name": supplier.supplier_name,
        "primary_phone": supplier.primary_phone,
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
           AND r.registration_type='GSTIN'
           AND r.status IN ('active','pending_verification')
         ORDER BY (r.status='active') DESC, r.valid_from DESC NULLS LAST, r.id LIMIT 1
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
               account.credit_limit, account.credit_days, 0::numeric AS current_outstanding,
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
         WHERE account.org_id=:org_id AND account.status IN ('active','on_hold')
           AND (:search='' OR party.legal_name ILIKE :pattern
                OR account.customer_code ILIKE :pattern OR COALESCE(contact.phone,'') ILIKE :pattern)
         ORDER BY party.legal_name, account.id LIMIT :limit OFFSET :skip
    """, {"org_id": org_id, "search": search.strip(), "pattern": f"%{search.strip()}%",
            "limit": limit, "skip": skip})
    return {"customers": rows, "total": len(rows), "skip": skip, "limit": limit}


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
    return {"customers": rows, "pagination": {"page": page, "page_size": page_size,
            "total_pages": 1, "has_more": len(rows) == page_size}}


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
               account.payment_days, 0::numeric AS current_outstanding,
               party.party_kind AS supplier_type, account.status='active' AS is_active,
               account.status, account.created_at, account.updated_at
          FROM parties.supplier_accounts account
          JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
          {_PARTY_CONTACTS}
         WHERE account.org_id=:org_id AND account.status IN ('active','on_hold')
           AND (:search='' OR party.legal_name ILIKE :pattern
                OR account.supplier_code ILIKE :pattern OR COALESCE(contact.phone,'') ILIKE :pattern)
         ORDER BY party.legal_name, account.id LIMIT :limit OFFSET :skip
    """, {"org_id": org_id, "search": search.strip(), "pattern": f"%{search.strip()}%",
            "limit": limit, "skip": skip})


@router.get("/employees")
@router.get("/employees/")
def employees(limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0),
              search: str = "", user: dict = MASTER_USER, db: Session = Depends(get_db)):
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
           AND (:search='' OR employee.display_name ILIKE :pattern OR employee.employee_number ILIKE :pattern)
         ORDER BY employee.display_name, employee.id LIMIT :limit OFFSET :offset
    """, {"org_id": org_id, "search": search.strip(), "pattern": f"%{search.strip()}%",
            "limit": limit, "offset": offset})
    return {"success": True, "data": rows, "employees": rows, "total": len(rows)}


@router.get("/branches")
@router.get("/branches/")
def branches(user: dict = MASTER_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT id AS branch_id, code AS branch_code, name AS branch_name,
               address_line1, address_line2, city, state_code, postal_code AS pincode,
               phone, email, status='active' AS is_active, status
          FROM core.branches WHERE org_id=:org_id ORDER BY name, id
    """, {"org_id": org_id})
    return {"branches": rows, "total": len(rows)}


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
                         'id', id,
                         'bank_name', bank_name,
                         'account_name', account_holder_name,
                         'ifsc_code', ifsc,
                         'currency_code', currency_code
                     ) ORDER BY bank_name, id) AS accounts
                FROM finance.bank_accounts
               WHERE org_id=organization.id AND status='active'
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
               cgst_rate+sgst_rate+igst_rate+cess_rate AS total_rate,
               taxability, effective_from, effective_to,
               status='active' AS is_active, status
          FROM tax.tax_code_versions
         WHERE status='active' AND effective_from<=current_date
           AND (effective_to IS NULL OR effective_to>=current_date)
         ORDER BY code, version_number DESC
    """, {})


@router.get("/gst/dashboard")
def gst_dashboard(user: dict = Depends(PermissionChecker("gst", "view")),
                  db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT COALESCE(sales.total,0) AS output_tax,
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
               COALESCE(purchases.igst,0) AS purchase_igst_amount
          FROM (SELECT SUM(cgst_total+sgst_total+igst_total+cess_total) total,
                       SUM(cgst_total) cgst, SUM(sgst_total) sgst, SUM(igst_total) igst,
                       count(*) invoice_count
                  FROM sales.invoices WHERE org_id=:org_id AND status<>'cancelled') sales
          CROSS JOIN (SELECT SUM(cgst_total+sgst_total+igst_total+cess_total) total,
                             SUM(cgst_total) cgst, SUM(sgst_total) sgst, SUM(igst_total) igst,
                             count(*) invoice_count, count(DISTINCT supplier_account_id) supplier_count
                        FROM procurement.supplier_invoices
                       WHERE org_id=:org_id AND status<>'cancelled') purchases
    """, {"org_id": org_id})
    summary = rows[0] if rows else {}
    return {"outputTax": summary.pop("output_tax", 0),
            "inputCredit": summary.pop("input_credit", 0),
            "netPayable": summary.pop("net_payable", 0), "summary": summary}


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
    result = {"gstr1": {"status": "pending", "dueDate": ""},
              "gstr3b": {"status": "pending", "dueDate": ""},
              "gstr2b": {"status": "available", "lastUpdated": ""}}
    for row in rows:
        key = str(row["return_type"]).lower().replace("-", "")
        if key in result:
            result[key] = {"status": row["status"], "dueDate": row["due_date"],
                           "lastUpdated": row["filed_at"]}
    return result


def _sales_rows(db: Session, org_id: UUID, table_name: str, number_column: str,
                date_column: str, line_table: str, foreign_key: str,
                limit: int, offset: int) -> list[dict]:
    return _rows(db, f"""
        SELECT document.id, document.id AS document_id,
               document.{number_column} AS document_number,
               document.{date_column} AS document_date, document.status,
               document.customer_account_id AS customer_id,
               party.legal_name AS customer_name,
               contact.phone AS customer_phone, contact.email AS customer_email,
               COALESCE(document.grand_total, 0) AS total_amount,
               COALESCE(lines.items_count, 0) AS items_count,
               COALESCE(lines.items, '[]'::jsonb) AS items,
               document.created_at, document.updated_at
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
         WHERE document.org_id=:org_id ORDER BY document.{date_column} DESC, document.id DESC
         LIMIT :limit OFFSET :offset
    """, {"org_id": org_id, "limit": limit, "offset": offset})


@router.get("/invoices/")
def invoices(limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0),
             user: dict = SALES_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _sales_rows(db, org_id, "invoices", "invoice_number", "invoice_date",
                       "invoice_lines", "invoice_id", limit, offset)
    for row in rows:
        row.update(invoice_id=row["id"], invoice_number=row["document_number"],
                   invoice_date=row["document_date"])
    return {"invoices": rows, "total": len(rows)}


@router.get("/canonical/invoices/{invoice_id}")
def canonical_invoice(
    invoice_id: UUID,
    user: dict = SALES_USER,
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT invoice.id AS invoice_id, invoice.invoice_number,
               invoice.invoice_date, invoice.status,
               invoice.customer_account_id AS customer_id,
               party.legal_name AS customer_name,
               invoice.grand_total AS total_amount,
               invoice.created_at, invoice.updated_at
          FROM sales.invoices invoice
          JOIN parties.customer_accounts account
            ON account.org_id=invoice.org_id
           AND account.id=invoice.customer_account_id
          JOIN parties.parties party
            ON party.org_id=account.org_id AND party.id=account.party_id
         WHERE invoice.org_id=:org_id AND invoice.id=:invoice_id
    """, {"org_id": org_id, "invoice_id": invoice_id})
    if len(rows) != 1:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return rows[0]


@router.get("/sales-orders/")
def sales_orders(limit: int = Query(100, ge=1, le=500), skip: int = Query(0, ge=0),
                 user: dict = SALES_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _sales_rows(db, org_id, "orders", "order_number", "order_date",
                       "order_lines", "order_id", limit, skip)
    for row in rows:
        row.update(order_id=row["id"], order_number=row["document_number"],
                   order_date=row["document_date"])
    return {"orders": rows, "total": len(rows), "page": skip // limit + 1,
            "per_page": limit, "total_pages": 1}


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


@router.get("/purchases/")
def purchase_orders(limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0),
                    user: dict = PURCHASE_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT purchase.id AS po_id, purchase.id AS purchase_order_id,
               purchase.purchase_order_number AS po_number, purchase.purchase_order_number AS order_number,
               purchase.order_date AS po_date, purchase.order_date,
               purchase.expected_delivery_date, purchase.status,
               purchase.supplier_account_id AS supplier_id, party.legal_name AS supplier_name,
               purchase.grand_total AS total_amount, purchase.created_at, purchase.updated_at
          FROM procurement.purchase_orders purchase
          JOIN parties.supplier_accounts account ON account.org_id=purchase.org_id AND account.id=purchase.supplier_account_id
          JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
         WHERE purchase.org_id=:org_id ORDER BY purchase.order_date DESC, purchase.id DESC
         LIMIT :limit OFFSET :offset
    """, {"org_id": org_id, "limit": limit, "offset": offset})
    return {"orders": rows, "purchases": rows, "total": len(rows)}


@router.get("/supplier-invoices/")
def supplier_invoices(limit: int = Query(100, ge=1, le=500), skip: int = Query(0, ge=0),
                      user: dict = PURCHASE_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT invoice.id AS supplier_invoice_id,
               invoice.supplier_invoice_number AS invoice_number,
               invoice.supplier_invoice_date AS invoice_date, invoice.due_date,
               invoice.status, invoice.supplier_account_id AS supplier_id,
               invoice.supplier_legal_name_snapshot AS supplier_name,
               invoice.grand_total AS invoice_total, invoice.grand_total AS total_amount,
               invoice.created_at, invoice.updated_at
          FROM procurement.supplier_invoices invoice
         WHERE invoice.org_id=:org_id ORDER BY invoice.supplier_invoice_date DESC, invoice.id DESC
         LIMIT :limit OFFSET :skip
    """, {"org_id": org_id, "limit": limit, "skip": skip})
    return {"invoices": rows, "total": len(rows)}


@router.get("/grn")
@router.get("/grn/")
def goods_receipts(limit: int = Query(100, ge=1, le=500), skip: int = Query(0, ge=0),
                   user: dict = PURCHASE_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT receipt.id AS grn_id, receipt.goods_receipt_number AS grn_number,
               receipt.received_at AS grn_date, receipt.status AS grn_status,
               receipt.supplier_account_id AS supplier_id, party.legal_name AS supplier_name,
               receipt.supplier_challan_number AS invoice_number,
               receipt.created_at, receipt.updated_at
          FROM procurement.goods_receipts receipt
          JOIN parties.supplier_accounts account ON account.org_id=receipt.org_id AND account.id=receipt.supplier_account_id
          JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
         WHERE receipt.org_id=:org_id ORDER BY receipt.received_at DESC, receipt.id DESC
         LIMIT :limit OFFSET :skip
    """, {"org_id": org_id, "limit": limit, "skip": skip})
    return {"grns": rows, "total": len(rows)}


@router.get("/sale-returns/")
def sales_returns(limit: int = Query(100, ge=1, le=500), skip: int = Query(0, ge=0),
                  user: dict = Depends(PermissionChecker("returns", "view")),
                  db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT return_row.id AS return_id, return_row.return_number,
               return_row.return_date, return_row.status,
               return_row.customer_account_id AS customer_id,
               party.legal_name AS customer_name, return_row.grand_total AS total_amount,
               return_row.created_at, return_row.updated_at
          FROM sales.returns return_row
          JOIN parties.customer_accounts account
            ON account.org_id=return_row.org_id AND account.id=return_row.customer_account_id
          JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
         WHERE return_row.org_id=:org_id ORDER BY return_row.return_date DESC, return_row.id DESC
         LIMIT :limit OFFSET :skip
    """, {"org_id": org_id, "limit": limit, "skip": skip})
    return {"returns": rows, "sales_returns": rows, "total": len(rows)}


@router.get("/purchase-returns/")
def purchase_returns(limit: int = Query(100, ge=1, le=500), skip: int = Query(0, ge=0),
                     user: dict = Depends(PermissionChecker("returns", "view")),
                     db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT return_row.id AS return_id,
               return_row.purchase_return_number AS return_number,
               return_row.return_date, return_row.status,
               return_row.supplier_account_id AS supplier_id,
               party.legal_name AS supplier_name, return_row.grand_total AS total_amount,
               return_row.created_at, return_row.updated_at
          FROM procurement.purchase_returns return_row
          JOIN parties.supplier_accounts account
            ON account.org_id=return_row.org_id AND account.id=return_row.supplier_account_id
          JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
         WHERE return_row.org_id=:org_id ORDER BY return_row.return_date DESC, return_row.id DESC
         LIMIT :limit OFFSET :skip
    """, {"org_id": org_id, "limit": limit, "skip": skip})
    return {"returns": rows, "purchase_returns": rows, "total": len(rows)}


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
def gst_adjustment_notes(user: dict = Depends(PermissionChecker("gst", "view")),
                         db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT note.id AS note_id, note.note_number, note.note_date,
               CONCAT(note.side, '_', note.direction) AS note_type,
               note.party_id, party.legal_name AS party_name,
               note.gst_taxable_value AS taxable_amount,
               note.cgst_amount, note.sgst_amount, note.igst_amount,
               note.counterparty_payable_amount AS total_amount,
               note.status
          FROM finance.adjustment_notes note
          JOIN parties.parties party ON party.org_id=note.org_id AND party.id=note.party_id
         WHERE note.org_id=:org_id ORDER BY note.note_date DESC, note.id DESC
    """, {"org_id": org_id})
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


@router.get("/sales/analytics/summary")
def sales_analytics_summary(date_from: Optional[str] = None, date_to: Optional[str] = None,
                            user: dict = SALES_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _rows(db, f"""
        SELECT COALESCE(SUM(invoice.grand_total),0) AS total_sales,
               count(*) AS total_orders, COALESCE(AVG(invoice.grand_total),0) AS avg_order_value,
               count(DISTINCT invoice.customer_account_id) AS unique_customers,
               0::numeric AS sales_growth, 0::numeric AS orders_growth,
               0::numeric AS aov_growth, 0::numeric AS customers_growth
          FROM sales.invoices invoice WHERE {_INVOICE_RANGE}
    """, _range_params(org_id, date_from, date_to))
    return rows[0]


@router.get("/sales/analytics/trend")
@router.get("/sales/analytics/by-date")
@router.get("/dashboard/sales-analytics")
def sales_analytics_by_date(date_from: Optional[str] = None, date_to: Optional[str] = None,
                            user: dict = SALES_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    return _sales_daily(db, _range_params(org_id, date_from, date_to))


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
def inventory_movements(date_from: Optional[str] = None, date_to: Optional[str] = None,
                        user: dict = INVENTORY_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    return _rows(db, """
        SELECT entry.id, entry.posted_at AS date, entry.entry_kind,
               CASE WHEN entry.entry_kind IN ('receipt','transfer_in','count_gain') THEN 'In'
                    WHEN entry.entry_kind IN ('issue','transfer_out') THEN 'Out'
                    ELSE 'Adjustment' END AS type,
               entry.quantity_delta AS quantity, product.name AS product_name,
               document.document_number AS reference
          FROM inventory.stock_ledger_entries entry
          JOIN catalog.products product ON product.org_id=entry.org_id AND product.id=entry.product_id
          LEFT JOIN inventory.inventory_documents document
            ON document.org_id=entry.org_id AND document.id=entry.inventory_document_id
         WHERE entry.org_id=:org_id
           AND (:date_from IS NULL OR entry.posted_at::date >= CAST(:date_from AS date))
           AND (:date_to IS NULL OR entry.posted_at::date <= CAST(:date_to AS date))
         ORDER BY entry.posted_at DESC, entry.id DESC LIMIT 500
    """, _range_params(org_id, date_from, date_to))


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
               COALESCE(party.legal_name,'Unassigned') AS customer,
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
@router.get("/dashboard/financial-summary")
def financial_summary(date_from: Optional[str] = None, date_to: Optional[str] = None,
                      user: dict = FINANCE_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    result = _financial_totals(db, _range_params(org_id, date_from, date_to))
    result.update({"previous_revenue": 0, "revenue_change": 0, "revenue_change_percent": 0,
                   "previous_gross_profit": 0, "gross_profit_change": 0, "gross_profit_change_percent": 0,
                   "previous_net_profit": 0, "net_profit_change": 0, "net_profit_change_percent": 0,
                   "previous_operating_expenses": 0, "operating_expenses_change": 0,
                   "operating_expenses_change_percent": 0, "previous_accounts_receivable": 0,
                   "receivable_change": 0, "receivable_change_percent": 0,
                   "previous_accounts_payable": 0, "payable_change": 0, "payable_change_percent": 0})
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


@router.get("/dashboard/stats")
def dashboard_stats(date_from: Optional[str] = None, date_to: Optional[str] = None,
                    user: dict = SALES_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    params = _range_params(org_id, date_from, date_to)
    rows = _rows(db, f"""
        SELECT COALESCE(SUM(invoice.grand_total),0) AS total_revenue,
               count(*) AS total_orders, count(*) AS total_invoices,
               count(DISTINCT invoice.customer_account_id) AS purchasing_customers,
               (SELECT count(*) FROM parties.customer_accounts WHERE org_id=:org_id) AS total_customers,
               0::numeric AS revenue_change, 0::numeric AS orders_change,
               0::numeric AS customers_change
          FROM sales.invoices invoice WHERE {_INVOICE_RANGE}
    """, params)
    return rows[0]


@router.get("/dashboard/inventory-summary")
def dashboard_inventory_summary(user: dict = INVENTORY_USER, db: Session = Depends(get_db)):
    rows = _inventory_analytics_rows(db, _activate(db, user))
    return {"total_products": len(rows), "active_products": len(rows), "products_change": 0,
            "stock_value": sum((row["stock_value"] or 0) for row in rows),
            "low_stock": sum(1 for row in rows if (row["total_quantity_available"] or 0) <= 0)}


@router.get("/dashboard/top-products")
def dashboard_top_products(limit: int = Query(5, ge=1, le=50),
                           user: dict = SALES_USER, db: Session = Depends(get_db)):
    rows = _product_performance_rows(db, _activate(db, user))[:limit]
    return [{"id": row["id"], "name": row["name"], "revenue": row["revenue"],
             "sales": row["sales"]} for row in rows]


@router.get("/dashboard/top-customers")
def dashboard_top_customers(date_from: Optional[str] = None, date_to: Optional[str] = None,
                            limit: int = Query(5, ge=1, le=50),
                            user: dict = SALES_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _customer_analytics_rows(db, _range_params(org_id, date_from, date_to))[:limit]
    return [{"id": row["id"], "name": row["name"],
             "revenue": row["total_purchases"], "orders": row["purchase_frequency"]} for row in rows]


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
    result.update({"pending_returns": 0, "compliance_score": 100})
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

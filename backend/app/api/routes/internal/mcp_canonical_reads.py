"""Hidden canonical read API used only by the isolated MCP service."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
import re
from typing import Any, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials
from jwt import InvalidTokenError as JWTError
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.orm import Session

from ....core.auth.jwt_auth import decode_jwt
from ....core.auth.session_authority import require_canonical_session_authority
from ....core.database import get_db
from .mcp_agent_grants import _internal_auth, bearer
from .mcp_contract import CanonicalReadPolicy, policy_for
from .. import (
    canonical_erp_reads,
    canonical_party_aging_reads,
    canonical_party_ledger_reads,
    canonical_reporting_reads,
)


router = APIRouter(
    prefix="/internal/mcp/reads", tags=["Internal MCP"], include_in_schema=False
)


@dataclass(frozen=True)
class CanonicalDelegation:
    auth_user_id: UUID
    user_id: UUID
    organization_id: UUID
    membership_id: UUID
    agent_grant_id: UUID
    client_id: str
    policy: CanonicalReadPolicy
    branch_id: Optional[UUID]
    allow_sensitive_read: bool


class SupplierSearchItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    supplier_account_id: UUID
    supplier_code: str
    party_id: UUID
    legal_name: str
    trade_name: Optional[str] = None
    payment_days: int
    status: str
    gstin: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    row_version: int


class SupplierSearchResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    match_state: str
    requires_selection: bool
    returned_count: int
    suppliers: list[SupplierSearchItem]


class CustomerAccountReadback(BaseModel):
    model_config = ConfigDict(extra="forbid")

    customer_account_id: UUID
    party_id: UUID
    customer_code: str
    customer_name: str
    customer_type: Literal["individual", "organization"]
    primary_phone: Optional[str] = None
    primary_email: Optional[str] = None
    contact_person_name: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state_code: Optional[str] = None
    pincode: Optional[str] = None
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    credit_limit: Decimal
    credit_days: int
    account_status: str
    party_status: str
    account_row_version: int
    party_row_version: int


class SupplierAccountReadback(BaseModel):
    model_config = ConfigDict(extra="forbid")

    supplier_account_id: UUID
    party_id: UUID
    supplier_code: str
    supplier_name: str
    primary_phone: Optional[str] = None
    primary_email: Optional[str] = None
    contact_person: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state_code: Optional[str] = None
    pincode: Optional[str] = None
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    payment_days: int
    account_status: str
    party_status: str
    account_row_version: int
    party_row_version: int


def _search_tsquery(value: str) -> str:
    tokens = re.findall(r"[a-z0-9]+", value.casefold())[:8]
    return " & ".join(f"{token}:*" for token in tokens)


def _uuid_claim(claims: dict[str, Any], name: str) -> UUID:
    try:
        return UUID(str(claims[name]))
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid canonical MCP delegation") from exc


def _parse_delegated_token(header: str) -> dict[str, Any]:
    scheme, separator, token = header.partition(" ")
    if separator != " " or scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="Canonical MCP delegation is required")
    try:
        claims = decode_jwt(token.strip(), check_blacklist=False)
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid canonical MCP delegation") from exc
    if claims.get("mcp_delegated") is not True:
        raise HTTPException(status_code=401, detail="Invalid canonical MCP delegation")
    if claims.get("token_profile") != "canonical_mcp_delegation_v1":
        raise HTTPException(status_code=401, detail="Invalid canonical MCP delegation")
    return claims


def get_canonical_delegation(
    delegated_authorization: str = Header(
        ..., alias="X-MCP-Delegated-Authorization", min_length=8, max_length=8192
    ),
    service_credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> CanonicalDelegation:
    """Authenticate service+delegation and revalidate all canonical authority facts."""
    _internal_auth(service_credentials)
    require_canonical_session_authority(db)
    claims = _parse_delegated_token(delegated_authorization)
    operation_key = claims.get("mcp_operation")
    capability_code = claims.get("mcp_capability")
    client_id = claims.get("mcp_client_id")
    policy = policy_for(operation_key) if isinstance(operation_key, str) else None
    if (
        policy is None
        or capability_code != policy.capability_code
        or not isinstance(client_id, str)
        or not client_id
    ):
        raise HTTPException(status_code=403, detail="Delegation is outside the MCP read allowlist")

    auth_user_id = _uuid_claim(claims, "auth_user_id")
    user_id = _uuid_claim(claims, "user_id")
    organization_id = _uuid_claim(claims, "org_id")
    membership_id = _uuid_claim(claims, "membership_id")
    agent_grant_id = _uuid_claim(claims, "agent_grant_id")
    raw_branches = claims.get("branch_ids")
    if not isinstance(raw_branches, list) or len(raw_branches) > 1:
        raise HTTPException(status_code=401, detail="Invalid canonical MCP branch delegation")
    try:
        claim_branch = UUID(str(raw_branches[0])) if raw_branches else None
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid canonical MCP branch delegation") from exc

    # Resolve canonical RLS identity from the verified Auth subject and requested
    # organization. The signed membership claim is revalidated below, but never
    # controls database session activation.
    db.execute(
        text("SELECT erp_security.activate_context(:auth_user_id, :org_id)"),
        {"auth_user_id": auth_user_id, "org_id": organization_id},
    )
    rows = db.execute(
        text(
            """
            SELECT grant_row.branch_id AS grant_branch_id,
                   capability.allow_sensitive_read
              FROM automation.agent_grants AS grant_row
              JOIN automation.agent_grant_capabilities AS capability
                ON capability.org_id=grant_row.org_id
               AND capability.agent_grant_id=grant_row.id
              JOIN core.memberships AS membership
                ON membership.org_id=grant_row.org_id
               AND membership.id=grant_row.subject_membership_id
              JOIN core.users AS user_row ON user_row.id=membership.user_id
              JOIN core.organizations AS organization ON organization.id=grant_row.org_id
             WHERE grant_row.org_id=:org_id AND grant_row.id=:agent_grant_id
               AND grant_row.subject_membership_id=:membership_id
               AND grant_row.client_id=:client_id
               AND grant_row.status='active'
               AND grant_row.expires_at>transaction_timestamp()
               AND membership.user_id=:user_id AND membership.status='active'
               AND user_row.auth_user_id=:auth_user_id AND user_row.status='active'
               AND organization.status='active'
               AND capability.capability_code=:capability_code
               AND capability.operation_mode='read'
               AND capability.risk_class='read_only'
               AND capability.approval_policy='none'
               AND capability.status='active'
               AND (:claim_branch_id IS NULL OR grant_row.branch_id IS NULL
                    OR grant_row.branch_id=CAST(:claim_branch_id AS uuid))
               AND (:claim_branch_id IS NULL OR EXISTS (
                   SELECT 1 FROM core.branches AS requested_branch
                    WHERE requested_branch.org_id=grant_row.org_id
                      AND requested_branch.id=CAST(:claim_branch_id AS uuid)
                      AND requested_branch.status='active'
               ))
               AND EXISTS (
                   SELECT 1
                     FROM core.access_grants AS access_grant
                     JOIN core.roles AS role
                       ON role.org_id=access_grant.org_id AND role.id=access_grant.role_id
                     JOIN core.role_permissions AS role_permission
                       ON role_permission.org_id=role.org_id AND role_permission.role_id=role.id
                     JOIN core.permissions AS permission
                       ON permission.code=role_permission.permission_code
                    WHERE access_grant.org_id=grant_row.org_id
                      AND access_grant.membership_id=grant_row.subject_membership_id
                      AND access_grant.status='active'
                      AND access_grant.valid_from_at<=transaction_timestamp()
                      AND (access_grant.expires_at IS NULL
                           OR access_grant.expires_at>transaction_timestamp())
                      AND ((access_grant.scope_kind='organization' AND access_grant.branch_id IS NULL)
                           OR (grant_row.branch_id IS NOT NULL
                               AND access_grant.scope_kind='branch'
                               AND access_grant.branch_id=grant_row.branch_id))
                      AND role.status='active' AND permission.status='active'
                      AND permission.code=:permission_code
               )
               AND (:claim_branch_id IS NULL OR EXISTS (
                   SELECT 1
                     FROM core.access_grants AS requested_access
                     JOIN core.roles AS requested_role
                       ON requested_role.org_id=requested_access.org_id
                      AND requested_role.id=requested_access.role_id
                     JOIN core.role_permissions AS requested_role_permission
                       ON requested_role_permission.org_id=requested_role.org_id
                      AND requested_role_permission.role_id=requested_role.id
                     JOIN core.permissions AS requested_permission
                       ON requested_permission.code=requested_role_permission.permission_code
                    WHERE requested_access.org_id=grant_row.org_id
                      AND requested_access.membership_id=grant_row.subject_membership_id
                      AND requested_access.status='active'
                      AND requested_access.valid_from_at<=transaction_timestamp()
                      AND (requested_access.expires_at IS NULL
                           OR requested_access.expires_at>transaction_timestamp())
                      AND requested_role.status='active'
                      AND requested_permission.status='active'
                      AND requested_permission.code=:permission_code
                      AND ((requested_access.scope_kind='organization'
                            AND requested_access.branch_id IS NULL)
                           OR (requested_access.scope_kind='branch'
                               AND requested_access.branch_id=CAST(:claim_branch_id AS uuid)))
               ))
             LIMIT 2
            """
        ),
        {
            "org_id": organization_id,
            "agent_grant_id": agent_grant_id,
            "membership_id": membership_id,
            "client_id": client_id,
            "user_id": user_id,
            "auth_user_id": auth_user_id,
            "capability_code": policy.capability_code,
            "permission_code": policy.permission_code,
            "claim_branch_id": claim_branch,
        },
    ).fetchall()
    if len(rows) != 1:
        raise HTTPException(status_code=403, detail="Canonical MCP authority is inactive")
    authority = rows[0]._mapping
    if (
        authority["grant_branch_id"] is not None
        and authority["grant_branch_id"] != claim_branch
    ):
        raise HTTPException(status_code=403, detail="Canonical MCP branch scope changed")
    allow_sensitive = bool(authority["allow_sensitive_read"])
    if bool(claims.get("mcp_allow_sensitive_read")) != allow_sensitive:
        raise HTTPException(status_code=403, detail="Canonical MCP sensitive-read scope changed")
    if policy.sensitive_read and not allow_sensitive:
        raise HTTPException(status_code=403, detail="Canonical MCP grant excludes sensitive reads")

    return CanonicalDelegation(
        auth_user_id=auth_user_id,
        user_id=user_id,
        organization_id=organization_id,
        membership_id=membership_id,
        agent_grant_id=agent_grant_id,
        client_id=client_id,
        policy=policy,
        branch_id=claim_branch,
        allow_sensitive_read=allow_sensitive,
    )


def _require_operation(context: CanonicalDelegation, operation_key: str) -> None:
    if context.policy.operation_key != operation_key:
        raise HTTPException(status_code=403, detail="Delegation does not authorize this MCP read")


def _row_dicts(rows) -> list[dict[str, Any]]:
    return [dict(row._mapping) for row in rows]


def _delegated_scope(context: CanonicalDelegation) -> tuple[bool, list[UUID]]:
    return context.branch_id is None, (
        [] if context.branch_id is None else [context.branch_id]
    )


def _delegated_user(context: CanonicalDelegation) -> dict[str, Any]:
    return {
        "org_id": str(context.organization_id),
        "auth_user_id": str(context.auth_user_id),
        "branch_ids": [] if context.branch_id is None else [str(context.branch_id)],
        "is_admin": False,
        "data_access_level": (
            "organization" if context.branch_id is None else "branch"
        ),
        "branch_scope": (
            "organization" if context.branch_id is None else "assigned"
        ),
    }


@router.get("/party-aging")
def canonical_party_aging(
    party_type: Literal["customer", "supplier"] = Query(...),
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
):
    _require_operation(context, "finance.party_aging.get")
    organization_scope, branch_ids = _delegated_scope(context)
    return canonical_party_aging_reads.query_party_aging(
        db, org_id=context.organization_id, party_type=party_type,
        organization_scope=organization_scope, branch_ids=branch_ids,
    )


@router.get("/party-statement")
def canonical_party_statement(
    party_account_id: UUID,
    party_type: Literal["customer", "supplier"],
    date_from: date,
    date_to: date,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
):
    _require_operation(context, "finance.party_statement.get")
    return canonical_party_ledger_reads.get_party_statement(
        party_account_id, party_type, date_from, date_to, page, page_size,
        _delegated_user(context), db,
    )


@router.get("/trial-balance")
def canonical_trial_balance(
    date_from: date, date_to: date,
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
):
    _require_operation(context, "finance.trial_balance.get")
    canonical_reporting_reads._period(date_from, date_to)
    organization_scope, branch_ids = _delegated_scope(context)
    return canonical_reporting_reads.query_trial_balance(
        db, org_id=context.organization_id, date_from=date_from, date_to=date_to,
        organization_scope=organization_scope, branch_ids=branch_ids,
    )


@router.get("/profit-loss")
def canonical_profit_loss(
    date_from: date, date_to: date,
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
):
    _require_operation(context, "finance.profit_loss.get")
    canonical_reporting_reads._period(date_from, date_to)
    organization_scope, branch_ids = _delegated_scope(context)
    return canonical_reporting_reads.query_profit_loss(
        db, org_id=context.organization_id, date_from=date_from, date_to=date_to,
        organization_scope=organization_scope, branch_ids=branch_ids,
    )


@router.get("/customer-activity")
def canonical_customer_activity(
    date_from: date, date_to: date,
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
):
    _require_operation(context, "finance.customer_activity.get")
    canonical_reporting_reads._period(date_from, date_to)
    organization_scope, branch_ids = _delegated_scope(context)
    return canonical_reporting_reads.query_customer_activity(
        db, org_id=context.organization_id, date_from=date_from, date_to=date_to,
        organization_scope=organization_scope, branch_ids=branch_ids,
    )


@router.get("/products")
def canonical_product_search(
    q: str = Query("", max_length=128),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0, le=10000),
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
):
    _require_operation(context, "master.products.search")
    search = " ".join(q.casefold().split())
    rows = db.execute(
        text(
            """
            SELECT product.id AS product_id, product.sku, product.product_kind,
                   product.name, product.generic_name, product.base_uom_code,
                   dosage_form, strength_display, hsn_code, drug_schedule,
                   requires_prescription, ndps_regulated, cold_chain_required,
                   gtin, product.status, product.row_version,
                   conversions.uom_conversions
              FROM catalog.products AS product
              CROSS JOIN LATERAL (
                  SELECT erp_core_commands.current_organization_business_date()
                           AS business_date
              ) business_clock
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
                                        conversion.to_uom_code, conversion.valid_from,
                                        conversion.id
                           ), '[]'::jsonb
                         ) AS uom_conversions
                    FROM (
                      SELECT id, from_uom_code, to_uom_code, multiplier,
                             valid_from, valid_until
                        FROM catalog.uom_conversions
                       WHERE org_id=product.org_id AND product_id=product.id
                         AND status='active'
                         AND valid_from<=business_clock.business_date
                         AND (valid_until IS NULL
                              OR valid_until>=business_clock.business_date)
                       ORDER BY from_uom_code, to_uom_code, valid_from, id
                       LIMIT 50
                    ) AS conversion
              ) AS conversions ON true
              LEFT JOIN parties.parties AS manufacturer
                ON manufacturer.org_id=product.org_id
               AND manufacturer.id=product.manufacturer_party_id
              LEFT JOIN LATERAL (
                  SELECT pg_catalog.to_tsvector(
                           'simple'::pg_catalog.regconfig,
                           pg_catalog.string_agg(
                             ingredient.canonical_name,' '
                             ORDER BY ingredient.canonical_name
                           )
                         ) AS search_document
                    FROM catalog.product_ingredients AS composition
                    JOIN catalog.ingredients AS ingredient
                      ON ingredient.id=composition.ingredient_id
                   WHERE composition.org_id=product.org_id
                     AND composition.product_id=product.id
                     AND composition.status='active'
                     AND composition.valid_until IS NULL
                     AND ingredient.status='active'
              ) AS composition ON true
             WHERE product.org_id=:org_id AND product.status IN ('active','blocked')
               AND (:search='' OR pg_catalog.lower(product.name) LIKE :prefix
                    OR pg_catalog.lower(COALESCE(product.generic_name,'')) LIKE :prefix
                    OR pg_catalog.lower(product.sku) LIKE :prefix
                    OR product.hsn_code LIKE :prefix OR COALESCE(product.gtin,'') LIKE :prefix
                    OR pg_catalog.lower(COALESCE(manufacturer.legal_name,'')) LIKE :prefix
                    OR (:tsquery<>'' AND pg_catalog.to_tsvector(
                         'simple'::pg_catalog.regconfig,
                         COALESCE(product.sku,'')||' '||COALESCE(product.name,'')||' '||
                         COALESCE(product.generic_name,'')||' '||COALESCE(product.gtin,'')
                       ) @@ pg_catalog.to_tsquery('simple'::pg_catalog.regconfig,:tsquery))
                    OR (:tsquery<>'' AND COALESCE(
                         composition.search_document,''::pg_catalog.tsvector
                       ) @@ pg_catalog.to_tsquery('simple'::pg_catalog.regconfig,:tsquery)))
             ORDER BY CASE WHEN pg_catalog.lower(product.sku)=:search THEN 0
                           WHEN product.gtin=:search THEN 1
                           WHEN pg_catalog.lower(product.name)=:search THEN 2
                           WHEN pg_catalog.lower(product.name) LIKE :prefix THEN 3 ELSE 4 END,
                      product.name, product.id
             LIMIT :limit OFFSET :offset
            """
        ),
        {
            "org_id": context.organization_id,
            "search": search,
            "prefix": f"{search}%",
            "tsquery": _search_tsquery(search),
            "limit": limit,
            "offset": offset,
        },
    ).fetchall()
    return _row_dicts(rows)


@router.get("/product-setup-options")
def canonical_product_setup_options(
    manufacturer_search: str = Query("", max_length=100),
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
):
    _require_operation(context, "master.product_setup_options.get")
    return canonical_erp_reads.product_setup_options(
        manufacturer_search, _delegated_user(context), db
    )


@router.get("/product-ingredients")
def canonical_product_ingredient_search(
    search: str = Query("", max_length=100),
    limit: int = Query(20, ge=1, le=50),
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
):
    _require_operation(context, "master.product_ingredients.search")
    return {
        "ingredients": canonical_erp_reads.product_setup_ingredients(
            search, limit, _delegated_user(context), db
        )
    }


@router.get("/product-hsn")
def canonical_product_hsn_search(
    search: str = Query("", max_length=100),
    limit: int = Query(20, ge=1, le=50),
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
):
    _require_operation(context, "master.product_hsn.search")
    return {
        "hsn_codes": canonical_erp_reads.product_setup_hsn_codes(
            search, limit, _delegated_user(context), db
        )
    }


@router.get("/product-setup")
def canonical_product_setup_get(
    product_id: UUID,
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
):
    _require_operation(context, "master.product_setup.get")
    return canonical_erp_reads.product_setup(
        product_id, _delegated_user(context), db
    )


@router.get("/customer", response_model=CustomerAccountReadback)
def canonical_customer_get(
    customer_account_id: UUID,
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
) -> CustomerAccountReadback:
    """Read one exact current customer account after canonical creation."""

    _require_operation(context, "parties.customers.get")
    row = db.execute(
        text(
            """
            SELECT customer.id AS customer_account_id, customer.party_id,
                   customer.customer_code, party.legal_name AS customer_name,
                   party.party_kind AS customer_type,
                   contact.phone AS primary_phone,
                   contact.email AS primary_email,
                   contact.name AS contact_person_name,
                   address.line1 AS address_line1,
                   address.line2 AS address_line2,
                   address.city, address.state_code,
                   address.postal_code AS pincode,
                   registration.registration_number AS gst_number,
                   party.pan AS pan_number, customer.credit_limit,
                   customer.credit_days, customer.status AS account_status,
                   party.status AS party_status,
                   customer.row_version AS account_row_version,
                   party.row_version AS party_row_version
              FROM parties.customer_accounts AS customer
              JOIN parties.parties AS party
                ON party.org_id=customer.org_id AND party.id=customer.party_id
              LEFT JOIN LATERAL (
                  SELECT name,phone,email
                    FROM parties.contacts
                   WHERE org_id=customer.org_id AND party_id=customer.party_id
                     AND status='active'
                   ORDER BY is_primary DESC,id LIMIT 1
              ) AS contact ON true
              LEFT JOIN LATERAL (
                  SELECT line1,line2,city,state_code,postal_code
                    FROM parties.addresses
                   WHERE org_id=customer.org_id AND party_id=customer.party_id
                     AND status='active'
                   ORDER BY is_primary DESC,id LIMIT 1
              ) AS address ON true
              LEFT JOIN LATERAL (
                  SELECT registration_number
                    FROM parties.tax_registrations
                   WHERE org_id=customer.org_id AND party_id=customer.party_id
                     AND registration_type='GSTIN'
                     AND status IN ('active','pending_verification')
                   ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END,
                            valid_from DESC NULLS LAST,id LIMIT 1
              ) AS registration ON true
             WHERE customer.org_id=:org_id
               AND customer.id=:customer_account_id
            """
        ),
        {
            "org_id": context.organization_id,
            "customer_account_id": customer_account_id,
        },
    ).mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Customer account not found")
    return CustomerAccountReadback(**row)


@router.get("/suppliers", response_model=SupplierSearchResponse)
def canonical_supplier_search(
    search_term: Optional[str] = Query(None, max_length=128),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, le=10000),
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
):
    _require_operation(context, "master.suppliers.search")
    search = " ".join((search_term or "").casefold().split())
    rows = db.execute(
        text(
            """
            SELECT supplier.id AS supplier_account_id,
                   supplier.supplier_code, supplier.party_id,
                   party.legal_name, party.trade_name, supplier.payment_days,
                   supplier.status,
                   registration.registration_number AS gstin,
                   contact.phone, contact.email, supplier.row_version
              FROM parties.supplier_accounts AS supplier
              JOIN parties.parties AS party
                ON party.org_id=supplier.org_id AND party.id=supplier.party_id
              LEFT JOIN LATERAL (
                  SELECT registration_number
                    FROM parties.tax_registrations
                   WHERE org_id=supplier.org_id AND party_id=supplier.party_id
                     AND registration_type='GSTIN'
                     AND status IN ('active','pending_verification')
                   ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END,
                            valid_from DESC NULLS LAST, id
                   LIMIT 1
              ) AS registration ON true
              LEFT JOIN LATERAL (
                  SELECT phone, email
                    FROM parties.contacts
                   WHERE org_id=supplier.org_id AND party_id=supplier.party_id
                     AND status='active'
                   ORDER BY is_primary DESC, id
                   LIMIT 1
              ) AS contact ON true
             WHERE supplier.org_id=:org_id AND supplier.status IN ('active','on_hold')
               AND party.status IN ('active','blocked')
               AND (:search='' OR pg_catalog.lower(party.legal_name) LIKE :prefix
                    OR pg_catalog.lower(COALESCE(party.trade_name,'')) LIKE :prefix
                    OR pg_catalog.lower(supplier.supplier_code) LIKE :prefix
                    OR pg_catalog.lower(COALESCE(registration.registration_number,'')) LIKE :prefix
                    OR COALESCE(contact.phone,'') LIKE :prefix
                    OR pg_catalog.lower(COALESCE(contact.email,'')) LIKE :prefix
                    OR (:tsquery<>'' AND pg_catalog.to_tsvector(
                         'simple'::pg_catalog.regconfig,
                         COALESCE(party.legal_name,'')||' '||COALESCE(party.trade_name,'')
                       ) @@ pg_catalog.to_tsquery('simple'::pg_catalog.regconfig,:tsquery)))
             ORDER BY CASE WHEN pg_catalog.lower(supplier.supplier_code)=:search THEN 0
                           WHEN COALESCE(contact.phone,'')=:search THEN 1
                           WHEN pg_catalog.lower(COALESCE(registration.registration_number,''))=:search THEN 2
                           WHEN pg_catalog.lower(party.legal_name)=:search THEN 3 ELSE 4 END,
                      party.legal_name, supplier.id
             LIMIT :limit OFFSET :offset
            """
        ),
        {
            "org_id": context.organization_id,
            "search": search,
            "prefix": f"{search}%",
            "tsquery": _search_tsquery(search),
            "limit": limit,
            "offset": offset,
        },
    ).fetchall()
    suppliers = [SupplierSearchItem(**row) for row in _row_dicts(rows)]
    match_state = (
        "no_match" if not suppliers else "single_match" if len(suppliers) == 1 else "multiple_matches"
    )
    return SupplierSearchResponse(
        match_state=match_state,
        requires_selection=len(suppliers) != 1,
        returned_count=len(suppliers),
        suppliers=suppliers,
    )


@router.get("/supplier", response_model=SupplierAccountReadback)
def canonical_supplier_get(
    supplier_account_id: UUID,
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
) -> SupplierAccountReadback:
    """Read one exact current supplier account after canonical creation."""

    _require_operation(context, "parties.suppliers.get")
    row = db.execute(
        text(
            """
            SELECT supplier.id AS supplier_account_id, supplier.party_id,
                   supplier.supplier_code, party.legal_name AS supplier_name,
                   contact.phone AS primary_phone,
                   contact.email AS primary_email,
                   contact.name AS contact_person,
                   address.line1 AS address_line1,
                   address.line2 AS address_line2,
                   address.city, address.state_code,
                   address.postal_code AS pincode,
                   registration.registration_number AS gst_number,
                   party.pan AS pan_number, supplier.payment_days,
                   supplier.status AS account_status,
                   party.status AS party_status,
                   supplier.row_version AS account_row_version,
                   party.row_version AS party_row_version
              FROM parties.supplier_accounts AS supplier
              JOIN parties.parties AS party
                ON party.org_id=supplier.org_id AND party.id=supplier.party_id
              LEFT JOIN LATERAL (
                  SELECT name,phone,email
                    FROM parties.contacts
                   WHERE org_id=supplier.org_id AND party_id=supplier.party_id
                     AND status='active'
                   ORDER BY is_primary DESC,id LIMIT 1
              ) AS contact ON true
              LEFT JOIN LATERAL (
                  SELECT line1,line2,city,state_code,postal_code
                    FROM parties.addresses
                   WHERE org_id=supplier.org_id AND party_id=supplier.party_id
                     AND status='active'
                   ORDER BY is_primary DESC,id LIMIT 1
              ) AS address ON true
              LEFT JOIN LATERAL (
                  SELECT registration_number
                    FROM parties.tax_registrations
                   WHERE org_id=supplier.org_id AND party_id=supplier.party_id
                     AND registration_type='GSTIN'
                     AND status IN ('active','pending_verification')
                   ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END,
                            valid_from DESC NULLS LAST,id LIMIT 1
              ) AS registration ON true
             WHERE supplier.org_id=:org_id
               AND supplier.id=:supplier_account_id
            """
        ),
        {
            "org_id": context.organization_id,
            "supplier_account_id": supplier_account_id,
        },
    ).mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Supplier account not found")
    return SupplierAccountReadback(**row)


@router.get("/gst-settings")
def canonical_gst_settings(
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
):
    _require_operation(context, "gst.settings.get")
    rows = db.execute(
        text(
            """
            SELECT id, branch_id, gstin, legal_name, trade_name, state_code,
                   registration_type, business_vertical_code, effective_from,
                   effective_to, status, row_version
              FROM tax.registrations
              CROSS JOIN LATERAL (
                  SELECT erp_core_commands.current_organization_business_date()
                           AS business_date
              ) business_clock
             WHERE org_id=:org_id AND status='active'
               AND effective_from<=business_clock.business_date
               AND (effective_to IS NULL
                    OR effective_to>=business_clock.business_date)
               AND ((CAST(:branch_id AS uuid) IS NULL AND branch_id IS NULL)
                    OR branch_id=CAST(:branch_id AS uuid))
             ORDER BY effective_from DESC, id
             LIMIT 2
            """
        ),
        {
            "org_id": context.organization_id,
            "branch_id": context.branch_id,
        },
    ).fetchall()
    if len(rows) > 1:
        raise HTTPException(status_code=409, detail="Canonical GST registration is ambiguous")
    return dict(rows[0]._mapping) if rows else None

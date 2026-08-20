"""Hidden canonical read API used only by the isolated MCP service."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials
from jwt import InvalidTokenError as JWTError
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.orm import Session

from ....core.auth.jwt_auth import decode_jwt
from ....core.database import get_db
from .mcp_agent_grants import _internal_auth, bearer
from .mcp_contract import CanonicalReadPolicy, policy_for


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
            SELECT grant_row.branch_id, capability.allow_sensitive_read
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
        },
    ).fetchall()
    if len(rows) != 1:
        raise HTTPException(status_code=403, detail="Canonical MCP authority is inactive")
    authority = rows[0]._mapping
    if authority["branch_id"] != claim_branch:
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


@router.get("/products")
def canonical_product_search(
    q: str = Query("", max_length=128),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0, le=10000),
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
):
    _require_operation(context, "master.products.search")
    search = q.strip()
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
                         AND (valid_until IS NULL OR valid_until>=CURRENT_DATE)
                       ORDER BY from_uom_code, to_uom_code, valid_from, id
                       LIMIT 50
                    ) AS conversion
              ) AS conversions ON true
             WHERE product.org_id=:org_id AND product.status IN ('active','blocked')
               AND (:search='' OR name ILIKE :pattern OR COALESCE(generic_name,'') ILIKE :pattern
                    OR sku ILIKE :pattern OR hsn_code ILIKE :pattern
                    OR COALESCE(gtin,'') ILIKE :pattern)
             ORDER BY product.name, product.id
             LIMIT :limit OFFSET :offset
            """
        ),
        {
            "org_id": context.organization_id,
            "search": search,
            "pattern": f"%{search}%",
            "limit": limit,
            "offset": offset,
        },
    ).fetchall()
    return _row_dicts(rows)


@router.get("/suppliers", response_model=SupplierSearchResponse)
def canonical_supplier_search(
    search_term: Optional[str] = Query(None, max_length=128),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, le=10000),
    context: CanonicalDelegation = Depends(get_canonical_delegation),
    db: Session = Depends(get_db),
):
    _require_operation(context, "master.suppliers.search")
    search = (search_term or "").strip()
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
                     AND registration_type='GSTIN' AND status='active'
                   ORDER BY valid_from DESC NULLS LAST, id
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
               AND (:search='' OR party.legal_name ILIKE :pattern
                    OR COALESCE(party.trade_name,'') ILIKE :pattern
                    OR supplier.supplier_code ILIKE :pattern
                    OR COALESCE(registration.registration_number,'') ILIKE :pattern
                    OR COALESCE(contact.phone,'') ILIKE :pattern
                    OR COALESCE(contact.email,'') ILIKE :pattern)
             ORDER BY party.legal_name, supplier.id
             LIMIT :limit OFFSET :offset
            """
        ),
        {
            "org_id": context.organization_id,
            "search": search,
            "pattern": f"%{search}%",
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
             WHERE org_id=:org_id AND status='active'
               AND effective_from<=CURRENT_DATE
               AND (effective_to IS NULL OR effective_to>=CURRENT_DATE)
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

"""Supabase-backed identity exchange for ERP sessions."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from decimal import Decimal
import os
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ....core.auth.jwt_auth import create_access_token
from ....core.auth.supabase_auth import supabase_auth
from ....core.database import get_db
from ....repositories.user_repository import MembershipContextDenied, UserRepository
from ...services.auth import build_erp_token_claims


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/oauth", tags=["OAuth Authentication"])
bearer = HTTPBearer(auto_error=False)


class McpConsentCapability(BaseModel):
    model_config = ConfigDict(extra="forbid")

    capability_code: str
    operation_mode: str
    risk_class: str
    approval_policy: str
    maximum_amount: Optional[Decimal]
    currency_code: Optional[str]
    allow_sensitive_read: bool


class McpConsentProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject: UUID
    organization_id: UUID
    organization_name: str
    membership_id: UUID
    agent_grant_id: UUID
    client_id: str
    client_display_name: str
    branch_id: Optional[UUID]
    branch_name: Optional[str]
    consent_version: str
    expires_at: datetime
    capabilities: List[McpConsentCapability]


def _configured_mcp_client_ids() -> tuple[str, ...]:
    return tuple(
        value.strip()
        for value in os.getenv("MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS", "").split(",")
        if value.strip()
    )


def _mcp_consent_proposal_rows(db: Session, subject: UUID, client_id: str):
    return db.execute(
        text(
            """
            SELECT grant_row.org_id, organization.legal_name AS organization_name,
                   grant_row.subject_membership_id AS membership_id,
                   grant_row.id AS agent_grant_id, grant_row.client_id,
                   grant_row.client_display_name, grant_row.branch_id,
                   branch.name AS branch_name, grant_row.consent_version,
                   grant_row.expires_at, capability.capability_code,
                   capability.operation_mode, capability.risk_class,
                   capability.approval_policy, capability.maximum_amount,
                   capability.currency_code, capability.allow_sensitive_read
              FROM automation.agent_grants AS grant_row
              JOIN automation.agent_grant_capabilities AS capability
                ON capability.org_id=grant_row.org_id
               AND capability.agent_grant_id=grant_row.id
              JOIN core.memberships AS membership
                ON membership.org_id=grant_row.org_id
               AND membership.id=grant_row.subject_membership_id
              JOIN core.users AS user_row ON user_row.id=membership.user_id
              JOIN core.organizations AS organization ON organization.id=grant_row.org_id
              LEFT JOIN core.branches AS branch
                ON branch.org_id=grant_row.org_id AND branch.id=grant_row.branch_id
             WHERE user_row.auth_user_id=:subject
               AND user_row.status='active'
               AND membership.status='active'
               AND organization.status='active'
               AND (grant_row.branch_id IS NULL OR branch.status='active')
               AND grant_row.client_id=:client_id
               AND grant_row.status='active'
               AND grant_row.consented_by_membership_id=grant_row.subject_membership_id
               AND grant_row.expires_at>transaction_timestamp()
               AND capability.status='active'
               AND EXISTS (
                   SELECT 1
                     FROM core.access_grants AS access_grant
                    WHERE access_grant.org_id=grant_row.org_id
                      AND access_grant.membership_id=grant_row.subject_membership_id
                      AND access_grant.status='active'
                      AND access_grant.valid_from_at<=transaction_timestamp()
                      AND (access_grant.expires_at IS NULL
                           OR access_grant.expires_at>transaction_timestamp())
                      AND ((grant_row.branch_id IS NULL
                            AND access_grant.scope_kind='organization'
                            AND access_grant.branch_id IS NULL)
                           OR (grant_row.branch_id IS NOT NULL
                               AND access_grant.scope_kind='branch'
                               AND access_grant.branch_id=grant_row.branch_id))
               )
             ORDER BY grant_row.id, capability.capability_code
            """
        ),
        {"subject": subject, "client_id": client_id},
    ).fetchall()


@router.post("/supabase/session")
async def exchange_supabase_session(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Exchange a verified Supabase identity for a tenant-scoped ERP token."""
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Supabase bearer token is required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    identity = await supabase_auth.get_user_from_access_token(credentials.credentials)
    if not identity.get("email_confirmed_at"):
        raise HTTPException(status_code=403, detail="Verified email is required")

    try:
        auth_user_id = UUID(str(identity["id"]))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid Supabase identity") from exc

    try:
        organization_id = UUID(str(identity.get("app_metadata", {}).get("org_id")))
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "erp_organization_assignment_required",
                "message": "Your identity is not assigned to an ERP organization.",
            },
        ) from exc

    if not UserRepository.canonical_session_authority_available(db):
        raise HTTPException(
            status_code=503,
            detail={
                "error": "erp_maintenance",
                "message": "ERP maintenance is in progress. Please retry shortly.",
            },
        )

    try:
        user_data = UserRepository.find_by_auth_user_id(auth_user_id, organization_id, db)
    except MembershipContextDenied as exc:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "erp_membership_required",
                "message": "Your identity is not linked to an active ERP organization.",
            },
        ) from exc
    if not user_data:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "erp_membership_required",
                "message": "Your identity is not linked to an ERP organization.",
            },
        )
    if not user_data["is_active"]:
        raise HTTPException(status_code=403, detail="Account is disabled")
    if not user_data["org_active"]:
        raise HTTPException(status_code=403, detail="Organization is disabled")
    user_data["email"] = str(identity["email"])

    token_data = build_erp_token_claims(user_data)
    token_data["auth_user_id"] = str(auth_user_id)
    token_data["auth_provider"] = identity.get("app_metadata", {}).get("provider")
    access_token = create_access_token(token_data, expires_delta=timedelta(hours=1))

    logger.info("Supabase session exchanged for user_id=%s", user_data["user_id"])
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": 3600,
        "user": {
            "id": user_data["user_id"],
            "email": user_data["email"],
            "full_name": user_data["full_name"],
            "org_id": str(user_data["org_id"]),
            "org_name": user_data["org_name"],
            "role_id": user_data["role_id"],
            "branch_ids": user_data["branch_ids"],
            "permissions": user_data["permissions"],
        },
    }


@router.get("/mcp/consent-proposal", response_model=McpConsentProposal)
async def get_mcp_consent_proposal(
    client_id: str = Query(min_length=1, max_length=255),
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> McpConsentProposal:
    """Disclose one reviewed canonical ERP grant to its authenticated subject."""
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Supabase bearer token is required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    allowed_clients = _configured_mcp_client_ids()
    if not allowed_clients or client_id not in allowed_clients:
        raise HTTPException(status_code=403, detail="OAuth client is not pre-registered")

    identity = await supabase_auth.get_user_from_access_token(credentials.credentials)
    if not identity.get("email_confirmed_at"):
        raise HTTPException(status_code=403, detail="Verified email is required")
    try:
        subject = UUID(str(identity["id"]))
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid Supabase identity") from exc

    try:
        rows = _mcp_consent_proposal_rows(db, subject, client_id)
    except SQLAlchemyError as exc:
        logger.error("Canonical MCP consent authority is unavailable: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Canonical ERP grant authority is unavailable",
        ) from exc
    grant_ids = {row._mapping["agent_grant_id"] for row in rows}
    if len(grant_ids) != 1 or not rows:
        raise HTTPException(
            status_code=403,
            detail="Exactly one active reviewed ERP grant proposal is required",
        )

    first = rows[0]._mapping
    capabilities = [
        McpConsentCapability(
            capability_code=row._mapping["capability_code"],
            operation_mode=row._mapping["operation_mode"],
            risk_class=row._mapping["risk_class"],
            approval_policy=row._mapping["approval_policy"],
            maximum_amount=row._mapping["maximum_amount"],
            currency_code=row._mapping["currency_code"],
            allow_sensitive_read=bool(row._mapping["allow_sensitive_read"]),
        )
        for row in rows
    ]
    return McpConsentProposal(
        subject=subject,
        organization_id=first["org_id"],
        organization_name=first["organization_name"],
        membership_id=first["membership_id"],
        agent_grant_id=first["agent_grant_id"],
        client_id=first["client_id"],
        client_display_name=first["client_display_name"],
        branch_id=first["branch_id"],
        branch_name=first["branch_name"],
        consent_version=first["consent_version"],
        expires_at=first["expires_at"],
        capabilities=capabilities,
    )


@router.get("/providers")
async def list_oauth_providers() -> Dict[str, Any]:
    configured = bool(supabase_auth.supabase_url and supabase_auth.supabase_anon_key)
    return {
        "providers": [
            {"name": "email", "enabled": configured},
            {"name": "google", "enabled": configured},
        ],
        "supabase_configured": configured,
    }


@router.get("/status")
async def oauth_status() -> Dict[str, Any]:
    configured = bool(supabase_auth.supabase_url and supabase_auth.supabase_anon_key)
    return {
        "enabled": configured,
        "providers_configured": ["email", "google"] if configured else [],
        "setup_required": not configured,
    }

"""Authenticated organization onboarding and invitation routes."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import os
from typing import Any, Dict, Literal, Optional
from urllib.parse import quote
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials
from jwt import InvalidTokenError
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ....core.auth.session_authority import require_canonical_session_authority
from ....core.auth.supabase_auth import supabase_auth
from ....core.auth.jwt_auth import (
    INVITATION_TOKEN_AUDIENCE,
    INVITATION_TOKEN_ISSUER,
    INVITATION_TOKEN_USE,
    decode_organization_invitation_token,
    encode_organization_invitation_token,
)
from ....core.database import get_db
from ....core.security.permissions import PermissionChecker
from .oauth import bearer


router = APIRouter(
    prefix="/auth/onboarding",
    tags=["Organization Onboarding"],
    dependencies=[Security(bearer)],
)


class CreateOrganizationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    legal_name: str = Field(min_length=2, max_length=200)
    trade_name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    address_line1: str = Field(min_length=5, max_length=240)
    city: str = Field(min_length=2, max_length=120)
    state_code: str = Field(pattern=r"^[0-9]{2}$")
    postal_code: str = Field(pattern=r"^[1-9][0-9]{5}$")

    @field_validator("trade_name", mode="before")
    @classmethod
    def blank_trade_name_is_absent(cls, value):
        return None if isinstance(value, str) and not value.strip() else value


class AcceptInvitationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    invitation_token: str = Field(min_length=80, max_length=2048)


class CreateInvitationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    email: EmailStr
    role_id: UUID
    scope_kind: Literal["organization", "branch"]
    branch_id: Optional[UUID] = None
    expires_in_hours: int = Field(default=168, ge=1, le=720)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).lower()

    @model_validator(mode="after")
    def validate_scope(self):
        if self.scope_kind == "organization" and self.branch_id is not None:
            raise ValueError("branch_id must be omitted for organization scope")
        if self.scope_kind == "branch" and self.branch_id is None:
            raise ValueError("branch_id is required for branch scope")
        return self


class OnboardingResult(BaseModel):
    organization_id: UUID
    membership_id: UUID
    next_action: Literal["exchange_session"] = "exchange_session"


class InvitationResult(BaseModel):
    invitation_id: UUID
    organization_id: UUID
    email: EmailStr
    expires_at: datetime
    token: str
    invitation_url: str


class InvitationRole(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role_id: UUID
    role_code: str
    role_name: str
    description: Optional[str]


class InvitationBranch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    branch_id: UUID
    branch_code: str
    branch_name: str
    city: str
    state_code: str


class InvitationContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    organization_id: UUID
    organization_name: str
    roles: list[InvitationRole]
    branches: list[InvitationBranch]


async def _verified_identity(
    credentials: Optional[HTTPAuthorizationCredentials],
) -> tuple[dict[str, Any], UUID, str]:
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
        subject = UUID(str(identity["id"]))
        email = str(identity["email"]).strip().lower()
    except (KeyError, TypeError, ValueError, OverflowError, OSError) as exc:
        raise HTTPException(status_code=401, detail="Invalid Supabase identity") from exc
    if not email:
        raise HTTPException(status_code=403, detail="Verified email is required")
    return identity, subject, email


def _identity_display_name(identity: dict[str, Any], email: str) -> str:
    metadata = identity.get("user_metadata")
    if isinstance(metadata, dict):
        for key in ("full_name", "name"):
            candidate = metadata.get(key)
            if isinstance(candidate, str) and 2 <= len(candidate.strip()) <= 120:
                return candidate.strip()
    local_part = email.partition("@")[0].strip()
    return local_part[:120] if len(local_part) >= 2 else email[:120]


def _encode_invitation_token(claims: dict[str, Any]) -> str:
    return encode_organization_invitation_token(claims)


def _decode_invitation_token(token: str) -> dict[str, Any]:
    try:
        claims = decode_organization_invitation_token(token)
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_invitation",
                "message": "This invitation is invalid or has expired.",
            },
        ) from exc
    return claims


def _command_row(db: Session, statement: str, parameters: dict[str, Any]):
    try:
        db.execute(
            text("SELECT pg_catalog.set_config('app.request_id', :request_id, true)"),
            {"request_id": str(uuid4())},
        )
        rows = db.execute(text(statement), parameters).mappings().all()
        if len(rows) != 1:
            raise RuntimeError("canonical onboarding command returned an invalid result")
        db.commit()
        return rows[0]
    except (SQLAlchemyError, RuntimeError) as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail={
                "error": "onboarding_rejected",
                "message": "The onboarding request could not be completed.",
            },
        ) from exc


def _invitation_manager(user: Dict[str, Any] = Depends(PermissionChecker())):
    raw_permissions = user.get("permissions") or {}
    if isinstance(raw_permissions, dict):
        can_manage_users = raw_permissions.get("core.user.manage") is True
    elif isinstance(raw_permissions, (list, tuple, set, frozenset)):
        can_manage_users = "core.user.manage" in raw_permissions
    else:
        can_manage_users = False
    if user.get("is_admin") is not True and not can_manage_users:
        raise HTTPException(status_code=403, detail="User invitation access required")
    return user


def _activate_invitation_context(
    db: Session, current_user: Dict[str, Any]
) -> UUID:
    try:
        organization_id = UUID(str(current_user["org_id"]))
        auth_user_id = UUID(str(current_user["auth_user_id"]))
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid ERP identity context") from exc
    db.execute(
        text(
            """
            SELECT erp_security.activate_context(:auth_user_id, :org_id),
                   pg_catalog.set_config('app.request_id', :request_id, true)
            """
        ),
        {
            "auth_user_id": auth_user_id,
            "org_id": organization_id,
            "request_id": str(uuid4()),
        },
    )
    return organization_id


@router.get("/invitations/context", response_model=InvitationContext)
def invitation_context(
    current_user: Dict[str, Any] = Depends(_invitation_manager),
    db: Session = Depends(get_db),
) -> InvitationContext:
    """Return human-readable, active invitation choices for one organization."""
    organization_id = _activate_invitation_context(db, current_user)
    organization_rows = db.execute(
        text(
            """
            SELECT id AS organization_id, legal_name AS organization_name
              FROM core.organizations
             WHERE id=:organization_id AND status='active'
            """
        ),
        {"organization_id": organization_id},
    ).mappings().all()
    if len(organization_rows) != 1:
        raise HTTPException(status_code=409, detail="Active organization is unavailable")

    role_rows = db.execute(
        text(
            """
            SELECT id AS role_id, code AS role_code, name AS role_name, description
              FROM core.roles
             WHERE org_id=:organization_id AND status='active'
             ORDER BY name, id
            """
        ),
        {"organization_id": organization_id},
    ).mappings().all()
    branch_rows = db.execute(
        text(
            """
            SELECT id AS branch_id, code AS branch_code, name AS branch_name,
                   city, state_code
              FROM core.branches
             WHERE org_id=:organization_id AND status='active'
             ORDER BY code, id
            """
        ),
        {"organization_id": organization_id},
    ).mappings().all()
    if not role_rows:
        raise HTTPException(status_code=409, detail="No active invitation role is available")

    organization = organization_rows[0]
    return InvitationContext(
        organization_id=organization["organization_id"],
        organization_name=organization["organization_name"],
        roles=[InvitationRole(**row) for row in role_rows],
        branches=[InvitationBranch(**row) for row in branch_rows],
    )


@router.post("/organizations", response_model=OnboardingResult, status_code=201)
async def create_organization(
    request: CreateOrganizationRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: Session = Depends(get_db),
) -> OnboardingResult:
    """Create a first organization for one verified cloud identity."""
    identity, subject, email = await _verified_identity(credentials)
    require_canonical_session_authority(db)
    row = _command_row(
        db,
        """
        SELECT org_id, membership_id
          FROM erp_core_commands.onboard_organization(
              :verified_auth_user_id, :verified_email, :display_name,
              :legal_name, :trade_name, :address_line1, :city,
              :state_code, :postal_code
          )
        """,
        {
            "verified_auth_user_id": subject,
            "verified_email": email,
            "display_name": _identity_display_name(identity, email),
            "legal_name": request.legal_name,
            "trade_name": request.trade_name,
            "address_line1": request.address_line1,
            "city": request.city,
            "state_code": request.state_code,
            "postal_code": request.postal_code,
        },
    )
    return OnboardingResult(
        organization_id=row["org_id"], membership_id=row["membership_id"]
    )


@router.post("/invitations/accept", response_model=OnboardingResult)
async def accept_invitation(
    request: AcceptInvitationRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: Session = Depends(get_db),
) -> OnboardingResult:
    """Accept an email-bound, single-use invitation as a verified identity."""
    identity, subject, email = await _verified_identity(credentials)
    require_canonical_session_authority(db)
    claims = _decode_invitation_token(request.invitation_token)
    if str(claims["email"]).strip().lower() != email:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "invitation_email_mismatch",
                "message": "Sign in with the email address this invitation was sent to.",
            },
        )
    try:
        invitation_id = UUID(str(claims["invitation_id"]))
        inviting_org_id = UUID(str(claims["organization_id"]))
        inviting_membership_id = UUID(str(claims["inviting_membership_id"]))
        requested_role_id = UUID(str(claims["requested_role_id"]))
        requested_branch_id = (
            UUID(str(claims["requested_branch_id"]))
            if claims.get("requested_branch_id") is not None
            else None
        )
        requested_scope_kind = str(claims["requested_scope_kind"])
        issued_at = datetime.fromtimestamp(int(claims["iat"]), tz=timezone.utc)
        expires_at = datetime.fromtimestamp(int(claims["exp"]), tz=timezone.utc)
        if requested_scope_kind not in {"organization", "branch"}:
            raise ValueError("invalid invitation scope")
        if (requested_scope_kind == "branch") != (requested_branch_id is not None):
            raise ValueError("invalid invitation branch scope")
    except (KeyError, TypeError, ValueError, OverflowError, OSError) as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_invitation",
                "message": "This invitation is invalid or has expired.",
            },
        ) from exc
    row = _command_row(
        db,
        """
        SELECT org_id, membership_id
          FROM erp_core_commands.accept_organization_invitation(
              :verified_auth_user_id, :verified_email, :display_name,
              :invitation_id, :inviting_org_id, :inviting_membership_id,
              :requested_role_id, :requested_scope_kind,
              :requested_branch_id, :token_digest, :issued_at, :expires_at
          )
        """,
        {
            "verified_auth_user_id": subject,
            "verified_email": email,
            "display_name": _identity_display_name(identity, email),
            "invitation_id": invitation_id,
            "inviting_org_id": inviting_org_id,
            "inviting_membership_id": inviting_membership_id,
            "requested_role_id": requested_role_id,
            "requested_scope_kind": requested_scope_kind,
            "requested_branch_id": requested_branch_id,
            "token_digest": hashlib.sha256(
                request.invitation_token.encode("utf-8")
            ).digest(),
            "issued_at": issued_at,
            "expires_at": expires_at,
        },
    )
    return OnboardingResult(
        organization_id=row["org_id"], membership_id=row["membership_id"]
    )


@router.post("/invitations", response_model=InvitationResult, status_code=201)
def create_invitation(
    request: CreateInvitationRequest,
    current_user: Dict[str, Any] = Depends(_invitation_manager),
    db: Session = Depends(get_db),
) -> InvitationResult:
    """Issue one signed invitation token; only its digest is persisted."""
    try:
        organization_id = UUID(str(current_user["org_id"]))
        auth_user_id = UUID(str(current_user["auth_user_id"]))
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid ERP identity context") from exc

    db.execute(
        text("SELECT erp_security.activate_context(:auth_user_id, :org_id)"),
        {"auth_user_id": auth_user_id, "org_id": organization_id},
    )
    membership_row = db.execute(
        text("SELECT erp_security.current_membership_id() AS membership_id")
    ).mappings().one()
    membership_id = membership_row["membership_id"]
    if membership_id is None:
        db.rollback()
        raise HTTPException(status_code=403, detail="Active ERP membership required")

    invitation_id = uuid4()
    token_id = uuid4()
    # JWT NumericDate claims have whole-second precision. Persist the same
    # values that acceptance will recover from the signed token so the
    # database claim hash is stable across issue and redemption.
    issued_at = datetime.now(timezone.utc).replace(microsecond=0)
    expires_at = issued_at + timedelta(hours=request.expires_in_hours)
    token = _encode_invitation_token(
        {
            "iss": INVITATION_TOKEN_ISSUER,
            "aud": INVITATION_TOKEN_AUDIENCE,
            "token_use": INVITATION_TOKEN_USE,
            "iat": issued_at,
            "exp": expires_at,
            "jti": str(token_id),
            "invitation_id": str(invitation_id),
            "organization_id": str(organization_id),
            "inviting_membership_id": str(membership_id),
            "requested_role_id": str(request.role_id),
            "requested_scope_kind": request.scope_kind,
            "requested_branch_id": (
                str(request.branch_id) if request.branch_id is not None else None
            ),
            "email": str(request.email),
        }
    )
    row = _command_row(
        db,
        """
        SELECT invitation_id, org_id, email, expires_at
          FROM erp_core_commands.create_organization_invitation(
              :invitation_id, :organization_id, :actor_membership_id, :target_email,
              :requested_role_id, :requested_scope_kind,
              :requested_branch_id, :token_digest, :issued_at, :expires_at
          )
        """,
        {
            "invitation_id": invitation_id,
            "organization_id": organization_id,
            "actor_membership_id": membership_id,
            "target_email": request.email,
            "requested_role_id": request.role_id,
            "requested_scope_kind": request.scope_kind,
            "requested_branch_id": request.branch_id,
            "token_digest": hashlib.sha256(token.encode("utf-8")).digest(),
            "issued_at": issued_at,
            "expires_at": expires_at,
        },
    )
    app_url = os.getenv("APP_URL", "http://localhost:3000").rstrip("/")
    return InvitationResult(
        invitation_id=row["invitation_id"],
        organization_id=row["org_id"],
        email=row["email"],
        expires_at=row["expires_at"],
        token=token,
        invitation_url=f"{app_url}/?invitation_token={quote(token)}",
    )


__all__ = ["router"]

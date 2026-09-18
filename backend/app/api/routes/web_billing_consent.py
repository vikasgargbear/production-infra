"""Explicit first-party billing consent; never grants a role or impersonates staff."""
from __future__ import annotations
from datetime import datetime, timezone
from decimal import Decimal
import logging
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security import HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security.permissions import PermissionChecker
from ...infrastructure.operator_actions.web_billing_consent import authorize_billing, revoke_billing

router = APIRouter(prefix="/web/billing-consent", tags=["Billing authorization"],
                   dependencies=[Security(HTTPBearer(auto_error=False))])
AUTH = Depends(PermissionChecker())
logger = logging.getLogger(__name__)


class BranchResponse(BaseModel):
    id: UUID
    name: str


class GrantResponse(BaseModel):
    id: UUID
    branch_id: UUID
    maximum_amount: str
    expires_at: datetime
    status: str
    row_version: int


class ConsentResponse(BaseModel):
    can_manage: bool
    branches: list[BranchResponse]
    grants: list[GrantResponse]
    grant_id: UUID | None = None


class ConsentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    branch_id: UUID
    maximum_amount: str = Field(pattern=r"^[0-9]{1,18}(\.[0-9]{1,2})?$")
    expires_at: datetime
    idempotency_key: str = Field(min_length=16, max_length=200)
    confirmed: StrictBool

    @field_validator("expires_at")
    @classmethod
    def aware_future(cls, value):
        if value.tzinfo is None or value.utcoffset() is None or value <= datetime.now(timezone.utc):
            raise ValueError("Select a timezone-aware future expiry")
        return value


class RevokeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_row_version: int = Field(gt=0)


def _context(db, user):
    org_id = UUID(str(user["org_id"]))
    db.execute(text("""SELECT erp_security.activate_context(:auth_user_id,:org_id),
        set_config('app.request_id',:request_id,true)"""),
        dict(auth_user_id=UUID(str(user["auth_user_id"])), org_id=org_id, request_id=str(uuid4())))
    return org_id


def _snapshot(db, org_id):
    can_manage = bool(db.execute(text("SELECT erp_security.has_permission('automation.agent_grant.manage',NULL::uuid)")).scalar())
    branches = [dict(r) for r in db.execute(text("""
        SELECT id,name FROM core.branches WHERE org_id=:org_id AND status='active'
        AND erp_security.can_access_branch(id) ORDER BY name,id
    """), dict(org_id=org_id)).mappings()]
    grants = [dict(r) for r in db.execute(text("""
        SELECT g.id,g.branch_id,g.expires_at,g.status,g.row_version,
               c.maximum_amount::text AS maximum_amount
        FROM automation.agent_grants g JOIN automation.agent_grant_capabilities c
          ON c.org_id=g.org_id AND c.agent_grant_id=g.id AND c.capability_code='sales.invoice.prepare'
        WHERE g.org_id=:org_id AND g.subject_membership_id=erp_security.current_membership_id()
          AND g.client_id='aasopharma-erp-web' AND g.consent_version='web-billing-admin-self-v1'
        ORDER BY g.created_at DESC LIMIT 20
    """), dict(org_id=org_id)).mappings()]
    return dict(can_manage=can_manage, branches=branches, grants=grants)


def _failure(error):
    code = getattr(error.orig, "pgcode", None)
    status = {"42501": 403, "23505": 409, "40001": 409, "22023": 422, "23514": 422}.get(code)
    if status is None:
        logger.error("Billing consent database failure sqlstate=%s", code)
        raise HTTPException(500, detail="Billing authorization is temporarily unavailable") from error
    raise HTTPException(status, detail="Billing consent was not changed. Check administrator permissions, existing consent, branch, amount and expiry.") from error


@router.get("", response_model=ConsentResponse)
def read_consent(user=AUTH, db: Session = Depends(get_db)):
    return _snapshot(db, _context(db, user))


@router.post("", response_model=ConsentResponse)
def create_consent(body: ConsentRequest, user=AUTH, db: Session = Depends(get_db)):
    if body.confirmed is not True or Decimal(body.maximum_amount) <= 0:
        raise HTTPException(422, "Review and confirm a positive invoice limit and expiry")
    try:
        org_id = _context(db, user)
        grant_id = authorize_billing(db, org_id=org_id, branch_id=body.branch_id,
            maximum_amount=Decimal(body.maximum_amount), expires_at=body.expires_at, key=body.idempotency_key)
        result = _snapshot(db, org_id)
        db.commit()
        return dict(grant_id=grant_id, **result)
    except DBAPIError as error:
        db.rollback()
        _failure(error)


@router.post("/{grant_id}/revoke", response_model=ConsentResponse)
def revoke_consent(grant_id: UUID, body: RevokeRequest, user=AUTH, db: Session = Depends(get_db)):
    try:
        org_id = _context(db, user)
        revoke_billing(db, org_id=org_id, grant_id=grant_id, row_version=body.expected_row_version)
        result = _snapshot(db, org_id)
        db.commit()
        return result
    except DBAPIError as error:
        db.rollback()
        _failure(error)

"""First GST registration setup for a canonical organization."""

from __future__ import annotations

from datetime import date
from typing import Literal, Optional
from uuid import UUID, uuid4, uuid5

from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security import HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security.permissions import ExactPermissionChecker
from ...infrastructure import canonical_write_commands


router = APIRouter(
    prefix="/canonical/company/gst-registration",
    tags=["Company GST Registration"],
    dependencies=[Security(HTTPBearer(auto_error=False))],
)
GST_MANAGER = Depends(ExactPermissionChecker("tax.registration.manage"))


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class EstablishGstRegistrationRequest(StrictModel):
    gstin: str = Field(
        min_length=15,
        max_length=15,
        pattern=r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$",
    )
    branch_id: Optional[UUID] = None
    effective_from: Optional[date] = None
    confirmed: Literal[True]
    idempotency_key: str = Field(
        min_length=8, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"
    )

    @field_validator("gstin", mode="before")
    @classmethod
    def normalize_gstin(cls, value):
        return value.strip().upper() if isinstance(value, str) else value


class GstRegistrationReadback(StrictModel):
    registration_id: UUID
    gstin: str
    status: Literal["active"]
    branch_id: UUID
    row_version: int = Field(gt=0)
    idempotency_replayed: bool


def _claim_uuid(user: dict, name: str) -> UUID:
    try:
        return UUID(str(user[name]))
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail=f"Invalid ERP {name} claim") from exc


def _activate(db: Session, user: dict) -> tuple[UUID, UUID]:
    org_id = _claim_uuid(user, "org_id")
    auth_user_id = _claim_uuid(user, "auth_user_id")
    db.execute(
        text(
            """
            SELECT erp_security.activate_context(:auth_user_id,:org_id),
                   pg_catalog.set_config('app.request_id',:request_id,true)
            """
        ),
        {"auth_user_id": auth_user_id, "org_id": org_id, "request_id": str(uuid4())},
    )
    membership_id = db.execute(
        text("SELECT erp_security.current_membership_id()")
    ).scalar_one()
    return org_id, UUID(str(membership_id))


@router.post("", response_model=GstRegistrationReadback, status_code=201)
def establish_gst_registration(
    request: EstablishGstRegistrationRequest,
    user: dict = GST_MANAGER,
    db: Session = Depends(get_db),
) -> GstRegistrationReadback:
    """Establish the first reviewed GSTIN and bind it to the principal branch."""

    org_id, actor_id = _activate(db, user)
    registration_id = uuid5(org_id, f"gst-registration:{request.idempotency_key}")
    try:
        result = canonical_write_commands.establish_gst_registration(
            db,
            org_id=org_id,
            actor_id=actor_id,
            registration_id=registration_id,
            gstin=request.gstin,
            branch_id=request.branch_id,
            effective_from=request.effective_from,
        )
        if result["idempotency_replayed"] and result["gstin"] != request.gstin:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail="An active GST registration already exists for this organization",
            )
        db.commit()
        return GstRegistrationReadback(**result)
    except HTTPException:
        raise
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except (IntegrityError, DBAPIError) as exc:
        db.rollback()
        sqlstate = getattr(exc.orig, "sqlstate", None) or getattr(exc.orig, "pgcode", None)
        status = 403 if sqlstate == "42501" else 409 if sqlstate in {"23505", "23P01"} else 422
        message = (
            "GST registration management is not authorized"
            if status == 403
            else "The GST registration conflicts with existing organization tax data"
            if status == 409
            else "The GST registration details are invalid"
        )
        raise HTTPException(status_code=status, detail=message) from exc

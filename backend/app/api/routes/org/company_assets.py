"""Canonical company asset reads and fail-closed mutation boundaries."""

from typing import Any, Dict
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security import HTTPBearer
from sqlalchemy import text
from sqlalchemy.orm import Session

from ....core.database import get_db
from ....core.security.permissions import PermissionChecker


router = APIRouter(
    tags=["Company"],
    dependencies=[Security(HTTPBearer(auto_error=False))],
)


def _activate(db: Session, user: Dict[str, Any]) -> UUID:
    """Activate the signed canonical actor before forced-RLS asset reads."""
    org_id = UUID(str(user["org_id"]))
    db.execute(
        text(
            """
            SELECT erp_security.activate_context(:auth_user_id, :org_id),
                   pg_catalog.set_config('app.request_id', :request_id, true)
            """
        ),
        {
            "auth_user_id": UUID(str(user["auth_user_id"])),
            "org_id": org_id,
            "request_id": str(uuid4()),
        },
    )
    return org_id


@router.get("/logo")
async def get_company_logo(
    user: dict = Depends(PermissionChecker("master", "view")),
    db: Session = Depends(get_db),
):
    """Read the current organization logo from canonical versioned settings."""
    org_id = _activate(db, user)
    row = db.execute(
        text(
            """
            SELECT value_text
              FROM core.settings
             WHERE org_id = :org_id
               AND scope_kind = 'organization'
               AND branch_id IS NULL
               AND namespace = 'company'
               AND key = 'company_logo'
               AND value_type = 'text'
               AND status = 'active'
             ORDER BY updated_at DESC, id DESC
             LIMIT 1
            """
        ),
        {"org_id": org_id},
    ).first()
    return {"success": True, "logo": row.value_text if row else None}


def _company_write_unavailable() -> None:
    raise HTTPException(
        status_code=503,
        detail=(
            "Canonical company-profile mutations are unavailable until the "
            "reviewed core command is connected"
        ),
    )


@router.put("/info")
@router.put("/settings")
@router.post("/logo")
@router.delete("/logo")
@router.post("/qr-code")
async def reject_company_mutation(
    _: dict = Depends(PermissionChecker("master", "edit")),
):
    """Reject legacy direct writes without reading or mutating request data."""
    _company_write_unavailable()

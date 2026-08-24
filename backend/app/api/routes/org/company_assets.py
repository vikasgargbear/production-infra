"""Canonical company asset reads and fail-closed mutation boundaries."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text

from ....core.auth.org_context import OrgContext, get_org_context
from ....core.auth.tenant_service import (
    TenantAwareSession,
    get_tenant_aware_db,
    with_tenant_context,
)
from ....core.security.permissions import PermissionChecker


router = APIRouter(tags=["Company"])


@router.get("/logo")
@with_tenant_context
async def get_company_logo(
    _: dict = Depends(PermissionChecker("master", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context),
):
    """Read the current organization logo from canonical versioned settings."""
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
        {"org_id": str(context.org_id)},
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
@with_tenant_context
async def reject_company_mutation(
    _: dict = Depends(PermissionChecker("master", "edit")),
    context: OrgContext = Depends(get_org_context),
):
    """Reject legacy direct writes without reading or mutating request data."""
    del context
    _company_write_unavailable()

"""Read-only, effective-dated statutory reference catalogs."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query, Security
from fastapi.security import HTTPBearer
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security.permissions import PermissionChecker


router = APIRouter(
    prefix="/canonical/reference",
    dependencies=[Security(HTTPBearer(auto_error=False))],
)

GSTJurisdictionUsage = Literal[
    "domestic_address", "gstin_registration", "place_of_supply"
]


class CanonicalGSTJurisdiction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    display_name: str
    jurisdiction_kind: Literal["state", "union_territory", "special"]
    effective_from: date
    effective_to: Optional[date]
    source_authority: str
    authority_catalog_uri: str
    source_uri: str
    source_publication_date: date
    source_retrieved_at: datetime
    source_document_sha256: str
    dataset_sha256: str
    source_record_sha256: str


@router.get("/gst-jurisdictions", response_model=list[CanonicalGSTJurisdiction])
def canonical_gst_jurisdictions(
    usage: GSTJurisdictionUsage,
    effective_on: Annotated[Optional[date], Query()] = None,
    user: dict = Depends(PermissionChecker()),
    db: Session = Depends(get_db),
) -> list[CanonicalGSTJurisdiction]:
    """Return only effective codes permitted for the requested business use.

    If the caller omits a date, PostgreSQL derives the active organization's
    business date from its canonical timezone.  The API never owns a state map.
    """

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
    rows = db.execute(
        text("""
            WITH business_clock AS (
              SELECT COALESCE(
                CAST(:effective_on AS date),
                (transaction_timestamp() AT TIME ZONE organization.timezone)::date
              ) AS effective_on
                FROM core.organizations organization
               WHERE organization.id=:org_id AND organization.status='active'
            )
            SELECT version.jurisdiction_code::text AS code,
                   version.display_name,
                   version.jurisdiction_kind,
                   version.effective_from,
                   version.effective_to,
                   release.source_authority,
                   release.authority_catalog_uri,
                   release.source_uri,
                   release.source_publication_date,
                   release.source_retrieved_at,
                   pg_catalog.encode(release.source_document_sha256,'hex') AS source_document_sha256,
                   pg_catalog.encode(release.dataset_sha256,'hex') AS dataset_sha256,
                   pg_catalog.encode(version.source_record_sha256,'hex') AS source_record_sha256
              FROM tax.gst_jurisdiction_versions version
              JOIN tax.gst_jurisdiction_releases release ON release.id=version.release_id
              CROSS JOIN business_clock
             WHERE version.status='active' AND release.status='active'
               AND version.effective_from<=business_clock.effective_on
               AND (version.effective_to IS NULL OR version.effective_to>=business_clock.effective_on)
               AND CASE CAST(:usage AS text)
                 WHEN 'domestic_address' THEN version.supports_domestic_address
                 WHEN 'gstin_registration' THEN version.supports_gstin_registration
                 WHEN 'place_of_supply' THEN version.supports_place_of_supply
                 ELSE false END
             ORDER BY version.jurisdiction_code
        """),
        {"org_id": org_id, "effective_on": effective_on, "usage": usage},
    ).mappings()
    return [CanonicalGSTJurisdiction.model_validate(dict(row)) for row in rows]

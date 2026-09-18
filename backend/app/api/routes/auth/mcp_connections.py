"""Explicit self-consent selectors for existing reviewed MCP grants.

These endpoints never create a grant or update Supabase user metadata.
"""
from typing import Any
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ....core.auth.session_authority import require_canonical_session_authority
from ....core.auth.supabase_auth import supabase_auth
from ....core.database import get_db

router = APIRouter(prefix="/mcp/connections")
bearer = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)


class ConnectionConsent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    organization_id: UUID
    agent_grant_id: UUID
    client_id: str = Field(min_length=1, max_length=255)
    proposal_fingerprint: str = Field(pattern=r"^[0-9a-f]{64}$")


async def _subject(credentials: HTTPAuthorizationCredentials | None) -> UUID:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Sign in to review ERP connections")
    identity = await supabase_auth.get_user_from_access_token(credentials.credentials)
    if not identity.get("email_confirmed_at"):
        raise HTTPException(status_code=403, detail="Verified email is required")
    try:
        return UUID(str(identity["id"]))
    except (KeyError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=401, detail="Invalid signed-in identity") from exc


def _clients() -> set[str]:
    # Same pre-registered clients as the existing OAuth consent boundary.
    from .oauth import _configured_mcp_client_ids
    return set(_configured_mcp_client_ids())


@router.get("")
async def list_connection_proposals(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    subject = await _subject(credentials)
    require_canonical_session_authority(db)
    rows = db.execute(
        text("SELECT erp_core_commands.mcp_connection_proposals(:subject)"),
        {"subject": subject},
    ).scalar_one()
    clients = _clients()
    return [row for row in rows if row["client_id"] in clients]


@router.post("")
async def confirm_connection(
    request: ConnectionConsent,
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    subject = await _subject(credentials)
    if request.client_id not in _clients():
        raise HTTPException(status_code=403, detail="This connection client is not registered")
    require_canonical_session_authority(db)
    try:
        result = db.execute(
            text("SELECT erp_core_commands.confirm_mcp_connection("
                 ":subject, :organization, :client, :grant, :fingerprint)"),
            {"subject": subject, "organization": request.organization_id,
             "client": request.client_id, "grant": request.agent_grant_id,
             "fingerprint": request.proposal_fingerprint},
        ).scalar_one()
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        code = getattr(getattr(exc, "orig", None), "pgcode", None)
        if code not in {"42501", "40001", "23514", "22023"}:
            logger.error("MCP connection consent database operation failed", exc_info=False)
            raise HTTPException(status_code=503, detail="Connection review is temporarily unavailable.") from None
        raise HTTPException(
            status_code=409,
            detail="The reviewed connection changed or is unavailable. Review it again.",
        ) from None
    return result

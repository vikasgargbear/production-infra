"""Revalidate an explicit connection selector; it conveys no permissions."""
from typing import Literal
from uuid import UUID

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import text
from sqlalchemy.orm import Session


class ConnectionReceipt(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal["erp_mcp_connection_v1"]
    receipt_id: UUID
    organization_id: UUID
    agent_grant_id: UUID
    consent_version: str = Field(min_length=1, max_length=32)
    proposal_fingerprint: str = Field(pattern=r"^[0-9a-f]{64}$")


def require_connection_receipt(db: Session, subject: UUID, client_id: str,
                               organization_id: UUID, supplied: object,
                               agent_grant_id: UUID | None = None) -> ConnectionReceipt:
    def denied():
        return HTTPException(status_code=403, detail={
            "error": "organization_reconsent_required",
            "message": "Review and confirm your ERP organization connection, then reconnect the app.",
        })
    try:
        receipt = ConnectionReceipt.model_validate(supplied)
    except ValidationError:
        raise denied() from None
    if receipt.organization_id != organization_id or (
        agent_grant_id is not None and receipt.agent_grant_id != agent_grant_id
    ):
        raise denied()
    db.execute(text("SELECT erp_security.activate_context(:subject,:organization)"),
               {"subject": subject, "organization": organization_id})
    matches = db.execute(text("SELECT erp_core_commands.mcp_connection_receipt_matches("
        ":subject,:client,CAST(:receipt AS jsonb))"),
        {"subject": subject, "client": client_id, "receipt": receipt.model_dump_json()}).scalar_one()
    if matches is not True:
        raise denied()
    return receipt

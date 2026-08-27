"""Canonical deployment authority gates for public and provisioning sessions."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session


SESSION_AUTHORITY_ROLE = "erp_session_authority"
MAINTENANCE_DETAIL = {
    "error": "erp_maintenance",
    "message": "ERP is temporarily unavailable while canonical authority is being prepared.",
}


@dataclass(frozen=True)
class AuthorityState:
    principal_is_runtime: bool
    command_authority: bool
    session_role_exists: bool
    session_authority: bool


def _authority_state(db: Session) -> AuthorityState:
    """Read one fail-closed authority snapshot without assuming 0032 exists.

    ``to_regrole`` makes a pre-0032 or interrupted migration resolve to no
    session authority instead of turning an intentional maintenance state into
    an undefined-role database error.
    """

    row = db.execute(
        text(
            """
            SELECT current_user='erp_runtime' AS principal_is_runtime,
                   pg_catalog.pg_has_role(
                       current_user,
                       'erp_app',
                       'USAGE'
                   ) AS command_authority,
                   pg_catalog.to_regrole('erp_session_authority') IS NOT NULL
                     AS session_role_exists,
                   CASE
                     WHEN pg_catalog.to_regrole('erp_session_authority') IS NULL
                       THEN false
                     ELSE pg_catalog.pg_has_role(
                       current_user,
                       pg_catalog.to_regrole('erp_session_authority'),
                       'USAGE'
                     )
                   END AS session_authority
            """
        )
    ).mappings().one()
    return AuthorityState(
        principal_is_runtime=bool(row["principal_is_runtime"]),
        command_authority=bool(row["command_authority"]),
        session_role_exists=bool(row["session_role_exists"]),
        session_authority=bool(row["session_authority"]),
    )


def canonical_session_authority_available(db: Session) -> bool:
    """Return true only for the exact public runtime principal in open state."""

    authority = _authority_state(db)
    return (
        authority.principal_is_runtime
        and authority.command_authority
        and authority.session_role_exists
        and authority.session_authority
    )


def canonical_provisioning_authority_available(db: Session) -> bool:
    """Return true only for runtime command access while public sessions are shut."""

    authority = _authority_state(db)
    return (
        authority.principal_is_runtime
        and authority.command_authority
        and authority.session_role_exists
        and not authority.session_authority
    )


def _maintenance() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=MAINTENANCE_DETAIL,
        headers={"Retry-After": "15"},
    )


def require_canonical_session_authority(db: Session) -> None:
    if not canonical_session_authority_available(db):
        raise _maintenance()


def require_canonical_provisioning_authority(db: Session) -> None:
    if not canonical_provisioning_authority_available(db):
        raise _maintenance()


__all__ = [
    "AuthorityState",
    "MAINTENANCE_DETAIL",
    "SESSION_AUTHORITY_ROLE",
    "canonical_provisioning_authority_available",
    "canonical_session_authority_available",
    "require_canonical_provisioning_authority",
    "require_canonical_session_authority",
]

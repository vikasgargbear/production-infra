"""Fail-closed proof for the ordinary canonical command database principal."""

from __future__ import annotations

import os
import re
from typing import Any
from urllib.parse import unquote, urlparse

from sqlalchemy import text

from ...core.database import validate_direct_database_peer
from ...domain.operator_actions.models import (
    ActionErrorCode,
    OperatorActionError,
)


RUNTIME_DATABASE_URL_ENV = "DATABASE_URL"
PROJECT_REF_RE = re.compile(r"^[a-z0-9]{20}$")

VERIFY_RUNTIME_PRINCIPAL_SQL = text(
    """
    SELECT role.rolname AS role_name, role.rolsuper, role.rolbypassrls
      FROM pg_catalog.pg_roles AS role
     WHERE role.rolname=CURRENT_USER
       AND role.rolname='erp_runtime'
       AND NOT role.rolsuper
       AND NOT role.rolbypassrls
    """
)


def runtime_database_configured() -> bool:
    value = os.getenv(RUNTIME_DATABASE_URL_ENV, "").strip()
    if not value or "[YOUR-" in value:
        return False
    try:
        parsed = urlparse(value)
    except ValueError:
        return False
    transport_requirement = os.getenv(
        "DATABASE_TRANSPORT_REQUIREMENT", ""
    ).strip()
    if transport_requirement:
        try:
            validate_direct_database_peer(
                value,
                value,
                "erp_runtime",
                transport_requirement,
            )
        except RuntimeError:
            return False
        return True
    username = unquote(parsed.username or "")
    direct = username == "erp_runtime"
    pooler_prefix, separator, project_ref = username.partition(".")
    pooler = (
        separator == "."
        and pooler_prefix == "erp_runtime"
        and PROJECT_REF_RE.fullmatch(project_ref) is not None
        and (parsed.hostname or "").endswith(".pooler.supabase.com")
    )
    return (
        parsed.scheme in {"postgres", "postgresql", "postgresql+psycopg2"}
        and (direct or pooler)
        and bool(parsed.hostname)
        and bool(parsed.path.strip("/"))
    )


def assert_runtime_principal(session: Any) -> None:
    rows = list(session.execute(VERIFY_RUNTIME_PRINCIPAL_SQL).mappings().all())
    if len(rows) != 1:
        raise OperatorActionError(
            ActionErrorCode.POLICY_BLOCKED,
            "Canonical runtime database principal is not isolated",
            metadata={"reason": "RUNTIME_DATABASE_PRINCIPAL_INVALID"},
        )
    row = rows[0]
    if (
        row["role_name"] != "erp_runtime"
        or bool(row["rolsuper"])
        or bool(row["rolbypassrls"])
    ):
        raise OperatorActionError(
            ActionErrorCode.POLICY_BLOCKED,
            "Canonical runtime database principal is not isolated",
            metadata={"reason": "RUNTIME_DATABASE_PRINCIPAL_INVALID"},
        )


__all__ = [
    "RUNTIME_DATABASE_URL_ENV",
    "VERIFY_RUNTIME_PRINCIPAL_SQL",
    "assert_runtime_principal",
    "runtime_database_configured",
]

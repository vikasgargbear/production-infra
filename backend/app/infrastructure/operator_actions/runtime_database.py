"""Fail-closed proof for the ordinary canonical command database principal."""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import text

from ...domain.operator_actions.models import (
    ActionErrorCode,
    OperatorActionError,
)


RUNTIME_DATABASE_URL_ENV = "DATABASE_URL"

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
        return urlparse(value).username == "erp_runtime"
    except ValueError:
        return False


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

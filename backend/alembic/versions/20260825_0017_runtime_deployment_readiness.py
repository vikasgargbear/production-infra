"""Expose the exact canonical Alembic revision to the isolated runtime role.

Revision ID: 20260825_0017
Revises: 20260825_0016
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260825_0017"
down_revision = "20260825_0016"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260825_0017_runtime_deployment_readiness.sql"
)
EXPECTED_SQL_SHA256 = "6542ab002362f882b92f5b29cd6644f4e40aacbf0fafd8ccc752aa515a0213f0"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "runtime deployment-readiness migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "runtime deployment-readiness migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "runtime deployment-readiness downgrade is intentionally unavailable"
    )

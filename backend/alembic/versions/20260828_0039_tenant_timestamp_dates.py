"""Interpret timestamp-derived business dates in the tenant timezone.

Revision ID: 20260828_0039
Revises: 20260828_0038
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260828_0039"
down_revision = "20260828_0038"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260828_0039_tenant_timestamp_dates.sql"
)
EXPECTED_SQL_SHA256 = "16b9ce94dafca97338b8f8f0458dfd7a1b22454d2dcb172cefb785896fef4a36"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "tenant timestamp-date migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "tenant timestamp-date migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "tenant timestamp-date downgrade is intentionally unavailable"
    )

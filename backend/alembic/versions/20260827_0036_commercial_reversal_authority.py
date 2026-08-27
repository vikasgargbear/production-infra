"""Add explicit compensating commercial reversal commands.

Revision ID: 20260827_0036
Revises: 20260827_0035
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260827_0036"
down_revision = "20260827_0035"
branch_labels = None
depends_on = None
SQL_PATH = Path(__file__).resolve().parents[1] / "sql" / "20260827_0036_commercial_reversal_authority.sql"
EXPECTED_SQL_SHA256 = "d29b395b0b8b6c6567c331b9727d6911e563a8493e2ea72258eb3d9898d8bd0a"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError("commercial reversal migration source hash mismatch")
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "commercial reversal migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "commercial reversal migration downgrade is intentionally unavailable"
    )

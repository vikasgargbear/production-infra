"""Add database-owned tenant master-code creation commands.

Revision ID: 20260826_0027
Revises: 20260826_0026
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260826_0027"
down_revision = "20260826_0026"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260826_0027_master_code_commands.sql"
)
EXPECTED_SQL_SHA256 = "6c124371fdf68550c33ea0eb348b341b687e006f59650258d1f606e580543a2d"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError("master-code command migration source hash mismatch")
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "master-code command migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "master-code command downgrade is intentionally unavailable"
    )

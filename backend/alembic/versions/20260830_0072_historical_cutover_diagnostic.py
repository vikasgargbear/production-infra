"""Add an organization-scoped historical cutover diagnostic.

Revision ID: 20260830_0072
Revises: 20260830_0071
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260830_0072"
down_revision = "20260830_0071"
branch_labels = None
depends_on = None

SQL_PATH = Path(__file__).resolve().parents[1] / "sql" / "20260830_0072_historical_cutover_diagnostic.sql"
EXPECTED_SQL_SHA256 = "db45acf7ea1c2a948715cc9406500efa93bd9c560e97ec4360e0adc4143c5412"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "historical cutover diagnostic migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "historical cutover diagnostic migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "historical cutover diagnostic migration downgrade is intentionally unavailable"
    )

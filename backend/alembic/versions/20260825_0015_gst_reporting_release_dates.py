"""Align governed GST reporting releases with retrospective rule history.

Revision ID: 20260825_0015
Revises: 20260825_0014
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260825_0015"
down_revision = "20260825_0014"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260825_0015_gst_reporting_release_dates.sql"
)
EXPECTED_SQL_SHA256 = "03436f4798848aa8a1d24b67447e4204889079a1cae2507ff11976fd23adc927"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "GST reporting release-date migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "GST reporting release-date migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "GST reporting release-date downgrade is intentionally unavailable"
    )

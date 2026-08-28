"""Add governed GSTR-1 reporting-rule release importer.

Revision ID: 20260825_0004
Revises: 20260825_0003
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260825_0004"
down_revision = "20260825_0003"
branch_labels = None
depends_on = None

SQL_PATH = Path(__file__).resolve().parents[1] / "sql" / "20260825_0004_gst_reporting_rules_importer.sql"
EXPECTED_SQL_SHA256 = "b71051c388208047cd9c3b2d7c86eceec903151c7bd6c0bb6817d8872983ee82"


def _reviewed_sql() -> str:
    try:
        sql = SQL_PATH.read_text(encoding="utf-8")
    except OSError as exc:
        raise CanonicalBaselineError(f"cannot read GST reporting importer migration: {exc}") from exc
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError("GST reporting importer migration source hash mismatch")
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError("GST reporting importer migration requires an online reviewed principal")
    connection = op.get_bind()
    cursor = connection.connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError("GST reporting importer downgrade is intentionally unavailable")

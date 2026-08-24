"""Add reviewed date-effective GSTR-1 reporting rules.

Revision ID: 20260825_0003
Revises: 20260824_0002
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260825_0003"
down_revision = "20260824_0002"
branch_labels = None
depends_on = None

SQL_PATH = Path(__file__).resolve().parents[1] / "sql" / "20260825_0003_gst_reporting_rules.sql"
EXPECTED_SQL_SHA256 = "2c0f3c31538f1853679473f648758b117e9fcfd8708b9fd8d62cbcd3aec01a21"


def _reviewed_sql() -> str:
    try:
        sql = SQL_PATH.read_text(encoding="utf-8")
    except OSError as exc:
        raise CanonicalBaselineError(f"cannot read GST reporting rules migration: {exc}") from exc
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError("GST reporting rules migration source hash mismatch")
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError("GST reporting rules migration requires an online reviewed principal")
    connection = op.get_bind()
    cursor = connection.connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError("GST reporting rules downgrade is intentionally unavailable")

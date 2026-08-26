"""Add bounded canonical standalone adjustment-note commands.

Revision ID: 20260825_0007
Revises: 20260825_0006
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260825_0007"
down_revision = "20260825_0006"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260825_0007_adjustment_note_command.sql"
)
EXPECTED_SQL_SHA256 = "53f35693306480d2c3c13d8cd34b446e45def4c1d66fe519dfd2420f00b31a8d"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError("adjustment-note migration source hash mismatch")
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "adjustment-note migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "adjustment-note command downgrade is intentionally unavailable"
    )

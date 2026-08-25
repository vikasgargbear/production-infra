"""Bind adjustment notes to exact original invoice policy.

Revision ID: 20260825_0014
Revises: 20260825_0013
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260825_0014"
down_revision = "20260825_0013"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260825_0014_adjustment_note_source_authority.sql"
)
EXPECTED_SQL_SHA256 = "407c9932b0f462e28c19f7c6c696bb9a6df2d708cdd8e3130c440068a4bf6614"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "adjustment-note source-authority migration hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "adjustment-note source authority requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "adjustment-note source-authority downgrade is intentionally unavailable"
    )

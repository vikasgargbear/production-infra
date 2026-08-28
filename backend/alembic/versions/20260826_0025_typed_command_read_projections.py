"""Add typed least-privilege command read projections.

Revision ID: 20260826_0025
Revises: 20260826_0024
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260826_0025"
down_revision = "20260826_0024"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260826_0025_typed_command_read_projections.sql"
)
EXPECTED_SQL_SHA256 = "046664cc77a66379ba67db59b47a809ce5738181932ed21fbaa5c47269d397c0"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "typed command-read projection migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "typed command-read projection migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "typed command-read projection downgrade is intentionally unavailable"
    )

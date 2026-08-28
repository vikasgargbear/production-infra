"""Add canonical customer and supplier account update commands.

Revision ID: 20260828_0050
Revises: 20260828_0049
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260828_0050"
down_revision = "20260828_0049"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260828_0050_canonical_party_account_updates.sql"
)
EXPECTED_SQL_SHA256 = "23002fb2a605ec421bf4dce9b1be2b644210f5d2979f9ef45bb1d61616b36adb"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "canonical party-account update migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "canonical party-account update migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "canonical party-account update downgrade is intentionally unavailable"
    )

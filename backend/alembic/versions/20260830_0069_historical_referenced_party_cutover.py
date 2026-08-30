"""Bind parties from retained opening items during historical cutover.

Revision ID: 20260830_0069
Revises: 20260830_0068
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260830_0069"
down_revision = "20260830_0068"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260830_0069_historical_referenced_party_cutover.sql"
)
EXPECTED_SQL_SHA256 = "abcd7c28a0e8cc57411bd8df544994545e5a4b32b658df691fdfb8f5f6eba8b4"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "historical referenced-party cutover migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "historical referenced-party cutover requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "historical referenced-party cutover downgrade is intentionally unavailable"
    )

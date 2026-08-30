"""Add immutable, non-posting historical migration facts and insight reads.

Revision ID: 20260830_0065
Revises: 20260829_0064
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260830_0065"
down_revision = "20260829_0064"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260830_0065_historical_migration_facts.sql"
)
EXPECTED_SQL_SHA256 = "6727c6755555968b2b0f164c08eb73c859b95c7a197104f9e6e5b1d312c86194"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "historical migration-facts migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "historical migration-facts migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "historical migration-facts migration downgrade is intentionally unavailable"
    )

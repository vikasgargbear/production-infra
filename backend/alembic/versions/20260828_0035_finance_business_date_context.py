"""Make finance business-date resolvers self-contained.

Revision ID: 20260828_0035
Revises: 20260828_0034
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260828_0035"
down_revision = "20260828_0034"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260828_0035_finance_business_date_context.sql"
)
EXPECTED_SQL_SHA256 = "2cfe5d0451845be1edda326fd3c8af543266c15557a2f748a437bd3a0b3a1e47"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "finance business-date context migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "finance business-date context migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "finance business-date context migration downgrade is intentionally unavailable"
    )

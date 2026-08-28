"""Keep customer advances branch-bound and replacement-safe after cheque bounce.

Revision ID: 20260828_0046
Revises: 20260828_0045
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260828_0046"
down_revision = "20260828_0045"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260828_0046_customer_advance_bounce_integrity.sql"
)
EXPECTED_SQL_SHA256 = "565acdb691f6beda270f12703e62dd895b4f81e16ab1903cc6b65d3d7f436da0"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "customer-advance bounce-integrity migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "customer-advance bounce-integrity migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "customer-advance bounce-integrity downgrade is intentionally unavailable"
    )

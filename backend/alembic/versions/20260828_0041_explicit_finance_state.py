"""Move finance lifecycle transitions into named canonical commands.

Revision ID: 20260828_0041
Revises: 20260828_0040
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260828_0041"
down_revision = "20260828_0040"
branch_labels = None
depends_on = None

SQL_PATH = Path(__file__).resolve().parents[1] / "sql" / "20260828_0041_explicit_finance_state.sql"
EXPECTED_SQL_SHA256 = "7e57be833e5a90204b23f0bce0cd6be5462bd9955197da0dd7bbeb3cf073db54"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError("explicit finance-state migration source hash mismatch")
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "explicit finance-state migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "explicit finance-state migration downgrade is intentionally unavailable"
    )

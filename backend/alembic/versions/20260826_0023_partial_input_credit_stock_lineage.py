"""Track the eligible ITC subset of fungible batch stock.

Revision ID: 20260826_0023
Revises: 20260825_0022
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260826_0023"
down_revision = "20260825_0022"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260826_0023_partial_input_credit_stock_lineage.sql"
)
EXPECTED_SQL_SHA256 = "73028b4a6a206f49fdebdb605dc70d18151acb20f2df0394c1ebc8e791e5b62d"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "partial input-credit stock-lineage migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "partial input-credit stock-lineage migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "partial input-credit stock-lineage downgrade is intentionally unavailable"
    )

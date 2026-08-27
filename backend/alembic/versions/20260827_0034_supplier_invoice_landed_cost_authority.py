"""Add reviewed supplier-invoice landed-cost and price-variance authority.

Revision ID: 20260827_0034
Revises: 20260827_0033
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260827_0034"
down_revision = "20260827_0033"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260827_0034_supplier_invoice_landed_cost_authority.sql"
)
EXPECTED_SQL_SHA256 = "d03cb7918165c6cd21ddb616b5e715ed358c1ffd8922ec17d16b66560b83f1c0"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "supplier-invoice landed-cost migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "supplier-invoice landed-cost migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "supplier-invoice landed-cost migration downgrade is intentionally unavailable"
    )

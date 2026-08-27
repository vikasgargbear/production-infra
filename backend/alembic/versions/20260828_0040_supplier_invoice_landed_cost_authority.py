"""Add reviewed supplier-invoice landed-cost and price-variance authority.

Revision ID: 20260828_0040
Revises: 20260828_0039
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260828_0040"
down_revision = "20260828_0039"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260828_0040_supplier_invoice_landed_cost_authority.sql"
)
EXPECTED_SQL_SHA256 = "5d2eab3f2bc452f363c7048a046783164aa9ac7db7963583e69d343a4edc1b87"


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

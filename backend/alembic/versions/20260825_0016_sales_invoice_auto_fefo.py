"""Add governed automatic FEFO allocation to canonical sales invoices.

Revision ID: 20260825_0016
Revises: 20260825_0015
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260825_0016"
down_revision = "20260825_0015"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260825_0016_sales_invoice_auto_fefo.sql"
)
EXPECTED_SQL_SHA256 = "77e98201458363668968d59de9b188c600b4e00f7c3764b4ff0d2ef050aec776"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "sales-invoice auto-FEFO migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "sales-invoice auto-FEFO migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "sales-invoice auto-FEFO downgrade is intentionally unavailable"
    )

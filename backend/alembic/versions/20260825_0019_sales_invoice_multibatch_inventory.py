"""Reconcile direct-invoice batch issue lines in aggregate.

Revision ID: 20260825_0019
Revises: 20260825_0018
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260825_0019"
down_revision = "20260825_0018"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260825_0019_sales_invoice_multibatch_inventory.sql"
)
EXPECTED_SQL_SHA256 = "77b4ee753edf49db9af22e464902fd5067e5a17103c95524fda4d07bd2731670"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "sales-invoice multi-batch inventory migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "sales-invoice multi-batch inventory migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "sales-invoice multi-batch inventory downgrade is intentionally unavailable"
    )

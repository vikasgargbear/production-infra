"""Disambiguate the sales-invoice FEFO UOM source.

Revision ID: 20260825_0018
Revises: 20260825_0017
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260825_0018"
down_revision = "20260825_0017"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260825_0018_sales_invoice_fefo_uom_alias.sql"
)
EXPECTED_SQL_SHA256 = "18f6b1dc348a6ebd7a4bce621f173fbd4057fa0e3f69b09f1a39b974d2cc6932"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "sales-invoice FEFO UOM migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "sales-invoice FEFO UOM migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "sales-invoice FEFO UOM downgrade is intentionally unavailable"
    )

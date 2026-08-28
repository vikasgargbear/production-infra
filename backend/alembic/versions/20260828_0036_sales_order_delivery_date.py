"""Persist the reviewed sales-order requested delivery date.

Revision ID: 20260828_0036
Revises: 20260828_0035
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260828_0036"
down_revision = "20260828_0035"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260828_0036_sales_order_delivery_date.sql"
)
EXPECTED_SQL_SHA256 = "5d8ac223b46ac44e012b0b9a2f3ca8b3787e0ffb8781792e74aedcc9d70f45f1"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "sales-order delivery-date migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "sales-order delivery-date migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "sales-order delivery-date migration downgrade is intentionally unavailable"
    )

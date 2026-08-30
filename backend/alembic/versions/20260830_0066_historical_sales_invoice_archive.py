"""Expose the non-posting historical sales-invoice archive.

Revision ID: 20260830_0066
Revises: 20260830_0065
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260830_0066"
down_revision = "20260830_0065"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260830_0066_historical_sales_invoice_archive.sql"
)
EXPECTED_SQL_SHA256 = "2dd98bc0d039a4a5630c36f9b8e436bc1489fca9fdafd3ddb34208c912b3ccd7"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "historical sales-invoice archive migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "historical sales-invoice archive migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "historical sales-invoice archive downgrade is intentionally unavailable"
    )

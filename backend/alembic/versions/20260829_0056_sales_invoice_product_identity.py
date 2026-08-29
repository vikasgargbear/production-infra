"""Add the typed sales-invoice product-identity projection.

Revision ID: 20260829_0056
Revises: 20260829_0055
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260829_0056"
down_revision = "20260829_0055"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260829_0056_sales_invoice_product_identity.sql"
)
EXPECTED_SQL_SHA256 = "3fa08cf509ddd5a93f4470616251c1da92b9ecabe541641b3b8812d47033fbdc"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "sales-invoice product-identity migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "sales-invoice product-identity migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "sales-invoice product-identity downgrade is intentionally unavailable"
    )

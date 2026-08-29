"""Expose canonical manufacturer identity on posted sales-invoice lines.

Revision ID: 20260829_0063
Revises: 20260829_0062
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260829_0063"
down_revision = "20260829_0062"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260829_0063_sales_invoice_manufacturer_identity.sql"
)
EXPECTED_SQL_SHA256 = "4428d154f691c418d39a88abb8529b97ecc6226e4b81d1a04d22c1835c7b72a6"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "sales invoice manufacturer-identity migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "sales invoice manufacturer-identity migration requires an online "
            "reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "sales invoice manufacturer-identity downgrade is intentionally unavailable"
    )

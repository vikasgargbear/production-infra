"""Trace supplier-invoice landed cost through exact stock-transfer lineage.

Revision ID: 20260828_0045
Revises: 20260828_0044
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260828_0045"
down_revision = "20260828_0044"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260828_0045_supplier_invoice_transfer_lineage.sql"
)
EXPECTED_SQL_SHA256 = "cc1404c4999b0ea378eb9efeac684212d0eae721024d30014d147cf5452e1104"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "supplier-invoice transfer-lineage migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "supplier-invoice transfer-lineage migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "supplier-invoice transfer-lineage downgrade is intentionally unavailable"
    )

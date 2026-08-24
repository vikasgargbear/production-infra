"""Permit any eligible lot in the earliest sales-invoice expiry tier.

Revision ID: 20260824_0002
Revises: 20260820_0001
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260824_0002"
down_revision = "20260820_0001"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260824_0002_sales_invoice_fefo_expiry_equivalence.sql"
)
EXPECTED_SQL_SHA256 = (
    "a81a2ab94ceacbd1ba34211af6ac49f85310c86a1cd75da2a80bb0ffd95f6785"
)


def _reviewed_sql() -> str:
    try:
        sql = SQL_PATH.read_text(encoding="utf-8")
    except OSError as exc:
        raise CanonicalBaselineError(
            f"cannot read sales-invoice FEFO migration: {exc}"
        ) from exc
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "sales-invoice FEFO migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "sales-invoice FEFO migration requires an online reviewed principal"
        )
    connection = op.get_bind()
    cursor = connection.connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "sales-invoice FEFO equivalence downgrade is intentionally unavailable"
    )

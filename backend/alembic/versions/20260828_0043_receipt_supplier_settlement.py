"""Add cash, cheque, advance and supplier settlement authority.

Revision ID: 20260828_0043
Revises: 20260828_0042
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260828_0043"
down_revision = "20260828_0042"
branch_labels = None
depends_on = None
SQL_PATH = Path(__file__).resolve().parents[1] / "sql" / "20260828_0043_receipt_supplier_settlement.sql"
EXPECTED_SQL_SHA256 = "bbee66450d491358d484d37a210a382cba5d42291832eeb3da86ffd2c2e68017"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError("receipt settlement migration source hash mismatch")
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "receipt settlement migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "receipt settlement migration downgrade is intentionally unavailable"
    )

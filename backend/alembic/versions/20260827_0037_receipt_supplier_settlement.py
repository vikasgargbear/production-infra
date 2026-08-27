"""Add cash, cheque, advance and supplier settlement authority.

Revision ID: 20260827_0037
Revises: 20260827_0036
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260827_0037"
down_revision = "20260827_0036"
branch_labels = None
depends_on = None
SQL_PATH = Path(__file__).resolve().parents[1] / "sql" / "20260827_0037_receipt_supplier_settlement.sql"
EXPECTED_SQL_SHA256 = "85c05528b1c6b12cdac35497033e04bcae9b371308e3fcee1443327149437681"


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

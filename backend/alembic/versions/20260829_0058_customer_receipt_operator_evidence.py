"""Add immutable customer-receipt evidence lifecycle functions.

Revision ID: 20260829_0058
Revises: 20260829_0057
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260829_0058"
down_revision = "20260829_0057"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260829_0058_customer_receipt_operator_evidence.sql"
)
EXPECTED_SQL_SHA256 = "86d7185e31993ce746b56e14957ffc48a2d64d5a377272ea0a47858cdaffaf9c"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "customer-receipt evidence migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "customer-receipt evidence migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "customer-receipt evidence downgrade is intentionally unavailable"
    )

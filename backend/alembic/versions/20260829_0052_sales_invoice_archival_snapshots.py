"""Archive canonical sales-invoice address and regulatory display evidence.

Revision ID: 20260829_0052
Revises: 20260829_0051
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260829_0052"
down_revision = "20260829_0051"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260829_0052_sales_invoice_archival_snapshots.sql"
)
EXPECTED_SQL_SHA256 = "9b91f65da1b207088e2ba55535dc67581f1a3250a3a963b44e72e083dac4ec4f"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "sales-invoice archival-snapshot migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "sales-invoice archival-snapshot migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "sales-invoice archival-snapshot downgrade is intentionally unavailable"
    )

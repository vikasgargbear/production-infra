"""Install the canonical evidence-storage Supabase Auth hook.

Revision ID: 20260826_0029
Revises: 20260826_0028
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260826_0029"
down_revision = "20260826_0028"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260826_0029_evidence_storage_auth_hook.sql"
)
EXPECTED_SQL_SHA256 = "7eae23df36166ef008f428f105a6e8fa8e9e534a02745c545efb2ab7083d9ac4"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "evidence-storage Auth hook migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "evidence-storage Auth hook requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "evidence-storage Auth hook downgrade is intentionally unavailable"
    )

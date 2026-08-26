"""Force tenant RLS on canonical input-credit lineage.

Revision ID: 20260826_0024
Revises: 20260826_0023
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260826_0024"
down_revision = "20260826_0023"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260826_0024_force_input_credit_rls.sql"
)
EXPECTED_SQL_SHA256 = "32f8428d7bd36323d749274dba41fdfad6799fb6cdf010eb5add868638c82d9e"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "input-credit FORCE RLS migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "input-credit FORCE RLS migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "input-credit FORCE RLS downgrade is intentionally unavailable"
    )

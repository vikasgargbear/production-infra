"""Move finance lifecycle transitions into named canonical commands.

Revision ID: 20260827_0035
Revises: 20260827_0034
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260827_0035"
down_revision = "20260827_0034"
branch_labels = None
depends_on = None

SQL_PATH = Path(__file__).resolve().parents[1] / "sql" / "20260827_0035_explicit_finance_state.sql"
EXPECTED_SQL_SHA256 = "67065379b41b9869fa9833d5d6d4a9689e59458b687c8acfb8a3981cb8d12d55"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError("explicit finance-state migration source hash mismatch")
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "explicit finance-state migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "explicit finance-state migration downgrade is intentionally unavailable"
    )

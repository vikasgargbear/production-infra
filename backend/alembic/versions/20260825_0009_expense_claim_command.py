"""Add reviewed canonical member expense claim command.

Revision ID: 20260825_0009
Revises: 20260825_0008
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260825_0009"
down_revision = "20260825_0008"
branch_labels = None
depends_on = None

SQL_PATH = Path(__file__).resolve().parents[1] / "sql" / "20260825_0009_expense_claim_command.sql"
EXPECTED_SQL_SHA256 = "b27160d35365573601fb3f05009b790084b3ee6892a1cba0ef6a78b260a5366e"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError("expense claim migration source hash mismatch")
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError("expense claim migration requires an online reviewed principal")
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError("expense claim command downgrade is intentionally unavailable")

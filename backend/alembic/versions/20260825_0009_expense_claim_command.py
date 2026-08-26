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
EXPECTED_SQL_SHA256 = "95ec3325e035ff34d37dcaf9828f06d36e774d6264e0aab322c46197c98ea923"


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

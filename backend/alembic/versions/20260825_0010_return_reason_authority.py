"""Make effective GST rules authoritative for return reasons.

Revision ID: 20260825_0010
Revises: 20260825_0009
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260825_0010"
down_revision = "20260825_0009"
branch_labels = None
depends_on = None

SQL_PATH = Path(__file__).resolve().parents[1] / "sql" / "20260825_0010_return_reason_authority.sql"
EXPECTED_SQL_SHA256 = "a4bc78454f8652756b02efb0ac78d2b807defa7f391703e04eb028ee73126f47"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError("return reason authority migration source hash mismatch")
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError("return reason authority migration requires an online reviewed principal")
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError("return reason authority downgrade is intentionally unavailable")

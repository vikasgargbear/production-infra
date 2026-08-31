"""Flush the opening source constraint before accounting event attachment.

Revision ID: 20260831_0075
Revises: 20260831_0074
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260831_0075"
down_revision = "20260831_0074"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260831_0075_historical_opening_accounting_constraint.sql"
)
EXPECTED_SQL_SHA256 = "b31a59d202746b4e11e5f5b433572beef2b5aef679ab15ee9f4843079290a3ca"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "historical opening accounting constraint migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "historical opening accounting constraint fix requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "historical opening accounting constraint downgrade is intentionally unavailable"
    )

"""Version the canonical command definitions formerly reconciled by staging CI.

Revision ID: 20260825_0012
Revises: 20260825_0011
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260825_0012"
down_revision = "20260825_0011"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql/20260825_0012_canonical_command_definitions.sql"
)
EXPECTED_SQL_SHA256 = "90975dbc68957972b056ce1565b266e78e355ed41565b125c736bd6bdab7d459"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "canonical command-definition migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "canonical command-definition migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "canonical command-definition downgrade is intentionally unavailable"
    )

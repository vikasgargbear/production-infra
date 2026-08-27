"""Project an effective requester status from immutable approval evidence.

Revision ID: 20260827_0033
Revises: 20260827_0032
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260827_0033"
down_revision = "20260827_0032"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260827_0033_requester_command_status.sql"
)
EXPECTED_SQL_SHA256 = "39b9861230ae9a527b9e908b3426fcf673df2d41dfc44b4701f99a06bce4538a"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "requester command-status migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "requester command-status migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "requester command-status migration downgrade is intentionally unavailable"
    )

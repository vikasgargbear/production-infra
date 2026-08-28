"""Add branch-scoped canonical evidence attachment lifecycle.

Revision ID: 20260825_0022
Revises: 20260825_0021
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260825_0022"
down_revision = "20260825_0021"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260825_0022_branch_scoped_evidence_attachments.sql"
)
EXPECTED_SQL_SHA256 = "25ebd3465b1e80175294cc0a4978d999d34e31c9ad1684c043a7d37596b29e99"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "branch-scoped evidence attachment migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "branch-scoped evidence attachment migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "branch-scoped evidence attachment downgrade is intentionally unavailable"
    )

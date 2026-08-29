"""Add exactly replay-safe delegated product setup.

Revision ID: 20260829_0055
Revises: 20260829_0054
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260829_0055"
down_revision = "20260829_0054"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260829_0055_mcp_product_setup_idempotency.sql"
)
EXPECTED_SQL_SHA256 = "a925866f4baeeae4f70e437ce4756092c701571a83ed1c284492ee805e47939a"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "MCP product-setup idempotency migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "MCP product-setup idempotency migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "MCP product-setup idempotency downgrade is intentionally unavailable"
    )

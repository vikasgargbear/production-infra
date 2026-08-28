"""Add canonical product setup, activation readiness, and ranked search support.

Revision ID: 20260828_0049
Revises: 20260828_0048
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260828_0049"
down_revision = "20260828_0048"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260828_0049_canonical_product_setup.sql"
)
EXPECTED_SQL_SHA256 = "a4c6243bebb6009aae940e6dd316ab5b3ea1cc0bd486af35b7dac9106ee34de8"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "canonical product-setup migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "canonical product-setup migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "canonical product-setup downgrade is intentionally unavailable"
    )

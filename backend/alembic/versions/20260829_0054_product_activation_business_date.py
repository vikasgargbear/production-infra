"""Use the organization business date for canonical product activation.

Revision ID: 20260829_0054
Revises: 20260829_0053
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260829_0054"
down_revision = "20260829_0053"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260829_0054_product_activation_business_date.sql"
)
EXPECTED_SQL_SHA256 = "a36243d03274e148884215de048eeb74d994cd07e9eba52d3544a07cdb59b984"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "product-activation business-date migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "product-activation business-date migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "product-activation business-date downgrade is intentionally unavailable"
    )

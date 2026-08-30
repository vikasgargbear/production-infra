"""Promote reviewed historical products and exact opening inventory.

Revision ID: 20260830_0073
Revises: 20260830_0072
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260830_0073"
down_revision = "20260830_0072"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260830_0073_historical_product_inventory_cutover.sql"
)
EXPECTED_SQL_SHA256 = "d601037460050121e89729f2dae9d866f8c9581e310bea7ec9343d82c45e7c5c"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "historical product/inventory cutover migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "historical product/inventory cutover requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "historical product/inventory cutover downgrade is intentionally unavailable"
    )

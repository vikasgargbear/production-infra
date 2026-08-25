"""Post GST-registered inventory destruction with exact ITC lineage.

Revision ID: 20260825_0021
Revises: 20260825_0020
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260825_0021"
down_revision = "20260825_0020"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260825_0021_gst_registered_inventory_destruction.sql"
)
EXPECTED_SQL_SHA256 = "15412c0babddf35bda61fb28d6173114d67298c9256fe240a1deb2f9032e0e8e"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "GST-registered inventory destruction migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "GST-registered inventory destruction migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "GST-registered inventory destruction downgrade is intentionally unavailable"
    )

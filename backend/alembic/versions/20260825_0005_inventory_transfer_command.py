"""Add reviewed canonical inter-branch inventory transfer command.

Revision ID: 20260825_0005
Revises: 20260825_0004
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260825_0005"
down_revision = "20260825_0004"
branch_labels = None
depends_on = None

SQL_PATH = Path(__file__).resolve().parents[1] / "sql" / "20260825_0005_inventory_transfer_command.sql"
EXPECTED_SQL_SHA256 = "90d00e9c8f73c8dc6a28b81569dc52e472c59ffe29e9768a90e5bde2214638bc"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError("inventory transfer migration source hash mismatch")
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError("inventory transfer migration requires an online reviewed principal")
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError("inventory transfer command downgrade is intentionally unavailable")

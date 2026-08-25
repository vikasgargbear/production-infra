"""Add bounded certified canonical inventory destruction.

Revision ID: 20260825_0006
Revises: 20260825_0005
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260825_0006"
down_revision = "20260825_0005"
branch_labels = None
depends_on = None

SQL_PATH = Path(__file__).resolve().parents[1] / "sql" / "20260825_0006_inventory_destruction_command.sql"
EXPECTED_SQL_SHA256 = "4ab12fd357625e57ff41be0ba77b68c9896098489426175eba4ebce4615b1983"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError("inventory destruction migration source hash mismatch")
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "inventory destruction migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "inventory destruction command downgrade is intentionally unavailable"
    )

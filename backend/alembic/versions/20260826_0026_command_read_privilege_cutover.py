"""Cut runtime access over to typed command-read projections.

Revision ID: 20260826_0026
Revises: 20260826_0025
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260826_0026"
down_revision = "20260826_0025"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260826_0026_command_read_privilege_cutover.sql"
)
EXPECTED_SQL_SHA256 = "bc28345e7ed741806ef165cc2e436deb6d95847fa8fd5a7c28cf62b8fb847467"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "command-read privilege cutover migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "command-read privilege cutover requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "command-read privilege cutover downgrade is intentionally unavailable"
    )

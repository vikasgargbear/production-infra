"""Make calculation JSON key validation locale independent.

Revision ID: 20260825_0020
Revises: 20260825_0019
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260825_0020"
down_revision = "20260825_0019"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260825_0020_calculation_schema_c_collation.sql"
)
EXPECTED_SQL_SHA256 = "5590b967ba7f7f56032e47fadc95a68cba244c4263deb65e13f3948a8e220dd4"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "calculation schema C-collation migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "calculation schema C-collation migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "calculation schema C-collation downgrade is intentionally unavailable"
    )

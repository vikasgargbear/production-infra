"""Install canonical product, address, and evidence write functions.

Revision ID: 20260827_0031
Revises: 20260827_0030
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260827_0031"
down_revision = "20260827_0030"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260827_0031_canonical_write_function_boundary.sql"
)
EXPECTED_SQL_SHA256 = "d93c7800e2c06823913f64babad32ebfb3b6860bfb6e25091e0289e98fde1cce"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "canonical write-function migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "canonical write-function migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "canonical write-function migration downgrade is intentionally unavailable"
    )

"""Keep runtime readiness callable across the closed write fence.

Revision ID: 20260829_0060
Revises: 20260829_0059
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260829_0060"
down_revision = "20260829_0059"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql/20260829_0060_runtime_readiness_schema_usage.sql"
)
EXPECTED_SQL_SHA256 = "58e9eb4e45eda798aba32a34824a440ddb16175811008771fa22981d379cccfb"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "runtime readiness schema-usage migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "runtime readiness schema-usage migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "runtime readiness schema-usage downgrade is intentionally unavailable"
    )

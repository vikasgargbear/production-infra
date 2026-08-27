"""Close reviewed business-gap replay, consent, privilege, and date boundaries.

Revision ID: 20260828_0044
Revises: 20260828_0043
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260828_0044"
down_revision = "20260828_0043"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260828_0044_business_gap_security_closure.sql"
)
EXPECTED_SQL_SHA256 = "7e696c6d5cba70d3d472f2f967386acbc875def52d65ec1b16ce83b51b0f3026"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "business-gap security closure migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "business-gap security closure migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "business-gap security closure downgrade is intentionally unavailable"
    )

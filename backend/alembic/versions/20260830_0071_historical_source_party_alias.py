"""Resolve historical parties across retained source-key projections.

Revision ID: 20260830_0071
Revises: 20260830_0070
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260830_0071"
down_revision = "20260830_0070"
branch_labels = None
depends_on = None

SQL_PATH = Path(__file__).resolve().parents[1] / "sql" / "20260830_0071_historical_source_party_alias.sql"
EXPECTED_SQL_SHA256 = "ce5b3551163807b6114b4dfb498877e515608b2e37ffb4d7064b1625c2577515"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "historical source-party alias migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "historical source-party alias migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "historical source-party alias migration downgrade is intentionally unavailable"
    )

"""Resolve retained openings through unique source-party identity.

Revision ID: 20260830_0070
Revises: 20260830_0069
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260830_0070"
down_revision = "20260830_0069"
branch_labels = None
depends_on = None

SQL_PATH = Path(__file__).resolve().parents[1] / "sql" / "20260830_0070_historical_opening_party_identity.sql"
EXPECTED_SQL_SHA256 = "d660864b8c578d784bcba9ca413f9deaf0f53bb05870e7fcc0ec154398dbf0de"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
        "historical opening party-identity migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "historical opening party-identity migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "historical opening party-identity migration downgrade is intentionally unavailable"
    )

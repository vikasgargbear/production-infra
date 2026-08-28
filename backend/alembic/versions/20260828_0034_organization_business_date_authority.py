"""Use the organization timezone as the sole finance business-date authority.

Revision ID: 20260828_0034
Revises: 20260827_0033
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260828_0034"
down_revision = "20260827_0033"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260828_0034_organization_business_date_authority.sql"
)
EXPECTED_SQL_SHA256 = "7e7f230945d4df440513b08ec26645c1b7d0a198b08f8c9efecf1aabe189796d"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "organization business-date migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "organization business-date migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "organization business-date migration downgrade is intentionally unavailable"
    )

"""Provision canonical master-code sequences during organization onboarding.

Revision ID: 20260826_0028
Revises: 20260826_0027
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260826_0028"
down_revision = "20260826_0027"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260826_0028_organization_master_code_onboarding.sql"
)
EXPECTED_SQL_SHA256 = "f6a19b84259323c0b475d21483d70c2a867da04f1bf90aa0acf102486b797de8"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "organization master-code onboarding migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "organization master-code onboarding requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "organization master-code onboarding downgrade is intentionally unavailable"
    )

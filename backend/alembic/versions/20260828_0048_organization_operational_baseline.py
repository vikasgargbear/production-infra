"""Provision a usable operational baseline during organization onboarding.

Revision ID: 20260828_0048
Revises: 20260828_0047
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260828_0048"
down_revision = "20260828_0047"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260828_0048_organization_operational_baseline.sql"
)
EXPECTED_SQL_SHA256 = "eea929f5a7b2fd1a80ba25b654389a5e9b420b94c21ed2e508745a115e3b2012"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "organization operational-baseline migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "organization operational-baseline migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "organization operational-baseline downgrade is intentionally unavailable"
    )

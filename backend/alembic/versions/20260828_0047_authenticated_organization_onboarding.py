"""Add authenticated organization bootstrap and single-use invitations.

Revision ID: 20260828_0047
Revises: 20260828_0046
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260828_0047"
down_revision = "20260828_0046"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260828_0047_authenticated_organization_onboarding.sql"
)
EXPECTED_SQL_SHA256 = "fae64c2b8dae8669bede318b6feb50cbb53c51de5c64d045b3b052d91ba2d6d6"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "authenticated organization-onboarding migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "authenticated organization-onboarding migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "authenticated organization-onboarding downgrade is intentionally unavailable"
    )

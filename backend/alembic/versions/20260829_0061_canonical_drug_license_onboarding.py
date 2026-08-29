"""Add reviewed Forms 20B/21B evidence and activation authority.

Revision ID: 20260829_0061
Revises: 20260829_0060
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260829_0061"
down_revision = "20260829_0060"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260829_0061_canonical_drug_license_onboarding.sql"
)
EXPECTED_SQL_SHA256 = "d048dcbd0f892ffddbe9b332123bdd6fa56c08a529bac98bb8b4180aa1e77d7f"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError("drug-license onboarding migration source hash mismatch")
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "drug-license onboarding migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "drug-license onboarding downgrade is intentionally unavailable"
    )

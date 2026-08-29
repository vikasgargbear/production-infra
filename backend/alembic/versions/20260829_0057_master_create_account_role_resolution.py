"""Resolve party master posting accounts through canonical finance roles.

Revision ID: 20260829_0057
Revises: 20260829_0056
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260829_0057"
down_revision = "20260829_0056"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260829_0057_master_create_account_role_resolution.sql"
)
EXPECTED_SQL_SHA256 = "b983b38e12beb157c13bbd7927f28c904146325213079cb10611081ea21b70a1"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "master-create account-role migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "master-create account-role migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "master-create account-role downgrade is intentionally unavailable"
    )

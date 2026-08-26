"""Install bounded runtime command-resume and evidence projections.

Revision ID: 20260827_0030
Revises: 20260826_0029
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260827_0030"
down_revision = "20260826_0029"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260827_0030_runtime_command_resume_projection.sql"
)
EXPECTED_SQL_SHA256 = "2bd63c66985d1c8ad5b056bb6734b88d6a73957a4de2bad0cdf52199da1ac0f1"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "runtime command-resume projection migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "runtime command-resume projection requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "runtime command-resume projection downgrade is intentionally unavailable"
    )

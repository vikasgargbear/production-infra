"""Install the official, effective-dated GST jurisdiction authority.

Revision ID: 20260825_0013
Revises: 20260825_0012
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260825_0013"
down_revision = "20260825_0012"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260825_0013_gst_jurisdiction_authority.sql"
)
EXPECTED_SQL_SHA256 = "5a5f637c11acaea29c5ed427a730a7d715c6afd310f07e085611d680e8838016"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError("GST jurisdiction authority migration source hash mismatch")
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "GST jurisdiction authority migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "GST jurisdiction authority downgrade is intentionally unavailable"
    )

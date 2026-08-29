"""Release accepted saleable batches only with posted GRN provenance.

Revision ID: 20260829_0059
Revises: 20260829_0058
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260829_0059"
down_revision = "20260829_0058"
branch_labels = None
depends_on = None

SQL_PATH = Path(__file__).resolve().parents[1] / "sql/20260829_0059_grn_batch_release.sql"
EXPECTED_SQL_SHA256 = "872ffb065e9bd4de738200e0bc537b30c0a65c4175a13887f2e1aa349c0f7254"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError("GRN batch-release migration source hash mismatch")
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "GRN batch-release migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError("GRN batch-release downgrade is intentionally unavailable")

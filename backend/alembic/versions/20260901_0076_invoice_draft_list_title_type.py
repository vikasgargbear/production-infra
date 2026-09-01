"""Match the invoice-draft list title to its declared text result.

Revision ID: 20260901_0076
Revises: 20260831_0075
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260901_0076"
down_revision = "20260831_0075"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260901_0076_invoice_draft_list_title_type.sql"
)
EXPECTED_SQL_SHA256 = "9ba8ca97ab3b5641c3f0b3f6154bf00c3a0dec5b73feddd61ad094bdb98b67dc"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "invoice draft list title migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "invoice draft list title fix requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "invoice draft list title downgrade is intentionally unavailable"
    )

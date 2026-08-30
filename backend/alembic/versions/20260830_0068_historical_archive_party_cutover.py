"""Allow reviewed archive-only parties into historical operational cutover.

Revision ID: 20260830_0068
Revises: 20260830_0067
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260830_0068"
down_revision = "20260830_0067"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260830_0068_historical_archive_party_cutover.sql"
)
EXPECTED_SQL_SHA256 = "00d93396f5c3a94a928d543169d1d86972a7a9ce4a20acf7dc8f29d5e1201f05"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "historical archive-party cutover migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "historical archive-party cutover requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "historical archive-party cutover downgrade is intentionally unavailable"
    )

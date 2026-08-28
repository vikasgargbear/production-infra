"""Count only posted sales dispatches as commercial fulfillment.

Revision ID: 20260829_0050
Revises: 20260828_0049
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260829_0050"
down_revision = "20260828_0049"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260829_0050_posted_dispatch_fulfillment.sql"
)
EXPECTED_SQL_SHA256 = (
    "165c4791ebd8cea79c80149368cad4310f0d1acd4d0f4fdeb7e805d35429f52b"
)


def _reviewed_sql() -> str:
    try:
        sql = SQL_PATH.read_text(encoding="utf-8")
    except OSError as exc:
        raise CanonicalBaselineError(
            f"cannot read posted-dispatch fulfillment migration: {exc}"
        ) from exc
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "posted-dispatch fulfillment migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "posted-dispatch fulfillment migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "posted-dispatch fulfillment downgrade is intentionally unavailable"
    )

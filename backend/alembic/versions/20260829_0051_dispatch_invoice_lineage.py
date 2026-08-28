"""Align posted dispatch provenance with canonical invoice lineage.

Revision ID: 20260829_0051
Revises: 20260829_0050
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260829_0051"
down_revision = "20260829_0050"
branch_labels = None
depends_on = None

SQL_PATH = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "20260829_0051_dispatch_invoice_lineage.sql"
)
EXPECTED_SQL_SHA256 = (
    "bc71aa24817d513196e71c2f5010e8ae9edb410af5cd6c3ef4299fde7bf2592a"
)


def _reviewed_sql() -> str:
    try:
        sql = SQL_PATH.read_text(encoding="utf-8")
    except OSError as exc:
        raise CanonicalBaselineError(
            f"cannot read dispatch-invoice lineage migration: {exc}"
        ) from exc
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError(
            "dispatch-invoice lineage migration source hash mismatch"
        )
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "dispatch-invoice lineage migration requires an online reviewed principal"
        )
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError(
        "dispatch-invoice lineage downgrade is intentionally unavailable"
    )

"""Require exact selected delivery addresses for sales tax authority.

Revision ID: 20260825_0011
Revises: 20260825_0010
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260825_0011"
down_revision = "20260825_0010"
branch_labels = None
depends_on = None

SQL_PATH = Path(__file__).resolve().parents[1] / "sql" / "20260825_0011_sales_delivery_address_authority.sql"
EXPECTED_SQL_SHA256 = "02efa0ced5bd9ea27fa74764168f00b1f7c842782e0d4b77dafa2489a3c75b12"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError("sales delivery-address authority migration source hash mismatch")
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError("sales delivery-address authority migration requires an online reviewed principal")
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError("sales delivery-address authority downgrade is intentionally unavailable")

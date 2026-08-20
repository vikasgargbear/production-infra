"""Install the reviewed canonical ERP v1 baseline.

Revision ID: 20260820_0001
Revises: None
"""

from __future__ import annotations

from alembic import context, op

from migration_support.canonical_baseline import (
    CanonicalBaselineError,
    execute_packaged_sql,
    load_packaged_baseline,
    require_approved_hash,
    require_bootstrap_migration_principal,
)


revision = "20260820_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError(
            "canonical baseline requires an online principal and database preflight"
        )
    sql, manifest = load_packaged_baseline()
    require_approved_hash(manifest)
    connection = op.get_bind()
    require_bootstrap_migration_principal(connection)
    cursor = connection.connection.cursor()
    try:
        execute_packaged_sql(cursor, sql)
    finally:
        cursor.close()
    connection.exec_driver_sql(
        "ALTER TABLE public.alembic_version ENABLE ROW LEVEL SECURITY"
    )
    connection.exec_driver_sql(
        "ALTER TABLE public.alembic_version FORCE ROW LEVEL SECURITY"
    )
    connection.exec_driver_sql(
        "REVOKE ALL ON TABLE public.alembic_version FROM PUBLIC"
    )


def downgrade() -> None:
    raise CanonicalBaselineError(
        "canonical v1 downgrade is intentionally unavailable; follow "
        "database/canonical/RESET_AND_BASELINE.md"
    )

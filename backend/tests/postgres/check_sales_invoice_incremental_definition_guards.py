"""Prove 0018/0019 incremental, reapply, and drift guards on PostgreSQL 15."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
import re

import psycopg2
from sqlalchemy.engine import make_url


ROOT = Path(__file__).resolve().parents[3]
UOM_MIGRATION = (
    ROOT / "backend/alembic/sql/20260825_0018_sales_invoice_fefo_uom_alias.sql"
).read_text(encoding="utf-8")
INVENTORY_MIGRATION = (
    ROOT
    / "backend/alembic/sql/20260825_0019_sales_invoice_multibatch_inventory.sql"
).read_text(encoding="utf-8")

RESOLVER_SIGNATURE = (
    "erp_automation_commands.resolve_sales_invoice_prepare"
    "(uuid,uuid,uuid,uuid,uuid,character varying,uuid,jsonb)"
)
INVENTORY_SIGNATURE = "erp_trade_commands.assert_inventory_document(uuid,uuid)"
RESOLVER_CURRENT_SHA256 = (
    "7d78e0792ce2c55237d806d7f021e0a214bf49456929629bee1f452a8780918f"
)
INVENTORY_CURRENT_SHA256 = (
    "7ded2c77a3a18d3ef9ca37d5366c16656c56ed44b12929e47fda3ba3f7be5a5b"
)


def _definition(cursor, signature: str) -> str:
    cursor.execute(
        "SELECT pg_catalog.pg_get_functiondef(%s::pg_catalog.regprocedure)",
        (signature,),
    )
    return str(cursor.fetchone()[0])


def _sha256(definition: str) -> str:
    return hashlib.sha256(definition.encode("utf-8")).hexdigest()


def _migration_literal(sql: str, name: str, tag: str) -> str:
    match = re.search(
        rf"{name} constant text := \${tag}\$(.*?)\${tag}\$;",
        sql,
        flags=re.DOTALL,
    )
    assert match is not None, f"missing {name} in reviewed migration"
    return match.group(1)


def _expect_drift_rejection(cursor, migration: str, message: str) -> None:
    cursor.execute("SAVEPOINT before_marker_preserving_drift")
    try:
        cursor.execute(migration)
    except psycopg2.Error as error:
        assert error.pgcode == "55000"
        assert message in str(error)
        cursor.execute("ROLLBACK TO SAVEPOINT before_marker_preserving_drift")
    else:
        raise AssertionError("marker-preserving definition drift was accepted")


def _exercise_resolver(cursor) -> None:
    current = _definition(cursor, RESOLVER_SIGNATURE)
    assert _sha256(current) == RESOLVER_CURRENT_SHA256

    # The immutable older migration must not mistake a forward chronology
    # definition for its own historical idempotent no-op.
    _expect_drift_rejection(
        cursor,
        UOM_MIGRATION,
        "sales-invoice FEFO UOM source differs from the reviewed migration precondition",
    )
    assert _sha256(_definition(cursor, RESOLVER_SIGNATURE)) == RESOLVER_CURRENT_SHA256

    old_requested = _migration_literal(UOM_MIGRATION, "old_requested", "old")
    new_requested = _migration_literal(UOM_MIGRATION, "new_requested", "new")
    assert current.count(new_requested) == 1
    incremental_source = current.replace(new_requested, old_requested)
    incremental_source = incremental_source.replace(
        "      fefo_eligible AS (", "      eligible AS ("
    )
    incremental_source = incremental_source.replace(
        "FROM fefo_eligible JOIN totals USING(product_id)",
        "FROM eligible JOIN totals USING(product_id)",
    )
    incremental_source = incremental_source.replace(
        "fefo_eligible.expiry_requested", "eligible.expiry_requested"
    )
    incremental_source = incremental_source.replace(
        "fefo_eligible.prior_available", "eligible.prior_available"
    )
    incremental_source = incremental_source.replace(
        "fefo_eligible.expiry_available", "eligible.expiry_available"
    )
    assert "sales_invoice_fefo_expiry_date_equivalence_v1" in incremental_source
    assert _sha256(incremental_source) != RESOLVER_CURRENT_SHA256
    cursor.execute(incremental_source)
    cursor.execute(UOM_MIGRATION)
    assert _sha256(_definition(cursor, RESOLVER_SIGNATURE)) == RESOLVER_CURRENT_SHA256

    altered = current.replace(
        "automatic FEFO allocation cannot satisfy locked stock",
        "automatic FEFO allocation cannot satisfy altered stock",
    )
    assert altered != current
    assert "sales_invoice_fefo_expiry_date_equivalence_v3" in altered
    cursor.execute(altered)
    altered_hash = _sha256(_definition(cursor, RESOLVER_SIGNATURE))
    assert altered_hash != RESOLVER_CURRENT_SHA256
    _expect_drift_rejection(
        cursor,
        UOM_MIGRATION,
        "sales-invoice FEFO UOM source differs from the reviewed migration precondition",
    )
    assert _sha256(_definition(cursor, RESOLVER_SIGNATURE)) == altered_hash
    cursor.execute(current)


def _exercise_inventory_assertion(cursor) -> None:
    current = _definition(cursor, INVENTORY_SIGNATURE)
    assert _sha256(current) == INVENTORY_CURRENT_SHA256

    cursor.execute(INVENTORY_MIGRATION)
    assert _sha256(_definition(cursor, INVENTORY_SIGNATURE)) == INVENTORY_CURRENT_SHA256

    old_lineage = _migration_literal(INVENTORY_MIGRATION, "old_lineage", "old")
    new_lineage = _migration_literal(INVENTORY_MIGRATION, "new_lineage", "new")
    assert current.count(new_lineage) == 1
    incremental_source = current.replace(new_lineage, old_lineage)
    assert "sales_invoice_multibatch_inventory_lineage_v1" not in incremental_source
    assert _sha256(incremental_source) != INVENTORY_CURRENT_SHA256
    cursor.execute(incremental_source)
    cursor.execute(INVENTORY_MIGRATION)
    assert _sha256(_definition(cursor, INVENTORY_SIGNATURE)) == INVENTORY_CURRENT_SHA256

    altered = current.replace(
        "inventory document has no lines",
        "inventory document has altered lines",
    )
    assert altered != current
    assert "sales_invoice_multibatch_inventory_lineage_v1" in altered
    cursor.execute(altered)
    altered_hash = _sha256(_definition(cursor, INVENTORY_SIGNATURE))
    assert altered_hash != INVENTORY_CURRENT_SHA256
    _expect_drift_rejection(
        cursor,
        INVENTORY_MIGRATION,
        "sales-invoice inventory lineage differs from the reviewed migration precondition",
    )
    assert _sha256(_definition(cursor, INVENTORY_SIGNATURE)) == altered_hash
    cursor.execute(current)


def main() -> None:
    url = make_url(os.environ["DATABASE_URL"])
    connection = psycopg2.connect(
        host=url.host,
        port=url.port or 5432,
        dbname=url.database,
        user=url.username,
        password=url.password or "",
    )
    try:
        with connection.cursor() as cursor:
            cursor.execute("SHOW server_version_num")
            assert 150000 <= int(cursor.fetchone()[0]) < 160000
            _exercise_resolver(cursor)
            _exercise_inventory_assertion(cursor)
    finally:
        # All rewrites are disposable migration simulations. Preserve the
        # exact clean-head definitions for the remaining PostgreSQL gate.
        connection.rollback()
        connection.close()


if __name__ == "__main__":
    main()

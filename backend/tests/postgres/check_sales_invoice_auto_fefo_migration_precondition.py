"""Prove 0016 exact-definition reapply and mismatch rejection on PostgreSQL 15."""

from __future__ import annotations

import os
from pathlib import Path
import sys

import psycopg2

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from scripts.generate_sales_invoice_auto_fefo_migration import (
    CURRENT_DEFINITION_SHA256,
)


ROOT = Path(__file__).resolve().parents[3]
MIGRATION_SQL = (
    ROOT / "backend/alembic/sql/20260825_0016_sales_invoice_auto_fefo.sql"
).read_text(encoding="utf-8")
SIGNATURE = (
    "erp_automation_commands.resolve_sales_invoice_prepare"
    "(uuid,uuid,uuid,uuid,uuid,character varying,uuid,jsonb)"
)
DEFINITION_SQL = "SELECT pg_catalog.pg_get_functiondef(%s::pg_catalog.regprocedure)"
HASH_SQL = """
SELECT pg_catalog.encode(extensions.digest(
  pg_catalog.convert_to(pg_catalog.pg_get_functiondef(
    %s::pg_catalog.regprocedure),'UTF8'),'sha256'),'hex')
"""


def main() -> None:
    connection = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with connection.cursor() as cursor:
            cursor.execute("SHOW server_version_num")
            assert 150000 <= int(cursor.fetchone()[0]) < 160000
            cursor.execute(HASH_SQL, (SIGNATURE,))
            assert cursor.fetchone()[0] == CURRENT_DEFINITION_SHA256

            # An exact already-current fresh-baseline definition is a safe,
            # idempotent reapply and remains byte-identical in the PG catalog.
            cursor.execute(MIGRATION_SQL)
            cursor.execute(HASH_SQL, (SIGNATURE,))
            assert cursor.fetchone()[0] == CURRENT_DEFINITION_SHA256

            # A definition carrying the marker but differing in any catalog
            # byte is rejected before CREATE OR REPLACE can repair or hide it.
            cursor.execute(DEFINITION_SQL, (SIGNATURE,))
            definition = cursor.fetchone()[0]
            altered = definition.replace(
                "automatic FEFO allocation cannot satisfy locked stock",
                "automatic FEFO allocation cannot satisfy altered stock",
            )
            assert altered != definition and "sales_invoice_auto_fefo_v1" in altered
            cursor.execute(altered)
            cursor.execute(HASH_SQL, (SIGNATURE,))
            altered_hash = cursor.fetchone()[0]
            assert altered_hash != CURRENT_DEFINITION_SHA256
            cursor.execute("SAVEPOINT before_mismatched_reapply")
            try:
                cursor.execute(MIGRATION_SQL)
            except psycopg2.Error as exc:
                assert exc.pgcode == "55000"
                assert (
                    "differs from reviewed auto-FEFO migration precondition"
                    in str(exc)
                )
                cursor.execute("ROLLBACK TO SAVEPOINT before_mismatched_reapply")
            else:
                raise AssertionError("0016 accepted an altered auto-FEFO resolver")
            cursor.execute(HASH_SQL, (SIGNATURE,))
            assert cursor.fetchone()[0] == altered_hash
    finally:
        # The altered definition and idempotent reapply are test-only. Neither
        # may survive in the disposable gate database.
        connection.rollback()
        connection.close()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Capture read-only canonical transaction evidence from deployed PostgreSQL.

The runtime connection proves the effective application role and catalog
contract. The reviewed admin connection is used only to read Alembic state and
role ownership metadata that is intentionally hidden from ``erp_runtime``.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re

import psycopg2


SCHEMA_VERSION = "1.0.0"
EXPECTED_PROJECT_REF = "rgihahbmkrmhitjdjvev"
BUSINESS_SCHEMAS = (
    "automation", "calculation", "catalog", "compliance", "core", "finance",
    "hr", "inventory", "parties", "procurement", "sales", "tax",
)


def _scalar(connection, query: str, parameters=()):
    with connection.cursor() as cursor:
        cursor.execute(query, parameters)
        row = cursor.fetchone()
    if row is None or len(row) != 1:
        raise RuntimeError("transaction evidence query did not return one scalar")
    return row[0]


def _read_only_connection(database_url: str):
    connection = psycopg2.connect(database_url, connect_timeout=15)
    connection.set_session(readonly=True, autocommit=False)
    return connection


def capture(
    *,
    runtime_database_url: str,
    admin_database_url: str,
    project_ref: str,
    git_commit: str,
) -> dict:
    if project_ref != EXPECTED_PROJECT_REF:
        raise ValueError(f"refusing transaction evidence for project {project_ref!r}")
    if not re.fullmatch(r"[0-9a-f]{40}", git_commit.lower()):
        raise ValueError("git commit must be an exact 40-character SHA")

    with _read_only_connection(admin_database_url) as admin, _read_only_connection(
        runtime_database_url
    ) as runtime:
        revision = _scalar(admin, "SELECT version_num FROM public.alembic_version")
        session_user = _scalar(runtime, "SELECT session_user")
        role_posture = _scalar(runtime, """
            SELECT pg_catalog.jsonb_build_object(
                'session_user', role.rolname,
                'superuser', role.rolsuper,
                'bypass_rls', role.rolbypassrls,
                'owns_business_relations', EXISTS (
                    SELECT 1
                      FROM pg_catalog.pg_class relation
                      JOIN pg_catalog.pg_namespace namespace
                        ON namespace.oid=relation.relnamespace
                     WHERE relation.relowner=role.oid
                       AND namespace.nspname=ANY(%s)
                       AND relation.relkind IN ('r','p','v','m','S')
                )
            )
              FROM pg_catalog.pg_roles role
             WHERE role.rolname=session_user
        """, (list(BUSINESS_SCHEMAS),))
        if session_user != "erp_runtime":
            raise RuntimeError(
                f"runtime evidence connection authenticated as {session_user!r}, not erp_runtime"
            )

        payment_idempotency = _scalar(runtime, """
            SELECT EXISTS (
                SELECT 1
                  FROM pg_catalog.pg_constraint constraint_row
                 WHERE constraint_row.conrelid='automation.command_requests'::regclass
                   AND constraint_row.contype='u'
                   AND constraint_row.conname='command_requests_idempotency_uq'
                   AND pg_catalog.pg_get_constraintdef(constraint_row.oid)
                       ='UNIQUE (org_id, agent_grant_id, operation, idempotency_key_hash)'
            )
        """)
        allocation_present = _scalar(
            runtime, "SELECT pg_catalog.to_regclass('finance.allocations') IS NOT NULL"
        )
        allocation_owned = _scalar(runtime, """
            SELECT
              EXISTS (
                SELECT 1 FROM pg_catalog.pg_trigger trigger_row
                 WHERE trigger_row.tgrelid='finance.allocations'::regclass
                   AND trigger_row.tgname='allocations_guard_ct'
                   AND NOT trigger_row.tgisinternal
              )
              AND EXISTS (
                SELECT 1 FROM pg_catalog.pg_trigger trigger_row
                 WHERE trigger_row.tgrelid='finance.allocations'::regclass
                   AND trigger_row.tgname='finance_allocations_immutable_trg'
                   AND NOT trigger_row.tgisinternal
              )
              AND NOT EXISTS (
                SELECT 1
                  FROM pg_catalog.pg_trigger trigger_row
                  JOIN pg_catalog.pg_proc function_row ON function_row.oid=trigger_row.tgfoid
                  JOIN pg_catalog.pg_namespace namespace
                    ON namespace.oid=function_row.pronamespace
                 WHERE trigger_row.tgrelid='finance.allocations'::regclass
                   AND NOT trigger_row.tgisinternal
                   AND namespace.nspname NOT IN ('erp_finance_invariants','erp_plumbing')
              )
        """)
        bank_contract = _scalar(runtime, """
            SELECT pg_catalog.to_regclass('finance.bank_statements') IS NOT NULL
               AND pg_catalog.to_regclass('finance.bank_statement_lines') IS NOT NULL
               AND pg_catalog.to_regclass('finance.reconciliation_matches') IS NOT NULL
               AND pg_catalog.to_regclass('finance.bank_reconciliations') IS NULL
               AND pg_catalog.to_regclass('finance.unmatched_transactions') IS NULL
        """)
        journal_immutable = _scalar(runtime, """
            SELECT EXISTS (
                SELECT 1 FROM pg_catalog.pg_trigger
                 WHERE tgrelid='finance.journal_entries'::regclass
                   AND tgname='journal_entries_guard_ct' AND NOT tgisinternal
              ) AND EXISTS (
                SELECT 1 FROM pg_catalog.pg_trigger
                 WHERE tgrelid='finance.journal_lines'::regclass
                   AND tgname='journal_lines_guard_ct' AND NOT tgisinternal
              )
        """)
        order_invoice_owned = _scalar(runtime, """
            SELECT NOT EXISTS (
                SELECT 1
                  FROM pg_catalog.pg_trigger trigger_row
                  JOIN pg_catalog.pg_proc function_row ON function_row.oid=trigger_row.tgfoid
                 WHERE trigger_row.tgrelid='sales.orders'::regclass
                   AND NOT trigger_row.tgisinternal
                   AND pg_catalog.pg_get_functiondef(function_row.oid)
                       ~* 'insert[[:space:]]+into[[:space:]]+sales[.]invoices'
            )
        """)
        grn_inventory_owned = _scalar(runtime, """
            SELECT NOT EXISTS (
                SELECT 1
                  FROM pg_catalog.pg_trigger trigger_row
                  JOIN pg_catalog.pg_proc function_row ON function_row.oid=trigger_row.tgfoid
                 WHERE trigger_row.tgrelid IN (
                         'procurement.goods_receipts'::regclass,
                         'procurement.goods_receipt_lines'::regclass
                       )
                   AND NOT trigger_row.tgisinternal
                   AND pg_catalog.pg_get_functiondef(function_row.oid)
                       ~* '(insert[[:space:]]+into|update)[[:space:]]+inventory[.]'
            )
        """)
        finance_rls = _scalar(runtime, """
            SELECT count(*)=8 AND pg_catalog.bool_and(
                     relation.relrowsecurity AND relation.relforcerowsecurity
                   )
              FROM pg_catalog.pg_class relation
             WHERE relation.oid=ANY(ARRAY[
                 'finance.payments'::regclass,
                 'finance.allocations'::regclass,
                 'finance.open_items'::regclass,
                 'finance.journal_entries'::regclass,
                 'finance.journal_lines'::regclass,
                 'finance.accounting_events'::regclass,
                 'finance.bank_statements'::regclass,
                 'finance.reconciliation_matches'::regclass
             ])
        """)
        runtime.rollback()
        admin.rollback()

    return {
        "schema_version": SCHEMA_VERSION,
        "project_ref": project_ref,
        "git_commit": git_commit.lower(),
        "alembic_revision": revision,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "capture_boundary": "read_only_admin_catalog_plus_erp_runtime_catalog",
        "runtime_role": dict(role_posture),
        "transaction_checks": {
            "payment_idempotency_unique": bool(payment_idempotency),
            "allocation_table_present": bool(allocation_present),
            "allocation_projection_owner": (
                "canonical_database_invariant" if allocation_owned else "unverified"
            ),
            "bank_reconciliation_contract": (
                "bank_statements_and_reconciliation_matches"
                if bank_contract else "unverified"
            ),
            "posted_journal_immutability": bool(journal_immutable),
            "order_invoice_generation_owner": (
                "canonical_command_functions" if order_invoice_owned else "conflict"
            ),
            "grn_inventory_effect_owner": (
                "canonical_command_functions" if grn_inventory_owned else "conflict"
            ),
            "finance_rls_enabled_and_forced": bool(finance_rls),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime-database-url", required=True)
    parser.add_argument("--admin-database-url", required=True)
    parser.add_argument("--project-ref", required=True)
    parser.add_argument("--git-commit", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    evidence = capture(
        runtime_database_url=args.runtime_database_url,
        admin_database_url=args.admin_database_url,
        project_ref=args.project_ref,
        git_commit=args.git_commit,
    )
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"captured canonical transaction evidence at {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env bash
set -euo pipefail

: "${CANONICAL_CI_ALLOW_DISPOSABLE:?set only in the disposable PostgreSQL 15 CI job}"
: "${PGHOST:?}"
: "${PGDATABASE:?}"

case "$PGHOST" in
  127.0.0.1|localhost) ;;
  *) echo "refusing non-local PostgreSQL host: $PGHOST" >&2; exit 2 ;;
esac
test "$PGDATABASE" = canonical_alembic_ci || {
  echo "refusing database other than canonical_alembic_ci" >&2
  exit 2
}
test "$CANONICAL_CI_ALLOW_DISPOSABLE" = 1 || {
  echo "disposable database opt-in must equal 1" >&2
  exit 2
}

server_major=$(psql -X -Atqc "SHOW server_version_num" | cut -c1-2)
test "$server_major" = 15 || {
  echo "canonical Alembic gate requires PostgreSQL 15" >&2
  exit 2
}

python3 backend/scripts/package_canonical_baseline_migration.py
python3 backend/scripts/generate_canonical_command_definition_migration.py --check
expected_alembic_head=$(python3 backend/scripts/canonical_migration_contract.py --print-head)
psql -X -v ON_ERROR_STOP=1 -f database/canonical/ci/bootstrap_supabase_auth.sql

export DATABASE_URL="postgresql+psycopg2://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}"
export CANONICAL_BASELINE_APPROVED_SHA256
CANONICAL_BASELINE_APPROVED_SHA256=$(
  python3 backend/scripts/package_canonical_baseline_migration.py --print-sha256
)

(
  cd backend
  alembic -c alembic.ini upgrade head
  alembic -c alembic.ini upgrade head
)

test "$(psql -X -Atqc 'SELECT version_num FROM public.alembic_version')" = "$expected_alembic_head"
test "$(psql -X -Atqc "SELECT to_regclass('tax.gstr1_reporting_rule_versions') IS NOT NULL")" = "t"
test "$(psql -X -Atqc "SELECT has_table_privilege('erp_runtime', 'tax.gstr1_reporting_rule_versions', 'SELECT')")" = "t"
test "$(psql -X -Atqc "SELECT has_function_privilege('erp_regulatory_importer', 'erp_regulatory_commands.import_gstr1_reporting_release(uuid,varchar,text,text,text,text,varchar,bytea,bytea,text,text,bytea,bytea,date,date,date,uuid,timestamptz,uuid,timestamptz,uuid)', 'EXECUTE')")" = "t"
test "$(psql -X -Atqc "SELECT has_function_privilege('erp_runtime', 'erp_regulatory_commands.import_gstr1_reporting_release(uuid,varchar,text,text,text,text,varchar,bytea,bytea,text,text,bytea,bytea,date,date,date,uuid,timestamptz,uuid,timestamptz,uuid)', 'EXECUTE')")" = "f"
test "$(psql -X -Atqc "SELECT count(*) FROM tax.gst_jurisdictions")" = "39"
test "$(psql -X -Atqc "SELECT count(*) FROM tax.gst_jurisdiction_versions WHERE status='active' AND supports_domestic_address")" = "36"
test "$(psql -X -Atqc "SELECT has_table_privilege('erp_runtime', 'tax.gst_jurisdiction_versions', 'SELECT')")" = "t"
test "$(psql -X -Atqc "SELECT has_function_privilege('erp_runtime', 'tax.assert_effective_gst_jurisdiction(text,date,text,text)', 'EXECUTE')")" = "f"
test "$(psql -X -Atqc "SELECT relrowsecurity::text || '|' || relforcerowsecurity::text FROM pg_catalog.pg_class WHERE oid='public.alembic_version'::regclass")" = "true|true"
test "$(psql -X -Atqc "SELECT has_table_privilege('erp_runtime', 'public.alembic_version', 'SELECT')")" = "f"
test "$(psql -X -Atqc "SELECT has_function_privilege('erp_runtime', 'erp_security.deployed_canonical_revision()', 'EXECUTE')")" = "t"
test "$(psql -X -Atqc "SELECT has_function_privilege('erp_app', 'erp_security.deployed_canonical_revision()', 'EXECUTE')")" = "f"
test "$(psql -X -Atqc "
  SELECT
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid='automation.command_requests'::regclass
         AND conname='command_requests_idempotency_uq' AND contype='u'
    ),
    pg_catalog.to_regclass('finance.allocations') IS NOT NULL,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger
       WHERE tgrelid='finance.allocations'::regclass
         AND tgname='allocations_guard_ct' AND NOT tgisinternal
    ),
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger
       WHERE tgrelid='finance.journal_entries'::regclass
         AND tgname='journal_entries_guard_ct' AND NOT tgisinternal
    ),
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger
       WHERE tgrelid='finance.journal_lines'::regclass
         AND tgname='journal_lines_guard_ct' AND NOT tgisinternal
    ),
    pg_catalog.to_regclass('finance.bank_statements') IS NOT NULL
      AND pg_catalog.to_regclass('finance.bank_statement_lines') IS NOT NULL
      AND pg_catalog.to_regclass('finance.reconciliation_matches') IS NOT NULL
      AND pg_catalog.to_regclass('finance.bank_reconciliations') IS NULL,
    (SELECT NOT rolsuper AND NOT rolbypassrls
       FROM pg_catalog.pg_roles WHERE rolname='erp_runtime'),
    (SELECT count(*)=8 AND pg_catalog.bool_and(relrowsecurity AND relforcerowsecurity)
       FROM pg_catalog.pg_class
      WHERE oid=ANY(ARRAY[
        'finance.payments'::regclass,
        'finance.allocations'::regclass,
        'finance.open_items'::regclass,
        'finance.journal_entries'::regclass,
        'finance.journal_lines'::regclass,
        'finance.accounting_events'::regclass,
        'finance.bank_statements'::regclass,
        'finance.reconciliation_matches'::regclass
      ]))
")" = "t|t|t|t|t|t|t|t"

fixture_count=0
while IFS= read -r fixture; do
  psql -X -v ON_ERROR_STOP=1 -f "$fixture"
  fixture_count=$((fixture_count + 1))
done < <(
  find database/canonical -type f \
    \( -name 'test_*.sql' -o -name 'head_test_*.sql' \) \
    | LC_ALL=C sort
)
test "$fixture_count" -gt 0 || {
  echo "no canonical PostgreSQL fixtures were discovered" >&2
  exit 2
}

PYTHONPATH=backend \
  python backend/tests/postgres/check_canonical_invoice_detail_runtime_role.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_canonical_purchase_order_detail_runtime_role.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_canonical_purchase_order_runtime_role.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_canonical_goods_receipt_runtime_role.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_canonical_supplier_invoice_reads_runtime_role.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_canonical_return_runtime_role.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_canonical_supplier_payment_reads_runtime_role.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_canonical_payment_history_runtime_role.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_canonical_document_history_runtime_role.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_inventory_adjustment_web_runtime_role.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_inventory_destruction_web_runtime_role.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_canonical_inventory_reads_runtime_role.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_canonical_inventory_transfer_runtime_role.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_canonical_inventory_transfer_lifecycle_runtime_role.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_canonical_adjustment_note_runtime_role.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_canonical_bank_reconciliation_runtime_role.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_canonical_expense_claim_lifecycle_runtime_role.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_canonical_evidence_attachment_runtime_role.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_canonical_gst_jurisdiction_runtime_role.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_runtime_deployment_readiness.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_sales_invoice_incremental_definition_guards.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_calculation_schema_c_collation_migration.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_sales_invoice_direct_issue_acceptance.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_sales_dispatch_partial_input_credit_acceptance.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_canonical_demo_replay_hardening.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_application_promotion_content_digest.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_live18_ephemeral_identity_terminal_cleanup.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_partial_input_credit_stock_lineage.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_input_credit_force_rls.py

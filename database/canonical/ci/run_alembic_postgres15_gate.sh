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

test "$(psql -X -Atqc 'SELECT version_num FROM public.alembic_version')" = "20260824_0002"
test "$(psql -X -Atqc "SELECT relrowsecurity::text || '|' || relforcerowsecurity::text FROM pg_catalog.pg_class WHERE oid='public.alembic_version'::regclass")" = "true|true"
test "$(psql -X -Atqc "SELECT has_table_privilege('erp_runtime', 'public.alembic_version', 'SELECT')")" = "f"

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
  python backend/tests/postgres/check_canonical_goods_receipt_runtime_role.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_canonical_supplier_invoice_reads_runtime_role.py
PYTHONPATH=backend \
  python backend/tests/postgres/check_inventory_adjustment_web_runtime_role.py

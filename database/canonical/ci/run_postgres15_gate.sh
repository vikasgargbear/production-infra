#!/usr/bin/env bash
set -euo pipefail

: "${CANONICAL_CI_ALLOW_DISPOSABLE:?set only in the disposable PostgreSQL 15 CI job}"
: "${PGHOST:?}"
: "${PGDATABASE:?}"

case "$PGHOST" in
  127.0.0.1|localhost) ;;
  *) echo "refusing non-local PostgreSQL host: $PGHOST" >&2; exit 2 ;;
esac
test "$PGDATABASE" = canonical_ci || {
  echo "refusing database other than canonical_ci" >&2
  exit 2
}
test "$CANONICAL_CI_ALLOW_DISPOSABLE" = 1 || {
  echo "disposable database opt-in must equal 1" >&2
  exit 2
}

server_major=$(psql -X -Atqc "SHOW server_version_num" | cut -c1-2)
test "$server_major" = 15 || {
  echo "canonical execution gate requires PostgreSQL 15" >&2
  exit 2
}

psql -X -v ON_ERROR_STOP=1 -f database/canonical/ci/bootstrap_supabase_auth.sql

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

python3 backend/scripts/generate_canonical_baseline.py \
  --enforcement-root database/canonical \
  --output "$tmpdir/canonical-baseline.sql"

psql -X -v ON_ERROR_STOP=1 -f "$tmpdir/canonical-baseline.sql"

fixture_count=0
while IFS= read -r fixture; do
  psql -X -v ON_ERROR_STOP=1 -f "$fixture"
  fixture_count=$((fixture_count + 1))
done < <(find database/canonical -type f -name 'test_*.sql' | LC_ALL=C sort)
test "$fixture_count" -gt 0 || {
  echo "no canonical PostgreSQL fixtures were discovered" >&2
  exit 2
}

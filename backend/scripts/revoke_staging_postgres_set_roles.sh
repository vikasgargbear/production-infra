#!/usr/bin/env bash
set -euo pipefail

: "${PSYCOPG_DATABASE_URL:?}"

case "${1:-}" in
  migration-owner)
    grant_sql='GRANT erp_migration_owner TO postgres WITH ADMIN FALSE, SET FALSE, INHERIT FALSE'
    role_filter="'erp_migration_owner'"
    expected_state='1|1|1|1|1|1|1'
    ;;
  migration-owner-runtime)
    grant_sql='GRANT erp_migration_owner, erp_runtime TO postgres WITH ADMIN FALSE, SET FALSE, INHERIT FALSE'
    role_filter="'erp_migration_owner','erp_runtime'"
    expected_state='2|2|2|2|2|2|2'
    ;;
  *)
    echo "unsupported staging PostgreSQL role-cleanup mode" >&2
    exit 2
    ;;
esac

readback_sql="
SELECT count(*)::text || '|' ||
       count(*) FILTER (WHERE membership.set_option IS FALSE)::text || '|' ||
       count(*) FILTER (WHERE membership.inherit_option IS FALSE)::text || '|' ||
       count(*) FILTER (WHERE membership.admin_option IS FALSE)::text || '|' ||
       count(*) FILTER (WHERE member_role.rolsuper IS FALSE)::text || '|' ||
       count(*) FILTER (
         WHERE pg_has_role('postgres', granted_role.oid, 'SET') IS FALSE
       )::text || '|' ||
       count(*) FILTER (
         WHERE pg_has_role('postgres', granted_role.oid, 'USAGE') IS FALSE
       )::text
  FROM pg_catalog.pg_auth_members AS membership
  JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
  JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
 WHERE member_role.rolname = 'postgres'
   AND granted_role.rolname IN (${role_filter})
"
for attempt in 1 2 3; do
  membership_state=''
  if psql -X -v ON_ERROR_STOP=1 "$PSYCOPG_DATABASE_URL" \
    -c "$grant_sql" >/dev/null 2>&1 \
    && membership_state=$(psql -X -v ON_ERROR_STOP=1 -Atq \
      "$PSYCOPG_DATABASE_URL" -c "$readback_sql" 2>/dev/null) \
    && test "$membership_state" = "$expected_state"; then
    exit 0
  fi
  if test "$attempt" -lt 3; then
    sleep $((attempt * 2))
  fi
done

echo "staging PostgreSQL temporary role delegation cleanup was not catalog-attested after three attempts" >&2
exit 1

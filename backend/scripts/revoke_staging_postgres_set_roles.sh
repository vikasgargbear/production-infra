#!/usr/bin/env bash
set -euo pipefail

: "${PSYCOPG_DATABASE_URL:?}"

case "${1:-}" in
  migration-owner)
    grant_sql='GRANT erp_migration_owner TO postgres WITH SET FALSE, INHERIT FALSE'
    role_filter="'erp_migration_owner'"
    expected_state='1|1|1|1|1|1'
    ;;
  migration-owner-runtime)
    grant_sql='GRANT erp_migration_owner, erp_runtime TO postgres WITH SET FALSE, INHERIT FALSE'
    role_filter="'erp_migration_owner','erp_runtime'"
    expected_state='2|2|2|2|2|2'
    ;;
  *)
    echo "unsupported staging PostgreSQL role-cleanup mode" >&2
    exit 2
    ;;
esac

# PostgreSQL 17 can retain multiple grantor-specific membership rows when a
# CREATEROLE bootstrap user creates a target role. ADMIN is standing bootstrap
# authority; this boundary removes and attests only temporary SET/INHERIT use.
readback_sql="
WITH target_memberships AS (
  SELECT granted_role.oid AS role_oid,
         member_role.rolsuper AS member_is_superuser,
         bool_and(membership.set_option IS FALSE) AS all_set_false,
         bool_and(membership.inherit_option IS FALSE) AS all_inherit_false
    FROM pg_catalog.pg_roles AS granted_role
    JOIN pg_catalog.pg_auth_members AS membership
      ON membership.roleid = granted_role.oid
    JOIN pg_catalog.pg_roles AS member_role
      ON member_role.oid = membership.member
   WHERE member_role.rolname = 'postgres'
     AND granted_role.rolname IN (${role_filter})
   GROUP BY granted_role.oid, member_role.rolsuper
)
SELECT count(*)::text || '|' ||
       count(*) FILTER (WHERE all_set_false)::text || '|' ||
       count(*) FILTER (WHERE all_inherit_false)::text || '|' ||
       count(*) FILTER (WHERE member_is_superuser IS FALSE)::text || '|' ||
       count(*) FILTER (
         WHERE pg_has_role('postgres', role_oid, 'SET') IS FALSE
       )::text || '|' ||
       count(*) FILTER (
         WHERE pg_has_role('postgres', role_oid, 'USAGE') IS FALSE
       )::text
  FROM target_memberships
"
last_reason='grant_failed'
last_state='unavailable'
for attempt in 1 2 3; do
  membership_state=''
  if ! psql -X -v ON_ERROR_STOP=1 "$PSYCOPG_DATABASE_URL" \
    -c "$grant_sql" >/dev/null 2>&1; then
    last_reason='grant_failed'
  elif ! membership_state=$(psql -X -v ON_ERROR_STOP=1 -Atq \
    "$PSYCOPG_DATABASE_URL" -c "$readback_sql" 2>/dev/null); then
    last_reason='readback_failed'
  elif [[ "$membership_state" =~ ^[0-9]+(\|[0-9]+){5}$ ]]; then
    last_state=$membership_state
    last_reason='state_mismatch'
  else
    last_reason='malformed_readback'
  fi
  if test "$membership_state" = "$expected_state"; then
    exit 0
  fi
  if test "$attempt" -lt 3; then
    sleep $((attempt * 2))
  fi
done

echo "staging PostgreSQL temporary role delegation cleanup was not catalog-attested after three attempts; reason=${last_reason}; state=${last_state}" >&2
exit 1

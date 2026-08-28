#!/usr/bin/env bash
set -euo pipefail

action="${1:?write-fence action is required}"
commit_sha="${2:?commit SHA is required}"
receipt="${3:?receipt path is required}"
: "${PSYCOPG_DATABASE_URL:?}"

case "$action" in
  close|provision|open|status) ;;
  *) echo "unsupported canonical write-fence action" >&2; exit 2 ;;
esac

cleanup_fence_role_membership() {
  bash backend/scripts/revoke_staging_postgres_set_roles.sh migration-owner
}
cleanup_fence_role_on_exit() {
  local prior_status=$?
  trap - EXIT
  if ! cleanup_fence_role_membership; then
    echo "canonical staging retained unverified write-fence role delegation" >&2
    exit 1
  fi
  exit "$prior_status"
}
trap cleanup_fence_role_on_exit EXIT

psql -X -v ON_ERROR_STOP=1 "$PSYCOPG_DATABASE_URL" \
  -c 'GRANT erp_migration_owner TO postgres WITH SET TRUE, INHERIT FALSE' \
  >/dev/null
python3 backend/scripts/manage_canonical_write_fence.py "$action" \
  --commit-sha "$commit_sha" \
  --receipt "$receipt"

if ! cleanup_fence_role_membership; then
  trap - EXIT
  echo "canonical staging retained unverified write-fence role delegation" >&2
  exit 1
fi
trap - EXIT

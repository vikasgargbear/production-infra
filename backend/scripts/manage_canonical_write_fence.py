#!/usr/bin/env python3
"""Close or open the canonical staging write boundary during deployment.

Render cannot replace a suspended service without briefly resuming its current
artifact.  The database fence makes that interval read-only for every
application/service role by revoking schema usage from every canonical command
schema.  Opening the fence restores the exact Alembic-owned grant matrix; it
never copies mutable ACL state from the database.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Final

import psycopg2
from psycopg2 import sql


MIGRATION_OWNER: Final = "erp_migration_owner"
MANAGED_PRINCIPALS: Final = (
    "erp_app",
    "erp_runtime",
    "erp_calculator",
    "erp_regulatory_importer",
    "erp_tax_provider",
)
LOGIN_PRINCIPALS: Final = tuple(
    principal for principal in MANAGED_PRINCIPALS if principal != "erp_app"
)
COMMAND_SCHEMA_GRANTS: Final[dict[str, tuple[str, ...]]] = {
    "erp_automation_commands": ("erp_runtime", "erp_calculator"),
    "erp_compliance_commands": ("erp_app", "erp_runtime"),
    "erp_core_commands": ("erp_app",),
    "erp_regulatory_commands": ("erp_app", "erp_regulatory_importer"),
    "erp_finance_commands": ("erp_app",),
    "erp_commercial_commands": ("erp_app", "erp_runtime"),
    "erp_trade_commands": ("erp_app", "erp_runtime"),
    "erp_trade_commands_v2": ("erp_app", "erp_runtime"),
    "erp_tax_provider_commands": ("erp_app", "erp_tax_provider"),
    "erp_master_commands": ("erp_runtime",),
}
EXPECTED_OPEN_EFFECTIVE_USAGE: Final[dict[str, tuple[str, ...]]] = {
    schema: tuple(
        principal
        for principal in MANAGED_PRINCIPALS
        if principal in direct_grants
        or (principal == "erp_runtime" and "erp_app" in direct_grants)
    )
    for schema, direct_grants in COMMAND_SCHEMA_GRANTS.items()
}
FENCE_LOCK_KEY: Final = 8_260_826_1


class FenceError(RuntimeError):
    """Raised when the declarative write-fence contract is not satisfied."""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _validate_commit_sha(value: str) -> str:
    if re.fullmatch(r"[0-9a-f]{40}", value) is None:
        raise FenceError("commit SHA must be 40 lowercase hexadecimal characters")
    return value


def _psycopg_dsn(value: str) -> str:
    """Accept the repository's SQLAlchemy URL without weakening DSN parsing."""
    prefix = "postgresql+psycopg2://"
    return "postgresql://" + value[len(prefix) :] if value.startswith(prefix) else value


def _assert_catalog(cursor: Any) -> None:
    cursor.execute(
        """
        SELECT namespace.nspname, owner.rolname
          FROM pg_catalog.pg_namespace AS namespace
          JOIN pg_catalog.pg_roles AS owner ON owner.oid=namespace.nspowner
         WHERE namespace.nspname = ANY(%s)
         ORDER BY namespace.nspname
        """,
        (list(COMMAND_SCHEMA_GRANTS),),
    )
    rows = cursor.fetchall()
    observed = {str(schema): str(owner) for schema, owner in rows}
    if set(observed) != set(COMMAND_SCHEMA_GRANTS):
        missing = sorted(set(COMMAND_SCHEMA_GRANTS) - set(observed))
        raise FenceError(f"canonical command schema set is incomplete: {missing}")
    wrong_owners = sorted(
        schema for schema, owner in observed.items() if owner != MIGRATION_OWNER
    )
    if wrong_owners:
        raise FenceError(
            "canonical command schemas have unexpected owners: "
            + ", ".join(wrong_owners)
        )

    cursor.execute(
        "SELECT rolname FROM pg_catalog.pg_roles WHERE rolname = ANY(%s)",
        (list(MANAGED_PRINCIPALS),),
    )
    principals = {str(row[0]) for row in cursor.fetchall()}
    if principals != set(MANAGED_PRINCIPALS):
        missing = sorted(set(MANAGED_PRINCIPALS) - principals)
        raise FenceError(f"canonical service role set is incomplete: {missing}")


def _set_usage(cursor: Any, *, open_fence: bool) -> None:
    all_principals = sql.SQL(", ").join(
        sql.Identifier(principal) for principal in MANAGED_PRINCIPALS
    )
    for schema_name, allowed_principals in COMMAND_SCHEMA_GRANTS.items():
        cursor.execute(
            sql.SQL("REVOKE USAGE ON SCHEMA {} FROM PUBLIC, {}").format(
                sql.Identifier(schema_name), all_principals
            )
        )
        if open_fence:
            cursor.execute(
                sql.SQL("GRANT USAGE ON SCHEMA {} TO {}").format(
                    sql.Identifier(schema_name),
                    sql.SQL(", ").join(
                        sql.Identifier(principal)
                        for principal in allowed_principals
                    ),
                )
            )


def _set_runtime_membership(cursor: Any, *, open_fence: bool) -> None:
    cursor.execute(
        "GRANT erp_app TO erp_runtime"
        if open_fence
        else "REVOKE erp_app FROM erp_runtime"
    )


def _runtime_inherits_app(cursor: Any) -> bool:
    cursor.execute("SELECT pg_catalog.pg_has_role('erp_runtime','erp_app','USAGE')")
    return bool(cursor.fetchone()[0])


def _service_mutation_privileges(cursor: Any) -> dict[str, dict[str, int]]:
    result: dict[str, dict[str, int]] = {}
    for principal in LOGIN_PRINCIPALS:
        cursor.execute(
            """
            SELECT count(*)
              FROM pg_catalog.pg_class AS relation
              JOIN pg_catalog.pg_namespace AS namespace
                ON namespace.oid=relation.relnamespace
             WHERE namespace.nspname NOT IN ('pg_catalog','information_schema')
               AND namespace.nspname NOT LIKE 'pg_toast%%'
               AND relation.relkind IN ('r','p','v','m','f')
               AND (
                 pg_catalog.has_table_privilege(%s,relation.oid,'INSERT') OR
                 pg_catalog.has_table_privilege(%s,relation.oid,'UPDATE') OR
                 pg_catalog.has_table_privilege(%s,relation.oid,'DELETE') OR
                 pg_catalog.has_table_privilege(%s,relation.oid,'TRUNCATE') OR
                 pg_catalog.has_table_privilege(%s,relation.oid,'REFERENCES') OR
                 pg_catalog.has_table_privilege(%s,relation.oid,'TRIGGER')
               )
            """,
            (principal,) * 6,
        )
        table_count = int(cursor.fetchone()[0])
        cursor.execute(
            """
            SELECT count(*)
              FROM pg_catalog.pg_class AS relation
              JOIN pg_catalog.pg_namespace AS namespace
                ON namespace.oid=relation.relnamespace
             WHERE namespace.nspname NOT IN ('pg_catalog','information_schema')
               AND namespace.nspname NOT LIKE 'pg_toast%%'
               AND relation.relkind='S'
               AND (
                 pg_catalog.has_sequence_privilege(%s,relation.oid,'USAGE') OR
                 pg_catalog.has_sequence_privilege(%s,relation.oid,'UPDATE')
               )
            """,
            (principal, principal),
        )
        sequence_count = int(cursor.fetchone()[0])
        result[principal] = {
            "table_or_view_mutation_count": table_count,
            "sequence_mutation_count": sequence_count,
        }
    return result


def _read_matrix(cursor: Any) -> dict[str, dict[str, bool]]:
    matrix: dict[str, dict[str, bool]] = {}
    for schema_name in COMMAND_SCHEMA_GRANTS:
        cursor.execute(
            """
            SELECT COALESCE(pg_catalog.bool_or(acl.privilege_type='USAGE'),false)
              FROM pg_catalog.pg_namespace AS namespace
              LEFT JOIN LATERAL pg_catalog.aclexplode(namespace.nspacl) AS acl
                ON acl.grantee=0
             WHERE namespace.nspname=%s
            """,
            (schema_name,),
        )
        row: dict[str, bool] = {"public": bool(cursor.fetchone()[0])}
        for principal in MANAGED_PRINCIPALS:
            cursor.execute(
                "SELECT pg_catalog.has_schema_privilege(%s,%s,'USAGE')",
                (principal, schema_name),
            )
            row[principal] = bool(cursor.fetchone()[0])
        matrix[schema_name] = row
    return matrix


def _validate_matrix(
    matrix: dict[str, dict[str, bool]], *, open_fence: bool
) -> None:
    for schema_name, row in matrix.items():
        expected = (
            set(EXPECTED_OPEN_EFFECTIVE_USAGE[schema_name]) if open_fence else set()
        )
        actual = {principal for principal, allowed in row.items() if allowed}
        if actual != expected:
            raise FenceError(
                f"canonical write-fence ACL mismatch for {schema_name}: "
                f"expected={sorted(expected)} actual={sorted(actual)}"
            )


def apply_fence(
    database_url: str,
    *,
    action: str,
    commit_sha: str,
) -> dict[str, Any]:
    commit_sha = _validate_commit_sha(commit_sha)
    if action not in {"close", "open", "status"}:
        raise FenceError("write-fence action must be close, open, or status")

    with psycopg2.connect(_psycopg_dsn(database_url), connect_timeout=15) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_catalog.pg_advisory_xact_lock(%s)", (FENCE_LOCK_KEY,))
            _assert_catalog(cursor)
            if action != "status":
                _set_runtime_membership(cursor, open_fence=action == "open")
                cursor.execute("SET LOCAL ROLE erp_migration_owner")
                _set_usage(cursor, open_fence=action == "open")
            else:
                cursor.execute("SET LOCAL ROLE erp_migration_owner")
            matrix = _read_matrix(cursor)
            runtime_inherits_app = _runtime_inherits_app(cursor)
            mutation_privileges = _service_mutation_privileges(cursor)
            if action != "status":
                _validate_matrix(matrix, open_fence=action == "open")
            if action == "close":
                if runtime_inherits_app:
                    raise FenceError(
                        "closed write fence retained erp_runtime membership in erp_app"
                    )
                offenders = {
                    principal: counts
                    for principal, counts in mutation_privileges.items()
                    if any(counts.values())
                }
                if offenders:
                    raise FenceError(
                        "closed write fence retained effective service mutation privileges: "
                        + json.dumps(offenders, sort_keys=True, separators=(",", ":"))
                    )
            elif action == "open" and not runtime_inherits_app:
                raise FenceError(
                    "open write fence did not restore erp_runtime membership in erp_app"
                )

            schema_usage_open = all(
                {
                    principal for principal, allowed in row.items() if allowed
                } == set(EXPECTED_OPEN_EFFECTIVE_USAGE[schema_name])
                for schema_name, row in matrix.items()
            )
            schema_usage_closed = not any(
                allowed for row in matrix.values() for allowed in row.values()
            )
            no_service_mutations = not any(
                count
                for counts in mutation_privileges.values()
                for count in counts.values()
            )
            state = (
                "open"
                if schema_usage_open and runtime_inherits_app
                else "closed"
                if schema_usage_closed
                and not runtime_inherits_app
                and no_service_mutations
                else "drifted"
            )
            if action == "status" and state == "drifted":
                raise FenceError("canonical write-fence ACL matrix is drifted")
            if action != "status" and state != action.replace("close", "closed"):
                raise FenceError(f"canonical write fence did not reach {action} state")
    return {
        "version": 1,
        "commit_sha": commit_sha,
        "action": action,
        "state": state,
        "verified_at": _utc_now(),
        "command_schema_grants": {
            schema: list(principals)
            for schema, principals in COMMAND_SCHEMA_GRANTS.items()
        },
        "effective_usage": matrix,
        "runtime_inherits_erp_app": runtime_inherits_app,
        "service_mutation_privileges": mutation_privileges,
    }


def _write_receipt(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(payload, output, indent=2, sort_keys=True)
            output.write("\n")
        os.replace(temporary, path)
        path.chmod(0o600)
    finally:
        temporary.unlink(missing_ok=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("close", "open", "status"))
    parser.add_argument("--database-url", default=os.getenv("PSYCOPG_DATABASE_URL", ""))
    parser.add_argument("--commit-sha", required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.database_url:
        raise FenceError("PSYCOPG_DATABASE_URL is required")
    payload = apply_fence(
        args.database_url,
        action=args.action,
        commit_sha=args.commit_sha,
    )
    _write_receipt(args.receipt, payload)
    print(json.dumps({"state": payload["state"], "commit_sha": payload["commit_sha"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

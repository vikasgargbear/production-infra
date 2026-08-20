#!/usr/bin/env python3
"""Generate the reviewed PostgreSQL runtime-role and RLS contract.

This generator never connects to a database. It binds generated SQL and the
machine-readable policy mapping to the complete canonical column catalog.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any


SECURITY_ROOT = Path(__file__).resolve().parent
CANONICAL_ROOT = SECURITY_ROOT.parent
DOMAIN_ROOT = CANONICAL_ROOT / "domains"
AUTHORITY_PATH = CANONICAL_ROOT / "model-v1.json"
DEFAULT_SQL_PATH = SECURITY_ROOT / "canonical_rls.sql"
DEFAULT_MANIFEST_PATH = SECURITY_ROOT / "policy-manifest.json"
DEFAULT_BASELINE_MAPPING_PATH = SECURITY_ROOT / "baseline-platform-enforcements.json"
IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")
RLS_CLASSES = {
    "tenant_membership",
    "organization_membership",
    "user_shared_membership",
    "global_reference_read_only",
}


class ContractError(RuntimeError):
    """The canonical catalog cannot safely produce the security contract."""


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"), sort_keys=True)


def _quote(value: str) -> str:
    if not IDENTIFIER.fullmatch(value):
        raise ContractError(f"unsafe PostgreSQL identifier: {value!r}")
    return f'"{value}"'


def _qualified(value: str) -> str:
    parts = value.split(".")
    if len(parts) != 2:
        raise ContractError(f"table is not schema-qualified: {value!r}")
    return ".".join(_quote(part) for part in parts)


def load_catalog() -> tuple[dict[str, Any], list[dict[str, Any]], str]:
    try:
        contract = json.loads((DOMAIN_ROOT / "_contract.json").read_text(encoding="utf-8"))
        authority = json.loads(AUTHORITY_PATH.read_text(encoding="utf-8"))
        documents = [
            json.loads((DOMAIN_ROOT / filename).read_text(encoding="utf-8"))
            for filename in contract["domain_files"]
        ]
    except (OSError, KeyError, json.JSONDecodeError) as exc:
        raise ContractError(f"cannot load canonical catalog: {exc}") from exc

    tables = [table for document in documents for table in document.get("tables", [])]
    expected = {
        name
        for domain_tables in authority["canonical_tables"].values()
        for name in domain_tables
    }
    names = [table.get("name") for table in tables]
    declared_count = contract.get("table_count")
    if (
        not isinstance(declared_count, int)
        or declared_count <= 0
        or len(tables) != declared_count
        or len(expected) != declared_count
    ):
        raise ContractError(
            "security contract requires the exact contract- and authority-declared table set"
        )
    if len(set(names)) != len(names) or set(names) != expected:
        raise ContractError("canonical table names are duplicated or differ from model-v1.json")

    for table in tables:
        rls = table.get("rls", {})
        if rls.get("class") not in RLS_CLASSES:
            raise ContractError(f"{table['name']}: unsupported RLS class")
        columns = {column[0] for column in table.get("columns", [])}
        if rls["class"] == "tenant_membership":
            command_only = table["name"] == "calculation.artifacts"
            if "org_id" not in columns or (not command_only and not rls.get("write_permission")):
                raise ContractError(f"{table['name']}: incomplete tenant RLS metadata")
        elif rls["class"] == "global_reference_read_only":
            if rls.get("write_permission") is not None:
                raise ContractError(f"{table['name']}: global reference cannot be runtime-writable")
            if table.get("population_mode") not in contract["global_reference_population_modes"]:
                raise ContractError(f"{table['name']}: global reference population mode is missing")
        elif not rls.get("write_permission"):
            raise ContractError(f"{table['name']}: identity RLS requires write_permission")

    ordered = sorted(tables, key=lambda item: item["name"])
    hash_payload = {
        "contract": contract,
        "authority_tables": authority["canonical_tables"],
        "tables": ordered,
    }
    catalog_hash = hashlib.sha256(_canonical_json(hash_payload).encode("utf-8")).hexdigest()
    return contract, ordered, catalog_hash


def _policy_mapping(table: dict[str, Any]) -> dict[str, Any]:
    name = table["name"]
    columns = {column[0] for column in table["columns"]}
    rls_class = table["rls"]["class"]
    branch_column: str | None = None
    if "branch_id" in columns:
        branch_column = "branch_id"
    elif name == "core.branches":
        branch_column = "id"

    invariant_text = " ".join(
        invariant["rule"].lower() for invariant in table.get("cross_row_invariants", [])
    )
    lifecycle_is_stateless = table.get("lifecycle", {}).get("state_column") is None
    rejection_language = any(token in invariant_text for token in ("block", "reject", "cannot"))
    privilege_insert_only = (
        lifecycle_is_stateless
        and rejection_language
        and "update" in invariant_text
        and "delete" in invariant_text
    )

    hard_delete = table["retention"]["hard_delete"] is True
    if name == "calculation.artifacts":
        policies = ["SELECT"]
        grants = ["SELECT"]
        mutation_enforcement = "restricted_security_definer_commands_only"
    elif table["mutation_class"] == "provider_evidence_state_machine":
        policies = ["SELECT"]
        grants = ["SELECT"]
        mutation_enforcement = "isolated_provider_security_definer_commands_only"
    elif rls_class == "global_reference_read_only":
        policies = ["SELECT"]
        grants = ["SELECT"]
        mutation_enforcement = (
            "regulated_import_security_definer_only"
            if table["population_mode"] == "regulated_import"
            else "application_seed_migration_owned_read_only"
        )
    elif name == "core.organizations":
        policies = ["SELECT", "UPDATE"]
        grants = ["SELECT", "UPDATE"]
        mutation_enforcement = "owner_bootstrap_runtime_update_no_delete"
    elif privilege_insert_only:
        policies = ["SELECT", "INSERT"]
        grants = ["SELECT", "INSERT"]
        mutation_enforcement = "database_privilege_insert_only"
    elif hard_delete and table["mutation_class"] == "replaceable_authorization_link":
        policies = ["SELECT", "INSERT", "DELETE"]
        grants = ["SELECT", "INSERT", "DELETE"]
        mutation_enforcement = "reviewed_replaceable_hard_delete"
    elif hard_delete and table["mutation_class"] == "projector_only_rebuildable":
        policies = ["SELECT", "INSERT", "UPDATE", "DELETE"]
        grants = ["SELECT", "INSERT", "UPDATE", "DELETE"]
        mutation_enforcement = "reviewed_projection_rebuild"
    else:
        policies = ["SELECT", "INSERT", "UPDATE"]
        grants = ["SELECT", "INSERT", "UPDATE"]
        mutation_enforcement = "retained_update_no_delete_with_trigger_guard_pending"
    return {
        "table": name,
        "tenant_class": table["tenant_class"],
        "mutation_class": table["mutation_class"],
        "mutation_enforcement": mutation_enforcement,
        "population_mode": table.get("population_mode"),
        "rls_class": rls_class,
        "force_rls": bool(table["rls"]["force"]),
        "branch_scope_column": branch_column,
        "write_permission": table["rls"]["write_permission"],
        "runtime_grants": grants,
        "policies": policies,
    }


def build_manifest(tables: list[dict[str, Any]], catalog_hash: str) -> dict[str, Any]:
    mappings = [_policy_mapping(table) for table in tables]
    return {
        "contract_version": "1.0.0",
        "status": "reviewed_not_applied",
        "postgresql": "15+",
        "catalog_sha256": catalog_hash,
        "catalog_table_count": len(tables),
        "runtime_roles": {
            "migration_owner": "erp_migration_owner",
            "application_privilege_role": "erp_app",
            "runtime_login_role": "erp_runtime",
        },
        "session_context": {
            "auth_user_setting": "app.auth_user_id",
            "user_setting": "app.user_id",
            "organization_setting": "app.org_id",
            "membership_setting": "app.membership_id",
            "required_scope": "SET LOCAL inside every runtime transaction",
            "activation_authority": "verified Supabase auth user plus requested organization; membership is resolved internally",
            "missing_or_invalid_behavior": "authorization failure before tenant context is activated",
        },
        "identity_sequences": {
            "count": 0,
            "reason": "Canonical keys are UUID or controlled natural codes; no serial/identity/nextval defaults exist.",
            "runtime_sequence_grants": [],
        },
        "identity_provisioning": {
            "runtime_organization_insert": False,
            "path": "Bounded erp_migration_owner transaction creates organization, initial user/membership and organization-scoped access grant atomically.",
        },
        "postgres15_execution_gate": {
            "status": "required_on_disposable_clean_database",
            "fixture": "test_rls_negative.sql",
            "server_major": 15,
            "live_database_allowed": False,
        },
        "tables": mappings,
    }


def _function_sql() -> list[str]:
    return [
        """CREATE FUNCTION "erp_security"."current_org_id"()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
    value text;
BEGIN
    value := pg_catalog.current_setting('app.org_id', true);
    IF value IS NULL OR pg_catalog.btrim(value) = '' THEN
        RETURN NULL;
    END IF;
    BEGIN
        RETURN value::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
        RETURN NULL;
    END;
END;
$function$;""",
        """CREATE FUNCTION "erp_security"."current_membership_id"()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
    value text;
BEGIN
    value := pg_catalog.current_setting('app.membership_id', true);
    IF value IS NULL OR pg_catalog.btrim(value) = '' THEN
        RETURN NULL;
    END IF;
    BEGIN
        RETURN value::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
        RETURN NULL;
    END;
END;
$function$;""",
        """CREATE FUNCTION "erp_security"."is_active_membership"(organization_id uuid, membership_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $function$
    SELECT organization_id IS NOT NULL
       AND membership_id IS NOT NULL
       AND EXISTS (
            SELECT 1
              FROM core.memberships AS membership
              JOIN core.organizations AS organization
                ON organization.id = membership.org_id
             WHERE membership.org_id = organization_id
               AND membership.id = membership_id
               AND membership.status = 'active'
               AND membership.joined_at IS NOT NULL
               AND membership.revoked_at IS NULL
               AND organization.status = 'active'
       );
$function$;""",
        """CREATE FUNCTION "erp_security"."current_actor_is_active"()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $function$
    SELECT erp_security.is_active_membership(
        erp_security.current_org_id(),
        erp_security.current_membership_id()
    );
$function$;""",
        """CREATE FUNCTION "erp_security"."activate_context"(verified_auth_user_id uuid, requested_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $function$
DECLARE
    resolved_user_id uuid;
    resolved_membership_id uuid;
BEGIN
    IF verified_auth_user_id IS NULL OR requested_organization_id IS NULL THEN
        RAISE EXCEPTION 'invalid or inactive ERP authenticated organization membership'
            USING ERRCODE = '42501';
    END IF;

    BEGIN
        SELECT user_row.id, membership.id
          INTO STRICT resolved_user_id, resolved_membership_id
          FROM core.users AS user_row
          JOIN core.memberships AS membership
            ON membership.user_id = user_row.id
          JOIN core.organizations AS organization
            ON organization.id = membership.org_id
         WHERE user_row.auth_user_id = verified_auth_user_id
           AND user_row.status = 'active'
           AND membership.org_id = requested_organization_id
           AND membership.status = 'active'
           AND membership.joined_at IS NOT NULL
           AND membership.revoked_at IS NULL
           AND organization.status = 'active';
    EXCEPTION
        WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
            RAISE EXCEPTION 'invalid or inactive ERP authenticated organization membership'
                USING ERRCODE = '42501';
    END;

    PERFORM pg_catalog.set_config('app.auth_user_id', verified_auth_user_id::text, true);
    PERFORM pg_catalog.set_config('app.user_id', resolved_user_id::text, true);
    PERFORM pg_catalog.set_config('app.org_id', requested_organization_id::text, true);
    PERFORM pg_catalog.set_config('app.membership_id', resolved_membership_id::text, true);
END;
$function$;""",
        """CREATE FUNCTION "erp_security"."current_user_id"()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $function$
    SELECT membership.user_id
      FROM core.memberships AS membership
     WHERE membership.org_id = erp_security.current_org_id()
       AND membership.id = erp_security.current_membership_id()
       AND membership.status = 'active'
       AND erp_security.current_actor_is_active();
$function$;""",
        """CREATE FUNCTION "erp_security"."can_access_branch"(target_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $function$
    SELECT erp_security.is_active_membership(
               erp_security.current_org_id(), erp_security.current_membership_id()
           )
       AND (
            target_branch_id IS NULL
            OR EXISTS (
                SELECT 1
                  FROM core.access_grants AS grant_row
                  JOIN core.roles AS role_row
                    ON role_row.org_id = grant_row.org_id
                   AND role_row.id = grant_row.role_id
                 WHERE grant_row.org_id = erp_security.current_org_id()
                   AND grant_row.membership_id = erp_security.current_membership_id()
                   AND grant_row.status = 'active'
                   AND role_row.status = 'active'
                   AND grant_row.valid_from_at <= pg_catalog.transaction_timestamp()
                   AND (grant_row.expires_at IS NULL OR grant_row.expires_at > pg_catalog.transaction_timestamp())
                   AND (
                        grant_row.scope_kind = 'organization'
                        OR (grant_row.scope_kind = 'branch' AND grant_row.branch_id = target_branch_id)
                   )
            )
       );
$function$;""",
        """CREATE FUNCTION "erp_security"."has_permission"(permission_code text, target_branch_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $function$
    SELECT erp_security.is_active_membership(
               erp_security.current_org_id(), erp_security.current_membership_id()
           )
       AND EXISTS (
            SELECT 1
              FROM core.access_grants AS grant_row
              JOIN core.roles AS role_row
                ON role_row.org_id = grant_row.org_id
               AND role_row.id = grant_row.role_id
              JOIN core.role_permissions AS role_permission
                ON role_permission.org_id = role_row.org_id
               AND role_permission.role_id = role_row.id
              JOIN core.permissions AS permission_row
                ON permission_row.code = role_permission.permission_code
             WHERE grant_row.org_id = erp_security.current_org_id()
               AND grant_row.membership_id = erp_security.current_membership_id()
               AND grant_row.status = 'active'
               AND role_row.status = 'active'
               AND permission_row.status = 'active'
               AND role_permission.permission_code = permission_code
               AND grant_row.valid_from_at <= pg_catalog.transaction_timestamp()
               AND (grant_row.expires_at IS NULL OR grant_row.expires_at > pg_catalog.transaction_timestamp())
               AND (
                    (target_branch_id IS NULL AND grant_row.scope_kind = 'organization')
                    OR (
                        target_branch_id IS NOT NULL
                        AND (
                            grant_row.scope_kind = 'organization'
                            OR (grant_row.scope_kind = 'branch' AND grant_row.branch_id = target_branch_id)
                        )
                    )
               )
       );
$function$;""",
        """CREATE FUNCTION "erp_security"."can_view_user"(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $function$
    SELECT erp_security.is_active_membership(
               erp_security.current_org_id(), erp_security.current_membership_id()
           )
       AND EXISTS (
            SELECT 1
              FROM core.memberships AS actor_membership
              JOIN core.memberships AS target_membership
                ON target_membership.org_id = actor_membership.org_id
             WHERE actor_membership.org_id = erp_security.current_org_id()
               AND actor_membership.id = erp_security.current_membership_id()
               AND actor_membership.status = 'active'
               AND target_membership.user_id = target_user_id
       );
$function$;""",
    ]


def _tenant_predicate(mapping: dict[str, Any], *, write: bool) -> str:
    predicate = (
        '"org_id" = erp_security.current_org_id() '
        "AND erp_security.current_actor_is_active()"
    )
    branch_column = mapping["branch_scope_column"]
    if branch_column:
        predicate += f' AND erp_security.can_access_branch("{branch_column}")'
    if write:
        branch_arg = f'"{branch_column}"' if branch_column else "NULL::uuid"
        permission = mapping["write_permission"].replace("'", "''")
        predicate += f" AND erp_security.has_permission('{permission}', {branch_arg})"
    return predicate


def _table_policy_sql(mapping: dict[str, Any]) -> list[str]:
    table = _qualified(mapping["table"])
    rls_class = mapping["rls_class"]
    statements = [f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;"]
    if mapping["force_rls"]:
        statements.append(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY;")

    if mapping["table"] == "calculation.artifacts":
        visible = (
            '"org_id" = erp_security.current_org_id() '
            "AND erp_security.current_actor_is_active() "
            'AND erp_security.can_access_branch("branch_id")'
        )
        statements.append(
            f'CREATE POLICY "erp_select" ON {table} FOR SELECT TO "erp_app" USING ({visible});'
        )
        return statements

    if mapping["mutation_class"] == "provider_evidence_state_machine":
        visible = _tenant_predicate(mapping, write=False)
        statements.append(
            f'CREATE POLICY "erp_select" ON {table} FOR SELECT TO "erp_app" USING ({visible});'
        )
        return statements

    if rls_class == "global_reference_read_only":
        statements.append(
            f"CREATE POLICY \"erp_select\" ON {table} FOR SELECT TO \"erp_app\" USING (true);"
        )
        return statements

    if rls_class == "organization_membership":
        visible = (
            '"id" = erp_security.current_org_id() '
            "AND erp_security.current_actor_is_active()"
        )
        writable = visible + (
            " AND erp_security.has_permission('core.organization.manage', NULL::uuid)"
        )
        statements.append(
            f"CREATE POLICY \"erp_select\" ON {table} FOR SELECT TO \"erp_app\" USING ({visible});"
        )
        if "INSERT" in mapping["policies"]:
            statements.append(
                f"CREATE POLICY \"erp_insert\" ON {table} FOR INSERT TO \"erp_app\" WITH CHECK (false);"
            )
        if "UPDATE" in mapping["policies"]:
            statements.append(
                f"CREATE POLICY \"erp_update\" ON {table} FOR UPDATE TO \"erp_app\" USING ({writable}) WITH CHECK ({writable});"
            )
        if "DELETE" in mapping["policies"]:
            statements.append(
                f"CREATE POLICY \"erp_delete\" ON {table} FOR DELETE TO \"erp_app\" USING ({writable});"
            )
        return statements

    if rls_class == "user_shared_membership":
        visible = 'erp_security.can_view_user("id")'
        permission = "erp_security.has_permission('core.user.manage', NULL::uuid)"
        writable = f"{visible} AND {permission}"
        statements.append(
            f"CREATE POLICY \"erp_select\" ON {table} FOR SELECT TO \"erp_app\" USING ({visible});"
        )
        if "INSERT" in mapping["policies"]:
            statements.append(
                f"CREATE POLICY \"erp_insert\" ON {table} FOR INSERT TO \"erp_app\" WITH CHECK (erp_security.current_actor_is_active() AND {permission});"
            )
        if "UPDATE" in mapping["policies"]:
            statements.append(
                f"CREATE POLICY \"erp_update\" ON {table} FOR UPDATE TO \"erp_app\" USING ({writable}) WITH CHECK ({writable});"
            )
        if "DELETE" in mapping["policies"]:
            statements.append(
                f"CREATE POLICY \"erp_delete\" ON {table} FOR DELETE TO \"erp_app\" USING ({writable});"
            )
        return statements

    visible = _tenant_predicate(mapping, write=False)
    writable = _tenant_predicate(mapping, write=True)
    statements.extend(
        [
            f"CREATE POLICY \"erp_select\" ON {table} FOR SELECT TO \"erp_app\" USING ({visible});",
            f"CREATE POLICY \"erp_insert\" ON {table} FOR INSERT TO \"erp_app\" WITH CHECK ({writable});",
        ]
    )
    if "UPDATE" in mapping["policies"]:
        statements.append(
            f"CREATE POLICY \"erp_update\" ON {table} FOR UPDATE TO \"erp_app\" USING ({writable}) WITH CHECK ({writable});"
        )
    if "DELETE" in mapping["policies"]:
        statements.append(
            f"CREATE POLICY \"erp_delete\" ON {table} FOR DELETE TO \"erp_app\" USING ({writable});"
        )
    return statements


PRIVATE_FUNCTION_SIGNATURES = (
    '"erp_security"."is_active_membership"(uuid, uuid)',
)
RUNTIME_FUNCTION_SIGNATURES = (
    '"erp_security"."current_org_id"()',
    '"erp_security"."current_membership_id"()',
    '"erp_security"."current_actor_is_active"()',
    '"erp_security"."activate_context"(uuid, uuid)',
    '"erp_security"."current_user_id"()',
    '"erp_security"."can_access_branch"(uuid)',
    '"erp_security"."has_permission"(text, uuid)',
    '"erp_security"."can_view_user"(uuid)',
)


def _function_ownership_sql() -> list[str]:
    statements: list[str] = []
    for signature in PRIVATE_FUNCTION_SIGNATURES:
        statements.extend(
            [
                f'REVOKE ALL ON FUNCTION {signature} FROM PUBLIC, "erp_app", "erp_runtime";',
                f'ALTER FUNCTION {signature} OWNER TO "erp_migration_owner";',
            ]
        )
    for signature in RUNTIME_FUNCTION_SIGNATURES:
        statements.extend(
            [
                f'REVOKE ALL ON FUNCTION {signature} FROM PUBLIC;',
                f'ALTER FUNCTION {signature} OWNER TO "erp_migration_owner";',
            ]
        )
    return statements


def _runtime_grant_sql(mappings: list[dict[str, Any]], schemas: list[str]) -> list[str]:
    statements: list[str] = [
        'REVOKE "erp_migration_owner" FROM "erp_app", "erp_runtime";',
    ]
    for schema in schemas:
        statements.extend(
            [
                f'REVOKE ALL ON SCHEMA {_quote(schema)} FROM PUBLIC;',
                f'GRANT USAGE ON SCHEMA {_quote(schema)} TO "erp_app";',
                f'ALTER SCHEMA {_quote(schema)} OWNER TO "erp_migration_owner";',
            ]
        )
    statements.append('GRANT USAGE ON SCHEMA "erp_security" TO "erp_app";')
    for mapping in mappings:
        table = _qualified(mapping["table"])
        statements.extend(
            [
                f'REVOKE ALL ON TABLE {table} FROM PUBLIC, "erp_app", "erp_runtime";',
                f'GRANT {", ".join(mapping["runtime_grants"])} ON TABLE {table} TO "erp_app";',
                f'ALTER TABLE {table} OWNER TO "erp_migration_owner";',
            ]
        )
    for signature in RUNTIME_FUNCTION_SIGNATURES:
        statements.append(f'GRANT EXECUTE ON FUNCTION {signature} TO "erp_app";')
    for schema in schemas:
        statements.append(
            f'ALTER DEFAULT PRIVILEGES FOR ROLE "erp_migration_owner" IN SCHEMA {_quote(schema)} REVOKE ALL ON TABLES FROM PUBLIC;'
        )
    statements.append(
        'ALTER DEFAULT PRIVILEGES FOR ROLE "erp_migration_owner" IN SCHEMA "erp_security" REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;'
    )
    return statements


def _load_baseline_requirements(contract: dict[str, Any], tables: list[dict[str, Any]]) -> dict[str, dict[str, str]]:
    path = SECURITY_ROOT.parents[2] / "backend" / "scripts" / "generate_canonical_baseline.py"
    spec = importlib.util.spec_from_file_location("canonical_baseline_for_security", path)
    if spec is None or spec.loader is None:
        raise ContractError(f"cannot import baseline generator: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    catalog = SimpleNamespace(contract=contract, tables=tuple(tables))
    return module._platform_requirements(catalog)


def build_baseline_mapping(
    contract: dict[str, Any], manifest: dict[str, Any]
) -> dict[str, Any]:
    mappings = manifest["tables"]
    schemas = sorted({mapping["table"].split(".", 1)[0] for mapping in mappings})
    requirements = _load_baseline_requirements(contract, mappings_to_tables(mappings))
    reviewed_keys = {
        "rls_helper:tenant_context",
        "role:migration_owner",
        "role:erp_app",
        "role:erp_runtime",
        "grants:runtime",
        *(f"rls_policy:{mapping['table']}" for mapping in mappings),
    }
    expected_security_blockers = len(mappings) + 5
    if len(reviewed_keys) != expected_security_blockers or not reviewed_keys.issubset(requirements):
        raise ContractError(
            "baseline platform requirement set drifted from the catalog-derived security blockers"
        )

    statements_by_key: dict[str, list[str]] = {
        "role:migration_owner": [
            'CREATE ROLE "erp_migration_owner" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT BYPASSRLS;',
            'REVOKE CREATE ON SCHEMA "public" FROM PUBLIC;',
            'GRANT USAGE ON SCHEMA "extensions" TO "erp_migration_owner";',
            'CREATE SCHEMA "erp_security" AUTHORIZATION "erp_migration_owner";',
            'REVOKE ALL ON SCHEMA "erp_security" FROM PUBLIC;',
        ],
        "role:erp_app": [
            'CREATE ROLE "erp_app" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;',
        ],
        "role:erp_runtime": [
            'CREATE ROLE "erp_runtime" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;',
            'GRANT "erp_app" TO "erp_runtime";',
        ],
        "rls_helper:tenant_context": [*_function_sql(), *_function_ownership_sql()],
        "grants:runtime": _runtime_grant_sql(mappings, schemas),
    }
    for mapping in mappings:
        statements_by_key[f"rls_policy:{mapping['table']}"] = [
            statement
            for statement in _table_policy_sql(mapping)
            if statement.startswith("CREATE POLICY ")
        ]

    entries = []
    for key in sorted(reviewed_keys):
        requirement = requirements[key]
        entries.append(
            {
                "key": key,
                "category": requirement["category"],
                "requirement_sha256": hashlib.sha256(
                    requirement["requirement"].encode("utf-8")
                ).hexdigest(),
                "reviewed": True,
                "statements": statements_by_key[key],
            }
        )
    return {
        "mapping_version": "1.0.0",
        "enforcements": [],
        "platform_enforcements": entries,
    }


def mappings_to_tables(mappings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Reload full tables while asserting the manifest still covers them exactly."""
    _contract, tables, _catalog_hash = load_catalog()
    if [table["name"] for table in tables] != [mapping["table"] for mapping in mappings]:
        raise ContractError("policy manifest order drifted from the full canonical catalog")
    return tables


def generate_sql(manifest: dict[str, Any]) -> str:
    catalog_hash = manifest["catalog_sha256"]
    mappings = manifest["tables"]
    schemas = sorted({mapping["table"].split(".", 1)[0] for mapping in mappings})
    lines = [
        "-- Canonical ERP runtime roles and row-level security",
        "-- REVIEWED, NOT APPLIED. Include only after the canonical baseline tables exist.",
        f"-- canonical_catalog_sha256: {catalog_hash}",
        "-- PostgreSQL 15+; execute as a role allowed to create roles and transfer ownership.",
        "",
        "BEGIN;",
        "",
        "CREATE ROLE \"erp_migration_owner\" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT BYPASSRLS;",
        "GRANT \"erp_migration_owner\" TO CURRENT_USER;",
        "CREATE ROLE \"erp_app\" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;",
        "CREATE ROLE \"erp_runtime\" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;",
        "GRANT \"erp_app\" TO \"erp_runtime\";",
        "REVOKE \"erp_migration_owner\" FROM \"erp_app\", \"erp_runtime\";",
        "REVOKE CREATE ON SCHEMA \"public\" FROM PUBLIC;",
        "GRANT USAGE ON SCHEMA \"extensions\" TO \"erp_migration_owner\";",
        "CREATE SCHEMA \"erp_security\" AUTHORIZATION \"erp_migration_owner\";",
        "REVOKE ALL ON SCHEMA \"erp_security\" FROM PUBLIC;",
        "GRANT USAGE ON SCHEMA \"erp_security\" TO \"erp_app\";",
        "",
    ]
    for schema in schemas:
        lines.extend(
            [
                f"REVOKE ALL ON SCHEMA {_quote(schema)} FROM PUBLIC;",
                f"GRANT USAGE ON SCHEMA {_quote(schema)} TO \"erp_app\";",
                f"ALTER SCHEMA {_quote(schema)} OWNER TO \"erp_migration_owner\";",
            ]
        )
    lines.append("")

    for mapping in mappings:
        table = _qualified(mapping["table"])
        privileges = ", ".join(mapping["runtime_grants"])
        lines.extend(
            [
                f"REVOKE ALL ON TABLE {table} FROM PUBLIC, \"erp_app\", \"erp_runtime\";",
                f"GRANT {privileges} ON TABLE {table} TO \"erp_app\";",
                f"ALTER TABLE {table} OWNER TO \"erp_migration_owner\";",
            ]
        )
    lines.append("")
    lines.extend(_function_sql())
    lines.append("")
    lines.extend(_function_ownership_sql())
    for signature in RUNTIME_FUNCTION_SIGNATURES:
        lines.append(f'GRANT EXECUTE ON FUNCTION {signature} TO "erp_app";')
    lines.append("")

    for mapping in mappings:
        lines.extend(_table_policy_sql(mapping))
    lines.append("")
    for schema in schemas:
        lines.append(
            f"ALTER DEFAULT PRIVILEGES FOR ROLE \"erp_migration_owner\" IN SCHEMA {_quote(schema)} REVOKE ALL ON TABLES FROM PUBLIC;"
        )
    lines.append(
        "ALTER DEFAULT PRIVILEGES FOR ROLE \"erp_migration_owner\" IN SCHEMA \"erp_security\" REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;"
    )
    lines.append('REVOKE "erp_migration_owner" FROM CURRENT_USER;')
    lines.extend(["", "COMMIT;"])
    lines.append("")
    return "\n".join(lines)


def generated_artifacts() -> tuple[str, str, str]:
    contract, tables, catalog_hash = load_catalog()
    manifest = build_manifest(tables, catalog_hash)
    baseline_mapping = build_baseline_mapping(contract, manifest)
    baseline_mapping_text = json.dumps(baseline_mapping, indent=2, sort_keys=True) + "\n"
    manifest["baseline_integration"] = {
        "mapping_file": DEFAULT_BASELINE_MAPPING_PATH.name,
        "resolved_platform_blocker_count": len(baseline_mapping["platform_enforcements"]),
        "resolved_platform_blockers": {
            "rls_policy": len(tables),
            "rls_helper": 1,
            "roles_grants": 4,
        },
        "mapping_sha256": hashlib.sha256(baseline_mapping_text.encode("utf-8")).hexdigest(),
        "catalog_sha256": catalog_hash,
    }
    manifest_text = json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    return generate_sql(manifest), manifest_text, baseline_mapping_text


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail when checked-in artifacts drift")
    parser.add_argument("--sql-output", type=Path, default=DEFAULT_SQL_PATH)
    parser.add_argument("--manifest-output", type=Path, default=DEFAULT_MANIFEST_PATH)
    parser.add_argument("--baseline-mapping-output", type=Path, default=DEFAULT_BASELINE_MAPPING_PATH)
    args = parser.parse_args(argv)
    try:
        sql, manifest, baseline_mapping = generated_artifacts()
    except ContractError as exc:
        print(f"security-contract: ERROR: {exc}", file=sys.stderr)
        return 2

    expected = (
        (args.sql_output, sql),
        (args.manifest_output, manifest),
        (args.baseline_mapping_output, baseline_mapping),
    )
    if args.check:
        drift = [str(path) for path, content in expected if not path.exists() or path.read_text(encoding="utf-8") != content]
        if drift:
            print(f"security-contract: drift: {', '.join(drift)}", file=sys.stderr)
            return 1
    else:
        for path, content in expected:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
    table_count = json.loads(manifest)["catalog_table_count"]
    print(f"security-contract: OK ({table_count} tables, reviewed_not_applied)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

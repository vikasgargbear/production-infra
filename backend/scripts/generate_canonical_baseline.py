#!/usr/bin/env python3
"""Generate deterministic PostgreSQL DDL from the canonical domain catalog.

The column catalog documents cross-row invariants in prose. Those descriptions
are not executable SQL. By default this command refuses to emit a baseline
until every invariant has a reviewed enforcement mapping. ``--draft`` is an
explicit escape hatch for reviewing structural DDL; its output is marked
non-deployable and is accompanied by a blocker manifest.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CATALOG_ROOT = REPO_ROOT / "database" / "canonical" / "domains"
ENFORCEMENT_MAPPING_GLOB = "baseline-*-enforcements.json"
IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")
SQL_TYPE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]*(?:\([0-9, ]+\))?(?:\[\])?$")
SUPPORTED_DEFERRABILITY = {False, "INITIALLY_IMMEDIATE", "INITIALLY_DEFERRED"}


class GenerationError(RuntimeError):
    """The catalog cannot safely produce baseline SQL."""


@dataclass(frozen=True)
class Catalog:
    contract: dict[str, Any]
    authority: dict[str, Any]
    tables: tuple[dict[str, Any], ...]


@dataclass(frozen=True)
class GenerationResult:
    sql: str
    blockers: tuple[dict[str, str], ...]
    table_order: tuple[str, ...]
    deployable: bool


@dataclass(frozen=True)
class ReviewedMappings:
    invariants: dict[str, tuple[str, str, tuple[str, ...]]]
    platform: dict[str, tuple[str, str, tuple[str, ...]]]


def _quote_identifier(value: str) -> str:
    if not IDENTIFIER.fullmatch(value):
        raise GenerationError(f"unsafe PostgreSQL identifier: {value!r}")
    if len(value.encode("utf-8")) > 63:
        raise GenerationError(f"PostgreSQL identifier exceeds 63 bytes: {value!r}")
    return f'"{value}"'


def _qualified_name(value: str) -> str:
    parts = value.split(".")
    if len(parts) != 2:
        raise GenerationError(f"table name must be schema-qualified: {value!r}")
    return ".".join(_quote_identifier(part) for part in parts)


def _sql_fragment(value: str, *, location: str) -> str:
    if not value.strip():
        raise GenerationError(f"empty SQL fragment at {location}")
    if ";" in value or "--" in value or "/*" in value or "*/" in value:
        raise GenerationError(f"statement boundary or comment in SQL fragment at {location}")
    return value.strip()


def _sql_type(value: str, *, location: str) -> str:
    if not SQL_TYPE.fullmatch(value):
        raise GenerationError(f"unsupported PostgreSQL type at {location}: {value!r}")
    return value


def load_and_validate_catalog(catalog_root: Path = DEFAULT_CATALOG_ROOT) -> Catalog:
    """Load the complete catalog and run its authoritative validator first."""
    try:
        validator_path = catalog_root / "validate_domain_catalog.py"
        spec = importlib.util.spec_from_file_location(
            "canonical_domain_catalog_validator", validator_path
        )
        if spec is None or spec.loader is None:
            raise GenerationError(f"cannot import canonical validator: {validator_path}")
        validator = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(validator)
        contract, authority, documents = validator.load_catalog(catalog_root)
    except (OSError, KeyError, json.JSONDecodeError) as exc:
        raise GenerationError(f"cannot load complete canonical catalog: {exc}") from exc

    issues = validator.validate_catalog(contract, authority, documents)
    if issues:
        rendered = "\n".join(f"- {issue}" for issue in issues)
        raise GenerationError(f"canonical catalog validation failed:\n{rendered}")

    tables = tuple(table for document in documents for table in document["tables"])
    return Catalog(contract=contract, authority=authority, tables=tables)


def _validate_generated_names(tables: Sequence[dict[str, Any]]) -> None:
    relation_names: dict[tuple[str, str], str] = {}
    for table in tables:
        schema, local_name = table["name"].split(".", 1)
        relation_objects = [(local_name + "_pkey", "primary-key index")]
        relation_objects.extend(
            (unique["name"], "unique index") for unique in table["uniques"]
        )
        relation_objects.extend((index["name"], "index") for index in table["indexes"])
        for name, kind in relation_objects:
            _quote_identifier(name)
            key = (schema, name)
            owner = f"{table['name']} {kind}"
            if key in relation_names:
                raise GenerationError(
                    f"generated relation name collision for {schema}.{name}: "
                    f"{relation_names[key]} and {owner}"
                )
            relation_names[key] = owner

        constraint_names = [local_name + "_pkey"]
        constraint_names.extend(
            item["name"] for item in table["uniques"] if item["where"] is None
        )
        constraint_names.extend(item["name"] for item in table["checks"])
        constraint_names.extend(item["name"] for item in table["foreign_keys"])
        if len(constraint_names) != len(set(constraint_names)):
            raise GenerationError(f"duplicate generated constraint name on {table['name']}")
        for name in constraint_names:
            _quote_identifier(name)


def _dependency_order(tables: Sequence[dict[str, Any]]) -> tuple[str, ...]:
    """Return stable parent-first order, collapsing legitimate FK cycles."""
    names = {table["name"] for table in tables}
    dependencies = {
        table["name"]: {
            fk["references"]
            for fk in table["foreign_keys"]
            if fk["references"] in names and fk["references"] != table["name"]
        }
        for table in tables
    }

    # Tarjan SCC makes ordering deterministic even when actor/evidence FKs form
    # reviewed cycles. Foreign keys are emitted later with ALTER TABLE.
    index = 0
    stack: list[str] = []
    on_stack: set[str] = set()
    indexes: dict[str, int] = {}
    lowlinks: dict[str, int] = {}
    components: list[tuple[str, ...]] = []

    def visit(node: str) -> None:
        nonlocal index
        indexes[node] = index
        lowlinks[node] = index
        index += 1
        stack.append(node)
        on_stack.add(node)
        for parent in sorted(dependencies[node]):
            if parent not in indexes:
                visit(parent)
                lowlinks[node] = min(lowlinks[node], lowlinks[parent])
            elif parent in on_stack:
                lowlinks[node] = min(lowlinks[node], indexes[parent])
        if lowlinks[node] == indexes[node]:
            component: list[str] = []
            while True:
                member = stack.pop()
                on_stack.remove(member)
                component.append(member)
                if member == node:
                    break
            components.append(tuple(sorted(component)))

    for name in sorted(names):
        if name not in indexes:
            visit(name)

    component_by_table = {
        table: component_index
        for component_index, component in enumerate(components)
        for table in component
    }
    component_dependencies = {
        component_index: {
            component_by_table[parent]
            for table in component
            for parent in dependencies[table]
            if component_by_table[parent] != component_index
        }
        for component_index, component in enumerate(components)
    }
    remaining = set(component_dependencies)
    ordered_components: list[int] = []
    while remaining:
        ready = sorted(
            (item for item in remaining if not (component_dependencies[item] & remaining)),
            key=lambda item: components[item],
        )
        if not ready:
            raise GenerationError("internal error: condensed dependency graph contains a cycle")
        ordered_components.extend(ready)
        remaining.difference_update(ready)

    return tuple(table for component in ordered_components for table in components[component])


def _invariant_key(table_name: str, invariant_name: str) -> str:
    return f"{table_name}:{invariant_name}"


def _load_enforcement_mapping(
    path: Path | None,
) -> ReviewedMappings:
    if path is None:
        return ReviewedMappings(invariants={}, platform={})
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise GenerationError(f"cannot load enforcement mapping {path}: {exc}") from exc
    if not isinstance(document, dict):
        raise GenerationError("enforcement mapping must be a JSON object")
    if document.get("mapping_version") != "1.0.0":
        raise GenerationError("enforcement mapping must declare mapping_version 1.0.0")
    allowed_document_keys = {"mapping_version", "enforcements", "platform_enforcements"}
    if set(document) - allowed_document_keys:
        raise GenerationError(
            "enforcement mapping has unknown top-level keys: "
            f"{sorted(set(document) - allowed_document_keys)}"
        )
    entries = document.get("enforcements", [])
    if not isinstance(entries, list):
        raise GenerationError("enforcement mapping enforcements must be a list")

    result: dict[str, tuple[str, str, tuple[str, ...]]] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            raise GenerationError("enforcement mapping entries must be objects")
        required = {
            "table",
            "invariant",
            "enforcement",
            "requirement_sha256",
            "reviewed",
            "statements",
        }
        if set(entry) != required:
            raise GenerationError(
                f"enforcement mapping entry keys must be exactly {sorted(required)}"
            )
        if not isinstance(entry["table"], str) or not isinstance(entry["invariant"], str):
            raise GenerationError("enforcement mapping table and invariant must be strings")
        key = _invariant_key(entry["table"], entry["invariant"])
        if key in result:
            raise GenerationError(f"duplicate enforcement mapping for {key}")
        if entry["reviewed"] is not True:
            raise GenerationError(f"enforcement mapping is not reviewed: {key}")
        statements = entry["statements"]
        if not isinstance(statements, list) or not statements or not all(
            isinstance(statement, str) and statement.strip() for statement in statements
        ):
            raise GenerationError(f"enforcement mapping has no SQL statements: {key}")
        cleaned: list[str] = []
        for statement in statements:
            stripped = statement.strip()
            if "IF NOT EXISTS" in stripped.upper():
                raise GenerationError(f"enforcement mapping is not fail-closed: {key}")
            cleaned.append(stripped.rstrip(";") + ";")
        requirement_hash = entry["requirement_sha256"]
        if not isinstance(requirement_hash, str) or not re.fullmatch(
            r"[0-9a-f]{64}", requirement_hash
        ):
            raise GenerationError(f"invalid requirement_sha256 for {key}")
        result[key] = (entry["enforcement"], requirement_hash, tuple(cleaned))
    platform_entries = document.get("platform_enforcements", [])
    if not isinstance(platform_entries, list):
        raise GenerationError("platform_enforcements must be a list")
    platform: dict[str, tuple[str, str, tuple[str, ...]]] = {}
    for entry in platform_entries:
        if not isinstance(entry, dict):
            raise GenerationError("platform enforcement entries must be objects")
        required = {"key", "category", "requirement_sha256", "reviewed", "statements"}
        if set(entry) != required:
            raise GenerationError(
                f"platform enforcement entry keys must be exactly {sorted(required)}"
            )
        key = entry["key"]
        category = entry["category"]
        if not isinstance(key, str) or not isinstance(category, str):
            raise GenerationError("platform enforcement key and category must be strings")
        if key in platform:
            raise GenerationError(f"duplicate platform enforcement mapping for {key}")
        if entry["reviewed"] is not True:
            raise GenerationError(f"platform enforcement mapping is not reviewed: {key}")
        requirement_hash = entry["requirement_sha256"]
        if not isinstance(requirement_hash, str) or not re.fullmatch(
            r"[0-9a-f]{64}", requirement_hash
        ):
            raise GenerationError(f"invalid platform requirement_sha256 for {key}")
        statements = entry["statements"]
        if not isinstance(statements, list) or not statements or not all(
            isinstance(statement, str) and statement.strip() for statement in statements
        ):
            raise GenerationError(f"platform enforcement has no SQL statements: {key}")
        cleaned: list[str] = []
        for statement in statements:
            stripped = statement.strip()
            if "IF NOT EXISTS" in stripped.upper():
                raise GenerationError(f"platform enforcement is not fail-closed: {key}")
            cleaned.append(stripped.rstrip(";") + ";")
        platform[key] = (category, requirement_hash, tuple(cleaned))
    return ReviewedMappings(invariants=result, platform=platform)


def _discover_enforcement_mapping_paths(root: Path) -> tuple[Path, ...]:
    """Return every canonical mapping fragment in a deterministic order."""
    if not root.is_dir():
        raise GenerationError(f"enforcement mapping root is not a directory: {root}")
    paths = tuple(
        sorted(
            path
            for path in root.rglob(ENFORCEMENT_MAPPING_GLOB)
            if path.is_file()
        )
    )
    if not paths:
        raise GenerationError(
            f"no {ENFORCEMENT_MAPPING_GLOB} files found under enforcement root: {root}"
        )
    return paths


def _merge_reviewed_mappings(mappings: Sequence[ReviewedMappings]) -> ReviewedMappings:
    """Compose independently reviewed mapping fragments without silent overrides."""
    invariants: dict[str, tuple[str, str, tuple[str, ...]]] = {}
    platform: dict[str, tuple[str, str, tuple[str, ...]]] = {}
    for mapping in mappings:
        duplicate_invariants = sorted(set(invariants) & set(mapping.invariants))
        duplicate_platform = sorted(set(platform) & set(mapping.platform))
        if duplicate_invariants or duplicate_platform:
            duplicates = [*duplicate_invariants, *duplicate_platform]
            raise GenerationError(
                f"enforcement mappings contain duplicate reviewed keys: {duplicates}"
            )
        invariants.update(mapping.invariants)
        platform.update(mapping.platform)
    return ReviewedMappings(invariants=invariants, platform=platform)


def _resolve_invariants(
    tables: Sequence[dict[str, Any]],
    mapping: dict[str, tuple[str, str, tuple[str, ...]]],
) -> tuple[tuple[dict[str, str], ...], tuple[tuple[str, tuple[str, ...]], ...]]:
    expected: dict[str, dict[str, str]] = {}
    for table in tables:
        for invariant in table.get("cross_row_invariants", []):
            key = _invariant_key(table["name"], invariant["name"])
            expected[key] = {
                "key": key,
                "category": "cross_row_invariant",
                "table": table["name"],
                "invariant": invariant["name"],
                "enforcement": invariant["enforcement"],
                "requirement": invariant["rule"],
            }
    extra = sorted(set(mapping) - set(expected))
    if extra:
        raise GenerationError(f"enforcement mapping contains unknown invariants: {extra}")
    mismatched = sorted(
        key
        for key, (enforcement, _requirement_hash, _statements) in mapping.items()
        if enforcement != expected[key]["enforcement"]
    )
    if mismatched:
        raise GenerationError(
            f"enforcement mapping method does not match the catalog: {mismatched}"
        )
    stale = sorted(
        key
        for key, (_enforcement, requirement_hash, _statements) in mapping.items()
        if requirement_hash
        != hashlib.sha256(expected[key]["requirement"].encode("utf-8")).hexdigest()
    )
    if stale:
        raise GenerationError(
            f"enforcement mapping was reviewed against different invariant text: {stale}"
        )
    blockers = tuple(expected[key] for key in sorted(set(expected) - set(mapping)))
    resolved = tuple((key, mapping[key][2]) for key in sorted(mapping))
    return blockers, resolved


def _platform_requirements(catalog: Catalog) -> dict[str, dict[str, str]]:
    requirements: dict[str, dict[str, str]] = {}

    def add(key: str, category: str, phase: str, requirement: str) -> None:
        if key in requirements:
            raise GenerationError(f"duplicate generated platform requirement: {key}")
        requirements[key] = {
            "key": key,
            "category": category,
            "phase": phase,
            "requirement": requirement,
        }

    add(
        "rls_helper:tenant_context",
        "rls_helper",
        "rls_helpers",
        "Create reviewed SECURITY DEFINER tenant activation, current-user, current-membership, "
        "current-organization, and permission-check helpers with fixed search_path, transaction-local "
        "settings, active-membership verification, and PUBLIC execution revoked.",
    )
    for table in sorted(catalog.tables, key=lambda item: item["name"]):
        rls = table["rls"]
        permission = rls["write_permission"] or "no runtime write permission"
        add(
            f"rls_policy:{table['name']}",
            "rls_policy",
            "rls_policies",
            f"Create and test reviewed {rls['class']} RLS policies for {table['name']}; "
            f"write authority is {permission}. Policies must cover every granted command and "
            "reject cross-tenant and unauthenticated access.",
        )

    role_requirements = {
        "role:migration_owner": (
            "Create or preflight a NOLOGIN migration owner with the DDL privileges required for the "
            "canonical schemas and bounded BYPASSRLS authority solely for owned reviewed RLS helper "
            "functions and forced-RLS tables; it is never granted to runtime roles and no credential "
            "is embedded in migration SQL."
        ),
        "role:erp_app": (
            "Create the NOLOGIN erp_app runtime group as NOSUPERUSER NOCREATEDB NOCREATEROLE "
            "INHERIT NOBYPASSRLS with no object ownership."
        ),
        "role:erp_runtime": (
            "Create or preflight the LOGIN erp_runtime principal as NOSUPERUSER NOCREATEDB "
            "NOCREATEROLE INHERIT NOBYPASSRLS and grant it only erp_app membership; its secret "
            "comes from the deployment secret store."
        ),
        "grants:runtime": (
            "Grant schema usage, reviewed table privileges, sequence/function execution, and global "
            "reference SELECT to erp_app; revoke PUBLIC defaults and prohibit DDL, TRUNCATE, ownership, "
            "direct erp_runtime object grants, and BYPASSRLS."
        ),
    }
    for key, requirement in role_requirements.items():
        add(key, "roles_grants", "roles" if key.startswith("role:") else "grants", requirement)

    for table in sorted(
        (
            item
            for item in catalog.tables
            if item["tenant_class"] == "global_reference"
            and item.get("population_mode") == "application_seed"
        ),
        key=lambda item: item["name"],
    ):
        add(
            f"global_reference_seed:{table['name']}",
            "global_reference_seed",
            "seeds",
            f"Provide a versioned, reviewed seed authority and deterministic insert plus exact-set "
            f"verification SQL for {table['name']}; runtime roles remain SELECT-only and cannot "
            "author reference rows.",
        )

    for filename in catalog.contract["domain_files"]:
        schema = Path(filename).stem
        add(
            f"preflight:schema:{schema}",
            "preflight",
            "preflight",
            f"Before any DDL, fail unless canonical schema {schema} is absent; archive/reset of an "
            "existing schema is a separately reviewed operation and unexpected objects are never "
            "accepted.",
        )
    add(
        "preflight:auth.users",
        "preflight",
        "preflight",
        "Before any DDL, verify the Supabase-owned auth.users relation exists with a UUID id key "
        "eligible for the catalog foreign key; do not create, alter, own, seed, or grant auth objects.",
    )

    trigger_requirements = {
        "trigger_plumbing:immutability": (
            "Install reviewed immutability trigger functions and catalog-audited table bindings for "
            "every append-only, posted/finalized, authority-evidence, audit, and regulated-event "
            "mutation class; corrections must use the documented reversal or supersession path."
        ),
        "trigger_plumbing:audit": (
            "Install reviewed audit trigger plumbing that appends canonical core.audit_events with "
            "actor, command, before/after hashes, and tenant hash-chain evidence after business "
            "constraints succeed; prevent recursion and direct runtime mutation."
        ),
        "trigger_plumbing:outbox": (
            "Install reviewed transactional outbox trigger plumbing that appends exactly the owned "
            "integration events after business constraints succeed, is idempotent per aggregate "
            "version, and emits nothing for rolled-back commands."
        ),
    }
    for key, requirement in trigger_requirements.items():
        add(key, "trigger_plumbing", "triggers", requirement)
    return requirements


def _resolve_platform_requirements(
    catalog: Catalog,
    mapping: dict[str, tuple[str, str, tuple[str, ...]]],
) -> tuple[tuple[dict[str, str], ...], dict[str, tuple[tuple[str, tuple[str, ...]], ...]]]:
    expected = _platform_requirements(catalog)
    extra = sorted(set(mapping) - set(expected))
    if extra:
        raise GenerationError(f"platform mapping contains unknown requirements: {extra}")
    wrong_category = sorted(
        key
        for key, (category, _requirement_hash, _statements) in mapping.items()
        if category != expected[key]["category"]
    )
    if wrong_category:
        raise GenerationError(
            f"platform mapping category does not match the requirement: {wrong_category}"
        )
    stale = sorted(
        key
        for key, (_category, requirement_hash, _statements) in mapping.items()
        if requirement_hash
        != hashlib.sha256(expected[key]["requirement"].encode("utf-8")).hexdigest()
    )
    if stale:
        raise GenerationError(
            f"platform mapping was reviewed against different requirement text: {stale}"
        )
    blockers = tuple(expected[key] for key in sorted(set(expected) - set(mapping)))
    resolved_by_phase: dict[str, list[tuple[str, tuple[str, ...]]]] = {}
    for key in sorted(mapping):
        phase = expected[key]["phase"]
        resolved_by_phase.setdefault(phase, []).append((key, mapping[key][2]))
    return blockers, {
        phase: tuple(entries) for phase, entries in resolved_by_phase.items()
    }


def _column_sql(table: dict[str, Any], column: list[Any]) -> str:
    name, postgres_type, nullable, default_sql = column[:4]
    parts = [
        _quote_identifier(name),
        _sql_type(postgres_type, location=f"{table['name']}.{name}"),
    ]
    if default_sql is not None:
        parts.extend(
            [
                "DEFAULT",
                _sql_fragment(
                    default_sql, location=f"{table['name']}.{name} default"
                ),
            ]
        )
    if not nullable:
        parts.append("NOT NULL")
    return " ".join(parts)


def _columns_sql(columns: Iterable[str]) -> str:
    return ", ".join(_quote_identifier(column) for column in columns)


def _create_table_sql(table: dict[str, Any]) -> str:
    table_name = table["name"]
    local_name = table_name.split(".", 1)[1]
    definitions = [_column_sql(table, column) for column in table["columns"]]
    definitions.append(
        f'CONSTRAINT {_quote_identifier(local_name + "_pkey")} '
        f'PRIMARY KEY ({_columns_sql(table["primary_key"])})'
    )
    body = ",\n".join(f"    {definition}" for definition in definitions)
    return f"CREATE TABLE {_qualified_name(table_name)} (\n{body}\n);"


def _constraint_sql(table: dict[str, Any]) -> list[str]:
    table_name = _qualified_name(table["name"])
    statements: list[str] = []
    for unique in sorted(table["uniques"], key=lambda item: item["name"]):
        if unique.get("where") is None:
            statements.append(
                f"ALTER TABLE {table_name} ADD CONSTRAINT {_quote_identifier(unique['name'])} "
                f"UNIQUE ({_columns_sql(unique['columns'])});"
            )
    for check in sorted(table["checks"], key=lambda item: item["name"]):
        expression = _sql_fragment(
            check["expression"], location=f"{table['name']}.{check['name']}"
        )
        statements.append(
            f"ALTER TABLE {table_name} ADD CONSTRAINT {_quote_identifier(check['name'])} "
            f"CHECK ({expression});"
        )
    return statements


def _foreign_key_sql(table: dict[str, Any]) -> list[str]:
    statements: list[str] = []
    for foreign_key in sorted(table["foreign_keys"], key=lambda item: item["name"]):
        deferrability = foreign_key["deferrable"]
        if deferrability not in SUPPORTED_DEFERRABILITY:
            raise GenerationError(
                f"unsupported deferrability for {table['name']}.{foreign_key['name']}: "
                f"{deferrability!r}"
            )
        suffix = ""
        if deferrability == "INITIALLY_IMMEDIATE":
            suffix = " DEFERRABLE INITIALLY IMMEDIATE"
        elif deferrability == "INITIALLY_DEFERRED":
            suffix = " DEFERRABLE INITIALLY DEFERRED"
        statements.append(
            f"ALTER TABLE {_qualified_name(table['name'])} ADD CONSTRAINT "
            f"{_quote_identifier(foreign_key['name'])} FOREIGN KEY "
            f"({_columns_sql(foreign_key['columns'])}) REFERENCES "
            f"{_qualified_name(foreign_key['references'])} "
            f"({_columns_sql(foreign_key['referenced_columns'])}) "
            f"ON DELETE {foreign_key['on_delete']}{suffix};"
        )
    return statements


def _index_sql(table: dict[str, Any]) -> list[str]:
    entries = [
        {
            "name": unique["name"],
            "columns": unique["columns"],
            "unique": True,
            "where": unique["where"],
        }
        for unique in table["uniques"]
        if unique.get("where") is not None
    ] + list(table["indexes"])
    statements: list[str] = []
    for index in sorted(entries, key=lambda item: item["name"]):
        where = ""
        if index.get("where") is not None:
            where = " WHERE " + _sql_fragment(
                index["where"], location=f"{table['name']}.{index['name']} predicate"
            )
        unique = "UNIQUE " if index["unique"] else ""
        statements.append(
            f"CREATE {unique}INDEX {_quote_identifier(index['name'])} ON "
            f"{_qualified_name(table['name'])} ({_columns_sql(index['columns'])}){where};"
        )
    return statements


def _rls_sql(table: dict[str, Any]) -> list[str]:
    table_name = _qualified_name(table["name"])
    statements = [f"ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;"]
    if table["rls"]["force"]:
        statements.append(f"ALTER TABLE {table_name} FORCE ROW LEVEL SECURITY;")
    return statements


def _section(title: str, statements: Iterable[str]) -> list[str]:
    rendered = list(statements)
    if not rendered:
        return []
    return [f"-- {title}", *rendered, ""]


def _partition_auxiliary_prerequisites(
    resolved_invariants: Sequence[tuple[str, tuple[str, ...]]],
) -> tuple[
    tuple[str, ...],
    tuple[str, ...],
    tuple[str, ...],
    tuple[tuple[str, tuple[str, ...]], ...],
]:
    """Provision invariant-owned roles, extensions, and schemas before dependents."""
    roles: list[str] = []
    extensions: list[str] = []
    schemas: list[str] = []
    remaining: list[tuple[str, tuple[str, ...]]] = []
    for key, statements in resolved_invariants:
        invariant_statements: list[str] = []
        for statement in statements:
            if statement.startswith('CREATE ROLE "'):
                roles.append(statement)
            elif statement.startswith('CREATE EXTENSION "'):
                extensions.append(statement)
            elif statement.startswith('CREATE SCHEMA "'):
                schemas.append(statement)
            else:
                invariant_statements.append(statement)
        remaining.append((key, tuple(invariant_statements)))
    return tuple(roles), tuple(extensions), tuple(schemas), tuple(remaining)


def generate_baseline(
    catalog: Catalog,
    *,
    enforcement_mapping: dict[str, tuple[str, str, tuple[str, ...]]] | None = None,
    platform_mapping: dict[str, tuple[str, str, tuple[str, ...]]] | None = None,
    allow_draft: bool = False,
) -> GenerationResult:
    """Render canonical DDL, refusing every unresolved deployment requirement."""
    invariant_mapping = enforcement_mapping or {}
    platform_mapping = platform_mapping or {}
    _validate_generated_names(catalog.tables)
    invariant_blockers, resolved_invariants = _resolve_invariants(
        catalog.tables, invariant_mapping
    )
    platform_blockers, resolved_platform = _resolve_platform_requirements(
        catalog, platform_mapping
    )
    blockers = tuple(
        sorted(
            (*invariant_blockers, *platform_blockers),
            key=lambda blocker: (blocker["category"], blocker["key"]),
        )
    )
    if blockers and not allow_draft:
        category_counts: dict[str, int] = {}
        for blocker in blockers:
            category_counts[blocker["category"]] = (
                category_counts.get(blocker["category"], 0) + 1
            )
        summary = ", ".join(
            f"{category}={count}" for category, count in sorted(category_counts.items())
        )
        raise GenerationError(
            f"{len(blockers)} baseline requirements lack reviewed executable enforcement "
            f"({summary})"
        )

    by_name = {table["name"]: table for table in catalog.tables}
    order = _dependency_order(catalog.tables)
    schemas = tuple(Path(filename).stem for filename in catalog.contract["domain_files"])
    deployable = not blockers
    header = [
        "-- Canonical ERP baseline generated from database/canonical/domains/*.json.",
        "-- Deterministic output: do not edit by hand.",
        f"-- Contract version: {catalog.contract['contract_version']}",
    ]
    if deployable:
        header.append(
            "-- DEPLOYABLE DDL: every invariant and platform requirement has a reviewed mapping."
        )
    else:
        header.extend(
            [
                "-- NON-DEPLOYABLE DRAFT: baseline enforcement is incomplete.",
                "-- See the generated blocker manifest. Do not use this file as an Alembic revision.",
            ]
        )
    lines = [*header, "", "BEGIN;", ""]
    if not deployable:
        lines.extend(
            [
                "DO $canonical_draft$",
                "BEGIN",
                "    RAISE EXCEPTION 'NON-DEPLOYABLE canonical baseline draft';",
                "END",
                "$canonical_draft$;",
                "",
            ]
        )

    def platform_statements(phase: str) -> Iterable[str]:
        for key, statements in resolved_platform.get(phase, ()):
            yield f"-- Reviewed platform enforcement: {key}"
            yield from statements

    (
        auxiliary_roles,
        auxiliary_extensions,
        auxiliary_schemas,
        resolved_invariants,
    ) = _partition_auxiliary_prerequisites(resolved_invariants)
    role_statements = [*platform_statements("roles"), *auxiliary_roles]
    migration_owner_create = (
        'CREATE ROLE "erp_migration_owner" NOLOGIN NOSUPERUSER NOCREATEDB '
        'NOCREATEROLE INHERIT BYPASSRLS;'
    )
    bootstrap_membership_granted = migration_owner_create in role_statements
    if bootstrap_membership_granted:
        migration_owner_index = role_statements.index(migration_owner_create)
        role_statements.insert(
            migration_owner_index + 1,
            'GRANT "erp_migration_owner" TO CURRENT_USER;',
        )
    elif deployable:
        raise GenerationError(
            "reviewed role authority does not create the exact migration owner"
        )
    lines.extend(
        _section("Reviewed deployment preflight", platform_statements("preflight"))
    )
    lines.extend(
        _section(
            "Reviewed role provisioning",
            role_statements,
        )
    )
    lines.extend(
        _section("Reviewed extension provisioning", auxiliary_extensions)
    )
    lines.extend(
        _section(
            "Canonical schemas",
            (f"CREATE SCHEMA {_quote_identifier(schema)};" for schema in schemas),
        )
    )
    if bootstrap_membership_granted:
        lines.extend(
            _section(
                "Migration-owner canonical schema authority",
                (
                    f'GRANT USAGE, CREATE ON SCHEMA {_quote_identifier(schema)} '
                    'TO "erp_migration_owner";'
                    for schema in schemas
                ),
            )
        )
    lines.extend(_section("Reviewed auxiliary schemas", auxiliary_schemas))
    lines.extend(
        _section(
            "Tables in parent-first dependency order",
            (_create_table_sql(by_name[name]) for name in order),
        )
    )
    lines.extend(
        _section(
            "Checks and unconditional unique constraints",
            (statement for name in order for statement in _constraint_sql(by_name[name])),
        )
    )
    lines.extend(
        _section(
            "Foreign keys (post-create to support reviewed cycles)",
            (statement for name in order for statement in _foreign_key_sql(by_name[name])),
        )
    )
    lines.extend(
        _section(
            "Partial unique and access-path indexes",
            (statement for name in order for statement in _index_sql(by_name[name])),
        )
    )
    if resolved_invariants:
        enforcement_statements: list[str] = []
        for key, statements in resolved_invariants:
            enforcement_statements.append(f"-- Reviewed enforcement: {key}")
            enforcement_statements.extend(statements)
        lines.extend(_section("Reviewed cross-row enforcement", enforcement_statements))
    lines.extend(
        _section(
            "Reviewed immutable/audit/outbox plumbing",
            platform_statements("triggers"),
        )
    )
    lines.extend(
        _section(
            "Row-level security declarations",
            (statement for name in order for statement in _rls_sql(by_name[name])),
        )
    )
    lines.extend(
        _section(
            "Reviewed RLS helper functions", platform_statements("rls_helpers")
        )
    )
    lines.extend(_section("Reviewed RLS policies", platform_statements("rls_policies")))
    lines.extend(_section("Reviewed global reference seeds", platform_statements("seeds")))
    lines.extend(_section("Reviewed runtime grants", platform_statements("grants")))
    if bootstrap_membership_granted:
        lines.extend(
            _section(
                "Remove temporary bootstrap ownership authority",
                ('REVOKE "erp_migration_owner" FROM CURRENT_USER;',),
            )
        )
    lines.extend(["COMMIT;", ""])
    sql = "\n".join(lines)
    return GenerationResult(
        sql="\n".join(line.rstrip() for line in sql.splitlines()) + "\n",
        blockers=blockers,
        table_order=order,
        deployable=deployable,
    )


def blocker_manifest(result: GenerationResult, catalog: Catalog) -> dict[str, Any]:
    category_counts: dict[str, int] = {}
    for blocker in result.blockers:
        category_counts[blocker["category"]] = (
            category_counts.get(blocker["category"], 0) + 1
        )
    invariants = [
        blocker
        for blocker in result.blockers
        if blocker["category"] == "cross_row_invariant"
    ]
    return {
        "deployable": result.deployable,
        "contract_version": catalog.contract["contract_version"],
        "catalog_table_count": len(catalog.tables),
        "unresolved_blocker_count": len(result.blockers),
        "unresolved_blocker_counts_by_category": dict(sorted(category_counts.items())),
        "unresolved_blockers": list(result.blockers),
        "unresolved_invariant_count": len(invariants),
        "unresolved_invariants": invariants,
        "required_action": (
            None
            if result.deployable
            else (
                "Add reviewed executable SQL for every invariant and platform requirement "
                "in the separate enforcement mapping."
            )
        ),
        "sql_sha256": hashlib.sha256(result.sql.encode("utf-8")).hexdigest(),
    }


def _write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _default_blocker_path(output: Path) -> Path:
    return output.with_name(output.name + ".blockers.json")


def _parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog-root", type=Path, default=DEFAULT_CATALOG_ROOT)
    parser.add_argument(
        "--enforcement-map",
        type=Path,
        action="append",
        default=[],
        help="reviewed mapping fragment; repeat to compose disjoint authorities",
    )
    parser.add_argument(
        "--enforcement-root",
        type=Path,
        help=(
            "recursively discover every baseline-*-enforcements.json fragment; "
            "production gates use this so a newly checked-in authority cannot be omitted"
        ),
    )
    destination = parser.add_mutually_exclusive_group()
    destination.add_argument("--output", type=Path, help="write SQL instead of stdout")
    destination.add_argument(
        "--check", type=Path, metavar="SQL_FILE", help="compare generated SQL with a file"
    )
    parser.add_argument("--blockers-output", type=Path)
    parser.add_argument("--draft", action="store_true", help="emit explicitly non-deployable SQL")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    try:
        catalog = load_and_validate_catalog(args.catalog_root)
        mapping_paths = list(args.enforcement_map)
        if args.enforcement_root is not None:
            mapping_paths.extend(
                _discover_enforcement_mapping_paths(args.enforcement_root)
            )
        duplicate_paths = sorted(
            str(path)
            for path in mapping_paths
            if mapping_paths.count(path) > 1
        )
        if duplicate_paths:
            raise GenerationError(
                "enforcement mapping path supplied more than once: "
                f"{sorted(set(duplicate_paths))}"
            )
        mappings = _merge_reviewed_mappings(
            [_load_enforcement_mapping(path) for path in mapping_paths]
        )
        result = generate_baseline(
            catalog,
            enforcement_mapping=mappings.invariants,
            platform_mapping=mappings.platform,
            allow_draft=args.draft,
        )
        manifest = (
            json.dumps(blocker_manifest(result, catalog), indent=2, sort_keys=True)
            + "\n"
        )

        if args.check:
            try:
                current = args.check.read_text(encoding="utf-8")
            except OSError as exc:
                raise GenerationError(
                    f"cannot read checked baseline {args.check}: {exc}"
                ) from exc
            if current != result.sql:
                print(f"canonical baseline drift: {args.check}", file=sys.stderr)
                return 1
        elif args.output:
            _write_text(args.output, result.sql)
        else:
            sys.stdout.write(result.sql)

        blocker_path = args.blockers_output
        if result.blockers and blocker_path is None and args.output:
            blocker_path = _default_blocker_path(args.output)
        if blocker_path:
            _write_text(blocker_path, manifest)
        elif result.blockers:
            sys.stderr.write(manifest)
        return 0
    except GenerationError as exc:
        print(f"canonical baseline generation refused: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

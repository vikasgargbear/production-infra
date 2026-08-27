#!/usr/bin/env python3
"""Fail-closed database schema and migration readiness audit.

This tool is deliberately read-only. It does not connect to a database. It
evaluates the effective mounted
callable graph, the canonical Alembic/model authority, and hash-bound external
evidence. A repository may claim
``production_ready`` only after every blocker reported here is removed.
"""

from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import json
import re
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, Mapping, Sequence


AUTHORITY_PATH = Path("database/schema-authority.json")
READY_STATE = "production_ready"
VALID_STATES = {"unbaselined", "migrating", READY_STATE}
VALID_CLASSIFICATIONS = {"retain", "migrate", "retire", "pending-live-baseline"}
SOURCE_REACHABILITY_ANALYZER = (
    "canonical_alembic_source_graph_and_mounted_callable_relation_graph"
)
SHA256 = re.compile(r"^[0-9a-f]{64}$")
GIT_COMMIT = re.compile(r"^[0-9a-f]{40}$")
BUSINESS_SCHEMAS = {
    "automation",
    "calculation",
    "catalog",
    "compliance",
    "core",
    "finance",
    "hr",
    "inventory",
    "parties",
    "procurement",
    "sales",
    "tax",
}


@dataclass(frozen=True)
class Issue:
    code: str
    message: str
    path: str
    line: int | None = None
    severity: str = "blocker"


@dataclass(frozen=True)
class TableDefinition:
    name: str
    path: Path
    line: int
    body: str

    @property
    def has_org_id(self) -> bool:
        return re.search(r'(?i)(?:^|,)\s*"?org_id"?\s+', self.body) is not None

    @property
    def references(self) -> set[str]:
        return {
            match.lower()
            for match in re.findall(r"(?i)\bREFERENCES\s+([a-z_][\w]*\.[a-z_][\w]*)", self.body)
        }


@dataclass(frozen=True)
class ReadinessReport:
    authority_state: str
    issues: tuple[Issue, ...]

    @property
    def ready(self) -> bool:
        return self.authority_state == READY_STATE and not any(
            issue.severity == "blocker" for issue in self.issues
        )

    def as_dict(self) -> dict:
        return {
            "authority_state": self.authority_state,
            "ready": self.ready,
            "blocker_count": sum(issue.severity == "blocker" for issue in self.issues),
            "issues": [asdict(issue) for issue in self.issues],
        }


def _line_number(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def _relative(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def load_authority(repo_root: Path) -> dict:
    path = repo_root / AUTHORITY_PATH
    if not path.is_file():
        raise FileNotFoundError(f"Missing schema authority: {AUTHORITY_PATH}")
    authority = json.loads(path.read_text(encoding="utf-8"))
    required = {
        "readiness_state",
        "canonical_migration_root",
        "canonical_model_file",
        "canonical_model_sha256",
        "canonical_model_catalog_sha256",
        "canonical_transaction_integrity_evidence",
        "source_classification_file",
    }
    missing = sorted(required - authority.keys())
    if missing:
        raise ValueError(f"Schema authority is missing keys: {', '.join(missing)}")
    if authority["readiness_state"] not in VALID_STATES:
        raise ValueError(
            "Schema authority readiness_state must be one of: "
            + ", ".join(sorted(VALID_STATES))
        )
    return authority


def load_source_classification(authority: Mapping, root: Path) -> dict:
    relative_path = authority["source_classification_file"]
    path = root / relative_path
    if not path.is_file():
        raise FileNotFoundError(f"Missing schema source classification: {relative_path}")
    classification = json.loads(path.read_text(encoding="utf-8"))
    required = {
        "readiness_state",
        "canonical_sources",
        "source_reachability",
        "competing_authorities",
        "competing_authority_count",
        "reset_strategy",
    }
    missing = sorted(required - classification.keys())
    if missing:
        raise ValueError(
            "Schema source classification is missing keys: " + ", ".join(missing)
        )
    return classification


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_canonical_model(authority: Mapping, root: Path) -> dict:
    relative_path = authority["canonical_model_file"]
    path = root / relative_path
    if not path.is_file():
        raise FileNotFoundError(f"Missing canonical model: {relative_path}")
    expected_hash = authority["canonical_model_sha256"]
    if not isinstance(expected_hash, str) or not SHA256.fullmatch(expected_hash):
        raise ValueError("canonical_model_sha256 must be a lowercase SHA-256")
    actual_hash = _sha256(path)
    if actual_hash != expected_hash:
        raise ValueError(
            f"Canonical model hash differs: expected {expected_hash}, got {actual_hash}"
        )
    model = json.loads(path.read_text(encoding="utf-8"))
    expected_catalog_hash = authority["canonical_model_catalog_sha256"]
    if not isinstance(expected_catalog_hash, str) or not SHA256.fullmatch(
        expected_catalog_hash
    ):
        raise ValueError(
            "canonical_model_catalog_sha256 must be a lowercase SHA-256"
        )
    if model.get("catalog_sha256") != expected_catalog_hash:
        raise ValueError(
            "Canonical model catalog hash differs from schema authority"
        )
    if not isinstance(model.get("tables"), list) or not model["tables"]:
        raise ValueError("Canonical model must contain a non-empty tables list")
    return model


def parse_table_definitions(paths: Iterable[Path]) -> list[TableDefinition]:
    pattern = re.compile(
        r'(?is)\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?'
        r'"?(?P<schema>[a-z_][\w]*)"?\."?(?P<table>[a-z_][\w]*)"?\s*'
        r"\((?P<body>.*?)\)\s*"
        r"(?:PARTITION\s+BY\s+[^;]+)?;"
    )
    definitions: list[TableDefinition] = []
    for path in sorted(paths):
        text = path.read_text(encoding="utf-8", errors="replace")
        for match in pattern.finditer(text):
            definitions.append(
                TableDefinition(
                    name=(
                        f'{match.group("schema")}.{match.group("table")}'.lower()
                    ),
                    path=path,
                    line=_line_number(text, match.start()),
                    body=match.group("body"),
                )
            )
    return definitions


def check_authority_state(authority: Mapping, root: Path) -> list[Issue]:
    if authority["readiness_state"] == READY_STATE:
        return []
    return [
        Issue(
            code="authority_not_production_ready",
            message=(
                "Schema authority is not production_ready. Complete the isolated deployment, "
                "runtime cutover, and live evidence gates before changing this state."
            ),
            path=_relative(root / AUTHORITY_PATH, root),
        )
    ]


def check_migration_infrastructure(authority: Mapping, root: Path) -> list[Issue]:
    issues: list[Issue] = []
    for relative_path in authority.get("required_migration_files", []):
        if not (root / relative_path).is_file():
            issues.append(
                Issue(
                    code="missing_migration_file",
                    message="Canonical Alembic infrastructure file is missing.",
                    path=relative_path,
                )
            )

    versions = list(root.glob(authority.get("migration_versions_glob", "")))
    versions = [path for path in versions if path.name != "__init__.py"]
    if not versions:
        issues.append(
            Issue(
                code="missing_canonical_revision",
                message="Canonical migration root has no versioned revisions.",
                path=authority["canonical_migration_root"],
            )
        )

    dependency_file = root / authority.get("migration_dependency_file", "")
    dependency_pattern = re.compile(
        authority.get("migration_dependency_pattern", r"^alembic"), re.IGNORECASE
    )
    dependency_found = False
    if dependency_file.is_file():
        dependency_found = any(
            dependency_pattern.match(line.strip())
            for line in dependency_file.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        )
    if not dependency_found:
        issues.append(
            Issue(
                code="missing_migration_dependency",
                message="The runtime dependency file does not install the canonical migration engine.",
                path=_relative(dependency_file, root),
            )
        )
    return issues


def check_competing_ddl(authority: Mapping, root: Path) -> list[Issue]:
    migration_root = (root / authority["canonical_migration_root"]).resolve()
    offenders: list[tuple[Path, int]] = []
    create_pattern = re.compile(r"(?im)^\s*CREATE\s+TABLE\b")

    def is_excluded_repository_path(path: Path) -> bool:
        relative_parts = path.relative_to(root).parts
        if relative_parts[:2] == (".claude", "worktrees"):
            return True
        if any(part in {".git", "node_modules", "__pycache__"} for part in relative_parts):
            return True

        # Virtual environments are installed dependencies, not repository-owned
        # migration sources. Detect them by their interpreter marker instead of
        # assuming a particular directory name such as ``venv`` or ``.venv``.
        current = path.parent
        while current != root and current.is_relative_to(root):
            if (current / "pyvenv.cfg").is_file():
                return True
            current = current.parent
        return False

    for path in root.rglob("*.sql"):
        if is_excluded_repository_path(path):
            continue
        resolved = path.resolve()
        if resolved.is_relative_to(migration_root):
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        match = create_pattern.search(text)
        if match:
            offenders.append((path, _line_number(text, match.start())))

    issues = [
        Issue(
            code="competing_ddl_authority",
            message=(
                "CREATE TABLE exists outside the declared bootstrap/canonical migration roots; "
                "classify or retire this legacy schema source."
            ),
            path=_relative(path, root),
            line=line,
        )
        for path, line in sorted(offenders)
    ]

    revision_pattern = re.compile(r"(?m)^\s*revision\s*(?::[^=]+)?=")
    alembic_import_pattern = re.compile(r"(?m)^\s*from\s+alembic\s+import\s+op\b")
    for path in root.rglob("*.py"):
        if is_excluded_repository_path(path):
            continue
        resolved = path.resolve()
        if resolved.is_relative_to(migration_root):
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        revision_match = revision_pattern.search(text)
        if revision_match and alembic_import_pattern.search(text):
            issues.append(
                Issue(
                    code="competing_migration_revision",
                    message=(
                        "Alembic revision exists outside the declared canonical migration root; "
                        "reconcile it into the reviewed baseline."
                    ),
                    path=_relative(path, root),
                    line=_line_number(text, revision_match.start()),
                )
            )
    return sorted(issues, key=lambda issue: (issue.code, issue.path, issue.line or 0))


def _mounted_relation_dependencies(root: Path) -> set[str]:
    backend_root = root / "backend"
    if str(backend_root) not in sys.path:
        sys.path.insert(0, str(backend_root))
    from scripts.audit.application_promotion_evidence import _effective_route_probe

    graph = _effective_route_probe(root)
    relations = graph.get("relations")
    if not isinstance(relations, dict) or not graph.get("routes"):
        raise ValueError("Mounted callable route graph lacks routes or relation evidence")
    return {str(relation).lower() for relation in relations}


def _source_defined_relations(root: Path, relative_paths: Iterable[str]) -> set[str]:
    paths = [root / relative_path for relative_path in relative_paths]
    return {
        definition.name
        for definition in parse_table_definitions(
            path for path in paths if path.is_file() and path.suffix == ".sql"
        )
    }


def check_source_reachability(
    authority: Mapping,
    classification: Mapping,
    root: Path,
    *,
    reachable_relations: set[str] | None = None,
) -> list[Issue]:
    """Prove that only canonical Alembic is a current executable schema source."""

    classification_path = authority["source_classification_file"]
    contract = classification.get("source_reachability")
    if not isinstance(contract, dict):
        return [Issue(
            code="source_reachability_contract_missing",
            message="Schema source classification requires a reachability contract.",
            path=classification_path,
        )]
    issues: list[Issue] = []
    if contract.get("analyzer") != SOURCE_REACHABILITY_ANALYZER:
        issues.append(Issue(
            code="invalid_source_reachability_analyzer",
            message=(
                "Source reachability must use the canonical Alembic source graph and "
                "mounted callable relation graph."
            ),
            path=classification_path,
        ))

    current = contract.get("current_sources")
    unreachable = contract.get("unreachable_sources")
    if not isinstance(current, list) or not all(
        isinstance(path, str) and path for path in current
    ):
        current = []
        issues.append(Issue(
            code="invalid_current_source_inventory",
            message="current_sources must be a non-empty list of repository paths.",
            path=classification_path,
        ))
    if not isinstance(unreachable, list) or not all(
        isinstance(path, str) and path for path in unreachable
    ):
        unreachable = []
        issues.append(Issue(
            code="invalid_unreachable_source_inventory",
            message="unreachable_sources must list every non-current schema source.",
            path=classification_path,
        ))

    current_set = set(current)
    unreachable_set = set(unreachable)
    if current_set & unreachable_set:
        issues.append(Issue(
            code="source_reachability_overlap",
            message="A schema source cannot be both current and unreachable.",
            path=classification_path,
        ))

    declared_sources = {
        str(source.get("path", ""))
        for source in classification.get("canonical_sources", [])
    }
    for group in classification.get("competing_authorities", []):
        declared_sources.update(str(path) for path in group.get("paths", []))
    declared_sources.discard("")
    inventoried_sources = current_set | unreachable_set
    for path in sorted(declared_sources - inventoried_sources):
        issues.append(Issue(
            code="schema_source_reachability_unclassified",
            message="Classified schema source lacks a current/unreachable disposition.",
            path=path,
        ))
    for path in sorted(inventoried_sources - declared_sources):
        issues.append(Issue(
            code="reachability_targets_unclassified_source",
            message="Reachability inventory names a source absent from source classification.",
            path=path,
        ))

    canonical_root = authority["canonical_migration_root"]
    if current_set != {canonical_root}:
        issues.append(Issue(
            code="multiple_current_schema_authorities",
            message="backend/alembic must be the only current executable schema authority.",
            path=classification_path,
        ))
    retired_paths = {
        path
        for group in classification.get("competing_authorities", [])
        if group.get("classification") == "retire"
        for path in group.get("paths", [])
    }
    for path in sorted(retired_paths - unreachable_set):
        issues.append(Issue(
            code="retired_schema_source_is_reachable",
            message="A retired schema source must remain unreachable from deployment/runtime.",
            path=path,
        ))

    migration_root = root / canonical_root
    current_source_text = "\n".join(
        path.read_text(encoding="utf-8", errors="replace")
        for path in sorted(migration_root.rglob("*"))
        if path.is_file() and path.suffix in {".py", ".sql", ".mako"}
    )
    for path in sorted(unreachable_set):
        if path and path in current_source_text:
            issues.append(Issue(
                code="unreachable_source_referenced_by_canonical_authority",
                message="Canonical Alembic references a source declared unreachable.",
                path=path,
            ))

    try:
        mounted_relations = (
            {relation.lower() for relation in reachable_relations}
            if reachable_relations is not None
            else _mounted_relation_dependencies(root)
        )
    except (OSError, RuntimeError, ValueError, subprocess.CalledProcessError) as exc:
        issues.append(Issue(
            code="mounted_route_reachability_unavailable",
            message=f"Mounted callable relation evidence could not be produced: {exc}",
            path=classification_path,
        ))
        return issues

    reachable_competing: dict[str, list[str]] = {}
    for group in classification.get("competing_authorities", []):
        defined = _source_defined_relations(root, group.get("paths", []))
        overlap = sorted(defined & mounted_relations)
        if overlap:
            reachable_competing[str(group.get("id", ""))] = overlap
    expected_count = contract.get("reachable_competing_source_count")
    if expected_count != len(reachable_competing):
        issues.append(Issue(
            code="reachable_competing_source_count_mismatch",
            message=(
                "Declared reachable competing source count differs from the mounted "
                "callable relation graph."
            ),
            path=classification_path,
        ))
    for group_id, relations in sorted(reachable_competing.items()):
        issues.append(Issue(
            code="reachable_competing_schema_source",
            message=(
                f"Competing source {group_id!r} defines mounted relations: "
                + ", ".join(relations)
            ),
            path=classification_path,
        ))
    return issues


def check_source_classification(
    authority: Mapping,
    root: Path,
    *,
    reachable_relations: set[str] | None = None,
) -> list[Issue]:
    classification_path = authority["source_classification_file"]
    classification = load_source_classification(authority, root)
    issues: list[Issue] = []

    if classification["readiness_state"] != authority["readiness_state"]:
        issues.append(Issue(
            code="classification_readiness_mismatch",
            message="Source classification and schema authority readiness states differ.",
            path=classification_path,
        ))

    declared_allowed = set(classification.get("allowed_classifications", []))
    if declared_allowed != VALID_CLASSIFICATIONS:
        issues.append(Issue(
            code="invalid_classification_vocabulary",
            message=(
                "Classification vocabulary must be exactly: "
                + ", ".join(sorted(VALID_CLASSIFICATIONS))
            ),
            path=classification_path,
        ))

    canonical_sources = classification["canonical_sources"]
    for source in canonical_sources:
        if source.get("classification") != "retain":
            issues.append(Issue(
                code="canonical_source_not_retained",
                message="Canonical/bootstrap source must be classified retain.",
                path=classification_path,
            ))
        if not (root / source.get("path", "")).exists():
            issues.append(Issue(
                code="classified_source_missing",
                message="Classified canonical source does not exist.",
                path=source.get("path", classification_path),
            ))

    reset = classification["reset_strategy"]
    if reset != {
        "mode": "reset-only",
        "conversion_allowed": False,
        "legacy_runtime_allowed": False,
        "dual_read_write_allowed": False,
    }:
        issues.append(Issue(
            code="invalid_reset_strategy",
            message=(
                "Schema authority requires reset-only with every legacy "
                "compatibility mode disabled."
            ),
            path=classification_path,
        ))

    authority_groups = classification["competing_authorities"]
    if len(authority_groups) != classification["competing_authority_count"]:
        issues.append(Issue(
            code="classification_authority_count_mismatch",
            message="Declared competing authority count does not match classified groups.",
            path=classification_path,
        ))

    classified_paths: list[str] = []
    group_ids: list[str] = []
    for source in authority_groups:
        group_ids.append(source.get("id", ""))
        disposition = source.get("classification")
        if disposition not in VALID_CLASSIFICATIONS:
            issues.append(Issue(
                code="invalid_source_classification",
                message=f"Unknown source classification: {disposition!r}.",
                path=classification_path,
            ))
        for relative_path in source.get("paths", []):
            classified_paths.append(relative_path)
            if not (root / relative_path).is_file():
                issues.append(Issue(
                    code="classified_source_missing",
                    message="Classified competing source does not exist.",
                    path=relative_path,
                ))

    if len(group_ids) != len(set(group_ids)) or "" in group_ids:
        issues.append(Issue(
            code="duplicate_classification_id",
            message="Competing authority classification IDs must be unique and non-empty.",
            path=classification_path,
        ))
    if len(classified_paths) != len(set(classified_paths)):
        issues.append(Issue(
            code="duplicate_classified_source",
            message="A competing source is classified more than once.",
            path=classification_path,
        ))

    actual_paths = {
        issue.path
        for issue in check_competing_ddl(authority, root)
        if issue.code in {"competing_ddl_authority", "competing_migration_revision"}
    }
    classified_set = set(classified_paths)
    for relative_path in sorted(actual_paths - classified_set):
        issues.append(Issue(
            code="unclassified_competing_authority",
            message="Competing DDL or migration source lacks a reviewed classification.",
            path=relative_path,
        ))
    for relative_path in sorted(classified_set - actual_paths):
        issues.append(Issue(
            code="classification_targets_non_competing_source",
            message="Classified source is no longer detected as a competing authority.",
            path=relative_path,
        ))

    issues.extend(check_source_reachability(
        authority,
        classification,
        root,
        reachable_relations=reachable_relations,
    ))
    return issues


def _canonical_migration_sql(authority: Mapping, root: Path) -> tuple[str, list[Path]]:
    sql_root = root / authority["canonical_migration_root"] / "sql"
    paths = sorted(sql_root.glob("*.sql"))
    return "\n".join(
        path.read_text(encoding="utf-8", errors="replace") for path in paths
    ), paths


def _altered_relations(sql: str, action: str) -> set[str]:
    return {
        f"{schema}.{table}".lower()
        for schema, table in re.findall(
            rf'(?i)ALTER\s+TABLE\s+"?([a-z_]\w*)"?\."?([a-z_]\w*)"?\s+{action}',
            sql,
        )
    }


def check_canonical_migration_sql_bindings(
    authority: Mapping,
    root: Path,
    sql_paths: Iterable[Path],
) -> list[Issue]:
    """Require each Alembic SQL artifact to be hash-bound by its revision."""

    versions_root = root / authority["canonical_migration_root"] / "versions"
    issues: list[Issue] = []
    for sql_path in sql_paths:
        revision_path = versions_root / f"{sql_path.stem}.py"
        if not revision_path.is_file():
            issues.append(Issue(
                code="canonical_migration_sql_revision_missing",
                message="Canonical SQL artifact has no same-revision Alembic wrapper.",
                path=_relative(sql_path, root),
            ))
            continue
        source = revision_path.read_text(encoding="utf-8", errors="replace")
        expected_match = re.search(
            r'(?ms)^EXPECTED_SQL_SHA256\s*=\s*(?:\(\s*)?["\']([0-9a-f]{64})["\']',
            source,
        )
        expected_hash = expected_match.group(1) if expected_match else None
        if expected_hash is None:
            manifest_path = sql_path.with_suffix(".manifest.json")
            if manifest_path.is_file() and "load_packaged_baseline" in source:
                try:
                    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                except json.JSONDecodeError:
                    manifest = {}
                expected_hash = manifest.get("source_sql_sha256")
        if expected_hash is None or (
            sql_path.name not in source and "load_packaged_baseline" not in source
        ):
            issues.append(Issue(
                code="canonical_migration_sql_hash_binding_missing",
                message="Alembic wrapper must name and hash-bind its exact SQL artifact.",
                path=_relative(revision_path, root),
            ))
            continue
        actual_hash = _sha256(sql_path)
        if expected_hash != actual_hash:
            issues.append(Issue(
                code="canonical_migration_sql_hash_mismatch",
                message="Canonical migration SQL differs from its Alembic wrapper hash.",
                path=_relative(sql_path, root),
            ))
    return issues


def check_canonical_model_authority(authority: Mapping, root: Path) -> list[Issue]:
    """Validate Alembic/RLS against the hash-bound canonical model, never legacy DDL."""

    model_path = authority["canonical_model_file"]
    try:
        model = load_canonical_model(authority, root)
    except (FileNotFoundError, ValueError, json.JSONDecodeError) as exc:
        return [Issue(
            code="canonical_model_authority_invalid",
            message=str(exc),
            path=model_path,
        )]

    table_rows = model["tables"]
    model_tables: dict[str, Mapping] = {}
    issues: list[Issue] = []
    for row in table_rows:
        name = row.get("name") if isinstance(row, dict) else None
        tenant_class = row.get("tenant_class") if isinstance(row, dict) else None
        if (
            not isinstance(name, str)
            or not re.fullmatch(r"[a-z_]\w*\.[a-z_]\w*", name)
            or tenant_class not in {
                "global_identity_root",
                "global_reference",
                "tenant_association",
                "tenant_direct",
                "tenant_projection",
            }
        ):
            issues.append(Issue(
                code="canonical_model_table_invalid",
                message="Canonical model table requires a qualified name and tenant class.",
                path=model_path,
            ))
            continue
        if name in model_tables:
            issues.append(Issue(
                code="canonical_model_table_duplicate",
                message=f"Canonical model repeats table {name}.",
                path=model_path,
            ))
        model_tables[name] = row
    if model.get("table_count") != len(model_tables):
        issues.append(Issue(
            code="canonical_model_table_count_mismatch",
            message="Canonical model table_count does not match its unique table inventory.",
            path=model_path,
        ))

    canonical_sql, sql_paths = _canonical_migration_sql(authority, root)
    issues.extend(check_canonical_migration_sql_bindings(authority, root, sql_paths))
    definitions = [
        definition
        for definition in parse_table_definitions(sql_paths)
        if definition.name.split(".", 1)[0] in BUSINESS_SCHEMAS
    ]
    migration_tables = {definition.name: definition for definition in definitions}
    for name in sorted(set(model_tables) - set(migration_tables)):
        issues.append(Issue(
            code="canonical_migration_missing_model_table",
            message=f"Canonical model table is absent from the Alembic chain: {name}.",
            path=model_path,
        ))

    enabled = _altered_relations(
        canonical_sql, r"ENABLE\s+ROW\s+LEVEL\s+SECURITY"
    )
    forced = _altered_relations(
        canonical_sql, r"FORCE\s+ROW\s+LEVEL\s+SECURITY"
    )
    tenant_tables = {
        name
        for name, row in model_tables.items()
        if row.get("tenant_class") != "global_reference"
    }
    tenant_tables.update(
        definition.name
        for definition in migration_tables.values()
        if definition.has_org_id
    )
    for name in sorted(tenant_tables - enabled):
        issues.append(Issue(
            code="canonical_tenant_table_missing_rls",
            message=f"Canonical tenant table does not enable RLS: {name}.",
            path=authority["canonical_migration_root"],
        ))
    for name in sorted(tenant_tables - forced):
        issues.append(Issue(
            code="canonical_tenant_table_missing_force_rls",
            message=f"Canonical tenant table does not FORCE RLS: {name}.",
            path=authority["canonical_migration_root"],
        ))
    for name in sorted(enabled - set(migration_tables)):
        issues.append(Issue(
            code="canonical_rls_targets_unknown_table",
            message=f"Canonical migration RLS targets an undeclared table: {name}.",
            path=authority["canonical_migration_root"],
        ))

    expected_setting = authority.get("expected_tenant_setting")
    if expected_setting:
        for path in sql_paths:
            text = path.read_text(encoding="utf-8", errors="replace")
            for match in re.finditer(
                r"current_setting\(\s*'([^']+)'", text, re.IGNORECASE
            ):
                actual = match.group(1)
                if actual != expected_setting and "org_id" in actual.lower():
                    issues.append(Issue(
                        code="canonical_conflicting_tenant_setting",
                        message=(
                            f"Canonical migration reads {actual!r}; authority requires "
                            f"{expected_setting!r}."
                        ),
                        path=_relative(path, root),
                        line=_line_number(text, match.start()),
                    ))
    return issues


def check_transaction_integrity_evidence(
    authority: Mapping,
    root: Path,
    *,
    required: bool,
) -> list[Issue]:
    reference = authority.get("canonical_transaction_integrity_evidence")
    if reference is None:
        return ([Issue(
            code="canonical_transaction_integrity_evidence_missing",
            message=(
                "Schema promotion requires a reviewed, hash-bound exact-SHA transaction "
                "integrity capture from canonical staging."
            ),
            path=str(AUTHORITY_PATH),
        )] if required else [])
    if not isinstance(reference, dict):
        return [Issue(
            code="canonical_transaction_integrity_evidence_reference_invalid",
            message="Transaction integrity evidence must be null or a hash-bound object.",
            path=str(AUTHORITY_PATH),
        )]

    issues: list[Issue] = []
    artifact = reference.get("artifact")
    if not isinstance(artifact, str) or not artifact or Path(artifact).is_absolute():
        return [Issue(
            code="canonical_transaction_integrity_evidence_path_invalid",
            message="Transaction integrity artifact must be a repository-relative file.",
            path=str(AUTHORITY_PATH),
        )]
    artifact_path = (root / artifact).resolve()
    try:
        artifact_path.relative_to(root.resolve())
    except ValueError:
        return [Issue(
            code="canonical_transaction_integrity_evidence_path_invalid",
            message="Transaction integrity artifact escapes the repository.",
            path=artifact,
        )]
    if not artifact_path.is_file():
        return [Issue(
            code="canonical_transaction_integrity_evidence_file_missing",
            message="Hash-bound transaction integrity artifact does not exist.",
            path=artifact,
        )]
    expected_hash = reference.get("artifact_sha256")
    if not isinstance(expected_hash, str) or not SHA256.fullmatch(expected_hash):
        issues.append(Issue(
            code="canonical_transaction_integrity_evidence_hash_invalid",
            message="Transaction integrity artifact_sha256 must be a lowercase SHA-256.",
            path=str(AUTHORITY_PATH),
        ))
    elif _sha256(artifact_path) != expected_hash:
        issues.append(Issue(
            code="canonical_transaction_integrity_evidence_hash_mismatch",
            message="Transaction integrity artifact differs from its authority hash.",
            path=artifact,
        ))
    try:
        payload = json.loads(artifact_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        issues.append(Issue(
            code="canonical_transaction_integrity_evidence_payload_invalid",
            message=f"Transaction integrity artifact is not valid JSON: {exc}",
            path=artifact,
        ))
        return issues
    if not isinstance(payload, dict):
        issues.append(Issue(
            code="canonical_transaction_integrity_evidence_payload_invalid",
            message="Transaction integrity artifact must contain a JSON object.",
            path=artifact,
        ))
        return issues

    for key in ("project_ref", "git_commit", "alembic_revision"):
        if reference.get(key) != payload.get(key):
            issues.append(Issue(
                code="canonical_transaction_integrity_evidence_binding_mismatch",
                message=f"Schema authority {key} differs from the evidence payload.",
                path=str(AUTHORITY_PATH),
            ))
    git_commit = reference.get("git_commit")
    if not isinstance(git_commit, str) or not GIT_COMMIT.fullmatch(git_commit):
        issues.append(Issue(
            code="canonical_transaction_integrity_evidence_commit_invalid",
            message="Transaction integrity binding requires an exact 40-character commit.",
            path=str(AUTHORITY_PATH),
        ))
    if reference.get("project_ref") != authority.get("canonical_staging_project_ref"):
        issues.append(Issue(
            code="canonical_transaction_integrity_evidence_project_invalid",
            message="Transaction integrity evidence is not bound to canonical staging.",
            path=str(AUTHORITY_PATH),
        ))
    if not isinstance(reference.get("reviewer"), str) or not reference["reviewer"].strip():
        issues.append(Issue(
            code="canonical_transaction_integrity_evidence_reviewer_missing",
            message="Transaction integrity evidence requires a named reviewer.",
            path=str(AUTHORITY_PATH),
        ))
    try:
        reviewed_at = datetime.fromisoformat(
            str(reference.get("reviewed_at", "")).replace("Z", "+00:00")
        )
        if reviewed_at.tzinfo is None:
            raise ValueError("timezone required")
    except ValueError:
        issues.append(Issue(
            code="canonical_transaction_integrity_evidence_review_time_invalid",
            message="Transaction integrity review needs a timezone-aware timestamp.",
            path=str(AUTHORITY_PATH),
        ))

    try:
        backend_root = root / "backend"
        if str(backend_root) not in sys.path:
            sys.path.insert(0, str(backend_root))
        from scripts.audit.transaction_integrity_audit import _live_evidence_issues

        live_issues = _live_evidence_issues(root, payload, git_commit)
    except (OSError, RuntimeError, ValueError) as exc:
        issues.append(Issue(
            code="canonical_transaction_integrity_evidence_verification_failed",
            message=str(exc),
            path=artifact,
        ))
    else:
        for live_issue in live_issues:
            issues.append(Issue(
                code=live_issue.code.lower(),
                message=live_issue.message,
                path=artifact,
            ))
    return issues


def audit_repository(repo_root: Path) -> ReadinessReport:
    root = repo_root.resolve()
    authority = load_authority(root)
    issues: list[Issue] = []
    issues.extend(check_authority_state(authority, root))
    issues.extend(check_migration_infrastructure(authority, root))
    issues.extend(check_source_classification(authority, root))
    issues.extend(check_canonical_model_authority(authority, root))
    issues.extend(check_transaction_integrity_evidence(authority, root, required=True))
    issues.sort(key=lambda issue: (issue.code, issue.path, issue.line or 0))
    return ReadinessReport(authority_state=authority["readiness_state"], issues=tuple(issues))


def audit_authority_contract(repo_root: Path) -> tuple[Issue, ...]:
    """Validate reset-only canonical Alembic and all classified source inputs."""
    root = repo_root.resolve()
    authority = load_authority(root)
    issues: list[Issue] = []
    issues.extend(check_migration_infrastructure(authority, root))
    issues.extend(check_source_classification(authority, root))
    issues.extend(check_canonical_model_authority(authority, root))
    issues.extend(check_transaction_integrity_evidence(authority, root, required=False))
    issues.sort(key=lambda issue: (issue.code, issue.path, issue.line or 0))
    return tuple(issues)


def validate_readiness_claim(report: ReadinessReport) -> bool:
    """Validate that the authority's claim is conservative.

    ``production_ready`` must have zero blockers. Any non-ready state must remain
    blocked, preventing an ambiguous state from being interpreted as approval.
    """
    if report.authority_state == READY_STATE:
        return report.ready
    return not report.ready and bool(report.issues)


def _print_human(report: ReadinessReport) -> None:
    status = "READY" if report.ready else "BLOCKED"
    print(f"Database readiness: {status} (authority={report.authority_state})")
    counts: dict[str, int] = {}
    for issue in report.issues:
        counts[issue.code] = counts.get(issue.code, 0) + 1
    for code, count in sorted(counts.items()):
        print(f"  {code}: {count}")
    for issue in report.issues:
        location = issue.path + (f":{issue.line}" if issue.line else "")
        print(f"[{issue.severity}] {issue.code} {location}: {issue.message}")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
        help="Repository root (defaults to the root containing backend/ and database/).",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of text.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--validate-claim",
        action="store_true",
        help="Validate that schema-authority.json does not overstate readiness.",
    )
    mode.add_argument(
        "--validate-authority",
        action="store_true",
        help=(
            "Validate the reset-and-baseline migration authority and legacy source "
            "classification without requiring retired bootstrap DDL to be repaired."
        ),
    )
    args = parser.parse_args(argv)

    try:
        if args.validate_authority:
            issues = audit_authority_contract(args.repo_root)
            if issues:
                print("Database migration authority: BLOCKED")
                for issue in issues:
                    location = issue.path + (f":{issue.line}" if issue.line else "")
                    print(f"[{issue.severity}] {issue.code} {location}: {issue.message}")
                return 1
            print(
                "Database migration authority: OK "
                "(canonical Alembic; legacy sources classified)"
            )
            return 0
        report = audit_repository(args.repo_root)
    except (FileNotFoundError, ValueError, json.JSONDecodeError) as error:
        print(f"Database readiness: BLOCKED: {error}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(report.as_dict(), indent=2, sort_keys=True))
    else:
        _print_human(report)

    if args.validate_claim:
        return 0 if validate_readiness_claim(report) else 1
    return 0 if report.ready else 1


if __name__ == "__main__":
    raise SystemExit(main())

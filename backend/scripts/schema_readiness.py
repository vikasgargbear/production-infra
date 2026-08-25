#!/usr/bin/env python3
"""Fail-closed database schema and migration readiness audit.

This tool is deliberately static. It does not connect to a database or infer that
legacy bootstrap SQL matches production. A repository may claim
``production_ready`` only after every blocker reported here is removed.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, Mapping, Sequence


AUTHORITY_PATH = Path("database/schema-authority.json")
READY_STATE = "production_ready"
VALID_STATES = {"unbaselined", "migrating", READY_STATE}
VALID_CLASSIFICATIONS = {"retain", "migrate", "retire", "pending-live-baseline"}


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
        return re.search(r"(?i)(?:^|,)\s*org_id\s+", self.body) is not None

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
        "bootstrap_ddl_root",
        "canonical_migration_root",
        "rls_policy_file",
        "deployment_entrypoint",
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
        "legacy_deployment_plan",
        "competing_authorities",
        "competing_authority_count",
        "broken_deployment_include_groups",
        "broken_deployment_include_count",
    }
    missing = sorted(required - classification.keys())
    if missing:
        raise ValueError(
            "Schema source classification is missing keys: " + ", ".join(missing)
        )
    return classification


def parse_table_definitions(paths: Iterable[Path]) -> list[TableDefinition]:
    pattern = re.compile(
        r"(?is)\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"
        r"(?P<name>[a-z_][\w]*\.[a-z_][\w]*)\s*\((?P<body>.*?)\)\s*"
        r"(?:PARTITION\s+BY\s+[^;]+)?;"
    )
    definitions: list[TableDefinition] = []
    for path in sorted(paths):
        text = path.read_text(encoding="utf-8", errors="replace")
        for match in pattern.finditer(text):
            definitions.append(
                TableDefinition(
                    name=match.group("name").lower(),
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
    bootstrap_root = (root / authority["bootstrap_ddl_root"]).resolve()
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
        if resolved.is_relative_to(bootstrap_root) or resolved.is_relative_to(migration_root):
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


def check_source_classification(authority: Mapping, root: Path) -> list[Issue]:
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

    deployment_plan = classification["legacy_deployment_plan"]
    if (
        deployment_plan.get("path") != authority["deployment_entrypoint"]
        or deployment_plan.get("classification") != "retire"
        or deployment_plan.get("execution_state") != "fail-closed-pending-live-baseline"
    ):
        issues.append(Issue(
            code="invalid_legacy_deployment_classification",
            message=(
                "Legacy deployment plan must match the declared entrypoint and remain "
                "retired/fail-closed pending the live baseline."
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

    include_groups = classification["broken_deployment_include_groups"]
    classified_includes: list[str] = []
    include_group_ids: list[str] = []
    for group in include_groups:
        include_group_ids.append(group.get("id", ""))
        disposition = group.get("classification")
        if disposition not in VALID_CLASSIFICATIONS:
            issues.append(Issue(
                code="invalid_deploy_include_classification",
                message=f"Unknown deployment include classification: {disposition!r}.",
                path=classification_path,
            ))
        includes = group.get("includes", [])
        classified_includes.extend(includes)
        replacements = group.get("replacements", {})
        replacement = group.get("replacement")
        if disposition == "migrate" and not (replacement or replacements):
            issues.append(Issue(
                code="migration_classification_missing_replacement",
                message="Migrating deployment includes must name reviewed replacement candidates.",
                path=classification_path,
            ))
        replacement_paths = ([replacement] if replacement else []) + list(replacements.values())
        for replacement_path in replacement_paths:
            if not (root / replacement_path).is_file():
                issues.append(Issue(
                    code="classified_replacement_missing",
                    message="Classified replacement candidate does not exist.",
                    path=replacement_path,
                ))
        if replacements and set(replacements) != set(includes):
            issues.append(Issue(
                code="replacement_mapping_incomplete",
                message="Per-include replacement mapping must cover its full include group.",
                path=classification_path,
            ))

    if len(include_group_ids) != len(set(include_group_ids)) or "" in include_group_ids:
        issues.append(Issue(
            code="duplicate_deploy_include_group_id",
            message="Deployment include group IDs must be unique and non-empty.",
            path=classification_path,
        ))
    if len(classified_includes) != len(set(classified_includes)):
        issues.append(Issue(
            code="duplicate_classified_deploy_include",
            message="A broken deployment include is classified more than once.",
            path=classification_path,
        ))
    if len(classified_includes) != classification["broken_deployment_include_count"]:
        issues.append(Issue(
            code="classification_deploy_include_count_mismatch",
            message="Declared broken include count does not match classified includes.",
            path=classification_path,
        ))

    return issues


def check_deployment_includes(authority: Mapping, root: Path) -> list[Issue]:
    entrypoint = root / authority["deployment_entrypoint"]
    if not entrypoint.is_file():
        return [
            Issue(
                code="missing_deployment_entrypoint",
                message="Declared database deployment entrypoint is missing.",
                path=_relative(entrypoint, root),
            )
        ]

    text = entrypoint.read_text(encoding="utf-8", errors="replace")
    guard_marker = authority.get("deployment_guard_marker")
    if guard_marker and guard_marker in text:
        return [
            Issue(
                code="deployment_blocked_pending_live_baseline",
                message=(
                    "Deployment entrypoint is deliberately fail-closed until the live baseline "
                    "and canonical migration chain are reviewed."
                ),
                path=_relative(entrypoint, root),
            )
        ]

    include_pattern = re.compile(r"(?m)^\s*\\i(?:r)?\s+['\"]?([^'\"\s]+)['\"]?\s*$")
    issues: list[Issue] = []
    for match in include_pattern.finditer(text):
        include = match.group(1)
        target = (entrypoint.parent / include).resolve()
        if not target.is_file():
            issues.append(
                Issue(
                    code="missing_deploy_include",
                    message=f"Deployment include does not resolve: {include}",
                    path=_relative(entrypoint, root),
                    line=_line_number(text, match.start()),
                )
            )
    if not include_pattern.search(text):
        issues.append(
            Issue(
                code="deployment_has_no_includes",
                message="Deployment entrypoint does not include any schema or migration files.",
                path=_relative(entrypoint, root),
            )
        )
    return issues


def check_rls_coverage(authority: Mapping, root: Path) -> list[Issue]:
    bootstrap = root / authority["bootstrap_ddl_root"]
    definitions = parse_table_definitions(bootstrap.glob("*.sql"))
    by_name = {definition.name: definition for definition in definitions}
    global_tables = {name.lower() for name in authority.get("global_tables", [])}
    tenant_tables = {definition.name for definition in definitions if definition.has_org_id}

    policy_path = root / authority["rls_policy_file"]
    if not policy_path.is_file():
        return [
            Issue(
                code="missing_rls_policy_file",
                message="Declared canonical RLS policy file is missing.",
                path=_relative(policy_path, root),
            )
        ]

    policy_text = policy_path.read_text(encoding="utf-8", errors="replace")
    enabled = {
        name.lower()
        for name in re.findall(
            r"(?i)ALTER\s+TABLE\s+([a-z_]\w*\.[a-z_]\w*)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY",
            policy_text,
        )
    }
    forced = {
        name.lower()
        for name in re.findall(
            r"(?i)ALTER\s+TABLE\s+([a-z_]\w*\.[a-z_]\w*)\s+FORCE\s+ROW\s+LEVEL\s+SECURITY",
            policy_text,
        )
    }

    issues: list[Issue] = []
    for name in sorted(tenant_tables - global_tables):
        definition = by_name[name]
        if name not in enabled:
            issues.append(
                Issue(
                    code="tenant_table_missing_rls",
                    message=f"Tenant-owned table has org_id but RLS is not enabled: {name}",
                    path=_relative(definition.path, root),
                    line=definition.line,
                )
            )
        elif name not in forced:
            issues.append(
                Issue(
                    code="tenant_table_missing_force_rls",
                    message=f"Tenant-owned table does not FORCE RLS for owner-role safety: {name}",
                    path=_relative(policy_path, root),
                )
            )

    for name in sorted(enabled - by_name.keys()):
        match = re.search(
            rf"(?i)ALTER\s+TABLE\s+{re.escape(name)}\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY",
            policy_text,
        )
        issues.append(
            Issue(
                code="rls_targets_unknown_table",
                message=f"RLS policy targets a table absent from bootstrap DDL: {name}",
                path=_relative(policy_path, root),
                line=_line_number(policy_text, match.start()) if match else None,
            )
        )

    for definition in definitions:
        if definition.name in global_tables or definition.has_org_id:
            continue
        if definition.references & tenant_tables and definition.name not in enabled:
            issues.append(
                Issue(
                    code="tenant_child_missing_scope",
                    message=(
                        f"Child table references tenant-owned data but has neither org_id nor RLS: "
                        f"{definition.name}"
                    ),
                    path=_relative(definition.path, root),
                    line=definition.line,
                )
            )

    expected_setting = authority.get("expected_tenant_setting")
    if expected_setting:
        for sql_path in root.rglob("*.sql"):
            sql_text = sql_path.read_text(encoding="utf-8", errors="replace")
            for match in re.finditer(r"current_setting\(\s*'([^']+)'", sql_text, re.IGNORECASE):
                actual = match.group(1)
                # PostgreSQL settings serve many unrelated purposes. Only org
                # context aliases compete with the declared tenant boundary.
                if actual != expected_setting and "org_id" in actual.lower():
                    issues.append(
                        Issue(
                            code="conflicting_tenant_setting",
                            message=(
                                f"RLS/session SQL reads {actual!r}; authority requires "
                                f"{expected_setting!r}."
                            ),
                            path=_relative(sql_path, root),
                            line=_line_number(sql_text, match.start()),
                        )
                    )
    return issues


def audit_repository(repo_root: Path) -> ReadinessReport:
    root = repo_root.resolve()
    authority = load_authority(root)
    issues: list[Issue] = []
    issues.extend(check_authority_state(authority, root))
    issues.extend(check_migration_infrastructure(authority, root))
    issues.extend(check_competing_ddl(authority, root))
    issues.extend(check_source_classification(authority, root))
    issues.extend(check_deployment_includes(authority, root))
    issues.extend(check_rls_coverage(authority, root))
    issues.sort(key=lambda issue: (issue.code, issue.path, issue.line or 0))
    return ReadinessReport(authority_state=authority["readiness_state"], issues=tuple(issues))


def audit_authority_contract(repo_root: Path) -> tuple[Issue, ...]:
    """Validate the declared authority without treating retired DDL as the target.

    The full repository audit remains available as a legacy cleanup diagnostic.
    Reset-and-baseline promotion instead needs proof that every competing source
    is classified, canonical Alembic infrastructure is complete, and the mixed
    legacy deploy script stays guarded until cutover.
    """
    root = repo_root.resolve()
    authority = load_authority(root)
    issues: list[Issue] = []
    issues.extend(check_migration_infrastructure(authority, root))
    issues.extend(check_source_classification(authority, root))
    deployment_issues = check_deployment_includes(authority, root)
    if [issue.code for issue in deployment_issues] != [
        "deployment_blocked_pending_live_baseline"
    ]:
        issues.extend(deployment_issues)
        issues.append(Issue(
            code="legacy_deployment_guard_missing",
            message=(
                "The retired mixed-SQL deployment entrypoint must retain its reviewed "
                "guard; canonical Alembic is the only production migration authority."
            ),
            path=authority["deployment_entrypoint"],
        ))
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

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
            code="authority_unbaselined",
            message=(
                "Schema authority is not production_ready. Establish and review a live baseline "
                "before changing this state."
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

    for path in root.rglob("*.sql"):
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
    issues.extend(check_deployment_includes(authority, root))
    issues.extend(check_rls_coverage(authority, root))
    issues.sort(key=lambda issue: (issue.code, issue.path, issue.line or 0))
    return ReadinessReport(authority_state=authority["readiness_state"], issues=tuple(issues))


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
    parser.add_argument(
        "--validate-claim",
        action="store_true",
        help="Validate that schema-authority.json does not overstate readiness.",
    )
    args = parser.parse_args(argv)

    try:
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

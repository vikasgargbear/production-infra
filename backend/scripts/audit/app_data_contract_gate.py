#!/usr/bin/env python3
"""Fail closed when app, canonical data, or MCP contracts drift."""

from __future__ import annotations

import argparse
import ast
from datetime import datetime
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterable

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from scripts.audit import application_promotion_evidence


REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CONTRACT = REPO_ROOT / "docs" / "architecture" / "app-data-contract.json"
DEFAULT_MODEL = REPO_ROOT / "docs" / "architecture" / "canonical-data-model.json"
DEFAULT_SOURCE_ROOT = REPO_ROOT / "backend" / "app"

QUALIFIED_NAME = re.compile(r"^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$")
SQL_RELATION = re.compile(
    r"(?i)\b(?:from|join|update|into|delete\s+from)\s+"
    r"((?:analytics|compliance|financial|gst|inventory|master|parties|"
    r"procurement|public|sales|system_config|payroll)\.[a-z_][a-z0-9_]*)"
)
VALID_ACTIONS = {
    "retain",
    "rename",
    "merge",
    "merge_duplicate",
    "replace_projection",
    "split",
    "defer",
    "retire",
}
VALID_RISKS = {
    "read_only",
    "reversible_write",
    "consequential_write",
    "regulated_external",
}
REQUIRED_SECURITY_RELATIONS = {
    "core.users",
    "core.memberships",
    "core.permissions",
    "core.role_permissions",
    "core.access_grants",
    "automation.agent_grants",
    "automation.agent_grant_capabilities",
    "automation.command_requests",
    "automation.command_approvals",
    "core.idempotency_keys",
    "core.audit_events",
}
PROMOTION_EVIDENCE_SECTIONS = {
    "source_disposition",
    "route_graph",
    "migration_head",
    "runtime_tenant_isolation",
    "reconciliation_backup",
    "live18_acceptance",
    "rollback_decommission",
    "review",
}
SHA256 = re.compile(r"^[0-9a-f]{64}$")
GIT_COMMIT = re.compile(r"^[0-9a-f]{40}$")


def _load_json(path: Path) -> dict[str, Any]:
    def reject_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        value: dict[str, Any] = {}
        for key, item in pairs:
            if key in value:
                raise ValueError(f"duplicate JSON key: {key}")
            value[key] = item
        return value

    with path.open(encoding="utf-8") as handle:
        return json.load(handle, object_pairs_hook=reject_duplicates)


def load_contract(path: Path = DEFAULT_CONTRACT) -> dict[str, Any]:
    return _load_json(path)


def load_model(path: Path = DEFAULT_MODEL) -> dict[str, Any]:
    return _load_json(path)


def _relative_file(root: Path, value: Any, label: str) -> tuple[Path | None, str | None]:
    if not isinstance(value, str) or not value or Path(value).is_absolute():
        return None, f"{label} must be a repository-relative file"
    candidate = (root / value).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None, f"{label} escapes the repository"
    if not candidate.is_file():
        return None, f"{label} does not exist: {value}"
    return candidate, None


def _hash_error(path: Path, expected: Any, label: str) -> str | None:
    if not isinstance(expected, str) or not SHA256.fullmatch(expected):
        return f"{label} must provide a lowercase SHA-256"
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != expected:
        return f"{label} hash differs: expected {expected}, got {actual}"
    return None


def _artifact_errors(
    root: Path,
    section: Mapping[str, Any],
    *,
    path_key: str = "artifact",
    hash_key: str = "artifact_sha256",
    label: str,
) -> list[str]:
    path, error = _relative_file(root, section.get(path_key), f"{label}.{path_key}")
    if error:
        return [error]
    assert path is not None
    hash_error = _hash_error(path, section.get(hash_key), f"{label}.{hash_key}")
    return [hash_error] if hash_error else []


def validate_promotion_evidence(
    contract: Mapping[str, Any],
    *,
    root: Path = REPO_ROOT,
    require_complete: bool | None = None,
) -> tuple[dict[str, Any] | None, list[str]]:
    """Validate the hash-bound promotion manifest and typed approval predicates."""

    errors: list[str] = []
    reference = contract.get("promotion_evidence")
    if not isinstance(reference, dict):
        return None, ["promotion_evidence must be an object"]
    manifest_path, path_error = _relative_file(
        root, reference.get("manifest"), "promotion_evidence.manifest"
    )
    if path_error:
        return None, [path_error]
    assert manifest_path is not None
    hash_error = _hash_error(
        manifest_path,
        reference.get("manifest_sha256"),
        "promotion_evidence.manifest_sha256",
    )
    if hash_error:
        errors.append(hash_error)
    try:
        evidence = _load_json(manifest_path)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        return None, errors + [f"promotion evidence cannot be loaded: {exc}"]
    if evidence.get("schema_version") != 2:
        errors.append("promotion evidence schema_version must equal 2")
    missing_sections = PROMOTION_EVIDENCE_SECTIONS - set(evidence)
    for section_name in sorted(missing_sections):
        errors.append(f"promotion evidence lacks {section_name}")
    unexpected = set(evidence) - PROMOTION_EVIDENCE_SECTIONS - {
        "schema_version",
        "evidence_state",
    }
    for section_name in sorted(unexpected):
        errors.append(f"promotion evidence has unknown section {section_name}")

    complete = (
        contract.get("decision_status") == "approved_app_contract_v1"
        if require_complete is None
        else require_complete
    )
    for section_name in sorted(PROMOTION_EVIDENCE_SECTIONS):
        section = evidence.get(section_name)
        if not isinstance(section, dict):
            errors.append(f"promotion evidence {section_name} must be an object")
            continue
        state = section.get("state")
        if state not in {"missing", "verified"}:
            errors.append(f"promotion evidence {section_name}.state is invalid")
            continue
        if state != "verified":
            if complete:
                errors.append(f"promotion evidence {section_name} is not verified")
            continue
        if section_name == "review":
            if not isinstance(section.get("reviewer"), str) or not section["reviewer"].strip():
                errors.append("promotion evidence review.reviewer is required")
            reviewed_at = section.get("reviewed_at")
            try:
                parsed = datetime.fromisoformat(str(reviewed_at).replace("Z", "+00:00"))
                if parsed.tzinfo is None:
                    raise ValueError("timezone required")
            except ValueError:
                errors.append("promotion evidence review.reviewed_at must be an ISO-8601 timestamp with timezone")
            if not isinstance(section.get("git_commit"), str) or not GIT_COMMIT.fullmatch(section["git_commit"]):
                errors.append("promotion evidence review.git_commit must be an exact 40-character commit")
            continue
        if section_name == "rollback_decommission":
            errors.extend(_artifact_errors(
                root, section, path_key="rollback_artifact",
                hash_key="rollback_artifact_sha256", label=section_name,
            ))
            errors.extend(_artifact_errors(
                root, section, path_key="decommission_artifact",
                hash_key="decommission_artifact_sha256", label=section_name,
            ))
            continue
        errors.extend(_artifact_errors(root, section, label=section_name))
        if section_name == "source_disposition":
            if section.get("strategy") not in {"reset", "conversion"}:
                errors.append("promotion evidence source_disposition.strategy must be reset or conversion")
            if not isinstance(section.get("source_identifier"), str) or not section["source_identifier"].strip():
                errors.append("promotion evidence source_disposition.source_identifier is required")
        elif section_name == "route_graph":
            if section.get("analyzer_kind") != "mounted_route_graph":
                errors.append("promotion evidence route_graph must use the mounted route graph analyzer")
            if section.get("reachable_retired_dependency_count") != 0:
                errors.append("promotion evidence route_graph has reachable retired-schema dependencies")
        elif section_name == "migration_head":
            expected = section.get("expected_head")
            if not isinstance(expected, str) or not expected or section.get("observed_head") != expected:
                errors.append("promotion evidence migration_head does not reconcile exact expected and observed heads")
        elif section_name == "runtime_tenant_isolation":
            for predicate in (
                "runtime_role_non_owner",
                "runtime_role_no_bypassrls",
                "forced_rls_verified",
                "tenant_positive_test",
                "cross_tenant_denial_test",
            ):
                if section.get(predicate) is not True:
                    errors.append(f"promotion evidence runtime_tenant_isolation.{predicate} is not verified")
        elif section_name == "reconciliation_backup":
            for predicate in (
                "source_target_counts_reconciled",
                "exact_totals_reconciled",
                "table_content_digests_reconciled",
                "backup_verified",
                "restore_tested",
            ):
                if section.get(predicate) is not True:
                    errors.append(f"promotion evidence reconciliation_backup.{predicate} is not verified")
        elif section_name == "live18_acceptance":
            if section.get("operation_count") != 18:
                errors.append("promotion evidence live18_acceptance must verify exactly 18 operations")
    verified = all(
        isinstance(evidence.get(name), dict)
        and evidence[name].get("state") == "verified"
        for name in PROMOTION_EVIDENCE_SECTIONS
    )
    if evidence.get("evidence_state") != ("verified" if verified else "incomplete"):
        errors.append("promotion evidence evidence_state disagrees with its predicates")
    if verified:
        errors.extend(
            application_promotion_evidence.validate_manifest_artifacts(root, evidence)
        )
    return evidence, errors


def relation_names(model: dict[str, Any]) -> list[str]:
    groups = model.get("canonical_tables", {})
    if not isinstance(groups, dict):
        return []
    return [
        table
        for tables in groups.values()
        if isinstance(tables, list)
        for table in tables
        if isinstance(table, str)
    ]


def _duplicates(values: Iterable[str]) -> set[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for value in values:
        if value in seen:
            duplicates.add(value)
        seen.add(value)
    return duplicates


def discover_sql_relations(source_root: Path) -> dict[str, set[str]]:
    """Find schema-qualified relation positions in Python SQL literals."""

    discovered: dict[str, set[str]] = {}
    for path in sorted(source_root.rglob("*.py")):
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except (SyntaxError, UnicodeDecodeError) as exc:
            raise ValueError(f"cannot parse {path}: {exc}") from exc
        for node in ast.walk(tree):
            if not isinstance(node, ast.Constant) or not isinstance(node.value, str):
                continue
            for match in SQL_RELATION.finditer(node.value):
                relation = match.group(1).lower()
                discovered.setdefault(relation, set()).add(str(path))
    return discovered


def validate_contract(
    contract: dict[str, Any],
    source_root: Path | None = DEFAULT_SOURCE_ROOT,
    model: dict[str, Any] | None = None,
    repository_root: Path = REPO_ROOT,
) -> list[str]:
    errors: list[str] = []
    if model is None:
        try:
            model = load_model()
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            return [f"canonical model cannot be loaded: {exc}"]

    if contract.get("decision_status") not in {
        "proposed_app_contract_v1",
        "approved_app_contract_v1",
    }:
        errors.append("decision_status must be proposed_app_contract_v1 or approved_app_contract_v1")
    _, promotion_errors = validate_promotion_evidence(
        contract, root=repository_root
    )
    errors.extend(promotion_errors)

    authority = contract.get("data_authority")
    if not isinstance(authority, dict):
        return ["data_authority must be an object"]
    if authority.get("manifest") != "docs/architecture/canonical-data-model.json":
        errors.append("data_authority.manifest must name the canonical model")
    if authority.get("expected_version") != model.get("model_version"):
        errors.append("canonical model version differs from app contract")

    model_groups = model.get("canonical_tables")
    if not isinstance(model_groups, dict) or not model_groups:
        return errors + ["canonical model canonical_tables must be a non-empty object"]
    names = relation_names(model)
    for duplicate in sorted(_duplicates(names)):
        errors.append(f"duplicate canonical model table: {duplicate}")
    relation_index = set(names)
    post_baseline_manifests = authority.get("post_baseline_manifests", [])
    if not isinstance(post_baseline_manifests, list) or not all(
        isinstance(path, str) for path in post_baseline_manifests
    ):
        errors.append("data_authority.post_baseline_manifests must be a string array")
        post_baseline_manifests = []
    for relative_path in post_baseline_manifests:
        if (
            not relative_path.startswith("database/canonical/")
            or ".." in Path(relative_path).parts
        ):
            errors.append(f"invalid post-baseline authority path: {relative_path}")
            continue
        try:
            supplemental = _load_json(repository_root / relative_path)
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            errors.append(f"cannot load post-baseline authority {relative_path}: {exc}")
            continue
        relation = supplemental.get("relation")
        revision = supplemental.get("migration_revision")
        migration_sql = supplemental.get("migration_sql")
        expected_digest = supplemental.get("migration_sql_sha256")
        if supplemental.get("authority") != "post_baseline_alembic":
            errors.append(f"post-baseline authority kind is invalid: {relative_path}")
        if not isinstance(relation, str) or QUALIFIED_NAME.fullmatch(relation) is None:
            errors.append(f"post-baseline authority relation is invalid: {relative_path}")
            continue
        if relation in relation_index:
            errors.append(f"duplicate post-baseline authority relation: {relation}")
            continue
        if (
            not isinstance(revision, str)
            or re.fullmatch(r"[0-9]{8}_[0-9]{4}", revision) is None
            or not isinstance(migration_sql, str)
            or not migration_sql.startswith(f"backend/alembic/sql/{revision}_")
            or not migration_sql.endswith(".sql")
            or ".." in Path(migration_sql).parts
            or not isinstance(expected_digest, str)
            or SHA256.fullmatch(expected_digest) is None
        ):
            errors.append(f"post-baseline migration authority is invalid: {relative_path}")
            continue
        migration_path = repository_root / migration_sql
        try:
            actual_digest = hashlib.sha256(migration_path.read_bytes()).hexdigest()
        except OSError as exc:
            errors.append(f"cannot load post-baseline migration {migration_sql}: {exc}")
            continue
        if actual_digest != expected_digest:
            errors.append(f"post-baseline migration hash differs: {migration_sql}")
            continue
        relation_index.add(relation)
    if authority.get("expected_table_count") != len(relation_index):
        errors.append(
            "canonical model table count differs from app contract: "
            f"expected {authority.get('expected_table_count')}, got {len(relation_index)}"
        )
    for relation in sorted(REQUIRED_SECURITY_RELATIONS - relation_index):
        errors.append(f"canonical model lacks required security relation: {relation}")

    identity = contract.get("identity_resolution_contract")
    if not isinstance(identity, dict):
        errors.append("identity_resolution_contract must be an object")
    else:
        steps = identity.get("steps")
        if not isinstance(steps, list) or not all(isinstance(step, str) for step in steps):
            errors.append("identity_resolution_contract.steps must be a string array")
        else:
            identity_text = " ".join(steps)
            for required in ("core.access_grants", "erp_security.activate_context"):
                if required not in identity_text:
                    errors.append(f"identity resolution omits canonical boundary {required}")
            for retired in ("core.membership_roles", "core.activate_tenant", "SET LOCAL ROLE"):
                if retired in identity_text:
                    errors.append(f"identity resolution references retired boundary {retired}")

    scope = contract.get("relation_scope")
    if not isinstance(scope, dict):
        errors.append("relation_scope must be an object")
        scope = {}
    classified: list[str] = []
    deferred_relations: list[str] = []
    retained_owners: dict[str, str] = {}
    for category in (
        "active_retained",
        "legally_required_retained",
        "cross_cutting_safety_retained",
    ):
        groups = scope.get(category, {})
        if not isinstance(groups, dict):
            errors.append(f"relation_scope.{category} must be an object")
            continue
        for owner, relations in groups.items():
            if not isinstance(relations, list) or not relations:
                errors.append(f"relation_scope.{category}.{owner} must be non-empty")
                continue
            for relation in relations:
                classified.append(relation)
                retained_owners[relation] = owner
    deferred = scope.get("deferred_unmount", {})
    if not isinstance(deferred, dict):
        errors.append("relation_scope.deferred_unmount must be an object")
        deferred = {}
    for module, decision in deferred.items():
        if not isinstance(decision, dict):
            errors.append(f"deferred module {module} must be an object")
            continue
        relations = decision.get("relations")
        if not isinstance(relations, list) or not relations:
            errors.append(f"deferred module {module} must name relations")
            continue
        deferred_relations.extend(relations)
        for field in ("backend_action", "frontend_action", "evidence"):
            if not decision.get(field):
                errors.append(f"deferred module {module} lacks {field}")
    for duplicate in sorted(_duplicates(classified)):
        errors.append(f"canonical relation classified more than once: {duplicate}")
    for relation in sorted(relation_index - set(classified)):
        errors.append(f"canonical relation has no scope decision: {relation}")
    for relation in sorted(set(classified) - relation_index):
        errors.append(f"scope decision names unknown canonical relation: {relation}")
    for relation in sorted(set(deferred_relations) & relation_index):
        errors.append(f"deferred relation remains in canonical model: {relation}")
    for duplicate in sorted(_duplicates(deferred_relations)):
        errors.append(f"deferred relation named more than once: {duplicate}")
    if scope.get("lean_active_table_count") != len(retained_owners):
        errors.append("lean_active_table_count differs from retained scope")
    if scope.get("deferred_table_count") != len(deferred_relations):
        errors.append("deferred_table_count differs from deferred scope")

    workflows = contract.get("workflows")
    if not isinstance(workflows, list) or not workflows:
        return errors + ["workflows must be a non-empty array"]
    resources = [item.get("resource", "") for item in workflows if isinstance(item, dict)]
    for duplicate in sorted(_duplicates(resources)):
        errors.append(f"duplicate workflow resource: {duplicate}")
    for workflow in workflows:
        if not isinstance(workflow, dict):
            errors.append("workflow must be an object")
            continue
        resource = workflow.get("resource", "<unknown>")
        for relation in workflow.get("relations", []):
            if relation not in relation_index:
                errors.append(f"workflow {resource}: unknown canonical relation {relation}")
        for field in (
            "api_routes",
            "frontend_modules",
            "relations",
            "query_shapes",
            "mcp_resources",
            "mcp_tools",
        ):
            if not isinstance(workflow.get(field), list) or not workflow[field]:
                errors.append(f"workflow {resource}: {field} must be non-empty")
        if not workflow.get("approval_boundary"):
            errors.append(f"workflow {resource}: approval_boundary is required")

    resource_index = set(resources)
    for relation, owner in retained_owners.items():
        if owner not in resource_index:
            errors.append(f"retained relation {relation} has unknown workflow owner {owner}")
            continue
        owner_workflow = next(item for item in workflows if item.get("resource") == owner)
        if relation not in owner_workflow.get("relations", []):
            errors.append(f"retained relation {relation} is absent from owner workflow {owner}")
    operations = contract.get("mcp_operations")
    if not isinstance(operations, list) or not operations:
        errors.append("mcp_operations must be a non-empty array")
        operations = []
    tools = [item.get("tool", "") for item in operations if isinstance(item, dict)]
    for duplicate in sorted(_duplicates(tools)):
        errors.append(f"duplicate MCP tool: {duplicate}")
    for operation in operations:
        if not isinstance(operation, dict):
            errors.append("MCP operation must be an object")
            continue
        tool = operation.get("tool", "<unknown>")
        mode = operation.get("mode")
        risk = operation.get("risk")
        approval = operation.get("approval")
        idempotency = operation.get("idempotency")
        if operation.get("resource") not in resource_index:
            errors.append(f"{tool}: MCP resource has no workflow")
        if risk not in VALID_RISKS:
            errors.append(f"{tool}: invalid risk {risk!r}")
        if mode == "read":
            if risk != "read_only" or idempotency != "not_applicable" or approval != "none":
                errors.append(f"{tool}: read operation metadata is not side-effect free")
        elif mode == "write":
            if risk == "read_only":
                errors.append(f"{tool}: write operation cannot be read_only")
            if idempotency != "required":
                errors.append(f"{tool}: MCP writes require idempotency")
            if approval in {None, "", "none"}:
                errors.append(f"{tool}: MCP writes require an approval boundary")
        else:
            errors.append(f"{tool}: mode must be read or write")
        if risk == "consequential_write" and approval not in {
            "actor_confirmation",
            "command_policy",
            "separate_approver",
            "human_compliance_approver",
        }:
            errors.append(f"{tool}: consequential write lacks confirmation or approval")
        if risk == "regulated_external" and approval != "human_compliance_approver":
            errors.append(f"{tool}: regulated external action requires human approver")

    legacy_map = contract.get("legacy_relation_map")
    if not isinstance(legacy_map, dict):
        errors.append("legacy_relation_map must be an object")
        legacy_map = {}
    for legacy, decision in legacy_map.items():
        if not QUALIFIED_NAME.fullmatch(legacy):
            errors.append(f"invalid legacy relation name: {legacy!r}")
        if not isinstance(decision, dict):
            errors.append(f"{legacy}: decision must be an object")
            continue
        action = decision.get("action")
        if action not in VALID_ACTIONS:
            errors.append(f"{legacy}: invalid migration action {action!r}")
        target = decision.get("canonical")
        if action in {"defer", "retire"}:
            if not decision.get("reason"):
                errors.append(f"{legacy}: {action} requires a reason")
            if target is not None:
                errors.append(f"{legacy}: {action} must not claim a canonical target")
        elif target not in relation_index:
            errors.append(f"{legacy}: unknown canonical target {target!r}")
        also_targets = decision.get("also_targets", [])
        if not isinstance(also_targets, list):
            errors.append(f"{legacy}: also_targets must be an array")
        else:
            for additional in also_targets:
                if additional not in relation_index:
                    errors.append(f"{legacy}: unknown additional target {additional!r}")

    routines = set(contract.get("legacy_routines", []))
    if source_root is not None:
        try:
            discovered = discover_sql_relations(source_root)
        except ValueError as exc:
            errors.append(str(exc))
        else:
            for relation in sorted(
                set(discovered) - set(legacy_map) - routines - relation_index
            ):
                evidence = ", ".join(sorted(discovered[relation]))
                errors.append(f"unmapped SQL relation {relation}: {evidence}")
    return errors


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, default=DEFAULT_CONTRACT)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE_ROOT)
    parser.add_argument("--contract-only", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        contract = load_contract(args.contract)
        model = load_model(args.model)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"app-data-contract: invalid input: {exc}", file=sys.stderr)
        return 1
    errors = validate_contract(
        contract,
        source_root=None if args.contract_only else args.source_root,
        model=model,
    )
    if errors:
        print("app-data-contract: FAILED", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print(
        "app-data-contract: OK "
        f"({contract['data_authority']['expected_table_count']} canonical relations, "
        f"{len(contract['workflows'])} "
        f"workflows, {len(contract['mcp_operations'])} reviewed MCP operations)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

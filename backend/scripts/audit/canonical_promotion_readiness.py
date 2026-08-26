#!/usr/bin/env python3
"""Fail closed until the canonical reset-and-baseline release can be promoted.

This audit evaluates only checked-in promotion facts for the
canonical Alembic baseline, canonical application contract, and operator-action
boundary. External tax-provider evidence remains a separate release gate.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass
import json
from pathlib import Path
import sys
from typing import Any, Mapping

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from scripts.audit import app_data_contract_gate


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
EXPECTED_RELEASE_GATES = {
    "canonical_api_command_boundary_verified",
    "canonical_database_commands_deployed_verified",
    "calculation_tax_inventory_parity_verified",
    "idempotency_concurrency_audit_verified",
    "hosted_oauth_consent_verified",
    "official_mcp_sdk_staging_verified",
}


@dataclass(frozen=True)
class PromotionIssue:
    code: str
    message: str


def _json(root: Path, relative_path: str) -> dict[str, Any]:
    path = root / relative_path
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{relative_path} must contain a JSON object")
    return value


def _literal_string(node: ast.AST) -> str | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def _migration_head(root: Path) -> str:
    versions = root / "backend/alembic/versions"
    parents: dict[str, str | None] = {}
    for path in sorted(versions.glob("*.py")):
        if path.name == "__init__.py":
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        values: dict[str, Any] = {}
        for statement in tree.body:
            if not isinstance(statement, ast.Assign):
                continue
            for target in statement.targets:
                if isinstance(target, ast.Name) and target.id in {"revision", "down_revision"}:
                    values[target.id] = ast.literal_eval(statement.value)
        revision = values.get("revision")
        parent = values.get("down_revision")
        if not isinstance(revision, str) or not revision:
            raise ValueError(f"{path.name}: migration revision is not literal text")
        if parent is not None and not isinstance(parent, str):
            raise ValueError(f"{path.name}: canonical migration history is not linear")
        if revision in parents:
            raise ValueError(f"duplicate canonical migration revision: {revision}")
        parents[revision] = parent
    if not parents:
        raise ValueError("canonical migration history is empty")
    referenced = {parent for parent in parents.values() if parent is not None}
    unknown = referenced - set(parents)
    if unknown:
        raise ValueError("canonical migration history has unknown parents")
    heads = set(parents) - referenced
    if len(heads) != 1:
        raise ValueError("canonical migration history must have exactly one head")
    return heads.pop()


def _binding_availability(root: Path) -> dict[str, bool]:
    """Read the registry without importing SQLAlchemy or application startup."""
    path = root / "backend/app/infrastructure/operator_actions/registry.py"
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    bindings: dict[str, bool] = {}
    for statement in tree.body:
        if not isinstance(statement, ast.Assign):
            continue
        names = {
            target.id for target in statement.targets if isinstance(target, ast.Name)
        }
        if not names.intersection({"_PREPARE_BINDINGS", "_SHARED_BINDINGS"}):
            continue
        if not isinstance(statement.value, ast.Dict):
            raise ValueError("operator action binding registries must be literal dictionaries")
        for key_node, value_node in zip(statement.value.keys, statement.value.values):
            operation = _literal_string(key_node) if key_node is not None else None
            if not operation or not isinstance(value_node, ast.Call):
                raise ValueError("operator action bindings require literal operation keys and calls")
            function_name = (
                value_node.func.id if isinstance(value_node.func, ast.Name) else ""
            )
            if function_name == "_missing_action_resolver":
                bindings[operation] = False
                continue
            if function_name != "ActionAdapterBinding":
                raise ValueError(f"{operation}: unknown adapter binding constructor")
            available = next(
                (
                    keyword.value.value
                    for keyword in value_node.keywords
                    if keyword.arg == "available"
                    and isinstance(keyword.value, ast.Constant)
                    and isinstance(keyword.value.value, bool)
                ),
                None,
            )
            if available is None:
                raise ValueError(f"{operation}: adapter availability must be a literal boolean")
            bindings[operation] = available
    if not bindings:
        raise ValueError("operator action adapter registry is empty")
    return bindings


def _canonical_authority_issues(
    authority: Mapping[str, Any], classification: Mapping[str, Any]
) -> list[PromotionIssue]:
    issues: list[PromotionIssue] = []
    canonical_sources = {
        source.get("path"): source
        for source in classification.get("canonical_sources", [])
        if isinstance(source, dict)
    }
    migration = canonical_sources.get("backend/alembic", {})
    if (
        authority.get("canonical_migration_root") != "backend/alembic"
        or migration.get("classification") != "retain"
        or migration.get("role")
        != "hash-bound-canonical-production-migration-authority"
    ):
        issues.append(PromotionIssue(
            "CANONICAL_MIGRATION_AUTHORITY_INVALID",
            "backend/alembic is not the sole retained hash-bound production migration authority",
        ))
    if set(canonical_sources) != {"backend/alembic"}:
        issues.append(PromotionIssue(
            "MULTIPLE_SCHEMA_AUTHORITIES",
            "backend/alembic must be the sole retained schema creation authority",
        ))
    if classification.get("reset_strategy") != {
        "mode": "reset-only",
        "conversion_allowed": False,
        "legacy_runtime_allowed": False,
        "dual_read_write_allowed": False,
    }:
        issues.append(PromotionIssue(
            "RESET_ONLY_STRATEGY_INVALID",
            "promotion requires the reviewed reset-only strategy with no legacy compatibility mode",
        ))
    if authority.get("readiness_state") != "production_ready":
        issues.append(PromotionIssue(
            "CANONICAL_LIVE_BASELINE_UNVERIFIED",
            "schema authority remains non-production until isolated Supabase deployment, runtime cutover, and live evidence are reviewed",
        ))
    return issues


def collect_issues(root: Path = REPOSITORY_ROOT) -> list[PromotionIssue]:
    authority = _json(root, "database/schema-authority.json")
    classification = _json(root, authority["source_classification_file"])
    app_contract = _json(root, "docs/architecture/app-data-contract.json")
    operator_contract = _json(root, "docs/architecture/mcp-operator-actions.json")
    service_contract = _json(root, "backend/mcp_runtime/service-contract.json")

    issues = _canonical_authority_issues(authority, classification)
    promotion_evidence, promotion_errors = app_data_contract_gate.validate_promotion_evidence(
        app_contract, root=root, require_complete=True
    )
    for error in promotion_errors:
        issues.append(PromotionIssue(
            "APPLICATION_PROMOTION_EVIDENCE_INVALID",
            error,
        ))
    if promotion_evidence is not None:
        migration = promotion_evidence.get("migration_head")
        if isinstance(migration, dict) and migration.get("state") == "verified":
            actual_head = _migration_head(root)
            if migration.get("expected_head") != actual_head:
                issues.append(PromotionIssue(
                    "APPLICATION_PROMOTION_MIGRATION_HEAD_DRIFT",
                    f"reviewed promotion head {migration.get('expected_head')!r} differs from checked-in head {actual_head!r}",
                ))
    if app_contract.get("decision_status") != "approved_app_contract_v1":
        issues.append(PromotionIssue(
            "CANONICAL_APP_CONTRACT_UNAPPROVED",
            "the application ownership and legacy-relation map is not approved for cutover",
        ))

    prepare_operations = {
        item.get("operation_key")
        for item in operator_contract.get("prepare_actions", [])
        if isinstance(item, dict) and item.get("operation_key")
    }
    bindings = _binding_availability(root)
    publication = operator_contract.get("publication", {})
    published_operations = set(
        publication.get("published_prepare_operations", [])
    )
    declared_unavailable = set(
        publication.get("unavailable_prepare_operations", [])
    )
    missing_registry = sorted(prepare_operations - set(bindings))
    unavailable = sorted(
        operation for operation in published_operations
        if bindings.get(operation) is not True
    )
    if missing_registry:
        issues.append(PromotionIssue(
            "OPERATOR_ACTION_ADAPTER_REGISTRY_INCOMPLETE",
            "canonical prepare operations are absent from the adapter registry: "
            + ", ".join(missing_registry),
        ))
    if unavailable:
        issues.append(PromotionIssue(
            "OPERATOR_ACTION_ADAPTERS_INCOMPLETE",
            f"{len(unavailable)} canonical prepare adapters remain unavailable: "
            + ", ".join(unavailable),
        ))

    actual_unavailable = {
        operation for operation in prepare_operations
        if bindings.get(operation) is not True
    }
    if (
        not published_operations
        or published_operations | declared_unavailable != prepare_operations
        or published_operations & declared_unavailable
        or declared_unavailable != actual_unavailable
    ):
        issues.append(PromotionIssue(
            "OPERATOR_ACTION_PUBLICATION_SCOPE_INVALID",
            "published and unavailable prepare operations must partition the contract and match adapter readiness",
        ))

    gates = publication.get("release_gates", {})
    if not isinstance(gates, dict) or set(gates) != EXPECTED_RELEASE_GATES:
        issues.append(PromotionIssue(
            "MCP_RELEASE_GATE_SET_INVALID",
            "the canonical MCP promotion gate set is incomplete or has drifted",
        ))
        gates = gates if isinstance(gates, dict) else {}
    for gate in sorted(EXPECTED_RELEASE_GATES):
        if gates.get(gate) is not True:
            issues.append(PromotionIssue(
                "MCP_RELEASE_GATE_UNVERIFIED",
                gate,
            ))

    service_gates = service_contract.get("operator_actions", {}).get("release_gates")
    if service_gates != gates:
        issues.append(PromotionIssue(
            "MCP_SERVICE_RELEASE_GATE_DRIFT",
            "MCP service and canonical operator publication gates differ",
        ))

    all_gates_ready = (
        set(gates) == EXPECTED_RELEASE_GATES
        and all(gates.get(gate) is True for gate in EXPECTED_RELEASE_GATES)
    )
    architecture_exported = publication.get("operator_actions_exported") is True
    service_exported = (
        service_contract.get("writes_exported") is True
        and service_contract.get("operator_actions", {}).get("exported") is True
    )
    if not all_gates_ready and (architecture_exported or service_exported):
        issues.append(PromotionIssue(
            "OPERATOR_ACTIONS_PREMATURELY_EXPORTED",
            "operator writes were exported before every promotion gate was verified",
        ))
    if all_gates_ready and not (architecture_exported and service_exported):
        issues.append(PromotionIssue(
            "OPERATOR_ACTION_PUBLICATION_INCOMPLETE",
            "all release gates are verified but the architecture and service were not published atomically",
        ))
    return issues


def main() -> int:
    try:
        issues = collect_issues()
    except (KeyError, OSError, ValueError, json.JSONDecodeError, SyntaxError) as error:
        print(f"Canonical promotion readiness: BLOCKED: {error}")
        return 2
    if not issues:
        print("Canonical promotion readiness: READY")
        return 0
    print("Canonical promotion readiness: BLOCKED")
    for issue in issues:
        print(f"- {issue.code}: {issue.message}")
    print(f"{len(issues)} canonical promotion blocker(s)")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Fail closed until the canonical reset-and-baseline release can be promoted.

Legacy bootstrap SQL and legacy application services remain useful diagnostic
inputs, but they are not the production migration authority after the reset.
This audit therefore evaluates only checked-in promotion facts for the
canonical Alembic baseline, canonical application contract, and operator-action
boundary. External tax-provider evidence remains a separate release gate.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any, Mapping


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
EXPECTED_RELEASE_GATES = {
    "canonical_api_command_boundary_verified",
    "canonical_database_commands_deployed_verified",
    "calculation_tax_inventory_parity_verified",
    "idempotency_concurrency_audit_verified",
    "hosted_oauth_consent_verified",
    "chatgpt_claude_staging_verified",
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
    legacy = canonical_sources.get("database/02-tables", {})
    deployment = classification.get("legacy_deployment_plan", {})
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
    if (
        authority.get("bootstrap_ddl_root") != "database/02-tables"
        or legacy.get("classification") != "retain"
        or legacy.get("role") != "legacy-bootstrap-only"
    ):
        issues.append(PromotionIssue(
            "LEGACY_BOOTSTRAP_ROLE_INVALID",
            "database/02-tables must remain classified only as legacy bootstrap history",
        ))
    if (
        deployment.get("path") != authority.get("deployment_entrypoint")
        or deployment.get("classification") != "retire"
        or deployment.get("execution_state")
        != "fail-closed-pending-live-baseline"
    ):
        issues.append(PromotionIssue(
            "LEGACY_DEPLOYMENT_ENTRYPOINT_NOT_RETIRED",
            "the legacy mixed-SQL deployment entrypoint is not retired and fail-closed",
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
    missing_registry = sorted(prepare_operations - set(bindings))
    unavailable = sorted(
        operation for operation in prepare_operations if bindings.get(operation) is not True
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

    publication = operator_contract.get("publication", {})
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

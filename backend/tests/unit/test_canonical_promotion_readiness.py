import hashlib
import json
from pathlib import Path

from scripts.audit import canonical_promotion_readiness as readiness


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def _write_json(root: Path, relative_path: str, value: dict) -> None:
    path = root / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def _fixture_root(
    tmp_path: Path,
    *,
    production_ready: bool = True,
    app_approved: bool = True,
    gates_ready: bool = True,
    adapters_ready: bool = True,
    exported: bool = True,
    promotion_evidence_ready: bool = True,
) -> Path:
    state = "production_ready" if production_ready else "migrating"
    authority = {
        "readiness_state": state,
        "canonical_migration_root": "backend/alembic",
        "bootstrap_ddl_root": "database/02-tables",
        "deployment_entrypoint": "database/09-deployment/01_deploy_to_supabase.sql",
        "source_classification_file": "database/schema-source-classification.json",
    }
    classification = {
        "canonical_sources": [
            {
                "path": "database/02-tables",
                "classification": "retain",
                "role": "legacy-bootstrap-only",
            },
            {
                "path": "backend/alembic",
                "classification": "retain",
                "role": "hash-bound-canonical-production-migration-authority",
            },
        ],
        "legacy_deployment_plan": {
            "path": authority["deployment_entrypoint"],
            "classification": "retire",
            "execution_state": "fail-closed-pending-live-baseline",
        },
    }
    gates = {name: gates_ready for name in readiness.EXPECTED_RELEASE_GATES}
    operator = {
        "prepare_actions": [
            {"operation_key": "sales.order.prepare"},
            {"operation_key": "sales.invoice.prepare"},
        ],
        "publication": {
            "operator_actions_exported": exported,
            "published_prepare_operations": [
                "sales.order.prepare",
                "sales.invoice.prepare",
            ],
            "unavailable_prepare_operations": (
                [] if adapters_ready else ["sales.invoice.prepare"]
            ),
            "release_gates": gates,
        },
    }
    service = {
        "writes_exported": exported,
        "operator_actions": {"exported": exported, "release_gates": gates},
    }
    _write_json(tmp_path, "database/schema-authority.json", authority)
    _write_json(tmp_path, authority["source_classification_file"], classification)
    evidence_artifact = tmp_path / "evidence/reviewed.json"
    evidence_artifact.parent.mkdir(parents=True, exist_ok=True)
    evidence_artifact.write_text('{"verified":true}\n', encoding="utf-8")
    artifact_sha = hashlib.sha256(evidence_artifact.read_bytes()).hexdigest()
    state = "verified" if promotion_evidence_ready else "missing"
    evidence = {
        "schema_version": 1,
        "evidence_state": state if state == "verified" else "incomplete",
        "source_disposition": {
            "state": state, "strategy": "reset", "source_identifier": "source-test",
            "artifact": "evidence/reviewed.json", "artifact_sha256": artifact_sha,
        },
        "route_graph": {
            "state": state, "analyzer_kind": "mounted_route_graph",
            "reachable_retired_dependency_count": 0,
            "artifact": "evidence/reviewed.json", "artifact_sha256": artifact_sha,
        },
        "migration_head": {
            "state": state, "expected_head": "test_head", "observed_head": "test_head",
            "artifact": "evidence/reviewed.json", "artifact_sha256": artifact_sha,
        },
        "runtime_tenant_isolation": {
            "state": state, "runtime_role_non_owner": True,
            "runtime_role_no_bypassrls": True, "forced_rls_verified": True,
            "tenant_positive_test": True, "cross_tenant_denial_test": True,
            "artifact": "evidence/reviewed.json", "artifact_sha256": artifact_sha,
        },
        "reconciliation_backup": {
            "state": state, "source_target_counts_reconciled": True,
            "exact_totals_reconciled": True, "backup_verified": True,
            "restore_tested": True, "artifact": "evidence/reviewed.json",
            "artifact_sha256": artifact_sha,
        },
        "rollback_decommission": {
            "state": state, "rollback_artifact": "evidence/reviewed.json",
            "rollback_artifact_sha256": artifact_sha,
            "decommission_artifact": "evidence/reviewed.json",
            "decommission_artifact_sha256": artifact_sha,
        },
        "review": {
            "state": state, "reviewer": "release-reviewer",
            "reviewed_at": "2026-08-25T12:00:00+00:00",
            "git_commit": "a" * 40,
        },
    }
    evidence_path = tmp_path / "docs/architecture/canonical-application-promotion-evidence.json"
    _write_json(tmp_path, "docs/architecture/canonical-application-promotion-evidence.json", evidence)
    evidence_sha = hashlib.sha256(evidence_path.read_bytes()).hexdigest()
    _write_json(tmp_path, "docs/architecture/app-data-contract.json", {
        "decision_status": (
            "approved_app_contract_v1" if app_approved else "proposed_app_contract_v1"
        ),
        "promotion_evidence": {
            "manifest": "docs/architecture/canonical-application-promotion-evidence.json",
            "manifest_sha256": evidence_sha,
        },
    })
    _write_json(tmp_path, "docs/architecture/mcp-operator-actions.json", operator)
    _write_json(tmp_path, "backend/mcp_runtime/service-contract.json", service)
    registry = tmp_path / "backend/app/infrastructure/operator_actions/registry.py"
    registry.parent.mkdir(parents=True, exist_ok=True)
    invoice_binding = (
        "ActionAdapterBinding(operation_key='sales.invoice.prepare', "
        "available=True, prepare_function='prepare', execute_function='execute', "
        "unavailable_reason=None)"
        if adapters_ready
        else "_missing_action_resolver('sales.invoice.prepare', 'execute')"
    )
    registry.write_text(
        """
_PREPARE_BINDINGS = {
    "sales.order.prepare": ActionAdapterBinding(
        operation_key="sales.order.prepare", available=True,
        prepare_function="prepare", execute_function="execute",
        unavailable_reason=None,
    ),
    "sales.invoice.prepare": %s,
}
_SHARED_BINDINGS = {
    "automation.command.status.get": ActionAdapterBinding(
        operation_key="automation.command.status.get", available=True,
        prepare_function=None, execute_function=None, unavailable_reason=None,
    ),
}
""" % invoice_binding,
        encoding="utf-8",
    )
    revision = tmp_path / "backend/alembic/versions/0001_test_head.py"
    revision.parent.mkdir(parents=True, exist_ok=True)
    revision.write_text(
        'revision = "test_head"\ndown_revision = None\n', encoding="utf-8"
    )
    return tmp_path


def test_complete_canonical_promotion_contract_is_ready(tmp_path: Path):
    root = _fixture_root(tmp_path)

    assert readiness.collect_issues(root) == []


def test_nonready_release_reports_live_app_adapter_and_each_evidence_gate(
    tmp_path: Path,
):
    root = _fixture_root(
        tmp_path,
        production_ready=False,
        app_approved=False,
        gates_ready=False,
        adapters_ready=False,
        exported=False,
        promotion_evidence_ready=False,
    )

    issues = readiness.collect_issues(root)
    codes = [issue.code for issue in issues]
    gate_messages = {
        issue.message
        for issue in issues
        if issue.code == "MCP_RELEASE_GATE_UNVERIFIED"
    }

    assert "CANONICAL_LIVE_BASELINE_UNVERIFIED" in codes
    assert "CANONICAL_APP_CONTRACT_UNAPPROVED" in codes
    assert "OPERATOR_ACTION_ADAPTERS_INCOMPLETE" in codes
    assert "APPLICATION_PROMOTION_EVIDENCE_INVALID" in codes
    assert gate_messages == readiness.EXPECTED_RELEASE_GATES
    assert "OPERATOR_ACTIONS_PREMATURELY_EXPORTED" not in codes


def test_partial_evidence_cannot_publish_operator_writes(tmp_path: Path):
    root = _fixture_root(tmp_path, gates_ready=False, exported=True)
    operator_path = root / "docs/architecture/mcp-operator-actions.json"
    operator = json.loads(operator_path.read_text(encoding="utf-8"))
    operator["publication"]["release_gates"][
        "canonical_api_command_boundary_verified"
    ] = True
    operator_path.write_text(json.dumps(operator), encoding="utf-8")
    service_path = root / "backend/mcp_runtime/service-contract.json"
    service = json.loads(service_path.read_text(encoding="utf-8"))
    service["operator_actions"]["release_gates"] = operator["publication"][
        "release_gates"
    ]
    service_path.write_text(json.dumps(service), encoding="utf-8")

    codes = {issue.code for issue in readiness.collect_issues(root)}

    assert "OPERATOR_ACTIONS_PREMATURELY_EXPORTED" in codes
    assert "MCP_RELEASE_GATE_UNVERIFIED" in codes


def test_legacy_bootstrap_cannot_be_promoted_to_migration_authority(tmp_path: Path):
    root = _fixture_root(tmp_path)
    path = root / "database/schema-source-classification.json"
    classification = json.loads(path.read_text(encoding="utf-8"))
    classification["canonical_sources"][0]["role"] = "production-authority"
    path.write_text(json.dumps(classification), encoding="utf-8")

    codes = {issue.code for issue in readiness.collect_issues(root)}

    assert "LEGACY_BOOTSTRAP_ROLE_INVALID" in codes


def test_repository_stays_fail_closed_until_live_and_external_evidence_exists():
    issues = readiness.collect_issues(REPOSITORY_ROOT)
    codes = {issue.code for issue in issues}

    assert "CANONICAL_LIVE_BASELINE_UNVERIFIED" in codes
    assert "APPLICATION_PROMOTION_EVIDENCE_INVALID" in codes
    assert "MCP_RELEASE_GATE_UNVERIFIED" not in codes


def test_reviewed_migration_head_must_equal_checked_in_head(tmp_path: Path):
    root = _fixture_root(tmp_path)
    evidence_path = root / "docs/architecture/canonical-application-promotion-evidence.json"
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    evidence["migration_head"]["expected_head"] = "different_head"
    evidence["migration_head"]["observed_head"] = "different_head"
    evidence_path.write_text(json.dumps(evidence), encoding="utf-8")
    contract_path = root / "docs/architecture/app-data-contract.json"
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    contract["promotion_evidence"]["manifest_sha256"] = hashlib.sha256(
        evidence_path.read_bytes()
    ).hexdigest()
    contract_path.write_text(json.dumps(contract), encoding="utf-8")

    codes = {issue.code for issue in readiness.collect_issues(root)}

    assert "APPLICATION_PROMOTION_MIGRATION_HEAD_DRIFT" in codes

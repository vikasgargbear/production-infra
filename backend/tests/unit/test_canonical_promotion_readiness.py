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
    _write_json(
        tmp_path,
        "docs/architecture/app-data-contract.json",
        {
            "decision_status": (
                "approved_app_contract_v1"
                if app_approved
                else "proposed_app_contract_v1"
            )
        },
    )
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
    assert "MCP_RELEASE_GATE_UNVERIFIED" not in codes

import hashlib
import json
from pathlib import Path

from scripts.audit import application_promotion_evidence as promotion_evidence
from scripts.audit import canonical_promotion_readiness as readiness


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def _steps(actions: tuple[str, ...]) -> list[dict]:
    return [
        {
            "order": index,
            "action": action,
            "tool": "reviewed-operator-tool",
            "command": f"run {action}",
            "expected_result": f"{action} completes with recorded evidence",
        }
        for index, action in enumerate(actions, 1)
    ]


def _rollback_payload() -> dict:
    return {
        "state": "reviewed",
        "plan_contract_version": "reset-only-v1",
        "owner": "release-owner",
        "strategy": "fail_closed_reset_redeploy",
        "scope_project_ref": promotion_evidence.CANONICAL_STAGING_PROJECT_REF,
        "data_preservation_required": False,
        "retained_backup_required": False,
        "legacy_fallback_prohibited": True,
        "trigger_conditions": ["readiness fails"],
        "max_recovery_minutes": 30,
        "steps": _steps(promotion_evidence.RESET_ONLY_ROLLBACK_ACTIONS),
        "verification_steps": _steps(
            promotion_evidence.RESET_ONLY_VERIFICATION_ACTIONS
        ),
    }


def _decommission_payload() -> dict:
    return {
        "state": "reviewed",
        "plan_contract_version": "pause-duration-v1",
        "retired_project_ref": promotion_evidence.RETIRED_SOURCE_PROJECT_REF,
        "owner": "data-owner",
        "prerequisites": ["canonical exact-SHA acceptance is complete"],
        "data_retention_disposition": "discard_disposable_retired_project_data",
        "data_preservation_required": False,
        "final_backup_required": False,
        "pause_receipt_required": True,
        "rollback_window_duration_hours": 168,
        "rollback_window_anchor": "retired_project_pause_receipt.paused_at",
        "absolute_deletion_time_source": (
            "retired_project_pause_receipt.rollback_window_ends_at"
        ),
        "irreversible_action_approval_required": True,
        "deletion_receipt_required": True,
        "steps": _steps(promotion_evidence.RETIRED_PROJECT_DECOMMISSION_ACTIONS),
    }


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
    git_commit = "a" * 40
    render_services = {
        name: {
            "service_id": f"srv-{index}",
            "deploy_id": f"dep-{index}",
            "status": "live",
            "commit_sha": git_commit,
            "url": f"https://service-{index}.onrender.com",
        }
        for index, name in enumerate(sorted(promotion_evidence.RENDER_SERVICE_NAMES), 1)
    }
    deployment_evidence = {
        "provider": "render", "commit_sha": git_commit,
        "services": render_services,
    }
    binding = promotion_evidence.build_binding(
        project_ref=promotion_evidence.CANONICAL_STAGING_PROJECT_REF,
        git_commit=git_commit,
        deployment_evidence=deployment_evidence,
        deployment_evidence_sha256=hashlib.sha256(
            promotion_evidence._json_bytes(deployment_evidence)
        ).hexdigest(),
        deployment_artifact_id=123,
        deployment_artifact_digest="sha256:" + "9" * 64,
    )

    def artifact(kind: str, payload: dict) -> dict:
        return {
            "schema_version": promotion_evidence.SCHEMA_VERSION,
            "evidence_kind": kind,
            "binding": binding,
            "captured_at": "2026-08-25T12:00:00+00:00",
            "payload": payload,
        }

    reset_attestation = promotion_evidence.build_reset_attestation(
        project_ref=promotion_evidence.CANONICAL_STAGING_PROJECT_REF,
        git_commit=git_commit,
        reviewed_deploy_sha=git_commit,
        workflow_repository="acme/erp",
        workflow_run_id=123,
        workflow_run_attempt=1,
        reset_facts={
            "contract_version": promotion_evidence.RESET_CONTRACT_VERSION,
            "project_ref": promotion_evidence.CANONICAL_STAGING_PROJECT_REF,
            "alembic_head": "20260826_0029",
            "alembic_schema_count": 30,
            "authority_manifest_sha256": "1" * 64,
            "catalog_fingerprint_sha256": "2" * 64,
            "canonical_relation_count": 119,
            "ephemeral_scope_relation_count": 7,
            "catalog_relation_count": 126,
            "preserved_seed_relation_count": 5,
            "preserved_seed_digest_sha256": "3" * 64,
            "reset_relation_count": 114,
            "truncate_relation_count": 121,
            "disposable_row_count_before_reset": 1,
            "disposable_row_count_after_reset": 0,
            "evidence_storage_object_count_after_reset": 0,
            "auth_schema_preserved": True,
            "storage_schema_preserved": True,
            "schema_oids_preserved": True,
            "relation_oids_preserved": True,
            "isolated_role_posture_preserved": True,
            "isolated_role_catalog_preserved": True,
            "completed_at": "2026-08-25T11:00:00+00:00",
        },
        role_cleanup_facts={
            "contract_version": promotion_evidence.RESET_CONTRACT_VERSION,
            "project_ref": promotion_evidence.CANONICAL_STAGING_PROJECT_REF,
            "managed_role_count": 6,
            "login_role_count": 4,
            "login_role_password_present_count": 4,
            "postgres_migration_owner_set": False,
            "postgres_migration_owner_usage": False,
            "role_catalog_sha256": "4" * 64,
            "verified_at": "2026-08-25T11:00:01+00:00",
        },
        evidence_cleanup_facts={
            "contract_version": promotion_evidence.EVIDENCE_RESET_CLEANUP_VERSION,
            "state": "empty",
            "project_ref": promotion_evidence.CANONICAL_STAGING_PROJECT_REF,
            "bucket": promotion_evidence.EVIDENCE_STORAGE_BUCKET,
            "database_date": "2026-08-25",
            "reconciled_object_count": 0,
            "deleted_object_count": 0,
            "remaining_object_count": 0,
            "object_key_set_sha256": "5" * 64,
            "legal_hold_count": 0,
            "retention_in_force_deleted_count": 0,
            "evidence_writer_membership_open": False,
            "evidence_writer_role_posture_safe": True,
            "evidence_writer_unexpected_member_count": 0,
            "evidence_writer_inherited_role_count": 0,
            "observed_authenticator_session_count": 2,
            "terminated_authenticator_session_count": 2,
            "remaining_preclosure_authenticator_session_count": 0,
            "evidence_writer_closed_at": "2026-08-25T10:59:58+00:00",
            "completed_at": "2026-08-25T10:59:59+00:00",
        },
        reset_completed_at="2026-08-25T11:00:00+00:00",
    )
    reset_attestation_hash = hashlib.sha256(
        promotion_evidence._json_bytes(reset_attestation)
    ).hexdigest()
    artifact_values = {
        "source.json": artifact("source_disposition", {
            "strategy": "reset",
            "source_identifier": promotion_evidence.CANONICAL_STAGING_PROJECT_REF,
            "retired_source_accessed": False,
            "disposable_staging_reset_verified": True,
            "reset_workflow_run_url": "https://github.com/acme/erp/actions/runs/123",
            "reset_artifact_sha256": reset_attestation_hash,
            "reset_completed_at": "2026-08-25T11:00:00+00:00",
            "reset_attestation": reset_attestation,
        }),
        "route.json": artifact("mounted_route_graph", {
            "analyzer_kind": "mounted_route_graph",
            "mounted_routes": [{"path": "/health", "methods": ["GET"]}],
            "reachable_retired_dependency_count": 0,
            "retired_dependency_findings": [],
        }),
        "database.json": artifact("canonical_database_runtime", {
            "expected_alembic_head": "test_head",
            "observed_alembic_head": "test_head",
            "runtime_role": {
                "session_user": "erp_runtime", "superuser": False,
                "bypass_rls": False, "owns_business_relations": False,
            },
            "tenant_relation_count": 1,
            "forced_rls_failures": [],
            "tenant_positive_count": 1,
            "cross_tenant_visible_count": 0,
            "snapshot": {
                "relation_counts": {},
                "exact_numeric_sums": {},
                "table_content_sha256": {},
            },
        }),
        "reconciliation.json": artifact("reconciliation_backup_restore", {
            "source_target_counts_reconciled": True,
            "exact_totals_reconciled": True,
            "table_content_digests_reconciled": True,
            "backup_verified": True,
            "restore_tested": True,
            "backup_sha256": "b" * 64,
            "backup_size_bytes": 1,
        }),
        "live18.json": artifact("canonical_live18_acceptance", {
            "workflow_run_id": 123,
            "workflow_run_attempt": 1,
            "artifact_id": 456,
            "artifact_sha256": "c" * 64,
            "artifact_digest": "sha256:" + "d" * 64,
            "operation_count": 18,
            "operation_ids": [f"operation-{index}" for index in range(18)],
        }),
        "rollback.json": artifact("rollback_plan", _rollback_payload()),
        "decommission.json": artifact(
            "retired_project_decommission_plan", _decommission_payload()
        ),
    }
    artifact_hashes = {}
    for name, value in artifact_values.items():
        relative = f"evidence/{name}"
        _write_json(tmp_path, relative, value)
        artifact_hashes[name] = hashlib.sha256((tmp_path / relative).read_bytes()).hexdigest()
    state = "verified" if promotion_evidence_ready else "missing"
    evidence = {
        "schema_version": 2,
        "evidence_state": state if state == "verified" else "incomplete",
        "source_disposition": {
            "state": state, "strategy": "reset",
            "source_identifier": promotion_evidence.CANONICAL_STAGING_PROJECT_REF,
            "artifact": "evidence/source.json",
            "artifact_sha256": artifact_hashes["source.json"],
        },
        "route_graph": {
            "state": state, "analyzer_kind": "mounted_route_graph",
            "reachable_retired_dependency_count": 0,
            "artifact": "evidence/route.json",
            "artifact_sha256": artifact_hashes["route.json"],
        },
        "migration_head": {
            "state": state, "expected_head": "test_head", "observed_head": "test_head",
            "artifact": "evidence/database.json",
            "artifact_sha256": artifact_hashes["database.json"],
        },
        "runtime_tenant_isolation": {
            "state": state, "runtime_role_non_owner": True,
            "runtime_role_no_bypassrls": True, "forced_rls_verified": True,
            "tenant_positive_test": True, "cross_tenant_denial_test": True,
            "artifact": "evidence/database.json",
            "artifact_sha256": artifact_hashes["database.json"],
        },
        "reconciliation_backup": {
            "state": state, "source_target_counts_reconciled": True,
            "exact_totals_reconciled": True,
            "table_content_digests_reconciled": True,
            "backup_verified": True,
            "restore_tested": True, "artifact": "evidence/reconciliation.json",
            "artifact_sha256": artifact_hashes["reconciliation.json"],
        },
        "live18_acceptance": {
            "state": state, "operation_count": 18,
            "artifact": "evidence/live18.json",
            "artifact_sha256": artifact_hashes["live18.json"],
        },
        "rollback_decommission": {
            "state": state, "rollback_artifact": "evidence/rollback.json",
            "rollback_artifact_sha256": artifact_hashes["rollback.json"],
            "decommission_artifact": "evidence/decommission.json",
            "decommission_artifact_sha256": artifact_hashes["decommission.json"],
        },
        "review": {
            "state": state, "reviewer": "release-reviewer",
            "reviewed_at": "2026-08-25T12:00:00+00:00",
            "git_commit": git_commit,
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

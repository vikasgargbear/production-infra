from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from scripts.audit import application_promotion_evidence as evidence


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
        "scope_project_ref": evidence.CANONICAL_STAGING_PROJECT_REF,
        "data_preservation_required": False,
        "retained_backup_required": False,
        "legacy_fallback_prohibited": True,
        "trigger_conditions": ["readiness probe fails"],
        "max_recovery_minutes": 30,
        "steps": _steps(evidence.RESET_ONLY_ROLLBACK_ACTIONS),
        "verification_steps": _steps(evidence.RESET_ONLY_VERIFICATION_ACTIONS),
    }


def _decommission_payload() -> dict:
    return {
        "state": "reviewed",
        "plan_contract_version": "pause-duration-v1",
        "retired_project_ref": evidence.RETIRED_SOURCE_PROJECT_REF,
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
        "steps": _steps(evidence.RETIRED_PROJECT_DECOMMISSION_ACTIONS),
    }


def _render(git_commit: str) -> dict:
    return {
        "provider": "render",
        "commit_sha": git_commit,
        "services": {
            name: {
                "service_id": f"srv-{index}",
                "deploy_id": f"dep-{index}",
                "status": "live",
                "commit_sha": git_commit,
                "url": f"https://service-{index}.onrender.com",
            }
            for index, name in enumerate(sorted(evidence.RENDER_SERVICE_NAMES), 1)
        },
    }


def _railway(git_commit: str) -> dict:
    return {
        "provider": "railway",
        "git_commit": git_commit,
        "status": "live",
        "services": {
            name: {
                "deployment_id": f"00000000-0000-4000-8000-00000000000{index}",
                "url": f"https://{name}.up.railway.app",
                "health": "healthy" if name == "api" else "ok",
                **({"readiness": "ready"} if name in {"api", "mcp"} else {}),
            }
            for index, name in enumerate(sorted(evidence.RAILWAY_SERVICE_NAMES), 1)
        },
    }


def _railway_maintenance(git_commit: str) -> dict:
    value = _railway(git_commit)
    value["status"] = "maintenance"
    value["write_fence"] = "closed"
    value["services"]["mcp"]["readiness"] = "not_ready"
    return value


def _binding(git_commit: str, deployment: dict | None = None) -> dict:
    deployment = deployment or _render(git_commit)
    return evidence.build_binding(
        project_ref=evidence.CANONICAL_STAGING_PROJECT_REF,
        git_commit=git_commit,
        deployment_evidence=deployment,
        deployment_evidence_sha256=hashlib.sha256(
            evidence._json_bytes(deployment)
        ).hexdigest(),
        deployment_artifact_id=123,
        deployment_artifact_digest="sha256:" + "9" * 64,
    )


def _reset_facts(
    completed_at: str = "2026-08-25T11:00:00+00:00",
) -> dict:
    return {
        "contract_version": evidence.RESET_CONTRACT_VERSION,
        "project_ref": evidence.CANONICAL_STAGING_PROJECT_REF,
        "alembic_head": "20260826_0029",
        "alembic_schema_count": evidence.RESET_ALEMBIC_SCHEMA_COUNT,
        "authority_manifest_sha256": "1" * 64,
        "catalog_fingerprint_sha256": "2" * 64,
        "canonical_relation_count": evidence.RESET_CANONICAL_RELATION_COUNT,
        "ephemeral_scope_relation_count": evidence.RESET_EPHEMERAL_RELATION_COUNT,
        "catalog_relation_count": evidence.RESET_CATALOG_RELATION_COUNT,
        "preserved_seed_relation_count": evidence.RESET_PRESERVED_SEED_RELATION_COUNT,
        "preserved_seed_digest_sha256": "3" * 64,
        "reset_relation_count": evidence.RESET_DISPOSABLE_RELATION_COUNT,
        "truncate_relation_count": evidence.RESET_TRUNCATE_RELATION_COUNT,
        "disposable_row_count_before_reset": 123,
        "disposable_row_count_after_reset": 0,
        "evidence_storage_object_count_after_reset": 0,
        "auth_schema_preserved": True,
        "storage_schema_preserved": True,
        "schema_oids_preserved": True,
        "relation_oids_preserved": True,
        "isolated_role_posture_preserved": True,
        "isolated_role_catalog_preserved": True,
        "completed_at": completed_at,
    }


def _role_cleanup_facts() -> dict:
    return {
        "contract_version": evidence.RESET_CONTRACT_VERSION,
        "project_ref": evidence.CANONICAL_STAGING_PROJECT_REF,
        "managed_role_count": 6,
        "login_role_count": 4,
        "login_role_password_present_count": 4,
        "nonlogin_role_password_present_count": 0,
        "postgres_migration_owner_set": False,
        "postgres_migration_owner_usage": False,
        "role_catalog_sha256": "4" * 64,
        "verified_at": "2026-08-25T11:00:01+00:00",
    }


def _evidence_cleanup_facts() -> dict:
    return {
        "contract_version": evidence.EVIDENCE_RESET_CLEANUP_VERSION,
        "state": "empty",
        "project_ref": evidence.CANONICAL_STAGING_PROJECT_REF,
        "bucket": evidence.EVIDENCE_STORAGE_BUCKET,
        "database_date": "2026-08-25",
        "reconciled_object_count": 1,
        "deleted_object_count": 1,
        "remaining_object_count": 0,
        "object_key_set_sha256": "5" * 64,
        "legal_hold_count": 0,
        "retention_in_force_deleted_count": 1,
        "evidence_writer_membership_open": False,
        "evidence_writer_role_posture_safe": True,
        "evidence_writer_unexpected_member_count": 0,
        "evidence_writer_inherited_role_count": 0,
        "observed_authenticator_session_count": 2,
        "terminated_authenticator_session_count": 2,
        "remaining_preclosure_authenticator_session_count": 0,
        "evidence_writer_closed_at": "2026-08-25T10:59:58+00:00",
        "completed_at": "2026-08-25T10:59:59+00:00",
    }


def _live18_manifest(git_commit: str, binding: dict) -> dict:
    matrix = json.loads(evidence.LIVE18_MATRIX_PATH.read_text(encoding="utf-8"))
    deferred = {row["id"] for row in matrix["deferred_operations"]}
    operations = [
        operation for operation in matrix["operations"]
        if operation["id"] not in deferred
    ]
    browser = []
    resources = {}
    for index, operation in enumerate(operations, 1):
        command_id = f"10000000-0000-4000-8000-{index:012d}"
        resource_id = f"20000000-0000-4000-8000-{index:012d}"
        browser.append({
            "operation_id": operation["id"],
            "command_operation": operation["command_operation"],
            "tested_sha": git_commit,
            "command_request_id": command_id,
            "resource_id": resource_id,
            "requester_user_id": "30000000-0000-4000-8000-000000000001",
            "reviewer_user_id": "30000000-0000-4000-8000-000000000002",
            "organization_id": "30000000-0000-4000-8000-000000000003",
            "branch_id": "30000000-0000-4000-8000-000000000004",
            "preview_hash": f"sha256:{index + 200:064x}",
            "self_approval_status": (
                403 if operation["approval_policy"] == "separate_approver" else None
            ),
            "missing_required_http": [],
            "http": [
                {
                    "actor": "requester", "method": "POST",
                    "path": f"/api/web/actions/{operation['command_operation']}/prepare",
                    "status": 200, "request_id": hashlib.sha256(
                        f"prepare-{index}".encode()
                    ).hexdigest(),
                },
                {
                    "actor": (
                        "reviewer"
                        if operation["approval_policy"] == "separate_approver"
                        else "requester"
                    ),
                    "method": "POST",
                    "path": f"/api/web/actions/commands/{command_id}/approve",
                    "status": 200, "request_id": hashlib.sha256(
                        f"approve-{index}".encode()
                    ).hexdigest(),
                },
                {
                    "actor": "requester", "method": "POST",
                    "path": f"/api/web/actions/commands/{command_id}/execute",
                    "status": 200, "request_id": hashlib.sha256(
                        f"execute-{index}".encode()
                    ).hexdigest(),
                },
            ],
            "raw_evidence_sha256": f"{index:064x}",
            "screenshots": [
                {
                    "stage": stage,
                    "filename": f"{operation['id']}-{stage}.png",
                    "sha256": f"{index * 2 + offset + 1000:064x}",
                    "byte_size": 1000 + index + offset,
                    "width": 1280,
                    "height": 720,
                }
                for offset, stage in enumerate(("missing-required", "posted"))
            ],
        })
        resources[operation["id"]] = {
            "command_operation": operation["command_operation"],
            "command_request_id": command_id,
            "resource_id": resource_id,
            "cross_tenant_denied": True,
            "database_sha256": f"{index + 100:064x}",
        }
    provider = binding["deployment_provider"]
    operation_set_sha256 = hashlib.sha256(json.dumps(
        {
            operation["id"]: operation["command_operation"]
            for operation in operations
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode()).hexdigest()
    browser_evidence_set_sha256 = hashlib.sha256(json.dumps(
        {row["operation_id"]: row["raw_evidence_sha256"] for row in browser},
        sort_keys=True,
        separators=(",", ":"),
    ).encode()).hexdigest()
    return {
        "schema": "aasopharma.live18.upload-manifest.v1",
        "run": {"id": "123", "attempt": "1", "browser_outcome": "success"},
        "deployment": {
            "provider": binding["deployment_provider"],
            "commit_sha": git_commit,
            "status": "ready",
            "origins": {
                name: row["url"] for name, row in binding["deployment_services"].items()
            },
            "deployment_ids": (
                {
                    name: row["deployment_id"]
                    for name, row in binding["deployment_services"].items()
                }
                if binding["deployment_provider"] == "railway"
                else None
            ),
            # This hashes the Live18 public-deployment attestation. The binding
            # separately hashes the provider's immutable deployment artifact.
            "raw_evidence_sha256": "e" * 64,
        },
        "browser": browser,
        "browser_failures": [],
        "database": {
            "expected_sha": git_commit,
            "project_ref": evidence.CANONICAL_STAGING_PROJECT_REF,
            "organization_id": "30000000-0000-4000-8000-000000000003",
            "denial_organization_id": "30000000-0000-4000-8000-000000000005",
            "runtime_role": ({
                "current_user": "erp_runtime", "superuser": False,
                "bypassrls": False, "migration_owner_member": False,
                "network_family": 6,
                "transport": "supabase_direct_ipv6_from_railway",
            } if provider == "railway" else {
                "current_user": "erp_runtime", "superuser": False,
                "bypassrls": False, "migration_owner_member": False,
                "row_security": True, "network_family": 4,
                "transport": "supabase_direct_ipv4_from_github_actions",
            }),
            "resources": resources,
            "raw_evidence_sha256": "b" * 64,
        },
        "demo": {
            "action": "provision-demo",
            "provider": provider,
            "commit_sha": git_commit,
            "project_ref": evidence.CANONICAL_STAGING_PROJECT_REF,
            "run": {"id": "123", "attempt": "1"},
            "summary_sha256": "a" * 64 if provider == "render" else None,
            "content_sha256": "c" * 64,
            "write_fence": "open" if provider == "railway" else None,
            "raw_evidence_sha256": "d" * 64,
        },
        "reconciliation": {
            "status": "success",
            "provider": provider,
            "commit_sha": git_commit,
            "operation_count": len(resources),
            "operation_ids": sorted(resources),
            "operation_set_sha256": operation_set_sha256,
            "browser_evidence_set_sha256": browser_evidence_set_sha256,
            "database_mode": (
                "captured_railway"
                if provider == "railway"
                else "captured_render_runtime"
            ),
            "database_evidence_sha256": "b" * 64,
            "raw_attestation_sha256": "f" * 64,
        },
    }


def _write(path: Path, value: dict) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, sort_keys=True) + "\n", encoding="utf-8")
    return path


def _artifact(kind: str, binding: dict, payload: dict) -> dict:
    return {
        "schema_version": evidence.SCHEMA_VERSION,
        "evidence_kind": kind,
        "binding": binding,
        "captured_at": "2026-08-25T12:00:00+00:00",
        "payload": payload,
    }


def _bundle(tmp_path: Path):
    git_commit = "a" * 40
    binding = _binding(git_commit)
    reset_attestation = evidence.build_reset_attestation(
        project_ref=evidence.CANONICAL_STAGING_PROJECT_REF,
        git_commit=git_commit,
        reviewed_deploy_sha=git_commit,
        workflow_repository="acme/erp",
        workflow_run_id=123,
        workflow_run_attempt=1,
        reset_facts=_reset_facts(),
        role_cleanup_facts=_role_cleanup_facts(),
        evidence_cleanup_facts=_evidence_cleanup_facts(),
        reset_completed_at="2026-08-25T11:00:00+00:00",
    )
    reset_attestation_hash = hashlib.sha256(
        evidence._json_bytes(reset_attestation)
    ).hexdigest()
    paths = {
        "source": _write(tmp_path / "evidence/source.json", _artifact(
            "source_disposition", binding, {
                "state": "reviewed",
                "strategy": "reset",
                "source_identifier": evidence.CANONICAL_STAGING_PROJECT_REF,
                "retired_source_accessed": False,
                "disposable_staging_reset_verified": True,
                "reset_workflow_run_url": "https://github.com/acme/erp/actions/runs/123",
                "reset_artifact_sha256": reset_attestation_hash,
                "reset_completed_at": "2026-08-25T11:00:00+00:00",
                "reset_attestation": reset_attestation,
            },
        )),
        "route": _write(tmp_path / "evidence/route.json", _artifact(
            "mounted_route_graph", binding, {
                "analyzer_kind": "mounted_route_graph",
                "mounted_routes": [{"path": "/health", "methods": ["GET"]}],
                "retired_dependency_findings": [],
                "reachable_retired_dependency_count": 0,
            },
        )),
        "database": _write(tmp_path / "evidence/database.json", _artifact(
            "canonical_database_runtime", binding, {
                "expected_alembic_head": "0016_sales_invoice_auto_fefo",
                "observed_alembic_head": "0016_sales_invoice_auto_fefo",
                "runtime_role": {
                    "session_user": "erp_runtime", "superuser": False,
                    "bypass_rls": False, "owns_business_relations": False,
                },
                "tenant_relation_count": 93,
                "forced_rls_failures": [],
                "tenant_positive_count": 1,
                "cross_tenant_visible_count": 0,
                "snapshot": {
                    "relation_counts": {"sales.invoices": 1},
                    "exact_numeric_sums": {"sales.invoices.grand_total": "100.00"},
                    "table_content_sha256": {"sales.invoices": "c" * 64},
                },
            },
        )),
        "reconciliation": _write(tmp_path / "evidence/reconciliation.json", _artifact(
            "reconciliation_backup_restore", binding, {
                "source_target_counts_reconciled": True,
                "exact_totals_reconciled": True,
                "table_content_digests_reconciled": True,
                "backup_verified": True,
                "restore_tested": True,
                "backup_sha256": "b" * 64,
                "backup_size_bytes": 100,
            },
        )),
        "live18": _write(
            tmp_path / "evidence/live18.json",
            evidence.capture_live18_acceptance(
                manifest=_live18_manifest(git_commit, binding), binding=binding,
                workflow_run_id=123, workflow_run_attempt=1, artifact_id=456,
                artifact_sha256="e" * 64,
                artifact_digest="sha256:" + "8" * 64,
            ),
        ),
        "rollback": _write(tmp_path / "evidence/rollback.json", _artifact(
            "rollback_plan", binding, _rollback_payload(),
        )),
        "decommission": _write(tmp_path / "evidence/decommission.json", _artifact(
            "retired_project_decommission_plan", binding, _decommission_payload(),
        )),
    }
    return git_commit, binding, paths


def test_binding_rejects_retired_project_and_mixed_render_sha():
    git_commit = "a" * 40
    with pytest.raises(evidence.EvidenceError, match="only disposable canonical staging"):
        evidence.build_binding(
            project_ref=evidence.RETIRED_SOURCE_PROJECT_REF,
            git_commit=git_commit,
            deployment_evidence=_render(git_commit),
            deployment_evidence_sha256="a" * 64,
            deployment_artifact_id=123,
            deployment_artifact_digest="sha256:" + "9" * 64,
        )


def test_railway_binding_requires_exact_healthy_three_service_deployment():
    git_commit = "a" * 40
    deployment = _railway(git_commit)
    binding = _binding(git_commit, deployment)
    assert binding["deployment_provider"] == "railway"
    assert set(binding["deployment_services"]) == {"api", "frontend", "mcp"}
    stale = _railway(git_commit)
    stale["services"]["api"]["readiness"] = "starting"
    with pytest.raises(evidence.EvidenceError, match="not ready"):
        _binding(git_commit, stale)
    mixed = _railway(git_commit)
    mixed["provider"] = "render"
    with pytest.raises(evidence.EvidenceError):
        _binding(git_commit, mixed)
    wrong_sha = _railway("b" * 40)
    with pytest.raises(evidence.EvidenceError, match="reviewed commit"):
        _binding(git_commit, wrong_sha)
    invalid_id = _railway(git_commit)
    invalid_id["services"]["mcp"]["deployment_id"] = "latest"
    with pytest.raises(evidence.EvidenceError, match="immutable deployment identity"):
        _binding(git_commit, invalid_id)
    missing_service = _railway(git_commit)
    del missing_service["services"]["frontend"]
    with pytest.raises(evidence.EvidenceError, match="exactly api, frontend, and mcp"):
        _binding(git_commit, missing_service)
    unhealthy = _railway(git_commit)
    unhealthy["services"]["frontend"]["health"] = "degraded"
    with pytest.raises(evidence.EvidenceError, match="not healthy"):
        _binding(git_commit, unhealthy)
    swapped_health_contract = _railway(git_commit)
    swapped_health_contract["services"]["api"]["health"] = "ok"
    with pytest.raises(evidence.EvidenceError, match="not healthy"):
        _binding(git_commit, swapped_health_contract)


def test_railway_maintenance_reconciles_only_same_run_live18_readiness():
    git_commit = "a" * 40
    maintenance = _railway_maintenance(git_commit)
    provisional_binding = {
        "deployment_provider": "railway",
        "git_commit": git_commit,
        "deployment_services": {
                name: {
                    "url": row["url"],
                    "deployment_id": row["deployment_id"],
                }
            for name, row in maintenance["services"].items()
        },
    }
    manifest = _live18_manifest(git_commit, provisional_binding)
    common = {
        "maintenance_evidence": maintenance,
        "maintenance_evidence_sha256": "1" * 64,
        "deployment_artifact_id": 123,
        "deployment_artifact_digest": "sha256:" + "2" * 64,
        "live18_manifest": manifest,
        "workflow_run_id": 123,
        "workflow_run_attempt": 1,
        "live18_artifact_id": 456,
        "live18_artifact_sha256": "3" * 64,
        "live18_artifact_digest": "sha256:" + "4" * 64,
        "expected_sha": git_commit,
    }

    reconciled = evidence.reconcile_railway_deferred_deployment(**common)

    assert reconciled["status"] == "live"
    assert reconciled["write_fence"] == "open"
    assert reconciled["services"]["mcp"]["readiness"] == "ready"
    assert reconciled["lifecycle_transition"] == {
        "from": "maintenance",
        "to": "live",
        "workflow_run_id": 123,
        "workflow_run_attempt": 1,
        "deployment_artifact_id": 123,
        "deployment_artifact_digest": "sha256:" + "2" * 64,
        "maintenance_evidence_sha256": "1" * 64,
        "live18_artifact_id": 456,
        "live18_artifact_sha256": "3" * 64,
        "live18_artifact_digest": "sha256:" + "4" * 64,
        "live18_deployment_evidence_sha256": "e" * 64,
    }
    binding = _binding(git_commit, reconciled)
    evidence.capture_live18_acceptance(
        manifest=manifest,
        binding=binding,
        workflow_run_id=123,
        workflow_run_attempt=1,
        artifact_id=456,
        artifact_sha256="3" * 64,
        artifact_digest="sha256:" + "4" * 64,
    )

    wrong_run = json.loads(json.dumps(manifest))
    wrong_run["run"]["attempt"] = "2"
    with pytest.raises(evidence.EvidenceError, match="does not match"):
        evidence.reconcile_railway_deferred_deployment(
            **{**common, "live18_manifest": wrong_run}
        )

    wrong_origin = json.loads(json.dumps(manifest))
    wrong_origin["deployment"]["origins"]["api"] = "https://other.up.railway.app"
    with pytest.raises(evidence.EvidenceError, match="does not match"):
        evidence.reconcile_railway_deferred_deployment(
            **{**common, "live18_manifest": wrong_origin}
        )

    wrong_deployment = json.loads(json.dumps(manifest))
    wrong_deployment["deployment"]["deployment_ids"]["mcp"] = (
        "20000000-0000-4000-8000-000000000009"
    )
    with pytest.raises(evidence.EvidenceError, match="does not match"):
        evidence.reconcile_railway_deferred_deployment(
            **{**common, "live18_manifest": wrong_deployment}
        )

    with pytest.raises(evidence.EvidenceError, match="artifact identity"):
        evidence.reconcile_railway_deferred_deployment(
            **{**common, "live18_artifact_digest": "sha256:wrong"}
        )


def test_live18_acceptance_requires_exact_matrix_and_runtime_reconciliation():
    git_commit = "a" * 40
    binding = _binding(git_commit, _railway(git_commit))
    manifest = _live18_manifest(git_commit, binding)
    artifact = evidence.capture_live18_acceptance(
        manifest=manifest, binding=binding,
        workflow_run_id=123, workflow_run_attempt=1, artifact_id=456,
        artifact_sha256="f" * 64,
        artifact_digest="sha256:" + "8" * 64,
    )
    assert artifact["payload"]["operation_count"] == 17

    pre_browser_failure = json.loads(json.dumps(manifest))
    pre_browser_failure["run"]["browser_outcome"] = "skipped"
    pre_browser_failure["deployment"]["status"] = "provenance_only"
    with pytest.raises(evidence.EvidenceError, match="not a successful exact-run"):
        evidence.capture_live18_acceptance(
            manifest=pre_browser_failure, binding=binding,
            workflow_run_id=123, workflow_run_attempt=1, artifact_id=456,
            artifact_sha256="f" * 64,
            artifact_digest="sha256:" + "8" * 64,
        )

    replay_diagnostic = json.loads(json.dumps(manifest))
    next(
        row for row in replay_diagnostic["browser"]
        if row["operation_id"] == "sales_invoice"
    )["http"].append({
        "actor": "requester", "method": "POST",
        "path": "/api/web/actions/commands/10000000-0000-4000-8000-000000000001/execute",
        "status": 409, "request_id": "1" * 64,
    })
    evidence.capture_live18_acceptance(
        manifest=replay_diagnostic, binding=binding,
        workflow_run_id=123, workflow_run_attempt=1, artifact_id=456,
        artifact_sha256="f" * 64,
        artifact_digest="sha256:" + "8" * 64,
    )

    wrong_approval_actor = json.loads(json.dumps(manifest))
    sales_return = next(
        row for row in wrong_approval_actor["browser"]
        if row["operation_id"] == "sales_return"
    )
    next(
        item for item in sales_return["http"]
        if item["path"].endswith("/approve")
    )["actor"] = "requester"
    with pytest.raises(evidence.EvidenceError, match="approval actor"):
        evidence.capture_live18_acceptance(
            manifest=wrong_approval_actor, binding=binding,
            workflow_run_id=123, workflow_run_attempt=1, artifact_id=456,
            artifact_sha256="f" * 64,
            artifact_digest="sha256:" + "8" * 64,
        )

    duplicate_execute = json.loads(json.dumps(manifest))
    sales_invoice = next(
        row for row in duplicate_execute["browser"]
        if row["operation_id"] == "sales_invoice"
    )
    execute = next(
        item for item in sales_invoice["http"]
        if item["path"].endswith("/execute")
    )
    sales_invoice["http"].append({**execute, "request_id": "2" * 64})
    with pytest.raises(evidence.EvidenceError, match="execute exactly once"):
        evidence.capture_live18_acceptance(
            manifest=duplicate_execute, binding=binding,
            workflow_run_id=123, workflow_run_attempt=1, artifact_id=456,
            artifact_sha256="f" * 64,
            artifact_digest="sha256:" + "8" * 64,
        )

    valid_missing_required = json.loads(json.dumps(manifest))
    sales_invoice = next(
        row for row in valid_missing_required["browser"]
        if row["operation_id"] == "sales_invoice"
    )
    missing_required_row = {
        "actor": "requester", "method": "POST",
        "path": "/api/web/actions/sales.invoice.prepare/prepare",
        "status": 422, "request_id": "3" * 64,
    }
    sales_invoice["http"].append(missing_required_row)
    sales_invoice["missing_required_http"] = [missing_required_row]
    evidence.capture_live18_acceptance(
        manifest=valid_missing_required, binding=binding,
        workflow_run_id=123, workflow_run_attempt=1, artifact_id=456,
        artifact_sha256="f" * 64,
        artifact_digest="sha256:" + "8" * 64,
    )

    successful_missing_required = json.loads(json.dumps(manifest))
    sales_invoice = next(
        row for row in successful_missing_required["browser"]
        if row["operation_id"] == "sales_invoice"
    )
    successful_missing_row = {
        "actor": "requester", "method": "POST",
        "path": "/api/web/actions/sales.invoice.prepare/prepare",
        "status": 200, "request_id": "4" * 64,
    }
    sales_invoice["http"].append(successful_missing_row)
    sales_invoice["missing_required_http"] = [successful_missing_row]
    with pytest.raises(evidence.EvidenceError, match="missing-required"):
        evidence.capture_live18_acceptance(
            manifest=successful_missing_required, binding=binding,
            workflow_run_id=123, workflow_run_attempt=1, artifact_id=456,
            artifact_sha256="f" * 64,
            artifact_digest="sha256:" + "8" * 64,
        )

    invented_missing_required = json.loads(json.dumps(manifest))
    sales_invoice = next(
        row for row in invented_missing_required["browser"]
        if row["operation_id"] == "sales_invoice"
    )
    sales_invoice["missing_required_http"] = [{
        "actor": "requester", "method": "POST",
        "path": "/api/web/actions/sales.invoice.prepare/prepare",
        "status": 422, "request_id": "5" * 64,
    }]
    with pytest.raises(evidence.EvidenceError, match="not part of the browser capture"):
        evidence.capture_live18_acceptance(
            manifest=invented_missing_required, binding=binding,
            workflow_run_id=123, workflow_run_attempt=1, artifact_id=456,
            artifact_sha256="f" * 64,
            artifact_digest="sha256:" + "8" * 64,
        )

    missing_self_denial = json.loads(json.dumps(manifest))
    next(
        row
        for row in missing_self_denial["browser"]
        if row["operation_id"] == "sales_return"
    )["self_approval_status"] = None
    with pytest.raises(evidence.EvidenceError, match="self-approval"):
        evidence.capture_live18_acceptance(
            manifest=missing_self_denial, binding=binding,
            workflow_run_id=123, workflow_run_attempt=1, artifact_id=456,
            artifact_sha256="f" * 64,
            artifact_digest="sha256:" + "8" * 64,
        )

    invented_actor_confirmation_denial = json.loads(json.dumps(manifest))
    next(
        row
        for row in invented_actor_confirmation_denial["browser"]
        if row["operation_id"] == "sales_invoice"
    )["self_approval_status"] = 403
    with pytest.raises(evidence.EvidenceError, match="self-approval"):
        evidence.capture_live18_acceptance(
            manifest=invented_actor_confirmation_denial, binding=binding,
            workflow_run_id=123, workflow_run_attempt=1, artifact_id=456,
            artifact_sha256="f" * 64,
            artifact_digest="sha256:" + "8" * 64,
        )

    missing = json.loads(json.dumps(manifest))
    missing["browser"].pop()
    with pytest.raises(evidence.EvidenceError, match="every ready operation"):
        evidence.capture_live18_acceptance(
            manifest=missing, binding=binding,
            workflow_run_id=123, workflow_run_attempt=1, artifact_id=456,
            artifact_sha256="f" * 64,
            artifact_digest="sha256:" + "8" * 64,
        )
    bypass = json.loads(json.dumps(manifest))
    bypass["database"]["runtime_role"]["bypassrls"] = True
    with pytest.raises(evidence.EvidenceError, match="provider-matched isolated runtime role"):
        evidence.capture_live18_acceptance(
            manifest=bypass, binding=binding,
            workflow_run_id=123, workflow_run_attempt=1, artifact_id=456,
            artifact_sha256="f" * 64,
            artifact_digest="sha256:" + "8" * 64,
        )
    wrong_reconciliation = json.loads(json.dumps(manifest))
    wrong_reconciliation["reconciliation"]["browser_evidence_set_sha256"] = "0" * 64
    with pytest.raises(evidence.EvidenceError, match="reconciliation attestation"):
        evidence.capture_live18_acceptance(
            manifest=wrong_reconciliation, binding=binding,
            workflow_run_id=123, workflow_run_attempt=1, artifact_id=456,
            artifact_sha256="f" * 64,
            artifact_digest="sha256:" + "8" * 64,
        )
    raw_request_id = json.loads(json.dumps(manifest))
    raw_request_id["browser"][0]["http"][0]["request_id"] = "provider-request-id"
    with pytest.raises(evidence.EvidenceError, match="HTTP evidence row"):
        evidence.capture_live18_acceptance(
            manifest=raw_request_id, binding=binding,
            workflow_run_id=123, workflow_run_attempt=1, artifact_id=456,
            artifact_sha256="f" * 64,
            artifact_digest="sha256:" + "8" * 64,
        )
    missing_database_hash = json.loads(json.dumps(manifest))
    missing_database_hash["database"]["raw_evidence_sha256"] = None
    with pytest.raises(evidence.EvidenceError, match="raw evidence hash"):
        evidence.capture_live18_acceptance(
            manifest=missing_database_hash, binding=binding,
            workflow_run_id=123, workflow_run_attempt=1, artifact_id=456,
            artifact_sha256="f" * 64,
            artifact_digest="sha256:" + "8" * 64,
        )
    cross_tenant = json.loads(json.dumps(manifest))
    cross_tenant["database"]["resources"]["sales_invoice"]["cross_tenant_denied"] = False
    with pytest.raises(evidence.EvidenceError, match="did not reconcile"):
        evidence.capture_live18_acceptance(
            manifest=cross_tenant, binding=binding,
            workflow_run_id=123, workflow_run_attempt=1, artifact_id=456,
            artifact_sha256="f" * 64,
            artifact_digest="sha256:" + "8" * 64,
        )
    wrong_run = json.loads(json.dumps(manifest))
    wrong_run["run"]["id"] = "124"
    with pytest.raises(evidence.EvidenceError, match="exact-run"):
        evidence.capture_live18_acceptance(
            manifest=wrong_run, binding=binding,
            workflow_run_id=123, workflow_run_attempt=1, artifact_id=456,
            artifact_sha256="f" * 64,
            artifact_digest="sha256:" + "8" * 64,
        )
    wrong_origin = json.loads(json.dumps(manifest))
    wrong_origin["deployment"]["origins"]["api"] = "https://other.up.railway.app"
    with pytest.raises(evidence.EvidenceError, match="origins differ"):
        evidence.capture_live18_acceptance(
            manifest=wrong_origin, binding=binding,
            workflow_run_id=123, workflow_run_attempt=1, artifact_id=456,
            artifact_sha256="f" * 64,
            artifact_digest="sha256:" + "8" * 64,
        )
    missing_deployment_hash = json.loads(json.dumps(manifest))
    missing_deployment_hash["deployment"]["raw_evidence_sha256"] = None
    with pytest.raises(evidence.EvidenceError, match="raw evidence hash"):
        evidence.capture_live18_acceptance(
            manifest=missing_deployment_hash, binding=binding,
            workflow_run_id=123, workflow_run_attempt=1, artifact_id=456,
            artifact_sha256="f" * 64,
            artifact_digest="sha256:" + "8" * 64,
        )
    resource_drift = json.loads(json.dumps(manifest))
    resource_drift["database"]["resources"]["sales_invoice"]["resource_id"] = (
        "40000000-0000-4000-8000-000000000001"
    )
    with pytest.raises(evidence.EvidenceError, match="did not reconcile"):
        evidence.capture_live18_acceptance(
            manifest=resource_drift, binding=binding,
            workflow_run_id=123, workflow_run_attempt=1, artifact_id=456,
            artifact_sha256="f" * 64,
            artifact_digest="sha256:" + "8" * 64,
        )
    stale = _render(git_commit)
    stale["services"]["aasopharma-api-pilot"]["commit_sha"] = "b" * 40
    with pytest.raises(evidence.EvidenceError, match="not live on the reviewed commit"):
        evidence.build_binding(
            project_ref=evidence.CANONICAL_STAGING_PROJECT_REF,
            git_commit=git_commit,
            deployment_evidence=stale,
            deployment_evidence_sha256="a" * 64,
            deployment_artifact_id=123,
            deployment_artifact_digest="sha256:" + "9" * 64,
        )


def test_live18_render_acceptance_requires_direct_isolated_runtime_evidence():
    git_commit = "a" * 40
    binding = _binding(git_commit, _render(git_commit))
    manifest = _live18_manifest(git_commit, binding)

    artifact = evidence.capture_live18_acceptance(
        manifest=manifest,
        binding=binding,
        workflow_run_id=123,
        workflow_run_attempt=1,
        artifact_id=456,
        artifact_sha256="f" * 64,
        artifact_digest="sha256:" + "8" * 64,
    )
    assert artifact["payload"]["operation_count"] == 17

    wrong_transport = json.loads(json.dumps(manifest))
    wrong_transport["database"]["runtime_role"]["transport"] = (
        "supabase_direct_ipv6_from_railway"
    )
    with pytest.raises(
        evidence.EvidenceError, match="provider-matched isolated runtime role"
    ):
        evidence.capture_live18_acceptance(
            manifest=wrong_transport,
            binding=binding,
            workflow_run_id=123,
            workflow_run_attempt=1,
            artifact_id=456,
            artifact_sha256="f" * 64,
            artifact_digest="sha256:" + "8" * 64,
        )
    wrong_demo_provider = json.loads(json.dumps(manifest))
    wrong_demo_provider["demo"]["provider"] = "railway"
    with pytest.raises(evidence.EvidenceError, match="same-run demo evidence"):
        evidence.capture_live18_acceptance(
            manifest=wrong_demo_provider,
            binding=binding,
            workflow_run_id=123,
            workflow_run_attempt=1,
            artifact_id=456,
            artifact_sha256="f" * 64,
            artifact_digest="sha256:" + "8" * 64,
        )


def test_reset_attestation_binds_exact_run_and_rejects_wrong_project():
    attestation = evidence.build_reset_attestation(
        project_ref=evidence.CANONICAL_STAGING_PROJECT_REF,
        git_commit="a" * 40,
        reviewed_deploy_sha="b" * 40,
        workflow_repository="acme/erp",
        workflow_run_id=123,
        workflow_run_attempt=2,
        reset_facts=_reset_facts(),
        role_cleanup_facts=_role_cleanup_facts(),
        evidence_cleanup_facts=_evidence_cleanup_facts(),
        reset_completed_at="2026-08-25T11:00:00+00:00",
    )
    assert attestation["payload"]["workflow_run_url"] == (
        "https://github.com/acme/erp/actions/runs/123"
    )
    assert attestation["payload"]["auth_schema_preserved"] is True
    assert attestation["payload"]["catalog_relation_count_after_reset"] == 126
    with pytest.raises(evidence.EvidenceError, match="restricted to canonical staging"):
        evidence.build_reset_attestation(
            project_ref=evidence.RETIRED_SOURCE_PROJECT_REF,
            git_commit="a" * 40,
            reviewed_deploy_sha="b" * 40,
            workflow_repository="acme/erp",
            workflow_run_id=123,
            workflow_run_attempt=2,
            reset_facts=_reset_facts(),
            role_cleanup_facts=_role_cleanup_facts(),
            evidence_cleanup_facts=_evidence_cleanup_facts(),
            reset_completed_at="2026-08-25T11:00:00+00:00",
        )

    drifted = _reset_facts()
    drifted["catalog_relation_count"] = 125
    with pytest.raises(evidence.EvidenceError, match="data-reset contract"):
        evidence.build_reset_attestation(
            project_ref=evidence.CANONICAL_STAGING_PROJECT_REF,
            git_commit="a" * 40,
            reviewed_deploy_sha="b" * 40,
            workflow_repository="acme/erp",
            workflow_run_id=123,
            workflow_run_attempt=2,
            reset_facts=drifted,
            role_cleanup_facts=_role_cleanup_facts(),
            evidence_cleanup_facts=_evidence_cleanup_facts(),
            reset_completed_at="2026-08-25T11:00:00+00:00",
        )

    with pytest.raises(evidence.EvidenceError, match="completion time differs"):
        evidence.build_reset_attestation(
            project_ref=evidence.CANONICAL_STAGING_PROJECT_REF,
            git_commit="a" * 40,
            reviewed_deploy_sha="b" * 40,
            workflow_repository="acme/erp",
            workflow_run_id=123,
            workflow_run_attempt=2,
            reset_facts=_reset_facts(),
            role_cleanup_facts=_role_cleanup_facts(),
            evidence_cleanup_facts=_evidence_cleanup_facts(),
            reset_completed_at="2026-08-25T11:00:01+00:00",
        )

    invalid_cleanup = _evidence_cleanup_facts()
    invalid_cleanup["retention_in_force_deleted_count"] = 2
    with pytest.raises(evidence.EvidenceError, match="retention override count"):
        evidence.build_reset_attestation(
            project_ref=evidence.CANONICAL_STAGING_PROJECT_REF,
            git_commit="a" * 40,
            reviewed_deploy_sha="b" * 40,
            workflow_repository="acme/erp",
            workflow_run_id=123,
            workflow_run_attempt=2,
            reset_facts=_reset_facts(),
            role_cleanup_facts=_role_cleanup_facts(),
            evidence_cleanup_facts=invalid_cleanup,
            reset_completed_at="2026-08-25T11:00:00+00:00",
        )


def test_source_disposition_consumes_exact_reset_attestation(tmp_path: Path):
    git_commit = "a" * 40
    binding = _binding(git_commit)
    attestation_path = _write(
        tmp_path / "evidence/reset.json",
        evidence.build_reset_attestation(
            project_ref=evidence.CANONICAL_STAGING_PROJECT_REF,
            git_commit=git_commit,
            reviewed_deploy_sha=git_commit,
            workflow_repository="acme/erp",
            workflow_run_id=123,
            workflow_run_attempt=1,
            reset_facts=_reset_facts(),
            role_cleanup_facts=_role_cleanup_facts(),
            evidence_cleanup_facts=_evidence_cleanup_facts(),
            reset_completed_at="2026-08-25T11:00:00+00:00",
        ),
    )
    source_path = _write(tmp_path / "source.json", {
        "state": "reviewed",
        "strategy": "reset",
        "source_identifier": evidence.CANONICAL_STAGING_PROJECT_REF,
        "retired_source_accessed": False,
        "disposable_staging_reset_verified": True,
        "reset_workflow_run_url": "https://github.com/acme/erp/actions/runs/123",
        "reset_attestation_artifact": "evidence/reset.json",
        "reset_artifact_sha256": hashlib.sha256(attestation_path.read_bytes()).hexdigest(),
        "reset_completed_at": "2026-08-25T11:00:00+00:00",
        "reviewer": "release-reviewer",
        "reviewed_at": "2026-08-25T12:00:00+00:00",
        "blockers": [],
    })
    wrapped = evidence.wrap_reviewed_input(
        kind="source_disposition",
        input_path=source_path,
        binding=binding,
        repository_root=tmp_path,
    )
    assert wrapped["payload"]["reset_attestation"]["payload"][
        "workflow_run_id"
    ] == 123

    source = json.loads(source_path.read_text(encoding="utf-8"))
    source["reset_artifact_sha256"] = "0" * 64
    _write(source_path, source)
    with pytest.raises(evidence.EvidenceError, match="hash differs"):
        evidence.wrap_reviewed_input(
            kind="source_disposition",
            input_path=source_path,
            binding=binding,
            repository_root=tmp_path,
        )


def test_backup_reconciliation_rejects_nonnumeric_content_drift(tmp_path: Path):
    git_commit = "a" * 40
    binding = _binding(git_commit)
    source = _artifact("canonical_database_runtime", binding, {
        "snapshot": {
            "relation_counts": {"sales.invoices": 1},
            "exact_numeric_sums": {"sales.invoices.grand_total": "100.00"},
            "table_content_sha256": {"sales.invoices": "1" * 64},
        },
    })
    restored = _artifact("canonical_database_snapshot", binding, {
        "snapshot": {
            "relation_counts": {"sales.invoices": 1},
            "exact_numeric_sums": {"sales.invoices.grand_total": "100.00"},
            "table_content_sha256": {"sales.invoices": "2" * 64},
        },
    })
    backup = tmp_path / "backup.sql"
    backup.write_text("-- nonempty\n", encoding="utf-8")
    with pytest.raises(evidence.EvidenceError, match="does not exactly reconcile"):
        evidence.reconcile_backup(
            source_artifact=source,
            restored_artifact=restored,
            backup_file=backup,
            binding=binding,
        )


def test_backup_reconciliation_rejects_missing_content_digests(tmp_path: Path):
    git_commit = "a" * 40
    binding = _binding(git_commit)
    snapshot = {
        "relation_counts": {"sales.invoices": 1},
        "exact_numeric_sums": {"sales.invoices.grand_total": "100.00"},
    }
    source = _artifact("canonical_database_runtime", binding, {"snapshot": snapshot})
    restored = _artifact(
        "canonical_database_snapshot", binding, {"snapshot": dict(snapshot)}
    )
    backup = tmp_path / "backup.sql"
    backup.write_text("-- nonempty\n", encoding="utf-8")
    with pytest.raises(evidence.EvidenceError, match="does not exactly reconcile"):
        evidence.reconcile_backup(
            source_artifact=source,
            restored_artifact=restored,
            backup_file=backup,
            binding=binding,
        )


def test_candidate_manifest_requires_deep_exact_sha_artifacts(tmp_path: Path):
    git_commit, binding, paths = _bundle(tmp_path)
    manifest = evidence.assemble_manifest(
        root=tmp_path,
        binding=binding,
        source_path=paths["source"],
        route_path=paths["route"],
        database_path=paths["database"],
        reconciliation_path=paths["reconciliation"],
        live18_path=paths["live18"],
        rollback_path=paths["rollback"],
        decommission_path=paths["decommission"],
        reviewer="release-reviewer",
        reviewed_at="2026-08-25T12:30:00+00:00",
    )
    assert manifest["review"]["git_commit"] == git_commit
    assert evidence.validate_manifest_artifacts(tmp_path, manifest) == []

    mixed = json.loads(paths["rollback"].read_text(encoding="utf-8"))
    mixed["binding"]["git_commit"] = "c" * 40
    _write(paths["rollback"], mixed)
    manifest["rollback_decommission"]["rollback_artifact_sha256"] = hashlib.sha256(
        paths["rollback"].read_bytes()
    ).hexdigest()
    errors = evidence.validate_manifest_artifacts(tmp_path, manifest)
    assert errors and "not bound to the same staging deployment" in errors[0]


def test_true_booleans_cannot_hide_route_or_restore_failures(tmp_path: Path):
    _, binding, paths = _bundle(tmp_path)
    route = json.loads(paths["route"].read_text(encoding="utf-8"))
    route["payload"]["reachable_retired_dependency_count"] = 1
    route["payload"]["retired_dependency_findings"] = [
        {"relation": "master.org_users", "reachable_modules": ["app.api.routes.users"]}
    ]
    _write(paths["route"], route)

    with pytest.raises(evidence.EvidenceError, match="reachable retired dependency"):
        evidence.assemble_manifest(
            root=tmp_path, binding=binding,
            source_path=paths["source"], route_path=paths["route"],
            database_path=paths["database"], reconciliation_path=paths["reconciliation"],
            live18_path=paths["live18"],
            rollback_path=paths["rollback"], decommission_path=paths["decommission"],
            reviewer="reviewer", reviewed_at="2026-08-25T12:30:00+00:00",
        )


def test_draft_operator_inputs_fail_closed(tmp_path: Path):
    git_commit = "a" * 40
    binding = _binding(git_commit)
    draft = _write(tmp_path / "draft.json", {
        "state": "draft", "reviewer": None, "reviewed_at": None, "steps": [],
    })
    with pytest.raises(evidence.EvidenceError, match="has not been reviewed"):
        evidence.wrap_reviewed_input(
            kind="rollback_plan", input_path=draft, binding=binding
        )


def test_reset_only_rollback_and_duration_decommission_inputs_are_reviewable(
    tmp_path: Path,
):
    binding = _binding("a" * 40)
    rollback = _rollback_payload()
    rollback.update({
        "reviewer": "release-reviewer",
        "reviewed_at": "2026-08-26T10:00:00+00:00",
    })
    rollback_path = _write(tmp_path / "rollback.json", rollback)
    wrapped_rollback = evidence.wrap_reviewed_input(
        kind="rollback_plan", input_path=rollback_path, binding=binding
    )
    assert wrapped_rollback["payload"]["retained_backup_required"] is False

    decommission = _decommission_payload()
    decommission.update({
        "reviewer": "release-reviewer",
        "reviewed_at": "2026-08-26T10:00:00+00:00",
    })
    decommission_path = _write(tmp_path / "decommission.json", decommission)
    wrapped_decommission = evidence.wrap_reviewed_input(
        kind="retired_project_decommission_plan",
        input_path=decommission_path,
        binding=binding,
    )
    assert wrapped_decommission["payload"]["rollback_window_duration_hours"] == 168
    assert "rollback_window_ends_at" not in wrapped_decommission["payload"]


def test_reset_only_rollback_rejects_retained_backup_and_incomplete_procedure(
    tmp_path: Path,
):
    binding = _binding("a" * 40)
    value = _rollback_payload()
    value.update({
        "reviewer": "release-reviewer",
        "reviewed_at": "2026-08-26T10:00:00+00:00",
        "retained_backup_required": True,
    })
    path = _write(tmp_path / "rollback.json", value)
    with pytest.raises(evidence.EvidenceError, match="no retained backup"):
        evidence.wrap_reviewed_input(
            kind="rollback_plan", input_path=path, binding=binding
        )

    value["retained_backup_required"] = False
    value["steps"] = value["steps"][:-1]
    _write(path, value)
    with pytest.raises(evidence.EvidenceError, match="exactly the required ordered"):
        evidence.wrap_reviewed_input(
            kind="rollback_plan", input_path=path, binding=binding
        )


def test_decommission_plan_rejects_precomputed_deadline_and_fake_backup(
    tmp_path: Path,
):
    binding = _binding("a" * 40)
    value = _decommission_payload()
    value.update({
        "reviewer": "release-reviewer",
        "reviewed_at": "2026-08-26T10:00:00+00:00",
        "rollback_window_ends_at": "2026-09-02T10:00:00+00:00",
    })
    path = _write(tmp_path / "decommission.json", value)
    with pytest.raises(evidence.EvidenceError, match="must not precompute"):
        evidence.wrap_reviewed_input(
            kind="retired_project_decommission_plan",
            input_path=path,
            binding=binding,
        )

    del value["rollback_window_ends_at"]
    value["final_backup_required"] = True
    _write(path, value)
    with pytest.raises(evidence.EvidenceError, match="pause-duration contract"):
        evidence.wrap_reviewed_input(
            kind="retired_project_decommission_plan",
            input_path=path,
            binding=binding,
        )


def test_pause_receipt_derives_absolute_deadline_from_actual_pause(tmp_path: Path):
    binding = _binding("a" * 40)
    value = _decommission_payload()
    value.update({
        "reviewer": "release-reviewer",
        "reviewed_at": "2026-08-26T10:00:00+00:00",
    })
    path = _write(tmp_path / "decommission.json", value)
    reviewed_plan = evidence.wrap_reviewed_input(
        kind="retired_project_decommission_plan",
        input_path=path,
        binding=binding,
    )
    receipt = evidence.build_retired_project_pause_receipt(
        reviewed_plan=reviewed_plan,
        paused_at="2026-08-26T18:30:00+05:30",
        pause_execution_reference="provider-operation-123",
        pause_evidence_sha256="d" * 64,
    )
    assert receipt["payload"]["paused_at"] == "2026-08-26T13:00:00+00:00"
    assert receipt["payload"]["rollback_window_ends_at"] == (
        "2026-09-02T13:00:00+00:00"
    )
    assert receipt["payload"]["deletion_permitted"] is False
    assert receipt["payload"]["irreversible_action_approval_recorded"] is False

    with pytest.raises(evidence.EvidenceError, match="pause evidence SHA-256"):
        evidence.build_retired_project_pause_receipt(
            reviewed_plan=reviewed_plan,
            paused_at="2026-08-26T18:30:00+05:30",
            pause_execution_reference="provider-operation-123",
            pause_evidence_sha256="not-a-hash",
        )

def test_workflow_is_read_only_and_never_changes_readiness():
    workflow = (
        REPOSITORY_ROOT / ".github/workflows/canonical-application-promotion-evidence.yml"
    ).read_text(encoding="utf-8")
    assert "test \"$CANONICAL_STAGING_PROJECT_REF\" = rgihahbmkrmhitjdjvev" in workflow
    assert "test \"$CANONICAL_STAGING_PROJECT_REF\" != jfrairkkzxwkhbtqejnz" in workflow
    assert "deployment_workflow_run_id" in workflow
    assert "railway-canonical-staging / deploy" in workflow
    assert "canonical-free-staging / baseline" in workflow
    assert 'test "$((railway_success + render_success))" = 1' in workflow
    assert 'deployment_name="railway-canonical-staging-$REVIEWED_SHA"' in workflow
    assert "reconcile-railway-deployment" in workflow
    assert "deployment-maintenance.json" in workflow
    assert '--workflow-run-id "$DEPLOYMENT_WORKFLOW_RUN_ID"' in workflow
    assert '--workflow-run-attempt "$run_attempt"' in workflow
    assert '--live18-artifact-id "$live18_id"' in workflow
    assert '--live18-artifact-digest "$live18_digest"' in workflow
    assert (
        'deployment_name="canonical-staging-baseline-$DEPLOYMENT_WORKFLOW_RUN_ID"'
        in workflow
    )
    assert "render-pilot-evidence.json" in workflow
    assert '"live18-acceptance" and .conclusion == "success"' in workflow
    assert "canonical-live18-acceptance-evidence" in workflow
    assert "capture-live18" in workflow
    assert "verify_render_pilot_sha.py" not in workflow
    assert "load_direct_database_contract" in workflow
    assert "build_direct_dsn" in workflow
    assert "verify_direct_database" in workflow
    assert "/config/database/pooler" not in workflow
    assert "pooler.supabase.com" not in workflow
    assert "postgres.${CANONICAL_STAGING_PROJECT_REF}" not in workflow
    assert "postgres:15" in workflow
    assert "database/canonical/ci/bootstrap_supabase_auth.sql" in workflow
    assert "pg_dump --data-only --no-owner --no-privileges" in workflow
    assert "validate-manifest" in workflow
    assert "workflow_call:" in workflow
    readiness = (
        REPOSITORY_ROOT / ".github/workflows/production-readiness.yml"
    ).read_text(encoding="utf-8")
    assert "capture_canonical_promotion_evidence:" in readiness
    assert "uses: ./.github/workflows/canonical-application-promotion-evidence.yml" in readiness
    assert "permissions:\n  contents: read\n  actions: read" in readiness
    assert "approved_app_contract_v1" not in workflow
    assert "production_ready" not in workflow
    assert "deploy_render" not in workflow


def test_canonical_staging_emits_exact_render_deployment_evidence() -> None:
    workflow = (
        REPOSITORY_ROOT / ".github/workflows/canonical-staging.yml"
    ).read_text(encoding="utf-8")
    polling = workflow.index('case "$deploy_status" in')
    evidence_output = workflow.index(
        "> staging-evidence/render-pilot-evidence.json"
    )
    artifact_upload = workflow.index(
        "name: canonical-staging-baseline-${{ github.run_id }}"
    )

    assert polling < evidence_output < artifact_upload
    assert 'test "$deploy_sha" = "$GITHUB_SHA"' in workflow
    assert "verify_render_pilot_sha.py" in workflow
    assert "verify_live18_deployment_sha.py" in workflow
    assert '.value.deploy_id == $provision.deployed[.key].id' in workflow
    assert 'deployed_sha=$(jq -er' in workflow
    assert 'if [ "$deployed_sha" != "$deploy_sha" ]; then' in workflow
    assert "render-pilot-public-evidence.json" in workflow
    receipt = workflow.index("- name: Publish exact-run Render demo receipt")
    assert workflow.index(
        "- name: Provision and exercise the disposable demo organization"
    ) < receipt < artifact_upload
    receipt_step = workflow[receipt:artifact_upload]
    assert "build_live18_render_demo_receipt.py" in receipt_step
    assert "inputs.provision_demo_data == true" in receipt_step
    assert "inputs.deploy_render_pilot == true" in receipt_step
    assert '--deployed-sha "$CANONICAL_RENDER_DEPLOY_SHA"' in receipt_step
    assert '--commit-sha "$GITHUB_SHA"' in receipt_step
    assert "live18-render-demo-receipt.json" in receipt_step


def test_current_mounted_callable_graph_has_no_reachable_retired_relation():
    graph = evidence._runtime_callable_route_graph()
    contract = json.loads(
        (REPOSITORY_ROOT / "docs/architecture/app-data-contract.json").read_text(
            encoding="utf-8"
        )
    )
    retired = {
        relation
        for relation, disposition in contract["legacy_relation_map"].items()
        if disposition["action"] != "retain"
    }

    assert len(graph["routes"]) > 100
    assert "sales.invoices" in graph["relations"]
    assert set(graph["relations"]).isdisjoint(retired)
    # This dead helper remains archaeology but is not called by any mounted
    # endpoint or dependency; the test guards that exact reachability boundary.
    assert "master.org_users" not in graph["relations"]

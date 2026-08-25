from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from scripts.audit import application_promotion_evidence as evidence


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


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


def _live18_manifest(git_commit: str, binding: dict) -> dict:
    matrix = json.loads(evidence.LIVE18_MATRIX_PATH.read_text(encoding="utf-8"))
    browser = []
    resources = {}
    for index, operation in enumerate(matrix["operations"], 1):
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
                    "status": 200, "request_id": f"prepare-{index}",
                },
                {
                    "actor": (
                        "reviewer"
                        if operation["approval_policy"] == "separate_approver"
                        else "requester"
                    ),
                    "method": "POST",
                    "path": f"/api/web/actions/commands/{command_id}/approve",
                    "status": 200, "request_id": f"approve-{index}",
                },
                {
                    "actor": "requester", "method": "POST",
                    "path": f"/api/web/actions/commands/{command_id}/execute",
                    "status": 200, "request_id": f"execute-{index}",
                },
            ],
            "raw_evidence_sha256": f"{index:064x}",
        })
        resources[operation["id"]] = {
            "command_operation": operation["command_operation"],
            "command_request_id": command_id,
            "resource_id": resource_id,
            "cross_tenant_denied": True,
            "database_sha256": f"{index + 100:064x}",
        }
    return {
        "schema": "aasopharma.live18.upload-manifest.v1",
        "run": {"id": "123", "attempt": "1", "browser_outcome": "success"},
        "deployment": {
            "provider": binding["deployment_provider"],
            "commit_sha": git_commit,
            "origins": {
                name: row["url"] for name, row in binding["deployment_services"].items()
            },
            # This hashes the Live18 public-deployment attestation. The binding
            # separately hashes the provider's immutable deployment artifact.
            "raw_evidence_sha256": "e" * 64,
        },
        "browser": browser,
        "database": {
            "organization_id": "30000000-0000-4000-8000-000000000003",
            "denial_organization_id": "30000000-0000-4000-8000-000000000005",
            "runtime_role": {
                "current_user": "erp_runtime", "superuser": False,
                "bypassrls": False, "migration_owner_member": False,
                "network_family": 6,
                "transport": "supabase_direct_ipv6_from_railway",
            },
            "resources": resources,
            "raw_evidence_sha256": "b" * 64,
        },
        "demo": {
            "action": "provision-demo", "content_sha256": "c" * 64,
            "raw_evidence_sha256": "d" * 64,
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
            "rollback_plan", binding, {
                "state": "reviewed", "owner": "release-owner",
                "trigger_conditions": ["readiness probe fails"],
                "verification_queries": ["SELECT version_num FROM public.alembic_version"],
                "max_recovery_minutes": 30, "steps": ["restore"],
            },
        )),
        "decommission": _write(tmp_path / "evidence/decommission.json", _artifact(
            "retired_project_decommission_plan", binding, {
                "state": "reviewed",
                "retired_project_ref": evidence.RETIRED_SOURCE_PROJECT_REF,
                "owner": "data-owner", "prerequisites": ["rollback window elapsed"],
                "final_backup_required": True,
                "rollback_window_ends_at": "2026-09-25T12:00:00+00:00",
                "retention_approval_reference": "RETENTION-123",
                "steps": ["decommission after rollback window"],
            },
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
    assert artifact["payload"]["operation_count"] == 18

    replay_diagnostic = json.loads(json.dumps(manifest))
    next(
        row for row in replay_diagnostic["browser"]
        if row["operation_id"] == "sales_invoice"
    )["http"].append({
        "actor": "requester", "method": "POST",
        "path": "/api/web/actions/commands/10000000-0000-4000-8000-000000000001/execute",
        "status": 409, "request_id": "stale-replay-diagnostic",
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
    sales_invoice["http"].append({**execute, "request_id": "duplicate-ui-execute"})
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
        "status": 422, "request_id": "invalid-form-rejected",
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
        "status": 200, "request_id": "invalid-form-prepared",
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
        "status": 422, "request_id": "invented-missing-required",
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
    with pytest.raises(evidence.EvidenceError, match="exactly 18"):
        evidence.capture_live18_acceptance(
            manifest=missing, binding=binding,
            workflow_run_id=123, workflow_run_attempt=1, artifact_id=456,
            artifact_sha256="f" * 64,
            artifact_digest="sha256:" + "8" * 64,
        )
    bypass = json.loads(json.dumps(manifest))
    bypass["database"]["runtime_role"]["bypassrls"] = True
    with pytest.raises(evidence.EvidenceError, match="isolated Railway runtime role"):
        evidence.capture_live18_acceptance(
            manifest=bypass, binding=binding,
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


def test_reset_attestation_binds_exact_run_and_rejects_wrong_project():
    attestation = evidence.build_reset_attestation(
        project_ref=evidence.CANONICAL_STAGING_PROJECT_REF,
        git_commit="a" * 40,
        reviewed_deploy_sha="b" * 40,
        workflow_repository="acme/erp",
        workflow_run_id=123,
        workflow_run_attempt=2,
        reset_completed_at="2026-08-25T11:00:00+00:00",
    )
    assert attestation["payload"]["workflow_run_url"] == (
        "https://github.com/acme/erp/actions/runs/123"
    )
    assert attestation["payload"]["auth_schema_preserved"] is True
    assert attestation["payload"]["canonical_schema_count_after_reset"] == 0
    with pytest.raises(evidence.EvidenceError, match="restricted to canonical staging"):
        evidence.build_reset_attestation(
            project_ref=evidence.RETIRED_SOURCE_PROJECT_REF,
            git_commit="a" * 40,
            reviewed_deploy_sha="b" * 40,
            workflow_repository="acme/erp",
            workflow_run_id=123,
            workflow_run_attempt=2,
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


def test_workflow_is_read_only_and_never_changes_readiness():
    workflow = (
        REPOSITORY_ROOT / ".github/workflows/canonical-application-promotion-evidence.yml"
    ).read_text(encoding="utf-8")
    assert "test \"$CANONICAL_STAGING_PROJECT_REF\" = rgihahbmkrmhitjdjvev" in workflow
    assert "test \"$CANONICAL_STAGING_PROJECT_REF\" != jfrairkkzxwkhbtqejnz" in workflow
    assert "deployment_workflow_run_id" in workflow
    assert "railway-canonical-staging / deploy" in workflow
    assert '"live18-acceptance" and .conclusion == "success"' in workflow
    assert "canonical-live18-acceptance-evidence" in workflow
    assert "capture-live18" in workflow
    assert "verify_render_pilot_sha.py" not in workflow
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

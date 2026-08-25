import hashlib
import json
from pathlib import Path

import pytest

from scripts.audit import application_promotion_evidence as evidence


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def _render(git_commit: str) -> dict:
    return {
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
    binding = evidence.build_binding(
        project_ref=evidence.CANONICAL_STAGING_PROJECT_REF,
        git_commit=git_commit,
        render_evidence=_render(git_commit),
    )
    paths = {
        "source": _write(tmp_path / "evidence/source.json", _artifact(
            "source_disposition", binding, {
                "state": "reviewed",
                "strategy": "reset",
                "source_identifier": evidence.CANONICAL_STAGING_PROJECT_REF,
                "retired_source_accessed": False,
                "disposable_staging_reset_verified": True,
                "reset_workflow_run_url": "https://github.com/acme/erp/actions/runs/123",
                "reset_artifact_sha256": "d" * 64,
                "reset_completed_at": "2026-08-25T11:00:00+00:00",
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
                "snapshot": {"relation_counts": {"sales.invoices": 1}, "exact_numeric_sums": {"sales.invoices.grand_total": "100.00"}},
            },
        )),
        "reconciliation": _write(tmp_path / "evidence/reconciliation.json", _artifact(
            "reconciliation_backup_restore", binding, {
                "source_target_counts_reconciled": True,
                "exact_totals_reconciled": True,
                "backup_verified": True,
                "restore_tested": True,
                "backup_sha256": "b" * 64,
                "backup_size_bytes": 100,
            },
        )),
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
            render_evidence=_render(git_commit),
        )
    stale = _render(git_commit)
    stale["services"]["aasopharma-api-pilot"]["commit_sha"] = "b" * 40
    with pytest.raises(evidence.EvidenceError, match="not live on the reviewed commit"):
        evidence.build_binding(
            project_ref=evidence.CANONICAL_STAGING_PROJECT_REF,
            git_commit=git_commit,
            render_evidence=stale,
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
            rollback_path=paths["rollback"], decommission_path=paths["decommission"],
            reviewer="reviewer", reviewed_at="2026-08-25T12:30:00+00:00",
        )


def test_draft_operator_inputs_fail_closed(tmp_path: Path):
    git_commit = "a" * 40
    binding = evidence.build_binding(
        project_ref=evidence.CANONICAL_STAGING_PROJECT_REF,
        git_commit=git_commit,
        render_evidence=_render(git_commit),
    )
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
    assert "verify_render_pilot_sha.py" in workflow
    assert "postgres:15" in workflow
    assert "database/canonical/ci/bootstrap_supabase_auth.sql" in workflow
    assert "pg_dump --data-only --no-owner --no-privileges" in workflow
    assert "validate-manifest" in workflow
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

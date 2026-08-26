from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path

import pytest

from scripts.build_live18_artifact_manifest import (
    ArtifactManifestError,
    _http_summary,
    build_manifest,
)
from scripts.build_live18_reconciliation_attestation import build_attestation
from scripts.build_live18_render_demo_receipt import build_receipt


SHA = "a" * 40
ORG = "d3000000-0000-7000-8000-000000000001"
BRANCH = "d3000000-0000-7000-8000-000000000005"
REQUESTER = "d3000000-0000-7000-8000-000000000021"
REVIEWER = "d3000000-0000-7000-8000-000000000003"
COMMAND = "018f0000-0000-7000-8000-000000000001"
RESOURCE = "018f0000-0000-7000-8000-000000000002"
PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII="
)
MATRIX_PATH = Path("backend/tests/live_acceptance/operation_matrix.json")


def _write(path: Path, value: object) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")
    return path


def _screenshots(root: Path, operation_id: str) -> tuple[list[dict[str, object]], Path]:
    directory = root / "screenshots"
    directory.mkdir(mode=0o700, exist_ok=True)
    rows: list[dict[str, object]] = []
    for stage in ("missing-required", "posted"):
        filename = f"{operation_id}-{stage}.png"
        screenshot = directory / filename
        screenshot.write_bytes(PNG_1X1)
        screenshot.chmod(0o600)
        rows.append({
            "stage": stage,
            "filename": filename,
            "sha256": hashlib.sha256(PNG_1X1).hexdigest(),
            "byte_size": len(PNG_1X1),
            "width": 1,
            "height": 1,
        })
    return rows, directory


def _matrix_operations() -> list[dict[str, str]]:
    value = json.loads(MATRIX_PATH.read_text(encoding="utf-8"))
    return value["operations"]


def _http_evidence(operation_id: str) -> list[dict[str, object]]:
    if operation_id != "expense_claim":
        return []
    return [{
        "actor": "requester",
        "method": "POST",
        "path": "/api/web/evidence/expense-receipts",
        "status": 200,
        "requestId": "render-expense-receipt-upload",
    }]


def _write_minimal_browser_set(directory: Path) -> None:
    for operation in _matrix_operations():
        _write(directory / f"{operation['id']}.json", {
            "evidence_schema": "aasopharma.live18.browser.v1",
            "tested_sha": SHA,
            "operation_id": operation["id"],
            "command_operation": operation["command_operation"],
            "http_evidence": _http_evidence(operation["id"]),
        })


def _matrix_database_resources() -> dict[str, object]:
    return {
        operation["id"]: {
            "command_operation": operation["command_operation"],
            "command_request_id": COMMAND,
            "resource_id": RESOURCE,
            "cross_tenant_denied": True,
            "database": {"row_count": 1},
        }
        for operation in _matrix_operations()
    }


def _signed_database(*, provider: str, resources: dict[str, object]) -> dict[str, object]:
    value: dict[str, object] = {
        "schema": (
            "aasopharma.live18.railway-database-response.v1"
            if provider == "railway"
            else "aasopharma.live18.database-evidence.v1"
        ),
        "action": "capture-evidence",
        "expected_sha": SHA,
        "project_ref": "rgihahbmkrmhitjdjvev",
        "organization_id": ORG,
        "denial_organization_id": "d3000000-0000-7000-8000-00000000002c",
        "runtime_role": {
            "current_user": "erp_runtime",
            "superuser": False,
            "bypassrls": False,
            "migration_owner_member": False,
            **({"row_security": True} if provider == "render" else {}),
            "network_family": 6,
            "transport": (
                "supabase_direct_ipv6_from_railway"
                if provider == "railway"
                else "supabase_session_pooler_from_github_actions"
            ),
        },
        "resources": resources,
    }
    unsigned = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    value["content_sha256"] = hashlib.sha256(unsigned).hexdigest()
    return value


def _render_demo_receipt(tmp_path: Path, *, run_id: str, run_attempt: str) -> Path:
    summary = _write(tmp_path / "canonical-demo-summary.json", {
        "project_ref": "rgihahbmkrmhitjdjvev",
        "organization_id": ORG,
        "rls_denial_organization_id": "d3000000-0000-7000-8000-00000000002c",
        "organization_classification": "disposable_synthetic_demo",
    })
    return _write(
        tmp_path / "render-demo-receipt.json",
        build_receipt(
            summary_path=summary,
            project_ref="rgihahbmkrmhitjdjvev",
            commit_sha=SHA,
            deployed_sha=SHA,
            run_id=run_id,
            run_attempt=run_attempt,
        ),
    )


def _railway_demo_receipt(*, run_id: str, run_attempt: str) -> dict[str, object]:
    value: dict[str, object] = {
        "schema": "aasopharma.live18.railway-database-response.v1",
        "action": "provision-demo",
        "expected_sha": SHA,
        "project_ref": "rgihahbmkrmhitjdjvev",
        "run_id": run_id,
        "run_attempt": run_attempt,
    }
    value["content_sha256"] = hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return value


def test_manifest_omits_credentials_and_raw_request_response_bodies(tmp_path: Path) -> None:
    deployed = _write(tmp_path / "deployed.json", {
        "schema": "aasopharma.live18.deployment-evidence.v1",
        "provider": "railway",
        "commit_sha": SHA,
        "services": {
            name: {"origin": f"https://{name}.example"}
            for name in ("api", "frontend", "mcp")
        },
    })
    evidence_dir = tmp_path / "evidence"
    screenshots, screenshot_dir = _screenshots(tmp_path, "sales_invoice")
    _write(evidence_dir / "sales_invoice.json", {
        "evidence_schema": "aasopharma.live18.browser.v1",
        "tested_sha": SHA,
        "operation_id": "sales_invoice",
        "command_operation": "sales.invoice.prepare",
        "command_request_id": COMMAND,
        "resource_id": RESOURCE,
        "preview_hash": "sha256:" + "b" * 64,
        "requester_user_id": REQUESTER,
        "reviewer_user_id": REVIEWER,
        "organization_id": ORG,
        "branch_id": BRANCH,
        "cleanup_id": None,
        "self_approval_probe": {"status": 403, "body": {"password": "must-not-upload"}},
        "missing_required_http_evidence": [],
        "screenshots": screenshots,
        "http_evidence": [{
            "actor": "requester", "method": "POST", "path": "/api/web/actions/sales.invoice.prepare/prepare?email=must-not-upload%40example.com",
            "status": 200,
            "requestId": "Bearer must-not-upload\r\npostgresql://user:password@example/db",
            "requestBody": {"authorization": "Bearer must-not-upload"},
            "responseBody": {"access_token": "must-not-upload"},
        }],
        "rest_readback": {"customer_email": "must-not-upload@example.com"},
    })
    database = _write(
        tmp_path / "database.json",
        _signed_database(provider="railway", resources={
            "sales_invoice": {
                "command_operation": "sales.invoice.prepare",
                "command_request_id": COMMAND,
                "resource_id": RESOURCE,
                "cross_tenant_denied": True,
                "database": {"customer_email": "must-not-upload@example.com"},
            },
        }),
    )
    demo_value = _railway_demo_receipt(run_id="123", run_attempt="2")
    demo_value["demo_summary"] = {"password": "must-not-upload"}
    demo_value["content_sha256"] = hashlib.sha256(
        json.dumps(
            {key: value for key, value in demo_value.items() if key != "content_sha256"},
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()
    demo = _write(tmp_path / "demo.json", demo_value)

    manifest = build_manifest(
        deployed_sha=deployed,
        evidence_dir=evidence_dir,
        database_evidence=database,
        demo_evidence=demo,
        browser_outcome="failure",
        run_id="123",
        run_attempt="2",
        screenshot_dir=screenshot_dir,
    )

    serialized = json.dumps(manifest)
    assert "must-not-upload" not in serialized
    assert "requestBody" not in serialized
    assert "responseBody" not in serialized
    assert "rest_readback" not in serialized
    assert "customer_email" not in serialized
    assert "demo_summary" not in serialized
    assert manifest["browser"][0]["http"] == [{
        "actor": "requester",
        "method": "POST",
        "path": "/api/web/actions/sales.invoice.prepare/prepare",
        "status": 200,
        "request_id": hashlib.sha256(
            b"Bearer must-not-upload\r\npostgresql://user:password@example/db"
        ).hexdigest(),
    }]
    assert manifest["browser"][0]["screenshots"] == screenshots


def test_success_requires_exactly_18_operations_and_36_reviewed_pngs(
    tmp_path: Path,
) -> None:
    deployed = _write(tmp_path / "deployed.json", {
        "schema": "aasopharma.live18.deployment-evidence.v1",
        "provider": "render",
        "commit_sha": SHA,
        "services": {
            name: {"origin": f"https://{name}.example"}
            for name in ("api", "frontend", "mcp")
        },
    })
    evidence_dir = tmp_path / "evidence"
    screenshot_dir = tmp_path / "screenshots"
    for operation in _matrix_operations():
        operation_id = operation["id"]
        screenshots, screenshot_dir = _screenshots(tmp_path, operation_id)
        _write(evidence_dir / f"{operation_id}.json", {
            "evidence_schema": "aasopharma.live18.browser.v1",
            "tested_sha": SHA,
            "operation_id": operation_id,
            "command_operation": operation["command_operation"],
            "command_request_id": COMMAND,
            "resource_id": RESOURCE,
            "preview_hash": "sha256:" + "b" * 64,
            "requester_user_id": REQUESTER,
            "reviewer_user_id": REVIEWER,
            "organization_id": ORG,
            "branch_id": BRANCH,
            "cleanup_id": None,
            "self_approval_probe": None,
            "missing_required_http_evidence": [],
            "http_evidence": _http_evidence(operation_id),
            "screenshots": screenshots,
        })

    database = _write(
        tmp_path / "database.json",
        _signed_database(provider="render", resources=_matrix_database_resources()),
    )
    demo = _render_demo_receipt(tmp_path, run_id="123", run_attempt="1")
    attestation = _write(
        tmp_path / "reconciliation.json",
        build_attestation(
            deployed_sha=deployed,
            evidence_dir=evidence_dir,
            operation_matrix=MATRIX_PATH,
            database_evidence=database,
            provider="render",
            run_id="123",
            run_attempt="1",
        ),
    )
    manifest = build_manifest(
        deployed_sha=deployed,
        evidence_dir=evidence_dir,
        database_evidence=database,
        demo_evidence=demo,
        browser_outcome="success",
        run_id="123",
        run_attempt="1",
        screenshot_dir=screenshot_dir,
        reconciliation_evidence=attestation,
        operation_matrix=MATRIX_PATH,
    )

    assert len(manifest["browser"]) == 18
    assert sum(len(row["screenshots"]) for row in manifest["browser"]) == 36
    assert len(manifest["reconciliation"]["operation_set_sha256"]) == 64

    (screenshot_dir / "unreviewed.png").write_bytes(PNG_1X1)
    (screenshot_dir / "unreviewed.png").chmod(0o600)
    with pytest.raises(ArtifactManifestError, match="exactly 36"):
        build_manifest(
            deployed_sha=deployed,
            evidence_dir=evidence_dir,
            database_evidence=database,
            demo_evidence=demo,
            browser_outcome="success",
            run_id="123",
            run_attempt="1",
            screenshot_dir=screenshot_dir,
            reconciliation_evidence=attestation,
            operation_matrix=MATRIX_PATH,
        )


@pytest.mark.parametrize("request_id", ["", "é" * 129, 123])
def test_http_summary_rejects_invalid_or_oversized_request_ids(request_id: object) -> None:
    with pytest.raises(ArtifactManifestError, match="request ID"):
        _http_summary({
            "actor": "requester",
            "method": "GET",
            "path": "/api/invoices",
            "status": 200,
            "requestId": request_id,
        })


def test_render_demo_receipt_rejects_deployment_drift(tmp_path: Path) -> None:
    summary = _write(tmp_path / "canonical-demo-summary.json", {
        "project_ref": "rgihahbmkrmhitjdjvev",
        "organization_id": ORG,
        "rls_denial_organization_id": "d3000000-0000-7000-8000-00000000002c",
        "organization_classification": "disposable_synthetic_demo",
    })
    with pytest.raises(ArtifactManifestError, match="exact-run Render evidence"):
        build_receipt(
            summary_path=summary,
            project_ref="rgihahbmkrmhitjdjvev",
            commit_sha=SHA,
            deployed_sha="b" * 40,
            run_id="123",
            run_attempt="1",
        )


def test_success_rejects_reconciliation_from_another_run(tmp_path: Path) -> None:
    deployed = _write(tmp_path / "deployed.json", {
        "schema": "aasopharma.live18.deployment-evidence.v1",
        "provider": "render",
        "commit_sha": SHA,
        "services": {
            name: {"origin": f"https://{name}.example"}
            for name in ("api", "frontend", "mcp")
        },
    })
    evidence_dir = tmp_path / "evidence"
    screenshot_dir = tmp_path / "screenshots"
    for operation in _matrix_operations():
        operation_id = operation["id"]
        screenshots, screenshot_dir = _screenshots(tmp_path, operation_id)
        _write(evidence_dir / f"{operation_id}.json", {
            "evidence_schema": "aasopharma.live18.browser.v1",
            "tested_sha": SHA,
            "operation_id": operation_id,
            "command_operation": operation["command_operation"],
            "command_request_id": COMMAND,
            "resource_id": RESOURCE,
            "preview_hash": "sha256:" + "b" * 64,
            "requester_user_id": REQUESTER,
            "reviewer_user_id": REVIEWER,
            "organization_id": ORG,
            "branch_id": BRANCH,
            "cleanup_id": None,
            "self_approval_probe": None,
            "missing_required_http_evidence": [],
            "http_evidence": _http_evidence(operation_id),
            "screenshots": screenshots,
        })
    database = _write(
        tmp_path / "database.json",
        _signed_database(provider="render", resources=_matrix_database_resources()),
    )
    value = build_attestation(
        deployed_sha=deployed,
        evidence_dir=evidence_dir,
        operation_matrix=MATRIX_PATH,
        database_evidence=database,
        provider="render",
        run_id="other-run",
        run_attempt="1",
    )
    attestation = _write(tmp_path / "reconciliation.json", value)

    with pytest.raises(ArtifactManifestError, match="exact Live18 run"):
        build_manifest(
            deployed_sha=deployed,
            evidence_dir=evidence_dir,
            database_evidence=database,
            demo_evidence=None,
            browser_outcome="success",
            run_id="123",
            run_attempt="1",
            screenshot_dir=screenshot_dir,
            reconciliation_evidence=attestation,
            operation_matrix=MATRIX_PATH,
        )


def test_railway_attestation_requires_and_binds_database_evidence(
    tmp_path: Path,
) -> None:
    deployed = _write(tmp_path / "deployed.json", {
        "schema": "aasopharma.live18.deployment-evidence.v1",
        "provider": "railway",
        "commit_sha": SHA,
    })
    evidence_dir = tmp_path / "evidence"
    _write_minimal_browser_set(evidence_dir)
    with pytest.raises(ArtifactManifestError, match="database evidence"):
        build_attestation(
            deployed_sha=deployed,
            evidence_dir=evidence_dir,
            operation_matrix=MATRIX_PATH,
            database_evidence=None,
            provider="railway",
            run_id="123",
            run_attempt="1",
        )

    database = _write(tmp_path / "database.json", {"action": "capture-evidence"})
    attestation = build_attestation(
        deployed_sha=deployed,
        evidence_dir=evidence_dir,
        operation_matrix=MATRIX_PATH,
        database_evidence=database,
        provider="railway",
        run_id="123",
        run_attempt="1",
    )

    assert attestation["database_mode"] == "captured_railway"
    assert attestation["database_evidence_sha256"] == hashlib.sha256(
        database.read_bytes()
    ).hexdigest()


def test_attestation_rejects_operation_matrix_drift(tmp_path: Path) -> None:
    deployed = _write(tmp_path / "deployed.json", {
        "schema": "aasopharma.live18.deployment-evidence.v1",
        "provider": "render",
        "commit_sha": SHA,
    })
    evidence_dir = tmp_path / "evidence"
    _write_minimal_browser_set(evidence_dir)
    drifted = json.loads((evidence_dir / "sales_invoice.json").read_text())
    drifted["command_operation"] = "sales.order.prepare"
    _write(evidence_dir / "sales_invoice.json", drifted)

    with pytest.raises(ArtifactManifestError, match="sales_invoice"):
        build_attestation(
            deployed_sha=deployed,
            evidence_dir=evidence_dir,
            operation_matrix=MATRIX_PATH,
            database_evidence=None,
            provider="render",
            run_id="123",
            run_attempt="1",
        )


def test_manifest_treats_empty_optional_demo_evidence_as_absent(tmp_path: Path) -> None:
    deployed = _write(tmp_path / "deployed.json", {
        "schema": "aasopharma.live18.deployment-evidence.v1",
        "provider": "railway",
        "commit_sha": SHA,
        "services": {
            name: {"origin": f"https://{name}.example"}
            for name in ("api", "frontend", "mcp")
        },
    })
    demo = tmp_path / "demo.json"
    demo.touch()

    manifest = build_manifest(
        deployed_sha=deployed,
        evidence_dir=tmp_path / "missing-evidence",
        database_evidence=None,
        demo_evidence=demo,
        browser_outcome="skipped",
        run_id="123",
        run_attempt="1",
    )

    assert manifest["demo"] is None


def test_manifest_treats_empty_optional_database_evidence_as_absent(tmp_path: Path) -> None:
    deployed = _write(tmp_path / "deployed.json", {
        "schema": "aasopharma.live18.deployment-evidence.v1",
        "provider": "railway",
        "commit_sha": SHA,
        "services": {
            name: {"origin": f"https://{name}.example"}
            for name in ("api", "frontend", "mcp")
        },
    })
    database = tmp_path / "database.json"
    database.touch()

    manifest = build_manifest(
        deployed_sha=deployed,
        evidence_dir=tmp_path / "missing-evidence",
        database_evidence=database,
        demo_evidence=None,
        browser_outcome="skipped",
        run_id="123",
        run_attempt="1",
    )

    assert manifest["database"] is None


def test_manifest_scrubs_operation_specific_browser_failure_evidence(tmp_path: Path) -> None:
    deployed = _write(tmp_path / "deployed.json", {
        "schema": "aasopharma.live18.deployment-evidence.v1",
        "provider": "railway",
        "commit_sha": SHA,
        "services": {
            name: {"origin": f"https://{name}.example"}
            for name in ("api", "frontend", "mcp")
        },
    })
    evidence_dir = tmp_path / "evidence"
    _write(evidence_dir / "sales_invoice.failure.json", {
        "evidence_schema": "aasopharma.live18.browser-failure.v1",
        "tested_sha": SHA,
        "operation_id": "sales_invoice",
        "stage": "prepare_steps",
        "step_index": 4,
        "actor": "requester",
        "action": "fill",
        "locator_kind": "label",
        "error_kind": "TimeoutError",
        "message": "password=must-not-upload",
    })

    manifest = build_manifest(
        deployed_sha=deployed,
        evidence_dir=evidence_dir,
        database_evidence=None,
        demo_evidence=None,
        browser_outcome="failure",
        run_id="123",
        run_attempt="1",
    )

    assert manifest["browser"] == []
    assert manifest["browser_failures"] == [{
        "operation_id": "sales_invoice",
        "tested_sha": SHA,
        "stage": "prepare_steps",
        "step_index": 4,
        "actor": "requester",
        "action": "fill",
        "locator_kind": "label",
        "error_kind": "TimeoutError",
        "raw_evidence_sha256": manifest["browser_failures"][0]["raw_evidence_sha256"],
    }]
    assert len(manifest["browser_failures"][0]["raw_evidence_sha256"]) == 64
    assert "must-not-upload" not in json.dumps(manifest)


def test_manifest_rejects_failure_evidence_with_successful_browser_outcome(
    tmp_path: Path,
) -> None:
    deployed = _write(tmp_path / "deployed.json", {
        "schema": "aasopharma.live18.deployment-evidence.v1",
        "provider": "railway",
        "commit_sha": SHA,
        "services": {
            name: {"origin": f"https://{name}.example"}
            for name in ("api", "frontend", "mcp")
        },
    })
    evidence_dir = tmp_path / "evidence"
    _write(evidence_dir / "sales_invoice.failure.json", {
        "evidence_schema": "aasopharma.live18.browser-failure.v1",
        "tested_sha": SHA,
        "operation_id": "sales_invoice",
        "stage": "requester_login",
        "step_index": None,
        "actor": "requester",
        "action": None,
        "locator_kind": None,
        "error_kind": "Error",
    })

    with pytest.raises(ArtifactManifestError, match="successful browser outcome"):
        build_manifest(
            deployed_sha=deployed,
            evidence_dir=evidence_dir,
            database_evidence=None,
            demo_evidence=None,
            browser_outcome="success",
            run_id="123",
            run_attempt="1",
        )


def test_manifest_rejects_nonempty_malformed_optional_evidence(tmp_path: Path) -> None:
    deployed = _write(tmp_path / "deployed.json", {
        "schema": "aasopharma.live18.deployment-evidence.v1",
        "provider": "railway",
        "commit_sha": SHA,
        "services": {
            name: {"origin": f"https://{name}.example"}
            for name in ("api", "frontend", "mcp")
        },
    })
    malformed = tmp_path / "demo.json"
    malformed.write_text("{", encoding="utf-8")

    with pytest.raises(json.JSONDecodeError):
        build_manifest(
            deployed_sha=deployed,
            evidence_dir=tmp_path / "missing-evidence",
            database_evidence=None,
            demo_evidence=malformed,
            browser_outcome="skipped",
            run_id="123",
            run_attempt="1",
        )


def test_live18_workflow_uploads_only_fixed_manifest() -> None:
    workflow = Path(".github/workflows/production-readiness.yml").read_text(encoding="utf-8")
    live18 = workflow.split("\n  live18-acceptance:", 1)[1]
    upload = live18.split("- name: Upload scrubbed allowlisted live18 evidence only", 1)[1]

    assert "live18-upload/live18-evidence-manifest.json" in upload
    for forbidden in (
        "live18-browser-identities.json",
        "live18-fixture-identities.json",
        "live18-playwright-list.txt",
        "live18-reconciliation.txt",
        "live18-database-evidence.json",
        "live18-demo-evidence.json",
        "live18-railway-demo.json",
        "live18-evidence\n",
        "live18-playwright\n",
    ):
        assert forbidden not in upload


def test_live18_playwright_disables_authenticated_rich_artifacts() -> None:
    config = Path("frontend/e2e/live18/playwright.config.ts").read_text(encoding="utf-8")
    spec = Path("frontend/e2e/live18/canonical-live18.spec.ts").read_text(encoding="utf-8")

    assert "trace: 'off'" in config
    assert "screenshot: 'off'" in config
    assert "video: 'off'" in config
    assert "html" not in config
    assert ".screenshot(" not in spec
    assert "testInfo.attach" not in spec

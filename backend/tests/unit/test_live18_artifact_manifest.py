from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path

import pytest

from scripts.build_live18_artifact_manifest import ArtifactManifestError, build_manifest


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
            "status": 200, "requestId": "request-1",
            "requestBody": {"authorization": "Bearer must-not-upload"},
            "responseBody": {"access_token": "must-not-upload"},
        }],
        "rest_readback": {"customer_email": "must-not-upload@example.com"},
    })
    database = _write(tmp_path / "database.json", {
        "action": "capture-evidence",
        "organization_id": ORG,
        "denial_organization_id": "d3000000-0000-7000-8000-00000000002c",
        "runtime_role": {
            "current_user": "erp_runtime",
            "superuser": False,
            "bypassrls": False,
            "migration_owner_member": False,
            "network_family": 6,
            "transport": "supabase_direct_ipv6_from_railway",
        },
        "resources": {
            "sales_invoice": {
                "command_operation": "sales.invoice.prepare",
                "command_request_id": COMMAND,
                "resource_id": RESOURCE,
                "cross_tenant_denied": True,
                "database": {"customer_email": "must-not-upload@example.com"},
            },
        },
    })
    demo = _write(tmp_path / "demo.json", {
        "action": "provision-demo",
        "content_sha256": "c" * 64,
        "demo_summary": {"password": "must-not-upload"},
    })

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
        "request_id": "request-1",
    }]
    assert manifest["browser"][0]["screenshots"] == screenshots


def test_success_requires_exactly_18_operations_and_36_reviewed_pngs(
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
    screenshot_dir = tmp_path / "screenshots"
    for index in range(18):
        operation_id = f"operation_{index:02d}"
        screenshots, screenshot_dir = _screenshots(tmp_path, operation_id)
        _write(evidence_dir / f"{operation_id}.json", {
            "evidence_schema": "aasopharma.live18.browser.v1",
            "tested_sha": SHA,
            "operation_id": operation_id,
            "command_operation": "test.operation.prepare",
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
            "http_evidence": [],
            "screenshots": screenshots,
        })

    manifest = build_manifest(
        deployed_sha=deployed,
        evidence_dir=evidence_dir,
        database_evidence=None,
        demo_evidence=None,
        browser_outcome="success",
        run_id="123",
        run_attempt="1",
        screenshot_dir=screenshot_dir,
    )

    assert len(manifest["browser"]) == 18
    assert sum(len(row["screenshots"]) for row in manifest["browser"]) == 36

    (screenshot_dir / "unreviewed.png").write_bytes(PNG_1X1)
    (screenshot_dir / "unreviewed.png").chmod(0o600)
    with pytest.raises(ArtifactManifestError, match="exactly 36"):
        build_manifest(
            deployed_sha=deployed,
            evidence_dir=evidence_dir,
            database_evidence=None,
            demo_evidence=None,
            browser_outcome="success",
            run_id="123",
            run_attempt="1",
            screenshot_dir=screenshot_dir,
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

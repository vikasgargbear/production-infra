from __future__ import annotations

import json
from pathlib import Path

from scripts.build_live18_artifact_manifest import build_manifest


SHA = "a" * 40
ORG = "d3000000-0000-7000-8000-000000000001"
BRANCH = "d3000000-0000-7000-8000-000000000005"
REQUESTER = "d3000000-0000-7000-8000-000000000021"
REVIEWER = "d3000000-0000-7000-8000-000000000003"
COMMAND = "018f0000-0000-7000-8000-000000000001"
RESOURCE = "018f0000-0000-7000-8000-000000000002"


def _write(path: Path, value: object) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")
    return path


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
        browser_outcome="success",
        run_id="123",
        run_attempt="2",
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

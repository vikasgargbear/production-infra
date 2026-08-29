from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import HTTPException

from app.api.routes.canonical_evidence_uploads import evidence_storage_dependency
from app.main import app


ROOT = Path(__file__).resolve().parents[3]


def test_upload_is_authenticated_multipart_and_readback_is_get_only():
    contract = app.openapi()
    upload = contract["paths"]["/api/web/evidence/expense-receipts"]
    assert set(upload) == {"post"}
    operation = upload["post"]
    assert operation["security"]
    media = operation["requestBody"]["content"]
    assert set(media) == {"multipart/form-data"}
    schema = media["multipart/form-data"]["schema"]
    assert "$ref" in schema

    customer_upload = contract["paths"]["/api/web/evidence/customer-receipts"]
    assert set(customer_upload) == {"post"}
    assert customer_upload["post"]["security"]
    assert set(customer_upload["post"]["requestBody"]["content"]) == {
        "multipart/form-data"
    }

    readback = contract["paths"]["/api/web/evidence/{attachment_id}"]
    assert set(readback) == {"get"}
    assert readback["get"]["security"]


def test_disabled_storage_dependency_returns_503_not_fake_success(monkeypatch):
    monkeypatch.delenv("EVIDENCE_STORAGE_ENABLED", raising=False)
    with pytest.raises(HTTPException) as failure:
        evidence_storage_dependency()
    assert failure.value.status_code == 503
    assert "not enabled" in str(failure.value.detail)


def test_server_storage_credential_is_absent_from_browser_source():
    frontend = ROOT / "frontend"
    for path in frontend.rglob("*"):
        if path.is_file() and path.suffix in {".ts", ".tsx", ".js", ".json", ".html"}:
            source = path.read_text(encoding="utf-8", errors="ignore")
            assert "EVIDENCE_STORAGE_SERVER_API_KEY" not in source, path
            assert "EVIDENCE_STORAGE_SERVER_JWT" not in source, path


def test_storage_adapter_uses_public_api_key_and_verified_service_user_bearer():
    adapter = (
        ROOT / "backend/app/infrastructure/evidence_storage.py"
    ).read_text(encoding="utf-8")
    credentials = (
        ROOT / "backend/app/infrastructure/evidence_storage_credentials.py"
    ).read_text(encoding="utf-8")
    assert '"apikey": self._config.credentials.publishable_api_key' in adapter
    assert '"Authorization": f"Bearer {access_token}"' in adapter
    assert "SUPABASE_ANON_KEY" in credentials
    assert "EVIDENCE_STORAGE_SERVICE_EMAIL" in credentials
    assert "EVIDENCE_STORAGE_SERVICE_PASSWORD" in credentials
    assert "EVIDENCE_STORAGE_SERVICE_AUTH_USER_ID" in credentials
    assert "EVIDENCE_STORAGE_SERVER_API_KEY" not in adapter
    assert "EVIDENCE_STORAGE_SERVER_JWT" not in adapter
    assert "JWT_SECRET_KEY" in credentials
    assert "must be distinct from the ERP JWT signing secret" in credentials


def test_storage_policy_has_no_update_or_service_role_authority():
    policy = (
        ROOT / "database/09-deployment/canonical-evidence-storage.sql"
    ).read_text(encoding="utf-8")
    assert "public=false" in policy
    assert "REVOKE ALL PRIVILEGES ON TABLE storage.buckets, storage.objects" in policy
    assert "FOR UPDATE TO erp_evidence_storage" not in policy
    assert "service_role" not in policy
    assert "NOBYPASSRLS" in policy
    alter_role = policy.split(
        "ALTER ROLE erp_evidence_storage", 1
    )[1].split(";", 1)[0]
    assert "NOSUPERUSER" not in alter_role
    assert "NOREPLICATION" not in alter_role
    assert "NOBYPASSRLS" not in alter_role
    assert "protected role posture drifted" in policy
    assert "storage.allow_any_operation" in policy
    assert "storage.object.get_authenticated" in policy
    assert "storage.object.list" not in policy
    assert "a public or extra evidence-role policy" in policy


def test_staging_proves_allowed_and_denied_storage_operations_before_deploy():
    workflow = (
        ROOT / ".github/workflows/canonical-staging.yml"
    ).read_text(encoding="utf-8")
    canary = workflow.split(
        "Prove canonical evidence storage least privilege", 1
    )[1].split("Capture and audit exact-SHA transaction integrity", 1)[0]

    assert workflow.index("Provision canonical private evidence storage") < workflow.index(
        "Prove canonical evidence storage least privilege"
    ) < workflow.index("Reconcile and deploy the free Render pilot")
    assert 'test "$EVIDENCE_STORAGE_ENABLED" = true' in canary
    assert "verify_canonical_evidence_storage.py" in canary
    assert '--project-ref "$CANONICAL_STAGING_PROJECT_REF"' in canary
    assert "canonical-evidence-storage-canary.json" in canary

    verifier = (
        ROOT / "backend/scripts/verify_canonical_evidence_storage.py"
    ).read_text(encoding="utf-8")
    assert '"x-upsert": "false"' in verifier
    assert "read.content != FIXTURE" in verifier
    assert "object/list/{BUCKET}" in verifier
    assert "list_body != []" in verifier
    assert "client.put(" in verifier
    assert "outside-reviewed-path" in verifier
    assert "canonical-evidence-unreviewed" in verifier
    assert "client.delete(object_url)" in verifier


def test_integrity_readback_requires_exact_canonical_branch_permissions():
    route = (
        ROOT / "backend/app/api/routes/canonical_evidence_uploads.py"
    ).read_text(encoding="utf-8")

    assert "'core.attachment.manage',attachment.branch_id" in route
    assert "'finance.expense.manage',attachment.branch_id" in route
    assert "'finance.payment.manage',attachment.branch_id" in route
    assert 'CUSTOMER_RECEIPT_KIND = "customer_receipt_evidence"' in route


def test_expense_context_only_lists_receipts_from_the_selected_branch():
    route = (
        ROOT / "backend/app/api/routes/web_operator_actions.py"
    ).read_text(encoding="utf-8")

    receipt_query = route.split("receipt_rows = db.execute", 1)[1].split(
        "accounts =", 1
    )[0]
    assert "attachment.branch_id=:branch_id" in receipt_query
    assert '"branch_id": branch_id' in receipt_query

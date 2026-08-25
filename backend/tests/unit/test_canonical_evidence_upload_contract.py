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
            assert "EVIDENCE_STORAGE_SERVER_JWT" not in path.read_text(
                encoding="utf-8", errors="ignore"
            ), path


def test_storage_policy_has_no_update_or_service_role_authority():
    policy = (
        ROOT / "database/09-deployment/canonical-evidence-storage.sql"
    ).read_text(encoding="utf-8")
    assert "public=false" in policy
    assert "REVOKE UPDATE ON TABLE storage.objects" in policy
    assert "FOR UPDATE TO erp_evidence_storage" not in policy
    assert "service_role" not in policy
    assert "NOBYPASSRLS" in policy


def test_integrity_readback_requires_exact_canonical_branch_permissions():
    route = (
        ROOT / "backend/app/api/routes/canonical_evidence_uploads.py"
    ).read_text(encoding="utf-8")

    assert "'core.attachment.manage',attachment.branch_id" in route
    assert "'finance.expense.manage',attachment.branch_id" in route


def test_expense_context_only_lists_receipts_from_the_selected_branch():
    route = (
        ROOT / "backend/app/api/routes/web_operator_actions.py"
    ).read_text(encoding="utf-8")

    receipt_query = route.split("receipt_rows = db.execute", 1)[1].split(
        "accounts =", 1
    )[0]
    assert "attachment.branch_id=:branch_id" in receipt_query
    assert '"branch_id": branch_id' in receipt_query

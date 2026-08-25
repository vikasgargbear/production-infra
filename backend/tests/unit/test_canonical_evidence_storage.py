from __future__ import annotations

import base64
import hashlib
import json

import httpx
import pytest

from app.infrastructure.evidence_storage import (
    EVIDENCE_BUCKET,
    MAX_EVIDENCE_BYTES,
    EvidenceIntegrityError,
    EvidenceStorageConfig,
    EvidenceStorageConflict,
    EvidenceStorageUnavailable,
    SupabaseEvidenceStorage,
    evidence_object_key,
    validate_pdf,
)


def _jwt(role: str) -> str:
    payload = base64.urlsafe_b64encode(
        json.dumps({"role": role}, separators=(",", ":")).encode("utf-8")
    ).rstrip(b"=").decode("ascii")
    return f"e30.{payload}.test-signature"


def _blank_pdf() -> bytes:
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] /Resources << >> /Contents 4 0 R >>",
        b"<< /Length 0 >>\nstream\n\nendstream",
    ]
    content = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for number, body in enumerate(objects, 1):
        offsets.append(len(content))
        content.extend(f"{number} 0 obj\n".encode("ascii"))
        content.extend(body)
        content.extend(b"\nendobj\n")
    xref_offset = len(content)
    content.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    content.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        content.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    content.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    )
    return bytes(content)


PDF = _blank_pdf()


def test_storage_configuration_fails_closed_without_explicit_enable(monkeypatch):
    monkeypatch.delenv("EVIDENCE_STORAGE_ENABLED", raising=False)
    monkeypatch.setenv("SUPABASE_URL", "https://canonical.supabase.co")
    monkeypatch.setenv("EVIDENCE_STORAGE_EXPECTED_PROJECT_REF", "canonicalcanonical12")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-anon")
    monkeypatch.setenv("EVIDENCE_STORAGE_SERVER_JWT", _jwt("erp_evidence_storage"))

    with pytest.raises(EvidenceStorageUnavailable, match="not enabled"):
        EvidenceStorageConfig.from_environment()


def test_storage_configuration_requires_https_and_server_only_authority(monkeypatch):
    monkeypatch.setenv("EVIDENCE_STORAGE_ENABLED", "true")
    monkeypatch.setenv("SUPABASE_URL", "http://canonical.supabase.co")
    monkeypatch.setenv("EVIDENCE_STORAGE_EXPECTED_PROJECT_REF", "canonicalcanonical12")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-anon")
    monkeypatch.delenv("EVIDENCE_STORAGE_SERVER_JWT", raising=False)

    with pytest.raises(EvidenceStorageUnavailable, match="HTTPS"):
        EvidenceStorageConfig.from_environment()


def test_storage_configuration_binds_the_exact_reviewed_staging_project(monkeypatch):
    project_ref = "rgihahbmkrmhitjdjvev"
    monkeypatch.setenv("EVIDENCE_STORAGE_ENABLED", "true")
    monkeypatch.setenv("EVIDENCE_STORAGE_EXPECTED_PROJECT_REF", project_ref)
    monkeypatch.setenv("SUPABASE_URL", f"https://{project_ref}.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-anon")
    monkeypatch.setenv("EVIDENCE_STORAGE_SERVER_JWT", _jwt("erp_evidence_storage"))

    config = EvidenceStorageConfig.from_environment()

    assert config.project_ref == project_ref
    assert config.base_url == f"https://{project_ref}.supabase.co"


@pytest.mark.parametrize(
    ("project_ref", "base_url"),
    [
        ("short", "https://short.supabase.co"),
        ("rgihahbmkrmhitjdjvev", "https://differentprojectref1.supabase.co"),
    ],
)
def test_storage_rejects_retired_or_mismatched_project_authority(
    monkeypatch, project_ref, base_url
):
    monkeypatch.setenv("EVIDENCE_STORAGE_ENABLED", "true")
    monkeypatch.setenv("EVIDENCE_STORAGE_EXPECTED_PROJECT_REF", project_ref)
    monkeypatch.setenv("SUPABASE_URL", base_url)
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-anon")
    monkeypatch.setenv("EVIDENCE_STORAGE_SERVER_JWT", _jwt("erp_evidence_storage"))

    with pytest.raises(EvidenceStorageUnavailable, match="reviewed environment"):
        EvidenceStorageConfig.from_environment()


@pytest.mark.parametrize("role", ["service_role", "authenticated", "", "erp_runtime"])
def test_storage_rejects_any_jwt_role_except_bucket_restricted_authority(
    monkeypatch, role
):
    project_ref = "canonicalcanonical12"
    monkeypatch.setenv("EVIDENCE_STORAGE_ENABLED", "true")
    monkeypatch.setenv("EVIDENCE_STORAGE_EXPECTED_PROJECT_REF", project_ref)
    monkeypatch.setenv("SUPABASE_URL", f"https://{project_ref}.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-anon")
    monkeypatch.setenv("EVIDENCE_STORAGE_SERVER_JWT", _jwt(role))

    with pytest.raises(EvidenceStorageUnavailable, match="erp_evidence_storage"):
        EvidenceStorageConfig.from_environment()


@pytest.mark.parametrize(
    ("filename", "media_type", "content", "message"),
    [
        ("receipt.txt", "application/pdf", PDF, "Only .pdf"),
        ("receipt.pdf", "text/plain", PDF, "media type"),
        ("../receipt.pdf", "application/pdf", PDF, "plain PDF filename"),
        ("receipt.pdf", "application/pdf", b"not-a-pdf", "PDF signature"),
        ("receipt.pdf", "application/pdf", b"%PDF-1.7\n", "incomplete"),
        (
            "receipt.pdf",
            "application/pdf",
            b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n",
            "structure is corrupt",
        ),
    ],
)
def test_pdf_validation_rejects_wrong_type_path_and_corrupt_content(
    filename, media_type, content, message
):
    with pytest.raises(EvidenceIntegrityError, match=message):
        validate_pdf(filename, media_type, content)


def test_pdf_validation_rejects_oversized_content_before_storage():
    content = b"%PDF-1.7\n" + b"x" * MAX_EVIDENCE_BYTES + b"%%EOF"
    with pytest.raises(EvidenceIntegrityError, match="10 MiB"):
        validate_pdf("receipt.pdf", "application/pdf", content)


def test_content_addressed_key_is_exactly_org_branch_kind_hash_scoped():
    digest = hashlib.sha256(PDF).hexdigest()
    assert evidence_object_key("org", "branch", "expense_receipt", digest) == (
        f"org/branch/expense_receipt/{digest}.pdf"
    )


def test_private_adapter_creates_without_upsert_and_reads_back_exact_bytes():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.method == "POST":
            return httpx.Response(201, json={"Key": "created"})
        if request.method == "GET":
            return httpx.Response(200, content=PDF)
        raise AssertionError(request.method)

    storage = SupabaseEvidenceStorage(
        EvidenceStorageConfig(
            base_url="https://canonical.supabase.co",
            anon_key="public-anon",
            server_jwt="bucket-restricted-server-jwt",
            project_ref="canonicalcanonical12",
        ),
        transport=httpx.MockTransport(handler),
    )
    key = evidence_object_key("org", "branch", "expense_receipt", "a" * 64)

    assert storage.create(key, PDF) is True
    assert storage.read(key) == PDF
    assert requests[0].headers["x-upsert"] == "false"
    assert requests[0].headers["authorization"] == "Bearer bucket-restricted-server-jwt"
    assert requests[0].headers["apikey"] == "public-anon"
    assert requests[0].url.path == f"/storage/v1/object/{EVIDENCE_BUCKET}/{key}"


def test_existing_object_is_not_overwritten_and_can_be_verified_by_readback():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            return httpx.Response(409, json={"message": "already exists"})
        if request.method == "GET":
            return httpx.Response(200, content=PDF)
        raise AssertionError(request.method)

    storage = SupabaseEvidenceStorage(
        EvidenceStorageConfig(
            base_url="https://canonical.supabase.co",
            anon_key="anon",
            server_jwt="restricted",
            project_ref="canonicalcanonical12",
        ),
        transport=httpx.MockTransport(handler),
    )
    assert storage.create("org/branch/expense_receipt/hash.pdf", PDF) is False
    assert storage.read("org/branch/expense_receipt/hash.pdf") == PDF


def test_storage_auth_failure_is_unavailable_not_fake_success():
    storage = SupabaseEvidenceStorage(
        EvidenceStorageConfig(
            base_url="https://canonical.supabase.co",
            anon_key="anon",
            server_jwt="wrong-authority",
            project_ref="canonicalcanonical12",
        ),
        transport=httpx.MockTransport(
            lambda _request: httpx.Response(403, json={"message": "denied"})
        ),
    )

    with pytest.raises(EvidenceStorageUnavailable, match="bucket-restricted"):
        storage.create("org/branch/expense_receipt/hash.pdf", PDF)


def test_cleanup_requires_one_exact_object_key():
    storage = SupabaseEvidenceStorage(
        EvidenceStorageConfig(
            base_url="https://canonical.supabase.co",
            anon_key="anon",
            server_jwt="restricted",
            project_ref="canonicalcanonical12",
        ),
        transport=httpx.MockTransport(lambda _request: httpx.Response(204)),
    )

    with pytest.raises(EvidenceStorageConflict, match="exact object key"):
        storage.delete("org/branch/expense_receipt/")

from __future__ import annotations

import hashlib

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


PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n"


def test_storage_configuration_fails_closed_without_explicit_enable(monkeypatch):
    monkeypatch.delenv("EVIDENCE_STORAGE_ENABLED", raising=False)
    monkeypatch.setenv("SUPABASE_URL", "https://canonical.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-anon")
    monkeypatch.setenv("EVIDENCE_STORAGE_SERVER_JWT", "server-only")

    with pytest.raises(EvidenceStorageUnavailable, match="not enabled"):
        EvidenceStorageConfig.from_environment()


def test_storage_configuration_requires_https_and_server_only_authority(monkeypatch):
    monkeypatch.setenv("EVIDENCE_STORAGE_ENABLED", "true")
    monkeypatch.setenv("SUPABASE_URL", "http://canonical.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-anon")
    monkeypatch.delenv("EVIDENCE_STORAGE_SERVER_JWT", raising=False)

    with pytest.raises(EvidenceStorageUnavailable, match="HTTPS"):
        EvidenceStorageConfig.from_environment()


@pytest.mark.parametrize(
    ("filename", "media_type", "content", "message"),
    [
        ("receipt.txt", "application/pdf", PDF, "Only .pdf"),
        ("receipt.pdf", "text/plain", PDF, "media type"),
        ("../receipt.pdf", "application/pdf", PDF, "plain PDF filename"),
        ("receipt.pdf", "application/pdf", b"not-a-pdf", "PDF signature"),
        ("receipt.pdf", "application/pdf", b"%PDF-1.7\n", "incomplete"),
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
        ),
        transport=httpx.MockTransport(lambda _request: httpx.Response(204)),
    )

    with pytest.raises(EvidenceStorageConflict, match="exact object key"):
        storage.delete("org/branch/expense_receipt/")

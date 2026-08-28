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
    _configured_evidence_storage,
    configured_evidence_storage,
    evidence_object_key,
    validate_pdf,
)
from app.infrastructure.evidence_storage_credentials import (
    EvidenceCredentialConfig,
    EvidenceCredentialUnavailable,
)


PROJECT_REF = "canonicalcanonical12"
BASE_URL = f"https://{PROJECT_REF}.supabase.co"
PUBLISHABLE_API_KEY = "sb_publishable_" + "a" * 32
SERVICE_EMAIL = "evidence-storage@canonical.invalid"
SERVICE_PASSWORD = "evidence-password-" + "x" * 32
SERVICE_USER_ID = "c1fe54d2-a6d9-4c63-9d08-dd4b02caf630"


class StubTokenProvider:
    def __init__(self, *tokens: str) -> None:
        self.tokens = list(tokens or ("access-token",))
        self.index = 0
        self.access_calls = 0
        self.invalidated: list[str] = []

    def access_token(self) -> str:
        self.access_calls += 1
        return self.tokens[self.index]

    def invalidate(self, rejected_token: str) -> None:
        self.invalidated.append(rejected_token)
        if self.index + 1 < len(self.tokens):
            self.index += 1


def _config() -> EvidenceStorageConfig:
    return EvidenceStorageConfig(
        credentials=EvidenceCredentialConfig(
            base_url=BASE_URL,
            project_ref=PROJECT_REF,
            publishable_api_key=PUBLISHABLE_API_KEY,
            service_email=SERVICE_EMAIL,
            service_password=SERVICE_PASSWORD,
            expected_user_id=SERVICE_USER_ID,
        )
    )


def _set_valid_environment(monkeypatch) -> None:
    monkeypatch.setenv("EVIDENCE_STORAGE_ENABLED", "true")
    monkeypatch.setenv("SUPABASE_URL", BASE_URL)
    monkeypatch.setenv("EVIDENCE_STORAGE_EXPECTED_PROJECT_REF", PROJECT_REF)
    monkeypatch.setenv("SUPABASE_ANON_KEY", PUBLISHABLE_API_KEY)
    monkeypatch.setenv("EVIDENCE_STORAGE_SERVICE_EMAIL", SERVICE_EMAIL)
    monkeypatch.setenv("EVIDENCE_STORAGE_SERVICE_PASSWORD", SERVICE_PASSWORD)
    monkeypatch.setenv("EVIDENCE_STORAGE_SERVICE_AUTH_USER_ID", SERVICE_USER_ID)
    monkeypatch.delenv("EVIDENCE_STORAGE_SERVER_API_KEY", raising=False)
    monkeypatch.delenv("EVIDENCE_STORAGE_SERVER_JWT", raising=False)


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
    _set_valid_environment(monkeypatch)
    monkeypatch.delenv("EVIDENCE_STORAGE_ENABLED", raising=False)

    with pytest.raises(EvidenceStorageUnavailable, match="not enabled"):
        EvidenceStorageConfig.from_environment()


def test_storage_configuration_requires_https(monkeypatch):
    _set_valid_environment(monkeypatch)
    monkeypatch.setenv("SUPABASE_URL", f"http://{PROJECT_REF}.supabase.co")

    with pytest.raises(EvidenceStorageUnavailable, match="HTTPS"):
        EvidenceStorageConfig.from_environment()


def test_storage_configuration_binds_the_exact_reviewed_staging_project(monkeypatch):
    _set_valid_environment(monkeypatch)

    config = EvidenceStorageConfig.from_environment()

    assert config.project_ref == PROJECT_REF
    assert config.base_url == BASE_URL
    assert config.credentials.publishable_api_key == PUBLISHABLE_API_KEY
    assert config.credentials.expected_user_id == SERVICE_USER_ID


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
    _set_valid_environment(monkeypatch)
    monkeypatch.setenv("EVIDENCE_STORAGE_EXPECTED_PROJECT_REF", project_ref)
    monkeypatch.setenv("SUPABASE_URL", base_url)

    with pytest.raises(EvidenceStorageUnavailable, match="reviewed"):
        EvidenceStorageConfig.from_environment()


@pytest.mark.parametrize(
    "retired_name",
    ["EVIDENCE_STORAGE_SERVER_API_KEY", "EVIDENCE_STORAGE_SERVER_JWT"],
)
def test_storage_rejects_retired_server_credentials(monkeypatch, retired_name):
    _set_valid_environment(monkeypatch)
    monkeypatch.setenv(retired_name, "must-not-be-used")

    with pytest.raises(EvidenceStorageUnavailable, match="Retired"):
        EvidenceStorageConfig.from_environment()


def test_storage_requires_the_public_key_and_service_identity(monkeypatch):
    _set_valid_environment(monkeypatch)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)

    with pytest.raises(EvidenceStorageUnavailable, match="publishable or legacy anon"):
        EvidenceStorageConfig.from_environment()


def test_storage_rejects_the_erp_jwt_secret_as_service_password(monkeypatch):
    _set_valid_environment(monkeypatch)
    monkeypatch.setenv("JWT_SECRET_KEY", SERVICE_PASSWORD)

    with pytest.raises(EvidenceStorageUnavailable, match="ERP JWT"):
        EvidenceStorageConfig.from_environment()


def test_configured_storage_reuses_one_process_token_cache(monkeypatch):
    _set_valid_environment(monkeypatch)
    _configured_evidence_storage.cache_clear()
    try:
        first = configured_evidence_storage()
        second = configured_evidence_storage()
        assert first is second
        assert first._token_provider is second._token_provider
    finally:
        _configured_evidence_storage.cache_clear()


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
        _config(),
        transport=httpx.MockTransport(handler),
        token_provider=StubTokenProvider(),
    )
    key = evidence_object_key("org", "branch", "expense_receipt", "a" * 64)

    assert storage.create(key, PDF) is True
    assert storage.read(key) == PDF
    assert requests[0].headers["x-upsert"] == "false"
    assert requests[0].headers["authorization"] == "Bearer access-token"
    assert requests[0].headers["apikey"] == PUBLISHABLE_API_KEY
    assert requests[0].url.path == f"/storage/v1/object/{EVIDENCE_BUCKET}/{key}"


@pytest.mark.parametrize(
    ("status", "payload"),
    [
        (400, {"code": "KeyAlreadyExists", "message": "Asset Already Exists"}),
        (409, {"code": "ResourceAlreadyExists", "message": "already exists"}),
        (
            400,
            {"error": "Duplicate", "message": "The resource already exists"},
        ),
    ],
)
def test_existing_object_is_not_overwritten_and_can_be_verified_by_readback(
    status, payload
):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            return httpx.Response(status, json=payload)
        if request.method == "GET":
            return httpx.Response(200, content=PDF)
        raise AssertionError(request.method)

    storage = SupabaseEvidenceStorage(
        _config(),
        transport=httpx.MockTransport(handler),
        token_provider=StubTokenProvider(),
    )
    assert storage.create("org/branch/expense_receipt/hash.pdf", PDF) is False
    assert storage.read("org/branch/expense_receipt/hash.pdf") == PDF


@pytest.mark.parametrize("status", [400, 409])
def test_unstructured_duplicate_status_is_not_treated_as_idempotent(status):
    storage = SupabaseEvidenceStorage(
        _config(),
        transport=httpx.MockTransport(
            lambda _request: httpx.Response(status, json={"message": "ambiguous"})
        ),
        token_provider=StubTokenProvider(),
    )

    with pytest.raises(EvidenceStorageUnavailable):
        storage.create("org/branch/expense_receipt/hash.pdf", PDF)


def test_storage_auth_failure_is_unavailable_not_fake_success():
    storage = SupabaseEvidenceStorage(
        _config(),
        transport=httpx.MockTransport(
            lambda _request: httpx.Response(403, json={"message": "denied"})
        ),
        token_provider=StubTokenProvider(),
    )

    with pytest.raises(EvidenceStorageUnavailable, match="bucket-restricted"):
        storage.create("org/branch/expense_receipt/hash.pdf", PDF)


@pytest.mark.parametrize("operation", ["create", "read", "delete"])
def test_storage_refreshes_once_after_401(operation):
    requests: list[httpx.Request] = []
    provider = StubTokenProvider("rejected-token", "refreshed-token")

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.headers["authorization"] == "Bearer rejected-token":
            return httpx.Response(401, json={"message": "expired"})
        if request.method == "POST":
            return httpx.Response(201)
        if request.method == "GET":
            return httpx.Response(200, content=PDF)
        return httpx.Response(204)

    storage = SupabaseEvidenceStorage(
        _config(),
        transport=httpx.MockTransport(handler),
        token_provider=provider,
    )

    if operation == "create":
        assert storage.create("org/branch/kind/hash.pdf", PDF) is True
    elif operation == "read":
        assert storage.read("org/branch/kind/hash.pdf") == PDF
    else:
        assert storage.delete("org/branch/kind/hash.pdf") is True

    assert len(requests) == 2
    assert provider.invalidated == ["rejected-token"]
    assert requests[1].headers["authorization"] == "Bearer refreshed-token"


def test_storage_does_not_retry_403_or_a_second_401():
    for statuses, expected_requests in [([403], 1), ([401, 401], 2)]:
        provider = StubTokenProvider("first-token", "second-token")
        requests = 0

        def handler(_request: httpx.Request) -> httpx.Response:
            nonlocal requests
            status = statuses[min(requests, len(statuses) - 1)]
            requests += 1
            return httpx.Response(status)

        storage = SupabaseEvidenceStorage(
            _config(),
            transport=httpx.MockTransport(handler),
            token_provider=provider,
        )
        with pytest.raises(EvidenceStorageUnavailable, match="bucket-restricted"):
            storage.create("org/branch/kind/hash.pdf", PDF)
        assert requests == expected_requests


def test_cleanup_requires_one_exact_object_key():
    storage = SupabaseEvidenceStorage(
        _config(),
        transport=httpx.MockTransport(lambda _request: httpx.Response(204)),
        token_provider=StubTokenProvider(),
    )

    with pytest.raises(EvidenceStorageConflict, match="exact object key"):
        storage.delete("org/branch/expense_receipt/")

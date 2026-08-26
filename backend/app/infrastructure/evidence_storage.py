"""Private object storage boundary for canonical evidence PDFs.

The browser never receives the dedicated service-user credential.  This adapter
is deliberately small: one private bucket, create-without-upsert, authenticated
readback, and bounded cleanup.  Canonical metadata and tenant authority remain
in PostgreSQL.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from io import BytesIO
import os
from urllib.parse import quote, urlparse

import httpx
from pdfminer.pdfdocument import PDFDocument, PDFNoValidXRef, PDFSyntaxError
from pdfminer.pdfpage import PDFPage
from pdfminer.pdfparser import PDFParser
from pdfminer.psparser import PSEOF, PSException

from app.infrastructure.evidence_storage_credentials import (
    EvidenceCredentialConfig,
    EvidenceCredentialUnavailable,
    EvidenceServiceTokenProvider,
)


EVIDENCE_BUCKET = "canonical-evidence-private-v1"
MAX_EVIDENCE_BYTES = 10 * 1024 * 1024
PDF_MEDIA_TYPE = "application/pdf"


class EvidenceStorageError(RuntimeError):
    """Base class for fail-closed evidence-storage failures."""


class EvidenceStorageUnavailable(EvidenceStorageError):
    """Storage is disabled, unavailable, or incorrectly authorized."""


class EvidenceStorageConflict(EvidenceStorageError):
    """A deterministic object key already contains different evidence."""


class EvidenceIntegrityError(EvidenceStorageError):
    """Stored bytes do not match the reviewed PDF identity."""


@dataclass(frozen=True)
class ValidatedPdf:
    filename: str
    content: bytes


@dataclass(frozen=True)
class EvidenceStorageConfig:
    credentials: EvidenceCredentialConfig
    bucket: str = EVIDENCE_BUCKET
    timeout_seconds: float = 15.0

    @property
    def base_url(self) -> str:
        return self.credentials.base_url

    @property
    def project_ref(self) -> str:
        return self.credentials.project_ref

    @classmethod
    def from_environment(cls) -> "EvidenceStorageConfig":
        if os.getenv("EVIDENCE_STORAGE_ENABLED", "").strip().lower() != "true":
            raise EvidenceStorageUnavailable("Canonical evidence storage is not enabled")
        base_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
        project_ref = os.getenv("EVIDENCE_STORAGE_EXPECTED_PROJECT_REF", "").strip()
        parsed = urlparse(base_url)
        if parsed.scheme != "https" or not parsed.netloc or parsed.path:
            raise EvidenceStorageUnavailable(
                "Canonical evidence storage requires an explicit HTTPS project origin"
            )
        if parsed.hostname != f"{project_ref}.supabase.co":
            raise EvidenceStorageUnavailable(
                "Canonical evidence storage project authority does not match the reviewed environment"
            )
        try:
            credentials = EvidenceCredentialConfig.from_environment(
                base_url=base_url,
                project_ref=project_ref,
            )
        except EvidenceCredentialUnavailable as exc:
            raise EvidenceStorageUnavailable(str(exc)) from exc
        return cls(credentials=credentials)


def validate_pdf(filename: str | None, media_type: str | None, content: bytes) -> ValidatedPdf:
    """Validate a bounded PDF container and require at least one parseable page."""

    name = (filename or "").strip()
    if not name or "/" in name or "\\" in name or "\x00" in name:
        raise EvidenceIntegrityError("Evidence filename must be a plain PDF filename")
    if not name.lower().endswith(".pdf"):
        raise EvidenceIntegrityError("Only .pdf evidence files are accepted")
    if media_type != PDF_MEDIA_TYPE:
        raise EvidenceIntegrityError("Evidence media type must be application/pdf")
    if not content:
        raise EvidenceIntegrityError("Evidence PDF is empty")
    if len(content) > MAX_EVIDENCE_BYTES:
        raise EvidenceIntegrityError("Evidence PDF exceeds the 10 MiB limit")
    if not content.startswith(b"%PDF-"):
        raise EvidenceIntegrityError("Evidence bytes do not have a PDF signature")
    if b"%%EOF" not in content[-2048:]:
        raise EvidenceIntegrityError("Evidence PDF is incomplete or corrupt")
    try:
        document = PDFDocument(PDFParser(BytesIO(content)))
        if next(PDFPage.create_pages(document), None) is None:
            raise EvidenceIntegrityError("Evidence PDF contains no document page")
    except EvidenceIntegrityError:
        raise
    except (PDFSyntaxError, PDFNoValidXRef, PSEOF, PSException, TypeError, ValueError, KeyError) as exc:
        raise EvidenceIntegrityError("Evidence PDF structure is corrupt") from exc
    return ValidatedPdf(filename=name, content=content)


def evidence_object_key(
    organization_id: str, branch_id: str, evidence_kind: str, sha256_hex: str
) -> str:
    """Return the immutable, tenant- and branch-scoped content-addressed key."""

    return f"{organization_id}/{branch_id}/{evidence_kind}/{sha256_hex}.pdf"


class SupabaseEvidenceStorage:
    """Bucket-restricted server adapter for private Supabase Storage."""

    def __init__(
        self,
        config: EvidenceStorageConfig,
        *,
        transport: httpx.BaseTransport | None = None,
        token_provider: EvidenceServiceTokenProvider | None = None,
    ) -> None:
        self._config = config
        self._transport = transport
        self._token_provider = token_provider or EvidenceServiceTokenProvider(
            config.credentials,
            transport=transport,
        )

    def _client(self, access_token: str) -> httpx.Client:
        return httpx.Client(
            timeout=self._config.timeout_seconds,
            transport=self._transport,
            headers={
                "apikey": self._config.credentials.publishable_api_key,
                "Authorization": f"Bearer {access_token}",
            },
        )

    def _access_token(self) -> str:
        try:
            return self._token_provider.access_token()
        except EvidenceCredentialUnavailable as exc:
            raise EvidenceStorageUnavailable(str(exc)) from exc

    def _invalidate(self, rejected_token: str) -> None:
        self._token_provider.invalidate(rejected_token)

    def _request(
        self,
        method: str,
        object_key: str,
        **kwargs: object,
    ) -> httpx.Response:
        """Send a storage request and retry exactly once after a 401."""

        for attempt in range(2):
            access_token = self._access_token()
            try:
                with self._client(access_token) as client:
                    response = client.request(
                        method,
                        self._object_url(object_key),
                        **kwargs,
                    )
            except httpx.RequestError as exc:
                raise EvidenceStorageUnavailable(
                    "Canonical evidence storage could not be reached"
                ) from exc
            if response.status_code != 401 or attempt == 1:
                return response
            self._invalidate(access_token)
        raise AssertionError("unreachable evidence-storage retry state")

    def _object_url(self, object_key: str) -> str:
        encoded_key = quote(object_key, safe="/")
        encoded_bucket = quote(self._config.bucket, safe="")
        return f"{self._config.base_url}/storage/v1/object/{encoded_bucket}/{encoded_key}"

    @staticmethod
    def _raise_unavailable(response: httpx.Response, operation: str) -> None:
        if response.status_code in (401, 403):
            raise EvidenceStorageUnavailable(
                f"Canonical evidence storage rejected its bucket-restricted {operation} authority"
            )
        raise EvidenceStorageUnavailable(
            f"Canonical evidence storage {operation} failed with HTTP {response.status_code}"
        )

    def create(self, object_key: str, content: bytes) -> bool:
        """Create one immutable object; return False when the key already exists."""

        response = self._request(
            "POST",
            object_key,
            content=content,
            headers={"Content-Type": PDF_MEDIA_TYPE, "x-upsert": "false"},
        )
        if response.status_code in (200, 201):
            return True
        if response.status_code in (400, 409):
            try:
                error = response.json()
            except ValueError:
                error = None
            if isinstance(error, dict) and (
                error.get("code") in {"KeyAlreadyExists", "ResourceAlreadyExists"}
                or (
                    error.get("error") == "Duplicate"
                    and error.get("message") == "The resource already exists"
                )
            ):
                return False
        self._raise_unavailable(response, "create")

    def read(self, object_key: str) -> bytes:
        """Fetch one object with a strict upper bound for integrity verification."""

        for attempt in range(2):
            access_token = self._access_token()
            chunks: list[bytes] = []
            byte_count = 0
            try:
                with self._client(access_token) as client:
                    with client.stream("GET", self._object_url(object_key)) as response:
                        if response.status_code == 401 and attempt == 0:
                            self._invalidate(access_token)
                            continue
                        if response.status_code == 404:
                            raise EvidenceStorageUnavailable(
                                "Canonical evidence object is missing"
                            )
                        if response.status_code != 200:
                            self._raise_unavailable(response, "read")
                        for chunk in response.iter_bytes():
                            byte_count += len(chunk)
                            if byte_count > MAX_EVIDENCE_BYTES:
                                raise EvidenceIntegrityError(
                                    "Stored evidence exceeds the 10 MiB integrity boundary"
                                )
                            chunks.append(chunk)
            except EvidenceStorageError:
                raise
            except httpx.RequestError as exc:
                raise EvidenceStorageUnavailable(
                    "Canonical evidence storage could not be reached"
                ) from exc
            return b"".join(chunks)
        raise AssertionError("unreachable evidence-storage retry state")

    def delete(self, object_key: str) -> bool:
        """Delete one explicitly resolved orphan key; never accepts a prefix."""

        if not object_key or object_key.endswith("/"):
            raise EvidenceStorageConflict("Evidence cleanup requires one exact object key")
        response = self._request("DELETE", object_key)
        if response.status_code in (200, 204):
            return True
        if response.status_code == 404:
            return False
        self._raise_unavailable(response, "delete")


@lru_cache(maxsize=1)
def _configured_evidence_storage(
    config: EvidenceStorageConfig,
) -> SupabaseEvidenceStorage:
    """Share the service-user session cache and exchange lock per process."""

    return SupabaseEvidenceStorage(config)


def configured_evidence_storage() -> SupabaseEvidenceStorage:
    """FastAPI dependency that remains unavailable until safe authority exists."""

    return _configured_evidence_storage(EvidenceStorageConfig.from_environment())

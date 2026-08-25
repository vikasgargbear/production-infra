"""Private object storage boundary for canonical evidence PDFs.

The browser never receives the server credential.  This adapter is deliberately
small: one private bucket, create-without-upsert, authenticated readback, and
bounded cleanup.  Canonical metadata and tenant authority remain in PostgreSQL.
"""

from __future__ import annotations

from dataclasses import dataclass
import os
from urllib.parse import quote, urlparse

import httpx


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
    base_url: str
    anon_key: str
    server_jwt: str
    bucket: str = EVIDENCE_BUCKET
    timeout_seconds: float = 15.0

    @classmethod
    def from_environment(cls) -> "EvidenceStorageConfig":
        if os.getenv("EVIDENCE_STORAGE_ENABLED", "").strip().lower() != "true":
            raise EvidenceStorageUnavailable("Canonical evidence storage is not enabled")
        base_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
        anon_key = os.getenv("SUPABASE_ANON_KEY", "").strip()
        server_jwt = os.getenv("EVIDENCE_STORAGE_SERVER_JWT", "").strip()
        parsed = urlparse(base_url)
        if parsed.scheme != "https" or not parsed.netloc:
            raise EvidenceStorageUnavailable(
                "Canonical evidence storage requires an explicit HTTPS project origin"
            )
        if not anon_key or not server_jwt:
            raise EvidenceStorageUnavailable(
                "Canonical evidence storage server authority is not configured"
            )
        return cls(base_url=base_url, anon_key=anon_key, server_jwt=server_jwt)


def validate_pdf(filename: str | None, media_type: str | None, content: bytes) -> ValidatedPdf:
    """Validate the bounded PDF envelope used by the evidence API."""

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
    ) -> None:
        self._config = config
        self._transport = transport

    def _client(self) -> httpx.Client:
        return httpx.Client(
            timeout=self._config.timeout_seconds,
            transport=self._transport,
            headers={
                "apikey": self._config.anon_key,
                "Authorization": f"Bearer {self._config.server_jwt}",
            },
        )

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

        try:
            with self._client() as client:
                response = client.post(
                    self._object_url(object_key),
                    content=content,
                    headers={"Content-Type": PDF_MEDIA_TYPE, "x-upsert": "false"},
                )
        except httpx.RequestError as exc:
            raise EvidenceStorageUnavailable(
                "Canonical evidence storage could not be reached"
            ) from exc
        if response.status_code in (200, 201):
            return True
        if response.status_code == 409:
            return False
        self._raise_unavailable(response, "create")

    def read(self, object_key: str) -> bytes:
        """Fetch one object with a strict upper bound for integrity verification."""

        chunks: list[bytes] = []
        byte_count = 0
        try:
            with self._client() as client:
                with client.stream("GET", self._object_url(object_key)) as response:
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

    def delete(self, object_key: str) -> bool:
        """Delete one explicitly resolved orphan key; never accepts a prefix."""

        if not object_key or object_key.endswith("/"):
            raise EvidenceStorageConflict("Evidence cleanup requires one exact object key")
        try:
            with self._client() as client:
                response = client.delete(self._object_url(object_key))
        except httpx.RequestError as exc:
            raise EvidenceStorageUnavailable(
                "Canonical evidence storage could not be reached"
            ) from exc
        if response.status_code in (200, 204):
            return True
        if response.status_code == 404:
            return False
        self._raise_unavailable(response, "delete")


def configured_evidence_storage() -> SupabaseEvidenceStorage:
    """FastAPI dependency that remains unavailable until safe authority exists."""

    return SupabaseEvidenceStorage(EvidenceStorageConfig.from_environment())

"""Short-lived Supabase service-user credentials for private evidence storage.

The credential in this module is deliberately a normal Supabase Auth session.
Supabase signs the access token after a reviewed custom-access-token hook assigns
the narrow ``erp_evidence_storage`` PostgreSQL role.  The ERP JWT signing secret
and Supabase secret/service-role API keys are never accepted here.
"""

from __future__ import annotations

import base64
import binascii
from dataclasses import dataclass, field
import json
import os
import re
import threading
import time
from typing import Any, Callable, Mapping
from urllib.parse import urlparse
from uuid import UUID

import httpx


EVIDENCE_DATABASE_ROLE = "erp_evidence_storage"
EVIDENCE_SERVICE_MARKER = "canonical-evidence-storage-service-v1"
MAX_ACCESS_TOKEN_TTL_SECONDS = 15 * 60
MIN_ACCESS_TOKEN_LIFETIME_SECONDS = 90
TOKEN_REFRESH_SKEW_SECONDS = 60
TOKEN_CLOCK_SKEW_SECONDS = 30
PROJECT_REF_PATTERN = re.compile(r"[a-z0-9]{20}")
RETIRED_EVIDENCE_CREDENTIAL_NAMES = (
    "EVIDENCE_STORAGE_SERVER_API_KEY",
    "EVIDENCE_STORAGE_SERVER_JWT",
)
PUBLISHABLE_API_KEY_PATTERN = re.compile(
    r"(?:sb_publishable_[A-Za-z0-9._-]{20,}|"
    r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)"
)


class EvidenceCredentialUnavailable(RuntimeError):
    """The reviewed evidence service identity could not obtain a safe token."""


def _parse_compact_jwt(token: str) -> tuple[Mapping[str, Any], Mapping[str, Any]]:
    """Parse bounded JWT structure without treating its claims as authority.

    Access-token signature authority remains Supabase Auth's ``/auth/v1/user``
    endpoint. The parsed claims are consumed only after that endpoint succeeds.
    Legacy anon-key claims are used solely to reject privileged key types.
    """

    if not token or len(token) > 16_384:
        raise EvidenceCredentialUnavailable("Evidence service token is malformed")
    segments = token.split(".")
    if len(segments) != 3:
        raise EvidenceCredentialUnavailable("Evidence service token is malformed")

    decoded: list[Mapping[str, Any]] = []
    for segment in segments[:2]:
        try:
            padding = "=" * (-len(segment) % 4)
            raw = base64.b64decode(
                f"{segment}{padding}", altchars=b"-_", validate=True
            )
            value = json.loads(raw)
        except (UnicodeEncodeError, UnicodeDecodeError, binascii.Error, ValueError) as exc:
            raise EvidenceCredentialUnavailable(
                "Evidence service token is malformed"
            ) from exc
        if not isinstance(value, dict):
            raise EvidenceCredentialUnavailable("Evidence service token is malformed")
        decoded.append(value)
    return decoded[0], decoded[1]


@dataclass(frozen=True)
class EvidenceCredentialConfig:
    """Validated configuration for the dedicated Supabase Auth service user."""

    base_url: str
    project_ref: str
    publishable_api_key: str
    service_email: str
    service_password: str = field(repr=False)
    expected_user_id: str
    timeout_seconds: float = 15.0

    def __post_init__(self) -> None:
        base_url = self.base_url.strip().rstrip("/")
        project_ref = self.project_ref.strip()
        parsed = urlparse(base_url)
        if (
            parsed.scheme != "https"
            or parsed.netloc != f"{project_ref}.supabase.co"
            or parsed.path
            or parsed.params
            or parsed.query
            or parsed.fragment
            or PROJECT_REF_PATTERN.fullmatch(project_ref) is None
        ):
            raise EvidenceCredentialUnavailable(
                "Evidence credentials require the exact reviewed Supabase project"
            )
        if PUBLISHABLE_API_KEY_PATTERN.fullmatch(self.publishable_api_key) is None:
            raise EvidenceCredentialUnavailable(
                "Evidence credentials require a Supabase publishable or legacy anon key"
            )
        if self.publishable_api_key.startswith("eyJ"):
            _, key_claims = _parse_compact_jwt(self.publishable_api_key)
            if key_claims.get("role") != "anon":
                raise EvidenceCredentialUnavailable(
                    "Evidence credentials reject privileged legacy Supabase keys"
                )
        email = self.service_email.strip().lower()
        if (
            not email
            or len(email) > 254
            or email.count("@") != 1
            or any(character.isspace() for character in email)
        ):
            raise EvidenceCredentialUnavailable(
                "Evidence service-user email is malformed"
            )
        if len(self.service_password.encode("utf-8")) < 32:
            raise EvidenceCredentialUnavailable(
                "Evidence service-user password must contain at least 32 bytes"
            )
        try:
            expected_user_id = str(UUID(self.expected_user_id))
        except (ValueError, TypeError, AttributeError) as exc:
            raise EvidenceCredentialUnavailable(
                "Evidence service-user UUID is malformed"
            ) from exc
        if self.timeout_seconds <= 0 or self.timeout_seconds > 60:
            raise EvidenceCredentialUnavailable(
                "Evidence credential timeout is outside the reviewed bound"
            )
        object.__setattr__(self, "base_url", base_url)
        object.__setattr__(self, "project_ref", project_ref)
        object.__setattr__(self, "service_email", email)
        object.__setattr__(self, "expected_user_id", expected_user_id)

    @classmethod
    def from_environment(
        cls, *, base_url: str, project_ref: str
    ) -> "EvidenceCredentialConfig":
        if any(os.environ.get(name, "") for name in RETIRED_EVIDENCE_CREDENTIAL_NAMES):
            raise EvidenceCredentialUnavailable(
                "Retired evidence storage credential variables are still configured"
            )
        publishable_api_key = os.getenv("SUPABASE_ANON_KEY", "").strip()
        service_email = os.getenv("EVIDENCE_STORAGE_SERVICE_EMAIL", "")
        service_password = os.getenv("EVIDENCE_STORAGE_SERVICE_PASSWORD", "")
        expected_user_id = os.getenv("EVIDENCE_STORAGE_SERVICE_AUTH_USER_ID", "")
        erp_signing_secret = os.getenv("JWT_SECRET_KEY", "")
        if service_password and erp_signing_secret and service_password == erp_signing_secret:
            raise EvidenceCredentialUnavailable(
                "Evidence service password must be distinct from the ERP JWT signing secret"
            )
        if service_password and service_password == publishable_api_key:
            raise EvidenceCredentialUnavailable(
                "Evidence service password must be distinct from the Supabase API key"
            )
        return cls(
            base_url=base_url,
            project_ref=project_ref,
            publishable_api_key=publishable_api_key,
            service_email=service_email,
            service_password=service_password,
            expected_user_id=expected_user_id,
        )


@dataclass(frozen=True)
class _CachedAccessToken:
    value: str = field(repr=False)
    expires_at: int


class EvidenceServiceTokenProvider:
    """Mint, validate, cache, and invalidate a narrow Supabase access token."""

    def __init__(
        self,
        config: EvidenceCredentialConfig,
        *,
        transport: httpx.BaseTransport | None = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.config = config
        self._transport = transport
        self._clock = clock
        self._lock = threading.Lock()
        self._cached: _CachedAccessToken | None = None

    def _client(self) -> httpx.Client:
        return httpx.Client(
            timeout=self.config.timeout_seconds,
            transport=self._transport,
            headers={"apikey": self.config.publishable_api_key},
        )

    @staticmethod
    def _json_object(response: httpx.Response, operation: str) -> Mapping[str, Any]:
        try:
            value = response.json()
        except ValueError as exc:
            raise EvidenceCredentialUnavailable(
                f"Evidence credential {operation} returned invalid JSON"
            ) from exc
        if not isinstance(value, dict):
            raise EvidenceCredentialUnavailable(
                f"Evidence credential {operation} returned an invalid response"
            )
        return value

    def _validate_access_token(self, token: str, user: Mapping[str, Any]) -> int:
        now = int(self._clock())
        header, claims = _parse_compact_jwt(token)
        if header.get("alg") not in {"ES256", "RS256", "EdDSA", "HS256"}:
            raise EvidenceCredentialUnavailable(
                "Evidence service access token uses an unsupported algorithm"
            )
        if claims.get("iss") != f"{self.config.base_url}/auth/v1":
            raise EvidenceCredentialUnavailable(
                "Evidence service access token issuer is not the reviewed project"
            )
        audience = claims.get("aud")
        if isinstance(audience, str):
            audiences = {audience}
        elif isinstance(audience, list) and all(
            isinstance(value, str) for value in audience
        ):
            audiences = set(audience)
        else:
            audiences = set()
        if "authenticated" not in audiences:
            raise EvidenceCredentialUnavailable(
                "Evidence service access token audience is invalid"
            )
        if claims.get("sub") != self.config.expected_user_id:
            raise EvidenceCredentialUnavailable(
                "Evidence service access token subject is not the reviewed user"
            )
        if claims.get("role") != EVIDENCE_DATABASE_ROLE:
            raise EvidenceCredentialUnavailable(
                "Evidence service access token role is not bucket-restricted"
            )
        if claims.get("erp_service_identity") != EVIDENCE_SERVICE_MARKER:
            raise EvidenceCredentialUnavailable(
                "Evidence service access token lacks the reviewed service marker"
            )
        issued_at = claims.get("iat")
        expires_at = claims.get("exp")
        if (
            not isinstance(issued_at, int)
            or isinstance(issued_at, bool)
            or not isinstance(expires_at, int)
            or isinstance(expires_at, bool)
            or issued_at > now + TOKEN_CLOCK_SKEW_SECONDS
            or issued_at < now - TOKEN_CLOCK_SKEW_SECONDS
            or expires_at - issued_at > MAX_ACCESS_TOKEN_TTL_SECONDS
            or expires_at - now < MIN_ACCESS_TOKEN_LIFETIME_SECONDS
        ):
            raise EvidenceCredentialUnavailable(
                "Evidence service access token lifetime is outside the reviewed bound"
            )
        if user.get("id") != self.config.expected_user_id:
            raise EvidenceCredentialUnavailable(
                "Evidence Auth readback user is not the reviewed service identity"
            )
        if str(user.get("email", "")).strip().lower() != self.config.service_email:
            raise EvidenceCredentialUnavailable(
                "Evidence Auth readback email is not the reviewed service identity"
            )
        app_metadata = user.get("app_metadata")
        if not isinstance(app_metadata, dict) or app_metadata.get(
            "erp_service_identity"
        ) != EVIDENCE_SERVICE_MARKER:
            raise EvidenceCredentialUnavailable(
                "Evidence Auth readback lacks the reviewed service marker"
            )
        return expires_at

    def _exchange(self) -> _CachedAccessToken:
        try:
            with self._client() as client:
                response = client.post(
                    f"{self.config.base_url}/auth/v1/token",
                    params={"grant_type": "password"},
                    json={
                        "email": self.config.service_email,
                        "password": self.config.service_password,
                    },
                )
                if response.status_code != 200:
                    raise EvidenceCredentialUnavailable(
                        "Evidence service password grant was rejected: "
                        f"http_status={response.status_code}"
                    )
                payload = self._json_object(response, "password grant")
                token = payload.get("access_token")
                if not isinstance(token, str) or not token:
                    raise EvidenceCredentialUnavailable(
                        "Evidence service password grant omitted its access token"
                    )
                user_response = client.get(
                    f"{self.config.base_url}/auth/v1/user",
                    headers={"Authorization": f"Bearer {token}"},
                )
                if user_response.status_code != 200:
                    raise EvidenceCredentialUnavailable(
                        "Evidence service access token verification was rejected: "
                        f"http_status={user_response.status_code}"
                    )
                user = self._json_object(user_response, "user verification")
        except EvidenceCredentialUnavailable:
            raise
        except httpx.RequestError as exc:
            raise EvidenceCredentialUnavailable(
                "Evidence credential authority could not be reached"
            ) from exc
        expires_at = self._validate_access_token(token, user)
        return _CachedAccessToken(value=token, expires_at=expires_at)

    def access_token(self) -> str:
        """Return a validated token, refreshing it once it approaches expiry."""

        with self._lock:
            now = int(self._clock())
            if (
                self._cached is not None
                and self._cached.expires_at - now > TOKEN_REFRESH_SKEW_SECONDS
            ):
                return self._cached.value
            self._cached = self._exchange()
            return self._cached.value

    def authorization_headers(self) -> dict[str, str]:
        """Return the exact headers used by Storage API clients and cleanup jobs."""

        return {
            "apikey": self.config.publishable_api_key,
            "Authorization": f"Bearer {self.access_token()}",
        }

    def invalidate(self, rejected_token: str) -> None:
        """Discard only the token actually rejected by the remote service."""

        with self._lock:
            if self._cached is not None and self._cached.value == rejected_token:
                self._cached = None

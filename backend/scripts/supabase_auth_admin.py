"""Runner-only Supabase Auth Admin authority.

The application runtime must never receive this credential.  CI resolves the
one reviewed modern Supabase secret key from the Management API, keeps it only
in process memory, and uses it for bounded Auth Admin operations.
"""

from __future__ import annotations

from dataclasses import dataclass
import os
import re
import time
from typing import Any, Mapping

import requests


MANAGEMENT_API = "https://api.supabase.com/v1"
PROJECT_REF_RE = re.compile(r"[a-z0-9]{20}")
SECRET_KEY_RE = re.compile(r"sb_secret_[A-Za-z0-9._-]{20,}")
AUTH_ADMIN_READ_ATTEMPTS = 3
AUTH_ADMIN_RETRYABLE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
AUTH_ADMIN_RETRYABLE_STATUS_CODES = frozenset(
    {408, 425, 429, 500, 502, 503, 504}
)


class SupabaseAuthAdminError(RuntimeError):
    """A modern runner-only Auth Admin contract could not be proven."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


@dataclass(frozen=True)
class SupabaseAuthAdminAuthority:
    project_ref: str
    secret_key: str

    def __post_init__(self) -> None:
        if PROJECT_REF_RE.fullmatch(self.project_ref) is None:
            raise SupabaseAuthAdminError(
                "PROJECT_REF_INVALID", "Supabase project ref is malformed"
            )
        if SECRET_KEY_RE.fullmatch(self.secret_key) is None:
            raise SupabaseAuthAdminError(
                "AUTH_ADMIN_SECRET_INVALID",
                "Supabase Auth Admin requires one modern secret key",
            )

    @property
    def auth_admin_url(self) -> str:
        return f"https://{self.project_ref}.supabase.co/auth/v1/admin"

    @property
    def headers(self) -> dict[str, str]:
        # Modern ``sb_secret_`` keys are opaque API keys, not JWTs. Sending one
        # as a Bearer token makes Auth attempt JWT parsing and reject the call.
        return {"apikey": self.secret_key}


def _json_response(response: requests.Response, code: str) -> Any:
    try:
        return response.json() if response.content else None
    except ValueError as error:
        raise SupabaseAuthAdminError(
            code, "Supabase authority returned malformed JSON"
        ) from error


def resolve_auth_admin_authority(
    management_token: str,
    project_ref: str,
    *,
    timeout_seconds: float = 20.0,
) -> SupabaseAuthAdminAuthority:
    """Resolve exactly one reviewed ``default`` modern secret key.

    ``reveal=true`` is required: the Management API otherwise returns a
    non-usable representation for modern keys.  The revealed value is never
    returned in diagnostics or persisted by this module.
    """

    if not management_token.strip():
        raise SupabaseAuthAdminError(
            "MANAGEMENT_TOKEN_MISSING", "SUPABASE_ACCESS_TOKEN is required"
        )
    if PROJECT_REF_RE.fullmatch(project_ref) is None:
        raise SupabaseAuthAdminError(
            "PROJECT_REF_INVALID", "Supabase project ref is malformed"
        )
    try:
        response = requests.get(
            f"{MANAGEMENT_API}/projects/{project_ref}/api-keys",
            headers={"Authorization": f"Bearer {management_token}"},
            params={"reveal": "true"},
            timeout=timeout_seconds,
        )
    except requests.RequestException as error:
        raise SupabaseAuthAdminError(
            "MANAGEMENT_API_UNREACHABLE",
            "Supabase Management API request did not complete",
        ) from error
    if not response.ok:
        raise SupabaseAuthAdminError(
            "MANAGEMENT_API_REJECTED",
            f"Supabase Management API rejected API-key readback with HTTP {response.status_code}",
            status_code=response.status_code,
        )
    records = _json_response(response, "MANAGEMENT_API_RESPONSE_INVALID")
    matches = [
        record
        for record in records
        if isinstance(record, dict)
        and record.get("type") == "secret"
        and record.get("name") == "default"
        and record.get("secret_jwt_template") == {"role": "service_role"}
    ] if isinstance(records, list) else []
    if len(matches) != 1:
        raise SupabaseAuthAdminError(
            "AUTH_ADMIN_SECRET_AMBIGUOUS",
            "Expected exactly one default service-role Supabase secret key",
        )
    secret_key = matches[0].get("api_key")
    if not isinstance(secret_key, str):
        raise SupabaseAuthAdminError(
            "AUTH_ADMIN_SECRET_INVALID",
            "Supabase Auth Admin secret readback omitted its value",
        )
    return SupabaseAuthAdminAuthority(project_ref, secret_key)


def auth_admin_request(
    authority: SupabaseAuthAdminAuthority,
    method: str,
    path: str,
    *,
    payload: Mapping[str, Any] | None = None,
    params: Mapping[str, Any] | None = None,
    allow_missing: bool = False,
    timeout_seconds: float = 20.0,
) -> Any:
    """Call one Auth Admin endpoint without exposing credential or body data."""

    normalized_path = path.strip().lstrip("/")
    if not normalized_path or "?" in normalized_path or "#" in normalized_path:
        raise SupabaseAuthAdminError(
            "AUTH_ADMIN_PATH_INVALID", "Supabase Auth Admin path is malformed"
        )
    normalized_method = method.upper()
    attempts = (
        AUTH_ADMIN_READ_ATTEMPTS
        if normalized_method in AUTH_ADMIN_RETRYABLE_METHODS
        else 1
    )
    for attempt in range(1, attempts + 1):
        try:
            response = requests.request(
                normalized_method,
                f"{authority.auth_admin_url}/{normalized_path}",
                headers=authority.headers,
                json=payload,
                params=params,
                timeout=timeout_seconds,
            )
        except requests.RequestException as error:
            if attempt < attempts:
                time.sleep(2 ** (attempt - 1))
                continue
            raise SupabaseAuthAdminError(
                "AUTH_ADMIN_UNREACHABLE",
                "Supabase Auth Admin request did not complete",
            ) from error
        if allow_missing and response.status_code == 404:
            return None
        if response.ok:
            return _json_response(response, "AUTH_ADMIN_RESPONSE_INVALID")
        if (
            attempt < attempts
            and response.status_code in AUTH_ADMIN_RETRYABLE_STATUS_CODES
        ):
            time.sleep(2 ** (attempt - 1))
            continue
        raise SupabaseAuthAdminError(
            "AUTH_ADMIN_REJECTED",
            f"Supabase Auth Admin {normalized_method} failed with HTTP {response.status_code}",
            status_code=response.status_code,
        )
    raise AssertionError("unreachable Auth Admin retry state")


def mask_auth_admin_secret(authority: SupabaseAuthAdminAuthority) -> None:
    """Register the ephemeral secret with GitHub masking only inside Actions.

    GitHub consumes workflow commands before rendering logs.  Emitting the
    command in an ordinary terminal would print the credential verbatim.
    """

    if os.getenv("GITHUB_ACTIONS", "").lower() == "true":
        print(f"::add-mask::{authority.secret_key}")


__all__ = [
    "SupabaseAuthAdminAuthority",
    "SupabaseAuthAdminError",
    "auth_admin_request",
    "mask_auth_admin_secret",
    "resolve_auth_admin_authority",
]

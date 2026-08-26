from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import json
from typing import Any

import httpx
import jwt
import pytest

from app.infrastructure.evidence_storage_credentials import (
    EVIDENCE_DATABASE_ROLE,
    EVIDENCE_SERVICE_MARKER,
    EvidenceCredentialConfig,
    EvidenceCredentialUnavailable,
    EvidenceServiceTokenProvider,
)


PROJECT_REF = "canonicalcanonical12"
BASE_URL = f"https://{PROJECT_REF}.supabase.co"
PUBLISHABLE_API_KEY = "sb_publishable_" + "a" * 32
SERVICE_EMAIL = "evidence-storage@canonical.invalid"
SERVICE_PASSWORD = "evidence-password-" + "x" * 32
SERVICE_USER_ID = "c1fe54d2-a6d9-4c63-9d08-dd4b02caf630"
NOW = 1_800_000_000


def _config() -> EvidenceCredentialConfig:
    return EvidenceCredentialConfig(
        base_url=BASE_URL,
        project_ref=PROJECT_REF,
        publishable_api_key=PUBLISHABLE_API_KEY,
        service_email=SERVICE_EMAIL,
        service_password=SERVICE_PASSWORD,
        expected_user_id=SERVICE_USER_ID,
    )


def _token(**overrides: Any) -> str:
    claims: dict[str, Any] = {
        "iss": f"{BASE_URL}/auth/v1",
        "aud": "authenticated",
        "sub": SERVICE_USER_ID,
        "role": EVIDENCE_DATABASE_ROLE,
        "erp_service_identity": EVIDENCE_SERVICE_MARKER,
        "iat": NOW,
        "exp": NOW + 300,
    }
    claims.update(overrides)
    algorithm = claims.pop("test_algorithm", "HS256")
    return jwt.encode(claims, "test-signing-key", algorithm=algorithm)


def _user(**overrides: Any) -> dict[str, Any]:
    value: dict[str, Any] = {
        "id": SERVICE_USER_ID,
        "email": SERVICE_EMAIL,
        "app_metadata": {"erp_service_identity": EVIDENCE_SERVICE_MARKER},
    }
    value.update(overrides)
    return value


def _provider(
    handler,
    *,
    clock=lambda: NOW,
) -> EvidenceServiceTokenProvider:
    return EvidenceServiceTokenProvider(
        _config(), transport=httpx.MockTransport(handler), clock=clock
    )


def _set_environment(monkeypatch) -> None:
    monkeypatch.setenv("SUPABASE_ANON_KEY", PUBLISHABLE_API_KEY)
    monkeypatch.setenv("EVIDENCE_STORAGE_SERVICE_EMAIL", SERVICE_EMAIL)
    monkeypatch.setenv("EVIDENCE_STORAGE_SERVICE_PASSWORD", SERVICE_PASSWORD)
    monkeypatch.setenv("EVIDENCE_STORAGE_SERVICE_AUTH_USER_ID", SERVICE_USER_ID)
    monkeypatch.delenv("EVIDENCE_STORAGE_SERVER_API_KEY", raising=False)
    monkeypatch.delenv("EVIDENCE_STORAGE_SERVER_JWT", raising=False)


def test_password_grant_is_verified_and_returns_both_storage_headers():
    requests: list[httpx.Request] = []
    access_token = _token()

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/auth/v1/token":
            return httpx.Response(200, json={"access_token": access_token})
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json=_user())
        raise AssertionError(request.url)

    headers = _provider(handler).authorization_headers()

    assert headers == {
        "apikey": PUBLISHABLE_API_KEY,
        "Authorization": f"Bearer {access_token}",
    }
    assert requests[0].url.query == b"grant_type=password"
    assert requests[0].headers["apikey"] == PUBLISHABLE_API_KEY
    assert "authorization" not in requests[0].headers
    assert json.loads(requests[0].content) == {
        "email": SERVICE_EMAIL,
        "password": SERVICE_PASSWORD,
    }
    assert requests[1].headers["apikey"] == PUBLISHABLE_API_KEY
    assert requests[1].headers["authorization"] == f"Bearer {access_token}"


def test_token_is_cached_under_a_lock_for_concurrent_callers():
    calls = {"token": 0, "user": 0}
    access_token = _token()

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/auth/v1/token":
            calls["token"] += 1
            return httpx.Response(200, json={"access_token": access_token})
        calls["user"] += 1
        return httpx.Response(200, json=_user())

    provider = _provider(handler)
    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(lambda _: provider.access_token(), range(24)))

    assert results == [access_token] * 24
    assert calls == {"token": 1, "user": 1}


def test_token_refreshes_inside_skew_and_invalidation_is_token_specific():
    current_time = [NOW]
    grants = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal grants
        if request.url.path == "/auth/v1/token":
            grants += 1
            token = _token(iat=current_time[0], exp=current_time[0] + 120)
            return httpx.Response(200, json={"access_token": token})
        return httpx.Response(200, json=_user())

    provider = _provider(handler, clock=lambda: current_time[0])
    first = provider.access_token()
    provider.invalidate("some-other-token")
    assert provider.access_token() == first
    assert grants == 1

    current_time[0] += 61
    second = provider.access_token()
    assert second != first
    assert grants == 2

    provider.invalidate(second)
    third = provider.access_token()
    assert third == second
    assert grants == 3


@pytest.mark.parametrize(
    ("token_overrides", "user_overrides", "message"),
    [
        ({"iss": "https://wrong.supabase.co/auth/v1"}, {}, "issuer"),
        ({"aud": "anon"}, {}, "audience"),
        ({"aud": 7}, {}, "audience"),
        ({"sub": "00000000-0000-0000-0000-000000000000"}, {}, "subject"),
        ({"role": "service_role"}, {}, "role"),
        ({"erp_service_identity": "wrong"}, {}, "marker"),
        ({"iat": NOW + 31}, {}, "lifetime"),
        ({"iat": NOW - 31}, {}, "lifetime"),
        ({"exp": NOW + 901}, {}, "lifetime"),
        ({"exp": NOW + 89}, {}, "lifetime"),
        ({"test_algorithm": "HS384"}, {}, "algorithm"),
        ({}, {"id": "00000000-0000-0000-0000-000000000000"}, "user"),
        ({}, {"email": "wrong@canonical.invalid"}, "email"),
        ({}, {"app_metadata": {}}, "marker"),
    ],
)
def test_access_token_and_auth_readback_must_match_reviewed_identity(
    token_overrides, user_overrides, message
):
    access_token = _token(**token_overrides)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/auth/v1/token":
            return httpx.Response(200, json={"access_token": access_token})
        return httpx.Response(200, json=_user(**user_overrides))

    with pytest.raises(EvidenceCredentialUnavailable, match=message):
        _provider(handler).access_token()


@pytest.mark.parametrize(
    ("path", "response", "message"),
    [
        ("/auth/v1/token", httpx.Response(400, text="secret body"), "rejected"),
        ("/auth/v1/token", httpx.Response(200, text="not json"), "invalid JSON"),
        ("/auth/v1/token", httpx.Response(200, json={}), "omitted"),
        ("/auth/v1/user", httpx.Response(401, text="secret body"), "verification"),
        ("/auth/v1/user", httpx.Response(200, text="not json"), "invalid JSON"),
    ],
)
def test_credential_authority_failures_are_sanitized(path, response, message):
    access_token = _token()

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == path:
            return response
        if request.url.path == "/auth/v1/token":
            return httpx.Response(200, json={"access_token": access_token})
        return httpx.Response(200, json=_user())

    with pytest.raises(EvidenceCredentialUnavailable, match=message) as failure:
        _provider(handler).access_token()
    assert "secret body" not in str(failure.value)
    assert SERVICE_PASSWORD not in str(failure.value)
    assert access_token not in str(failure.value)


def test_network_failure_is_sanitized():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("contains-sensitive-host-detail", request=request)

    with pytest.raises(EvidenceCredentialUnavailable, match="could not be reached") as failure:
        _provider(handler).access_token()
    assert "sensitive" not in str(failure.value)


@pytest.mark.parametrize(
    ("missing_name", "message"),
    [
        ("SUPABASE_ANON_KEY", "publishable"),
        ("EVIDENCE_STORAGE_SERVICE_EMAIL", "email"),
        ("EVIDENCE_STORAGE_SERVICE_PASSWORD", "32 bytes"),
        ("EVIDENCE_STORAGE_SERVICE_AUTH_USER_ID", "UUID"),
    ],
)
def test_environment_requires_the_complete_service_identity(
    monkeypatch, missing_name, message
):
    _set_environment(monkeypatch)
    monkeypatch.delenv(missing_name, raising=False)
    with pytest.raises(EvidenceCredentialUnavailable, match=message):
        EvidenceCredentialConfig.from_environment(
            base_url=BASE_URL,
            project_ref=PROJECT_REF,
        )


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("publishable_api_key", "sb_secret_do-not-use", "publishable"),
        ("service_email", "bad address", "email"),
        ("service_password", "short", "32 bytes"),
        ("expected_user_id", "not-a-uuid", "UUID"),
        ("project_ref", "wrong", "reviewed Supabase project"),
        ("base_url", "http://canonicalcanonical12.supabase.co", "reviewed Supabase project"),
    ],
)
def test_configuration_rejects_unreviewed_values(field, value, message):
    values = {
        "base_url": BASE_URL,
        "project_ref": PROJECT_REF,
        "publishable_api_key": PUBLISHABLE_API_KEY,
        "service_email": SERVICE_EMAIL,
        "service_password": SERVICE_PASSWORD,
        "expected_user_id": SERVICE_USER_ID,
    }
    values[field] = value
    with pytest.raises(EvidenceCredentialUnavailable, match=message):
        EvidenceCredentialConfig(**values)


def test_configuration_accepts_only_anon_legacy_jwt_api_keys():
    anon_key = jwt.encode(
        {"iss": "supabase", "role": "anon"},
        "legacy-project-secret",
        algorithm="HS256",
    )
    config = EvidenceCredentialConfig(
        base_url=BASE_URL,
        project_ref=PROJECT_REF,
        publishable_api_key=anon_key,
        service_email=SERVICE_EMAIL,
        service_password=SERVICE_PASSWORD,
        expected_user_id=SERVICE_USER_ID,
    )
    assert config.publishable_api_key == anon_key

    privileged_key = jwt.encode(
        {"iss": "supabase", "role": "service_role"},
        "legacy-project-secret",
        algorithm="HS256",
    )
    with pytest.raises(EvidenceCredentialUnavailable, match="privileged"):
        EvidenceCredentialConfig(
            base_url=BASE_URL,
            project_ref=PROJECT_REF,
            publishable_api_key=privileged_key,
            service_email=SERVICE_EMAIL,
            service_password=SERVICE_PASSWORD,
            expected_user_id=SERVICE_USER_ID,
        )


@pytest.mark.parametrize(
    "base_url",
    [
        f"https://{PROJECT_REF}.supabase.co:444",
        f"https://user@{PROJECT_REF}.supabase.co",
        f"https://{PROJECT_REF}.supabase.co?redirect=evil",
        f"https://{PROJECT_REF}.supabase.co#fragment",
    ],
)
def test_configuration_requires_the_exact_origin_without_url_extensions(base_url):
    with pytest.raises(EvidenceCredentialUnavailable, match="exact reviewed"):
        EvidenceCredentialConfig(
            base_url=base_url,
            project_ref=PROJECT_REF,
            publishable_api_key=PUBLISHABLE_API_KEY,
            service_email=SERVICE_EMAIL,
            service_password=SERVICE_PASSWORD,
            expected_user_id=SERVICE_USER_ID,
        )


def test_configuration_and_cache_repr_do_not_expose_the_password_or_token():
    config = _config()
    assert SERVICE_PASSWORD not in repr(config)

    access_token = _token()

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/auth/v1/token":
            return httpx.Response(200, json={"access_token": access_token})
        return httpx.Response(200, json=_user())

    provider = _provider(handler)
    assert provider.access_token() == access_token
    assert access_token not in repr(provider._cached)

from __future__ import annotations

import json
from uuid import UUID

import pytest
import requests

from scripts import supabase_auth_admin as auth_admin
from scripts import verify_supabase_auth_admin_secret as preflight


PROJECT_REF = "rgihahbmkrmhitjdjvev"
SECRET = "sb_secret_" + "x" * 32


class _Response:
    def __init__(self, status_code: int, payload: object) -> None:
        self.status_code = status_code
        self._payload = payload
        self.content = json.dumps(payload).encode("utf-8")

    @property
    def ok(self) -> bool:
        return 200 <= self.status_code < 300

    def json(self) -> object:
        return self._payload


def _record(**overrides: object) -> dict[str, object]:
    record: dict[str, object] = {
        "type": "secret",
        "name": "default",
        "secret_jwt_template": {"role": "service_role"},
        "api_key": SECRET,
    }
    record.update(overrides)
    return record


def test_resolves_only_exact_default_service_role_modern_secret(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_get(url: str, **kwargs: object) -> _Response:
        captured.update({"url": url, **kwargs})
        return _Response(
            200,
            [
                {"type": "legacy", "name": "service_role", "api_key": "jwt"},
                _record(),
                _record(name="another-runner"),
            ],
        )

    monkeypatch.setattr(auth_admin.requests, "get", fake_get)

    authority = auth_admin.resolve_auth_admin_authority(
        "management-token", PROJECT_REF
    )

    assert authority.secret_key == SECRET
    assert captured["params"] == {"reveal": "true"}
    assert captured["headers"] == {"Authorization": "Bearer management-token"}
    assert str(captured["url"]).endswith(f"/projects/{PROJECT_REF}/api-keys")


@pytest.mark.parametrize(
    "records",
    [
        [],
        [_record(), _record(api_key="sb_secret_" + "y" * 32)],
        [_record(type="legacy")],
        [_record(name="runner")],
        [_record(secret_jwt_template={"role": "authenticated"})],
        [_record(secret_jwt_template={"role": "service_role", "extra": True})],
    ],
)
def test_rejects_missing_ambiguous_or_nonexact_secret(monkeypatch, records) -> None:
    monkeypatch.setattr(
        auth_admin.requests, "get", lambda *_args, **_kwargs: _Response(200, records)
    )

    with pytest.raises(
        auth_admin.SupabaseAuthAdminError,
        match="exactly one default service-role",
    ):
        auth_admin.resolve_auth_admin_authority("management-token", PROJECT_REF)


def test_admin_request_uses_apikey_and_bearer_without_leaking_failure_body(
    monkeypatch,
) -> None:
    authority = auth_admin.SupabaseAuthAdminAuthority(PROJECT_REF, SECRET)
    captured: dict[str, object] = {}

    def fake_request(method: str, url: str, **kwargs: object) -> _Response:
        captured.update({"method": method, "url": url, **kwargs})
        return _Response(403, {"message": f"provider-body-{SECRET}"})

    monkeypatch.setattr(auth_admin.requests, "request", fake_request)

    with pytest.raises(auth_admin.SupabaseAuthAdminError) as caught:
        auth_admin.auth_admin_request(authority, "GET", "users")

    assert captured["headers"] == {
        "apikey": SECRET,
        "Authorization": f"Bearer {SECRET}",
    }
    assert captured["url"] == f"https://{PROJECT_REF}.supabase.co/auth/v1/admin/users"
    assert str(caught.value) == "Supabase Auth Admin GET failed with HTTP 403"
    assert SECRET not in str(caught.value)
    assert "provider-body" not in str(caught.value)


def test_admin_request_rejects_query_in_path_before_network(monkeypatch) -> None:
    authority = auth_admin.SupabaseAuthAdminAuthority(PROJECT_REF, SECRET)
    monkeypatch.setattr(
        auth_admin.requests,
        "request",
        lambda *_args, **_kwargs: pytest.fail("malformed path reached network"),
    )

    with pytest.raises(auth_admin.SupabaseAuthAdminError, match="path is malformed"):
        auth_admin.auth_admin_request(authority, "GET", "users?page=1")


def test_read_only_preflight_lists_then_reads_one_user(monkeypatch, capsys) -> None:
    authority = auth_admin.SupabaseAuthAdminAuthority(PROJECT_REF, SECRET)
    user_id = str(UUID("d4000000-0000-7000-8000-000000000001"))
    calls: list[tuple[str, str, object]] = []
    monkeypatch.setattr(
        preflight,
        "resolve_auth_admin_authority",
        lambda management_token, project_ref: authority,
    )
    monkeypatch.setenv("GITHUB_ACTIONS", "true")

    def fake_request(resolved, method, path, **kwargs):
        assert resolved == authority
        calls.append((method, path, kwargs.get("params")))
        if path == "users":
            return {"users": [{"id": user_id}]}
        return {"id": user_id, "email": "must-not-be-emitted@example.invalid"}

    monkeypatch.setattr(preflight, "auth_admin_request", fake_request)

    result = preflight.verify(PROJECT_REF, "management-token")

    assert calls == [
        ("GET", "users", {"page": 1, "per_page": 1}),
        ("GET", f"users/{user_id}", None),
    ]
    assert result == {
        "state": "verified",
        "project_ref": PROJECT_REF,
        "modern_secret_shape_verified": True,
        "list_verified": True,
        "readback_verified": True,
        "mutation_performed": False,
    }
    assert capsys.readouterr().out == f"::add-mask::{SECRET}\n"


def test_local_preflight_never_prints_the_resolved_secret(monkeypatch, capsys) -> None:
    authority = auth_admin.SupabaseAuthAdminAuthority(PROJECT_REF, SECRET)
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)

    auth_admin.mask_auth_admin_secret(authority)

    assert capsys.readouterr().out == ""


def test_management_and_admin_transport_errors_are_sanitized(monkeypatch) -> None:
    monkeypatch.setattr(
        auth_admin.requests,
        "get",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            requests.ConnectionError(f"transport-secret-{SECRET}")
        ),
    )

    with pytest.raises(auth_admin.SupabaseAuthAdminError) as caught:
        auth_admin.resolve_auth_admin_authority("management-token", PROJECT_REF)

    assert str(caught.value) == "Supabase Management API request did not complete"
    assert SECRET not in str(caught.value)

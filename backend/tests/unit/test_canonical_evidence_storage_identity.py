from __future__ import annotations

import base64
import importlib.util
import json
import sys
from pathlib import Path

import pytest
import requests


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend/scripts/provision_canonical_evidence_storage_identity.py"
SPEC = importlib.util.spec_from_file_location(
    "provision_canonical_evidence_storage_identity", SCRIPT
)
provision = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = provision
SPEC.loader.exec_module(provision)


def user(**overrides):
    value = {
        "id": provision.SERVICE_AUTH_USER_ID,
        "email": provision.SERVICE_EMAIL,
        "role": "authenticated",
        "email_confirmed_at": "2026-08-26T00:00:00Z",
        "app_metadata": {
            "erp_service_identity": provision.SERVICE_MARKER,
            "erp_service_role": provision.SERVICE_ROLE,
        },
    }
    value.update(overrides)
    return value


AUTHORITY = provision.SupabaseAuthAdminAuthority(
    provision.PROJECT_REF, "sb_secret_" + "a" * 32
)


class AuthAdminStub:
    def __init__(self, users, response=None):
        self.users = users
        self.response = response or user()
        self.calls = []

    def request(self, authority, method, path, **kwargs):
        assert authority == AUTHORITY
        self.calls.append((method, path, kwargs))
        if method == "GET":
            return {"users": self.users}
        return self.response


def test_service_identity_creation_uses_exact_uuid_email_marker_and_role(
    monkeypatch,
) -> None:
    stub = AuthAdminStub([])
    monkeypatch.setattr(provision, "auth_admin_request", stub.request)

    resolved, created = provision.reconcile_service_user(AUTHORITY, "random-password")

    assert resolved == user()
    assert created is True
    method, path, kwargs = stub.calls[-1]
    assert (method, path) == ("POST", "users")
    payload = kwargs["payload"]
    assert payload == {
        "id": provision.SERVICE_AUTH_USER_ID,
        "aud": "authenticated",
        "role": "authenticated",
        "email": provision.SERVICE_EMAIL,
        "password": "random-password",
        "email_confirm": True,
        "app_metadata": {
            "erp_service_identity": provision.SERVICE_MARKER,
            "erp_service_role": provision.SERVICE_ROLE,
        },
        "user_metadata": {},
    }


def test_platform_identity_constants_come_from_versioned_authority() -> None:
    authority = json.loads(
        provision.IDENTITY_AUTHORITY_PATH.read_text(encoding="utf-8")
    )

    assert authority == provision.IDENTITY_AUTHORITY
    assert authority["scope"] == "canonical_platform"
    assert authority["auth_user_id"] == provision.SERVICE_AUTH_USER_ID
    assert authority["email"] == provision.SERVICE_EMAIL
    assert authority["app_metadata_marker"] == provision.SERVICE_MARKER
    assert authority["database_role"] == provision.SERVICE_ROLE
    assert authority["max_access_token_seconds"] == 900


def test_existing_exact_identity_rotates_password_in_place(monkeypatch) -> None:
    stub = AuthAdminStub([user()])
    monkeypatch.setattr(provision, "auth_admin_request", stub.request)

    _, created = provision.reconcile_service_user(AUTHORITY, "new-random-password")

    assert created is False
    assert stub.calls[-1][0:2] == (
        "PUT", f"users/{provision.SERVICE_AUTH_USER_ID}"
    )
    assert stub.calls[-1][2]["payload"] == {
        "password": "new-random-password",
        "app_metadata": {
            "erp_service_identity": provision.SERVICE_MARKER,
            "erp_service_role": provision.SERVICE_ROLE,
        },
    }


@pytest.mark.parametrize(
    "users",
    [
        [user(id="00000000-0000-4000-8000-000000000001")],
        [
            user(),
            user(
                id="00000000-0000-4000-8000-000000000002",
                email="other@example.invalid",
            ),
        ],
    ],
)
def test_collision_or_duplicate_service_identity_fails_closed(
    monkeypatch, users
) -> None:
    stub = AuthAdminStub(users)
    monkeypatch.setattr(provision, "auth_admin_request", stub.request)
    with pytest.raises(provision.IdentityProvisioningError):
        provision.reconcile_service_user(AUTHORITY, "password")


class ManagementClient:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def management(self, method, path, **kwargs):
        self.calls.append((method, path, kwargs))
        return self.responses.pop(0)


def test_auth_hook_configuration_is_enabled_without_overwriting_other_fields() -> None:
    client = ManagementClient(
        [
            {"site_url": "https://erp.example", "hook_custom_access_token_enabled": False},
            {
                "site_url": "https://erp.example",
                "hook_custom_access_token_enabled": True,
                "hook_custom_access_token_uri": provision.HOOK_URI,
            },
            {
                "site_url": "https://erp.example",
                "hook_custom_access_token_enabled": True,
                "hook_custom_access_token_uri": provision.HOOK_URI,
            },
        ]
    )

    assert provision.reconcile_hook_config(client) == {
        "hook_custom_access_token_enabled": True,
        "hook_custom_access_token_uri": provision.HOOK_URI,
    }
    assert client.calls[1][2]["payload"] == {
        "hook_custom_access_token_enabled": True,
        "hook_custom_access_token_uri": provision.HOOK_URI,
    }
    assert client.calls[2][0:2] == (
        "GET", f"/projects/{provision.PROJECT_REF}/config/auth"
    )


class SessionClient:
    def __init__(self, claims):
        encoded = base64.urlsafe_b64encode(
            json.dumps(claims).encode("utf-8")
        ).decode("ascii").rstrip("=")
        self.session = {"access_token": f"header.{encoded}.signature"}

    def password_session(self, _anon_key, email, password):
        assert email == provision.SERVICE_EMAIL
        assert password == "rotated-password"
        return self.session

    def auth_user(self, _anon_key, token):
        assert token == self.session["access_token"]
        return user()


def service_claims(**overrides):
    value = {
        "sub": provision.SERVICE_AUTH_USER_ID,
        "email": provision.SERVICE_EMAIL,
        "role": provision.SERVICE_ROLE,
        "iss": f"{provision.SUPABASE_URL}/auth/v1",
        "aud": "authenticated",
        "iat": 1_000,
        "exp": 1_900,
        "erp_service_identity": provision.SERVICE_MARKER,
        "app_metadata": {
            "erp_service_identity": provision.SERVICE_MARKER,
            "erp_service_role": provision.SERVICE_ROLE,
        },
    }
    value.update(overrides)
    return value


def test_password_session_must_return_exact_hook_role_claims() -> None:
    claims = provision.verify_password_session(
        SessionClient(service_claims()), "anon-key", "rotated-password"
    )
    assert claims["role"] == provision.SERVICE_ROLE


@pytest.mark.parametrize(
    "claims",
    [
        service_claims(role="authenticated"),
        service_claims(sub="00000000-0000-4000-8000-000000000001"),
        service_claims(app_metadata={}),
        service_claims(erp_service_identity="wrong-service"),
        service_claims(exp=4_600),
        service_claims(iss="https://wrong.example/auth/v1"),
        service_claims(aud="anon"),
    ],
)
def test_password_session_rejects_missing_or_broadened_hook_claims(claims) -> None:
    with pytest.raises(
        provision.IdentityProvisioningError,
        match="service token claim contract drifted",
    ):
        provision.verify_password_session(
            SessionClient(claims), "anon-key", "rotated-password"
        )


def test_retired_custom_secret_key_is_removed_only_after_exact_shape() -> None:
    client = ManagementClient(
        [[{
            "id": "retired-key-id",
            "name": provision.RETIRED_KEY_NAME,
            "type": "secret",
            "secret_jwt_template": {"role": provision.SERVICE_ROLE},
        }], None]
    )

    assert provision.retire_custom_api_key(client) == "retired-key-id"
    assert client.calls[-1][0:2] == (
        "DELETE", f"/projects/{provision.PROJECT_REF}/api-keys/retired-key-id"
    )


def test_run_environment_contains_identity_password_but_no_legacy_api_key(tmp_path) -> None:
    environment = tmp_path / "github-env"
    environment.touch(mode=0o600)

    provision._append_environment(environment, "rotated-password")

    values = environment.read_text(encoding="utf-8")
    assert "EVIDENCE_STORAGE_SERVICE_AUTH_USER_ID=" in values
    assert "EVIDENCE_STORAGE_SERVICE_EMAIL=" in values
    assert "EVIDENCE_STORAGE_SERVICE_PASSWORD=rotated-password" in values
    assert "EVIDENCE_STORAGE_SERVER_API_KEY" not in values


def test_blocked_main_writes_only_a_non_secret_error_code(tmp_path, monkeypatch) -> None:
    receipt = tmp_path / "blocked.json"
    environment = tmp_path / "github-env"
    environment.touch(mode=0o600)
    monkeypatch.setenv("SUPABASE_URL", provision.SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-key")
    monkeypatch.delenv("SUPABASE_ACCESS_TOKEN", raising=False)

    result = provision.main([
        "--project-ref", provision.PROJECT_REF,
        "--reviewed-sha", "a" * 40,
        "--github-env", str(environment),
        "--receipt", str(receipt),
    ])

    assert result == 2
    assert json.loads(receipt.read_text(encoding="utf-8")) == {
        "version": 1,
        "state": "blocked",
        "error_code": "MANAGEMENT_TOKEN_MISSING",
        "project_ref": provision.PROJECT_REF,
        "reviewed_sha": "a" * 40,
        "service_auth_user_id": provision.SERVICE_AUTH_USER_ID,
        "service_email": provision.SERVICE_EMAIL,
        "service_marker": provision.SERVICE_MARKER,
        "database_role": provision.SERVICE_ROLE,
        "hook_uri": provision.HOOK_URI,
        "verified_at": json.loads(receipt.read_text(encoding="utf-8"))["verified_at"],
    }
    assert environment.read_text(encoding="utf-8") == ""


def test_missing_anon_key_fails_before_any_hosted_api_call(
    tmp_path, monkeypatch
) -> None:
    receipt = tmp_path / "blocked.json"
    environment = tmp_path / "github-env"
    environment.touch(mode=0o600)
    monkeypatch.setenv("SUPABASE_URL", provision.SUPABASE_URL)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)
    monkeypatch.setenv("SUPABASE_ACCESS_TOKEN", "must-not-be-used")

    result = provision.main([
        "--project-ref", provision.PROJECT_REF,
        "--reviewed-sha", "a" * 40,
        "--github-env", str(environment),
        "--receipt", str(receipt),
    ])

    assert result == 2
    assert json.loads(receipt.read_text(encoding="utf-8"))["error_code"] == (
        "ANON_KEY_MISSING"
    )
    assert environment.read_text(encoding="utf-8") == ""


def test_management_network_failure_becomes_a_typed_non_secret_error(
    monkeypatch,
) -> None:
    def fail_request(*_args, **_kwargs):
        raise requests.Timeout("Bearer must-not-escape")

    monkeypatch.setattr(provision.requests, "request", fail_request)
    with pytest.raises(provision.IdentityProvisioningError) as captured:
        provision.Client("runner-token").management("GET", "/projects/test")

    assert captured.value.code == "MANAGEMENT_API_UNREACHABLE"
    assert "must-not-escape" not in str(captured.value)

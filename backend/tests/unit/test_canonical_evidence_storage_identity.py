from __future__ import annotations

import base64
import importlib.util
import json
import sys
from pathlib import Path

import pytest
import psycopg2
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


def auth_authority():
    return provision.SupabaseAuthAdminAuthority(
        provision.PROJECT_REF, "sb_secret_" + "a" * 32
    )


def reviewed_database_url():
    return (
        f"postgresql://postgres.{provision.PROJECT_REF}:password@"
        f"{provision.REVIEWED_POOLER_HOST}:5432/postgres?sslmode=require"
    )


class AuthClient:
    def __init__(self, monkeypatch, users, response=None):
        self.users = users
        self.response = response or user()
        self.calls = []
        monkeypatch.setattr(provision, "_auth_admin_json", self.request)

    def request(self, _authority, method, path, **kwargs):
        self.calls.append((method, path, kwargs))
        if method == "GET":
            return {"users": self.users}
        return self.response


def test_service_identity_creation_uses_exact_uuid_email_marker_and_role(
    monkeypatch,
) -> None:
    client = AuthClient(monkeypatch, [])

    resolved, created = provision.reconcile_service_user(
        auth_authority(), "random-password"
    )

    assert resolved == user()
    assert created is True
    method, path, kwargs = client.calls[-1]
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
    client = AuthClient(monkeypatch, [user()])

    _, created = provision.reconcile_service_user(
        auth_authority(), "new-random-password"
    )

    assert created is False
    assert client.calls[-1][0:2] == (
        "PUT", f"users/{provision.SERVICE_AUTH_USER_ID}"
    )
    assert client.calls[-1][2]["payload"] == {
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
    users, monkeypatch
) -> None:
    AuthClient(monkeypatch, users)
    with pytest.raises(provision.IdentityProvisioningError):
        provision.reconcile_service_user(
            auth_authority(), "password"
        )


class ManagementClient:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def management(self, method, path, **kwargs):
        self.calls.append((method, path, kwargs))
        return self.responses.pop(0)


def auth_config(**overrides):
    value = {
        "security_captcha_enabled": False,
        "external_email_enabled": True,
        "jwt_exp": 3600,
        "rate_limit_token_refresh": 150,
        "refresh_token_rotation_enabled": True,
        "security_refresh_token_reuse_interval": 10,
        "hook_custom_access_token_enabled": False,
        "hook_custom_access_token_uri": None,
    }
    value.update(overrides)
    return value

def test_auth_hook_configuration_is_enabled_without_overwriting_other_fields() -> None:
    client = ManagementClient(
        [
            auth_config(),
            None,
            auth_config(
                hook_custom_access_token_enabled=True,
                hook_custom_access_token_uri=provision.HOOK_URI,
            ),
        ]
    )

    rollout = provision.reconcile_hook_config(client)
    assert rollout.expected == {
        "hook_custom_access_token_enabled": True,
        "hook_custom_access_token_uri": provision.HOOK_URI,
    }
    assert rollout.prior == {
        "hook_custom_access_token_enabled": False,
        "hook_custom_access_token_uri": None,
    }
    assert rollout.changed is True
    assert rollout.hosted_auth_facts["jwt_exp"] == 3600
    assert client.calls[1][2]["payload"] == {
        "hook_custom_access_token_enabled": True,
        "hook_custom_access_token_uri": provision.HOOK_URI,
    }
    assert client.calls[2][0:2] == (
        "GET", f"/projects/{provision.PROJECT_REF}/config/auth"
    )


@pytest.mark.parametrize(
    ("override", "error_code"),
    [
        ({"security_captcha_enabled": True}, "SERVICE_PASSWORD_CAPTCHA_UNSUPPORTED"),
        ({"external_email_enabled": False}, "SERVICE_PASSWORD_PROVIDER_DISABLED"),
        ({"jwt_exp": 899}, "AUTH_JWT_LIFETIME_INVALID"),
        ({"rate_limit_token_refresh": 0}, "AUTH_REFRESH_RATE_LIMIT_INVALID"),
        ({"refresh_token_rotation_enabled": False}, "AUTH_REFRESH_ROTATION_DISABLED"),
        ({"security_refresh_token_reuse_interval": -1}, "AUTH_REFRESH_REUSE_INVALID"),
    ],
)
def test_hosted_auth_invariants_fail_before_global_hook_patch(
    override, error_code
) -> None:
    client = ManagementClient([auth_config(**override)])

    with pytest.raises(provision.IdentityProvisioningError) as caught:
        provision.reconcile_hook_config(client)

    assert caught.value.code == error_code
    assert [call[0] for call in client.calls] == ["GET"]


def test_failed_hook_readback_restores_exact_prior_fields() -> None:
    prior = auth_config(
        hook_custom_access_token_enabled=False,
        hook_custom_access_token_uri=None,
    )
    client = ManagementClient([prior, None, auth_config(), None, prior])

    with pytest.raises(provision.IdentityProvisioningError):
        provision.reconcile_hook_config(client)

    assert client.calls[-2][0] == "PATCH"
    assert client.calls[-2][2]["payload"] == {
        "hook_custom_access_token_enabled": False,
        "hook_custom_access_token_uri": None,
    }


def test_any_post_patch_failure_restores_exact_prior_hook_fields() -> None:
    prior = {
        "hook_custom_access_token_enabled": False,
        "hook_custom_access_token_uri": None,
    }
    client = ManagementClient([None, auth_config()])
    rollout = provision.HookRollout(
        prior=prior,
        expected={
            "hook_custom_access_token_enabled": True,
            "hook_custom_access_token_uri": provision.HOOK_URI,
        },
        hosted_auth_facts={},
        changed=True,
    )

    with pytest.raises(RuntimeError, match="downstream failed"):
        with provision._restore_hook_on_failure(client, rollout):
            raise RuntimeError("downstream failed")

    assert client.calls == [
        (
            "PATCH",
            f"/projects/{provision.PROJECT_REF}/config/auth",
            {"payload": prior},
        ),
        ("GET", f"/projects/{provision.PROJECT_REF}/config/auth", {}),
    ]


class _DeniedSpoof(psycopg2.Error):
    @property
    def pgcode(self):
        return "42501"


class HookProbeCursor:
    def __init__(self):
        self.row = None
        self.methods = []
        self.ordinary_verified = False
        self.spoof_denials = 0

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, statement, parameters=None):
        if statement.startswith("SELECT procedure.prosecdef"):
            self.row = (False, "s", True, True, False, True)
            return
        if statement.startswith(("SET LOCAL", "SAVEPOINT", "ROLLBACK", "RELEASE")):
            return
        event = parameters[0].adapted
        if statement.endswith("->'claims'"):
            if event["authentication_method"] in ("password", "token_refresh"):
                self.methods.append(event["authentication_method"])
                claims = dict(event["claims"])
                claims["role"] = provision.SERVICE_ROLE
                claims["exp"] = claims["iat"] + 900
                claims["erp_service_identity"] = provision.SERVICE_MARKER
                self.row = (claims,)
            else:
                self.ordinary_verified = True
                self.row = (event["claims"],)
            return
        self.spoof_denials += 1
        raise _DeniedSpoof("spoof denied")

    def fetchone(self):
        return self.row


class HookProbeConnection:
    def __init__(self):
        self.cursor_instance = HookProbeCursor()
        self.session = None
        self.rolled_back = False

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def set_session(self, **kwargs):
        self.session = kwargs

    def cursor(self):
        return self.cursor_instance

    def rollback(self):
        self.rolled_back = True


def test_hosted_read_only_probe_covers_acl_both_methods_ordinary_and_spoofs(
    monkeypatch,
) -> None:
    connection = HookProbeConnection()
    monkeypatch.setattr(provision.psycopg2, "connect", lambda _url: connection)

    result = provision.probe_hosted_hook(reviewed_database_url())

    assert connection.session == {"readonly": True, "autocommit": False}
    assert connection.rolled_back is True
    assert connection.cursor_instance.methods == ["password", "token_refresh"]
    assert connection.cursor_instance.ordinary_verified is True
    assert connection.cursor_instance.spoof_denials == 2
    assert result == {
        "acl_verified": True,
        "ordinary_claims_unchanged": True,
        "service_methods_verified": ["password", "token_refresh"],
        "spoof_denials_verified": 2,
        "mutation_performed": False,
    }


def test_hosted_probe_rejects_changed_ordinary_claims(monkeypatch) -> None:
    connection = HookProbeConnection()
    original_execute = connection.cursor_instance.execute

    def changed_ordinary(statement, parameters=None):
        original_execute(statement, parameters)
        if (
            parameters
            and hasattr(parameters[0], "adapted")
            and parameters[0].adapted["authentication_method"] == "oauth"
        ):
            connection.cursor_instance.row = ({"role": "changed"},)

    connection.cursor_instance.execute = changed_ordinary
    monkeypatch.setattr(provision.psycopg2, "connect", lambda _url: connection)

    with pytest.raises(provision.IdentityProvisioningError) as caught:
        provision.probe_hosted_hook(reviewed_database_url())

    assert caught.value.code == "AUTH_HOOK_ORDINARY_PROBE_INVALID"


def test_hosted_probe_rejects_wrong_database_before_connect(monkeypatch) -> None:
    monkeypatch.setattr(
        provision.psycopg2,
        "connect",
        lambda _url: pytest.fail("wrong database target reached PostgreSQL"),
    )

    with pytest.raises(provision.IdentityProvisioningError) as caught:
        provision.probe_hosted_hook(
            "postgresql://postgres.other:password@localhost:5432/postgres"
            "?sslmode=require"
        )

    assert caught.value.code == "HOSTED_HOOK_DATABASE_TARGET_DENIED"


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


def test_prepare_retains_custom_secret_key_after_validating_exact_shape() -> None:
    client = ManagementClient(
        [[{
            "id": "retired-key-id",
            "name": provision.RETIRED_KEY_NAME,
            "type": "secret",
            "secret_jwt_template": {"role": provision.SERVICE_ROLE},
        }]]
    )

    assert provision.inspect_retired_custom_api_key(client) == "retired-key-id"
    assert all(call[0] == "GET" for call in client.calls)


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
    monkeypatch.delenv("GITHUB_RUN_ID", raising=False)
    monkeypatch.delenv("GITHUB_RUN_ATTEMPT", raising=False)

    result = provision.main([
        "--phase", "prepare",
        "--project-ref", provision.PROJECT_REF,
        "--reviewed-sha", "a" * 40,
        "--github-env", str(environment),
        "--receipt", str(receipt),
    ])

    assert result == 2
    assert json.loads(receipt.read_text(encoding="utf-8")) == {
        "version": 1,
        "phase": "prepare",
        "state": "blocked",
        "error_code": "MANAGEMENT_TOKEN_MISSING",
        "project_ref": provision.PROJECT_REF,
        "reviewed_sha": "a" * 40,
        "run": {"id": "local", "attempt": "local"},
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
        "--phase", "prepare",
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


def test_main_runs_hosted_read_only_probe_before_global_hook_patch(
    tmp_path, monkeypatch
) -> None:
    receipt = tmp_path / "ready.json"
    environment = tmp_path / "github-env"
    environment.touch(mode=0o600)
    monkeypatch.setenv("SUPABASE_URL", provision.SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-key")
    monkeypatch.setenv("SUPABASE_ACCESS_TOKEN", "management-token")
    monkeypatch.setenv("PSYCOPG_DATABASE_URL", reviewed_database_url())
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    authority = auth_authority()
    calls = []
    monkeypatch.setattr(
        provision, "_auth_admin_authority", lambda _token: authority
    )
    monkeypatch.setattr(
        provision, "mask_auth_admin_secret", lambda _authority: None
    )
    monkeypatch.setattr(
        provision,
        "reconcile_service_user",
        lambda _authority, _password: (user(), False),
    )
    monkeypatch.setattr(
        provision,
        "probe_hosted_hook",
        lambda _url: calls.append("hosted-read-only-probe") or {
            "mutation_performed": False
        },
    )
    rollout = provision.HookRollout(
        prior={
            "hook_custom_access_token_enabled": True,
            "hook_custom_access_token_uri": provision.HOOK_URI,
        },
        expected={
            "hook_custom_access_token_enabled": True,
            "hook_custom_access_token_uri": provision.HOOK_URI,
        },
        hosted_auth_facts={},
        changed=False,
    )
    monkeypatch.setattr(
        provision,
        "reconcile_hook_config",
        lambda _client: calls.append("global-hook-config") or rollout,
    )
    monkeypatch.setattr(
        provision, "verify_password_session", lambda *_args: service_claims()
    )
    monkeypatch.setattr(
        provision, "inspect_retired_custom_api_key", lambda _client: None
    )

    assert provision.main(
        [
            "--phase",
            "prepare",
            "--project-ref",
            provision.PROJECT_REF,
            "--reviewed-sha",
            "a" * 40,
            "--github-env",
            str(environment),
            "--receipt",
            str(receipt),
        ]
    ) == 0
    assert calls == ["hosted-read-only-probe", "global-hook-config"]
    assert json.loads(receipt.read_text(encoding="utf-8"))["state"] == "prepared"

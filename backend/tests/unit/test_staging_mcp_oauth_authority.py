import json
from pathlib import Path

import pytest

from scripts import provision_staging_mcp_oauth as provision


def test_client_authority_only_does_not_create_identity_or_bind_database(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    github_env = tmp_path / "github-env"
    evidence_dir = tmp_path / "evidence"
    monkeypatch.setenv("CANONICAL_STAGING_PROJECT_REF", provision.PROJECT_REF)
    monkeypatch.setenv("SUPABASE_URL", provision.SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_ACCESS_TOKEN", "management-token")
    monkeypatch.setenv("REVIEWED_SHA", "a" * 40)
    monkeypatch.setenv("GITHUB_ENV", str(github_env))
    monkeypatch.setenv("CANONICAL_DEMO_EVIDENCE_DIR", str(evidence_dir))
    monkeypatch.delenv("PSYCOPG_DATABASE_URL", raising=False)
    monkeypatch.delenv(provision.WEB_TEST_AUTH_USER_ENV, raising=False)
    monkeypatch.setattr(provision, "_service_role_key", lambda _token: "service-key")
    monkeypatch.setattr(
        provision,
        "_reconcile_client",
        lambda _key: {"client_id": "reviewed-public-client"},
    )
    monkeypatch.setattr(
        provision,
        "_reconcile_test_user",
        lambda *_args: pytest.fail("authority-only mode created an Auth identity"),
    )
    monkeypatch.setattr(
        provision,
        "_bind_demo",
        lambda *_args: pytest.fail("authority-only mode touched the database"),
    )
    monkeypatch.setattr(
        provision.secrets,
        "token_urlsafe",
        lambda *_args: pytest.fail("authority-only mode generated a test password"),
    )

    assert provision.main(["--mode", "client-authority-only"]) == 0
    assert github_env.read_text(encoding="utf-8") == (
        "MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS=reviewed-public-client\n"
    )
    evidence = json.loads(
        (evidence_dir / "canonical-staging-oauth-client.json").read_text(
            encoding="utf-8"
        )
    )
    assert evidence == {
        "client_id": "reviewed-public-client",
        "client_name": provision.CLIENT_NAME,
        "client_type": "public",
        "demo_grant_bound": False,
        "dynamic_client_registration": False,
        "project_ref": provision.PROJECT_REF,
        "provisioning_mode": "client-authority-only",
        "redirect_uris": list(provision.REDIRECT_URIS),
        "reviewed_sha": "a" * 40,
        "token_endpoint_auth_method": "none",
        "test_identity_reconciled": False,
        "web_test_grant_bound": False,
    }


@pytest.mark.parametrize(
    "client_id",
    [
        "",
        provision.UNISSUED_CLIENT_ID,
        "client-one,client-two",
        "client id",
        " padded-client",
        "padded-client ",
        "x" * 256,
        "client\nsecond-line",
    ],
)
def test_client_authority_rejects_unreviewed_or_ambiguous_ids(client_id: str) -> None:
    with pytest.raises(provision.ProvisioningError, match="one reviewed client ID"):
        provision._reviewed_client_id({"client_id": client_id})


def test_github_env_rejects_newline_injection(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("GITHUB_ENV", str(tmp_path / "github-env"))
    with pytest.raises(provision.ProvisioningError, match="contains a newline"):
        provision._write_github_env({"REVIEWED_CLIENT": "one\nSECOND=value"})


def test_github_env_validation_is_atomic(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    github_env = tmp_path / "github-env"
    monkeypatch.setenv("GITHUB_ENV", str(github_env))
    with pytest.raises(provision.ProvisioningError, match="name is invalid"):
        provision._write_github_env(
            {"VALID_FIRST": "value", "invalid-second": "value"}
        )
    assert not github_env.exists()


def test_bind_existing_demo_missing_password_fails_before_oauth_mutation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CANONICAL_STAGING_PROJECT_REF", provision.PROJECT_REF)
    monkeypatch.setenv("SUPABASE_URL", provision.SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_ACCESS_TOKEN", "management-token")
    monkeypatch.delenv("CANONICAL_STAGING_MCP_TEST_PASSWORD", raising=False)
    monkeypatch.setattr(
        provision,
        "_service_role_key",
        lambda *_args: pytest.fail("missing password reached Supabase authority"),
    )
    with pytest.raises(provision.ProvisioningError, match="TEST_PASSWORD is required"):
        provision.main(["--mode", "bind-existing-demo"])

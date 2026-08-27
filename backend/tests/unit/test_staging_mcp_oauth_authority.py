import json
from pathlib import Path

import pytest

from scripts import provision_staging_mcp_oauth as provision


def _auth_admin() -> provision.SupabaseAuthAdminAuthority:
    return provision.SupabaseAuthAdminAuthority(
        provision.PROJECT_REF, "sb_secret_" + "x" * 32
    )


def _set_reviewed_database_environment(monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setenv("SUPABASE_DB_PASSWORD", "encoded-password")
    contract = provision.load_direct_database_contract()
    return provision.build_direct_dsn(
        contract=contract,
        role="postgres",
        password="encoded-password",
        application_name="canonical_staging_ci",
    )


def test_oauth_callback_derives_from_sole_active_provider() -> None:
    assert provision.ACTIVE_PROVIDER == "railway"
    assert provision.TEST_CALLBACK == (
        "https://aasopharma-erp-pilot-production-eb9b.up.railway.app"
        "/oauth/staging-callback"
    )
    assert all("onrender.com" not in uri for uri in provision.REDIRECT_URIS)


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
    monkeypatch.setattr(provision, "_auth_admin_authority", lambda _token: _auth_admin())
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
        "application_provider": "railway",
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
        "_auth_admin_authority",
        lambda *_args: pytest.fail("missing password reached Supabase authority"),
    )
    with pytest.raises(provision.ProvisioningError, match="TEST_PASSWORD is required"):
        provision.main(["--mode", "bind-existing-demo"])


def test_reviewed_database_url_accepts_only_exact_direct_staging_dsn(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url = _set_reviewed_database_environment(monkeypatch)

    assert provision._reviewed_database_url(database_url) == database_url


@pytest.mark.parametrize(
    "replacement",
    [
        ("postgres:encoded-password", "erp_runtime:encoded-password"),
        (f"db.{provision.PROJECT_REF}.supabase.co", "127.0.0.1"),
        (":5432/postgres", ":6432/postgres"),
        ("/postgres?", "/other_database?"),
        ("sslmode=require", "sslmode=disable"),
        ("sslmode=require", "sslmode=require&hostaddr=127.0.0.1"),
    ],
)
def test_reviewed_database_url_rejects_wrong_target(
    monkeypatch: pytest.MonkeyPatch, replacement: tuple[str, str]
) -> None:
    database_url = _set_reviewed_database_environment(monkeypatch)

    with pytest.raises(provision.ProvisioningError, match="reviewed staging"):
        provision._reviewed_database_url(database_url.replace(*replacement))


def test_bind_mode_rejects_wrong_database_before_oauth_mutation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url = _set_reviewed_database_environment(monkeypatch)
    monkeypatch.setenv("CANONICAL_STAGING_PROJECT_REF", provision.PROJECT_REF)
    monkeypatch.setenv("SUPABASE_URL", provision.SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_ACCESS_TOKEN", "management-token")
    monkeypatch.setenv("CANONICAL_STAGING_MCP_TEST_PASSWORD", "test-password")
    monkeypatch.setenv(
        "PSYCOPG_DATABASE_URL",
        database_url.replace(provision.PROJECT_REF, "production-project"),
    )
    monkeypatch.setattr(
        provision,
        "_auth_admin_authority",
        lambda *_args: pytest.fail("wrong database target reached OAuth mutation"),
    )

    with pytest.raises(provision.ProvisioningError, match="reviewed staging"):
        provision.main(["--mode", "bind-existing-demo"])


def test_provider_failure_does_not_include_response_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _Response:
        ok = False
        status_code = 503
        text = "secret-provider-payload"
        content = b"secret-provider-payload"

    monkeypatch.setattr(
        provision.requests,
        "request",
        lambda *_args, **_kwargs: _Response(),
    )

    with pytest.raises(provision.ProvisioningError) as caught:
        provision._request_json("GET", "https://example.invalid", "token")
    assert str(caught.value) == "OAuth administration request failed with HTTP 503"
    assert "secret-provider-payload" not in str(caught.value)


def test_web_auth_organization_reconciliation_preserves_existing_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    web_auth_user_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    original_metadata = {
        "provider": "google",
        "providers": ["google"],
        "tenant_hint": "reviewed-staging",
        "org_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    }
    expected_metadata = {
        **original_metadata,
        "org_id": provision.DEMO_ORG_ID,
    }
    calls: list[tuple[str, str, dict | None]] = []
    responses = iter(
        (
            {"id": web_auth_user_id, "app_metadata": original_metadata},
            {"id": web_auth_user_id, "app_metadata": expected_metadata},
            {"id": web_auth_user_id, "app_metadata": expected_metadata},
        )
    )

    def request(_authority, method, path, *, payload=None, params=None):
        assert params is None
        calls.append((method, path, payload))
        return next(responses)

    monkeypatch.setattr(provision, "_auth_admin_json", request)

    provision._reconcile_web_auth_organization(_auth_admin(), web_auth_user_id)

    assert calls == [
        ("GET", f"users/{web_auth_user_id}", None),
        (
            "PUT",
            f"users/{web_auth_user_id}",
            {"app_metadata": expected_metadata},
        ),
        ("GET", f"users/{web_auth_user_id}", None),
    ]


def test_disposable_mcp_identity_uses_the_canonical_auth_org_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    calls: list[tuple[str, str, dict | None]] = []

    def request(_authority, method, path, *, payload=None, params=None):
        calls.append((method, path, payload))
        if method == "GET":
            return {"users": []}
        return {"id": user_id}

    monkeypatch.setattr(provision, "_auth_admin_json", request)

    assert provision._reconcile_test_user(_auth_admin(), "password") == user_id
    payload = calls[-1][2]
    assert payload is not None
    assert payload["app_metadata"]["org_id"] == provision.DEMO_ORG_ID
    assert "organization_id" not in payload["app_metadata"]


def test_web_auth_organization_reconciliation_is_idempotent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    web_auth_user_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    user = {
        "id": web_auth_user_id,
        "app_metadata": {
            "provider": "google",
            "providers": ["google"],
            "org_id": provision.DEMO_ORG_ID,
        },
    }
    calls: list[str] = []

    def request(_authority, method, path, *, payload=None, params=None):
        assert path == f"users/{web_auth_user_id}"
        assert payload is None
        assert params is None
        calls.append(method)
        return user

    monkeypatch.setattr(provision, "_auth_admin_json", request)

    provision._reconcile_web_auth_organization(_auth_admin(), web_auth_user_id)

    assert calls == ["GET", "GET"]


@pytest.mark.parametrize(
    "response",
    [
        None,
        {},
        {
            "id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            "app_metadata": {},
        },
        {"id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},
        {
            "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            "app_metadata": [],
        },
    ],
)
def test_reviewed_web_auth_identity_fails_closed_on_absent_or_ambiguous_response(
    monkeypatch: pytest.MonkeyPatch,
    response,
) -> None:
    monkeypatch.setattr(
        provision,
        "_auth_admin_json",
        lambda *_args, **_kwargs: response,
    )

    with pytest.raises(provision.ProvisioningError, match="Auth"):
        provision._review_existing_web_auth_user(
            _auth_admin(),
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        )


def test_web_auth_organization_reconciliation_rejects_metadata_loss(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    web_auth_user_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    responses = iter(
        (
            {
                "id": web_auth_user_id,
                "app_metadata": {"provider": "google", "org_id": "old-org"},
            },
            {
                "id": web_auth_user_id,
                "app_metadata": {
                    "provider": "google",
                    "org_id": provision.DEMO_ORG_ID,
                },
            },
            {
                "id": web_auth_user_id,
                "app_metadata": {"org_id": provision.DEMO_ORG_ID},
            },
        )
    )
    monkeypatch.setattr(
        provision,
        "_auth_admin_json",
        lambda *_args, **_kwargs: next(responses),
    )

    with pytest.raises(provision.ProvisioningError, match="did not reconcile exactly"):
        provision._reconcile_web_auth_organization(_auth_admin(), web_auth_user_id)


def test_bind_flow_validates_auth_before_database_and_reconciles_afterward() -> None:
    source = Path(provision.__file__).read_text(encoding="utf-8")
    main = source[source.index("def main(") : source.index('\n\nif __name__ == "__main__"')]

    preflight = main.index("_review_existing_web_auth_user(auth_admin, web_auth_user_id)")
    database_bind = main.index("demo_bound = _bind_demo(")
    auth_reconcile = main.index(
        "_reconcile_web_auth_organization(auth_admin, web_auth_user_id)"
    )

    assert preflight < database_bind < auth_reconcile


class _OwnerCursor:
    def __init__(self, server_version_num: int) -> None:
        self.server_version_num = server_version_num
        self.statements: list[str] = []

    def execute(self, statement: str) -> None:
        self.statements.append(statement)

    def fetchone(self) -> tuple[str]:
        return (str(self.server_version_num),)


class _AttestationCursor:
    def __init__(self, result: tuple[str, str, str]) -> None:
        self.result = result
        self.statements: list[str] = []

    def execute(self, statement: str) -> None:
        self.statements.append(statement)

    def fetchone(self) -> tuple[str, str, str]:
        return self.result


def test_database_attestation_precedes_owner_delegation() -> None:
    cursor = _AttestationCursor(("postgres", "postgres", "on"))

    provision._attest_reviewed_database(cursor)

    assert cursor.statements == [
        "SELECT current_user,current_database(),current_setting('ssl')"
    ]


def test_database_attestation_rejects_unreviewed_session() -> None:
    cursor = _AttestationCursor(("postgres", "production", "on"))

    with pytest.raises(provision.ProvisioningError, match="reviewed staging authority"):
        provision._attest_reviewed_database(cursor)


def test_owner_boundary_is_transaction_scoped_on_postgresql_16_plus() -> None:
    cursor = _OwnerCursor(170000)

    supports_membership_options = provision._enter_migration_owner(cursor)
    provision._leave_migration_owner(cursor, supports_membership_options)

    assert cursor.statements == [
        "SHOW server_version_num",
        'GRANT "erp_migration_owner" TO CURRENT_USER '
        "WITH INHERIT FALSE, SET TRUE",
        'SET LOCAL ROLE "erp_migration_owner"',
        "SET CONSTRAINTS ALL IMMEDIATE",
        "RESET ROLE",
        'GRANT "erp_migration_owner" TO CURRENT_USER '
        "WITH INHERIT FALSE, SET FALSE",
    ]


def test_owner_boundary_revokes_temporary_membership_before_postgresql_16() -> None:
    cursor = _OwnerCursor(150000)

    supports_membership_options = provision._enter_migration_owner(cursor)
    provision._leave_migration_owner(cursor, supports_membership_options)

    assert cursor.statements == [
        "SHOW server_version_num",
        'GRANT "erp_migration_owner" TO CURRENT_USER',
        'SET LOCAL ROLE "erp_migration_owner"',
        "SET CONSTRAINTS ALL IMMEDIATE",
        "RESET ROLE",
        'REVOKE "erp_migration_owner" FROM CURRENT_USER',
    ]


def test_demo_binding_enters_and_leaves_owner_inside_connection_transaction() -> None:
    source = Path(provision.__file__).read_text(encoding="utf-8")
    bind_demo = source[source.index("def _bind_demo(") : source.index("\ndef _write_github_env")]

    connection = bind_demo.index("with psycopg2.connect(database_url) as connection:")
    attest = bind_demo.index("_attest_reviewed_database(cursor)")
    enter = bind_demo.index("_enter_migration_owner(cursor)")
    first_canonical_read = bind_demo.index("SELECT count(*) FROM core.organizations")
    absent_demo_leave = bind_demo.index(
        "_leave_migration_owner(cursor, supports_membership_options)"
    )
    absent_demo_return = bind_demo.index("return False")
    final_reconciliation = bind_demo.index(
        "Staging web test grant binding did not reconcile exactly"
    )
    success_leave = bind_demo.rindex(
        "_leave_migration_owner(cursor, supports_membership_options)"
    )

    assert connection < attest < enter < first_canonical_read
    assert first_canonical_read < absent_demo_leave < absent_demo_return
    assert final_reconciliation < success_leave

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


class _OwnerCursor:
    def __init__(self, server_version_num: int) -> None:
        self.server_version_num = server_version_num
        self.statements: list[str] = []

    def execute(self, statement: str) -> None:
        self.statements.append(statement)

    def fetchone(self) -> tuple[str]:
        return (str(self.server_version_num),)


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

    assert connection < enter < first_canonical_read
    assert first_canonical_read < absent_demo_leave < absent_demo_return
    assert final_reconciliation < success_leave

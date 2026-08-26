import importlib.util
import json
import sys
from pathlib import Path
from uuid import UUID

import pytest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend/scripts/provision_ephemeral_browser_identities.py"
SCRIPTS = str(SCRIPT.parent)
if SCRIPTS not in sys.path:
    sys.path.insert(0, SCRIPTS)
SPEC = importlib.util.spec_from_file_location("ephemeral_browser_identities", SCRIPT)
identities = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(identities)


def _auth_admin():
    return identities.SupabaseAuthAdminAuthority(
        identities.EXPECTED_PROJECT_REF, "sb_secret_" + "x" * 32
    )


def _environment(monkeypatch, tmp_path: Path) -> tuple[Path, Path]:
    state_path = tmp_path / "ephemeral-state.json"
    github_env = tmp_path / "github-env"
    github_env.write_text("", encoding="utf-8")
    monkeypatch.setenv("CANONICAL_STAGING_PROJECT_REF", identities.EXPECTED_PROJECT_REF)
    monkeypatch.setenv("SUPABASE_URL", identities.SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_ACCESS_TOKEN", "management-token")
    monkeypatch.setenv("SUPABASE_DB_PASSWORD", "database-password")
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    monkeypatch.setenv("GITHUB_ENV", str(github_env))
    monkeypatch.setattr(identities, "_validate_target", lambda token: None)
    monkeypatch.setattr(identities, "_auth_admin_authority", lambda token: _auth_admin())
    return state_path, github_env


def _assert_state_has_no_credentials(state_path: Path) -> dict:
    state_text = state_path.read_text(encoding="utf-8")
    state = json.loads(state_text)
    assert "@canonical-staging" not in state_text
    assert "password" not in state_text.lower()
    assert "service" not in state_text.lower()
    assert "management-token" not in state_text
    assert "database-password" not in state_text
    assert "temporary-service-key" not in state_text
    return state


def test_refuses_every_project_except_the_pinned_staging_project(monkeypatch):
    monkeypatch.setenv("CANONICAL_STAGING_PROJECT_REF", "production-project")
    monkeypatch.setenv("SUPABASE_URL", identities.SUPABASE_URL)
    monkeypatch.setattr(
        identities,
        "_request_json",
        lambda *args, **kwargs: pytest.fail("network must not run for a rejected ref"),
    )

    with pytest.raises(identities.EphemeralIdentityError, match="Refusing"):
        identities._validate_target("management-token")


def test_direct_ipv4_database_transport_uses_plain_admin_role(monkeypatch):
    observed = {}
    monkeypatch.setenv("SUPABASE_DB_PASSWORD", "database-password")
    monkeypatch.setenv(
        "CANONICAL_EPHEMERAL_DATABASE_TRANSPORT",
        identities.DIRECT_IPV4_DATABASE_TRANSPORT,
    )
    monkeypatch.setattr(
        identities.psycopg2,
        "connect",
        lambda **kwargs: observed.update(kwargs) or object(),
    )

    identities._database_connection("unused-management-token")

    contract = identities.load_direct_database_contract()
    assert observed["host"] == contract.host
    assert observed["port"] == contract.port
    assert observed["user"] == "postgres"
    assert observed["application_name"].endswith("direct_ipv4")


@pytest.mark.parametrize("transport", ["", "automatic", "session_pooler"])
def test_database_transport_has_no_implicit_fallback(monkeypatch, transport):
    monkeypatch.setenv("SUPABASE_DB_PASSWORD", "database-password")
    monkeypatch.setenv("CANONICAL_EPHEMERAL_DATABASE_TRANSPORT", transport)
    monkeypatch.setattr(
        identities.psycopg2,
        "connect",
        lambda **_kwargs: pytest.fail("unsupported transport attempted a connection"),
    )

    with pytest.raises(identities.EphemeralIdentityError, match="implicit fallback"):
        identities._database_connection("unused-management-token")


def test_auth_creation_requires_confirmed_identity(monkeypatch):
    monkeypatch.setattr(
        identities,
        "_admin_request",
        lambda *args, **kwargs: {
            "id": "d4000000-0000-7000-8000-000000000001",
            "email_confirmed_at": None,
        },
    )

    with pytest.raises(identities.EphemeralIdentityError, match="not confirmed"):
        identities._create_auth_user(
            "service-key",
            purpose=identities.TWO_USER_PURPOSE,
            role="requester",
            run_token="run-token",
            email="masked@example.invalid",
            password="masked-password",
        )


@pytest.mark.parametrize(
    ("server_version", "enter_sql", "leave_sql"),
    [
        (
            "170000",
            'GRANT "erp_migration_owner" TO CURRENT_USER WITH INHERIT FALSE, SET TRUE',
            'GRANT "erp_migration_owner" TO CURRENT_USER WITH INHERIT FALSE, SET FALSE',
        ),
        (
            "150000",
            'GRANT "erp_migration_owner" TO CURRENT_USER',
            'REVOKE "erp_migration_owner" FROM CURRENT_USER',
        ),
    ],
)
def test_migration_owner_scope_is_transactional_and_restores_membership(
    server_version, enter_sql, leave_sql
):
    class Cursor:
        def __init__(self):
            self.statements = []

        def execute(self, statement, params=None):
            self.statements.append(statement)

        def fetchone(self):
            return (server_version,)

    cursor = Cursor()
    membership_options = identities._enter_migration_owner(cursor)
    identities._leave_migration_owner(cursor, membership_options)

    assert cursor.statements == [
        "SHOW server_version_num",
        enter_sql,
        'SET LOCAL ROLE "erp_migration_owner"',
        "SET CONSTRAINTS ALL IMMEDIATE",
        "RESET ROLE",
        leave_sql,
    ]


def test_browser_database_provision_enters_owner_on_its_own_connection(
    monkeypatch, tmp_path
):
    events = []

    class Cursor:
        def execute(self, *_args, **_kwargs):
            events.append("sql")

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    class Connection:
        def cursor(self):
            return Cursor()

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    class OwnerBoundaryReached(RuntimeError):
        pass

    monkeypatch.setattr(
        identities, "_database_connection", lambda _token: Connection()
    )
    monkeypatch.setattr(
        identities, "_set_reviewer_context", lambda _cursor: events.append("context")
    )

    def enter_owner(_cursor):
        events.append("owner")
        raise OwnerBoundaryReached

    monkeypatch.setattr(identities, "_enter_migration_owner", enter_owner)
    state = {
        "auth_users": [
            {"role": "requester", "auth_user_id": str(UUID(int=1))},
            {"role": "reviewer", "auth_user_id": str(UUID(int=2))},
        ]
    }

    with pytest.raises(OwnerBoundaryReached):
        identities._provision_database(
            "management-token",
            tmp_path / "state.json",
            state,
            identities.PROFILE_TWO_USER,
        )

    assert events == ["sql", "sql", "context", "owner"]


def test_browser_database_cleanup_restores_owner_before_commit(monkeypatch):
    events = []

    class Cursor:
        def execute(self, *_args, **_kwargs):
            events.append("sql")

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    class Connection:
        def cursor(self):
            return Cursor()

        def __enter__(self):
            events.append("connection-enter")
            return self

        def __exit__(self, *_args):
            events.append("connection-exit")
            return False

    monkeypatch.setattr(
        identities, "_database_connection", lambda _token: Connection()
    )
    monkeypatch.setattr(
        identities, "_set_reviewer_context", lambda _cursor: events.append("context")
    )
    monkeypatch.setattr(
        identities,
        "_enter_migration_owner",
        lambda _cursor: events.append("owner-enter") or False,
    )
    monkeypatch.setattr(
        identities,
        "_leave_migration_owner",
        lambda _cursor, _options: events.append("owner-leave"),
    )

    identities._cleanup_database(
        "management-token",
        {
            "purpose": identities.TWO_USER_PURPOSE,
            "auth_users": [],
            "prior_bindings": [],
            "prior_active_grants": [],
            "temporary_grants": {},
        },
    )

    assert events == [
        "connection-enter",
        "sql",
        "sql",
        "owner-enter",
        "context",
        "owner-leave",
        "connection-exit",
    ]


def test_live18_cleanup_switches_denial_then_restores_demo_context(monkeypatch):
    events = []

    class Cursor:
        def execute(self, *_args, **_kwargs):
            events.append("sql")

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    class Connection:
        def cursor(self):
            return Cursor()

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    monkeypatch.setattr(
        identities, "_database_connection", lambda _token: Connection()
    )
    monkeypatch.setattr(
        identities,
        "_cleanup_live18_denial_database",
        lambda _cursor, _state: events.append("denial-cleanup"),
    )
    monkeypatch.setattr(
        identities, "_set_reviewer_context", lambda _cursor: events.append("demo-context")
    )
    monkeypatch.setattr(identities, "_enter_migration_owner", lambda _cursor: False)
    monkeypatch.setattr(identities, "_leave_migration_owner", lambda *_args: None)

    identities._cleanup_database(
        "management-token",
        {
            "purpose": identities.LIVE18_PURPOSE,
            "auth_users": [],
            "prior_bindings": [],
            "prior_active_grants": [],
            "temporary_grants": {},
        },
    )

    assert events.index("denial-cleanup") < events.index("demo-context")


def test_denial_cleanup_sets_exact_audit_context_and_escapes_like_pattern():
    statements = []

    class Cursor:
        def execute(self, statement, params=None):
            statements.append((" ".join(statement.split()), params))

        def fetchone(self):
            return (1,)

    identities._cleanup_live18_denial_database(
        Cursor(),
        {
            "denial_database_provisioned": True,
            "denial_identity": {
                "auth_user_id": "d4000000-0000-7000-8000-000000000001",
                "user_id": "d4000000-0000-7000-8000-000000000002",
                "membership_id": "d4000000-0000-7000-8000-000000000003",
                "role_id": "d4000000-0000-7000-8000-000000000004",
                "access_grant_id": "d4000000-0000-7000-8000-000000000005",
                "agent_grant_id": "d4000000-0000-7000-8000-000000000006",
            },
        },
    )

    context = {
        params[0]: params[1]
        for statement, params in statements[:5]
        if statement == "SELECT set_config(%s,%s,true)"
    }
    assert context == {
        "app.org_id": identities.DENIAL_ORG_ID,
        "app.auth_user_id": identities.DEMO_OPERATOR_AUTH_USER_ID,
        "app.user_id": identities.DEMO_OPERATOR_USER_ID,
        "app.membership_id": identities.DENIAL_CREATOR_MEMBERSHIP_ID,
        "app.request_id": context["app.request_id"],
    }
    UUID(context["app.request_id"])
    mutations = [
        statement for statement, _params in statements
        if " UPDATE " in f" {statement} " or " DELETE " in f" {statement} "
    ]
    assert len(mutations) == 6
    assert not any(" DELETE " in f" {statement} " for statement in mutations)
    role_update, role_params = next(
        (statement, params) for statement, params in statements
        if "UPDATE core.roles" in statement
    )
    assert "role.code LIKE %s" in role_update
    assert f"{identities.LIVE18_DENIAL_ROLE_PREFIX}%" in role_params
    all_params = [
        value
        for _statement, params in statements
        if params
        for value in params
    ]
    assert identities.LIVE18_DENIAL_CONSENT_VERSION in all_params
    assert identities.LIVE18_DENIAL_CLEANUP_REASON in all_params
    assert all("status='active'" in statement for statement in mutations[:1])
    assert "status IN ('active','suspended')" in mutations[1]
    assert "status='active'" in mutations[2]
    assert "status='active'" in mutations[3]
    assert "status IN ('active','suspended')" in mutations[4]
    assert "auth_user_id=NULL,status='disabled'" in mutations[5]


def test_denial_cleanup_rejects_a_nonterminal_exact_user_auth_pair():
    statements = []
    results = iter(((1,), (0,)))

    class Cursor:
        def execute(self, statement, params=None):
            statements.append((" ".join(statement.split()), params))

        def fetchone(self):
            return next(results)

    with pytest.raises(
        identities.EphemeralIdentityError, match="exact terminal boundary"
    ):
        identities._terminalize_live18_denial_authority(
            Cursor(),
            [
                (
                    "d4000000-0000-7000-8000-000000000002",
                    "d4000000-0000-7000-8000-000000000001",
                )
            ],
        )

    transported_targets = json.loads(statements[0][1][0])
    assert transported_targets == [
        {
            "user_id": "d4000000-0000-7000-8000-000000000002",
            "auth_user_id": "d4000000-0000-7000-8000-000000000001",
        }
    ]


def test_denial_cleanup_rejects_cross_tenant_pair_before_any_mutation():
    statements = []

    class Cursor:
        def execute(self, statement, params=None):
            statements.append((" ".join(statement.split()), params))

        def fetchone(self):
            return (0,)

    with pytest.raises(
        identities.EphemeralIdentityError, match="not exact and tenant-scoped"
    ):
        identities._terminalize_live18_denial_authority(
            Cursor(),
            [
                (
                    "d4000000-0000-7000-8000-000000000002",
                    "d4000000-0000-7000-8000-000000000001",
                )
            ],
        )

    assert len(statements) == 1
    assert " UPDATE " not in f" {statements[0][0]} "


def test_denial_residue_counts_pending_consent_as_nonterminal():
    statements = []

    class Cursor:
        def execute(self, statement, params=None):
            statements.append((" ".join(statement.split()), params))

        def fetchone(self):
            return (0, 0, 0)

    assert identities._live18_denial_residue_counts(Cursor()) == (0, 0, 0)
    assert "status IN ('pending_consent','active','suspended')" in statements[0][0]
    assert identities.LIVE18_DENIAL_CONSENT_VERSION in statements[0][1]
    assert f"{identities.LIVE18_DENIAL_ROLE_PREFIX}%" in statements[0][1]


def test_denial_lifecycle_policy_literals_have_one_source_authority():
    source = SCRIPT.read_text(encoding="utf-8")
    assert source.count("live18-denial-v1") == 1
    assert source.count('"live18_denial_"') == 1
    assert "LIKE 'live18_denial_" not in source
    assert source.count("Live18 disposable identity cleanup") == 1


@pytest.mark.parametrize(
    "resolved,expected_error",
    [
        (
            [
                (
                    "d4000000-0000-7000-8000-000000000002",
                    "d4000000-0000-7000-8000-000000000001",
                    True,
                    True,
                )
            ],
            "bound across organizations",
        ),
        ([], "unclassified database binding"),
    ],
)
def test_stale_recovery_preserves_unscoped_auth_bindings(
    monkeypatch, resolved, expected_error
):
    fetches = iter(
        (
            resolved,
            [("d4000000-0000-7000-8000-000000000001",)],
        )
    )

    class Cursor:
        def execute(self, *_args, **_kwargs):
            pass

        def fetchall(self):
            return next(fetches)

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    class Connection:
        def cursor(self):
            return Cursor()

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    monkeypatch.setattr(
        identities, "_database_connection", lambda _token: Connection()
    )
    monkeypatch.setattr(identities, "_enter_migration_owner", lambda _cursor: False)
    monkeypatch.setattr(identities, "_set_reviewer_context", lambda _cursor: None)
    monkeypatch.setattr(identities, "_set_denial_context", lambda _cursor: None)
    monkeypatch.setattr(identities, "_leave_migration_owner", lambda *_args: None)
    monkeypatch.setattr(
        identities,
        "_terminalize_live18_denial_authority",
        lambda _cursor, targets: (
            None
            if not targets
            else pytest.fail("unscoped identity must not be terminalized")
        ),
    )

    with pytest.raises(identities.EphemeralIdentityError, match=expected_error):
        identities._recover_stale_live18_database(
            "management-token",
            {"d4000000-0000-7000-8000-000000000001"},
        )


def test_denial_provision_sets_context_before_reading_or_mutating_tenant(
    monkeypatch, tmp_path
):
    events = []

    class ContextBoundaryReached(RuntimeError):
        pass

    class Cursor:
        def execute(self, statement, *_args, **_kwargs):
            normalized = " ".join(statement.split())
            events.append(normalized)
            if normalized.startswith("SELECT status FROM core.organizations"):
                raise ContextBoundaryReached

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    class Connection:
        def cursor(self):
            return Cursor()

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    monkeypatch.setattr(
        identities, "_database_connection", lambda _token: Connection()
    )
    monkeypatch.setattr(identities, "_enter_migration_owner", lambda _cursor: False)
    monkeypatch.setattr(
        identities, "_set_denial_context", lambda _cursor: events.append("denial-context")
    )

    with pytest.raises(ContextBoundaryReached):
        identities._provision_live18_denial_database(
            "management-token",
            tmp_path / "state.json",
            {"denial_identity": {}},
        )

    assert events[:4] == [
        "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
        "SET CONSTRAINTS ALL DEFERRED",
        "denial-context",
        "SELECT status FROM core.organizations WHERE id=%s FOR SHARE",
    ]


def test_stale_recovery_switches_from_demo_to_denial_audit_context(monkeypatch):
    events = []

    class DenialBoundaryReached(RuntimeError):
        pass

    class Cursor:
        last_statement = ""

        def execute(self, statement, *_args, **_kwargs):
            normalized = " ".join(statement.split())
            self.last_statement = normalized
            if "UPDATE automation.agent_grant_capabilities" in normalized:
                raise DenialBoundaryReached

        def fetchall(self):
            return [(
                "d4000000-0000-7000-8000-000000000002",
                "d4000000-0000-7000-8000-000000000001",
                True,
                False,
            )]

        def fetchone(self):
            return (1,)

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    class Connection:
        def cursor(self):
            return Cursor()

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    monkeypatch.setattr(
        identities, "_database_connection", lambda _token: Connection()
    )
    monkeypatch.setattr(identities, "_enter_migration_owner", lambda _cursor: False)
    monkeypatch.setattr(
        identities, "_set_reviewer_context", lambda _cursor: events.append("demo")
    )
    monkeypatch.setattr(
        identities, "_set_denial_context", lambda _cursor: events.append("denial")
    )

    with pytest.raises(DenialBoundaryReached):
        identities._recover_stale_live18_database(
            "management-token",
            {"d4000000-0000-7000-8000-000000000001"},
        )

    assert events == ["demo", "denial"]


def test_auth_deletion_retries_transient_admin_failure(monkeypatch):
    calls = []

    def admin(*args, **kwargs):
        calls.append(args)
        if len(calls) < 3:
            raise identities.EphemeralIdentityError("HTTP 500")

    monkeypatch.setattr(identities, "_admin_request", admin)
    monkeypatch.setattr(identities.time, "sleep", lambda seconds: None)

    identities._delete_auth_user(
        "service-key", "d4000000-0000-7000-8000-000000000001"
    )

    assert len(calls) == 3


def test_error_annotations_redact_management_and_database_secrets(monkeypatch):
    monkeypatch.setenv("SUPABASE_ACCESS_TOKEN", "private-management-token")
    monkeypatch.setenv("SUPABASE_DB_PASSWORD", "private-database-password")

    annotation = identities._redacted_annotation(
        RuntimeError("private-management-token private-database-password")
    )

    assert "private-management-token" not in annotation
    assert "private-database-password" not in annotation
    assert annotation == "[REDACTED] [REDACTED]"


def test_provision_exports_credentials_only_to_masked_same_job_environment(
    monkeypatch, tmp_path, capsys
):
    state_path, github_env = _environment(monkeypatch, tmp_path)
    created = iter(
        (
            "d4000000-0000-7000-8000-000000000001",
            "d4000000-0000-7000-8000-000000000002",
        )
    )
    monkeypatch.setattr(
        identities, "_create_auth_user", lambda *args, **kwargs: next(created)
    )

    def provision_database(token, path, state, profile):
        assert profile == identities.PROFILE_TWO_USER
        state["database_provisioned"] = True
        identities._write_state(path, state)
        return None

    monkeypatch.setattr(identities, "_provision_database", provision_database)

    identities.provision(state_path)

    state = _assert_state_has_no_credentials(state_path)
    assert state_path.stat().st_mode & 0o777 == 0o600
    assert [entry["role"] for entry in state["auth_users"]] == [
        "requester",
        "reviewer",
    ]
    assert len({entry["auth_user_id"] for entry in state["auth_users"]}) == 2
    exported = github_env.read_text(encoding="utf-8")
    for key in (
        "PLAYWRIGHT_LIVE_REQUESTER_EMAIL",
        "PLAYWRIGHT_LIVE_REQUESTER_PASSWORD",
        "PLAYWRIGHT_LIVE_REVIEWER_EMAIL",
        "PLAYWRIGHT_LIVE_REVIEWER_PASSWORD",
    ):
        assert exported.count(f"{key}=") == 1
    requester_email = next(
        line.split("=", 1)[1]
        for line in exported.splitlines()
        if line.startswith("PLAYWRIGHT_LIVE_REQUESTER_EMAIL=")
    )
    reviewer_email = next(
        line.split("=", 1)[1]
        for line in exported.splitlines()
        if line.startswith("PLAYWRIGHT_LIVE_REVIEWER_EMAIL=")
    )
    assert requester_email != reviewer_email
    output = capsys.readouterr().out
    for value in (
        _auth_admin().secret_key,
        requester_email,
        reviewer_email,
    ):
        assert f"::add-mask::{value}" in output


def test_partial_second_user_failure_remains_fully_cleanable(
    monkeypatch, tmp_path
):
    state_path, github_env = _environment(monkeypatch, tmp_path)
    first_user_id = "d4000000-0000-7000-8000-000000000001"
    calls = 0

    def create(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            return first_user_id
        raise identities.EphemeralIdentityError("synthetic second-user failure")

    monkeypatch.setattr(identities, "_create_auth_user", create)
    with pytest.raises(identities.EphemeralIdentityError, match="second-user"):
        identities.provision(state_path)

    state = _assert_state_has_no_credentials(state_path)
    assert state["auth_users"] == [
        {"role": "requester", "auth_user_id": first_user_id}
    ]

    database_cleanup = []
    deleted = []
    monkeypatch.setattr(
        identities, "_cleanup_database", lambda token, value: database_cleanup.append(value)
    )
    monkeypatch.setattr(
        identities,
        "_list_run_auth_user_ids",
        lambda key, run_token, purpose: {first_user_id},
    )
    monkeypatch.setattr(
        identities, "_delete_auth_user", lambda key, user_id: deleted.append(user_id)
    )

    identities.cleanup(state_path)

    assert len(database_cleanup) == 1
    assert deleted == [first_user_id]
    assert not state_path.exists()
    cleared = github_env.read_text(encoding="utf-8")
    assert "PLAYWRIGHT_LIVE_REQUESTER_PASSWORD=\n" in cleared
    assert "PLAYWRIGHT_LIVE_REVIEWER_PASSWORD=\n" in cleared


def test_auth_users_are_retained_when_database_cleanup_fails(
    monkeypatch, tmp_path
):
    state_path, _ = _environment(monkeypatch, tmp_path)
    run_token = "d4000000-0000-7000-8000-000000000099"
    auth_user_id = "d4000000-0000-7000-8000-000000000001"
    identities._write_state(
        state_path,
        {
            "version": identities.STATE_VERSION,
            "project_ref": identities.EXPECTED_PROJECT_REF,
            "purpose": identities.TWO_USER_PURPOSE,
            "run_token": run_token,
            "auth_users": [{"role": "requester", "auth_user_id": auth_user_id}],
            "prior_bindings": [],
            "prior_active_grants": [],
            "temporary_grants": {},
            "database_provisioned": False,
        },
    )
    monkeypatch.setattr(
        identities,
        "_cleanup_database",
        lambda *args: (_ for _ in ()).throw(RuntimeError("synthetic DB failure")),
    )
    monkeypatch.setattr(
        identities, "_list_run_auth_user_ids", lambda *args: {auth_user_id}
    )
    deleted = []
    monkeypatch.setattr(
        identities, "_delete_auth_user", lambda key, user_id: deleted.append(user_id)
    )

    with pytest.raises(identities.EphemeralIdentityError, match="database cleanup"):
        identities.cleanup(state_path)

    assert deleted == [], "Auth metadata must remain as the crash-recovery anchor"
    assert state_path.exists(), "state must remain available for a cleanup retry"


def test_cleanup_without_state_is_successful_and_clears_same_job_credentials(
    monkeypatch, tmp_path, capsys
):
    state_path, github_env = _environment(monkeypatch, tmp_path)
    github_env.write_text(
        "PLAYWRIGHT_LIVE_EMAIL=temporary@example.invalid\n"
        "PLAYWRIGHT_LIVE_PASSWORD=temporary-password\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(
        identities,
        "_validate_target",
        lambda token: pytest.fail("cleanup without state must not call external services"),
    )

    identities.cleanup(state_path)

    assert "No ephemeral browser identity state was present" in capsys.readouterr().out
    cleared = github_env.read_text(encoding="utf-8")
    assert cleared.endswith(
        "PLAYWRIGHT_LIVE_REVIEWER_EMAIL=\n"
        "PLAYWRIGHT_LIVE_REVIEWER_PASSWORD=\n"
    )
    assert "PLAYWRIGHT_LIVE_EMAIL=\n" in cleared
    assert "PLAYWRIGHT_LIVE_PASSWORD=\n" in cleared


def test_browser_grants_have_exact_minimum_maker_checker_capabilities():
    assert identities.LOCK_KEY == "canonical-staging-live-browser-identities"
    requester = {capability[0] for capability in identities.REQUESTER_CAPABILITIES}
    reviewer = {capability[0] for capability in identities.REVIEWER_CAPABILITIES}

    assert requester == {
        "sales.return.prepare",
        "procurement.purchase_return.prepare",
        "inventory.adjustment.prepare",
        "automation.command.execute",
        "automation.command.status.get",
    }
    assert reviewer == {
        "automation.command.approve",
        "automation.command.status.get",
    }
    assert "automation.command.approve" not in requester
    assert "automation.command.execute" not in reviewer
    assert set(identities.REQUESTER_PERMISSIONS) == {
        "sales.return.create",
        "procurement.purchase_return.create",
        "inventory.adjustment.create",
        "automation.command.execute",
        "automation.command.view",
    }
    assert set(identities.REVIEWER_PERMISSIONS) == {
        "automation.command.approve",
        "automation.command.view",
    }
    assert len(identities.IDENTITIES) == 2
    assert len({entry[2] for entry in identities.IDENTITIES}) == 2
    for _, user_id, membership_id in identities.IDENTITIES:
        UUID(user_id)
        UUID(membership_id)


def test_core_operator_profile_exports_one_ephemeral_login_and_derived_fixture(
    monkeypatch, tmp_path
):
    state_path, github_env = _environment(monkeypatch, tmp_path)
    auth_user_id = "d4000000-0000-7000-8000-000000000001"
    fixture = json.dumps({"branch_id": "d3000000-0000-7000-8000-000000000005"})
    monkeypatch.setattr(
        identities, "_create_auth_user", lambda *args, **kwargs: auth_user_id
    )

    def provision_database(token, path, state, profile):
        assert profile == identities.PROFILE_CORE_OPERATOR
        assert list(state["temporary_grants"]) == ["operator"]
        state["database_provisioned"] = True
        identities._write_state(path, state)
        return fixture

    monkeypatch.setattr(identities, "_provision_database", provision_database)

    identities.provision(state_path, identities.PROFILE_CORE_OPERATOR)

    state = _assert_state_has_no_credentials(state_path)
    assert state["purpose"] == identities.CORE_OPERATOR_PURPOSE
    assert state["auth_users"] == [
        {"role": "operator", "auth_user_id": auth_user_id}
    ]
    exported = github_env.read_text(encoding="utf-8")
    assert "PLAYWRIGHT_LIVE_EMAIL=" in exported
    assert "PLAYWRIGHT_LIVE_PASSWORD=" in exported
    assert f"PLAYWRIGHT_SALES_CHAIN_FIXTURE={fixture}\n" in exported
    assert "PLAYWRIGHT_LIVE_OPERATOR_" not in exported
    assert "PLAYWRIGHT_LIVE_REQUESTER_" not in exported
    assert "PLAYWRIGHT_LIVE_REVIEWER_" not in exported


def test_core_operator_capabilities_cover_unified_writes_and_keep_separate_approval():
    capabilities = {
        capability: approval
        for capability, _, _, approval in identities.CORE_OPERATOR_CAPABILITIES
    }

    assert set(capabilities) == {
        "sales.order.prepare",
        "sales.dispatch.prepare",
        "sales.invoice.prepare",
        "procurement.purchase_order.prepare",
        "procurement.goods_receipt.prepare",
        "procurement.supplier_invoice.prepare",
        "finance.customer_receipt.prepare",
        "finance.supplier_payment.prepare",
        "sales.return.prepare",
        "inventory.adjustment.prepare",
        "automation.command.approve",
        "automation.command.execute",
        "automation.command.status.get",
    }
    for capability in (
        "sales.return.prepare",
        "inventory.adjustment.prepare",
    ):
        assert capabilities[capability] == "separate_approver"
    assert capabilities["automation.command.approve"] == "actor_confirmation"
    assert len(identities.CORE_IDENTITIES) == 1
    assert identities.CORE_IDENTITIES[0][2] == identities.DEMO_OPERATOR_MEMBERSHIP_ID
    assert len(identities.CORE_OPERATOR_PERMISSIONS) == len(
        set(identities.CORE_OPERATOR_PERMISSIONS)
    )
    assert {
        "automation.command.approve",
        "automation.command.execute",
        "automation.command.view",
        "catalog.product.manage",
        "parties.party.manage",
        "parties.customer.manage",
        "parties.supplier.manage",
        "inventory.document.post",
        "inventory.reservation.manage",
        "finance.journal.post",
        "finance.payment.allocate",
    }.issubset(identities.CORE_OPERATOR_PERMISSIONS)


def test_core_fixture_is_resolved_from_available_live_fefo_stock():
    class Cursor:
        sql = ""
        parameters = ()

        def execute(self, sql, parameters):
            self.sql = sql
            self.parameters = parameters

        def fetchall(self):
            return [(
                "d3000000-0000-7000-8000-000000000005",
                "d3000000-0000-7000-8000-000000000011",
                "d3000000-0000-7000-8000-000000000015",
                "d3000000-0000-7000-8000-000000000016",
                "d5000000-0000-7000-8000-000000000001",
                "27",
            )]

    cursor = Cursor()
    fixture = json.loads(identities._resolve_core_sales_fixture(cursor))

    assert "inventory.available_quantity" in cursor.sql
    assert "location.allows_sale" in cursor.sql
    assert "NOT location.allows_negative_stock" in cursor.sql
    assert "ORDER BY batch.expires_on" in cursor.sql
    assert fixture["expected_fefo_batch_id"] == "d5000000-0000-7000-8000-000000000001"
    assert fixture["billed_quantity"] == "1.000000"
    assert fixture["unit_rate"] == "84.0000"


def test_live18_profile_derives_every_prepare_permission_from_generated_contract():
    contract = json.loads(identities.OPERATOR_CONTRACT_PATH.read_text(encoding="utf-8"))
    matrix = json.loads(identities.LIVE18_MATRIX_PATH.read_text(encoding="utf-8"))
    operations = {row["command_operation"] for row in matrix["operations"]}
    actions = {
        row["operation_key"]: row for row in contract["prepare_actions"]
    }
    capabilities = {
        capability: approval
        for capability, _, _, approval in identities.LIVE18_REQUESTER_CAPABILITIES
        if capability.endswith(".prepare")
    }

    assert matrix["required_operation_count"] == 18
    assert len(operations) == 17
    assert set(capabilities) == operations == set(actions)
    assert capabilities == {
        operation: actions[operation]["approval_policy"] for operation in operations
    }
    assert set(identities.LIVE18_REQUESTER_PERMISSIONS) == {
        *(actions[operation]["permission"] for operation in operations),
        "automation.command.approve",
        "automation.command.execute",
        "automation.command.view",
    }


def test_lost_live18_state_is_discovered_recovered_deleted_and_verified(
    monkeypatch,
):
    stale_ids = {
        "d4000000-0000-7000-8000-000000000001",
        "d4000000-0000-7000-8000-000000000002",
        "d4000000-0000-7000-8000-000000000003",
    }
    listed = [stale_ids, set()]
    recovered = []
    deleted = []

    monkeypatch.setenv("SUPABASE_ACCESS_TOKEN", "management-token")
    monkeypatch.setattr(identities, "_validate_target", lambda _token: None)
    monkeypatch.setattr(identities, "_auth_admin_authority", lambda _token: _auth_admin())
    monkeypatch.setattr(identities, "_mask", lambda _value: None)
    monkeypatch.setattr(
        identities,
        "_list_purpose_auth_user_ids",
        lambda _key, _purpose: listed.pop(0),
    )
    monkeypatch.setattr(
        identities,
        "_recover_stale_live18_database",
        lambda _token, ids: recovered.append(ids),
    )
    monkeypatch.setattr(
        identities,
        "_delete_auth_user",
        lambda _key, auth_user_id: deleted.append(auth_user_id),
    )
    boundaries = []
    monkeypatch.setattr(
        identities,
        "_assert_live18_database_boundary",
        lambda _token: boundaries.append(tuple(deleted)),
    )

    result = identities.recover_lost_live18_state()

    assert recovered == [stale_ids]
    assert deleted == sorted(stale_ids)
    assert boundaries == [(), tuple(sorted(stale_ids))]
    assert result == {
        "recovered_auth_identity_count": 3,
        "remaining_auth_identity_count": 0,
        "remaining_active_temporary_grant_count": 0,
        "remaining_denial_role_count": 0,
        "remaining_active_denial_authority_count": 0,
        "remaining_denial_auth_binding_count": 0,
    }


def test_lost_state_preserves_auth_anchor_until_database_boundary_is_clean(
    monkeypatch,
):
    stale_id = "d4000000-0000-7000-8000-000000000001"
    monkeypatch.setenv("SUPABASE_ACCESS_TOKEN", "management-token")
    monkeypatch.setattr(identities, "_validate_target", lambda _token: None)
    monkeypatch.setattr(identities, "_auth_admin_authority", lambda _token: _auth_admin())
    monkeypatch.setattr(identities, "_mask", lambda _value: None)
    monkeypatch.setattr(
        identities,
        "_list_purpose_auth_user_ids",
        lambda _key, _purpose: {stale_id},
    )
    monkeypatch.setattr(
        identities, "_recover_stale_live18_database", lambda *_args: None
    )
    monkeypatch.setattr(
        identities,
        "_assert_live18_database_boundary",
        lambda _token: (_ for _ in ()).throw(
            identities.EphemeralIdentityError("residue remained")
        ),
    )
    monkeypatch.setattr(
        identities,
        "_delete_auth_user",
        lambda *_args: pytest.fail("Auth anchor must survive a dirty DB boundary"),
    )

    with pytest.raises(identities.EphemeralIdentityError, match="residue remained"):
        identities.recover_lost_live18_state()


def test_auth_users_receive_the_exact_canonical_org_claim(monkeypatch):
    captured = {}

    def admin(method, path, key, *, payload=None, allow_missing=False):
        captured.update(payload["app_metadata"])
        return {
            "id": "d4000000-0000-7000-8000-000000000001",
            "email_confirmed_at": "2026-08-25T00:00:00Z",
        }

    monkeypatch.setattr(identities, "_admin_request", admin)
    identities._create_auth_user(
        "service-key",
        purpose=identities.LIVE18_PURPOSE,
        role="denial",
        run_token="run-token",
        email="masked@example.invalid",
        password="masked-password",
        organization_id=identities.DENIAL_ORG_ID,
    )

    assert captured["org_id"] == identities.DENIAL_ORG_ID
    assert "organization_id" not in captured


def test_live18_profile_exports_only_run_scoped_three_identity_credentials(
    monkeypatch, tmp_path
):
    state_path, github_env = _environment(monkeypatch, tmp_path)
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-key")
    monkeypatch.setenv(
        "PHARMA_CANONICAL_LIVE_API_BASE_URL",
        "https://aasopharma-api-pilot.onrender.com",
    )
    created = iter(
        (
            "d4000000-0000-7000-8000-000000000001",
            "d4000000-0000-7000-8000-000000000002",
            "d4000000-0000-7000-8000-000000000003",
        )
    )
    monkeypatch.setattr(
        identities, "_create_auth_user", lambda *args, **kwargs: next(created)
    )
    monkeypatch.setattr(
        identities, "_list_purpose_auth_user_ids", lambda *args: set()
    )
    monkeypatch.setattr(
        identities, "_verify_live18_owner_delegation", lambda *args: None
    )

    def provision_database(token, path, state, profile):
        assert profile == identities.PROFILE_LIVE18
        state["database_provisioned"] = True
        identities._write_state(path, state)
        return None

    def provision_denial(token, path, state):
        assert state["denial_identity"]["auth_user_id"].endswith("0003")
        state["denial_database_provisioned"] = True
        identities._write_state(path, state)

    monkeypatch.setattr(identities, "_provision_database", provision_database)
    monkeypatch.setattr(
        identities, "_provision_live18_denial_database", provision_denial
    )
    monkeypatch.setattr(
        identities, "_exchange_live18_denial_token", lambda *args: "masked-denial-jwt"
    )

    identities.provision(state_path, identities.PROFILE_LIVE18)

    state = _assert_state_has_no_credentials(state_path)
    assert state["purpose"] == identities.LIVE18_PURPOSE
    assert [row["role"] for row in state["auth_users"]] == [
        "requester", "reviewer", "denial",
    ]
    assert state["denial_database_provisioned"] is True
    exported = github_env.read_text(encoding="utf-8")
    for name in (
        "LIVE18_REQUESTER_EMAIL",
        "LIVE18_REQUESTER_PASSWORD",
        "LIVE18_REVIEWER_EMAIL",
        "LIVE18_REVIEWER_PASSWORD",
        "LIVE18_DENIAL_ACCESS_TOKEN",
        "LIVE18_EXPECTED_ORG_ID",
        "LIVE18_EXPECTED_BRANCH_ID",
        "LIVE18_EXPECTED_DENIAL_ORG_ID",
    ):
        assert exported.count(f"{name}=") == 1
    assert "masked-denial-jwt" not in state_path.read_text(encoding="utf-8")


def test_uncommitted_live18_denial_state_is_not_sent_to_postgresql():
    class RefuseSql:
        def execute(self, *_args, **_kwargs):
            pytest.fail("uncommitted denial state must not issue cleanup SQL")

    identities._cleanup_live18_denial_database(
        RefuseSql(),
        {
            "denial_database_provisioned": False,
            "denial_identity": {
                "auth_user_id": "",
                "user_id": "",
                "membership_id": "",
                "role_id": "",
                "access_grant_id": "",
                "agent_grant_id": "",
            },
        },
    )


def test_committed_live18_denial_state_requires_its_identity_envelope():
    with pytest.raises(
        identities.EphemeralIdentityError, match="omitted its identity envelope"
    ):
        identities._cleanup_live18_denial_database(
            object(), {"denial_database_provisioned": True}
        )


def test_live18_denial_cleanup_handles_commit_before_state_flag(monkeypatch):
    statements = []

    class Cursor:
        def execute(self, statement, *_args, **_kwargs):
            statements.append(" ".join(statement.split()))

        def fetchone(self):
            return (1,)

    monkeypatch.setattr(
        identities,
        "_enter_migration_owner",
        lambda _cursor: pytest.fail("denial helper must use its caller's owner scope"),
    )
    monkeypatch.setattr(
        identities,
        "_leave_migration_owner",
        lambda _cursor, _options: pytest.fail(
            "denial helper must not reset its caller's owner scope"
        ),
    )
    identities._cleanup_live18_denial_database(
        Cursor(),
        {
            "denial_database_provisioned": False,
            "denial_identity": {
                "auth_user_id": "d4000000-0000-7000-8000-000000000001",
                "user_id": "d4000000-0000-7000-8000-000000000002",
                "membership_id": "d4000000-0000-7000-8000-000000000003",
                "role_id": "d4000000-0000-7000-8000-000000000004",
                "access_grant_id": "d4000000-0000-7000-8000-000000000005",
                "agent_grant_id": "d4000000-0000-7000-8000-000000000006",
            },
        },
    )

    assert any("UPDATE core.users" in statement for statement in statements)
    assert not any(" DELETE " in f" {statement} " for statement in statements)


def test_live18_recovers_stale_purpose_users_before_creating_new_ones(
    monkeypatch, tmp_path
):
    state_path, _ = _environment(monkeypatch, tmp_path)
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-key")
    stale = {"d4000000-0000-7000-8000-000000000099"}
    listings = iter((stale, set()))
    monkeypatch.setattr(
        identities, "_list_purpose_auth_user_ids", lambda *args: next(listings)
    )
    recovered = []
    deleted = []
    monkeypatch.setattr(
        identities,
        "_recover_stale_live18_database",
        lambda token, values: recovered.append((token, values)),
    )
    verified = []
    monkeypatch.setattr(
        identities,
        "_verify_live18_owner_delegation",
        lambda token: verified.append(token),
    )
    monkeypatch.setattr(
        identities, "_delete_auth_user", lambda key, value: deleted.append(value)
    )
    created = iter(
        (
            "d4000000-0000-7000-8000-000000000001",
            "d4000000-0000-7000-8000-000000000002",
            "d4000000-0000-7000-8000-000000000003",
        )
    )
    monkeypatch.setattr(
        identities, "_create_auth_user", lambda *args, **kwargs: next(created)
    )
    monkeypatch.setattr(identities, "_provision_database", lambda *args: None)
    monkeypatch.setattr(
        identities, "_provision_live18_denial_database", lambda *args: None
    )
    monkeypatch.setattr(
        identities, "_exchange_live18_denial_token", lambda *args: "denial-token"
    )

    identities.provision(state_path, identities.PROFILE_LIVE18)

    assert recovered == [("management-token", stale)]
    assert deleted == sorted(stale)
    assert verified == ["management-token"]

import base64
import json
import os
import subprocess
import sys

import pytest

from scripts import live18_railway_database_phase as phase
from scripts import provision_ephemeral_browser_identities as identities
from tests.live_canonical.config import LiveGateError, load_live_config


def _live_env() -> dict[str, str]:
    project = "abcdefghijklmnopqrst"
    return {
        "PHARMA_CANONICAL_LIVE_WRITE_ACK": "true",
        "PHARMA_CANONICAL_LIVE_TARGET_KIND": "disposable_test",
        "PHARMA_CANONICAL_LIVE_PROJECT_REF": project,
        "PHARMA_CANONICAL_LIVE_ALLOWED_PROJECT_REF": project,
        "PHARMA_CANONICAL_PRODUCTION_PROJECT_REFS": "zyxwvutsrqponmlkjihg",
        "PHARMA_CANONICAL_LIVE_API_BASE_URL": "https://api.example.test",
        "PHARMA_CANONICAL_LIVE_SERVICE_TOKEN": "service-token",
        "PHARMA_CANONICAL_MCP_URL": "https://mcp.example.test",
        "PHARMA_CANONICAL_MCP_ACCESS_TOKEN": "requester-token",
        "PHARMA_CANONICAL_MCP_REVIEWER_ACCESS_TOKEN": "reviewer-token",
        "PHARMA_CANONICAL_LIVE_TEST_ORG_ID": "11111111-1111-4111-8111-111111111111",
        "PHARMA_CANONICAL_LIVE_TEST_AUTH_USER_ID": "22222222-2222-4222-8222-222222222222",
        "PHARMA_CANONICAL_LIVE_TEST_BRANCH_ID": "33333333-3333-4333-8333-333333333333",
        "PHARMA_CANONICAL_LIVE_DENIAL_ORG_ID": "44444444-4444-4444-8444-444444444444",
        "PHARMA_CANONICAL_LIVE_FIXTURE_INPUT_PATH": "/tmp/live18-fixture.json",
    }


def _boundary_request() -> dict[str, str]:
    return {
        "expected_sha": "a" * 40,
        "project_ref": phase.EXPECTED_PROJECT_REF,
        "run_id": "1234",
        "run_attempt": "2",
        "request_nonce": "b" * 64,
        "deployment_id": "55555555-5555-4555-8555-555555555555",
        "deployment_instance_id": "66666666-6666-4666-8666-666666666666",
        "api_origin": "https://aasopharma-api-pilot-production.up.railway.app",
    }


def test_captured_database_evidence_replaces_the_runner_database_secret():
    values = _live_env()
    values["PHARMA_CANONICAL_LIVE_DATABASE_EVIDENCE_PATH"] = "/tmp/db-evidence.json"
    config = load_live_config(values)
    assert config.database_url is None

    values["PHARMA_CANONICAL_LIVE_DATABASE_EVIDENCE_PATH"] = "relative.json"
    with pytest.raises(LiveGateError, match="must be absolute"):
        load_live_config(values)


def test_direct_identity_transport_never_discovers_or_uses_supavisor(monkeypatch):
    observed = {}
    monkeypatch.setenv("SUPABASE_DB_PASSWORD", "secret")
    monkeypatch.setenv(
        "CANONICAL_EPHEMERAL_DATABASE_TRANSPORT", "railway_direct_ipv6"
    )
    monkeypatch.setattr(
        identities,
        "_request_json",
        lambda *_args, **_kwargs: pytest.fail("direct mode must not query pooler config"),
    )
    monkeypatch.setattr(
        identities.psycopg2,
        "connect",
        lambda **kwargs: observed.update(kwargs) or object(),
    )

    identities._database_connection("management-token")

    assert observed["host"] == f"db.{identities.EXPECTED_PROJECT_REF}.supabase.co"
    assert observed["port"] == 5432
    assert observed["user"] == "postgres"


def test_direct_identity_transport_rejects_unknown_modes(monkeypatch):
    monkeypatch.setenv("SUPABASE_DB_PASSWORD", "secret")
    monkeypatch.setenv("CANONICAL_EPHEMERAL_DATABASE_TRANSPORT", "automatic")
    with pytest.raises(identities.EphemeralIdentityError, match="implicit fallback"):
        identities._database_connection("management-token")


def test_runtime_evidence_requires_deployed_direct_ipv6_url(monkeypatch):
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql://erp_runtime.project:secret@aws-0-ap-south-1.pooler.supabase.com:5432/postgres",
    )
    with pytest.raises(phase.RailwayDatabasePhaseError, match="direct IPv6"):
        phase._direct_runtime_connection(phase.EXPECTED_PROJECT_REF)


def test_runtime_evidence_connects_as_exact_non_admin_role(monkeypatch):
    observed = {}
    monkeypatch.setenv(
        "DATABASE_URL",
        f"postgresql://erp_runtime:p%40ss@db.{phase.EXPECTED_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require",
    )
    monkeypatch.setattr(
        phase.psycopg2,
        "connect",
        lambda **kwargs: observed.update(kwargs) or object(),
    )

    phase._direct_runtime_connection(phase.EXPECTED_PROJECT_REF)

    assert observed == {
        "host": f"db.{phase.EXPECTED_PROJECT_REF}.supabase.co",
        "port": 5432,
        "dbname": "postgres",
        "user": "erp_runtime",
        "password": "p@ss",
        "sslmode": "require",
        "gssencmode": "disable",
        "connect_timeout": 15,
        "application_name": "canonical_live18_railway_direct_evidence",
    }


def test_remote_response_is_content_hash_bound():
    boundary = _boundary_request()
    response = {
        "schema": phase.RESPONSE_SCHEMA,
        "action": "capture-evidence",
        **boundary,
    }
    response["content_sha256"] = phase._content_hash(response)
    request = {**boundary, "response": response}
    assert phase._verify_response(request) == response

    response["expected_sha"] = "b" * 40
    response["content_sha256"] = phase._content_hash(response)
    with pytest.raises(phase.RailwayDatabasePhaseError, match="SHA differs"):
        phase._verify_response(request)

    response["expected_sha"] = "a" * 40
    response["project_ref"] = "unreviewedproject0000"
    response["content_sha256"] = phase._content_hash(response)
    with pytest.raises(phase.RailwayDatabasePhaseError, match="project differs"):
        phase._verify_response(request)


@pytest.mark.parametrize(
    ("key", "replacement", "message"),
    (
        ("run_id", "9999", "run_id differs"),
        ("run_attempt", "3", "run_attempt differs"),
        ("request_nonce", "c" * 64, "request_nonce differs"),
        ("deployment_id", "other-deployment", "deployment_id differs"),
        (
            "deployment_instance_id",
            "other-instance",
            "deployment_instance_id differs",
        ),
    ),
)
def test_remote_response_rejects_a_different_workflow_boundary(
    key, replacement, message
):
    boundary = _boundary_request()
    response = {"schema": phase.RESPONSE_SCHEMA, "action": "capture-evidence", **boundary}
    response[key] = replacement
    response["content_sha256"] = phase._content_hash(response)
    with pytest.raises(phase.RailwayDatabasePhaseError, match=message):
        phase._verify_response({**boundary, "response": response})


@pytest.mark.parametrize(
    ("key", "replacement", "message"),
    (
        ("expected_sha", "main", "exact commit SHA"),
        ("run_id", "run-123", "must be numeric"),
        ("request_nonce", "predictable", "32 random bytes"),
        ("deployment_id", "latest", "exact UUID"),
        ("deployment_instance_id", "first-active", "exact UUID"),
    ),
)
def test_local_caller_boundary_rejects_unbound_inputs(key, replacement, message):
    request = _boundary_request()
    request[key] = replacement
    with pytest.raises(phase.RailwayDatabasePhaseError, match=message):
        phase._caller_boundary(request)


def test_identity_environment_is_authenticated_and_not_plaintext():
    request = {
        **_boundary_request(),
        "transport_key_base64": base64.b64encode(os.urandom(32)).decode("ascii"),
    }
    environment = {key: f"secret-{index}" for index, key in enumerate(sorted(phase.IDENTITY_ENVIRONMENT_KEYS))}
    encrypted = phase._encrypt_environment(request, environment)

    assert phase._decrypt_environment(request, encrypted) == environment
    serialized = json.dumps(encrypted)
    assert all(value not in serialized for value in environment.values())

    encrypted["ciphertext_base64"] = base64.b64encode(os.urandom(48)).decode("ascii")
    with pytest.raises(phase.RailwayDatabasePhaseError, match="authentication failed"):
        phase._decrypt_environment(request, encrypted)


def test_identity_response_applies_only_the_exact_reviewed_environment(tmp_path):
    request = {
        **_boundary_request(),
        "transport_key_base64": base64.b64encode(os.urandom(32)).decode("ascii"),
    }
    environment = {key: f"value-{index}" for index, key in enumerate(sorted(phase.IDENTITY_ENVIRONMENT_KEYS))}
    response = {
        "schema": phase.RESPONSE_SCHEMA,
        "action": "provision-identities",
        **_boundary_request(),
        "encrypted_environment": phase._encrypt_environment(request, environment),
        "browser_state": {"version": 1},
        "mcp_state": {"version": 1},
        "fixture_evidence": {"organization_id": "fixture"},
    }
    response["content_sha256"] = phase._content_hash(response)
    request["response"] = response

    assert phase._apply_identity_response(request, tmp_path) == environment
    assert json.loads((tmp_path / "live18-browser-identities.json").read_text()) == {
        "version": 1
    }

    unexpected = dict(environment)
    unexpected["UNREVIEWED_SECRET"] = "must-not-apply"
    response["encrypted_environment"] = phase._encrypt_environment(request, unexpected)
    response["content_sha256"] = phase._content_hash(response)
    with pytest.raises(phase.RailwayDatabasePhaseError, match="unexpected environment"):
        phase._apply_identity_response(request, tmp_path)


def test_remote_identity_success_retains_only_nonsecret_cleanup_state(
    monkeypatch, tmp_path
):
    request = {
        **_boundary_request(),
        "transport_key_base64": base64.b64encode(os.urandom(32)).decode("ascii"),
        "supabase_url": f"https://{phase.EXPECTED_PROJECT_REF}.supabase.co",
        "mcp_url": "https://mcp.example.test/mcp",
        "secrets": {key: f"secret-{key}" for key in phase.SECRET_KEYS},
    }
    deployed_client_id = "reviewed-public-client"
    generated = {
        key: f"generated-{index}"
        for index, key in enumerate(sorted(phase.IDENTITY_ENVIRONMENT_KEYS))
    }
    generated["MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS"] = deployed_client_id
    observed_api_origins = []

    def provision_browser(state_path, _profile):
        observed_api_origins.append(
            os.environ["PHARMA_CANONICAL_LIVE_API_BASE_URL"]
        )
        state_path.write_text('{"version":1}\n', encoding="utf-8")
        with phase.Path(os.environ["GITHUB_ENV"]).open("a", encoding="utf-8") as handle:
            for key, value in generated.items():
                handle.write(f"{key}={value}\n")

    def provision_mcp(state_path, _browser_state_path):
        state_path.write_text(
            json.dumps({"version": 1, "client_id": deployed_client_id}) + "\n",
            encoding="utf-8",
        )
        phase.Path(
            os.environ["PHARMA_CANONICAL_LIVE_FIXTURE_IDENTITY_EVIDENCE_PATH"]
        ).write_text(
            json.dumps(
                {
                    "organization_id": "fixture",
                    "oauth_client_id": deployed_client_id,
                }
            )
            + "\n",
            encoding="utf-8",
        )

    monkeypatch.setattr(phase, "REMOTE_STATE_ROOT", tmp_path)
    monkeypatch.setattr(
        phase, "_validated_boundary", lambda _request: ("a" * 40, phase.EXPECTED_PROJECT_REF)
    )
    monkeypatch.setattr(phase, "provision_browser_identities", provision_browser)
    monkeypatch.setattr(phase, "provision_mcp_identities", provision_mcp)
    for key in phase.IDENTITY_ENVIRONMENT_KEYS:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS", deployed_client_id)

    response = phase._identity_provision(request)

    directory = tmp_path / (
        "live18-railway-identities-" + request["request_nonce"]
    )
    assert sorted(path.name for path in directory.iterdir()) == [
        "browser-state.json",
        "mcp-state.json",
    ]
    assert phase._decrypt_environment(request, response["encrypted_environment"]) == generated
    assert all(
        key not in os.environ
        for key in phase.IDENTITY_ENVIRONMENT_KEYS
        if key != "MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS"
    )
    assert os.environ["MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS"] == deployed_client_id
    assert observed_api_origins == [request["api_origin"]]


def test_remote_identity_rejects_nonreviewed_api_origin(monkeypatch, tmp_path):
    request = {
        **_boundary_request(),
        "api_origin": "https://aasopharma-api-pilot.onrender.com",
        "transport_key_base64": base64.b64encode(os.urandom(32)).decode("ascii"),
        "supabase_url": f"https://{phase.EXPECTED_PROJECT_REF}.supabase.co",
        "mcp_url": "https://mcp.example.test/mcp",
        "secrets": {key: f"secret-{key}" for key in phase.SECRET_KEYS},
    }
    monkeypatch.setattr(phase, "REMOTE_STATE_ROOT", tmp_path)
    monkeypatch.setattr(
        phase,
        "_validated_boundary",
        lambda _request: ("a" * 40, phase.EXPECTED_PROJECT_REF),
    )
    monkeypatch.setenv("MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS", "reviewed-client")

    with pytest.raises(phase.RailwayDatabasePhaseError, match="reviewed Railway API"):
        phase._identity_provision(request)

    assert not any(tmp_path.iterdir())


@pytest.mark.parametrize(
    "client_id",
    ["", "disabled-unissued-canonical-staging", "one,two", "one two", " padded"],
)
def test_remote_phase_rejects_unreviewed_deployed_oauth_authority(
    monkeypatch, client_id
):
    monkeypatch.setenv("MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS", client_id)
    with pytest.raises(phase.RailwayDatabasePhaseError, match="one reviewed OAuth"):
        phase._deployed_oauth_client_id()


def test_remote_identity_client_mismatch_fails_through_cleanup(monkeypatch, tmp_path):
    request = {
        **_boundary_request(),
        "transport_key_base64": base64.b64encode(os.urandom(32)).decode("ascii"),
        "supabase_url": f"https://{phase.EXPECTED_PROJECT_REF}.supabase.co",
        "mcp_url": "https://mcp.example.test/mcp",
        "secrets": {key: f"secret-{key}" for key in phase.SECRET_KEYS},
    }
    deployed_client_id = "reviewed-public-client"
    cleaned = []

    def provision_browser(state_path, _profile):
        state_path.write_text('{"version":1}\n', encoding="utf-8")
        with phase.Path(os.environ["GITHUB_ENV"]).open(
            "a", encoding="utf-8"
        ) as handle:
            for key in sorted(phase.IDENTITY_ENVIRONMENT_KEYS):
                value = (
                    "different-client"
                    if key == "MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS"
                    else f"generated-{key}"
                )
                handle.write(f"{key}={value}\n")

    def provision_mcp(state_path, _browser_state_path):
        state_path.write_text(
            '{"version":1,"client_id":"different-client"}\n', encoding="utf-8"
        )
        phase.Path(
            os.environ["PHARMA_CANONICAL_LIVE_FIXTURE_IDENTITY_EVIDENCE_PATH"]
        ).write_text(
            '{"organization_id":"fixture","oauth_client_id":"different-client"}\n',
            encoding="utf-8",
        )

    monkeypatch.setattr(phase, "REMOTE_STATE_ROOT", tmp_path)
    monkeypatch.setattr(
        phase,
        "_validated_boundary",
        lambda _request: ("a" * 40, phase.EXPECTED_PROJECT_REF),
    )
    monkeypatch.setattr(phase, "provision_browser_identities", provision_browser)
    monkeypatch.setattr(phase, "provision_mcp_identities", provision_mcp)
    monkeypatch.setattr(
        phase,
        "cleanup_mcp_identities",
        lambda path: cleaned.append(("mcp", path.name)) or path.unlink(),
    )
    monkeypatch.setattr(
        phase,
        "cleanup_browser_identities",
        lambda path: cleaned.append(("browser", path.name)) or path.unlink(),
    )
    monkeypatch.setenv("MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS", deployed_client_id)

    with pytest.raises(phase.RailwayDatabasePhaseError, match="differs from the exact"):
        phase._identity_provision(request)

    assert cleaned == [("mcp", "mcp-state.json"), ("browser", "browser-state.json")]
    assert not (
        tmp_path / ("live18-railway-identities-" + request["request_nonce"])
    ).exists()


def test_remote_identity_failure_preserves_redacted_provision_and_cleanup_detail(
    monkeypatch, tmp_path
):
    database_url = "postgresql://admin:database-secret@db.example.test/postgres"
    request = {
        **_boundary_request(),
        "transport_key_base64": base64.b64encode(os.urandom(32)).decode("ascii"),
        "supabase_url": f"https://{phase.EXPECTED_PROJECT_REF}.supabase.co",
        "mcp_url": "https://mcp.example.test/mcp",
        "secrets": {
            "SUPABASE_ACCESS_TOKEN": "management-secret",
            "SUPABASE_DB_PASSWORD": "database-secret",
            "SUPABASE_ANON_KEY": "anon-secret",
        },
    }

    def fail_provision(state_path, _profile):
        state_path.write_text('{"version":1}\n', encoding="utf-8")
        raise identities.EphemeralIdentityError(
            f"auth exchange rejected management-secret via {database_url}"
        )

    def fail_cleanup(_state_path):
        raise identities.EphemeralIdentityError(
            "database cleanup rejected database-secret"
        )

    def fail_recovery():
        raise identities.EphemeralIdentityError(
            "orphan recovery rejected anon-secret"
        )

    monkeypatch.setattr(phase, "REMOTE_STATE_ROOT", tmp_path)
    monkeypatch.setattr(
        phase,
        "_validated_boundary",
        lambda _request: ("a" * 40, phase.EXPECTED_PROJECT_REF),
    )
    monkeypatch.setattr(phase, "provision_browser_identities", fail_provision)
    monkeypatch.setattr(phase, "cleanup_browser_identities", fail_cleanup)
    monkeypatch.setattr(phase, "recover_lost_live18_state", fail_recovery)
    monkeypatch.setenv("MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS", "reviewed-public-client")
    monkeypatch.setenv("DATABASE_URL", database_url)

    with pytest.raises(phase.RailwayDatabasePhaseError) as captured:
        phase._identity_provision(request)

    message = str(captured.value)
    assert "identity provisioning failed: EphemeralIdentityError" in message
    assert "browser cleanup failed: EphemeralIdentityError" in message
    assert "orphan reconciliation failed: EphemeralIdentityError" in message
    assert "auth exchange rejected [REDACTED]" in message
    assert "database cleanup rejected [REDACTED]" in message
    assert "orphan recovery rejected [REDACTED]" in message
    assert "[REDACTED_DATABASE_URL]" in message
    assert "management-secret" not in message
    assert "database-secret" not in message
    assert "anon-secret" not in message


def test_remote_execution_is_bound_to_exact_deployment_and_provenance(
    monkeypatch, tmp_path
):
    boundary = _boundary_request()
    provenance = tmp_path / "provenance"
    provenance.write_text(boundary["expected_sha"] + ":1234:2\n", encoding="utf-8")
    monkeypatch.setattr(phase, "DEPLOYMENT_PROVENANCE_PATH", provenance)
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", boundary["expected_sha"])
    monkeypatch.setenv("RAILWAY_DEPLOYMENT_ID", boundary["deployment_id"])

    assert phase._validated_boundary(boundary) == (
        boundary["expected_sha"],
        boundary["project_ref"],
    )

    monkeypatch.setenv("RAILWAY_DEPLOYMENT_ID", "replacement-deployment")
    with pytest.raises(phase.RailwayDatabasePhaseError, match="deployment differs"):
        phase._validated_boundary(boundary)


def test_partial_remote_identity_state_is_still_cleaned(monkeypatch, tmp_path):
    request = {
        **_boundary_request(),
        "supabase_url": f"https://{phase.EXPECTED_PROJECT_REF}.supabase.co",
        "secrets": {key: "secret" for key in phase.SECRET_KEYS},
    }
    directory = tmp_path / ("live18-railway-identities-" + request["request_nonce"])
    directory.mkdir()
    browser_state = directory / "browser-state.json"
    browser_state.write_text('{"version":1}\n', encoding="utf-8")
    observed = []
    monkeypatch.setattr(phase, "REMOTE_STATE_ROOT", tmp_path)
    monkeypatch.setattr(
        phase, "_validated_boundary", lambda _request: ("a" * 40, phase.EXPECTED_PROJECT_REF)
    )
    monkeypatch.setattr(
        phase, "cleanup_browser_identities", lambda path: observed.append(path) or path.unlink()
    )
    monkeypatch.setattr(
        phase, "cleanup_mcp_identities", lambda _path: pytest.fail("missing MCP state must be a no-op")
    )
    monkeypatch.setattr(
        phase,
        "recover_lost_live18_state",
        lambda: {
            "recovered_auth_identity_count": 0,
            "remaining_auth_identity_count": 0,
            "remaining_active_temporary_grant_count": 0,
            "remaining_denial_role_count": 0,
            "remaining_active_denial_authority_count": 0,
            "remaining_denial_auth_binding_count": 0,
        },
    )

    response = phase._identity_cleanup(request)

    assert observed == [browser_state]
    assert response["cleaned"] is True
    assert not directory.exists()


def test_zero_remote_state_runs_durable_orphan_reconciliation(monkeypatch, tmp_path):
    request = {
        **_boundary_request(),
        "supabase_url": f"https://{phase.EXPECTED_PROJECT_REF}.supabase.co",
        "secrets": {key: "secret" for key in phase.SECRET_KEYS},
    }
    reconciliation = {
        "recovered_auth_identity_count": 3,
        "remaining_auth_identity_count": 0,
        "remaining_active_temporary_grant_count": 0,
        "remaining_denial_role_count": 0,
        "remaining_active_denial_authority_count": 0,
        "remaining_denial_auth_binding_count": 0,
    }
    monkeypatch.setattr(phase, "REMOTE_STATE_ROOT", tmp_path)
    monkeypatch.setattr(
        phase, "_validated_boundary", lambda _request: ("a" * 40, phase.EXPECTED_PROJECT_REF)
    )
    monkeypatch.setattr(
        phase, "recover_lost_live18_state", lambda: reconciliation
    )

    response = phase._identity_cleanup(request)

    assert response["cleaned"] is True
    assert response["orphan_reconciliation"] == reconciliation
    assert not any(tmp_path.iterdir())


def test_clean_orphan_reconciliation_supersedes_failed_stateful_cleanup(
    monkeypatch, tmp_path
):
    request = {
        **_boundary_request(),
        "supabase_url": f"https://{phase.EXPECTED_PROJECT_REF}.supabase.co",
        "secrets": {key: "secret" for key in phase.SECRET_KEYS},
    }
    directory = tmp_path / ("live18-railway-identities-" + request["request_nonce"])
    directory.mkdir()
    browser_state = directory / "browser-state.json"
    browser_state.write_text('{"version":1}\n', encoding="utf-8")
    reconciliation = {
        "recovered_auth_identity_count": 3,
        "remaining_auth_identity_count": 0,
        "remaining_active_temporary_grant_count": 0,
        "remaining_denial_role_count": 0,
        "remaining_active_denial_authority_count": 0,
        "remaining_denial_auth_binding_count": 0,
    }
    monkeypatch.setattr(phase, "REMOTE_STATE_ROOT", tmp_path)
    monkeypatch.setattr(
        phase,
        "_validated_boundary",
        lambda _request: ("a" * 40, phase.EXPECTED_PROJECT_REF),
    )
    monkeypatch.setattr(
        phase,
        "cleanup_browser_identities",
        lambda _path: (_ for _ in ()).throw(
            identities.EphemeralIdentityError("stale state was already recovered")
        ),
    )
    monkeypatch.setattr(
        phase, "recover_lost_live18_state", lambda: reconciliation
    )

    response = phase._identity_cleanup(request)

    assert response["cleaned"] is True
    assert response["orphan_reconciliation"] == reconciliation
    assert response["cleanup_warnings"] == [
        "browser cleanup failed: EphemeralIdentityError: stale state was already recovered"
    ]
    assert not directory.exists()


@pytest.mark.parametrize("invalid_zero", (False, 0.0))
def test_orphan_reconciliation_rejects_non_integer_zeroes(invalid_zero):
    reconciliation = {
        "recovered_auth_identity_count": 0,
        "remaining_auth_identity_count": invalid_zero,
        "remaining_active_temporary_grant_count": 0,
        "remaining_denial_role_count": 0,
        "remaining_active_denial_authority_count": 0,
        "remaining_denial_auth_binding_count": 0,
    }

    assert phase._orphan_reconciliation_is_clean(reconciliation) is False


def test_browser_orphan_reconciliation_cannot_supersede_failed_mcp_cleanup(
    monkeypatch, tmp_path
):
    request = {
        **_boundary_request(),
        "supabase_url": f"https://{phase.EXPECTED_PROJECT_REF}.supabase.co",
        "secrets": {key: "secret" for key in phase.SECRET_KEYS},
    }
    directory = tmp_path / ("live18-railway-identities-" + request["request_nonce"])
    directory.mkdir()
    mcp_state = directory / "mcp-state.json"
    mcp_state.write_text('{"version":1}\n', encoding="utf-8")
    reconciliation = {
        "recovered_auth_identity_count": 0,
        "remaining_auth_identity_count": 0,
        "remaining_active_temporary_grant_count": 0,
        "remaining_denial_role_count": 0,
        "remaining_active_denial_authority_count": 0,
        "remaining_denial_auth_binding_count": 0,
    }
    monkeypatch.setattr(phase, "REMOTE_STATE_ROOT", tmp_path)
    monkeypatch.setattr(
        phase,
        "_validated_boundary",
        lambda _request: ("a" * 40, phase.EXPECTED_PROJECT_REF),
    )
    monkeypatch.setattr(
        phase,
        "cleanup_mcp_identities",
        lambda _path: (_ for _ in ()).throw(
            RuntimeError("temporary MCP authority is still active")
        ),
    )
    monkeypatch.setattr(
        phase, "recover_lost_live18_state", lambda: reconciliation
    )

    with pytest.raises(phase.RailwayDatabasePhaseError, match="MCP cleanup failed"):
        phase._identity_cleanup(request)

    assert directory.exists()
    assert mcp_state.exists()


def test_remote_prepare_rejects_missing_lineage_and_cross_branch(monkeypatch):
    class Validated:
        def __init__(self, payload):
            self.payload = payload

        def model_dump(self, **_kwargs):
            return self.payload

    class Model:
        @staticmethod
        def model_validate(payload):
            return Validated(payload)

    operation = "test.operation.prepare"
    path = f"/api/web/actions/{operation}/prepare"
    evidence = {
        "command_operation": operation,
        "branch_id": "11111111-1111-4111-8111-111111111111",
        "http_evidence": [
            {
                "method": "POST",
                "path": path,
                "status": 200,
                "requestBody": {"branch_id": "", "lines": [{}]},
            }
        ],
    }
    monkeypatch.setitem(phase.PREPARE_PAYLOAD_MODELS, operation, Model)
    monkeypatch.setitem(
        phase.MANDATORY_LINEAGE_PATHS, operation, ("branch_id", "lines.0.batch_id")
    )
    monkeypatch.setattr(phase, "validate_prepare_payload_semantics", lambda *_args: None)

    with pytest.raises(phase.RailwayDatabasePhaseError, match="mandatory canonical lineage"):
        phase._prepare_request(evidence)

    evidence["http_evidence"][0]["requestBody"] = {
        "branch_id": "22222222-2222-4222-8222-222222222222",
        "lines": [{"batch_id": "33333333-3333-4333-8333-333333333333"}],
    }
    with pytest.raises(phase.RailwayDatabasePhaseError, match="evidence envelope"):
        phase._prepare_request(evidence)


def test_exact_migrations_upgrade_to_packaged_head_twice_with_process_local_admin_url(
    monkeypatch
):
    upgrades = []
    delegations = []

    class Configuration:
        def __init__(self, _path):
            pass

        def set_main_option(self, _key, _value):
            pass

    class Scripts:
        @staticmethod
        def from_config(_configuration):
            return Scripts()

        def get_current_head(self):
            return "20260826_9999"

        def get_bases(self):
            return ["20260820_0001"]

    def upgrade(_configuration, revision):
        upgrades.append((revision, os.environ.get("DATABASE_URL")))

    monkeypatch.setattr(phase, "AlembicConfig", Configuration)
    monkeypatch.setattr(phase, "ScriptDirectory", Scripts)
    monkeypatch.setattr(phase.alembic_command, "upgrade", upgrade)
    monkeypatch.setattr(
        phase,
        "_set_admin_owner_delegation",
        lambda _url, enabled: delegations.append(enabled),
    )
    monkeypatch.setattr(
        phase, "_verify_admin_owner_delegation_removed", lambda _url: None
    )
    monkeypatch.setenv("DATABASE_URL", "postgresql://erp_runtime@runtime/postgres")

    assert phase._upgrade_exact_migration_head("postgresql://postgres@admin/postgres") == (
        "20260826_9999"
    )
    assert upgrades == [
        ("20260826_9999", "postgresql://postgres@admin/postgres"),
        ("20260826_9999", "postgresql://postgres@admin/postgres"),
    ]
    assert delegations == [True, False]
    assert os.environ["DATABASE_URL"] == "postgresql://erp_runtime@runtime/postgres"


def test_railway_live18_workflow_has_fail_closed_remote_lifecycle():
    workflow = (
        phase.BACKEND_DIRECTORY.parent
        / ".github"
        / "workflows"
        / "production-readiness.yml"
    ).read_text(encoding="utf-8")
    live18 = workflow.split("\n  live18-acceptance:", 1)[1]

    assert "needs.canonical-free-staging.result == 'skipped'" in live18
    assert "needs.railway-canonical-staging.result == 'success'" in live18
    assert "live18_railway_database_phase.py provision-demo" in live18
    assert "live18_railway_database_phase.py provision-identities" in live18
    assert "live18_railway_database_phase.py capture-evidence" in live18
    assert "live18_railway_database_phase.py cleanup-identities" in live18
    assert "railway ssh keys add" in live18
    assert "railway ssh keys remove" in live18
    assert (
        'LIVE18_RAILWAY_SSH_PRIVATE_KEY=$HOME/.ssh/live18-railway-'
        '${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}' in live18
    )
    assert 'mkdir -p "$HOME/.ssh"' in live18
    assert 'chmod 700 "$HOME/.ssh"' in live18
    assert '"$HOME/.railway"' in live18
    assert "'Host ssh.railway.com'" in live18
    assert 'UserKnownHostsFile $HOME/.railway/known_hosts_relay' in live18
    assert "'    StrictHostKeyChecking accept-new'" in live18
    assert "StrictHostKeyChecking no" not in live18
    assert "StrictHostKeyChecking=no" not in live18
    assert "UserKnownHostsFile /dev/null" not in live18
    assert 'chmod 600 "$HOME/.ssh/config"' in live18
    assert live18.index('> "$HOME/.ssh/config"') < live18.index(
        'railway ssh \\\n'
    )
    assert '--key "$LIVE18_RAILWAY_SSH_PRIVATE_KEY.pub"' in live18
    assert '--identity-file "$LIVE18_RAILWAY_SSH_PRIVATE_KEY"' in live18
    assert 'rm -f "$LIVE18_RAILWAY_SSH_PRIVATE_KEY"' in live18
    cleanup = live18.split(
        "- name: Always remove the run-scoped Railway SSH key", 1
    )[1]
    remote_remove = cleanup.index('railway ssh keys remove "$fingerprint"')
    local_remove = cleanup.index(
        'rm -f "$LIVE18_RAILWAY_SSH_PRIVATE_KEY.pub"'
    )
    post_remove_list = cleanup.index(
        'railway ssh keys list > "$RUNNER_TEMP/live18-railway-ssh-keys-after.txt"'
    )
    assert remote_remove < local_remove < post_remove_list
    assert (
        "--deployment-instance \"$RAILWAY_API_DEPLOYMENT_INSTANCE_ID\"" in live18
    )
    assert "expected one exact running API instance" in live18
    assert 'ref: ${{ inputs.canonical_staging_render_sha }}' in live18
    assert '--project "$RAILWAY_PROJECT_ID"' in live18
    assert '--environment "$RAILWAY_ENVIRONMENT_ID"' in live18
    artifact = live18.split(
        "- name: Upload scrubbed allowlisted live18 evidence only", 1
    )[1]
    assert "live18-railway-identity-response.json" not in artifact
    assert "live18-railway-identity-request.json" not in artifact


def test_remote_phase_imports_without_the_test_only_pytest_package():
    environment = dict(os.environ)
    environment["PYTHONPATH"] = str(phase.BACKEND_DIRECTORY)
    completed = subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys; sys.modules['pytest']=None; "
            "import scripts.live18_railway_database_phase",
        ],
        cwd=phase.BACKEND_DIRECTORY.parent,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr


def test_api_image_packages_every_import_time_live18_contract():
    dockerfile = (
        phase.BACKEND_DIRECTORY.parent / "deploy" / "railway" / "api.Dockerfile"
    ).read_text(encoding="utf-8")
    assert "COPY backend/ ." in dockerfile
    assert (
        "COPY database/schema-authority.json "
        "/app/database/schema-authority.json"
    ) in dockerfile
    assert (
        "COPY database/canonical/domains/_contract.json "
        "/app/database/canonical/domains/_contract.json"
    ) in dockerfile
    assert "RUN python scripts/canonical_migration_contract.py --print-head" in dockerfile
    assert (
        "COPY docs/architecture/mcp-operator-actions.json "
        "/app/docs/architecture/mcp-operator-actions.json"
    ) in dockerfile
    assert identities.LIVE18_MATRIX_PATH == (
        identities.BACKEND_ROOT / "tests/live_acceptance/operation_matrix.json"
    )


def test_identity_phase_binds_project_only_in_process_environment():
    source = phase.Path(phase.__file__).read_text(encoding="utf-8")
    identity = source[source.index("def _identity_provision") : source.index("def _restore_state")]
    assert '"CANONICAL_STAGING_PROJECT_REF": project_ref' in identity


def test_packaged_remote_matrix_covers_all_18_operations():
    operations = phase._ready_operations()
    assert len(operations) == 18
    assert len({row["command_operation"] for row in operations}) == 17

import base64
import contextlib
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


def _reviewed_scalar_pack() -> dict[str, object]:
    return {
        "schema": "aasopharma.live18.reviewed-scalars.v1",
        "values": {
            "purchase_order_quantity": "2.000000",
            "purchase_order_delivery_offset_days": "3",
            "purchase_order_rate": "84.0000",
            "purchase_order_line_discount_percent": "0.000000",
            "purchase_order_free_quantity": "0.000000",
            "purchase_order_document_discount": "0.00",
            "purchase_order_freight_charge": "0.00",
            "goods_receipt_received_quantity": "2.000000",
            "goods_receipt_accepted_quantity": "2.000000",
            "goods_receipt_rejected_quantity": "0.000000",
            "goods_receipt_free_quantity": "0.000000",
            "goods_receipt_mrp": "150.00",
            "goods_receipt_qc_status": "accepted",
        },
    }


def _fixture_identities() -> dict[str, str]:
    keys = (
        "branch_id",
        "customer_account_id",
        "supplier_account_id",
        "product_id",
        "uom_conversion_id",
        "count_uom_conversion_id",
        "saleable_location_id",
        "quarantine_location_id",
        "transfer_destination_branch_id",
        "transfer_destination_location_id",
        "bank_account_id",
        "bank_ledger_id",
        "cycle_count_evidence_attachment_id",
    )
    return {
        key: f"00000000-0000-4000-8000-{index:012d}"
        for index, key in enumerate(keys, start=1)
    }


def _authoritative_fact_evidence() -> dict[str, object]:
    return {
        "schema": "aasopharma.live18.authoritative-facts.v1",
        "expected_sha": "a" * 40,
        "project_ref": phase.EXPECTED_PROJECT_REF,
        "run_token": "1234-2",
        "organization_id": "11111111-1111-4111-8111-111111111111",
        "auth_user_id": "22222222-2222-4222-8222-222222222222",
        "fixture_identities": _fixture_identities(),
        "facts": {key: {} for key in ("identity", "display", "clock", "choice")},
    }


def test_remote_demo_accepts_only_a_reconciled_reviewed_scalar_pack() -> None:
    pack = _reviewed_scalar_pack()

    serialized = phase._reviewed_scalar_environment_value(
        {"reviewed_scalars": pack}
    )

    assert json.loads(serialized) == pack
    assert " " not in serialized

    pack["values"]["goods_receipt_free_quantity"] = "1.000000"
    with pytest.raises(
        phase.RailwayDatabasePhaseError, match="scalar authority is invalid"
    ):
        phase._reviewed_scalar_environment_value({"reviewed_scalars": pack})


def test_remote_demo_rejects_missing_or_oversized_scalar_authority() -> None:
    with pytest.raises(
        phase.RailwayDatabasePhaseError, match="scalar authority is invalid"
    ):
        phase._reviewed_scalar_environment_value({})

    pack = _reviewed_scalar_pack()
    pack["values"]["unreviewed_note"] = "x" * (phase.MAX_REQUEST_BYTES // 2)
    with pytest.raises(
        phase.RailwayDatabasePhaseError, match="scalar authority is invalid"
    ):
        phase._reviewed_scalar_environment_value({"reviewed_scalars": pack})


def test_demo_opens_session_authority_only_through_reviewed_fence(monkeypatch) -> None:
    calls = []
    monkeypatch.setattr(
        phase,
        "_verify_admin_owner_delegation_removed",
        lambda _database_url: calls.append("preverified"),
    )

    @contextlib.contextmanager
    def delegation(_database_url):
        calls.append("delegated")
        yield
        calls.append("removed")

    monkeypatch.setattr(phase, "_temporary_admin_owner_delegation", delegation)
    monkeypatch.setattr(
        phase,
        "apply_fence",
        lambda database_url, *, action, commit_sha: calls.append(
            (database_url, action, commit_sha)
        ) or {"state": "open", "commit_sha": commit_sha},
    )

    receipt = phase._open_session_authority_after_demo(
        "postgresql://admin@canonical/postgres",
        "a" * 40,
    )

    assert receipt["state"] == "open"
    assert calls == [
        "preverified",
        "delegated",
        ("postgresql://admin@canonical/postgres", "open", "a" * 40),
        "removed",
    ]


def test_demo_refuses_to_publish_unopened_session_authority(monkeypatch) -> None:
    monkeypatch.setattr(
        phase,
        "_verify_admin_owner_delegation_removed",
        lambda _database_url: None,
    )

    @contextlib.contextmanager
    def delegation(_database_url):
        yield

    monkeypatch.setattr(phase, "_temporary_admin_owner_delegation", delegation)
    monkeypatch.setattr(
        phase,
        "apply_fence",
        lambda *_args, **_kwargs: {"state": "closed"},
    )

    with pytest.raises(
        phase.RailwayDatabasePhaseError,
        match="session authority was not opened",
    ):
        phase._open_session_authority_after_demo(
            "postgresql://admin@canonical/postgres",
            "a" * 40,
        )


def test_open_cleanup_failure_compensates_back_to_closed(monkeypatch) -> None:
    actions = []
    delegation_count = 0

    monkeypatch.setattr(
        phase,
        "_verify_admin_owner_delegation_removed",
        lambda _database_url: None,
    )

    @contextlib.contextmanager
    def delegation(_database_url):
        nonlocal delegation_count
        delegation_count += 1
        yield
        if delegation_count == 1:
            raise RuntimeError("injected cleanup failure")

    def fence(_database_url, *, action, commit_sha):
        actions.append(action)
        return {
            "state": "open" if action == "open" else "closed",
            "commit_sha": commit_sha,
        }

    monkeypatch.setattr(phase, "_temporary_admin_owner_delegation", delegation)
    monkeypatch.setattr(phase, "apply_fence", fence)

    with pytest.raises(
        phase.RailwayDatabasePhaseError,
        match="could not be opened from a clean owner boundary",
    ):
        phase._open_session_authority_after_demo(
            "postgresql://admin@canonical/postgres",
            "a" * 40,
        )

    assert actions == ["open", "close"]


def test_demo_validates_owner_cleanup_and_evidence_before_opening() -> None:
    source = phase.Path(phase.__file__).read_text(encoding="utf-8")
    demo = source.split("def _demo_provision", 1)[1].split(
        "\ndef _parse_environment_file", 1
    )[0]

    provisioning = demo.index('action="provision"')
    provision = demo.index("with _temporary_admin_owner_delegation(admin_url):")
    summary = demo.index("summary_path = evidence_dir")
    reviewed_operator = demo.index("_validate_reviewed_web_operator")
    evidence = demo.index("evidence_hashes =")
    opening = demo.index("write_fence = _open_session_authority_after_demo")
    compensation = demo.index('action="close"')
    assert provisioning < provision < summary < reviewed_operator < evidence < opening < compensation


def test_demo_provisioning_and_close_transitions_use_exact_fence_receipts(monkeypatch) -> None:
    calls = []
    monkeypatch.setattr(
        phase,
        "_verify_admin_owner_delegation_removed",
        lambda _database_url: calls.append("preverified"),
    )

    @contextlib.contextmanager
    def delegation(_database_url):
        calls.append("delegated")
        yield
        calls.append("removed")

    monkeypatch.setattr(phase, "_temporary_admin_owner_delegation", delegation)
    monkeypatch.setattr(
        phase,
        "apply_fence",
        lambda database_url, *, action, commit_sha: calls.append(
            (database_url, action, commit_sha)
        ) or {"state": "provisioning" if action == "provision" else "closed", "commit_sha": commit_sha},
    )

    receipt = phase._set_session_authority_state(
        "postgresql://admin@canonical/postgres",
        "a" * 40,
        action="provision",
        expected_state="provisioning",
    )

    assert receipt["state"] == "provisioning"
    assert calls == [
        "preverified",
        "delegated",
        ("postgresql://admin@canonical/postgres", "provision", "a" * 40),
        "removed",
    ]


def test_reviewed_web_operator_readback_must_match_exact_auth_user() -> None:
    auth_user_id = "11111111-1111-4111-8111-111111111111"
    authority = {
        "auth_user_id": auth_user_id,
        "user_id": "22222222-2222-4222-8222-222222222222",
        "membership_id": "33333333-3333-4333-8333-333333333333",
        "access_grant_id": "44444444-4444-4444-8444-444444444444",
    }
    assert phase._validate_reviewed_web_operator(
        {"reviewed_web_operator": authority}, auth_user_id
    ) == authority

    with pytest.raises(
        phase.RailwayDatabasePhaseError, match="differs from the reviewed identity"
    ):
        phase._validate_reviewed_web_operator(
            {"reviewed_web_operator": authority},
            "55555555-5555-4555-8555-555555555555",
        )


def test_railway_live18_demo_restores_the_reviewed_web_operator() -> None:
    workflow = (
        phase.BACKEND_DIRECTORY.parent
        / ".github"
        / "workflows"
        / "production-readiness.yml"
    ).read_text(encoding="utf-8")
    live18 = workflow.split("\n  live18-acceptance:", 1)[1]

    assert (
        "CANONICAL_STAGING_WEB_TEST_AUTH_USER_ID: "
        "${{ vars.CANONICAL_STAGING_WEB_TEST_AUTH_USER_ID }}" in live18
    )
    assert '"reviewed_web_auth_user_id": os.environ[' in live18
    source = phase.BACKEND_DIRECTORY.joinpath(
        "scripts", "provision_canonical_demo.py"
    ).read_text(encoding="utf-8")
    assert "bind_reviewed_web_operator(bootstrap, reviewed_web_auth_user_id)" in source
    assert '"reviewed_web_operator": reviewed_web_operator' in source
    bootstrap_call = source.index("bootstrap_identity(bootstrap)")
    reconciliation = source.index("cross_table_reconciliation =")
    auth_lookup = source.index(
        "bind_reviewed_web_operator(bootstrap, reviewed_web_auth_user_id)",
        bootstrap_call,
    )
    summary = source.index("summary = {", auth_lookup)
    assert bootstrap_call < reconciliation < auth_lookup < summary
    assert "partially provisioned" in source[reconciliation:auth_lookup]


def test_demo_uses_a_deployment_bound_provisioning_token_profile() -> None:
    source = phase.BACKEND_DIRECTORY.joinpath(
        "scripts", "provision_canonical_demo.py"
    ).read_text(encoding="utf-8")
    token_source = source.split("def token(", 1)[1].split("\ndef api_call", 1)[0]
    for contract in (
        'CANONICAL_PROVISIONING_PROVIDER',
        'canonical_provisioning_operator_v1',
        'provisioning_provider',
        'provisioning_deployment_sha',
        'provisioning_run_id',
        'provisioning_run_attempt',
        'RAILWAY_GIT_COMMIT_SHA',
        'RENDER_GIT_COMMIT',
    ):
        assert contract in token_source


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
        "authoritative_facts": _authoritative_fact_evidence(),
    }
    response["content_sha256"] = phase._content_hash(response)
    request["response"] = response

    assert phase._apply_identity_response(request, tmp_path) == environment
    assert json.loads((tmp_path / "live18-browser-identities.json").read_text()) == {
        "version": 1
    }
    assert json.loads(
        (tmp_path / "live18-authoritative-facts.json").read_text()
    ) == _authoritative_fact_evidence()

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
    generated["PHARMA_CANONICAL_LIVE_TEST_AUTH_USER_ID"] = (
        "22222222-2222-4222-8222-222222222222"
    )
    observed_api_origins = []
    observed_fixture_run_tokens = []
    observed_fact_resolution = []

    def provision_browser(state_path, _profile):
        observed_api_origins.append(
            os.environ["PHARMA_CANONICAL_LIVE_API_BASE_URL"]
        )
        state_path.write_text('{"version":1}\n', encoding="utf-8")
        with phase.Path(os.environ["GITHUB_ENV"]).open("a", encoding="utf-8") as handle:
            for key, value in generated.items():
                handle.write(f"{key}={value}\n")

    def provision_mcp(state_path, _browser_state_path, fixture_run_token):
        observed_fixture_run_tokens.append(fixture_run_token)
        state_path.write_text(
            json.dumps({"version": 1, "client_id": deployed_client_id}) + "\n",
            encoding="utf-8",
        )
        phase.Path(
            os.environ["PHARMA_CANONICAL_LIVE_FIXTURE_IDENTITY_EVIDENCE_PATH"]
        ).write_text(
            json.dumps(
                {
                    "organization_id": "11111111-1111-4111-8111-111111111111",
                    "oauth_client_id": deployed_client_id,
                    "fixture_identities": _fixture_identities(),
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
    monkeypatch.setattr(
        phase,
        "_validated_direct_role_url",
        lambda value, project_ref, role: "validated-runtime-url",
    )
    monkeypatch.setattr(
        phase,
        "resolve_authoritative_facts",
        lambda database_url, auth_user_id, org_id, fixture_ids, run_token: (
            observed_fact_resolution.append(
                (database_url, auth_user_id, org_id, fixture_ids, run_token)
            )
            or {key: {} for key in ("identity", "display", "clock", "choice")}
        ),
    )
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
    assert observed_fact_resolution == [
        (
            "validated-runtime-url",
            "22222222-2222-4222-8222-222222222222",
            "11111111-1111-4111-8111-111111111111",
            _fixture_identities(),
            "1234-2",
        )
    ]
    assert response["authoritative_facts"] == _authoritative_fact_evidence()
    assert all(
        key not in os.environ
        for key in phase.IDENTITY_ENVIRONMENT_KEYS
        if key != "MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS"
    )
    assert os.environ["MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS"] == deployed_client_id
    assert observed_api_origins == [request["api_origin"]]
    assert observed_fixture_run_tokens == ["1234-2"]


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

    def provision_mcp(state_path, _browser_state_path, _fixture_run_token):
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
    monkeypatch.setattr(
        phase,
        "recover_lost_live18_mcp_state",
        lambda *_args: {
            "recovered_active_mcp_grant_count": 0,
            "remaining_active_mcp_grant_count": 0,
        },
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
        phase,
        "cleanup_browser_identities",
        lambda path: observed.append("browser") or path.unlink(),
    )
    monkeypatch.setattr(
        phase, "cleanup_mcp_identities", lambda _path: pytest.fail("missing MCP state must be a no-op")
    )
    monkeypatch.setenv("MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS", "reviewed-client")
    monkeypatch.setattr(
        phase,
        "recover_lost_live18_mcp_state",
        lambda *_args: observed.append("mcp-recovery")
        or {
            "recovered_active_mcp_grant_count": 0,
            "remaining_active_mcp_grant_count": 0,
        },
    )
    monkeypatch.setattr(
        phase,
        "recover_lost_live18_state",
        lambda: {
            "recovered_auth_identity_count": 0,
            "remaining_auth_identity_count": 0,
            "remaining_active_temporary_grant_count": 0,
            "recovered_active_mcp_grant_count": 0,
            "remaining_active_mcp_grant_count": 0,
            "remaining_denial_role_count": 0,
            "remaining_active_denial_authority_count": 0,
            "remaining_denial_auth_binding_count": 0,
        },
    )

    response = phase._identity_cleanup(request)

    assert observed == ["mcp-recovery", "browser"]
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
        "recovered_active_mcp_grant_count": 0,
        "remaining_active_mcp_grant_count": 0,
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
    monkeypatch.setenv("MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS", "reviewed-client")
    monkeypatch.setattr(
        phase,
        "recover_lost_live18_mcp_state",
        lambda *_args: {
            "recovered_active_mcp_grant_count": 0,
            "remaining_active_mcp_grant_count": 0,
        },
    )

    response = phase._identity_cleanup(request)

    assert response["cleaned"] is True
    assert response["orphan_reconciliation"] == reconciliation
    assert not any(tmp_path.iterdir())


def test_pre_demo_cleanup_uses_the_identity_pristine_aware_recovery(
    monkeypatch, tmp_path
):
    request = {
        **_boundary_request(),
        "supabase_url": f"https://{phase.EXPECTED_PROJECT_REF}.supabase.co",
        "secrets": {key: "secret" for key in phase.SECRET_KEYS},
    }
    reconciliation = {
        "recovered_auth_identity_count": 3,
        "remaining_auth_identity_count": 0,
        "remaining_active_temporary_grant_count": 0,
        "recovered_active_mcp_grant_count": 0,
        "remaining_active_mcp_grant_count": 0,
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
        "recover_lost_live18_state_before_demo",
        lambda: reconciliation,
    )
    monkeypatch.setattr(
        phase,
        "recover_lost_live18_state",
        lambda: pytest.fail("pre-demo cleanup must not require seeded identities"),
    )

    response = phase._identity_cleanup(request, before_demo=True)

    assert response["action"] == "recover-identities-before-demo"
    assert response["cleaned"] is True
    assert response["orphan_reconciliation"] == reconciliation


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
        "recovered_active_mcp_grant_count": 0,
        "remaining_active_mcp_grant_count": 0,
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
    monkeypatch.setenv("MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS", "reviewed-client")
    monkeypatch.setattr(
        phase,
        "recover_lost_live18_mcp_state",
        lambda *_args: {
            "recovered_active_mcp_grant_count": 0,
            "remaining_active_mcp_grant_count": 0,
        },
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
        "recovered_active_mcp_grant_count": 0,
        "remaining_active_mcp_grant_count": 0,
        "remaining_denial_role_count": 0,
        "remaining_active_denial_authority_count": 0,
        "remaining_denial_auth_binding_count": 0,
    }

    assert phase._orphan_reconciliation_is_clean(reconciliation) is False


def test_exact_mcp_orphan_reconciliation_supersedes_failed_stateful_cleanup(
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
        "recovered_active_mcp_grant_count": 0,
        "remaining_active_mcp_grant_count": 0,
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
    monkeypatch.setenv("MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS", "reviewed-client")
    monkeypatch.setattr(
        phase,
        "recover_lost_live18_mcp_state",
        lambda *_args: {
            "recovered_active_mcp_grant_count": 2,
            "remaining_active_mcp_grant_count": 0,
        },
    )

    response = phase._identity_cleanup(request)

    assert response["cleaned"] is True
    assert response["cleanup_warnings"] == [
        "MCP cleanup failed: RuntimeError: temporary MCP authority is still active"
    ]
    assert not directory.exists()


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
    close_helper = (
        phase.BACKEND_DIRECTORY / "scripts" / "close_live18_railway_authority.py"
    ).read_text(encoding="utf-8")

    assert "needs.canonical-free-staging.result == 'skipped'" in live18
    assert "needs.railway-canonical-staging.result == 'success'" in live18
    assert "live18_railway_database_phase.py provision-demo" in live18
    assert "backend/scripts/close_live18_railway_authority.py" in live18
    assert "scripts/live18_railway_database_phase.py" in close_helper
    assert '"close-authority"' in close_helper
    assert "live18_railway_database_phase.py provision-identities" in live18
    assert "live18_railway_database_phase.py capture-evidence" in live18
    assert "live18_railway_database_phase.py recover-identities-before-demo" in live18
    assert "cleanup_action=cleanup-identities" in live18
    assert "cleanup_action=recover-identities-before-demo" in live18
    assert 'live18_railway_database_phase.py "$cleanup_action"' in live18
    assert "railway ssh keys add" in live18
    assert "railway ssh keys remove" in live18
    assert (
        'LIVE18_RAILWAY_SSH_PRIVATE_KEY=$RUNNER_TEMP/live18-railway-'
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
    assert 'eval "$(ssh-agent -s)"' in live18
    assert 'ssh-add "$LIVE18_RAILWAY_SSH_PRIVATE_KEY"' in live18
    assert '--key "$fingerprint"' in live18
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
    assert "ssh-add -D" in cleanup
    assert "ssh-agent -k" in cleanup
    assert 'rm -f "$LIVE18_RAILWAY_SSH_AGENT_STARTED_PATH"' not in cleanup
    assert '"$LIVE18_RAILWAY_SSH_AGENT_STARTED_PATH"' in cleanup
    assert (
        "--deployment-instance \"$RAILWAY_API_DEPLOYMENT_INSTANCE_ID\"" in live18
    )
    assert "expected one exact running API instance" in live18
    assert 'printf "%s|%s" "$1" "$RAILWAY_GIT_COMMIT_SHA"' in live18
    assert "timeout --signal=TERM 20s railway ssh" in live18
    assert "for attempt in $(seq 1 12); do" in live18
    assert "Exact Railway API instance did not become SSH-ready after 12 attempts" in live18
    assert "Waiting for Railway SSH key removal" in cleanup
    assert 'test "$key_removed" != true' in cleanup
    assert 'ssh-add -d "$LIVE18_RAILWAY_SSH_PRIVATE_KEY"' in cleanup
    assert 'absent_observations=$((absent_observations + 1))' in cleanup
    assert 'ref: ${{ inputs.canonical_staging_deploy_sha }}' in live18
    assert '--project "$RAILWAY_PROJECT_ID"' in live18
    assert '--environment "$RAILWAY_ENVIRONMENT_ID"' in live18
    demo_step = live18.split(
        "- name: Verify exact migration head and provision same-run demo over Railway direct IPv6",
        1,
    )[1].split("- name: Build the masked exact erp_runtime connection", 1)[0]
    assert demo_step.index(
        'touch "$LIVE18_RAILWAY_AUTHORITY_OPEN_ATTEMPTED_PATH"'
    ) < demo_step.index("live18_railway_database_phase.py provision-demo")
    compensation = live18.index(
        "- name: Re-close canonical authority immediately after any Live18 failure"
    )
    final_compensation = live18.index(
        "- name: Re-close canonical authority after any evidence failure"
    )
    ssh_teardown = live18.index(
        "- name: Always remove the run-scoped Railway SSH key"
    )
    evidence_upload = live18.index(
        "- name: Upload scrubbed allowlisted live18 evidence only"
    )
    fixture_cleanup = live18.index(
        "- name: Always remove external reviewed choices and compiled fixture"
    )
    assert (
        compensation
        < fixture_cleanup
        < evidence_upload
        < final_compensation
        < ssh_teardown
    )
    close_step = live18[compensation:fixture_cleanup]
    assert "if: failure() && env.LIVE18_PROVIDER == 'railway'" in close_step
    assert "backend/scripts/close_live18_railway_authority.py" in close_step
    final_close_step = live18[final_compensation:ssh_teardown]
    assert "if: failure() && env.LIVE18_PROVIDER == 'railway'" in final_close_step
    assert "backend/scripts/close_live18_railway_authority.py" in final_close_step
    assert 'response.get("action") == "close-authority"' in close_helper
    assert 'fence.get("state") == "closed"' in close_helper
    assert "marker.unlink()" in close_helper
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
    assert "COPY deploy/control-plane /app/deploy/control-plane" in dockerfile
    assert identities.LIVE18_MATRIX_PATH == (
        identities.BACKEND_ROOT / "tests/live_acceptance/operation_matrix.json"
    )


def test_identity_phase_binds_project_only_in_process_environment():
    source = phase.Path(phase.__file__).read_text(encoding="utf-8")
    identity = source[source.index("def _identity_provision") : source.index("def _restore_state")]
    assert '"CANONICAL_STAGING_PROJECT_REF": project_ref' in identity


def test_packaged_remote_matrix_covers_all_17_ready_operations():
    operations = phase._ready_operations()
    assert len(operations) == 17
    assert len({row["command_operation"] for row in operations}) == 16
    assert "expense_claim" not in {row["id"] for row in operations}

import importlib.util
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend/scripts/provision_render_pilot.py"
SPEC = importlib.util.spec_from_file_location("provision_render_pilot", SCRIPT)
provision = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = provision
SPEC.loader.exec_module(provision)


TEST_PROJECT_REF = "canonicalcanonical12"
TEST_DIRECT_IPV4 = "13.248.118.66"


@pytest.fixture(autouse=True)
def _reviewed_direct_ipv4_dns(monkeypatch):
    def resolve(_host, port, family, socket_type):
        if family != provision.socket.AF_INET:
            return []
        return [(family, socket_type, 6, "", (TEST_DIRECT_IPV4, port))]

    monkeypatch.setattr(
        provision.socket,
        "getaddrinfo",
        resolve,
    )


def _database_url(principal):
    return (
        f"postgresql://{principal}:secret@db.{TEST_PROJECT_REF}.supabase.co:5432/postgres"
        "?sslmode=require&connect_timeout=10"
    )


def _values():
    return {
        "DATABASE_URL": _database_url("erp_runtime"),
        "DATABASE_TRANSPORT_REQUIREMENT": "supabase_direct_ipv4",
        "DATABASE_POOL_SIZE": "3",
        "DATABASE_MAX_OVERFLOW": "1",
        "ERP_CALCULATOR_DATABASE_URL": _database_url("erp_calculator"),
        "TAX_PROVIDER_DATABASE_URL": _database_url("erp_tax_provider"),
        "TAX_PROVIDER_INTERNAL_SERVICE_TOKEN": "tax-provider-bearer-secret-value-123456",
        "TAX_PROVIDER_INTERNAL_HMAC_SECRET": "tax-provider-hmac-secret-value-1234567",
        "JWT_SECRET_KEY": "secret-jwt",
        "SUPABASE_URL": "https://canonicalcanonical12.supabase.co",
        "SUPABASE_ANON_KEY": "public-anon",
        "SUPABASE_OAUTH_ISSUER": "https://canonicalcanonical12.supabase.co/auth/v1",
        "EVIDENCE_STORAGE_ENABLED": "true",
        "EVIDENCE_STORAGE_EXPECTED_PROJECT_REF": "canonicalcanonical12",
        "EVIDENCE_STORAGE_SERVICE_AUTH_USER_ID": "d3000000-0000-4000-8000-0000000000e1",
        "EVIDENCE_STORAGE_SERVICE_EMAIL": "canonical-evidence-storage@service.aasopharma.invalid",
        "EVIDENCE_STORAGE_SERVICE_PASSWORD": "p" * 64,
        "MCP_INTERNAL_SERVICE_TOKEN": "internal-service-secret-value-123456",
        "MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS": "reviewed-client-id",
    }


def test_dry_run_payloads_match_reviewed_render_contract(capsys):
    assert provision.main([]) == 0
    plan = json.loads(capsys.readouterr().out)

    frontend = plan["frontend_create"]
    api = plan["api_create"]
    mcp = plan["mcp_create"]
    assert plan["workspace"] == "tea-da2nh58ae00c73ciaqog"
    assert plan["create_order"] == [
        "aasopharma-erp-pilot",
        "aasopharma-api-pilot",
        "aasopharma-mcp-pilot",
    ]
    assert plan["api_sequence"][-1] == (
        "POST /services/{serviceId}/deploys only with --deploy"
    )
    assert frontend["type"] == "static_site"
    assert frontend["autoDeploy"] == "no"
    assert frontend["serviceDetails"]["publishPath"] == "./frontend/build"
    assert frontend["serviceDetails"]["routes"] == [
        {"type": "rewrite", "source": "/*", "destination": "/index.html"}
    ]
    assert api["type"] == "web_service"
    assert api["autoDeploy"] == "no"
    assert api["serviceDetails"]["runtime"] == "docker"
    assert api["serviceDetails"]["plan"] == "free"
    assert api["serviceDetails"]["region"] == "singapore"
    assert api["serviceDetails"]["maxShutdownDelaySeconds"] == 60
    assert api["serviceDetails"]["envSpecificDetails"] == {
        "dockerContext": "./backend",
        "dockerfilePath": "./backend/Dockerfile",
    }
    assert all(item["value"].startswith("${") for item in api["envVars"])
    assert mcp["type"] == "web_service"
    assert mcp["autoDeploy"] == "no"
    assert mcp["serviceDetails"]["healthCheckPath"] == "/health"
    assert mcp["serviceDetails"]["maxShutdownDelaySeconds"] == 60
    assert mcp["serviceDetails"]["envSpecificDetails"] == {
        "dockerContext": "./backend/mcp_runtime",
        "dockerfilePath": "./backend/mcp_runtime/Dockerfile",
    }
    assert {item["key"] for item in mcp["envVars"]} == {
        "SUPABASE_OAUTH_ISSUER",
        "ERP_API_BASE_URL",
        "MCP_INTERNAL_SERVICE_TOKEN",
        "MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS",
        "MCP_ALLOWED_ORIGINS",
    }
    assert all(item["value"].startswith("${") for item in mcp["envVars"])


def test_operator_values_fail_before_api_use_when_secrets_are_missing(monkeypatch):
    for key in (*provision.BACKEND_REQUIRED, *provision.SMTP_KEYS):
        monkeypatch.delenv(key, raising=False)

    with pytest.raises(provision.ProvisioningError, match="Missing required operator values"):
        provision.operator_values(None)


def test_environment_mapping_uses_derived_service_origins():
    backend = provision.backend_env(_values(), "https://frontend.onrender.com")
    frontend = provision.frontend_env(_values(), "https://api.onrender.com")
    mcp = provision.mcp_env(
        _values(), "https://api.onrender.com/", "https://mcp.onrender.com/"
    )

    assert backend["CORS_ORIGINS"] == "https://frontend.onrender.com"
    assert backend["APP_URL"] == "https://frontend.onrender.com"
    assert backend["CANONICAL_APPLICATION_PROVIDER"] == "render"
    assert set(backend) == {
        "APP_ENV",
        "CANONICAL_APPLICATION_PROVIDER",
        "LOG_LEVEL",
        "LOG_FORMAT",
        "CORS_ORIGINS",
        "APP_URL",
        "DATABASE_URL",
        "DATABASE_TRANSPORT_REQUIREMENT",
        "DATABASE_POOL_SIZE",
        "DATABASE_MAX_OVERFLOW",
        "ERP_CALCULATOR_DATABASE_URL",
        "TAX_PROVIDER_DATABASE_URL",
        "TAX_PROVIDER_INTERNAL_SERVICE_TOKEN",
        "TAX_PROVIDER_INTERNAL_HMAC_SECRET",
        "JWT_SECRET_KEY",
        "SUPABASE_URL",
        "SUPABASE_ANON_KEY",
        "EVIDENCE_STORAGE_ENABLED",
        "EVIDENCE_STORAGE_EXPECTED_PROJECT_REF",
        "EVIDENCE_STORAGE_SERVICE_AUTH_USER_ID",
        "EVIDENCE_STORAGE_SERVICE_EMAIL",
        "EVIDENCE_STORAGE_SERVICE_PASSWORD",
        "MCP_INTERNAL_SERVICE_TOKEN",
        "MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS",
    }
    assert frontend["REACT_APP_API_BASE_URL"] == "https://api.onrender.com"
    assert frontend["NODE_VERSION"] == "22"
    assert "SUPABASE_SERVICE_ROLE_KEY" not in frontend
    assert mcp == {
        "SUPABASE_OAUTH_ISSUER": "https://canonicalcanonical12.supabase.co/auth/v1",
        "ERP_API_BASE_URL": "https://api.onrender.com",
        "MCP_INTERNAL_SERVICE_TOKEN": "internal-service-secret-value-123456",
        "MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS": "reviewed-client-id",
        "MCP_RESOURCE_SERVER_URL": "https://mcp.onrender.com/mcp",
    }
    for forbidden in (
        "DATABASE_URL",
        "JWT_SECRET_KEY",
        "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "APP_ENV",
        "ENV",
    ):
        assert forbidden not in mcp


def test_redacted_payload_never_prints_operator_values():
    payload = provision.api_create_payload(
        provision.DEFAULT_OWNER_ID,
        provision.DEFAULT_REPO,
        provision.DEFAULT_BRANCH,
        provision.backend_env(_values(), "https://frontend.onrender.com"),
    )
    rendered = json.dumps(provision.redacted_payload(payload))

    for key, value in _values().items():
        if key in {"DATABASE_POOL_SIZE", "DATABASE_MAX_OVERFLOW"}:
            continue
        assert value not in rendered
    assert "secret-jwt" not in rendered


def test_operator_values_validate_hostname_only_direct_ipv4_and_bounded_pool(monkeypatch):
    configured = _values()
    for key, value in configured.items():
        monkeypatch.setenv(key, value)

    values = provision.operator_values(None)

    assert values["DATABASE_TRANSPORT_REQUIREMENT"] == "supabase_direct_ipv4"
    assert values["DATABASE_POOL_SIZE"] == "3"
    assert values["DATABASE_MAX_OVERFLOW"] == "1"
    for name in provision.DATABASE_PRINCIPALS:
        assert values[name] == configured[name]
        assert "hostaddr=" not in values[name]
        assert ".pooler.supabase.com" not in values[name]


@pytest.mark.parametrize(
    ("key", "value", "message"),
    [
        (
            "DATABASE_TRANSPORT_REQUIREMENT",
            "",
            "Missing required operator values: DATABASE_TRANSPORT_REQUIREMENT",
        ),
        ("DATABASE_POOL_SIZE", "4", "must be 3"),
        ("DATABASE_MAX_OVERFLOW", "2", "must be 1"),
        (
            "DATABASE_URL",
            "postgresql://erp_runtime:secret@aws-0-region.pooler.supabase.com:5432/postgres?sslmode=require",
            "direct Supabase endpoint",
        ),
        (
            "ERP_CALCULATOR_DATABASE_URL",
            _database_url("erp_runtime"),
            "reviewed role",
        ),
        (
            "DATABASE_URL",
            _database_url("erp_runtime") + "&host=pooler.example",
            "connection override",
        ),
        (
            "DATABASE_URL",
            _database_url("erp_runtime") + "&hostaddr=" + TEST_DIRECT_IPV4,
            "connection override",
        ),
        (
            "DATABASE_URL",
            _database_url("erp_runtime") + "&sslmode=require",
            "exactly one TLS mode",
        ),
    ],
)
def test_render_database_transport_contract_fails_closed(
    monkeypatch,
    key,
    value,
    message,
):
    values = _values()
    values[key] = value
    for env_key, env_value in values.items():
        monkeypatch.setenv(env_key, env_value)

    with pytest.raises(provision.ProvisioningError, match=message):
        provision.operator_values(None)


def test_render_database_transport_has_no_pooler_fallback(monkeypatch):
    for key, value in _values().items():
        monkeypatch.setenv(key, value)
    monkeypatch.setattr(
        provision.socket,
        "getaddrinfo",
        lambda *_args: [],
    )

    with pytest.raises(provision.ProvisioningError, match="no reviewed public IPv4"):
        provision.operator_values(None)


def test_render_database_transport_rejects_remaining_aaaa(monkeypatch):
    for key, value in _values().items():
        monkeypatch.setenv(key, value)

    def resolve(_host, port, family, socket_type):
        address = (
            TEST_DIRECT_IPV4
            if family == provision.socket.AF_INET
            else "2606:4700::6810:85e5"
        )
        return [(family, socket_type, 6, "", (address, port))]

    monkeypatch.setattr(provision.socket, "getaddrinfo", resolve)
    with pytest.raises(provision.ProvisioningError, match="still exposes public IPv6"):
        provision.operator_values(None)


@pytest.mark.parametrize(
    ("key", "value", "message"),
    [
        ("EVIDENCE_STORAGE_ENABLED", "false", "must be true"),
        (
            "EVIDENCE_STORAGE_EXPECTED_PROJECT_REF",
            "differentdifferent12",
            "does not match SUPABASE_URL",
        ),
        (
            "EVIDENCE_STORAGE_SERVICE_AUTH_USER_ID",
            "00000000-0000-4000-8000-000000000001",
            "service Auth user ID drifted",
        ),
        (
            "EVIDENCE_STORAGE_SERVICE_EMAIL",
            "wrong@example.invalid",
            "service email drifted",
        ),
        (
            "EVIDENCE_STORAGE_SERVICE_PASSWORD",
            "short",
            "requires one generated service password",
        ),
    ],
)
def test_evidence_storage_configuration_fails_closed(monkeypatch, key, value, message):
    values = _values()
    for env_key, env_value in values.items():
        monkeypatch.setenv(env_key, env_value)
    monkeypatch.setenv(key, value)

    with pytest.raises(provision.ProvisioningError, match=message):
        provision.operator_values(None)


class RecordingClient(provision.RenderClient):
    def __init__(self, responses):
        self.api_key = "not-used"
        self.responses = list(responses)
        self.calls = []

    def request(self, method, path, payload=None, query=None, allow_not_found=False):
        self.calls.append((method, path, payload, query, allow_not_found))
        return self.responses.pop(0) if self.responses else None


def test_per_key_env_reconciliation_is_idempotent_and_non_destructive():
    client = RecordingClient([{"key": "EXISTING", "value": "same"}])
    service = provision.ServiceRef(
        id="srv-test",
        name=provision.API_NAME,
        type="web_service",
        url="https://api.onrender.com",
        raw={},
    )

    assert client.ensure_env(service, {"EXISTING": "same"}) is False
    assert [call[0] for call in client.calls] == ["GET"]
    assert "/env-vars/EXISTING" in client.calls[0][1]


@pytest.mark.parametrize(
    "retired_key",
    ["EVIDENCE_STORAGE_SERVER_API_KEY", "EVIDENCE_STORAGE_SERVER_JWT"],
)
def test_retired_evidence_credentials_are_deleted_before_exact_env_validation(retired_key):
    responses = (
        [{"key": retired_key}, None, None]
        if retired_key == "EVIDENCE_STORAGE_SERVER_API_KEY"
        else [None, {"key": retired_key}, None]
    )
    client = RecordingClient(responses)
    service = provision.ServiceRef(
        id="srv-test",
        name=provision.API_NAME,
        type="web_service",
        url="https://api.onrender.com",
        raw={},
    )

    assert client.retire_env(service, provision.RETIRED_API_ENV_KEYS) is True
    delete_calls = [call for call in client.calls if call[0] == "DELETE"]
    assert len(delete_calls) == 1
    assert retired_key in delete_calls[0][1]


def test_existing_config_patch_keeps_auto_deploy_off_and_reconciles_drift():
    client = RecordingClient([{}])
    service = provision.ServiceRef(
        id="srv-test",
        name=provision.API_NAME,
        type="web_service",
        url="https://api.onrender.com",
        raw={
            "repo": "https://example.invalid/old",
            "branch": "old",
            "serviceDetails": {"region": "singapore"},
        },
    )

    assert client.ensure_service_config(
        service, provision.DEFAULT_REPO, provision.DEFAULT_BRANCH
    ) is True
    method, path, payload, _, _ = client.calls[-1]
    assert (method, path) == ("PATCH", "/services/srv-test")
    assert payload["repo"] == provision.DEFAULT_REPO
    assert payload["branch"] == "main"
    assert payload["serviceDetails"]["runtime"] == "docker"
    assert "region" not in payload["serviceDetails"]


def test_existing_mcp_config_uses_only_isolated_docker_context():
    client = RecordingClient([{}])
    service = provision.ServiceRef(
        id="srv-mcp",
        name=provision.MCP_NAME,
        type="web_service",
        url="https://mcp.onrender.com",
        raw={"repo": provision.DEFAULT_REPO, "branch": "main", "serviceDetails": {"region": "singapore"}},
    )

    assert client.ensure_service_config(
        service, provision.DEFAULT_REPO, provision.DEFAULT_BRANCH
    ) is True
    payload = client.calls[-1][2]
    assert payload["serviceDetails"]["envSpecificDetails"] == {
        "dockerContext": "./backend/mcp_runtime",
        "dockerfilePath": "./backend/mcp_runtime/Dockerfile",
    }


def test_repository_url_normalization_does_not_create_false_drift():
    assert provision.normalized_repo_url(provision.DEFAULT_REPO + ".git/") == (
        provision.DEFAULT_REPO
    )


def test_existing_wrong_region_fails_instead_of_recreating_service():
    client = RecordingClient([])
    service = provision.ServiceRef(
        id="srv-test",
        name=provision.API_NAME,
        type="web_service",
        url="https://api.onrender.com",
        raw={"serviceDetails": {"region": "oregon"}},
    )

    with pytest.raises(provision.ProvisioningError, match="region cannot be patched"):
        client.ensure_service_config(service, provision.DEFAULT_REPO, "main")
    assert client.calls == []


def test_existing_service_type_drift_is_refused():
    client = RecordingClient(
        [[{"service": {"id": "srv-wrong", "name": provision.MCP_NAME, "type": "static_site", "url": "https://mcp.onrender.com"}}]]
    )
    with pytest.raises(provision.ProvisioningError, match="expected web_service"):
        client.find_service("owner", provision.MCP_NAME, "web_service")


def test_deploy_is_pinned_to_exact_commit_and_returns_deploy_id():
    client = RecordingClient(
        [[], {"id": "dep-exact", "status": "build_in_progress"}]
    )
    service = provision.ServiceRef(
        "srv-api",
        provision.API_NAME,
        "web_service",
        "https://api.onrender.com",
        {},
    )

    assert client.deploy(service, "a" * 40) == {
        "id": "dep-exact",
        "status": "build_in_progress",
        "reused": False,
    }
    assert client.calls == [
        (
            "GET",
            "/services/srv-api/deploys",
            None,
            {"limit": 20},
            False,
        ),
        (
            "POST",
            "/services/srv-api/deploys",
            {"clearCache": "do_not_clear", "commitId": "a" * 40},
            None,
            False,
        )
    ]


def test_deploy_reuses_nonterminal_exact_commit():
    client = RecordingClient(
        [[{
            "deploy": {
                "id": "dep-existing",
                "status": "update_in_progress",
                "commit": {"id": "b" * 40},
            }
        }]]
    )
    service = provision.ServiceRef(
        "srv-api",
        provision.API_NAME,
        "web_service",
        "https://api.onrender.com",
        {},
    )

    assert client.deploy(service, "b" * 40) == {
        "id": "dep-existing",
        "status": "update_in_progress",
        "reused": True,
    }
    assert [call[0] for call in client.calls] == ["GET"]


def test_deploy_can_cancel_stale_non_target_queue_before_exact_commit():
    client = RecordingClient(
        [
            [{
                "deploy": {
                    "id": "dep-stale",
                    "status": "build_in_progress",
                    "commit": {"id": "a" * 40},
                }
            }],
            {"id": "dep-stale", "status": "canceled"},
            {"id": "dep-stale", "status": "canceled"},
            {"id": "dep-exact", "status": "created"},
        ]
    )
    service = provision.ServiceRef(
        "srv-api",
        provision.API_NAME,
        "web_service",
        "https://api.onrender.com",
        {},
    )

    result = client.deploy(service, "b" * 40, cancel_stale_deploys=True)

    assert result["id"] == "dep-exact"
    assert [call[:2] for call in client.calls] == [
        ("GET", "/services/srv-api/deploys"),
        ("POST", "/services/srv-api/deploys/dep-stale/cancel"),
        ("GET", "/services/srv-api/deploys/dep-stale"),
        ("POST", "/services/srv-api/deploys"),
    ]


def test_deploy_requires_exact_commit_argument():
    with pytest.raises(SystemExit):
        provision.parse_args(["--apply", "--deploy"])


def test_deploy_retries_only_bounded_render_conflicts(monkeypatch):
    client = RecordingClient(
        [
            [],
            provision.ProvisioningError("Render API POST failed with HTTP 409"),
            {"id": "dep-exact", "status": "created"},
        ]
    )
    original_request = client.request

    def request(*args, **kwargs):
        response = original_request(*args, **kwargs)
        if isinstance(response, Exception):
            raise response
        return response

    client.request = request
    monkeypatch.setattr(provision.time, "sleep", lambda _: None)
    service = provision.ServiceRef(
        "srv-api",
        provision.API_NAME,
        "web_service",
        "https://api.onrender.com",
        {},
    )

    assert client.deploy(service, "d" * 40)["id"] == "dep-exact"
    assert [call[0] for call in client.calls] == ["GET", "POST", "POST"]


def test_deploy_does_not_retry_non_conflict_api_failure(monkeypatch):
    client = RecordingClient(
        [
            [],
            provision.ProvisioningError("Render API POST failed with HTTP 401"),
        ]
    )
    original_request = client.request

    def request(*args, **kwargs):
        response = original_request(*args, **kwargs)
        if isinstance(response, Exception):
            raise response
        return response

    client.request = request
    monkeypatch.setattr(provision.time, "sleep", lambda _: None)
    service = provision.ServiceRef(
        "srv-api",
        provision.API_NAME,
        "web_service",
        "https://api.onrender.com",
        {},
    )

    with pytest.raises(provision.ProvisioningError, match="HTTP 401"):
        client.deploy(service, "e" * 40)
    assert [call[0] for call in client.calls] == ["GET", "POST"]


class ConvergeClient:
    def __init__(self):
        self.deployed = []
        self.env_updates = {}
        self.retired_env = []
        self.allowed_env = {}
        self.services = {
            provision.API_NAME: provision.ServiceRef(
                "srv-api", provision.API_NAME, "web_service", "https://api.onrender.com", {}
            ),
            provision.FRONTEND_NAME: provision.ServiceRef(
                "srv-ui", provision.FRONTEND_NAME, "static_site", "https://ui.onrender.com", {}
            ),
            provision.MCP_NAME: provision.ServiceRef(
                "srv-mcp", provision.MCP_NAME, "web_service", "https://mcp.onrender.com", {}
            ),
        }

    def find_service(self, _owner, name, _type):
        return self.services[name]

    def ensure_auto_deploy_off(self, _service):
        return False

    def ensure_service_config(self, _service, _repo, _branch):
        return False

    def ensure_spa_rewrite(self, _service):
        return False

    def retire_env(self, service, keys):
        self.retired_env.append((service.name, frozenset(keys)))
        return False

    def ensure_env(self, service, values):
        self.env_updates[service.name] = dict(values)
        return False

    def require_allowed_env(self, service, allowed):
        self.allowed_env[service.name] = frozenset(allowed)
        return None

    def deploy(self, service, commit_id, *, cancel_stale_deploys=False):
        self.deployed.append(service.name)
        return {
            "id": f"dep-{service.id}",
            "status": "queued",
            "commit": commit_id,
            "reused": False,
        }


@pytest.mark.parametrize("deploy", [False, True])
def test_converge_updates_three_services_and_deploys_only_when_requested(
    monkeypatch, deploy
):
    client = ConvergeClient()
    monkeypatch.setattr(provision, "operator_values", lambda _path: _values())
    monkeypatch.setattr(provision, "RenderClient", lambda _key: client)
    result = provision.converge(
        SimpleNamespace(
            env_file=None,
            owner_id="owner",
            repo=provision.DEFAULT_REPO,
            branch="main",
            deploy=deploy,
            commit_id="a" * 40 if deploy else None,
            deploy_service=None,
            cancel_stale_deploys=False,
            evidence_credential_cutover_phase="prepare",
        )
    )

    assert set(result["services"]) == {
        provision.API_NAME,
        provision.FRONTEND_NAME,
        provision.MCP_NAME,
    }
    assert client.env_updates[provision.MCP_NAME]["ERP_API_BASE_URL"] == (
        "https://api.onrender.com"
    )
    assert client.env_updates[provision.MCP_NAME]["MCP_RESOURCE_SERVER_URL"] == (
        "https://mcp.onrender.com/mcp"
    )
    assert client.deployed == (
        [provision.API_NAME, provision.FRONTEND_NAME, provision.MCP_NAME]
        if deploy
        else []
    )
    assert client.retired_env == []
    assert provision.RETIRED_API_ENV_KEYS <= client.allowed_env[provision.API_NAME]
    if deploy:
        assert result["deployed"][provision.API_NAME]["id"] == "dep-srv-api"


def test_render_legacy_evidence_environment_requires_explicit_retire_phase(
    monkeypatch,
):
    client = ConvergeClient()
    monkeypatch.setattr(provision, "operator_values", lambda _path: _values())
    monkeypatch.setattr(provision, "RenderClient", lambda _key: client)

    provision.converge(
        SimpleNamespace(
            env_file=None,
            owner_id="owner",
            repo=provision.DEFAULT_REPO,
            branch="main",
            deploy=False,
            commit_id=None,
            deploy_service=None,
            cancel_stale_deploys=False,
            evidence_credential_cutover_phase="retire",
        )
    )

    assert client.retired_env == [
        (provision.API_NAME, provision.RETIRED_API_ENV_KEYS)
    ]
    assert provision.RETIRED_API_ENV_KEYS.isdisjoint(
        client.allowed_env[provision.API_NAME]
    )


def test_converge_can_deploy_only_the_reviewed_api_service(monkeypatch):
    client = ConvergeClient()
    monkeypatch.setattr(provision, "operator_values", lambda _path: _values())
    monkeypatch.setattr(provision, "RenderClient", lambda _key: client)

    result = provision.converge(
        SimpleNamespace(
            env_file=None,
            owner_id="owner",
            repo=provision.DEFAULT_REPO,
            branch="main",
            deploy=True,
            commit_id="c" * 40,
            deploy_service=[provision.API_NAME],
            cancel_stale_deploys=True,
        )
    )

    assert client.deployed == [provision.API_NAME]
    assert set(result["deployed"]) == {provision.API_NAME}


def test_mcp_existing_environment_refuses_admin_or_unreviewed_keys():
    client = RecordingClient(
        [[
            {"envVar": {"key": "SUPABASE_OAUTH_ISSUER", "value": "safe"}},
            {"envVar": {"key": "DATABASE_URL", "value": "must-not-be-retained"}},
        ]]
    )
    service = provision.ServiceRef(
        "srv-mcp",
        provision.MCP_NAME,
        "web_service",
        "https://mcp.onrender.com",
        {},
    )
    with pytest.raises(provision.ProvisioningError, match="DATABASE_URL") as blocked:
        client.require_allowed_env(service, provision.MCP_ALLOWED_ENV_KEYS)
    assert "must-not-be-retained" not in str(blocked.value)


def test_unknown_existing_web_service_region_fails_closed():
    client = RecordingClient([])
    service = provision.ServiceRef(
        "srv-mcp",
        provision.MCP_NAME,
        "web_service",
        "https://mcp.onrender.com",
        {"serviceDetails": {}},
    )
    with pytest.raises(provision.ProvisioningError, match="region is unknown"):
        client.ensure_service_config(service, provision.DEFAULT_REPO, "main")


def test_spa_rewrite_is_added_without_replacing_unrelated_routes():
    client = RecordingClient([[{"route": {"type": "redirect", "source": "/old", "destination": "/"}}], {}])
    service = provision.ServiceRef(
        id="srv-static",
        name=provision.FRONTEND_NAME,
        type="static_site",
        url="https://frontend.onrender.com",
        raw={},
    )

    assert client.ensure_spa_rewrite(service) is True
    assert client.calls[-1][:3] == (
        "POST",
        "/services/srv-static/routes",
        {"type": "rewrite", "source": "/*", "destination": "/index.html"},
    )

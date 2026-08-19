import importlib.util
import json
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend/scripts/provision_render_pilot.py"
SPEC = importlib.util.spec_from_file_location("provision_render_pilot", SCRIPT)
provision = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = provision
SPEC.loader.exec_module(provision)


def _values():
    return {
        "DATABASE_URL": "secret-db",
        "JWT_SECRET_KEY": "secret-jwt",
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_ANON_KEY": "public-anon",
        "SUPABASE_SERVICE_ROLE_KEY": "secret-service-role",
    }


def test_dry_run_payloads_match_reviewed_render_contract(capsys):
    assert provision.main([]) == 0
    plan = json.loads(capsys.readouterr().out)

    frontend = plan["frontend_create"]
    api = plan["api_create"]
    assert plan["workspace"] == "tea-da2nh58ae00c73ciaqog"
    assert plan["create_order"] == ["aasopharma-erp-pilot", "aasopharma-api-pilot"]
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
    assert api["serviceDetails"]["envSpecificDetails"] == {
        "dockerContext": "./backend",
        "dockerfilePath": "./backend/Dockerfile",
    }
    assert all(item["value"].startswith("${") for item in api["envVars"])


def test_operator_values_fail_before_api_use_when_secrets_are_missing(monkeypatch):
    for key in (*provision.BACKEND_REQUIRED, *provision.SMTP_KEYS):
        monkeypatch.delenv(key, raising=False)

    with pytest.raises(provision.ProvisioningError, match="Missing required operator values"):
        provision.operator_values(None)


def test_environment_mapping_uses_derived_service_origins():
    backend = provision.backend_env(_values(), "https://frontend.onrender.com")
    frontend = provision.frontend_env(_values(), "https://api.onrender.com")

    assert backend["CORS_ORIGINS"] == "https://frontend.onrender.com"
    assert backend["APP_URL"] == "https://frontend.onrender.com"
    assert frontend["REACT_APP_API_BASE_URL"] == "https://api.onrender.com"
    assert "SUPABASE_SERVICE_ROLE_KEY" not in frontend


def test_redacted_payload_never_prints_operator_values():
    payload = provision.api_create_payload(
        provision.DEFAULT_OWNER_ID,
        provision.DEFAULT_REPO,
        provision.DEFAULT_BRANCH,
        provision.backend_env(_values(), "https://frontend.onrender.com"),
    )
    rendered = json.dumps(provision.redacted_payload(payload))

    for value in _values().values():
        assert value not in rendered
    assert "secret-jwt" not in rendered


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

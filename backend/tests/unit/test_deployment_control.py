from __future__ import annotations

from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend/scripts/deployment_control.py"
SPEC = importlib.util.spec_from_file_location("deployment_control", SCRIPT)
assert SPEC and SPEC.loader
CONTROL = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = CONTROL
SPEC.loader.exec_module(CONTROL)
MANIFEST_PATH = ROOT / "deploy/control-plane/canonical-staging.json"
EXPECTED_SHA = "a" * 40


def manifest() -> dict:
    return CONTROL.load_manifest(MANIFEST_PATH)


def codes(diagnostics) -> list[str]:
    return [diagnostic.code for diagnostic in diagnostics]


def test_manifest_is_the_complete_static_workflow_authority() -> None:
    document = manifest()

    assert CONTROL.validate_manifest(document) == []
    assert document["providers"]["render"]["authority"] == "standby"
    assert document["providers"]["railway"]["authority"] == "active"
    assert document["deployment"] == {
        "selected_provider": "railway",
        "provider_environment": "CANONICAL_APPLICATION_PROVIDER",
        "required_services": ["api", "mcp", "frontend"],
    }
    for provider_name, provider in document["providers"].items():
        adapter = provider["adapter"]
        assert adapter["kind"] == provider_name
        assert (ROOT / adapter["workflow"]).is_file()
        assert all((ROOT / artifact).is_file() for artifact in adapter["artifacts"])
        assert set(provider["services"]) == {"api", "mcp", "frontend"}
    assert document["providers"]["render"]["adapter"][
        "application_database_transport"
    ] == "supabase_direct_ipv4"
    assert document["providers"]["railway"]["adapter"][
        "application_database_transport"
    ] == "supabase_direct_ipv6"
    assert document["supabase"]["origin"] == (
        f"https://{document['supabase']['project_ref']}.supabase.co"
    )
    database = document["supabase"]["database"]
    assert database["control_transport"] == "direct_ipv4"
    assert database["host"] == (
        f"db.{document['supabase']['project_ref']}.supabase.co"
    )
    assert database["port"] == 5432
    assert database["username_mode"] == "plain_role"
    assert database["shared_supavisor_fallback"] is False
    assert "RENDER_MCP_URL" in document["configuration"]["variables"]
    assert CONTROL.active_provider_name(document) == "railway"
    assert CONTROL.active_provider_services(document) == document["providers"][
        "railway"
    ]["services"]


def test_provider_guard_rejects_non_selected_adapter(capsys) -> None:
    assert CONTROL.main(["assert-active-provider", "railway"]) == 0
    capsys.readouterr()

    assert CONTROL.main(["assert-active-provider", "render"]) == 1
    payload = json.loads(capsys.readouterr().out)
    assert payload["diagnostics"][0]["code"] == "CFG_PROVIDER_NOT_ACTIVE"


def test_preflight_aggregates_missing_values_and_redacts_secrets() -> None:
    document = manifest()
    secret = "do-not-print-this-secret"

    diagnostics = CONTROL.preflight_diagnostics(
        document,
        required_env=("RENDER_API_KEY", "SUPABASE_DB_PASSWORD", "RENDER_MCP_URL"),
        expected_sha=EXPECTED_SHA,
        repository=document["environment"]["repository"],
        environ={"SUPABASE_DB_PASSWORD": secret},
    )

    assert codes(diagnostics) == ["CFG_VALUE_MISSING", "CFG_VALUE_MISSING"]
    payload = json.dumps([CONTROL.asdict(item) for item in diagnostics])
    assert secret not in payload
    assert "RENDER_API_KEY" in payload
    assert "RENDER_MCP_URL" in payload


def test_preflight_names_exact_drifted_binding() -> None:
    diagnostics = CONTROL.preflight_diagnostics(
        manifest(),
        required_env=(),
        expected_sha=EXPECTED_SHA,
        repository="wrong/repository",
        environ={"RENDER_MCP_URL": "https://wrong.example"},
    )

    assert codes(diagnostics) == ["CFG_VALUE_DRIFT", "CFG_REPOSITORY_DRIFT"]
    assert diagnostics[0].subject == "RENDER_MCP_URL"


def test_public_status_reports_sha_and_inactive_authority_failures(monkeypatch) -> None:
    document = manifest()

    def fake_get(url: str, _timeout: int):
        if "onrender.com" in url:
            return 200, {"status": "healthy"}, ""
        if url.endswith("/build-metadata.json"):
            return 200, {"git_commit": "b" * 40}, ""
        if url.endswith("/health"):
            return 200, {"git_commit": EXPECTED_SHA}, ""
        return 200, {"status": "ready"}, ""

    monkeypatch.setattr(CONTROL, "_get_json", fake_get)
    diagnostics, checks = CONTROL.status_diagnostics(
        document,
        expected_sha=EXPECTED_SHA,
        fence="open",
        timeout=1,
    )

    assert codes(diagnostics).count("LIVE_SHA_MISMATCH") == 1
    assert codes(diagnostics).count("LIVE_INACTIVE_AUTHORITY_REACHABLE") == 3
    assert len(checks) == 8


def test_provider_switch_uses_only_typed_manifest_authority(monkeypatch) -> None:
    document = deepcopy(manifest())
    document["deployment"]["selected_provider"] = "render"
    document["providers"]["render"]["authority"] = "active"
    document["providers"]["railway"]["authority"] = "standby"

    def fake_get(url: str, _timeout: int):
        if "railway.app" in url:
            return 404, None, ""
        if url.endswith("/build-metadata.json") or url.endswith("/health"):
            return 200, {"git_commit": EXPECTED_SHA}, ""
        return 200, {"status": "ready"}, ""

    monkeypatch.setattr(CONTROL, "_get_json", fake_get)
    diagnostics, checks = CONTROL.status_diagnostics(
        document,
        expected_sha=EXPECTED_SHA,
        fence="open",
        timeout=1,
    )

    assert diagnostics == []
    assert len(checks) == 8
    assert {check["provider"] for check in checks if check["check"] == "health"} == {
        "render"
    }
    assert {check["provider"] for check in checks if check["check"] == "inactivity"} == {
        "railway"
    }


def test_provider_authority_and_adapter_drift_fail_closed() -> None:
    document = deepcopy(manifest())
    document["providers"]["render"]["authority"] = "active"
    document["providers"]["railway"]["adapter"]["environment_prefix"] = "RENDER"

    diagnostics = CONTROL.validate_manifest(document)

    assert "CFG_PROVIDER_AUTHORITY_INVALID" in codes(diagnostics)
    assert "CFG_PROVIDER_ADAPTER_MISMATCH" in codes(diagnostics)


def test_suspended_standby_provider_is_inactive(monkeypatch) -> None:
    document = manifest()

    def fake_get(url: str, _timeout: int):
        if "onrender.com" in url:
            return 503, None, "provider_service_suspended"
        if url.endswith("/build-metadata.json") or url.endswith("/health"):
            return 200, {"git_commit": EXPECTED_SHA}, ""
        return 200, {"status": "ready"}, ""

    monkeypatch.setattr(CONTROL, "_get_json", fake_get)
    diagnostics, checks = CONTROL.status_diagnostics(
        document,
        expected_sha=EXPECTED_SHA,
        fence="open",
        timeout=1,
    )

    assert diagnostics == []
    assert len(checks) == 8


def test_closed_fence_distinguishes_expected_mcp_not_ready(monkeypatch) -> None:
    document = manifest()

    def fake_get(url: str, _timeout: int):
        if "onrender.com" in url:
            return 404, None, ""
        if url.endswith("/build-metadata.json") or url.endswith("/health"):
            return 200, {"git_commit": EXPECTED_SHA}, ""
        if "pharma-backend" in url and url.endswith("/ready"):
            return 503, {"status": "not_ready"}, ""
        return 200, {"status": "ready"}, ""

    monkeypatch.setattr(CONTROL, "_get_json", fake_get)
    diagnostics, _ = CONTROL.status_diagnostics(
        document,
        expected_sha=EXPECTED_SHA,
        fence="closed",
        timeout=1,
    )

    assert diagnostics == []


def test_render_suspension_names_lifecycle_recovery_once_per_service(monkeypatch) -> None:
    document = deepcopy(manifest())
    document["deployment"]["selected_provider"] = "render"
    document["providers"]["render"]["authority"] = "active"
    document["providers"]["railway"]["authority"] = "standby"

    def fake_get(url: str, _timeout: int):
        if "railway.app" in url:
            return 404, None, ""
        return 503, None, "provider_service_suspended"

    monkeypatch.setattr(CONTROL, "_get_json", fake_get)
    diagnostics, checks = CONTROL.status_diagnostics(
        document,
        expected_sha=EXPECTED_SHA,
        fence="closed",
        timeout=1,
    )

    assert codes(diagnostics) == ["RENDER_SERVICE_SUSPENDED"] * 3
    assert {diagnostic.subject for diagnostic in diagnostics} == {
        "render.frontend",
        "render.api",
        "render.mcp",
    }
    assert all(not diagnostic.retryable for diagnostic in diagnostics)
    assert all(
        "recover_canonical_render_suspension=true" in diagnostic.next_action
        for diagnostic in diagnostics
    )
    assert len(checks) == 8


def test_export_contains_only_reviewed_public_bindings(tmp_path: Path) -> None:
    output = tmp_path / "github-env"

    CONTROL._write_github_env(manifest(), output)

    values = dict(
        line.split("=", 1)
        for line in output.read_text(encoding="utf-8").splitlines()
    )
    assert values["RENDER_MCP_URL"] == "https://aasopharma-mcp-pilot.onrender.com"
    assert values["CANONICAL_APPLICATION_PROVIDER"] == "railway"
    assert values["CANONICAL_APPLICATION_DATABASE_TRANSPORT"] == (
        "supabase_direct_ipv6"
    )
    assert values["SUPABASE_DIRECT_DATABASE_HOST"] == (
        "db.rgihahbmkrmhitjdjvev.supabase.co"
    )
    assert values["SUPABASE_DIRECT_DATABASE_PORT"] == "5432"
    assert values["CANONICAL_STAGING_PROJECT_REF"] == "rgihahbmkrmhitjdjvev"
    assert "RENDER_API_KEY" not in values
    assert "SUPABASE_DB_PASSWORD" not in values

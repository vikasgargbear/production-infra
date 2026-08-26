from __future__ import annotations

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
    assert document["providers"]["render"]["authority"] == "active"
    assert document["providers"]["railway"]["authority"] == "retired"
    assert document["supabase"]["origin"] == (
        f"https://{document['supabase']['project_ref']}.supabase.co"
    )
    database = document["supabase"]["database"]
    assert database["transport"] == "direct_ipv4"
    assert database["host"] == (
        f"db.{document['supabase']['project_ref']}.supabase.co"
    )
    assert database["port"] == 5432
    assert database["username_mode"] == "plain_role"
    assert database["shared_supavisor_fallback"] is False
    assert "RENDER_MCP_URL" in document["configuration"]["variables"]


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


def test_public_status_reports_sha_and_retired_authority_failures(monkeypatch) -> None:
    document = manifest()

    def fake_get(url: str, _timeout: int):
        if "railway.app" in url:
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
    assert codes(diagnostics).count("LIVE_RETIRED_AUTHORITY_REACHABLE") == 3
    assert len(checks) == 8


def test_closed_fence_distinguishes_expected_mcp_not_ready(monkeypatch) -> None:
    document = manifest()

    def fake_get(url: str, _timeout: int):
        if "railway.app" in url:
            return 404, None, ""
        if url.endswith("/build-metadata.json") or url.endswith("/health"):
            return 200, {"git_commit": EXPECTED_SHA}, ""
        if "mcp-pilot" in url and url.endswith("/ready"):
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
    document = manifest()

    def fake_get(url: str, _timeout: int):
        if "railway.app" in url:
            return 404, None, ""
        return 503, None, "render_service_suspended"

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
    assert values["CANONICAL_STAGING_PROJECT_REF"] == "rgihahbmkrmhitjdjvev"
    assert "RENDER_API_KEY" not in values
    assert "SUPABASE_DB_PASSWORD" not in values

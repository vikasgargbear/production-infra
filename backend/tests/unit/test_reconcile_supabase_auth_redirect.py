from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from scripts import reconcile_supabase_auth_redirect as redirect


@pytest.mark.parametrize(
    "value",
    [
        "http://erp.example.com",
        "https://erp.example.com/path",
        "https://erp.example.com?next=bad",
        "https://user@erp.example.com",
        "https://erp.example.com:443",
        "https://*.example.com",
        "*.example.com",
        "",
    ],
)
def test_normalize_https_origin_rejects_non_origins(value: str) -> None:
    with pytest.raises(ValueError, match="exact HTTPS origin"):
        redirect.normalize_https_origin(value)


def test_build_update_replaces_drift_with_one_exact_reviewed_authority() -> None:
    current = {
        "site_url": "https://old.example.com",
        "uri_allow_list": "https://old.example.com, https://erp.example.com",
    }

    update = redirect.build_update(current, "https://ERP.example.com/")

    assert update == {
        "site_url": "https://erp.example.com",
        "uri_allow_list": "https://erp.example.com",
        "oauth_server_enabled": True,
        "oauth_server_allow_dynamic_registration": False,
        "oauth_server_authorization_path": "/oauth/consent",
    }


def test_request_uses_curl_without_putting_token_in_process_arguments(
    monkeypatch,
) -> None:
    captured = {}

    def fake_run(command, **kwargs):
        captured["command"] = command
        captured["input"] = kwargs["input"]
        header_path = command[command.index("--header") + 1].removeprefix("@")
        captured["header"] = Path(header_path).read_text(encoding="utf-8")
        return SimpleNamespace(
            returncode=0,
            stdout='{"site_url":"https://erp.example.com"}',
            stderr="",
        )

    monkeypatch.setattr(redirect.subprocess, "run", fake_run)

    response = redirect.request_json(
        "PATCH",
        "https://api.supabase.com/v1/projects/example/config/auth",
        "secret-token",
        {"site_url": "https://erp.example.com"},
    )

    assert response == {"site_url": "https://erp.example.com"}
    assert "secret-token" not in " ".join(captured["command"])
    assert captured["header"] == "Authorization: Bearer secret-token\n"
    assert captured["input"] == '{"site_url":"https://erp.example.com"}'


def test_reconcile_gets_then_patches_and_returns_scrubbed_evidence(monkeypatch) -> None:
    requests: list[tuple[str, str, str, object]] = []

    def fake_request(method, url, token, payload=None):
        requests.append((method, url, token, payload))
        if method == "GET":
            return {"site_url": "https://old.example.com", "uri_allow_list": ""}
        return dict(payload)

    monkeypatch.setattr(redirect, "request_json", fake_request)

    evidence = redirect.reconcile(
        "rgihahbmkrmhitjdjvev",
        "https://erp.example.com",
        "secret-token",
        "a" * 40,
    )

    assert evidence == {
        "project_ref": "rgihahbmkrmhitjdjvev",
        "site_url": "https://erp.example.com",
        "uri_allow_list": "https://erp.example.com",
        "oauth_server_enabled": True,
        "oauth_server_allow_dynamic_registration": False,
        "oauth_server_authorization_path": "/oauth/consent",
        "git_commit": "a" * 40,
        "redirect_origin_allowlisted": True,
    }
    assert [request[0] for request in requests] == ["GET", "PATCH"]
    assert requests[1][3] == {
        "site_url": "https://erp.example.com",
        "uri_allow_list": "https://erp.example.com",
        "oauth_server_enabled": True,
        "oauth_server_allow_dynamic_registration": False,
        "oauth_server_authorization_path": "/oauth/consent",
    }
    assert "secret-token" not in str(evidence)


def test_reconcile_does_not_patch_when_configuration_is_exact(monkeypatch) -> None:
    requests: list[str] = []
    exact = redirect.build_update({}, "https://erp.example.com")

    def fake_request(method, _url, _token, _payload=None):
        requests.append(method)
        return exact

    monkeypatch.setattr(redirect, "request_json", fake_request)

    redirect.reconcile(
        "rgihahbmkrmhitjdjvev",
        "https://erp.example.com",
        "secret-token",
        "a" * 40,
    )

    assert requests == ["GET"]


def test_reconcile_fails_if_patch_readback_does_not_match(monkeypatch) -> None:
    monkeypatch.setattr(
        redirect,
        "request_json",
        lambda method, _url, _token, _payload=None: {
            "site_url": "https://old.example.com",
            "uri_allow_list": "https://old.example.com",
        },
    )

    with pytest.raises(RuntimeError, match="exact reviewed field: site_url"):
        redirect.reconcile(
            "rgihahbmkrmhitjdjvev",
            "https://erp.example.com",
            "secret-token",
            "a" * 40,
        )


def test_live18_reconciles_supabase_before_browser_execution() -> None:
    workflow = (
        Path(__file__).parents[3]
        / ".github/workflows/production-readiness.yml"
    ).read_text(encoding="utf-8")
    live18 = workflow.split("\n  live18-acceptance:", 1)[1]

    assert "Reconcile the exact Railway frontend OAuth redirect" not in live18


def test_only_railway_deployment_owns_staging_auth_redirect_authority() -> None:
    root = Path(__file__).parents[3]
    canonical = (root / ".github/workflows/canonical-staging.yml").read_text(
        encoding="utf-8"
    )
    railway = (root / ".github/workflows/railway-canonical-staging.yml").read_text(
        encoding="utf-8"
    )

    assert "frontend_url=https://aasopharma-erp-pilot.onrender.com" not in canonical
    assert "backend/scripts/reconcile_supabase_auth_redirect.py" not in canonical
    assert "site_url: $site_url" not in canonical
    assert "hosted_consent_origin: $hosted_consent_origin" in canonical
    assert "backend/scripts/reconcile_supabase_auth_redirect.py" in railway
    assert "--provider railway" in railway
    assert "--reviewed-sha" in railway
    assert "SUPABASE_ACCESS_TOKEN" in railway


def test_redirect_authority_rejects_retired_provider_before_network() -> None:
    with pytest.raises(RuntimeError, match="not the active"):
        redirect.reviewed_frontend_origin("render")


def test_redirect_authority_resolves_exact_canonical_railway_domain() -> None:
    assert redirect.reviewed_frontend_origin("railway") == (
        "https://aasopharma-erp-pilot-production-eb9b.up.railway.app"
    )


def test_redirect_authority_rejects_another_project_before_network() -> None:
    with pytest.raises(RuntimeError, match="project ref"):
        redirect.reviewed_frontend_origin(
            "railway", project_ref="abcdefghijklmnopqrst"
        )

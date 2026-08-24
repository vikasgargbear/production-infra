"""
CORS contract tests — verify that the FastAPI CORS middleware is configured
correctly and that the wildcard-with-credentials footgun is statically
prevented.

These tests run against the constructed FastAPI app, not a live server, so
they catch regressions before deploy.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ALLOWED_ORIGIN = "https://aasopharma-erp-pilot.onrender.com"
DISALLOWED_ORIGIN = "https://evil.example.com"


def _make_client(origins: str) -> TestClient:
    """Build a TestClient with CORS_ORIGINS set to *origins*."""
    os.environ["CORS_ORIGINS"] = origins
    # Force re-evaluation of the module so the env var is picked up.
    import importlib
    import app.main as main_module
    importlib.reload(main_module)
    return TestClient(main_module.app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Static source guard — wildcard must be blocked before middleware is added
# ---------------------------------------------------------------------------

def test_wildcard_origins_raise_at_startup() -> None:
    """CORS_ORIGINS='*' must raise RuntimeError, never reach a listening state."""
    main_src = (
        Path(__file__).resolve().parents[2] / "app" / "main.py"
    ).read_text(encoding="utf-8")

    assert "CORS_ORIGINS cannot contain '*'" in main_src
    assert 'raise RuntimeError' in main_src


# ---------------------------------------------------------------------------
# Preflight from the allowed origin
# ---------------------------------------------------------------------------

def test_preflight_from_allowed_origin_returns_200_with_cors_headers() -> None:
    client = _make_client(ALLOWED_ORIGIN)
    resp = client.options(
        "/api/auth/verify-token",
        headers={
            "Origin": ALLOWED_ORIGIN,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        },
    )
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN
    assert resp.headers.get("access-control-allow-credentials") == "true"
    # Authorization must be in the allowed-headers echo
    acao_headers = resp.headers.get("access-control-allow-headers", "")
    assert "authorization" in acao_headers.lower()


def test_health_connection_check_preflight_is_allowed() -> None:
    client = _make_client(ALLOWED_ORIGIN)
    resp = client.options(
        "/health",
        headers={
            "Origin": ALLOWED_ORIGIN,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "X-Connection-Check",
        },
    )
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN
    assert "x-connection-check" in resp.headers.get(
        "access-control-allow-headers", ""
    ).lower()


# ---------------------------------------------------------------------------
# Preflight from a disallowed origin must NOT echo ACAO header
# ---------------------------------------------------------------------------

def test_preflight_from_disallowed_origin_omits_acao_header() -> None:
    client = _make_client(ALLOWED_ORIGIN)
    resp = client.options(
        "/api/auth/verify-token",
        headers={
            "Origin": DISALLOWED_ORIGIN,
            "Access-Control-Request-Method": "GET",
        },
    )
    # FastAPI CORSMiddleware returns 400 for disallowed origins
    assert "access-control-allow-origin" not in resp.headers


# ---------------------------------------------------------------------------
# Simple request from allowed origin carries ACAO response header
# ---------------------------------------------------------------------------

def test_simple_request_from_allowed_origin_has_acao_header() -> None:
    client = _make_client(ALLOWED_ORIGIN)
    resp = client.get(
        "/health",
        headers={"Origin": ALLOWED_ORIGIN},
    )
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN


# ---------------------------------------------------------------------------
# Credentials flag must be enabled (required for Authorization header flows)
# ---------------------------------------------------------------------------

def test_cors_credentials_flag_is_true() -> None:
    client = _make_client(ALLOWED_ORIGIN)
    resp = client.options(
        "/api/auth/verify-token",
        headers={
            "Origin": ALLOWED_ORIGIN,
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.headers.get("access-control-allow-credentials") == "true"


# ---------------------------------------------------------------------------
# 401 on expired / invalid ERP token (verify-token endpoint)
# ---------------------------------------------------------------------------

def test_verify_token_rejects_invalid_bearer() -> None:
    client = _make_client(ALLOWED_ORIGIN)
    resp = client.get(
        "/api/auth/verify-token",
        headers={"Authorization": "Bearer totally.invalid.token"},
    )
    assert resp.status_code == 401


def test_verify_token_rejects_absent_bearer() -> None:
    client = _make_client(ALLOWED_ORIGIN)
    resp = client.get("/api/auth/verify-token")
    assert resp.status_code == 401

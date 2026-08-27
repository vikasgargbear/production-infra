from __future__ import annotations

import json
from pathlib import Path

import pytest
from mcp.server.mcpserver import MCPServer
from pydantic import ValidationError
from starlette.routing import Route
from starlette.testclient import TestClient

from aasopharma_mcp.config import ConfigurationError, Settings
from aasopharma_mcp.operations import OPERATIONS, OPERATOR_OPERATIONS
from aasopharma_mcp.server import create_app, registered_tool_names
from conftest import settings

_BASE_ENV = {
    "SUPABASE_OAUTH_ISSUER": "https://example.supabase.co/auth/v1",
    "MCP_RESOURCE_SERVER_URL": "https://mcp.example.test/mcp",
    "ERP_API_BASE_URL": "https://api.example.test",
    "MCP_INTERNAL_SERVICE_TOKEN": "s" * 48,
    "MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS": "claude-installation",
}


class Verifier:
    async def verify_token(self, _token):
        return None

    async def readiness(self):
        return None


class Gateway:
    async def execute(self, *_args, **_kwargs):
        raise AssertionError("tool execution is not part of route discovery")

    async def readiness(self):
        return None

    async def execute_operator(self, *_args, **_kwargs):
        raise AssertionError("tool execution is not part of route discovery")


def test_exact_reviewed_tools_are_unique_and_streamable_http_routes_exist() -> None:
    names = registered_tool_names()
    assert len(names) == len(set(names)) == 49
    assert set(names) == set(OPERATIONS) | set(OPERATOR_OPERATIONS)
    app = create_app(settings(), Verifier(), Gateway())
    route_paths = {route.path for route in app.routes if isinstance(route, Route)}
    assert "/mcp" in route_paths
    assert "/.well-known/oauth-protected-resource/mcp" in route_paths
    assert {"/health", "/ready"}.issubset(route_paths)
    assert all(operation.path.startswith("/api/") for operation in OPERATIONS.values())


def test_machine_service_contract_matches_runtime() -> None:
    contract = json.loads(
        (Path(__file__).parents[1] / "service-contract.json").read_text(encoding="utf-8")
    )
    assert contract["tools"] == list(registered_tool_names())
    assert contract["writes_exported"] is True
    assert contract["oauth"]["audience"] == "authenticated"
    assert contract["oauth"]["tenant_metadata_claim"] == "org_id"
    assert contract["oauth"]["required_scopes"] == ["openid", "offline_access"]
    assert contract["oauth"]["dynamic_client_registration"] is False
    assert "SUPABASE_SERVICE_ROLE_KEY" not in contract["required_environment"]


def test_operator_sdk_argument_models_match_exact_published_schemas(monkeypatch) -> None:
    monkeypatch.setattr(
        MCPServer,
        "streamable_http_app",
        lambda self, **_kwargs: self,
    )
    server = create_app(settings(), Verifier(), Gateway())
    for tool_name, operation in OPERATOR_OPERATIONS.items():
        tool = server._tool_manager.get_tool(tool_name)
        assert tool is not None
        model = tool.fn_metadata.arg_model
        assert set(model.model_fields) == set(operation.input_schema["properties"])
        assert {
            name for name, field in model.model_fields.items() if field.is_required()
        } == set(operation.input_schema["required"])
        assert tool.parameters == operation.input_schema

    execute = server._tool_manager.get_tool("erp_operation_execute")
    arguments = {
        "command_request_id": "2cf338dd-5eef-4684-a793-51299381a49a",
        "preview_hash": "sha256:" + "a" * 64,
        "idempotency_key": "execute-sdk-boundary-0001",
    }
    assert execute.fn_metadata.validate_arguments(arguments) == arguments
    with pytest.raises(ValidationError):
        execute.fn_metadata.validate_arguments({**arguments, "lines": []})

    sales_order = server._tool_manager.get_tool("erp_sales_order_prepare")
    required_only = {
        name: None for name in sales_order.parameters["required"]
    }
    assert set(sales_order.fn_metadata.validate_arguments(required_only)) == set(
        sales_order.parameters["required"]
    )
    assert "charge_lines" not in sales_order.fn_metadata.validate_arguments(
        required_only
    )


# ---------------------------------------------------------------------------
# MCP_ALLOWED_ORIGINS config validation
# ---------------------------------------------------------------------------

def test_wildcard_allowed_origin_raises_config_error() -> None:
    with pytest.raises(ConfigurationError, match="cannot contain '\\*'"):
        Settings.from_env({**_BASE_ENV, "MCP_ALLOWED_ORIGINS": "*"})


def test_http_non_localhost_origin_raises_config_error() -> None:
    with pytest.raises(ConfigurationError, match="non-localhost HTTP"):
        Settings.from_env({**_BASE_ENV, "MCP_ALLOWED_ORIGINS": "http://evil.example.com"})


def test_https_and_localhost_origins_are_accepted() -> None:
    s = Settings.from_env(
        {**_BASE_ENV, "MCP_ALLOWED_ORIGINS": "https://claude.ai,http://localhost:3000"}
    )
    assert s.allowed_origins == ("https://claude.ai", "http://localhost:3000")


def test_empty_allowed_origins_means_no_cors_middleware() -> None:
    s = Settings.from_env(_BASE_ENV)
    assert s.allowed_origins == ()


# ---------------------------------------------------------------------------
# CORS preflight is answered before auth middleware evaluates bearer token
# ---------------------------------------------------------------------------

def test_cors_preflight_from_allowed_origin_returns_acao_header() -> None:
    s = Settings.from_env({**_BASE_ENV, "MCP_ALLOWED_ORIGINS": "https://claude.ai"})
    app = create_app(s, Verifier(), Gateway())
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.options(
        "/mcp",
        headers={
            "Origin": "https://claude.ai",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Authorization, Content-Type",
        },
    )
    assert resp.headers.get("access-control-allow-origin") == "https://claude.ai"
    assert resp.headers.get("access-control-allow-credentials") == "true"
    # Must succeed before auth runs — not a 401
    assert resp.status_code in {200, 204}


def test_cors_preflight_from_disallowed_origin_omits_acao_header() -> None:
    s = Settings.from_env({**_BASE_ENV, "MCP_ALLOWED_ORIGINS": "https://claude.ai"})
    app = create_app(s, Verifier(), Gateway())
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.options(
        "/mcp",
        headers={
            "Origin": "https://evil.example.com",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert "access-control-allow-origin" not in resp.headers

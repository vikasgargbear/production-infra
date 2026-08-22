from __future__ import annotations

import json
from pathlib import Path

from starlette.routing import Route

from aasopharma_mcp.operations import OPERATIONS, OPERATOR_OPERATIONS
from aasopharma_mcp.server import create_app, registered_tool_names
from conftest import settings


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
    assert len(names) == len(set(names)) == 28
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
    assert contract["oauth"]["required_scopes"] == ["openid", "offline_access"]
    assert contract["oauth"]["dynamic_client_registration"] is False
    assert "SUPABASE_SERVICE_ROLE_KEY" not in contract["required_environment"]

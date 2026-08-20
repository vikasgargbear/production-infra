from __future__ import annotations

import json
import time
from uuid import uuid4

import pytest
from mcp.server.auth.provider import AccessToken

from aasopharma_mcp.operations import OPERATIONS, OperationGateway, UpstreamContractError
from conftest import settings


class Response:
    def __init__(self, status_code: int, payload) -> None:
        self.status_code = status_code
        self._payload = payload
        self.content = json.dumps(payload).encode()

    def json(self):
        return self._payload


class Client:
    def __init__(self, responses: list[Response], calls: list[tuple]) -> None:
        self.responses = responses
        self.calls = calls

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def post(self, url, **kwargs):
        self.calls.append(("POST", url, kwargs))
        return self.responses.pop(0)

    async def get(self, url, **kwargs):
        self.calls.append(("GET", url, kwargs))
        return self.responses.pop(0)


def _access() -> AccessToken:
    return AccessToken(
        token="oauth-bearer-must-not-be-forwarded",
        client_id="claude-installation",
        scopes=["openid", "offline_access", "email"],
        expires_at=int(time.time()) + 300,
        subject=str(uuid4()),
        claims={"iss": settings().supabase_issuer},
    )


def _grant(access: AccessToken, operation_name: str) -> dict:
    operation = OPERATIONS[operation_name]
    return {
        "allowed": True,
        "issuer": access.claims["iss"],
        "subject": access.subject,
        "client_id": access.client_id,
        "operation_key": operation.key,
        "capability_code": operation.key,
        "organization_id": str(uuid4()),
        "membership_id": str(uuid4()),
        "agent_grant_id": str(uuid4()),
        "branch_ids": [],
        "delegated_access_token": "d" * 48,
        "expires_at": int(time.time()) + 60,
    }


@pytest.mark.asyncio
async def test_tool_authorizes_app_owned_grant_then_uses_only_delegated_token() -> None:
    access = _access()
    calls: list[tuple] = []
    responses = [Response(200, _grant(access, "erp_product_search")), Response(200, [{"id": "p1"}])]
    gateway = OperationGateway(settings(), lambda: Client(responses, calls))

    result = await gateway.execute(
        OPERATIONS["erp_product_search"], access, {"q": "para", "limit": 20, "offset": 0}
    )

    assert result == [{"id": "p1"}]
    grant_call, api_call = calls
    assert grant_call[0] == "POST"
    assert grant_call[2]["headers"]["Authorization"].endswith("s" * 48)
    assert grant_call[2]["json"]["capability_code"] == "master.products.search"
    assert access.token not in json.dumps(grant_call[2])
    assert api_call[0] == "GET"
    assert api_call[2]["headers"] == {
        "Authorization": f"Bearer {'s' * 48}",
        "X-MCP-Delegated-Authorization": f"Bearer {'d' * 48}",
    }
    assert access.token not in json.dumps(api_call[2])
    assert all(
        operation.path.startswith("/api/internal/mcp/reads/")
        for operation in OPERATIONS.values()
    )


@pytest.mark.asyncio
async def test_grant_response_echo_and_record_limits_fail_closed() -> None:
    access = _access()
    bad_grant = _grant(access, "erp_product_search")
    bad_grant["client_id"] = "other-client"
    responses = [Response(200, bad_grant)]
    gateway = OperationGateway(settings(), lambda: Client(responses, []))
    with pytest.raises(UpstreamContractError, match="client_id"):
        await gateway.execute(OPERATIONS["erp_product_search"], access, {})

    responses = [
        Response(200, _grant(access, "erp_gst_settings_get")),
        Response(200, [{"one": 1}, {"two": 2}]),
    ]
    gateway = OperationGateway(settings(), lambda: Client(responses, []))
    with pytest.raises(UpstreamContractError, match="record limit"):
        await gateway.execute(OPERATIONS["erp_gst_settings_get"], access, {})


@pytest.mark.asyncio
async def test_readiness_requires_the_app_owned_grant_authority() -> None:
    calls: list[tuple] = []
    responses = [Response(200, {"status": "ready", "grant_authority": "automation.agent_grants"})]
    gateway = OperationGateway(settings(), lambda: Client(responses, calls))
    await gateway.readiness()
    assert calls[0][1].endswith("/api/internal/mcp/agent-grants/ready")

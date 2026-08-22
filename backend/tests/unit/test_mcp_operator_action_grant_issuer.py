from datetime import timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import ValidationError

from app.api.routes.internal import mcp_agent_grants
from app.api.routes.internal.mcp_agent_grants import OperatorGrantRequest
from app.core.api_contract import _route_index
from app.domain.operator_actions import ACTION_POLICIES


SERVICE_TOKEN = "s" * 48
ISSUER = "https://example.supabase.co/auth/v1"
CLIENT_ID = "operator-client"


class _Result:
    def __init__(self, rows):
        self.rows = rows

    def fetchall(self):
        return self.rows


class _Database:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def execute(self, statement, params=None):
        self.calls.append((str(statement), params or {}))
        return _Result(self.rows)


def _request(operation_key, *, branch_ids=(), command_request_id=None):
    policy = ACTION_POLICIES[operation_key]
    return OperatorGrantRequest(
        issuer=ISSUER,
        subject=uuid4(),
        client_id=CLIENT_ID,
        operation_key=operation_key,
        capability_code=operation_key,
        operation_mode="read" if policy.risk_class == "read_only" else "write",
        branch_ids=list(branch_ids),
        command_request_id=command_request_id,
    )


def _row(*, now, grant_branch_id=None, command_request_id=None, command_branches=()):
    branch_id = command_branches[0] if command_branches else None
    destination_id = command_branches[1] if len(command_branches) == 2 else None
    return SimpleNamespace(
        _mapping={
            "org_id": uuid4(),
            "agent_grant_id": uuid4(),
            "membership_id": uuid4(),
            "grant_branch_id": grant_branch_id,
            "canonical_user_id": uuid4(),
            "auth_user_id": uuid4(),
            "command_request_id": command_request_id,
            "command_branch_id": branch_id,
            "command_destination_branch_id": destination_id,
            "authority_expires_at": now + 240,
        }
    )


@pytest.fixture
def enabled_issuer(monkeypatch):
    monkeypatch.setattr(mcp_agent_grants, "HOSTED_OAUTH_CONSENT_IMPLEMENTED", True)
    monkeypatch.setattr(mcp_agent_grants, "CANONICAL_SCHEMA_DEPLOYMENT_VERIFIED", True)
    monkeypatch.setattr(mcp_agent_grants, "MCP_STAGING_VERIFIED", True)
    monkeypatch.setattr(
        mcp_agent_grants, "CANONICAL_OPERATOR_ACTION_ADAPTERS_VERIFIED", True
    )
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS", CLIENT_ID)
    monkeypatch.setenv("MCP_INTERNAL_SERVICE_TOKEN", SERVICE_TOKEN)


def test_operator_issuer_is_code_gated_and_does_not_enable_write_readiness():
    assert mcp_agent_grants.CANONICAL_OPERATOR_ACTION_ADAPTERS_VERIFIED is False
    with pytest.raises(HTTPException) as blocked:
        mcp_agent_grants._require_operator_release_gates()
    assert blocked.value.status_code == 503
    assert "consent" not in blocked.value.detail
    assert "adapters" in blocked.value.detail


def test_operator_request_is_exact_and_rejects_ambiguous_scope():
    branch_id = uuid4()
    with pytest.raises(ValidationError):
        _request("inventory.transfer.prepare", branch_ids=(branch_id, branch_id))

    policy = ACTION_POLICIES["sales.order.prepare"]
    wrong = _request("sales.order.prepare", branch_ids=(branch_id,))
    wrong.capability_code = "sales.invoice.prepare"
    with pytest.raises(HTTPException) as mismatch:
        mcp_agent_grants._validate_operator_request(wrong, policy)
    assert mismatch.value.status_code == 403

    shared = _request("automation.command.approve")
    with pytest.raises(HTTPException) as unbound:
        mcp_agent_grants._validate_operator_request(
            shared, ACTION_POLICIES[shared.operation_key]
        )
    assert "command_request_id" in unbound.value.detail


def test_prepare_token_is_exact_operation_and_branch_bounded(enabled_issuer, monkeypatch):
    now = 1_800_000_000
    branch_id = uuid4()
    request = _request("sales.order.prepare", branch_ids=(branch_id,))
    row = _row(now=now, grant_branch_id=None)
    captured = {}
    monkeypatch.setattr(mcp_agent_grants.time, "time", lambda: now)
    monkeypatch.setattr(
        mcp_agent_grants, "_operator_grant_rows", lambda *_args: [row]
    )
    monkeypatch.setattr(
        mcp_agent_grants,
        "create_access_token",
        lambda claims, expires_delta: captured.update(
            {"claims": claims, "expires_delta": expires_delta}
        )
        or "d" * 48,
    )

    response = mcp_agent_grants.authorize_operator_action(
        request,
        HTTPAuthorizationCredentials(scheme="Bearer", credentials=SERVICE_TOKEN),
        object(),
    )

    assert response.branch_ids == [str(branch_id)]
    assert response.organization_scope is True
    assert response.expires_at == now + 240
    assert captured["expires_delta"] == timedelta(seconds=240)
    claims = captured["claims"]
    assert claims["token_profile"] == "canonical_operator_delegation_v1"
    assert claims["operator_operation"] == "sales.order.prepare"
    assert claims["operator_permission"] == "sales.order.create"
    assert claims["branch_ids"] == [str(branch_id)]
    assert claims["operator_organization_scope"] is True
    assert "operator_command_request_id" not in claims
    for forbidden in ("email", "role", "oauth_access_token", "authorization"):
        assert forbidden not in claims


def test_shared_token_derives_branches_and_binds_exact_command(enabled_issuer, monkeypatch):
    now = 1_800_000_000
    command_request_id = uuid4()
    source_branch_id = uuid4()
    destination_branch_id = uuid4()
    request = _request(
        "automation.command.approve", command_request_id=command_request_id
    )
    row = _row(
        now=now,
        grant_branch_id=None,
        command_request_id=command_request_id,
        command_branches=(source_branch_id, destination_branch_id),
    )
    captured = {}
    monkeypatch.setattr(mcp_agent_grants.time, "time", lambda: now)
    monkeypatch.setattr(
        mcp_agent_grants, "_operator_grant_rows", lambda *_args: [row]
    )
    monkeypatch.setattr(
        mcp_agent_grants,
        "create_access_token",
        lambda claims, expires_delta: captured.update(claims) or "d" * 48,
    )

    response = mcp_agent_grants.authorize_operator_action(
        request,
        HTTPAuthorizationCredentials(scheme="Bearer", credentials=SERVICE_TOKEN),
        object(),
    )

    assert response.command_request_id == str(command_request_id)
    assert response.branch_ids == [str(source_branch_id), str(destination_branch_id)]
    assert captured["operator_command_request_id"] == str(command_request_id)
    assert captured["branch_ids"] == response.branch_ids


def test_operator_authority_sql_revalidates_rbac_branches_and_approval_separation():
    command_request_id = uuid4()
    request = _request(
        "automation.command.approve", command_request_id=command_request_id
    )
    policy = ACTION_POLICIES[request.operation_key]
    database = _Database([])
    mcp_agent_grants._operator_grant_rows(
        database,
        request,
        policy,
        "write",
        mcp_agent_grants._operator_capability_approval_policy(policy),
    )
    sql, params = database.calls[0]
    for fragment in (
        "automation.agent_grants",
        "automation.agent_grant_capabilities",
        "automation.command_requests",
        "command_capability.operation_mode=command.operation_mode",
        "command_capability.risk_class=command.risk_class",
        "command_capability.approval_policy=command.approval_policy",
        "command.requested_amount<=command_capability.maximum_amount",
        "command_grant.expires_at>transaction_timestamp()",
        "command_membership.status='active'",
        "command_user.status='active'",
        "core.memberships",
        "core.access_grants",
        "core.role_permissions",
        "core.permissions",
        "core.branches",
        "command.destination_branch_id",
        "command.approval_policy<>'separate_approver'",
        "membership.id<>command.requested_by_membership_id",
        "grant_row.expires_at>transaction_timestamp()",
    ):
        assert fragment in sql
    assert params["command_request_id"] == command_request_id
    assert params["permission_code"] == "automation.command.approve"


def test_operator_issuer_route_is_hidden_and_has_no_oauth_bearer_field():
    application = FastAPI()
    api = APIRouter(prefix="/api")
    api.include_router(mcp_agent_grants.router)
    application.include_router(api)

    assert "/api/internal/mcp/agent-grants/authorize-action" not in application.openapi()[
        "paths"
    ]
    route = _route_index(application)[
        ("/api/internal/mcp/agent-grants/authorize-action", "POST")
    ][0]
    assert route.include_in_schema is False
    assert route.methods == {"POST"}
    assert "access_token" not in OperatorGrantRequest.model_fields
    assert "authorization" not in OperatorGrantRequest.model_fields

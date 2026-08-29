"""Fail-closed live revalidation for canonical MCP action delegations."""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.api.routes.internal import mcp_actions, mcp_agent_grants
from app.api.routes.internal.mcp_master_contract import master_write_policy_for
from app.domain.operator_actions import ActionContext, policy_for


AUTH_USER_ID = uuid4()
USER_ID = uuid4()
ORG_ID = uuid4()
MEMBERSHIP_ID = uuid4()
GRANT_ID = uuid4()
BRANCH_ID = uuid4()


class _Result:
    def __init__(self, rows=()):
        self._rows = rows

    def fetchall(self):
        return list(self._rows)


class _LiveAuthorityDatabase:
    def __init__(self, *, rows=None, expected_authority=None):
        self.rows = (
            [SimpleNamespace(_mapping={"grant_branch_id": BRANCH_ID})]
            if rows is None
            else rows
        )
        self.expected_authority = expected_authority
        self.calls = []

    def execute(self, statement, parameters=None):
        sql = str(statement)
        parameters = parameters or {}
        self.calls.append((sql, parameters))
        if "erp_security.activate_context" in sql:
            return _Result()
        if self.expected_authority and any(
            parameters.get(key) != value
            for key, value in self.expected_authority.items()
        ):
            return _Result()
        return _Result(self.rows)


def _context(**changes) -> ActionContext:
    values = {
        "auth_user_id": AUTH_USER_ID,
        "user_id": USER_ID,
        "organization_id": ORG_ID,
        "membership_id": MEMBERSHIP_ID,
        "agent_grant_id": GRANT_ID,
        "client_id": "client-1",
        "operation_key": "sales.order.prepare",
        "permission": "sales.order.create",
        "branch_ids": (BRANCH_ID,),
        "organization_scope": False,
        "delegated_command_request_id": None,
    }
    values.update(changes)
    return ActionContext(**values)


def _claims(**changes):
    values = {
        "operator_delegated": True,
        "token_profile": mcp_actions.ACTION_TOKEN_PROFILE,
        "operator_operation": "sales.order.prepare",
        "operator_permission": "sales.order.create",
        "mcp_client_id": "client-1",
        "branch_ids": [str(BRANCH_ID)],
        "operator_organization_scope": False,
        "auth_user_id": str(AUTH_USER_ID),
        "user_id": str(USER_ID),
        "org_id": str(ORG_ID),
        "membership_id": str(MEMBERSHIP_ID),
        "agent_grant_id": str(GRANT_ID),
    }
    values.update(changes)
    return values


def _service_credentials():
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials="s" * 32)


def _prepare_action_dependency(monkeypatch, claims):
    monkeypatch.setenv("MCP_INTERNAL_SERVICE_TOKEN", "s" * 32)
    monkeypatch.setattr(mcp_actions, "decode_jwt", lambda *_args, **_kwargs: claims)
    monkeypatch.setattr(
        mcp_actions, "require_canonical_session_authority", lambda _db: None
    )


def test_live_action_authority_revalidates_exact_durable_identity_and_policy():
    database = _LiveAuthorityDatabase()
    context = _context()
    policy = policy_for(context.operation_key)

    assert mcp_agent_grants.live_operator_action_authority_is_active(
        database, context=context, policy=policy
    ) is True

    activation_sql, activation_parameters = database.calls[0]
    authority_sql, authority_parameters = database.calls[1]
    assert "erp_security.activate_context" in activation_sql
    assert activation_parameters == {
        "auth_user_id": AUTH_USER_ID,
        "org_id": ORG_ID,
    }
    assert authority_parameters == {
        "org_id": ORG_ID,
        "agent_grant_id": GRANT_ID,
        "membership_id": MEMBERSHIP_ID,
        "client_id": "client-1",
        "user_id": USER_ID,
        "auth_user_id": AUTH_USER_ID,
        "operation_key": "sales.order.prepare",
        "operation_mode": "write",
        "risk_class": "consequential_write",
        "approval_policy": "actor_confirmation",
        "permission_code": "sales.order.create",
        "organization_scope": False,
        "branch_ids": [BRANCH_ID],
    }
    assert "LIMIT 2" in authority_sql


@pytest.mark.parametrize(
    ("revocation_case", "required_predicate"),
    (
        ("revoked grant", "grant_row.status='active'"),
        ("expired grant", "grant_row.expires_at>transaction_timestamp()"),
        ("missing or inactive capability", "capability.status='active'"),
        ("wrong client", "grant_row.client_id=:client_id"),
        ("wrong organization", "grant_row.org_id=:org_id"),
        ("wrong membership", "grant_row.subject_membership_id=:membership_id"),
        ("wrong user", "membership.user_id=:user_id"),
        ("inactive membership", "membership.status='active'"),
        ("inactive user", "user_row.status='active'"),
        ("inactive organization", "organization.status='active'"),
        ("wrong operation", "capability.capability_code=:operation_key"),
        ("wrong mode", "capability.operation_mode=:operation_mode"),
        ("wrong risk", "capability.risk_class=:risk_class"),
        ("wrong approval", "capability.approval_policy=:approval_policy"),
        ("wrong permission", "grant_permission.code=:permission_code"),
        ("expired RBAC", "grant_access.expires_at>transaction_timestamp()"),
    ),
)
def test_changed_durable_action_authority_fails_closed(
    revocation_case, required_predicate
):
    database = _LiveAuthorityDatabase(rows=[])
    context = _context()

    assert mcp_agent_grants.live_operator_action_authority_is_active(
        database, context=context, policy=policy_for(context.operation_key)
    ) is False, revocation_case
    assert required_predicate in database.calls[1][0]


@pytest.mark.parametrize(
    ("claim_change", "changed_value"),
    (
        ("mcp_client_id", "other-client"),
        ("org_id", str(uuid4())),
        ("membership_id", str(uuid4())),
        ("user_id", str(uuid4())),
    ),
)
def test_token_identity_drift_cannot_select_a_different_live_grant(
    monkeypatch, claim_change, changed_value
):
    claims = _claims(**{claim_change: changed_value})
    _prepare_action_dependency(monkeypatch, claims)
    database = _LiveAuthorityDatabase(
        expected_authority={
            "org_id": ORG_ID,
            "membership_id": MEMBERSHIP_ID,
            "client_id": "client-1",
            "user_id": USER_ID,
        }
    )

    with pytest.raises(HTTPException) as denied:
        mcp_actions.get_action_context(
            "Bearer delegated-token", _service_credentials(), database
        )
    assert denied.value.status_code == 403
    assert denied.value.detail["code"] == "SCOPE_DENIED"


def test_permission_claim_must_still_match_the_current_operation_policy(monkeypatch):
    _prepare_action_dependency(
        monkeypatch, _claims(operator_permission="sales.order.view")
    )
    database = _LiveAuthorityDatabase()

    with pytest.raises(HTTPException) as denied:
        mcp_actions.get_action_context(
            "Bearer delegated-token", _service_credentials(), database
        )
    assert denied.value.status_code == 403
    assert database.calls == []


def test_product_activation_revalidates_consequential_actor_confirmation(
    monkeypatch,
):
    claims = _claims(
        operator_operation="catalog.product.activate",
        operator_permission="catalog.product.manage",
        branch_ids=[],
        operator_organization_scope=True,
    )
    _prepare_action_dependency(monkeypatch, claims)
    database = _LiveAuthorityDatabase(
        rows=[SimpleNamespace(_mapping={"grant_branch_id": None})]
    )

    context = mcp_actions.get_action_context(
        "Bearer delegated-token", _service_credentials(), database
    )

    assert context.operation_key == "catalog.product.activate"
    assert context.organization_scope is True
    assert database.calls[1][1]["operation_mode"] == "write"
    assert database.calls[1][1]["risk_class"] == "consequential_write"
    assert database.calls[1][1]["approval_policy"] == "actor_confirmation"
    assert database.calls[1][1]["permission_code"] == "catalog.product.manage"
    assert master_write_policy_for(context.operation_key) is not None


def test_duplicate_live_authority_rows_fail_closed():
    context = _context()
    row = SimpleNamespace(_mapping={"grant_branch_id": BRANCH_ID})
    database = _LiveAuthorityDatabase(rows=[row, row])

    assert mcp_agent_grants.live_operator_action_authority_is_active(
        database, context=context, policy=policy_for(context.operation_key)
    ) is False


def test_context_operation_and_permission_cannot_drift_from_policy():
    database = _LiveAuthorityDatabase()
    policy = policy_for("sales.order.prepare")

    assert mcp_agent_grants.live_operator_action_authority_is_active(
        database,
        context=_context(operation_key="sales.dispatch.prepare"),
        policy=policy,
    ) is False
    assert mcp_agent_grants.live_operator_action_authority_is_active(
        database,
        context=_context(permission="sales.order.view"),
        policy=policy,
    ) is False
    assert database.calls == []

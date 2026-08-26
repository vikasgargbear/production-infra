import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core.auth import org_context
from app.core.auth.test_identity import (
    SyntheticIdentityConfigurationError,
    required_test_identity,
)
from app.core.security import permissions


TEST_IDENTITY_ENV = {
    "TEST_ORG_ID": "10000000-0000-4000-8000-000000000001",
    "TEST_BRANCH_ID": "17",
    "TEST_USER_ID": "10000000-0000-4000-8000-000000000002",
    "TEST_AUTH_USER_ID": "10000000-0000-4000-8000-000000000003",
    "TEST_USER_EMAIL": "synthetic-operator@example.invalid",
}


def _clear_test_identity(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in TEST_IDENTITY_ENV:
        monkeypatch.delenv(name, raising=False)


def test_test_identity_requires_every_fact(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_test_identity(monkeypatch)
    with pytest.raises(
        SyntheticIdentityConfigurationError,
        match="TEST_ORG_ID is required",
    ):
        required_test_identity()


def test_test_identity_validates_explicit_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for name, value in TEST_IDENTITY_ENV.items():
        monkeypatch.setenv(name, value)

    identity = required_test_identity()

    assert str(identity.organization_id) == TEST_IDENTITY_ENV["TEST_ORG_ID"]
    assert identity.branch_id == 17
    assert str(identity.user_id) == TEST_IDENTITY_ENV["TEST_USER_ID"]
    assert str(identity.auth_user_id) == TEST_IDENTITY_ENV["TEST_AUTH_USER_ID"]


def test_org_context_test_mode_fails_closed_without_identity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _clear_test_identity(monkeypatch)
    monkeypatch.setattr(org_context, "is_test_mode_enabled", lambda: True)
    monkeypatch.setattr(org_context, "is_production", lambda: False)

    with pytest.raises(HTTPException) as error:
        asyncio.run(org_context.get_org_context(SimpleNamespace(credentials=None)))
    assert error.value.status_code == 503


def test_permission_test_mode_uses_declared_identity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for name, value in TEST_IDENTITY_ENV.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setattr(permissions, "is_test_mode_enabled", lambda: True)
    monkeypatch.setattr(permissions, "is_production", lambda: False)

    user = asyncio.run(permissions.PermissionChecker()(None))

    assert user["org_id"] == TEST_IDENTITY_ENV["TEST_ORG_ID"]
    assert user["user_id"] == TEST_IDENTITY_ENV["TEST_USER_ID"]
    assert user["auth_user_id"] == TEST_IDENTITY_ENV["TEST_AUTH_USER_ID"]
    assert user["branch_ids"] == [17]

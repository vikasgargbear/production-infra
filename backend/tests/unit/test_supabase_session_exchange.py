import asyncio
import importlib
from uuid import UUID

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.api.routes.auth import oauth
from app.core.auth.supabase_auth import SupabaseAuthService
from app.main import app


AUTH_USER_ID = "8d19f4e8-3e4b-46a8-b7d9-87f30ddaf41c"
supabase_auth_module = importlib.import_module("app.core.auth.supabase_auth")


def _run(awaitable):
    return asyncio.run(awaitable)


def _credentials(token: str = "supabase-access-token"):
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def _identity(**overrides):
    identity = {
        "id": AUTH_USER_ID,
        "email": "operator@example.com",
        "email_confirmed_at": "2026-08-19T08:00:00Z",
        "app_metadata": {"provider": "google"},
    }
    identity.update(overrides)
    return identity


def _membership(**overrides):
    membership = {
        "user_id": 42,
        "auth_user_id": UUID(AUTH_USER_ID),
        "username": "operator",
        "email": "operator@example.com",
        "full_name": "ERP Operator",
        "org_id": UUID("9e1b4f9e-2dcc-47f5-8dfa-938005806841"),
        "is_active": True,
        "role_id": 7,
        "branch_ids": [5, 9],
        "is_admin": False,
        "org_name": "AASO Pharma",
        "org_active": True,
        "role_name": "Operator",
        "permissions": {"sales.read": True},
        "data_access_level": "region",
    }
    membership.update(overrides)
    return membership


def test_exchange_requires_bearer_credentials():
    with pytest.raises(HTTPException) as exc_info:
        _run(oauth.exchange_supabase_session(credentials=None, db=object()))

    assert exc_info.value.status_code == 401
    assert exc_info.value.headers == {"WWW-Authenticate": "Bearer"}


def test_exchange_openapi_accepts_bearer_token_not_identity_body():
    operation = app.openapi()["paths"]["/api/auth/oauth/supabase/session"]["post"]

    assert operation["security"] == [{"HTTPBearer": []}]
    assert "requestBody" not in operation


@pytest.mark.parametrize(
    ("identity_overrides", "expected_detail"),
    [
        ({"email_confirmed_at": None}, "Verified email is required"),
        ({"id": "browser-controlled-id"}, "Invalid Supabase identity"),
    ],
)
def test_exchange_rejects_unverified_or_malformed_identity(
    monkeypatch, identity_overrides, expected_detail
):
    async def verified_identity(_token):
        return _identity(**identity_overrides)

    monkeypatch.setattr(
        oauth.supabase_auth,
        "get_user_from_access_token",
        verified_identity,
    )

    with pytest.raises(HTTPException) as exc_info:
        _run(oauth.exchange_supabase_session(_credentials(), db=object()))

    assert exc_info.value.status_code in {401, 403}
    assert exc_info.value.detail == expected_detail


def test_exchange_requires_auth_user_id_membership_not_email_lookup(monkeypatch):
    async def verified_identity(_token):
        return _identity()

    looked_up = []
    monkeypatch.setattr(
        oauth.supabase_auth,
        "get_user_from_access_token",
        verified_identity,
    )
    monkeypatch.setattr(
        oauth.UserRepository,
        "find_by_auth_user_id",
        lambda auth_user_id, _db: looked_up.append(auth_user_id),
    )
    monkeypatch.setattr(
        oauth.UserRepository,
        "find_by_email",
        lambda *_args: pytest.fail("email-only membership lookup is unsafe"),
    )

    with pytest.raises(HTTPException) as exc_info:
        _run(oauth.exchange_supabase_session(_credentials(), db=object()))

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["error"] == "erp_membership_required"
    assert looked_up == [UUID(AUTH_USER_ID)]


@pytest.mark.parametrize(
    ("membership_overrides", "expected_detail"),
    [
        ({"is_active": False}, "Account is disabled"),
        ({"org_active": False}, "Organization is disabled"),
        (
            {"email": "different-erp-user@example.com"},
            "ERP membership email does not match identity",
        ),
    ],
)
def test_exchange_rejects_inactive_or_cross_identity_membership(
    monkeypatch, membership_overrides, expected_detail
):
    async def verified_identity(_token):
        return _identity()

    monkeypatch.setattr(
        oauth.supabase_auth,
        "get_user_from_access_token",
        verified_identity,
    )
    monkeypatch.setattr(
        oauth.UserRepository,
        "find_by_auth_user_id",
        lambda *_args: _membership(**membership_overrides),
    )

    with pytest.raises(HTTPException) as exc_info:
        _run(oauth.exchange_supabase_session(_credentials(), db=object()))

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == expected_detail


def test_exchange_issues_tenant_scoped_token_from_verified_mapping(monkeypatch):
    captured = {}

    async def verified_identity(token):
        captured["supabase_token"] = token
        return _identity()

    def create_token(data, expires_delta):
        captured["claims"] = data
        captured["expires_delta"] = expires_delta
        return "erp-access-token"

    monkeypatch.setattr(
        oauth.supabase_auth,
        "get_user_from_access_token",
        verified_identity,
    )
    monkeypatch.setattr(
        oauth.UserRepository,
        "find_by_auth_user_id",
        lambda auth_user_id, _db: _membership(auth_user_id=auth_user_id),
    )
    monkeypatch.setattr(oauth.UserRepository, "update_last_login", lambda *_args: True)
    monkeypatch.setattr(oauth, "create_access_token", create_token)

    result = _run(oauth.exchange_supabase_session(_credentials(), db=object()))

    assert result["access_token"] == "erp-access-token"
    assert captured["supabase_token"] == "supabase-access-token"
    assert captured["claims"]["auth_user_id"] == AUTH_USER_ID
    assert captured["claims"]["org_id"] == "9e1b4f9e-2dcc-47f5-8dfa-938005806841"
    assert captured["claims"]["branch_ids"] == ["5", "9"]
    assert captured["claims"]["branch_scope"] == "multi"
    assert captured["claims"]["auth_provider"] == "google"


def test_supabase_identity_lookup_fails_closed_without_configuration():
    service = SupabaseAuthService()
    service.supabase_url = None
    service.supabase_anon_key = None

    with pytest.raises(HTTPException) as exc_info:
        _run(service.get_user_from_access_token("never-sent"))

    assert exc_info.value.status_code == 503


def test_supabase_identity_lookup_uses_only_token_and_anon_key(monkeypatch):
    captured = {}

    class Response:
        status_code = 200

        @staticmethod
        def json():
            return _identity()

    class Client:
        def __init__(self, **kwargs):
            captured["client_kwargs"] = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, url, headers):
            captured["url"] = url
            captured["headers"] = headers
            return Response()

    service = SupabaseAuthService()
    service.supabase_url = "https://project.supabase.co"
    service.supabase_anon_key = "public-anon-key"
    service.supabase_service_key = "must-not-be-used"
    monkeypatch.setattr(supabase_auth_module.httpx, "AsyncClient", Client)

    result = _run(service.get_user_from_access_token("browser-session"))

    assert result["id"] == AUTH_USER_ID
    assert captured["url"] == "https://project.supabase.co/auth/v1/user"
    assert captured["headers"] == {
        "apikey": "public-anon-key",
        "Authorization": "Bearer browser-session",
    }
    assert "must-not-be-used" not in captured["headers"].values()
    assert captured["client_kwargs"] == {"timeout": 10.0}

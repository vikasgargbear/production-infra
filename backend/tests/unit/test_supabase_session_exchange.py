import asyncio
import importlib
import threading
import time
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.exc import TimeoutError as SQLAlchemyTimeoutError

from app.api.routes.auth import oauth
from app.core.auth.jwt_auth import decode_jwt
from app.core.auth.supabase_auth import SupabaseAuthService
from app.main import app, health_check


AUTH_USER_ID = "8d19f4e8-3e4b-46a8-b7d9-87f30ddaf41c"
ORG_ID = "9e1b4f9e-2dcc-47f5-8dfa-938005806841"
ERP_USER_ID = UUID("9f43f231-c0ec-4be5-a116-cabae4c45eb9")
ROLE_ID = UUID("71aa0ceb-6499-4de7-932a-d3743991d23e")
BRANCH_IDS = [
    UUID("ec9e5e5c-206f-45d6-93dd-1bdb5d4436a1"),
    UUID("08eb1210-7d9d-4d85-9301-8f3987794c69"),
]
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
        "app_metadata": {"provider": "google", "org_id": ORG_ID},
    }
    identity.update(overrides)
    return identity


def _membership(**overrides):
    membership = {
        "user_id": ERP_USER_ID,
        "auth_user_id": UUID(AUTH_USER_ID),
        "username": "operator",
        "email": "operator@example.com",
        "full_name": "ERP Operator",
        "org_id": UUID(ORG_ID),
        "is_active": True,
        "role_id": ROLE_ID,
        "branch_ids": BRANCH_IDS,
        "is_admin": False,
        "org_name": "AASO Pharma",
        "org_active": True,
        "role_name": "Operator",
        "permissions": {"sales.read": True},
        "data_access_level": "region",
    }
    membership.update(overrides)
    return membership


def _organization_resolution():
    return SimpleNamespace(
        mappings=lambda: SimpleNamespace(
            all=lambda: [
                {
                    "org_id": UUID(ORG_ID),
                    "resolution": "exactly_one_active_membership",
                }
            ]
        )
    )


@pytest.fixture(autouse=True)
def _open_canonical_session_authority(monkeypatch):
    class SessionOwner:
        def __enter__(self):
            return self

        def execute(self, *_args, **_kwargs):
            return _organization_resolution()

        def __exit__(self, _exc_type, _exc, _traceback):
            return False

    monkeypatch.setattr(oauth, "SessionLocal", SessionOwner)
    monkeypatch.setattr(
        oauth,
        "require_canonical_session_authority",
        lambda _db: True,
    )


def test_exchange_requires_bearer_credentials():
    with pytest.raises(HTTPException) as exc_info:
        _run(oauth.exchange_supabase_session(credentials=None))

    assert exc_info.value.status_code == 401
    assert exc_info.value.headers == {"WWW-Authenticate": "Bearer"}


def test_exchange_openapi_accepts_bearer_token_not_identity_body():
    schema = app.openapi()
    operation = schema["paths"]["/api/auth/oauth/supabase/session"]["post"]

    assert operation["security"] == [{"HTTPBearer": []}]
    assert "requestBody" not in operation
    assert "/api/auth/login" not in schema["paths"]
    assert "/api/auth/check-user" not in schema["paths"]
    assert "/api/auth/logout" in schema["paths"]
    assert "/api/auth/verify-token" in schema["paths"]
    assert "OAuth2PasswordBearer" not in schema["components"]["securitySchemes"]


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
        _run(oauth.exchange_supabase_session(_credentials()))

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
        lambda auth_user_id, organization_id, _db: looked_up.append(
            (auth_user_id, organization_id)
        ),
    )

    with pytest.raises(HTTPException) as exc_info:
        _run(oauth.exchange_supabase_session(_credentials()))

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["error"] == "invalid_organization_assignment"
    assert looked_up == [(UUID(AUTH_USER_ID), UUID(ORG_ID))]
    assert not hasattr(oauth.UserRepository, "find_by_email")


def test_exchange_returns_forbidden_for_database_membership_denial(monkeypatch):
    async def verified_identity(_token):
        return _identity()

    monkeypatch.setattr(
        oauth.supabase_auth,
        "get_user_from_access_token",
        verified_identity,
    )

    def deny_membership(*_args):
        raise oauth.MembershipContextDenied

    monkeypatch.setattr(
        oauth.UserRepository,
        "find_by_auth_user_id",
        deny_membership,
    )

    with pytest.raises(HTTPException) as exc_info:
        _run(oauth.exchange_supabase_session(_credentials()))

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["error"] == "invalid_organization_assignment"


def test_exchange_reports_maintenance_before_membership_lookup_when_fenced(
    monkeypatch,
):
    async def verified_identity(_token):
        return _identity()

    membership_lookups = []
    monkeypatch.setattr(
        oauth.supabase_auth,
        "get_user_from_access_token",
        verified_identity,
    )
    monkeypatch.setattr(
        oauth,
        "require_canonical_session_authority",
        lambda _db: (_ for _ in ()).throw(
            HTTPException(
                status_code=503,
                detail={
                    "error": "erp_maintenance",
                    "message": "ERP maintenance is in progress. Please retry shortly.",
                },
            )
        ),
    )
    monkeypatch.setattr(
        oauth.UserRepository,
        "find_by_auth_user_id",
        lambda *_args: membership_lookups.append(True),
    )

    with pytest.raises(HTTPException) as exc_info:
        _run(oauth.exchange_supabase_session(_credentials()))

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == {
        "error": "erp_maintenance",
        "message": "ERP maintenance is in progress. Please retry shortly.",
    }
    assert membership_lookups == []


def test_exchange_without_assignment_returns_typed_onboarding_state(monkeypatch):
    async def verified_identity(_token):
        return _identity(app_metadata={"provider": "google"})

    monkeypatch.setattr(
        oauth.supabase_auth,
        "get_user_from_access_token",
        verified_identity,
    )
    monkeypatch.setattr(
        oauth,
        "_resolved_organization_assignment",
        lambda *_args: None,
    )

    with pytest.raises(HTTPException) as exc_info:
        _run(oauth.exchange_supabase_session(_credentials()))

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["error"] == "onboarding_required"
    assert exc_info.value.detail["allowed_actions"] == [
        "create_organization",
        "accept_invitation",
    ]


def test_closed_authority_precedes_missing_organization_assignment(monkeypatch):
    async def verified_identity(_token):
        return _identity(app_metadata={"provider": "google"})

    monkeypatch.setattr(
        oauth.supabase_auth,
        "get_user_from_access_token",
        verified_identity,
    )
    monkeypatch.setattr(
        oauth,
        "require_canonical_session_authority",
        lambda _db: (_ for _ in ()).throw(
            HTTPException(
                status_code=503,
                detail={
                    "error": "erp_maintenance",
                    "message": "ERP maintenance is in progress. Please retry shortly.",
                },
            )
        ),
    )

    with pytest.raises(HTTPException) as exc_info:
        _run(oauth.exchange_supabase_session(_credentials()))

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail["error"] == "erp_maintenance"


@pytest.mark.parametrize(
    ("membership_overrides", "expected_detail"),
    [
        ({"is_active": False}, "Account is disabled"),
        ({"org_active": False}, "Organization is disabled"),
    ],
)
def test_exchange_rejects_inactive_membership(
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
        _run(oauth.exchange_supabase_session(_credentials()))

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
        lambda auth_user_id, _organization_id, _db: _membership(
            auth_user_id=auth_user_id
        ),
    )
    monkeypatch.setattr(oauth, "create_access_token", create_token)

    result = _run(oauth.exchange_supabase_session(_credentials()))

    assert result["access_token"] == "erp-access-token"
    assert captured["supabase_token"] == "supabase-access-token"
    assert captured["claims"]["auth_user_id"] == AUTH_USER_ID
    assert captured["claims"]["user_id"] == str(ERP_USER_ID)
    assert captured["claims"]["org_id"] == "9e1b4f9e-2dcc-47f5-8dfa-938005806841"
    assert captured["claims"]["role_id"] == str(ROLE_ID)
    assert captured["claims"]["branch_ids"] == [str(value) for value in BRANCH_IDS]
    assert captured["claims"]["branch_scope"] == "multi"
    assert captured["claims"]["permissions"] == {"sales.read": True}
    assert captured["claims"]["auth_provider"] == "google"


def test_exchange_encodes_canonical_uuid_claims(monkeypatch):
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
        lambda *_args: _membership(),
    )

    result = _run(oauth.exchange_supabase_session(_credentials()))
    claims = decode_jwt(result["access_token"], check_blacklist=False)

    assert claims["user_id"] == str(ERP_USER_ID)
    assert claims["role_id"] == str(ROLE_ID)
    assert claims["branch_ids"] == [str(value) for value in BRANCH_IDS]
    assert claims["permissions"] == {"sales.read": True}


@pytest.mark.asyncio
async def test_exchange_keeps_event_loop_responsive_and_closes_owned_session(
    monkeypatch,
):
    started = threading.Event()
    release = threading.Event()
    lifecycle = []

    class OwnedSession:
        def __enter__(self):
            lifecycle.append("entered")
            return self

        def __exit__(self, _exc_type, _exc, _traceback):
            lifecycle.append("closed")
            return False

        def execute(self, *_args, **_kwargs):
            return _organization_resolution()

    async def verified_identity(_token):
        return _identity()

    def blocking_authority(_db):
        started.set()
        assert release.wait(timeout=1.0)

    monkeypatch.setattr(oauth, "SessionLocal", OwnedSession)
    monkeypatch.setattr(
        oauth.supabase_auth,
        "get_user_from_access_token",
        verified_identity,
    )
    monkeypatch.setattr(oauth, "require_canonical_session_authority", blocking_authority)
    monkeypatch.setattr(
        oauth.UserRepository,
        "find_by_auth_user_id",
        lambda *_args: _membership(),
    )

    began_at = time.monotonic()

    async def probe_health():
        await asyncio.sleep(0.05)
        return time.monotonic(), await health_check()

    health_task = asyncio.create_task(probe_health())
    failsafe = threading.Timer(0.4, release.set)
    failsafe.start()
    try:
        result = await oauth.exchange_supabase_session(_credentials())
        health_at, health = await health_task
    finally:
        release.set()
        failsafe.cancel()

    assert started.is_set()
    assert health_at - began_at < 0.2
    assert health["status"] == "healthy"
    assert result["access_token"]
    assert lifecycle == ["entered", "closed"]


@pytest.mark.asyncio
async def test_concurrent_exchanges_close_every_thread_owned_session(monkeypatch):
    lifecycle_lock = threading.Lock()
    created = 0
    closed = 0

    class OwnedSession:
        def __enter__(self):
            nonlocal created
            with lifecycle_lock:
                created += 1
            return self

        def __exit__(self, _exc_type, _exc, _traceback):
            nonlocal closed
            with lifecycle_lock:
                closed += 1
            return False

        def execute(self, *_args, **_kwargs):
            return _organization_resolution()

    async def verified_identity(_token):
        return _identity()

    monkeypatch.setattr(oauth, "SessionLocal", OwnedSession)
    monkeypatch.setattr(
        oauth.supabase_auth,
        "get_user_from_access_token",
        verified_identity,
    )
    monkeypatch.setattr(
        oauth.UserRepository,
        "find_by_auth_user_id",
        lambda *_args: _membership(),
    )

    results = await asyncio.gather(*(
        oauth.exchange_supabase_session(_credentials(f"token-{index}"))
        for index in range(6)
    ))

    assert all(result["access_token"] for result in results)
    assert created == 6
    assert closed == 6


@pytest.mark.asyncio
async def test_pool_timeout_still_closes_thread_owned_session(monkeypatch):
    lifecycle = []

    class OwnedSession:
        def __enter__(self):
            lifecycle.append("entered")
            return self

        def __exit__(self, _exc_type, _exc, _traceback):
            lifecycle.append("closed")
            return False

    async def verified_identity(_token):
        return _identity()

    monkeypatch.setattr(oauth, "SessionLocal", OwnedSession)
    monkeypatch.setattr(
        oauth.supabase_auth,
        "get_user_from_access_token",
        verified_identity,
    )
    monkeypatch.setattr(
        oauth,
        "require_canonical_session_authority",
        lambda _db: (_ for _ in ()).throw(
            SQLAlchemyTimeoutError("reviewed pool is full")
        ),
    )

    with pytest.raises(SQLAlchemyTimeoutError):
        await oauth.exchange_supabase_session(_credentials())

    assert lifecycle == ["entered", "closed"]


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


def test_consent_proposal_is_subject_and_preregistered_client_bound(monkeypatch):
    async def verified_identity(_token):
        return _identity()

    grant_id = UUID("44444444-4444-4444-4444-444444444444")
    row = SimpleNamespace(
        _mapping={
            "org_id": UUID(ORG_ID),
            "organization_name": "AASO Pharma",
            "membership_id": UUID("33333333-3333-3333-3333-333333333333"),
            "agent_grant_id": grant_id,
            "client_id": "client-1",
            "client_display_name": "Reviewed Assistant",
            "branch_id": None,
            "branch_name": None,
            "consent_version": "v1",
            "expires_at": datetime(2099, 1, 1, tzinfo=timezone.utc),
            "capability_code": "master.products.search",
            "operation_mode": "read",
            "risk_class": "read_only",
            "approval_policy": "none",
            "maximum_amount": None,
            "currency_code": None,
            "allow_sensitive_read": False,
        }
    )
    captured = {}

    class Database:
        def __init__(self):
            self.calls = []

        def execute(self, statement, params):
            self.calls.append((str(statement), params))
            if "resolve_auth_organization" in str(statement):
                class Resolution:
                    @staticmethod
                    def mappings():
                        return Resolution()

                    @staticmethod
                    def all():
                        return [
                            {
                                "org_id": UUID(ORG_ID),
                                "resolution": "exactly_one_active_membership",
                            }
                        ]

                return Resolution()

    database = Database()
    monkeypatch.setenv("MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS", "client-1,client-2")
    monkeypatch.setattr(oauth.supabase_auth, "get_user_from_access_token", verified_identity)
    monkeypatch.setattr(
        oauth,
        "_mcp_consent_proposal_rows",
        lambda _db, subject, organization_id, client_id: captured.update(
            {
                "subject": subject,
                "organization_id": organization_id,
                "client_id": client_id,
            }
        ) or [row],
    )

    result = _run(
        oauth.get_mcp_consent_proposal("client-1", _credentials(), db=database)
    )

    assert result.subject == UUID(AUTH_USER_ID)
    assert result.agent_grant_id == grant_id
    assert result.client_display_name == "Reviewed Assistant"
    assert result.capabilities[0].capability_code == "master.products.search"
    assert captured == {
        "subject": UUID(AUTH_USER_ID),
        "organization_id": UUID(ORG_ID),
        "client_id": "client-1",
    }
    assert len(database.calls) == 2
    assert "resolve_auth_organization" in database.calls[0][0]
    assert database.calls[1] == (
        "SELECT erp_security.activate_context(:auth_user_id, :org_id)",
        {"auth_user_id": UUID(AUTH_USER_ID), "org_id": UUID(ORG_ID)},
    )


@pytest.mark.parametrize(
    "app_metadata",
    [
        {"provider": "google"},
        {"provider": "google", "organization_id": ORG_ID},
        {"provider": "google", "org_id": "not-a-uuid"},
    ],
)
def test_consent_proposal_requires_exact_canonical_app_metadata_org_id(
    monkeypatch, app_metadata
):
    async def verified_identity(_token):
        return _identity(app_metadata=app_metadata)

    monkeypatch.setenv("MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS", "client-1")
    monkeypatch.setattr(oauth.supabase_auth, "get_user_from_access_token", verified_identity)
    monkeypatch.setattr(
        oauth,
        "_resolved_organization_assignment",
        lambda *_args: (
            (_ for _ in ()).throw(
                HTTPException(
                    status_code=403,
                    detail=oauth.INVALID_ASSIGNMENT_DETAIL,
                )
            )
            if app_metadata.get("org_id") == "not-a-uuid"
            else None
        ),
    )
    monkeypatch.setattr(
        oauth,
        "_mcp_consent_proposal_rows",
        lambda *_args: pytest.fail("invalid organization metadata must not reach the database"),
    )

    with pytest.raises(HTTPException) as denied:
        _run(oauth.get_mcp_consent_proposal("client-1", _credentials(), db=object()))

    assert denied.value.status_code == 403
    expected_error = (
        "invalid_organization_assignment"
        if app_metadata.get("org_id") == "not-a-uuid"
        else "onboarding_required"
    )
    assert denied.value.detail["error"] == expected_error


def test_consent_proposal_query_is_explicitly_organization_bound():
    captured = {}

    class Result:
        @staticmethod
        def fetchall():
            return []

    class Database:
        @staticmethod
        def execute(statement, params):
            captured.update({"statement": str(statement), "params": params})
            return Result()

    subject = UUID(AUTH_USER_ID)
    organization_id = UUID(ORG_ID)
    rows = oauth._mcp_consent_proposal_rows(
        Database(), subject, organization_id, "client-1"
    )

    assert rows == []
    assert "grant_row.org_id=:organization_id" in captured["statement"]
    assert captured["params"] == {
        "subject": subject,
        "organization_id": organization_id,
        "client_id": "client-1",
    }


def test_consent_proposal_rejects_wrong_client_before_database_lookup(monkeypatch):
    monkeypatch.setenv("MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS", "client-1")
    monkeypatch.setattr(
        oauth,
        "_mcp_consent_proposal_rows",
        lambda *_args: pytest.fail("wrong client must not reach the database"),
    )

    with pytest.raises(HTTPException) as denied:
        _run(oauth.get_mcp_consent_proposal("wrong-client", _credentials(), db=object()))

    assert denied.value.status_code == 403
    assert denied.value.detail == "OAuth client is not pre-registered"


def test_consent_proposal_rejects_stale_cloud_session_during_maintenance(monkeypatch):
    async def verified_identity(_token):
        return _identity()

    monkeypatch.setenv("MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS", "client-1")
    monkeypatch.setattr(oauth.supabase_auth, "get_user_from_access_token", verified_identity)
    monkeypatch.setattr(
        oauth,
        "require_canonical_session_authority",
        lambda _db: (_ for _ in ()).throw(
            HTTPException(
                status_code=503,
                detail={"error": "erp_maintenance", "message": "maintenance"},
            )
        ),
    )
    monkeypatch.setattr(
        oauth,
        "_mcp_consent_proposal_rows",
        lambda *_args: pytest.fail("maintenance must precede grant lookup"),
    )

    with pytest.raises(HTTPException) as blocked:
        _run(oauth.get_mcp_consent_proposal("client-1", _credentials(), db=object()))

    assert blocked.value.status_code == 503
    assert blocked.value.detail["error"] == "erp_maintenance"


def test_consent_proposal_sql_requires_live_canonical_authority():
    source = (oauth.__file__ and open(oauth.__file__, encoding="utf-8").read()) or ""
    for fragment in (
        "automation.agent_grants",
        "automation.agent_grant_capabilities",
        "core.memberships",
        "core.access_grants",
        "erp_security.activate_context(:auth_user_id, :org_id)",
        "grant_row.org_id=:organization_id",
        "grant_row.status='active'",
        "grant_row.expires_at>transaction_timestamp()",
        "access_grant.valid_from_at<=transaction_timestamp()",
        "capability.status='active'",
    ):
        assert fragment in source
    assert "SUPABASE_SERVICE_ROLE_KEY" not in source

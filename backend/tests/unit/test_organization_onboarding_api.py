import asyncio
from datetime import datetime, timedelta, timezone
import hashlib
from uuid import UUID

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jwt import InvalidTokenError
from pydantic import ValidationError

from app.api.routes.auth import oauth, onboarding
from app.core.auth.jwt_auth import create_access_token, decode_jwt
from app.main import app


AUTH_USER_ID = UUID("8d19f4e8-3e4b-46a8-b7d9-87f30ddaf41c")
ORG_ID = UUID("9e1b4f9e-2dcc-47f5-8dfa-938005806841")
MEMBERSHIP_ID = UUID("33333333-3333-3333-3333-333333333333")
ROLE_ID = UUID("71aa0ceb-6499-4de7-932a-d3743991d23e")
INVITATION_ID = UUID("55555555-5555-4555-8555-555555555555")


def _run(awaitable):
    return asyncio.run(awaitable)


def _credentials():
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials="supabase-token")


def _identity(email="new.owner@example.com"):
    return {
        "id": str(AUTH_USER_ID),
        "email": email,
        "email_confirmed_at": "2026-08-28T08:00:00Z",
        "app_metadata": {"provider": "google"},
        "user_metadata": {"full_name": "New Owner"},
    }


@pytest.fixture(autouse=True)
def _open_authority(monkeypatch):
    monkeypatch.setattr(onboarding, "require_canonical_session_authority", lambda _db: None)


def test_public_onboarding_payloads_are_exact_and_strongly_validated():
    organization = onboarding.CreateOrganizationRequest(
        legal_name="Northwind Pharma Private Limited",
        trade_name="Northwind Pharma",
        address_line1="10 Market Road",
        city="Mumbai",
        state_code="27",
        postal_code="400001",
    )
    assert organization.model_dump() == {
        "legal_name": "Northwind Pharma Private Limited",
        "trade_name": "Northwind Pharma",
        "address_line1": "10 Market Road",
        "city": "Mumbai",
        "state_code": "27",
        "postal_code": "400001",
    }
    assert onboarding.CreateOrganizationRequest(
        legal_name="Northwind Pharma Private Limited",
        trade_name="   ",
        address_line1="10 Market Road",
        city="Mumbai",
        state_code="27",
        postal_code="400001",
    ).trade_name is None
    assert onboarding.AcceptInvitationRequest(
        invitation_token="x" * 80
    ).model_dump() == {"invitation_token": "x" * 80}

    with pytest.raises(ValidationError):
        onboarding.CreateOrganizationRequest(
            legal_name="Northwind Pharma",
            address_line1="10 Market Road",
            city="Mumbai",
            state_code="MH",
            postal_code="400001",
        )
    with pytest.raises(ValidationError):
        onboarding.CreateOrganizationRequest(
            legal_name="Northwind Pharma",
            address_line1="10 Market Road",
            city="Mumbai",
            state_code="27",
            postal_code="000001",
            display_name="must not be accepted",
        )


def test_invitation_scope_validation_requires_explicit_role_and_matching_branch():
    with pytest.raises(ValidationError):
        onboarding.CreateInvitationRequest(
            email="operator@example.com",
            role_id=ROLE_ID,
            scope_kind="branch",
        )
    with pytest.raises(ValidationError):
        onboarding.CreateInvitationRequest(
            email="operator@example.com",
            role_id=ROLE_ID,
            scope_kind="organization",
            branch_id=UUID("44444444-4444-4444-4444-444444444444"),
        )


def test_session_resolves_exactly_one_active_membership_without_client_org_hint():
    captured = {}

    class Result:
        @staticmethod
        def mappings():
            return Result()

        @staticmethod
        def all():
            return [
                {
                    "org_id": ORG_ID,
                    "resolution": "exactly_one_active_membership",
                }
            ]

    class Database:
        def execute(self, statement, parameters):
            captured["statement"] = str(statement)
            captured["parameters"] = parameters
            return Result()

    result = oauth._resolved_organization_assignment(
        _identity(), AUTH_USER_ID, Database()
    )

    assert result == ORG_ID
    assert "resolve_auth_organization" in captured["statement"]
    assert captured["parameters"] == {"verified_auth_user_id": AUTH_USER_ID}


def test_session_rejects_ambiguous_memberships_without_trusting_a_header():
    class Result:
        @staticmethod
        def mappings():
            return Result()

        @staticmethod
        def all():
            return [{"org_id": None, "resolution": "multiple_active_memberships"}]

    class Database:
        @staticmethod
        def execute(*_args):
            return Result()

    with pytest.raises(HTTPException) as denied:
        oauth._resolved_organization_assignment(_identity(), AUTH_USER_ID, Database())

    assert denied.value.status_code == 409
    assert denied.value.detail["error"] == "organization_selection_required"


def test_create_organization_uses_verified_identity_not_public_identity_fields(monkeypatch):
    captured = {}

    async def verified_identity(_token):
        return _identity()

    monkeypatch.setattr(onboarding.supabase_auth, "get_user_from_access_token", verified_identity)
    monkeypatch.setattr(
        onboarding,
        "_command_row",
        lambda _db, statement, parameters: captured.update(
            {"statement": statement, "parameters": parameters}
        )
        or {"org_id": ORG_ID, "membership_id": MEMBERSHIP_ID},
    )
    request = onboarding.CreateOrganizationRequest(
        legal_name="Northwind Pharma Private Limited",
        trade_name=None,
        address_line1="10 Market Road",
        city="Mumbai",
        state_code="27",
        postal_code="400001",
    )

    result = _run(onboarding.create_organization(request, _credentials(), object()))

    assert result.organization_id == ORG_ID
    assert captured["parameters"]["verified_auth_user_id"] == AUTH_USER_ID
    assert captured["parameters"]["verified_email"] == "new.owner@example.com"
    assert captured["parameters"]["display_name"] == "New Owner"
    assert "onboard_organization" in captured["statement"]


def test_invitation_tokens_are_purpose_separated_from_erp_access_tokens():
    erp_token = create_access_token(
        {
            "auth_user_id": str(AUTH_USER_ID),
            "user_id": str(AUTH_USER_ID),
            "org_id": str(ORG_ID),
        }
    )
    with pytest.raises(HTTPException) as denied:
        onboarding._decode_invitation_token(erp_token)

    assert denied.value.status_code == 400
    assert denied.value.detail["error"] == "invalid_invitation"

    issued_at = datetime.now(timezone.utc)
    invitation_token = onboarding._encode_invitation_token(
        {
            "iss": onboarding.INVITATION_TOKEN_ISSUER,
            "aud": onboarding.INVITATION_TOKEN_AUDIENCE,
            "token_use": onboarding.INVITATION_TOKEN_USE,
            "iat": issued_at,
            "exp": issued_at + timedelta(hours=1),
            "jti": "77777777-7777-4777-8777-777777777777",
            "invitation_id": str(INVITATION_ID),
            "organization_id": str(ORG_ID),
            "inviting_membership_id": str(MEMBERSHIP_ID),
            "requested_role_id": str(ROLE_ID),
            "requested_scope_kind": "organization",
            "requested_branch_id": None,
            "email": "invitee@example.com",
        }
    )
    assert onboarding._decode_invitation_token(invitation_token)[
        "invitation_id"
    ] == str(INVITATION_ID)
    with pytest.raises(InvalidTokenError):
        decode_jwt(invitation_token, check_blacklist=False)


def test_create_invitation_persists_only_digest_and_returns_token_once(monkeypatch):
    captured = {}

    class Result:
        def __init__(self, row=None):
            self.row = row

        def mappings(self):
            return self

        def one(self):
            return self.row

    class Database:
        def __init__(self):
            self.calls = []

        def execute(self, statement, parameters=None):
            self.calls.append((str(statement), parameters))
            if "current_membership_id" in str(statement):
                return Result({"membership_id": MEMBERSHIP_ID})
            return Result()

        def rollback(self):
            pytest.fail("successful invitation must not roll back")

    database = Database()
    monkeypatch.setenv("APP_URL", "https://erp.example.com")

    def encode(claims):
        captured["claims"] = claims
        return "signed.invitation.token"

    def command(_db, statement, parameters):
        captured["statement"] = statement
        captured["parameters"] = parameters
        return {
            "invitation_id": parameters["invitation_id"],
            "org_id": ORG_ID,
            "email": "invitee@example.com",
            "expires_at": parameters["expires_at"],
        }

    monkeypatch.setattr(onboarding, "_encode_invitation_token", encode)
    monkeypatch.setattr(onboarding, "_command_row", command)
    request = onboarding.CreateInvitationRequest(
        email="INVITEE@example.com",
        role_id=ROLE_ID,
        scope_kind="organization",
    )

    result = onboarding.create_invitation(
        request,
        {
            "org_id": str(ORG_ID),
            "auth_user_id": str(AUTH_USER_ID),
            "is_admin": True,
            "permissions": {},
        },
        database,
    )

    assert result.token == "signed.invitation.token"
    assert result.invitation_url.startswith(
        "https://erp.example.com/?invitation_token=signed.invitation.token"
    )
    assert captured["claims"]["organization_id"] == str(ORG_ID)
    assert captured["claims"]["inviting_membership_id"] == str(MEMBERSHIP_ID)
    assert captured["claims"]["email"] == "invitee@example.com"
    assert captured["parameters"]["token_digest"] == hashlib.sha256(
        result.token.encode("utf-8")
    ).digest()
    assert result.token not in repr(captured["parameters"])
    assert "create_organization_invitation" in captured["statement"]


def test_accept_invitation_binds_verified_email_and_signed_claims(monkeypatch):
    captured = {}
    issued_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    expires_at = issued_at + timedelta(days=7)
    token = "signed.invitation." + "x" * 80

    async def verified_identity(_token):
        return _identity("invitee@example.com")

    monkeypatch.setattr(onboarding.supabase_auth, "get_user_from_access_token", verified_identity)
    monkeypatch.setattr(
        onboarding,
        "_decode_invitation_token",
        lambda _token: {
            "invitation_id": str(INVITATION_ID),
            "organization_id": str(ORG_ID),
            "inviting_membership_id": str(MEMBERSHIP_ID),
            "requested_role_id": str(ROLE_ID),
            "requested_scope_kind": "organization",
            "requested_branch_id": None,
            "email": "invitee@example.com",
            "iat": int(issued_at.timestamp()),
            "exp": int(expires_at.timestamp()),
        },
    )
    monkeypatch.setattr(
        onboarding,
        "_command_row",
        lambda _db, statement, parameters: captured.update(
            {"statement": statement, "parameters": parameters}
        )
        or {"org_id": ORG_ID, "membership_id": MEMBERSHIP_ID},
    )

    result = _run(
        onboarding.accept_invitation(
            onboarding.AcceptInvitationRequest(invitation_token=token),
            _credentials(),
            object(),
        )
    )

    assert result.next_action == "exchange_session"
    assert captured["parameters"]["verified_email"] == "invitee@example.com"
    assert captured["parameters"]["invitation_id"] == INVITATION_ID
    assert captured["parameters"]["token_digest"] == hashlib.sha256(
        token.encode("utf-8")
    ).digest()
    assert "accept_organization_invitation" in captured["statement"]


def test_onboarding_routes_are_explicitly_authenticated_in_openapi():
    schema = app.openapi()
    assert schema["paths"]["/api/auth/onboarding/organizations"]["post"]["security"] == [
        {"HTTPBearer": []}
    ]
    assert schema["paths"]["/api/auth/onboarding/invitations/accept"]["post"][
        "security"
    ] == [{"HTTPBearer": []}]

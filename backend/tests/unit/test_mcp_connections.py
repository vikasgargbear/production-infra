import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError

from app.api.routes.auth import mcp_connections as routes


@pytest.fixture
def identity(monkeypatch):
    subject = uuid4()
    monkeypatch.setattr(routes.supabase_auth, "get_user_from_access_token", AsyncMock(
        return_value={"id": str(subject), "email_confirmed_at": "2026-01-01"}))
    monkeypatch.setattr(routes, "require_canonical_session_authority", lambda db: None)
    monkeypatch.setattr(routes, "_clients", lambda: {"reviewed-client"})
    return subject


def test_options_only_registered_clients_without_writes(identity):
    db = Mock()
    db.execute.return_value.scalar_one.return_value = [
        {"client_id": "reviewed-client"}, {"client_id": "other"}]
    assert asyncio.run(routes.list_connection_proposals(SimpleNamespace(credentials="token"), db)) == [
        {"client_id": "reviewed-client"}]
    assert db.execute.call_args.args[1] == {"subject": identity}
    db.commit.assert_not_called()


def test_confirmation_only_calls_named_authority(identity):
    db = Mock()
    db.execute.return_value.scalar_one.return_value = {"confirmed": True}
    request = routes.ConnectionConsent(organization_id=uuid4(), agent_grant_id=uuid4(),
        client_id="reviewed-client", proposal_fingerprint="a" * 64)
    assert asyncio.run(routes.confirm_connection(request, SimpleNamespace(credentials="token"), db)) == {"confirmed": True}
    assert "erp_core_commands.confirm_mcp_connection" in str(db.execute.call_args.args[0])
    assert db.execute.call_args.args[1]["subject"] == identity
    db.commit.assert_called_once()


def test_authority_rejection_never_reports_success_or_database_detail(identity):
    db = Mock()
    db.execute.side_effect = SQLAlchemyError("private data")
    request = routes.ConnectionConsent(organization_id=uuid4(), agent_grant_id=uuid4(),
        client_id="reviewed-client", proposal_fingerprint="a" * 64)
    with pytest.raises(HTTPException) as raised:
        asyncio.run(routes.confirm_connection(request, SimpleNamespace(credentials="token"), db))
    assert "private" not in str(raised.value.detail)
    db.commit.assert_not_called()
    db.rollback.assert_called_once()


def test_no_credentials_no_proposals_or_commands():
    db = Mock()
    with pytest.raises(HTTPException) as raised:
        asyncio.run(routes.list_connection_proposals(None, db))
    assert raised.value.status_code == 401
    db.execute.assert_not_called()


def test_delegated_oauth_identity_rejection_stops_before_database(monkeypatch):
    # The shared verified first-party boundary rejects an OAuth client bearer;
    # the connection route must not turn that rejection into a new receipt.
    monkeypatch.setattr(routes.supabase_auth, "get_user_from_access_token", AsyncMock(
        side_effect=HTTPException(status_code=403, detail="Use first-party sign-in")))
    db = Mock()
    request = routes.ConnectionConsent(organization_id=uuid4(), agent_grant_id=uuid4(),
        client_id="reviewed-client", proposal_fingerprint="a" * 64)
    with pytest.raises(HTTPException) as raised:
        asyncio.run(routes.confirm_connection(request, SimpleNamespace(credentials="delegated"), db))
    assert raised.value.status_code == 403
    db.execute.assert_not_called()
    db.commit.assert_not_called()

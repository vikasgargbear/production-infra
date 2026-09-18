"""Inactive signed tenants fail closed without leaking database diagnostics."""

from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import DBAPIError

from app.api.routes.internal.mcp_agent_grants import _activate_signed_organization


def database_error(code, primary):
    original = Exception("private database detail")
    original.pgcode = code
    original.diag = SimpleNamespace(message_primary=primary)
    return DBAPIError("private SQL", {"private": "parameter"}, original)


def test_inactive_signed_tenant_requires_reconsent_without_fallback():
    subject, organization = uuid4(), uuid4()
    db = Mock()
    db.execute.side_effect = database_error(
        "42501", "invalid or inactive ERP authenticated organization membership"
    )
    with pytest.raises(HTTPException) as raised:
        _activate_signed_organization(db, subject, organization)
    assert raised.value.status_code == 403
    assert raised.value.detail["error"] == "organization_reconsent_required"
    assert "private" not in str(raised.value.detail)
    db.execute.assert_called_once()
    assert db.execute.call_args.args[1] == {
        "auth_user_id": subject, "org_id": organization
    }
    db.rollback.assert_called_once_with()


@pytest.mark.parametrize("code,primary", [
    ("42501", "permission denied for function activate_context"),
    ("08006", "connection failure"),
    ("23514", "invalid or inactive ERP authenticated organization membership"),
    ("42501", "invalid or inactive ERP authenticated organization membership PRIVATE"),
])
def test_unrelated_database_failure_is_not_misreported_as_reconsent(code, primary):
    db = Mock()
    failure = database_error(code, primary)
    db.execute.side_effect = failure
    with pytest.raises(DBAPIError) as raised:
        _activate_signed_organization(db, uuid4(), uuid4())
    assert raised.value is failure
    db.rollback.assert_not_called()


def test_valid_signed_tenant_is_used_unchanged():
    db = Mock()
    subject, organization = uuid4(), uuid4()
    _activate_signed_organization(db, subject, organization)
    db.execute.assert_called_once()
    assert db.execute.call_args.args[1]["org_id"] == organization
    db.rollback.assert_not_called()

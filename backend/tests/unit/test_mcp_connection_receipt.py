from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.routes.internal.mcp_connection_receipt import require_connection_receipt


def receipt():
    return {"version": "erp_mcp_connection_v1", "receipt_id": str(uuid4()),
        "organization_id": str(uuid4()), "agent_grant_id": str(uuid4()),
        "consent_version": "v1", "proposal_fingerprint": "a" * 64}


@pytest.mark.parametrize("matches", [False, None, {}, 1])
def test_only_exact_current_receipt_is_allowed(matches):
    from uuid import UUID
    supplied = receipt()
    db = Mock()
    db.execute.return_value.scalar_one.return_value = matches
    with pytest.raises(HTTPException) as raised:
        require_connection_receipt(db, uuid4(), "client", UUID(supplied["organization_id"]), supplied)
    assert raised.value.detail["error"] == "organization_reconsent_required"


def test_different_tenant_or_grant_rejected_before_database_lookup():
    db = Mock()
    with pytest.raises(HTTPException):
        require_connection_receipt(db, uuid4(), "client", uuid4(), receipt())
    db.execute.assert_not_called()


def test_no_receipt_never_falls_back_to_user_organization():
    db = Mock()
    with pytest.raises(HTTPException):
        require_connection_receipt(db, uuid4(), "client", uuid4(), None)
    db.execute.assert_not_called()


def test_current_receipt_is_revalidated_through_named_command():
    from uuid import UUID
    supplied = receipt()
    db = Mock()
    db.execute.return_value.scalar_one.return_value = True
    result = require_connection_receipt(db, uuid4(), "client", UUID(supplied["organization_id"]), supplied)
    assert str(result.receipt_id) == supplied["receipt_id"]
    assert "erp_core_commands.mcp_connection_receipt_matches" in str(db.execute.call_args.args[0])

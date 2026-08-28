from uuid import UUID

import pytest

from sqlalchemy.exc import DBAPIError

from app.repositories.user_repository import MembershipContextDenied, UserRepository


AUTH_USER_ID = UUID("8d19f4e8-3e4b-46a8-b7d9-87f30ddaf41c")
ORG_ID = UUID("9e1b4f9e-2dcc-47f5-8dfa-938005806841")
USER_ID = UUID("9f43f231-c0ec-4be5-a116-cabae4c45eb9")
ROLE_ID = UUID("71aa0ceb-6499-4de7-932a-d3743991d23e")


class _Rows:
    def __init__(self, rows):
        self.rows = rows

    def fetchall(self):
        return self.rows


class _Database:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def execute(self, statement, parameters):
        sql = str(statement)
        self.calls.append((sql, parameters))
        if "activate_context" in sql:
            return _Rows([])
        return _Rows(self.rows)


def _row():
    return (
        USER_ID,
        AUTH_USER_ID,
        "ERP Operator",
        "ERP Operator",
        ORG_ID,
        True,
        ROLE_ID,
        [],
        False,
        "AASO Pharma",
        True,
        "Operator",
        {"sales.read": True},
        "organization",
    )


def test_identity_lookup_activates_canonical_context_and_returns_permissions():
    database = _Database([_row()])

    result = UserRepository.find_by_auth_user_id(AUTH_USER_ID, ORG_ID, database)

    assert result == {
        "user_id": USER_ID,
        "auth_user_id": AUTH_USER_ID,
        "username": "ERP Operator",
        "full_name": "ERP Operator",
        "org_id": ORG_ID,
        "is_active": True,
        "role_id": ROLE_ID,
        "branch_ids": [],
        "is_admin": False,
        "org_name": "AASO Pharma",
        "org_active": True,
        "role_name": "Operator",
        "permissions": {"sales.read": True},
        "data_access_level": "organization",
    }
    assert len(database.calls) == 2
    assert "erp_security.activate_context" in database.calls[0][0]
    assert database.calls[0][1] == {
        "auth_user_id": AUTH_USER_ID,
        "org_id": ORG_ID,
    }
    lookup_sql = database.calls[1][0]
    for relation in (
        "core.users",
        "core.memberships",
        "core.organizations",
        "core.access_grants",
        "core.roles",
        "core.role_permissions",
    ):
        assert relation in lookup_sql
    assert "master.org_users" not in lookup_sql


def test_identity_lookup_rejects_multiple_membership_rows():
    database = _Database([_row(), _row()])

    with pytest.raises(RuntimeError, match="multiple ERP memberships"):
        UserRepository.find_by_auth_user_id(AUTH_USER_ID, ORG_ID, database)


def test_identity_lookup_maps_only_exact_membership_context_denial():
    class OriginalError(Exception):
        pgcode = "42501"
        diag = type(
            "Diagnostic",
            (),
            {
                "message_primary": (
                    "invalid or inactive ERP authenticated organization membership"
                )
            },
        )()

    class DeniedDatabase:
        rolled_back = False

        def execute(self, _statement, _parameters):
            raise DBAPIError("activate context", {}, OriginalError(), False)

        def rollback(self):
            self.rolled_back = True

    database = DeniedDatabase()
    with pytest.raises(MembershipContextDenied):
        UserRepository.find_by_auth_user_id(AUTH_USER_ID, ORG_ID, database)

    assert database.rolled_back is True


def test_identity_lookup_does_not_map_an_unrelated_42501_denial():
    class OriginalError(Exception):
        pgcode = "42501"
        diag = type(
            "Diagnostic",
            (),
            {"message_primary": "permission denied for relation core.memberships"},
        )()

    original = DBAPIError("activate context", {}, OriginalError(), False)

    class DeniedDatabase:
        rolled_back = False

        def execute(self, _statement, _parameters):
            raise original

        def rollback(self):
            self.rolled_back = True

    database = DeniedDatabase()
    with pytest.raises(DBAPIError) as exc_info:
        UserRepository.find_by_auth_user_id(AUTH_USER_ID, ORG_ID, database)

    assert exc_info.value is original
    assert database.rolled_back is False

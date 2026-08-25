"""Prove Live18 denial-identity cleanup preserves terminal evidence on PostgreSQL 15.

The browser fixture is disposable, but its consent and access evidence is not.
This check exercises the production denial cleanup twice and proves that it:

* revokes rather than deletes capability, agent-grant, and access-grant rows;
* leaves no active user, membership, role, access, or automation authority;
* cannot reactivate or delete terminal evidence; and
* does not mutate an equivalent authority in another organization.

All fixture rows are transaction-local and rolled back.  The script refuses to
choose a database itself; the disposable PostgreSQL 15 gate supplies
``DATABASE_URL`` after applying the exact Alembic head.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from dataclasses import dataclass
from uuid import UUID, uuid4

import psycopg2
from psycopg2.extras import register_uuid
from sqlalchemy.engine import make_url

from scripts import provision_ephemeral_browser_identities as identities


register_uuid()


@dataclass(frozen=True)
class TenantFixture:
    org_id: UUID
    creator_auth_user_id: UUID
    creator_user_id: UUID
    creator_membership_id: UUID
    subject_auth_user_id: UUID
    subject_user_id: UUID
    subject_membership_id: UUID
    role_id: UUID
    access_grant_id: UUID
    agent_grant_id: UUID
    role_code: str


def _fixture(label: str) -> TenantFixture:
    suffix = uuid4().hex[:20]
    return TenantFixture(
        org_id=uuid4(),
        creator_auth_user_id=uuid4(),
        creator_user_id=uuid4(),
        creator_membership_id=uuid4(),
        subject_auth_user_id=uuid4(),
        subject_user_id=uuid4(),
        subject_membership_id=uuid4(),
        role_id=uuid4(),
        access_grant_id=uuid4(),
        agent_grant_id=uuid4(),
        role_code=f"live18_denial_{label}_{suffix}",
    )


def _connect():
    url = make_url(os.environ["DATABASE_URL"])
    return psycopg2.connect(
        host=url.host,
        port=url.port or 5432,
        dbname=url.database,
        user=url.username,
        password=url.password or "",
    )


def _set_context(cursor, fixture: TenantFixture) -> None:
    for name, value in (
        ("app.org_id", fixture.org_id),
        ("app.auth_user_id", fixture.creator_auth_user_id),
        ("app.user_id", fixture.creator_user_id),
        ("app.membership_id", fixture.creator_membership_id),
        ("app.request_id", uuid4()),
    ):
        cursor.execute("SELECT set_config(%s,%s,true)", (name, str(value)))


def _set_bootstrap_context(cursor, fixture: TenantFixture) -> None:
    """Match the production bootstrap's actor-free circular identity insert."""

    for name, value in (
        ("app.org_id", fixture.org_id),
        ("app.request_id", uuid4()),
    ):
        cursor.execute("SELECT set_config(%s,%s,true)", (name, str(value)))
    for name in ("app.auth_user_id", "app.user_id", "app.membership_id"):
        cursor.execute("SELECT set_config(%s,'',true)", (name,))


def _seed_tenant(cursor, fixture: TenantFixture) -> None:
    cursor.execute("RESET ROLE")
    cursor.execute(
        "INSERT INTO auth.users(id) VALUES (%s),(%s)",
        (fixture.creator_auth_user_id, fixture.subject_auth_user_id),
    )
    cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
    _set_bootstrap_context(cursor, fixture)
    cursor.execute(
        """
        INSERT INTO core.organizations(
          id,legal_name,trade_name,registered_address_line1,registered_city,
          registered_state_code,registered_postal_code,status,
          created_by_membership_id,updated_by_membership_id)
        VALUES (%s,%s,%s,'1 Transaction Test Road','Mumbai','27','400001',
                'active',%s,%s)
        """,
        (
            fixture.org_id,
            f"Live18 terminal cleanup {fixture.role_code}",
            fixture.role_code,
            fixture.creator_membership_id,
            fixture.creator_membership_id,
        ),
    )
    cursor.executemany(
        """
        INSERT INTO core.users(id,auth_user_id,display_name,status)
        VALUES (%s,%s,%s,'active')
        """,
        (
            (
                fixture.creator_user_id,
                fixture.creator_auth_user_id,
                "Live18 cleanup administrator",
            ),
            (
                fixture.subject_user_id,
                fixture.subject_auth_user_id,
                "Live18 disposable denial observer",
            ),
        ),
    )
    cursor.execute(
        """
        INSERT INTO core.memberships(
          org_id,id,user_id,status,joined_at,
          created_by_membership_id,updated_by_membership_id)
        VALUES (%s,%s,%s,'active',transaction_timestamp(),%s,%s)
        """,
        (
            fixture.org_id,
            fixture.creator_membership_id,
            fixture.creator_user_id,
            fixture.creator_membership_id,
            fixture.creator_membership_id,
        ),
    )
    _set_context(cursor, fixture)
    cursor.execute(
        """
        INSERT INTO core.memberships(
          org_id,id,user_id,status,joined_at,
          created_by_membership_id,updated_by_membership_id)
        VALUES (%s,%s,%s,'active',transaction_timestamp(),%s,%s)
        """,
        (
            fixture.org_id,
            fixture.subject_membership_id,
            fixture.subject_user_id,
            fixture.creator_membership_id,
            fixture.creator_membership_id,
        ),
    )
    cursor.execute(
        """
        INSERT INTO core.roles(
          org_id,id,code,name,description,is_system,status,
          created_by_membership_id,updated_by_membership_id)
        VALUES (%s,%s,%s,'Live18 denial observer','PostgreSQL lifecycle proof',
                false,'active',%s,%s)
        """,
        (
            fixture.org_id,
            fixture.role_id,
            fixture.role_code,
            fixture.creator_membership_id,
            fixture.creator_membership_id,
        ),
    )
    cursor.execute(
        """
        INSERT INTO core.role_permissions(
          org_id,role_id,permission_code,created_by_membership_id)
        VALUES (%s,%s,'automation.command.view',%s)
        """,
        (fixture.org_id, fixture.role_id, fixture.creator_membership_id),
    )
    cursor.execute(
        """
        INSERT INTO core.access_grants(
          org_id,id,membership_id,role_id,scope_kind,valid_from_at,expires_at,
          status,created_by_membership_id)
        VALUES (%s,%s,%s,%s,'organization',transaction_timestamp(),
                transaction_timestamp()+interval '2 hours','active',%s)
        """,
        (
            fixture.org_id,
            fixture.access_grant_id,
            fixture.subject_membership_id,
            fixture.role_id,
            fixture.creator_membership_id,
        ),
    )
    cursor.execute(
        """
        INSERT INTO automation.agent_grants(
          org_id,id,subject_membership_id,client_id,client_display_name,
          authorization_mode,consent_version,consent_text_hash,
          consented_by_membership_id,consented_at,granted_by_membership_id,
          granted_at,expires_at,status,created_by_membership_id,
          updated_by_membership_id)
        VALUES (%s,%s,%s,%s,'Live18 disposable denial observer','self_consent',
                'live18-denial-v1',extensions.digest(%s,'sha256'),%s,
                transaction_timestamp(),%s,transaction_timestamp(),
                transaction_timestamp()+interval '2 hours','active',%s,%s)
        """,
        (
            fixture.org_id,
            fixture.agent_grant_id,
            fixture.subject_membership_id,
            identities.WEB_CLIENT_ID,
            f"terminal-cleanup:{fixture.role_code}",
            fixture.subject_membership_id,
            fixture.creator_membership_id,
            fixture.creator_membership_id,
            fixture.creator_membership_id,
        ),
    )
    cursor.execute(
        """
        INSERT INTO automation.agent_grant_capabilities(
          org_id,agent_grant_id,capability_code,operation_mode,risk_class,
          approval_policy,allow_sensitive_read,status,created_by_membership_id)
        VALUES (%s,%s,'automation.command.status.get','read','read_only',
                'none',false,'active',%s)
        """,
        (
            fixture.org_id,
            fixture.agent_grant_id,
            fixture.creator_membership_id,
        ),
    )


def _authority_snapshot(cursor, fixture: TenantFixture) -> tuple[tuple, ...]:
    cursor.execute(
        """
        SELECT 'user',id::text,status,auth_user_id::text,row_version::text,NULL,NULL
          FROM core.users WHERE id=%s
        UNION ALL
        SELECT 'membership',id::text,status,NULL,row_version::text,
               revoked_at::text,revocation_reason
          FROM core.memberships WHERE org_id=%s AND id=%s
        UNION ALL
        SELECT 'role',id::text,status,NULL,row_version::text,NULL,NULL
          FROM core.roles WHERE org_id=%s AND id=%s
        UNION ALL
        SELECT 'access',id::text,status,NULL,row_version::text,
               revoked_at::text,revocation_reason
          FROM core.access_grants WHERE org_id=%s AND id=%s
        UNION ALL
        SELECT 'agent',id::text,status,NULL,row_version::text,
               revoked_at::text,revocation_reason
          FROM automation.agent_grants WHERE org_id=%s AND id=%s
        UNION ALL
        SELECT 'capability',agent_grant_id::text,status,NULL,NULL,
               revoked_at::text,NULL
          FROM automation.agent_grant_capabilities
         WHERE org_id=%s AND agent_grant_id=%s
        ORDER BY 1
        """,
        (
            fixture.subject_user_id,
            fixture.org_id,
            fixture.subject_membership_id,
            fixture.org_id,
            fixture.role_id,
            fixture.org_id,
            fixture.access_grant_id,
            fixture.org_id,
            fixture.agent_grant_id,
            fixture.org_id,
            fixture.agent_grant_id,
        ),
    )
    return tuple(cursor.fetchall())


def _active_authority_count(cursor, fixture: TenantFixture) -> int:
    cursor.execute(
        """
        SELECT
          (SELECT count(*) FROM core.users
            WHERE id=%s AND status='active')+
          (SELECT count(*) FROM core.memberships
            WHERE org_id=%s AND id=%s AND status='active')+
          (SELECT count(*) FROM core.roles
            WHERE org_id=%s AND id=%s AND status='active')+
          (SELECT count(*) FROM core.access_grants
            WHERE org_id=%s AND id=%s AND status='active')+
          (SELECT count(*) FROM automation.agent_grants
            WHERE org_id=%s AND id=%s AND status='active'
              AND expires_at>transaction_timestamp())+
          (SELECT count(*) FROM automation.agent_grant_capabilities
            WHERE org_id=%s AND agent_grant_id=%s AND status='active')
        """,
        (
            fixture.subject_user_id,
            fixture.org_id,
            fixture.subject_membership_id,
            fixture.org_id,
            fixture.role_id,
            fixture.org_id,
            fixture.access_grant_id,
            fixture.org_id,
            fixture.agent_grant_id,
            fixture.org_id,
            fixture.agent_grant_id,
        ),
    )
    return int(cursor.fetchone()[0])


@contextmanager
def _patched_denial_constants(fixture: TenantFixture):
    names = {
        "DENIAL_ORG_ID": str(fixture.org_id),
        "DENIAL_CREATOR_MEMBERSHIP_ID": str(fixture.creator_membership_id),
        "DEMO_OPERATOR_AUTH_USER_ID": str(fixture.creator_auth_user_id),
        "DEMO_OPERATOR_USER_ID": str(fixture.creator_user_id),
    }
    original = {name: getattr(identities, name) for name in names}
    try:
        for name, value in names.items():
            setattr(identities, name, value)
        yield
    finally:
        for name, value in original.items():
            setattr(identities, name, value)


def _cleanup_state(fixture: TenantFixture) -> dict:
    return {
        "denial_database_provisioned": True,
        "denial_identity": {
            "auth_user_id": str(fixture.subject_auth_user_id),
            "user_id": str(fixture.subject_user_id),
            "membership_id": str(fixture.subject_membership_id),
            "role_id": str(fixture.role_id),
            "access_grant_id": str(fixture.access_grant_id),
            "agent_grant_id": str(fixture.agent_grant_id),
        },
    }


def _expect_check_violation(cursor, statement: str, parameters: tuple) -> None:
    cursor.execute("SAVEPOINT expected_terminal_rejection")
    try:
        cursor.execute(statement, parameters)
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
    except psycopg2.Error as exc:
        assert exc.pgcode == "23514", exc
        cursor.execute("ROLLBACK TO SAVEPOINT expected_terminal_rejection")
    else:
        raise AssertionError("terminal authority mutation unexpectedly succeeded")
    finally:
        cursor.execute("RELEASE SAVEPOINT expected_terminal_rejection")
        cursor.execute("SET CONSTRAINTS ALL DEFERRED")


def main() -> None:
    target = _fixture("target")
    other_tenant = _fixture("control")
    connection = _connect()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")
            _seed_tenant(cursor, target)
            _seed_tenant(cursor, other_tenant)
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")

            assert _active_authority_count(cursor, target) == 6
            assert _active_authority_count(cursor, other_tenant) == 6
            other_before = _authority_snapshot(cursor, other_tenant)

            state = _cleanup_state(target)
            with _patched_denial_constants(target):
                identities._cleanup_live18_denial_database(cursor, state)
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")

            terminal_snapshot = _authority_snapshot(cursor, target)
            assert len(terminal_snapshot) == 6
            assert _active_authority_count(cursor, target) == 0
            assert _active_authority_count(cursor, other_tenant) == 6
            assert _authority_snapshot(cursor, other_tenant) == other_before

            terminal_by_kind = {row[0]: row for row in terminal_snapshot}
            assert terminal_by_kind["user"][2:4] == ("disabled", None)
            assert terminal_by_kind["membership"][2] == "revoked"
            assert terminal_by_kind["role"][2] == "disabled"
            assert terminal_by_kind["access"][2] == "revoked"
            assert terminal_by_kind["agent"][2] == "revoked"
            assert terminal_by_kind["capability"][2] == "revoked"
            for kind in ("membership", "access", "agent"):
                assert terminal_by_kind[kind][5] is not None
                assert terminal_by_kind[kind][6] == (
                    "Live18 disposable identity cleanup"
                )
            assert terminal_by_kind["capability"][5] is not None

            # The crash-recovery retry must be a true no-op over terminal rows.
            with _patched_denial_constants(target):
                identities._cleanup_live18_denial_database(cursor, state)
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")
            assert _authority_snapshot(cursor, target) == terminal_snapshot
            assert _active_authority_count(cursor, target) == 0
            assert _authority_snapshot(cursor, other_tenant) == other_before

            _expect_check_violation(
                cursor,
                "DELETE FROM automation.agent_grant_capabilities "
                "WHERE org_id=%s AND agent_grant_id=%s",
                (target.org_id, target.agent_grant_id),
            )
            _expect_check_violation(
                cursor,
                "UPDATE automation.agent_grant_capabilities SET status='active',"
                "revoked_at=NULL,revoked_by_membership_id=NULL "
                "WHERE org_id=%s AND agent_grant_id=%s",
                (target.org_id, target.agent_grant_id),
            )
            _expect_check_violation(
                cursor,
                "UPDATE automation.agent_grants SET status='active',revoked_at=NULL,"
                "revoked_by_membership_id=NULL,revocation_reason=NULL,"
                "updated_at=transaction_timestamp(),row_version=row_version+1 "
                "WHERE org_id=%s AND id=%s",
                (target.org_id, target.agent_grant_id),
            )
            _expect_check_violation(
                cursor,
                "UPDATE core.access_grants SET status='active',revoked_at=NULL,"
                "revoked_by_membership_id=NULL,revocation_reason=NULL,"
                "row_version=row_version+1 WHERE org_id=%s AND id=%s",
                (target.org_id, target.access_grant_id),
            )
            assert _authority_snapshot(cursor, target) == terminal_snapshot
            assert _authority_snapshot(cursor, other_tenant) == other_before
            print(
                "Live18 terminal identity cleanup PostgreSQL 15 acceptance passed"
            )
    finally:
        connection.rollback()
        connection.close()


if __name__ == "__main__":
    main()

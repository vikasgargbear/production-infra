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
from scripts import provision_ephemeral_canonical_live as mcp_identities


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


def _authority_in_tenant(owner: TenantFixture, label: str) -> TenantFixture:
    """Create fresh run-scoped authority IDs under an existing tenant owner."""

    suffix = uuid4().hex[:20]
    return TenantFixture(
        org_id=owner.org_id,
        creator_auth_user_id=owner.creator_auth_user_id,
        creator_user_id=owner.creator_user_id,
        creator_membership_id=owner.creator_membership_id,
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


def _assert_mcp_audit_context_reaches_the_real_trigger(
    cursor, fixture: TenantFixture
) -> None:
    """Prove the production MCP context survives deferred-trigger evaluation."""

    original = (
        mcp_identities.DEMO_ORG_ID,
        mcp_identities.DEMO_REVIEWER_AUTH_USER_ID,
        mcp_identities.DEMO_REVIEWER_USER_ID,
        mcp_identities.DEMO_REVIEWER_MEMBERSHIP_ID,
    )
    cursor.execute("SAVEPOINT mcp_audit_context")
    try:
        mcp_identities.DEMO_ORG_ID = str(fixture.org_id)
        mcp_identities.DEMO_REVIEWER_AUTH_USER_ID = str(
            fixture.creator_auth_user_id
        )
        mcp_identities.DEMO_REVIEWER_USER_ID = str(fixture.creator_user_id)
        mcp_identities.DEMO_REVIEWER_MEMBERSHIP_ID = str(
            fixture.creator_membership_id
        )
        cursor.execute("SET CONSTRAINTS ALL DEFERRED")
        request_id = str(uuid4())
        mcp_identities._set_mcp_audit_context(cursor, request_id)
        cursor.execute(
            """
            UPDATE automation.agent_grants
               SET status='suspended',suspended_at=transaction_timestamp(),
                   updated_at=transaction_timestamp(),row_version=row_version+1
             WHERE org_id=%s AND id=%s AND status='active'
            """,
            (fixture.org_id, fixture.agent_grant_id),
        )
        assert cursor.rowcount == 1
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
        cursor.execute(
            """
            SELECT event.actor_membership_id,event.request_id,event.event_type
              FROM core.audit_events AS event
             WHERE event.org_id=%s AND event.request_id=%s
               AND event.event_type='automation.agent_grants.update'
            """,
            (fixture.org_id, request_id),
        )
        assert cursor.fetchall() == [
            (
                fixture.creator_membership_id,
                UUID(request_id),
                "automation.agent_grants.update",
            )
        ]
    finally:
        (
            mcp_identities.DEMO_ORG_ID,
            mcp_identities.DEMO_REVIEWER_AUTH_USER_ID,
            mcp_identities.DEMO_REVIEWER_USER_ID,
            mcp_identities.DEMO_REVIEWER_MEMBERSHIP_ID,
        ) = original
        cursor.execute("ROLLBACK TO SAVEPOINT mcp_audit_context")
        cursor.execute("RELEASE SAVEPOINT mcp_audit_context")
        cursor.execute("SET CONSTRAINTS ALL DEFERRED")


def _seed_tenant(cursor, fixture: TenantFixture) -> None:
    cursor.execute("RESET ROLE")
    cursor.execute(
        "INSERT INTO auth.users(id) VALUES (%s)",
        (fixture.creator_auth_user_id,),
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
    cursor.execute(
        "INSERT INTO core.users(id,auth_user_id,display_name,status) "
        "VALUES (%s,%s,'Live18 cleanup administrator','active')",
        (fixture.creator_user_id, fixture.creator_auth_user_id),
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
    _seed_authority(cursor, fixture)


def _seed_authority(
    cursor, fixture: TenantFixture, *, agent_status: str = "active"
) -> None:
    """Provision another disposable run under an already seeded organization."""

    if agent_status not in {"active", "pending_consent"}:
        raise ValueError("fixture agent status must be active or pending_consent")

    cursor.execute("RESET ROLE")
    cursor.execute(
        "INSERT INTO auth.users(id) VALUES (%s)",
        (fixture.subject_auth_user_id,),
    )
    cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
    _set_context(cursor, fixture)
    cursor.execute(
        "INSERT INTO core.users(id,auth_user_id,display_name,status) "
        "VALUES (%s,%s,'Live18 replacement denial observer','active')",
        (fixture.subject_user_id, fixture.subject_auth_user_id),
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
        VALUES (%s,%s,%s,'Live18 replacement observer',
                'PostgreSQL reprovision proof',false,'active',%s,%s)
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
        "INSERT INTO core.role_permissions(org_id,role_id,permission_code,"
        "created_by_membership_id) VALUES "
        "(%s,%s,'automation.command.view',%s)",
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
    if agent_status == "pending_consent":
        cursor.execute(
            """
            INSERT INTO automation.agent_grants(
              org_id,id,subject_membership_id,client_id,client_display_name,
              authorization_mode,consent_version,consent_text_hash,expires_at,
              status,created_by_membership_id,updated_by_membership_id)
            VALUES (%s,%s,%s,%s,'Live18 pending denial observer','self_consent',
                    'live18-denial-v1',extensions.digest(%s,'sha256'),
                    transaction_timestamp()+interval '2 hours',
                    'pending_consent',%s,%s)
            """,
            (
                fixture.org_id,
                fixture.agent_grant_id,
                fixture.subject_membership_id,
                identities.WEB_CLIENT_ID,
                f"terminal-reprovision:{fixture.role_code}",
                fixture.creator_membership_id,
                fixture.creator_membership_id,
            ),
        )
    else:
        cursor.execute(
            """
            INSERT INTO automation.agent_grants(
              org_id,id,subject_membership_id,client_id,client_display_name,
              authorization_mode,consent_version,consent_text_hash,
              consented_by_membership_id,consented_at,granted_by_membership_id,
              granted_at,expires_at,status,created_by_membership_id,
              updated_by_membership_id)
            VALUES (%s,%s,%s,%s,'Live18 replacement denial observer','self_consent',
                    'live18-denial-v1',extensions.digest(%s,'sha256'),%s,
                    transaction_timestamp(),%s,transaction_timestamp(),
                    transaction_timestamp()+interval '2 hours','active',%s,%s)
            """,
            (
                fixture.org_id,
                fixture.agent_grant_id,
                fixture.subject_membership_id,
                identities.WEB_CLIENT_ID,
                f"terminal-reprovision:{fixture.role_code}",
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


def _seed_disconnected_identity(cursor, fixture: TenantFixture) -> None:
    """Create the partial residue that a clean reconciliation must reject."""

    cursor.execute("RESET ROLE")
    cursor.execute(
        "INSERT INTO auth.users(id) VALUES (%s)",
        (fixture.subject_auth_user_id,),
    )
    cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
    _set_context(cursor, fixture)
    cursor.execute(
        "INSERT INTO core.users(id,auth_user_id,display_name,status) "
        "VALUES (%s,%s,'Disconnected Live18 residue','active')",
        (fixture.subject_user_id, fixture.subject_auth_user_id),
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
            fixture.subject_membership_id,
            fixture.subject_user_id,
            fixture.creator_membership_id,
            fixture.creator_membership_id,
        ),
    )


def _mark_authority_expired(cursor, fixture: TenantFixture) -> tuple[tuple, tuple]:
    """Model authority whose validity elapsed before crash recovery began.

    Transaction timestamps do not advance within this rollback-only fixture,
    so the setup shifts the validity windows under narrowly disabled lifecycle
    triggers. The production cleanup runs with every trigger enabled.
    """

    cursor.execute(
        "ALTER TABLE automation.agent_grants "
        "DISABLE TRIGGER agent_grants_state_guard_ct"
    )
    cursor.execute(
        "ALTER TABLE core.access_grants "
        "DISABLE TRIGGER access_grants_lifecycle_guard"
    )
    try:
        cursor.execute(
            """
            UPDATE automation.agent_grants
               SET status='expired',created_at=transaction_timestamp()-interval '2 hours',
                   expires_at=transaction_timestamp()-interval '1 hour',
                   updated_at=transaction_timestamp(),row_version=row_version+1
             WHERE org_id=%s AND id=%s
            """,
            (fixture.org_id, fixture.agent_grant_id),
        )
        cursor.execute(
            """
            UPDATE core.access_grants
               SET status='expired',valid_from_at=transaction_timestamp()-interval '2 hours',
                   expires_at=transaction_timestamp()-interval '1 hour',
                   row_version=row_version+1
             WHERE org_id=%s AND id=%s
            """,
            (fixture.org_id, fixture.access_grant_id),
        )
    finally:
        cursor.execute(
            "ALTER TABLE automation.agent_grants "
            "ENABLE TRIGGER agent_grants_state_guard_ct"
        )
        cursor.execute(
            "ALTER TABLE core.access_grants "
            "ENABLE TRIGGER access_grants_lifecycle_guard"
        )
    cursor.execute(
        "SELECT status,row_version,created_at,expires_at FROM automation.agent_grants "
        "WHERE org_id=%s AND id=%s",
        (fixture.org_id, fixture.agent_grant_id),
    )
    grant = cursor.fetchone()
    cursor.execute(
        "SELECT status,row_version,valid_from_at,expires_at FROM core.access_grants "
        "WHERE org_id=%s AND id=%s",
        (fixture.org_id, fixture.access_grant_id),
    )
    access = cursor.fetchone()
    assert grant[0] == access[0] == "expired"
    return grant, access


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


def _role_permission_snapshot(cursor, fixture: TenantFixture) -> tuple[tuple, ...]:
    cursor.execute(
        """
        SELECT permission_code,created_by_membership_id::text,created_at::text
          FROM core.role_permissions
         WHERE org_id=%s AND role_id=%s
         ORDER BY permission_code
        """,
        (fixture.org_id, fixture.role_id),
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


def _effective_authority_count(cursor, fixture: TenantFixture) -> int:
    cursor.execute(
        """
        SELECT count(*)
          FROM core.users AS user_row
          JOIN core.memberships AS membership ON membership.user_id=user_row.id
          JOIN core.access_grants AS access_grant
            ON access_grant.org_id=membership.org_id
           AND access_grant.membership_id=membership.id
          JOIN core.roles AS role ON role.org_id=access_grant.org_id
                                 AND role.id=access_grant.role_id
          JOIN automation.agent_grants AS grant_row
            ON grant_row.org_id=membership.org_id
           AND grant_row.subject_membership_id=membership.id
          JOIN automation.agent_grant_capabilities AS capability
            ON capability.org_id=grant_row.org_id
           AND capability.agent_grant_id=grant_row.id
         WHERE membership.org_id=%s AND user_row.id=%s
           AND user_row.status='active' AND user_row.auth_user_id IS NOT NULL
           AND membership.status='active' AND role.status='active'
           AND access_grant.status='active' AND grant_row.status='active'
           AND capability.status='active'
        """,
        (fixture.org_id, fixture.subject_user_id),
    )
    return int(cursor.fetchone()[0])


@contextmanager
def _patched_denial_constants(
    fixture: TenantFixture, demo: TenantFixture
):
    names = {
        "DEMO_ORG_ID": str(demo.org_id),
        "DENIAL_ORG_ID": str(fixture.org_id),
        "DENIAL_CREATOR_MEMBERSHIP_ID": str(fixture.creator_membership_id),
        "DEMO_OPERATOR_AUTH_USER_ID": str(demo.subject_auth_user_id),
        "DEMO_OPERATOR_USER_ID": str(demo.subject_user_id),
        "DEMO_OPERATOR_MEMBERSHIP_ID": str(demo.subject_membership_id),
        "DEMO_REVIEWER_AUTH_USER_ID": str(demo.creator_auth_user_id),
        "DEMO_REVIEWER_USER_ID": str(demo.creator_user_id),
        "DEMO_REVIEWER_MEMBERSHIP_ID": str(demo.creator_membership_id),
        # The denial fixture itself carries a web-client grant. Recovery's
        # demo-side browser boundary must use its own empty client namespace.
        "WEB_CLIENT_ID": f"live18-terminal-{demo.org_id}",
    }
    original = {name: getattr(identities, name) for name in names}
    try:
        for name, value in names.items():
            setattr(identities, name, value)
        yield
    finally:
        for name, value in original.items():
            setattr(identities, name, value)


@contextmanager
def _patched_recovery_connection(connection):
    """Let production recovery borrow this rollback-only fixture transaction."""

    class BorrowedConnection:
        def __enter__(self):
            return connection

        def __exit__(self, exc_type, exc, traceback):
            return False

    original = identities._database_connection
    identities._database_connection = lambda _management_token: BorrowedConnection()
    try:
        yield
    finally:
        identities._database_connection = original


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


def _expect_database_error(
    cursor, statement: str, parameters: tuple, expected_codes: set[str]
) -> None:
    cursor.execute("SAVEPOINT expected_terminal_rejection")
    try:
        cursor.execute(statement, parameters)
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
    except psycopg2.Error as exc:
        assert exc.pgcode in expected_codes, exc
        cursor.execute("ROLLBACK TO SAVEPOINT expected_terminal_rejection")
    else:
        raise AssertionError("terminal authority mutation unexpectedly succeeded")
    finally:
        cursor.execute("RELEASE SAVEPOINT expected_terminal_rejection")
        cursor.execute("SET CONSTRAINTS ALL DEFERRED")


def _expect_check_violation(cursor, statement: str, parameters: tuple) -> None:
    _expect_database_error(cursor, statement, parameters, {"23514"})


def _expect_ephemeral_identity_error(cursor, action) -> None:
    cursor.execute("SAVEPOINT expected_ephemeral_identity_error")
    try:
        action()
    except identities.EphemeralIdentityError:
        cursor.execute("ROLLBACK TO SAVEPOINT expected_ephemeral_identity_error")
    else:
        raise AssertionError("unsafe identity cleanup unexpectedly succeeded")
    finally:
        cursor.execute("RELEASE SAVEPOINT expected_ephemeral_identity_error")
        cursor.execute("SET CONSTRAINTS ALL DEFERRED")


def _terminal_history_counts(cursor, fixture: TenantFixture) -> tuple[int, int, int]:
    cursor.execute(
        """
        SELECT
          (SELECT count(*) FROM automation.agent_grants
            WHERE org_id=%s AND consent_version='live18-denial-v1'
              AND status IN ('revoked','expired')),
          (SELECT count(*)
             FROM automation.agent_grant_capabilities AS capability
             JOIN automation.agent_grants AS grant_row
               ON grant_row.org_id=capability.org_id
              AND grant_row.id=capability.agent_grant_id
            WHERE grant_row.org_id=%s
              AND grant_row.consent_version='live18-denial-v1'
              AND capability.status='revoked'),
          (SELECT count(*)
             FROM core.access_grants AS access_grant
             JOIN core.roles AS role ON role.org_id=access_grant.org_id
                                    AND role.id=access_grant.role_id
            WHERE access_grant.org_id=%s
              AND role.code LIKE 'live18_denial_%%'
              AND access_grant.status IN ('revoked','expired'))
        """,
        (fixture.org_id, fixture.org_id, fixture.org_id),
    )
    return tuple(int(value) for value in cursor.fetchone())


def main() -> None:
    target = _fixture("target")
    other_tenant = _fixture("control")
    unrelated_tenant = _fixture("unrelated")
    connection = _connect()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")
            _seed_tenant(cursor, target)
            _seed_tenant(cursor, other_tenant)
            _seed_tenant(cursor, unrelated_tenant)
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")

            _assert_mcp_audit_context_reaches_the_real_trigger(cursor, target)

            assert _active_authority_count(cursor, target) == 6
            assert _active_authority_count(cursor, other_tenant) == 6
            assert _active_authority_count(cursor, unrelated_tenant) == 6
            other_before = _authority_snapshot(cursor, other_tenant)
            unrelated_before = _authority_snapshot(cursor, unrelated_tenant)

            # A stale Auth UUID is not sufficient evidence. Even an exact
            # user/Auth pair from another tenant must remain untouched unless
            # the denial-org grant and role lineage also reconcile.
            with _patched_denial_constants(target, other_tenant):
                _expect_ephemeral_identity_error(
                    cursor,
                    lambda: identities._terminalize_live18_denial_authority(
                        cursor,
                        [
                            (
                                str(unrelated_tenant.subject_user_id),
                                str(unrelated_tenant.subject_auth_user_id),
                            )
                        ],
                    ),
                )
            assert _authority_snapshot(cursor, unrelated_tenant) == unrelated_before

            state = _cleanup_state(target)
            target_permissions = _role_permission_snapshot(cursor, target)
            with _patched_denial_constants(target, other_tenant):
                identities._cleanup_live18_denial_database(cursor, state)
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")

            terminal_snapshot = _authority_snapshot(cursor, target)
            assert len(terminal_snapshot) == 6
            assert _active_authority_count(cursor, target) == 0
            assert _active_authority_count(cursor, other_tenant) == 6
            assert _authority_snapshot(cursor, other_tenant) == other_before
            assert _authority_snapshot(cursor, unrelated_tenant) == unrelated_before
            assert _role_permission_snapshot(cursor, target) == target_permissions

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
            with _patched_denial_constants(target, other_tenant):
                identities._cleanup_live18_denial_database(cursor, state)
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")
            assert _authority_snapshot(cursor, target) == terminal_snapshot
            assert _active_authority_count(cursor, target) == 0
            assert _authority_snapshot(cursor, other_tenant) == other_before
            assert _terminal_history_counts(cursor, target) == (1, 1, 1)

            # Simulate lost runner state: a fresh identity survives until the
            # purpose-discovery recovery path terminalizes its database rows.
            recovered = _authority_in_tenant(target, "recovered")
            _seed_authority(cursor, recovered)
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")
            assert _active_authority_count(cursor, recovered) == 6
            recovered_permissions = _role_permission_snapshot(cursor, recovered)
            cursor.execute("RESET ROLE")
            with (
                _patched_denial_constants(target, other_tenant),
                _patched_recovery_connection(connection),
            ):
                identities._recover_stale_live18_database(
                    "rollback-only-pg15-fixture",
                    {str(recovered.subject_auth_user_id)},
                )
            recovered_terminal = _authority_snapshot(cursor, recovered)
            assert _active_authority_count(cursor, recovered) == 0
            assert _terminal_history_counts(cursor, target) == (2, 2, 2)
            assert _authority_snapshot(cursor, target) == terminal_snapshot
            assert _authority_snapshot(cursor, other_tenant) == other_before
            assert _role_permission_snapshot(cursor, recovered) == recovered_permissions

            # A later run can provision fresh IDs in the same denial tenant;
            # cleanup grows immutable history without reviving prior consent.
            replacement = _authority_in_tenant(target, "replacement")
            _seed_authority(cursor, replacement)
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")
            assert _active_authority_count(cursor, replacement) == 6
            replacement_permissions = _role_permission_snapshot(cursor, replacement)
            with _patched_denial_constants(target, other_tenant):
                identities._cleanup_live18_denial_database(
                    cursor, _cleanup_state(replacement)
                )
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")
            assert _active_authority_count(cursor, replacement) == 0
            assert _terminal_history_counts(cursor, target) == (3, 3, 3)
            assert _authority_snapshot(cursor, target) == terminal_snapshot
            assert _authority_snapshot(cursor, recovered) == recovered_terminal
            assert _authority_snapshot(cursor, other_tenant) == other_before
            assert _role_permission_snapshot(cursor, target) == target_permissions
            assert _role_permission_snapshot(cursor, recovered) == recovered_permissions
            assert _role_permission_snapshot(cursor, replacement) == (
                replacement_permissions
            )

            # The production provisioner never leaves pending consent behind.
            # A canonical pending grant has no capability, so cleanup must fail
            # closed and preserve its Auth discovery anchor for investigation.
            cursor.execute("SAVEPOINT pending_fixture")
            pending = _authority_in_tenant(target, "pending")
            _seed_authority(cursor, pending, agent_status="pending_consent")
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")
            pending_before = _authority_snapshot(cursor, pending)
            with _patched_denial_constants(target, other_tenant):
                pending_residue = identities._live18_denial_residue_counts(cursor)
                _expect_ephemeral_identity_error(
                    cursor,
                    lambda: identities._cleanup_live18_denial_database(
                        cursor, _cleanup_state(pending)
                    ),
                )
                pending_residue_after = identities._live18_denial_residue_counts(
                    cursor
                )
            assert pending_residue == pending_residue_after == (1, 3, 1)
            assert _authority_snapshot(cursor, pending) == pending_before
            assert _terminal_history_counts(cursor, target) == (3, 3, 3)
            cursor.execute("ROLLBACK TO SAVEPOINT pending_fixture")
            cursor.execute("RELEASE SAVEPOINT pending_fixture")
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")

            # Cleanup must accept authority that expired before recovery. It
            # may revoke the still-active capability and identity surfaces,
            # but must not rewrite terminal grant/access evidence.
            expired = _authority_in_tenant(target, "expired")
            _seed_authority(cursor, expired)
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
            expired_grant_before, expired_access_before = (
                _mark_authority_expired(cursor, expired)
            )
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")
            with _patched_denial_constants(target, other_tenant):
                identities._cleanup_live18_denial_database(
                    cursor, _cleanup_state(expired)
                )
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")
            cursor.execute(
                "SELECT status,row_version,created_at,expires_at "
                "FROM automation.agent_grants WHERE org_id=%s AND id=%s",
                (expired.org_id, expired.agent_grant_id),
            )
            assert cursor.fetchone() == expired_grant_before
            cursor.execute(
                "SELECT status,row_version,valid_from_at,expires_at "
                "FROM core.access_grants WHERE org_id=%s AND id=%s",
                (expired.org_id, expired.access_grant_id),
            )
            assert cursor.fetchone() == expired_access_before
            expired_terminal = {
                row[0]: row for row in _authority_snapshot(cursor, expired)
            }
            assert expired_terminal["agent"][2] == "expired"
            assert expired_terminal["access"][2] == "expired"
            assert expired_terminal["capability"][2] == "revoked"
            assert expired_terminal["membership"][2] == "revoked"
            assert _terminal_history_counts(cursor, target) == (4, 4, 4)

            disconnected = _authority_in_tenant(target, "disconnected")
            _seed_disconnected_identity(cursor, disconnected)
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")
            disconnected_before = _authority_snapshot(cursor, disconnected)
            with _patched_denial_constants(target, other_tenant):
                residue = identities._live18_denial_residue_counts(cursor)
            assert residue == (0, 1, 1)

            # Purpose discovery must not invent missing immutable lineage.
            # Recovery leaves the partial residue visible, so reconciliation
            # remains truthfully non-clean instead of reporting success.
            cursor.execute("RESET ROLE")
            with (
                _patched_denial_constants(target, other_tenant),
                _patched_recovery_connection(connection),
            ):
                _expect_ephemeral_identity_error(
                    cursor,
                    lambda: identities._recover_stale_live18_database(
                        "rollback-only-pg15-fixture",
                        {str(disconnected.subject_auth_user_id)},
                    ),
                )
                residue_after_recovery = (
                    identities._live18_denial_residue_counts(cursor)
                )
            assert residue_after_recovery == (0, 1, 1)
            assert _authority_snapshot(cursor, disconnected) == disconnected_before
            assert _authority_snapshot(cursor, unrelated_tenant) == unrelated_before

            # A bound core.user without any tenant membership is also not safe
            # to delete from Auth; recovery must fail before external deletion.
            unclassified_auth_user_id = uuid4()
            unclassified_user_id = uuid4()
            cursor.execute("RESET ROLE")
            cursor.execute(
                "INSERT INTO auth.users(id) VALUES (%s)",
                (unclassified_auth_user_id,),
            )
            cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
            _set_context(cursor, target)
            cursor.execute(
                "INSERT INTO core.users(id,auth_user_id,display_name,status) "
                "VALUES (%s,%s,'Unclassified Live18 binding','active')",
                (unclassified_user_id, unclassified_auth_user_id),
            )
            cursor.execute("RESET ROLE")
            with (
                _patched_denial_constants(target, other_tenant),
                _patched_recovery_connection(connection),
            ):
                _expect_ephemeral_identity_error(
                    cursor,
                    lambda: identities._recover_stale_live18_database(
                        "rollback-only-pg15-fixture",
                        {str(unclassified_auth_user_id)},
                    ),
                )
            cursor.execute(
                "SELECT auth_user_id,status FROM core.users WHERE id=%s",
                (unclassified_user_id,),
            )
            assert cursor.fetchone() == (unclassified_auth_user_id, "active")

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
            _expect_check_violation(
                cursor,
                "UPDATE core.memberships SET status='active',revoked_at=NULL,"
                "revocation_reason=NULL,row_version=row_version+1 "
                "WHERE org_id=%s AND id=%s",
                (target.org_id, target.subject_membership_id),
            )
            for statement, parameters in (
                (
                    "DELETE FROM core.memberships WHERE org_id=%s AND id=%s",
                    (target.org_id, target.subject_membership_id),
                ),
                (
                    "DELETE FROM core.roles WHERE org_id=%s AND id=%s",
                    (target.org_id, target.role_id),
                ),
                (
                    "DELETE FROM core.users WHERE id=%s",
                    (target.subject_user_id,),
                ),
            ):
                _expect_database_error(
                    cursor, statement, parameters, {"23503", "23514"}
                )

            # User/role disabled states are deliberately reversible in the
            # canonical model. Re-enabling those labels alone still cannot
            # resurrect authority because membership/access/consent are terminal.
            cursor.execute("SAVEPOINT reversible_labels")
            cursor.execute(
                "UPDATE core.roles SET status='active',row_version=row_version+1 "
                "WHERE org_id=%s AND id=%s",
                (target.org_id, target.role_id),
            )
            cursor.execute(
                "UPDATE core.users SET status='active',row_version=row_version+1 "
                "WHERE id=%s",
                (target.subject_user_id,),
            )
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
            assert _effective_authority_count(cursor, target) == 0
            cursor.execute("ROLLBACK TO SAVEPOINT reversible_labels")
            cursor.execute("RELEASE SAVEPOINT reversible_labels")
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")
            assert _authority_snapshot(cursor, target) == terminal_snapshot
            assert _authority_snapshot(cursor, other_tenant) == other_before
            assert _authority_snapshot(cursor, unrelated_tenant) == unrelated_before
            print(
                "Live18 terminal identity cleanup PostgreSQL 15 acceptance passed"
            )
    finally:
        connection.rollback()
        connection.close()


if __name__ == "__main__":
    main()

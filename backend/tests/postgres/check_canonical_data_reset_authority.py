#!/usr/bin/env python3
"""Prove an organization purge cannot alter a sibling tenant."""

from __future__ import annotations

import os

import psycopg2

import scripts.canonical_data_reset_authority as reset_authority


PROJECT_REF = reset_authority.CANONICAL_STAGING_PROJECT_REF
PURGE_ORG = "10000000-0000-4000-8000-000000000010"
KEEP_ORG = "20000000-0000-4000-8000-000000000010"


def _connect():
    url = os.environ["DATABASE_URL"].replace(
        "postgresql+psycopg2://", "postgresql://", 1
    )
    return psycopg2.connect(url)


def _seed_two_organizations() -> None:
    with _connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute("CREATE SCHEMA IF NOT EXISTS storage")
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS storage.objects(
                  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                  bucket_id text NOT NULL,
                  name text NOT NULL
                )
                """
            )
            for role in sorted(reset_authority.LOGIN_ROLES):
                cursor.execute(
                    f'ALTER ROLE "{role}" LOGIN PASSWORD %s',
                    (f"disposable-{role}-password",),
                )
            cursor.execute("SET LOCAL session_replication_role=replica")
            cursor.execute(
                "INSERT INTO auth.users(id) VALUES "
                "('10000000-0000-4000-8000-000000000001'),"
                "('20000000-0000-4000-8000-000000000001')"
            )
            cursor.execute(
                """
                INSERT INTO core.organizations(
                  id,legal_name,registered_address_line1,registered_city,
                  registered_state_code,registered_postal_code,status,
                  created_by_membership_id,updated_by_membership_id
                ) VALUES
                (%s::uuid,'Purge Target','1 Target Road','Pune','27','411001',
                 'active','10000000-0000-4000-8000-000000000003'::uuid,
                 '10000000-0000-4000-8000-000000000003'::uuid),
                (%s::uuid,'Keep Target','2 Keep Road','Pune','27','411002',
                 'active','20000000-0000-4000-8000-000000000003'::uuid,
                 '20000000-0000-4000-8000-000000000003'::uuid)
                """,
                (PURGE_ORG, KEEP_ORG),
            )
            cursor.execute(
                """
                INSERT INTO core.users(id,auth_user_id,display_name) VALUES
                ('10000000-0000-4000-8000-000000000002'::uuid,
                 '10000000-0000-4000-8000-000000000001'::uuid,'Purge User'),
                ('20000000-0000-4000-8000-000000000002'::uuid,
                 '20000000-0000-4000-8000-000000000001'::uuid,'Keep User')
                """
            )
            cursor.execute(
                """
                INSERT INTO core.memberships(
                  org_id,id,user_id,status,joined_at,
                  created_by_membership_id,updated_by_membership_id
                ) VALUES
                (%s::uuid,'10000000-0000-4000-8000-000000000003'::uuid,
                 '10000000-0000-4000-8000-000000000002'::uuid,'active',
                 transaction_timestamp(),
                 '10000000-0000-4000-8000-000000000003'::uuid,
                 '10000000-0000-4000-8000-000000000003'::uuid),
                (%s::uuid,'20000000-0000-4000-8000-000000000003'::uuid,
                 '20000000-0000-4000-8000-000000000002'::uuid,'active',
                 transaction_timestamp(),
                 '20000000-0000-4000-8000-000000000003'::uuid,
                 '20000000-0000-4000-8000-000000000003'::uuid)
                """,
                (PURGE_ORG, KEEP_ORG),
            )


def main() -> int:
    authority = reset_authority.load_reset_authority()
    _seed_two_organizations()

    plan_connection = _connect()
    try:
        plan = reset_authority.plan_organization_purge(
            plan_connection,
            authority=authority,
            project_ref=PROJECT_REF,
            organization_id=PURGE_ORG,
        )
    finally:
        plan_connection.close()
    assert plan["organization_relation_count"] == 111
    assert plan["global_reset_available"] is False
    assert plan["truncate_used"] is False

    purge_connection = _connect()
    try:
        first = reset_authority.execute_organization_purge(
            purge_connection,
            authority=authority,
            project_ref=PROJECT_REF,
            organization_id=PURGE_ORG,
            confirmation=reset_authority.organization_confirmation(PURGE_ORG),
            authorized_plan_sha256="a" * 64,
        )
    finally:
        purge_connection.close()
    assert first["organization_row_count_before_purge"] > 0
    assert first["organization_row_count_after_purge"] == 0
    assert first["other_organization_row_count_preserved"] > 0
    assert first["organization_boundary_deleted"] is True

    with _connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT legal_name,status FROM core.organizations WHERE id=%s::uuid",
                (KEEP_ORG,),
            )
            assert cursor.fetchone() == ("Keep Target", "active")
            cursor.execute(
                "SELECT count(*) FROM core.memberships WHERE org_id=%s::uuid",
                (KEEP_ORG,),
            )
            assert cursor.fetchone() == (1,)

    original_seed_digest = reset_authority._seed_digest
    digest_calls = 0

    def fail_after_purge(cursor, relations):
        nonlocal digest_calls
        digest_calls += 1
        if digest_calls == 2:
            raise RuntimeError("injected post-purge failure")
        return original_seed_digest(cursor, relations)

    reset_authority._seed_digest = fail_after_purge
    rollback_connection = _connect()
    try:
        try:
            reset_authority.execute_organization_purge(
                rollback_connection,
                authority=authority,
                project_ref=PROJECT_REF,
                organization_id=KEEP_ORG,
                confirmation=reset_authority.organization_confirmation(KEEP_ORG),
                authorized_plan_sha256="b" * 64,
            )
        except RuntimeError as error:
            assert str(error) == "injected post-purge failure"
        else:
            raise AssertionError("injected purge failure did not abort")
    finally:
        rollback_connection.close()
        reset_authority._seed_digest = original_seed_digest

    with _connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT status FROM core.organizations WHERE id=%s::uuid", (KEEP_ORG,)
            )
            # Suspension is a separate committed safety step. The destructive
            # transaction rolls back while the target remains visibly fenced.
            assert cursor.fetchone() == ("suspended",)
            cursor.execute(
                "SELECT count(*) FROM core.memberships WHERE org_id=%s::uuid",
                (KEEP_ORG,),
            )
            assert cursor.fetchone() == (1,)
    print("organization-scoped purge and sibling isolation verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

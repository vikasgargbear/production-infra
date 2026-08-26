#!/usr/bin/env python3
"""Execute the data-only reset and rollback proof on disposable PostgreSQL."""

from __future__ import annotations

import os

import psycopg2

import scripts.canonical_data_reset_authority as reset_authority


PROJECT_REF = reset_authority.CANONICAL_STAGING_PROJECT_REF


def _connect():
    url = os.environ["DATABASE_URL"].replace(
        "postgresql+psycopg2://", "postgresql://", 1
    )
    return psycopg2.connect(url)


def main() -> int:
    authority = reset_authority.load_reset_authority()
    with _connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute("CREATE SCHEMA IF NOT EXISTS storage")
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS storage.objects (
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
            cursor.execute(
                """
                INSERT INTO erp_core_commands.command_scopes (
                    backend_pid,transaction_id,scope,org_id,entity_id
                ) VALUES (
                    pg_backend_pid(),txid_current(),'reset-integration',
                    '00000000-0000-7000-8000-000000000001'::uuid,
                    '00000000-0000-7000-8000-000000000002'::uuid
                )
                """
            )

    first_connection = _connect()
    try:
        first = reset_authority.execute_reset(
            first_connection,
            authority=authority,
            project_ref=PROJECT_REF,
        )
    finally:
        first_connection.close()
    assert first["disposable_row_count_before_reset"] > 0
    assert first["disposable_row_count_after_reset"] == 0
    assert first["relation_oids_preserved"] is True
    assert first["schema_oids_preserved"] is True

    second_connection = _connect()
    try:
        second = reset_authority.execute_reset(
            second_connection,
            authority=authority,
            project_ref=PROJECT_REF,
        )
    finally:
        second_connection.close()
    assert second["disposable_row_count_before_reset"] == 0

    with _connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO erp_core_commands.command_scopes (
                    backend_pid,transaction_id,scope,org_id,entity_id
                ) VALUES (
                    pg_backend_pid(),txid_current(),'rollback-integration',
                    '00000000-0000-7000-8000-000000000001'::uuid,
                    '00000000-0000-7000-8000-000000000003'::uuid
                )
                """
            )

    original_seed_digest = reset_authority._seed_digest
    digest_calls = 0

    def fail_after_truncate(cursor, relations):
        nonlocal digest_calls
        digest_calls += 1
        if digest_calls == 2:
            raise RuntimeError("injected post-truncate failure")
        return original_seed_digest(cursor, relations)

    reset_authority._seed_digest = fail_after_truncate
    rollback_connection = _connect()
    try:
        try:
            reset_authority.execute_reset(
                rollback_connection,
                authority=authority,
                project_ref=PROJECT_REF,
            )
        except RuntimeError as error:
            assert str(error) == "injected post-truncate failure"
        else:
            raise AssertionError("injected reset failure did not abort")
    finally:
        rollback_connection.close()
        reset_authority._seed_digest = original_seed_digest

    with _connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT count(*) FROM erp_core_commands.command_scopes "
                "WHERE scope='rollback-integration'"
            )
            assert cursor.fetchone() == (1,)
            cursor.execute(
                "DELETE FROM erp_core_commands.command_scopes "
                "WHERE scope='rollback-integration'"
            )
    print("canonical data reset PostgreSQL execution and rollback verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

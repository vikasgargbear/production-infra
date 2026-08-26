"""Prove migration 0024 works through the staging SET-only role topology."""

from __future__ import annotations

import os
from pathlib import Path

import psycopg2


ROOT = Path(__file__).resolve().parents[3]
MIGRATION_SQL = (
    ROOT / "backend/alembic/sql/20260826_0024_force_input_credit_rls.sql"
)
RUNNER_ROLE = "erp_migration_runner_test"


def main() -> None:
    database_url = os.environ["DATABASE_URL"].replace(
        "postgresql+psycopg2://", "postgresql://", 1
    )
    migration = MIGRATION_SQL.read_text(encoding="utf-8")

    with psycopg2.connect(database_url) as connection:
        connection.autocommit = False
        with connection.cursor() as cursor:
            cursor.execute(
                f'CREATE ROLE "{RUNNER_ROLE}" NOLOGIN NOSUPERUSER '
                "NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS"
            )
            # PostgreSQL 15 models SET-only membership as a NOINHERIT member;
            # PostgreSQL 16+ exposes the equivalent SET/INHERIT grant options.
            cursor.execute(f'GRANT erp_migration_owner TO "{RUNNER_ROLE}"')
            cursor.execute(f'SET SESSION AUTHORIZATION "{RUNNER_ROLE}"')
            cursor.execute(
                "SELECT session_user,current_user,rolsuper,rolinherit,rolbypassrls "
                "FROM pg_catalog.pg_roles WHERE rolname=current_user"
            )
            assert cursor.fetchone() == (
                RUNNER_ROLE,
                RUNNER_ROLE,
                False,
                False,
                False,
            )

            cursor.execute(migration)
            cursor.execute("SELECT session_user,current_user")
            assert cursor.fetchone() == (RUNNER_ROLE, RUNNER_ROLE)
            cursor.execute(
                """
                SELECT count(*),bool_and(relation.relforcerowsecurity)
                  FROM pg_catalog.pg_class relation
                  JOIN pg_catalog.pg_namespace namespace
                    ON namespace.oid=relation.relnamespace
                 WHERE namespace.nspname='tax'
                   AND relation.relname=ANY(%s)
                """,
                (
                    [
                        "input_credit_lots",
                        "input_credit_reversal_events",
                        "input_credit_applications",
                    ],
                ),
            )
            assert cursor.fetchone() == (3, True)
            cursor.execute("RESET SESSION AUTHORIZATION")
        connection.rollback()


if __name__ == "__main__":
    main()

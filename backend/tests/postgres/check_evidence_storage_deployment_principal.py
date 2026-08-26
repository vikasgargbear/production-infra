"""Exercise evidence-storage deployment as Supabase's constrained role admin."""

from __future__ import annotations

import os
from pathlib import Path

import psycopg2


ROOT = Path(__file__).resolve().parents[3]
DEPLOYMENT_SQL = ROOT / "database/09-deployment/canonical-evidence-storage.sql"
ADMIN_ROLE = "evidence_deployment_admin_test"
EVIDENCE_ROLE = "erp_evidence_storage"
AUTHENTICATOR_ROLE = "authenticator"


def _cleanup(cursor) -> None:
    cursor.execute("RESET SESSION AUTHORIZATION")
    cursor.execute("DROP SCHEMA IF EXISTS storage CASCADE")
    if _role_exists(cursor, EVIDENCE_ROLE) and _role_exists(
        cursor, AUTHENTICATOR_ROLE
    ):
        cursor.execute("REVOKE erp_evidence_storage FROM authenticator")
    for role in (EVIDENCE_ROLE, AUTHENTICATOR_ROLE, ADMIN_ROLE):
        if _role_exists(cursor, role):
            cursor.execute(f'DROP OWNED BY "{role}"')
            cursor.execute(f'DROP ROLE "{role}"')


def _role_exists(cursor, role: str) -> bool:
    cursor.execute(
        "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=%s)",
        (role,),
    )
    return bool(cursor.fetchone()[0])


def main() -> None:
    database_url = os.environ["DATABASE_URL"].replace(
        "postgresql+psycopg2://", "postgresql://", 1
    )
    deployment_sql = DEPLOYMENT_SQL.read_text(encoding="utf-8")

    with psycopg2.connect(database_url) as connection:
        connection.autocommit = True
        with connection.cursor() as cursor:
            _cleanup(cursor)
            try:
                cursor.execute(
                    f'CREATE ROLE "{ADMIN_ROLE}" NOLOGIN NOSUPERUSER '
                    "NOCREATEDB CREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS"
                )
                cursor.execute(
                    f'GRANT CREATE ON DATABASE "{connection.info.dbname}" '
                    f'TO "{ADMIN_ROLE}"'
                )
                cursor.execute(f'SET SESSION AUTHORIZATION "{ADMIN_ROLE}"')
                cursor.execute(
                    f'CREATE ROLE "{AUTHENTICATOR_ROLE}" '
                    "NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT "
                    "NOREPLICATION NOBYPASSRLS"
                )
                cursor.execute("CREATE SCHEMA storage")
                cursor.execute(
                    """
                    CREATE TABLE storage.buckets (
                        id text PRIMARY KEY,
                        name text NOT NULL,
                        public boolean NOT NULL,
                        file_size_limit bigint,
                        allowed_mime_types text[]
                    );
                    CREATE TABLE storage.objects (
                        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                        bucket_id text NOT NULL,
                        name text NOT NULL
                    );
                    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
                    CREATE FUNCTION storage.allow_any_operation(text[])
                    RETURNS boolean LANGUAGE sql IMMUTABLE AS 'SELECT true';
                    CREATE FUNCTION storage.extension(text)
                    RETURNS text LANGUAGE sql IMMUTABLE AS
                    'SELECT split_part($1,''.'',-1)';
                    CREATE FUNCTION storage.foldername(text)
                    RETURNS text[] LANGUAGE sql IMMUTABLE AS
                    'SELECT string_to_array(regexp_replace($1,''/[^/]+$'',''''),''/'')';
                    CREATE FUNCTION storage.filename(text)
                    RETURNS text LANGUAGE sql IMMUTABLE AS
                    'SELECT regexp_replace($1,''^.*/'','''')';
                    """
                )

                cursor.execute(deployment_sql)
                cursor.execute(deployment_sql)
                cursor.execute(
                    """
                    SELECT NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper
                           AND NOT rolcreatedb AND NOT rolcreaterole
                           AND NOT rolreplication AND NOT rolbypassrls
                      FROM pg_catalog.pg_roles
                     WHERE rolname='erp_evidence_storage'
                    """
                )
                assert cursor.fetchone() == (True,)
                cursor.execute(
                    "SELECT count(*) FROM pg_catalog.pg_policy "
                    "WHERE polrelid='storage.objects'::regclass "
                    "AND polname LIKE 'canonical_evidence_server_%'"
                )
                assert cursor.fetchone() == (3,)

                cursor.execute("RESET SESSION AUTHORIZATION")
                cursor.execute("ALTER ROLE erp_evidence_storage SUPERUSER")
                cursor.execute(f'SET SESSION AUTHORIZATION "{ADMIN_ROLE}"')
                try:
                    cursor.execute(deployment_sql)
                except psycopg2.errors.RaiseException as error:
                    assert "protected role posture drifted" in str(error)
                    cursor.execute("ROLLBACK")
                else:
                    raise AssertionError("protected role drift was not rejected")
            finally:
                _cleanup(cursor)


if __name__ == "__main__":
    main()

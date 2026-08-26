"""Prove reset cleanup on a pristine pre-storage-authority installation."""

from __future__ import annotations

import os

import psycopg2

from scripts.cleanup_staging_evidence_storage import (
    CANONICAL_STAGING_PROJECT_REF,
    close_writer_authority,
    execute_fenced_cleanup,
    load_inventory,
)


def main() -> None:
    database_url = os.environ["DATABASE_URL"].replace(
        "postgresql+psycopg2://", "postgresql://", 1
    )
    with psycopg2.connect(database_url) as connection:
        try:
            with connection.cursor() as cursor:
                cursor.execute("CREATE SCHEMA storage")
                cursor.execute(
                    "CREATE TABLE storage.objects (bucket_id text, name text)"
                )
                cursor.execute(
                    "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_roles "
                    "WHERE rolname='erp_evidence_storage')"
                )
                assert cursor.fetchone() == (False,)
                cursor.execute(
                    "SELECT count(*) FROM storage.objects "
                    "WHERE bucket_id='canonical-evidence-private-v1'"
                )
                assert cursor.fetchone() == (0,)
                cursor.execute(
                    "SELECT count(*) FROM core.attachments "
                    "WHERE storage_bucket='canonical-evidence-private-v1'"
                )
                assert cursor.fetchone() == (0,)
            connection.commit()

            receipt = execute_fenced_cleanup(
                project_ref=CANONICAL_STAGING_PROJECT_REF,
                load_current_inventory=lambda: load_inventory(connection),
                open_writer=lambda: (_ for _ in ()).throw(
                    AssertionError("first install must not open an absent writer role")
                ),
                close_writer=lambda: close_writer_authority(connection),
                token_provider_factory=lambda: (_ for _ in ()).throw(
                    AssertionError("empty first install must not resolve a token")
                ),
            )
        finally:
            connection.rollback()
            with connection.cursor() as cursor:
                cursor.execute("DROP SCHEMA IF EXISTS storage CASCADE")
            connection.commit()

    assert receipt["state"] == "empty"
    assert receipt["reconciled_object_count"] == 0
    assert receipt["evidence_writer_role_installed"] is False
    assert receipt["evidence_writer_role_absence_verified"] is True
    assert receipt["evidence_writer_membership_open"] is False
    assert receipt["remaining_preclosure_authenticator_session_count"] == 0


if __name__ == "__main__":
    main()

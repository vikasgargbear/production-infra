"""Purge the synthetic mixed-invoice fixture; preserve sibling/global tax rows.

Creates the check_scoped_product_tax_invoice.py fixture in a disposable cluster.
The test never creates a database or changes a database connection target.
"""
import hashlib
from contextlib import closing
import json
import os
from unittest.mock import patch
from urllib.parse import urlparse

import psycopg2
from psycopg2 import sql

import scripts.canonical_data_reset_authority as reset_authority
import check_scoped_product_tax_invoice as mixed


def snapshot(connection, relations, target, *, target_rows):
    result = {}
    with connection.cursor() as cursor:
        for relation in relations:
            schema, name = relation.split(".")
            key = "id" if relation == "core.organizations" else "org_id"
            predicate = sql.SQL("= %s::uuid" if target_rows else "IS DISTINCT FROM %s::uuid")
            cursor.execute(sql.SQL("SELECT to_jsonb(t) FROM {} t WHERE {} {} ORDER BY to_jsonb(t)::text").format(
                sql.Identifier(schema, name), sql.Identifier(key), predicate), (target,))
            result[relation] = [row[0] for row in cursor.fetchall()]
    connection.commit()
    return result


def main():
    url = os.environ["DATABASE_URL"].replace("postgresql+psycopg2://", "postgresql://", 1)
    parsed = urlparse(url)
    assert os.environ.get("CANONICAL_CI_ALLOW_DISPOSABLE") == "1"
    assert parsed.hostname in {"localhost", "127.0.0.1"}
    assert parsed.path == "/canonical_alembic_ci"
    expected_directory = os.environ["CANONICAL_TEST_DATA_DIRECTORY"]
    assert os.path.isabs(expected_directory) and expected_directory != "/"
    with psycopg2.connect(url) as preflight, preflight.cursor() as cursor:
        cursor.execute("SHOW data_directory")
        assert cursor.fetchone()[0] == expected_directory
    keep, target = mixed.main()
    authority = reset_authority.load_reset_authority()
    with closing(psycopg2.connect(url)) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SHOW data_directory")
            assert cursor.fetchone()[0] == expected_directory
            cursor.execute("SELECT count(*) FROM sales.invoices WHERE org_id=%s AND status='posted'", (keep,))
            assert cursor.fetchone()[0] == 1
            cursor.execute("SELECT DISTINCT org_id::text FROM tax.tax_code_versions WHERE org_id IN (%s,%s)", (keep, target))
            scoped_orgs = {row[0] for row in cursor.fetchall()}
            assert len(scoped_orgs) == 2 and target in scoped_orgs
            cursor.execute("SELECT count(*) FROM automation.historical_migration_facts WHERE org_id=%s AND dataset_id LIKE 'pg15-source-tax-%%'", (target,))
            assert cursor.fetchone()[0] == 2
            cursor.execute("CREATE SCHEMA IF NOT EXISTS storage")
            cursor.execute("CREATE TABLE IF NOT EXISTS storage.objects(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,bucket_id text NOT NULL,name text NOT NULL)")
            relations = reset_authority._organization_relations(cursor, authority)
        connection.commit()
        preserve_relations = tuple(sorted(set((*relations, "core.organizations", "tax.tax_code_versions", "core.reference_data_releases"))))
        other_before = snapshot(connection, preserve_relations, target, target_rows=False)
        target_before = snapshot(connection, relations, target, target_rows=True)
        assert len(target_before["tax.tax_code_versions"]) == 2
        assert not target_before["sales.invoices"]

        # Real metadata storage preconditions must reject the posted fixture;
        # never patch an organization exception to bypass that protection.
        try:
            reset_authority.plan_organization_purge(connection, authority=authority,
                project_ref=reset_authority.CANONICAL_STAGING_PROJECT_REF, organization_id=keep)
        except reset_authority.ResetAuthorityError as error:
            assert "evidence storage scope drifted" in str(error)
        else:
            raise AssertionError("Noncanonical evidence scope must block purge")
        plan = reset_authority.plan_organization_purge(connection, authority=authority,
            project_ref=reset_authority.CANONICAL_STAGING_PROJECT_REF, organization_id=target)
        plan_digest = hashlib.sha256(json.dumps(plan, sort_keys=True).encode()).hexdigest()
        kwargs = dict(authority=authority, project_ref=reset_authority.CANONICAL_STAGING_PROJECT_REF,
            organization_id=target, confirmation=reset_authority.organization_confirmation(target),
            authorized_plan_sha256=plan_digest)
        original_digest = reset_authority._seed_digest
        calls = 0

        def fail_after_delete(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError("synthetic post-delete rollback probe")
            return original_digest(*args, **kwargs)

        with patch.object(reset_authority, "_seed_digest", fail_after_delete):
            try:
                reset_authority.execute_organization_purge(connection, **kwargs)
            except RuntimeError as error:
                assert str(error) == "synthetic post-delete rollback probe"
            else:
                raise AssertionError("Post-delete failure must roll back")
        assert calls == 2
        rolled_back = snapshot(connection, relations, target, target_rows=True)
        # The separately committed suspension produces one truthful audit event.
        # Purged business/source/tax rows must otherwise roll back byte-for-byte.
        before_audit = target_before.pop("core.audit_events")
        after_audit = rolled_back.pop("core.audit_events")
        assert len(after_audit) == len(before_audit) + 1
        assert all(row in after_audit for row in before_audit)
        assert rolled_back == target_before, [name for name in rolled_back if rolled_back[name] != target_before[name]]
        assert snapshot(connection, preserve_relations, target, target_rows=False) == other_before
        # Suspension is deliberately committed before deletion; all actual
        # business/source/tax records above must survive the failed purge.
        with connection.cursor() as cursor:
            cursor.execute("SELECT status FROM core.organizations WHERE id=%s", (target,))
            assert cursor.fetchone()[0] == "suspended"
        connection.commit()
        result = reset_authority.execute_organization_purge(connection, **kwargs)
        assert result["organization_row_count_after_purge"] == 0
        assert result["organization_boundary_deleted"] is True
        assert all(not rows for rows in snapshot(connection, preserve_relations, target, target_rows=True).values())
        assert snapshot(connection, preserve_relations, target, target_rows=False) == other_before
    print("Scoped-tax purge passed: source dependency graph deleted; rollback, sibling posted invoice and global tax/release rows preserved exactly")


if __name__ == "__main__":
    main()

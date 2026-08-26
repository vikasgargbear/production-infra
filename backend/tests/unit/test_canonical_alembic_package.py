import json
from pathlib import Path

import pytest

from migration_support import canonical_baseline as package
from scripts import package_canonical_baseline_migration as packager


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_checked_migration_is_exact_generator_output_and_hash_bound() -> None:
    generated = packager.generate_source()
    checked = package.BASELINE_SQL_PATH.read_text(encoding="utf-8")
    manifest = json.loads(package.BASELINE_MANIFEST_PATH.read_text(encoding="utf-8"))

    assert checked == generated
    assert packager.render_manifest(generated) == (
        package.BASELINE_MANIFEST_PATH.read_text(encoding="utf-8")
    )
    assert manifest["generator_command"] == (
        "python3 backend/scripts/generate_canonical_baseline.py "
        "--enforcement-root database/canonical"
    )
    assert "IF NOT EXISTS" not in checked.upper()


def test_packaged_migration_removes_only_generator_outer_transaction() -> None:
    source = package.BASELINE_SQL_PATH.read_text(encoding="utf-8")
    body, manifest = package.load_packaged_baseline()

    assert source.count("\nBEGIN;\n") == 1
    assert source.rstrip().endswith("COMMIT;")
    assert not body.rstrip().endswith("COMMIT;")
    assert manifest["transaction_wrapper"] == (
        "generator_outer_pair_removed_by_alembic_runner_v1"
    )


@pytest.mark.parametrize(
    "source, message",
    [
        ("-- DEPLOYABLE DDL:\nSELECT 1;\n", "outer BEGIN/COMMIT"),
        (
            "-- DEPLOYABLE DDL:\nBEGIN;\nBEGIN;\nSELECT 1;\nCOMMIT;\nCOMMIT;\n",
            "nested standalone",
        ),
        (
            "-- DEPLOYABLE DDL:\nBEGIN;\nCREATE TABLE IF NOT EXISTS x (id int);\nCOMMIT;\n",
            "IF NOT EXISTS",
        ),
    ],
)
def test_transaction_unwrapper_rejects_ambiguous_or_idempotent_ddl(
    source: str, message: str
) -> None:
    with pytest.raises(package.CanonicalBaselineError, match=message):
        package.unwrap_generator_transaction(source)


def test_reviewed_source_hash_is_required_for_execution(monkeypatch) -> None:
    _, manifest = package.load_packaged_baseline()
    monkeypatch.delenv(package.APPROVAL_ENVIRONMENT_VARIABLE, raising=False)
    with pytest.raises(package.CanonicalBaselineError, match="must equal"):
        package.require_approved_hash(manifest)

    monkeypatch.setenv(
        package.APPROVAL_ENVIRONMENT_VARIABLE, manifest["source_sql_sha256"]
    )
    package.require_approved_hash(manifest)


class _RoleResult:
    def __init__(self, row):
        self.row = row

    def one(self):
        return self.row


class _RoleConnection:
    def __init__(self, row):
        self.row = row

    def exec_driver_sql(self, statement):
        assert "pg_catalog.pg_roles" in statement
        return _RoleResult(self.row)


def test_bootstrap_principal_preflight_rejects_runtime_and_weak_roles() -> None:
    with pytest.raises(package.CanonicalBaselineError, match="runtime principals"):
        package.require_bootstrap_migration_principal(
            _RoleConnection(("erp_runtime", False, False))
        )
    with pytest.raises(package.CanonicalBaselineError, match="CREATEROLE"):
        package.require_bootstrap_migration_principal(
            _RoleConnection(("ordinary_login", False, False))
        )
    assert (
        package.require_bootstrap_migration_principal(
            _RoleConnection(("postgres", True, True))
        )
        == "postgres"
    )


def test_revision_is_static_and_downgrade_is_fail_closed() -> None:
    revision = (
        REPO_ROOT
        / "backend/alembic/versions/20260820_0001_canonical_v1.py"
    ).read_text(encoding="utf-8")
    dockerfile = (REPO_ROOT / "backend/Dockerfile").read_text(encoding="utf-8")

    assert 'revision = "20260820_0001"' in revision
    assert "down_revision = None" in revision
    assert "connection.connection.cursor()" in revision
    assert "execute_packaged_sql(cursor, sql)" in revision
    assert "cursor.close()" in revision
    assert "ALTER TABLE public.alembic_version ENABLE ROW LEVEL SECURITY" in revision
    assert "ALTER TABLE public.alembic_version FORCE ROW LEVEL SECURITY" in revision
    assert "REVOKE ALL ON TABLE public.alembic_version FROM PUBLIC" in revision
    assert "CanonicalBaselineError" in revision.split("def downgrade", 1)[1]
    assert "COPY . ." in dockerfile
    assert (
        "RUN python scripts/package_canonical_baseline_migration.py --verify-package"
        in dockerfile
    )


def test_revision_reports_the_generated_statement_location() -> None:
    class Diagnostic:
        statement_position = "20"

    class DatabaseError(Exception):
        diag = Diagnostic()

    class Cursor:
        def execute(self, _sql):
            raise DatabaseError("permission denied")

    with pytest.raises(
        package.CanonicalBaselineError,
        match=r"generated line 2: SELECT forbidden",
    ):
        package.execute_packaged_sql(Cursor(), "SELECT 1;\nSELECT forbidden;")


def test_revision_preserves_database_errors_without_a_statement_position() -> None:
    class Diagnostic:
        statement_position = None

    class DatabaseError(Exception):
        diag = Diagnostic()

    error = DatabaseError("permission denied")

    class Cursor:
        def execute(self, _sql):
            raise error

    with pytest.raises(DatabaseError) as raised:
        package.execute_packaged_sql(Cursor(), "SELECT forbidden;")
    assert raised.value is error


def test_disposable_postgres_bootstrap_matches_supabase_crypto_prerequisite() -> None:
    bootstrap = (
        REPO_ROOT / "database/canonical/ci/bootstrap_supabase_auth.sql"
    ).read_text(encoding="utf-8")

    assert "CREATE SCHEMA extensions;" in bootstrap
    assert "CREATE EXTENSION pgcrypto WITH SCHEMA extensions;" in bootstrap
    assert "CREATE ROLE supabase_auth_admin NOLOGIN NOINHERIT NOBYPASSRLS" in bootstrap
    assert "CREATE SCHEMA auth;" in bootstrap


def test_postgres_fixtures_do_not_schema_qualify_special_sql_syntax() -> None:
    fixtures = sorted(
        (REPO_ROOT / "database" / "canonical").glob("**/test_*_rollback.sql")
    )

    assert fixtures
    for fixture in fixtures:
        sql = fixture.read_text(encoding="utf-8")
        assert "pg_catalog.position(" not in sql, fixture
        assert "pg_catalog.extract(" not in sql, fixture

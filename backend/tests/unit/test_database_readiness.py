import json
from pathlib import Path

from scripts import schema_readiness


REPO_ROOT = Path(__file__).resolve().parents[3]


def _authority(**overrides):
    value = {
        "readiness_state": "unbaselined",
        "bootstrap_ddl_root": "database/02-tables",
        "canonical_migration_root": "backend/alembic",
        "rls_policy_file": "backend/migrations/enable_rls.sql",
        "deployment_entrypoint": "database/deploy.sql",
        "required_migration_files": [],
        "migration_versions_glob": "backend/alembic/versions/*.py",
        "migration_dependency_file": "backend/requirements.txt",
        "migration_dependency_pattern": "^alembic(?:[<>=!~].*)?$",
        "expected_tenant_setting": "app.org_id",
        "global_tables": [],
    }
    value.update(overrides)
    return value


def test_repository_readiness_claim_is_fail_closed():
    report = schema_readiness.audit_repository(REPO_ROOT)

    assert schema_readiness.validate_readiness_claim(report)
    if report.authority_state == schema_readiness.READY_STATE:
        assert report.ready, [issue.code for issue in report.issues]
    else:
        assert not report.ready
        assert any(issue.code == "authority_unbaselined" for issue in report.issues)


def test_missing_deploy_include_is_reported(tmp_path: Path):
    deploy = tmp_path / "database/deploy.sql"
    deploy.parent.mkdir(parents=True)
    deploy.write_text("\\i missing/schema.sql\n", encoding="utf-8")

    issues = schema_readiness.check_deployment_includes(_authority(), tmp_path)

    assert [issue.code for issue in issues] == ["missing_deploy_include"]
    assert issues[0].line == 1


def test_competing_ddl_outside_authority_is_reported(tmp_path: Path):
    bootstrap = tmp_path / "database/02-tables"
    bootstrap.mkdir(parents=True)
    (bootstrap / "tables.sql").write_text(
        "CREATE TABLE sales.invoices (invoice_id integer);\n", encoding="utf-8"
    )
    legacy = tmp_path / "database/MASTER_FIX.sql"
    legacy.write_text("CREATE TABLE sales.invoices (invoice_id integer);\n", encoding="utf-8")

    issues = schema_readiness.check_competing_ddl(_authority(), tmp_path)

    assert len(issues) == 1
    assert issues[0].code == "competing_ddl_authority"
    assert issues[0].path == "database/MASTER_FIX.sql"


def test_alembic_revision_outside_authority_is_reported(tmp_path: Path):
    legacy = tmp_path / "backend/migrations/versions/legacy.py"
    legacy.parent.mkdir(parents=True)
    legacy.write_text(
        "from alembic import op\nrevision = 'legacy'\ndown_revision = None\n",
        encoding="utf-8",
    )

    issues = schema_readiness.check_competing_ddl(_authority(), tmp_path)

    assert len(issues) == 1
    assert issues[0].code == "competing_migration_revision"
    assert issues[0].path == "backend/migrations/versions/legacy.py"


def test_tenant_tables_and_children_require_rls(tmp_path: Path):
    bootstrap = tmp_path / "database/02-tables"
    bootstrap.mkdir(parents=True)
    (bootstrap / "tables.sql").write_text(
        """
CREATE TABLE sales.invoices (
    invoice_id integer PRIMARY KEY,
    org_id uuid NOT NULL
);
CREATE TABLE sales.invoice_items (
    item_id integer PRIMARY KEY,
    invoice_id integer REFERENCES sales.invoices(invoice_id)
);
""",
        encoding="utf-8",
    )
    policy = tmp_path / "backend/migrations/enable_rls.sql"
    policy.parent.mkdir(parents=True)
    policy.write_text("", encoding="utf-8")

    issues = schema_readiness.check_rls_coverage(_authority(), tmp_path)
    codes = {issue.code for issue in issues}

    assert "tenant_table_missing_rls" in codes
    assert "tenant_child_missing_scope" in codes


def test_unknown_rls_target_and_conflicting_setting_are_reported(tmp_path: Path):
    bootstrap = tmp_path / "database/02-tables"
    bootstrap.mkdir(parents=True)
    (bootstrap / "tables.sql").write_text(
        "CREATE TABLE sales.invoices (invoice_id integer, org_id uuid);\n",
        encoding="utf-8",
    )
    policy = tmp_path / "backend/migrations/enable_rls.sql"
    policy.parent.mkdir(parents=True)
    policy.write_text(
        """
ALTER TABLE sales.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales.ghost ENABLE ROW LEVEL SECURITY;
SELECT current_setting('app.current_org_id', true);
""",
        encoding="utf-8",
    )

    issues = schema_readiness.check_rls_coverage(_authority(), tmp_path)
    codes = {issue.code for issue in issues}

    assert "tenant_table_missing_force_rls" in codes
    assert "rls_targets_unknown_table" in codes
    assert "conflicting_tenant_setting" in codes


def test_production_ready_claim_rejects_any_blocker():
    report = schema_readiness.ReadinessReport(
        authority_state=schema_readiness.READY_STATE,
        issues=(schema_readiness.Issue("example", "not ready", "database/example.sql"),),
    )

    assert not schema_readiness.validate_readiness_claim(report)


def test_authority_file_is_valid_json():
    authority = json.loads((REPO_ROOT / schema_readiness.AUTHORITY_PATH).read_text(encoding="utf-8"))
    assert authority["readiness_state"] in schema_readiness.VALID_STATES


def test_unknown_authority_state_is_rejected(tmp_path: Path):
    authority_path = tmp_path / schema_readiness.AUTHORITY_PATH
    authority_path.parent.mkdir(parents=True)
    authority_path.write_text(
        json.dumps(_authority(readiness_state="probably_ready")), encoding="utf-8"
    )

    try:
        schema_readiness.load_authority(tmp_path)
    except ValueError as error:
        assert "readiness_state" in str(error)
    else:
        raise AssertionError("unknown readiness state was accepted")

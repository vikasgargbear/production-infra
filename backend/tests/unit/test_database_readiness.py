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
        "source_classification_file": "database/schema-source-classification.json",
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
        assert any(
            issue.code == "authority_not_production_ready" for issue in report.issues
        )


def test_missing_deploy_include_is_reported(tmp_path: Path):
    deploy = tmp_path / "database/deploy.sql"
    deploy.parent.mkdir(parents=True)
    deploy.write_text("\\i missing/schema.sql\n", encoding="utf-8")

    issues = schema_readiness.check_deployment_includes(_authority(), tmp_path)

    assert [issue.code for issue in issues] == ["missing_deploy_include"]
    assert issues[0].line == 1


def test_repository_source_classification_is_exhaustive_and_machine_readable():
    authority = schema_readiness.load_authority(REPO_ROOT)
    classification = schema_readiness.load_source_classification(authority, REPO_ROOT)

    assert classification["readiness_state"] == "migrating"
    assert classification["competing_authority_count"] == 16
    assert len(classification["competing_authorities"]) == 16
    assert sum(
        len(group["paths"]) for group in classification["competing_authorities"]
    ) == 17
    assert classification["broken_deployment_include_count"] == 37
    assert sum(
        len(group["includes"])
        for group in classification["broken_deployment_include_groups"]
    ) == 37
    assert not schema_readiness.check_source_classification(authority, REPO_ROOT)


def test_repository_reset_authority_contract_is_structurally_ready():
    authority = schema_readiness.load_authority(REPO_ROOT)
    classification = schema_readiness.load_source_classification(authority, REPO_ROOT)
    canonical_sources = {
        source["path"]: source for source in classification["canonical_sources"]
    }

    assert authority["canonical_migration_root"] == "backend/alembic"
    assert canonical_sources["backend/alembic"]["role"] == (
        "hash-bound-canonical-production-migration-authority"
    )
    assert canonical_sources["database/02-tables"]["role"] == "legacy-bootstrap-only"
    assert not schema_readiness.audit_authority_contract(REPO_ROOT)


def test_repository_deployment_entrypoint_is_explicitly_fail_closed():
    authority = schema_readiness.load_authority(REPO_ROOT)
    issues = schema_readiness.check_deployment_includes(authority, REPO_ROOT)

    assert [issue.code for issue in issues] == [
        "deployment_blocked_pending_live_baseline"
    ]


def test_unclassified_competing_source_is_reported(tmp_path: Path):
    bootstrap = tmp_path / "database/02-tables"
    bootstrap.mkdir(parents=True)
    (bootstrap / "tables.sql").write_text(
        "CREATE TABLE sales.invoices (invoice_id integer);\n", encoding="utf-8"
    )
    legacy = tmp_path / "database/legacy.sql"
    legacy.write_text(
        "CREATE TABLE sales.legacy (legacy_id integer);\n", encoding="utf-8"
    )
    canonical = tmp_path / "backend/alembic"
    canonical.mkdir(parents=True)
    manifest = {
        "readiness_state": "unbaselined",
        "allowed_classifications": sorted(schema_readiness.VALID_CLASSIFICATIONS),
        "canonical_sources": [
            {"path": "database/02-tables", "classification": "retain"},
            {"path": "backend/alembic", "classification": "retain"},
        ],
        "legacy_deployment_plan": {
            "path": "database/deploy.sql",
            "classification": "retire",
            "execution_state": "fail-closed-pending-live-baseline",
        },
        "competing_authority_count": 0,
        "competing_authorities": [],
        "broken_deployment_include_count": 0,
        "broken_deployment_include_groups": [],
    }
    manifest_path = tmp_path / "database/schema-source-classification.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    issues = schema_readiness.check_source_classification(_authority(), tmp_path)

    assert any(
        issue.code == "unclassified_competing_authority"
        and issue.path == "database/legacy.sql"
        for issue in issues
    )


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


def test_agent_worktrees_are_not_scanned_as_repository_authority(tmp_path: Path):
    bootstrap = tmp_path / "database/02-tables"
    bootstrap.mkdir(parents=True)
    (bootstrap / "tables.sql").write_text(
        "CREATE TABLE sales.invoices (invoice_id integer);\n", encoding="utf-8"
    )
    agent_copy = tmp_path / ".claude/worktrees/agent/database/schema.sql"
    agent_copy.parent.mkdir(parents=True)
    agent_copy.write_text(
        "CREATE TABLE sales.agent_copy (agent_copy_id integer);\n", encoding="utf-8"
    )

    assert not schema_readiness.check_competing_ddl(_authority(), tmp_path)


def test_virtual_environment_dependencies_are_not_scanned_as_repository_authority(
    tmp_path: Path,
):
    installed_alembic_test = (
        tmp_path / "backend/runtime-python/lib/python3.11/site-packages/alembic/testing/env.py"
    )
    installed_alembic_test.parent.mkdir(parents=True)
    installed_alembic_test.write_text(
        "from alembic import op\nrevision = 'dependency-fixture'\n",
        encoding="utf-8",
    )
    (tmp_path / "backend/runtime-python/pyvenv.cfg").write_text(
        "home = /usr/local/bin\n",
        encoding="utf-8",
    )

    assert not schema_readiness.check_competing_ddl(_authority(), tmp_path)


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

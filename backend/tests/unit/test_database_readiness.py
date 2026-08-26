import json
import hashlib
from pathlib import Path

from scripts import schema_readiness


REPO_ROOT = Path(__file__).resolve().parents[3]


def _authority(**overrides):
    value = {
        "readiness_state": "unbaselined",
        "canonical_migration_root": "backend/alembic",
        "canonical_model_file": "docs/architecture/canonical-field-dictionary.json",
        "canonical_model_sha256": "0" * 64,
        "canonical_model_catalog_sha256": "0" * 64,
        "canonical_transaction_integrity_evidence": None,
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


def test_repository_source_classification_is_exhaustive_and_machine_readable():
    authority = schema_readiness.load_authority(REPO_ROOT)
    classification = schema_readiness.load_source_classification(authority, REPO_ROOT)

    assert classification["readiness_state"] == "migrating"
    assert classification["competing_authority_count"] == 5
    assert len(classification["competing_authorities"]) == 5
    assert sum(
        len(group["paths"]) for group in classification["competing_authorities"]
    ) == 7
    reachability = classification["source_reachability"]
    assert reachability["current_sources"] == ["backend/alembic"]
    assert reachability["reachable_competing_source_count"] == 0
    assert len(reachability["unreachable_sources"]) == 7
    assert not schema_readiness.check_source_classification(authority, REPO_ROOT)


def test_repository_reset_authority_contract_has_no_canonical_rls_gap():
    authority = schema_readiness.load_authority(REPO_ROOT)
    classification = schema_readiness.load_source_classification(authority, REPO_ROOT)
    canonical_sources = {
        source["path"]: source for source in classification["canonical_sources"]
    }

    assert authority["canonical_migration_root"] == "backend/alembic"
    assert canonical_sources["backend/alembic"]["role"] == (
        "hash-bound-canonical-production-migration-authority"
    )
    assert set(canonical_sources) == {"backend/alembic"}
    assert not schema_readiness.audit_authority_contract(REPO_ROOT)


def test_repository_strategy_is_reset_only_and_fail_closed():
    authority = schema_readiness.load_authority(REPO_ROOT)
    classification = schema_readiness.load_source_classification(authority, REPO_ROOT)

    assert classification["reset_strategy"] == {
        "mode": "reset-only",
        "conversion_allowed": False,
        "legacy_runtime_allowed": False,
        "dual_read_write_allowed": False,
    }


def test_unclassified_competing_source_is_reported(tmp_path: Path):
    legacy = tmp_path / "database/legacy.sql"
    legacy.parent.mkdir(parents=True)
    legacy.write_text(
        "CREATE TABLE sales.legacy (legacy_id integer);\n", encoding="utf-8"
    )
    canonical = tmp_path / "backend/alembic"
    canonical.mkdir(parents=True)
    manifest = {
        "readiness_state": "unbaselined",
        "allowed_classifications": sorted(schema_readiness.VALID_CLASSIFICATIONS),
        "canonical_sources": [
            {"path": "backend/alembic", "classification": "retain"},
        ],
        "reset_strategy": {
            "mode": "reset-only", "conversion_allowed": False,
            "legacy_runtime_allowed": False, "dual_read_write_allowed": False,
        },
        "source_reachability": {
            "analyzer": schema_readiness.SOURCE_REACHABILITY_ANALYZER,
            "current_sources": ["backend/alembic"],
            "unreachable_sources": [],
            "reachable_competing_source_count": 0,
        },
        "competing_authority_count": 0,
        "competing_authorities": [],
    }
    manifest_path = tmp_path / "database/schema-source-classification.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    issues = schema_readiness.check_source_classification(
        _authority(), tmp_path, reachable_relations=set()
    )

    assert any(
        issue.code == "unclassified_competing_authority"
        and issue.path == "database/legacy.sql"
        for issue in issues
    )


def test_unreachable_competing_source_defining_a_mounted_relation_fails_closed(
    tmp_path: Path,
):
    legacy = tmp_path / "database/legacy.sql"
    legacy.parent.mkdir(parents=True)
    legacy.write_text(
        "CREATE TABLE sales.legacy_orders (id integer);\n", encoding="utf-8"
    )
    canonical = tmp_path / "backend/alembic"
    canonical.mkdir(parents=True)
    manifest = {
        "readiness_state": "unbaselined",
        "allowed_classifications": sorted(schema_readiness.VALID_CLASSIFICATIONS),
        "canonical_sources": [
            {"path": "backend/alembic", "classification": "retain"},
        ],
        "reset_strategy": {
            "mode": "reset-only", "conversion_allowed": False,
            "legacy_runtime_allowed": False, "dual_read_write_allowed": False,
        },
        "source_reachability": {
            "analyzer": schema_readiness.SOURCE_REACHABILITY_ANALYZER,
            "current_sources": ["backend/alembic"],
            "unreachable_sources": [
                "database/legacy.sql",
            ],
            "reachable_competing_source_count": 0,
        },
        "competing_authority_count": 1,
        "competing_authorities": [{
            "id": "legacy-orders",
            "paths": ["database/legacy.sql"],
            "classification": "retire",
        }],
    }
    path = tmp_path / "database/schema-source-classification.json"
    path.write_text(json.dumps(manifest), encoding="utf-8")

    issues = schema_readiness.check_source_classification(
        _authority(),
        tmp_path,
        reachable_relations={"sales.legacy_orders"},
    )

    assert any(issue.code == "reachable_competing_schema_source" for issue in issues)
    assert any(
        issue.code == "reachable_competing_source_count_mismatch" for issue in issues
    )


def test_default_repository_audit_no_longer_treats_legacy_bootstrap_as_target_model():
    report = schema_readiness.audit_repository(REPO_ROOT)
    codes = {issue.code for issue in report.issues}

    assert "competing_ddl_authority" not in codes
    assert "tenant_table_missing_rls" not in codes
    assert "tenant_table_missing_force_rls" not in codes
    assert "tenant_child_missing_scope" not in codes
    assert "rls_targets_unknown_table" not in codes
    assert "canonical_tenant_table_missing_force_rls" not in codes


def test_competing_ddl_outside_authority_is_reported(tmp_path: Path):
    legacy = tmp_path / "database/MASTER_FIX.sql"
    legacy.parent.mkdir(parents=True)
    legacy.write_text("CREATE TABLE sales.invoices (invoice_id integer);\n", encoding="utf-8")

    issues = schema_readiness.check_competing_ddl(_authority(), tmp_path)

    assert len(issues) == 1
    assert issues[0].code == "competing_ddl_authority"
    assert issues[0].path == "database/MASTER_FIX.sql"


def test_agent_worktrees_are_not_scanned_as_repository_authority(tmp_path: Path):
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


def test_production_ready_claim_rejects_any_blocker():
    report = schema_readiness.ReadinessReport(
        authority_state=schema_readiness.READY_STATE,
        issues=(schema_readiness.Issue("example", "not ready", "database/example.sql"),),
    )

    assert not schema_readiness.validate_readiness_claim(report)


def _valid_transaction_evidence() -> dict:
    return {
        "schema_version": "1.0.0",
        "project_ref": "rgihahbmkrmhitjdjvev",
        "git_commit": "a" * 40,
        "alembic_revision": "test_head",
        "captured_at": "2026-08-26T00:00:00+00:00",
        "runtime_role": {
            "session_user": "erp_runtime",
            "superuser": False,
            "bypass_rls": False,
            "owns_business_relations": False,
        },
        "transaction_checks": {
            "payment_idempotency_unique": True,
            "allocation_table_present": True,
            "allocation_projection_owner": "canonical_database_invariant",
            "bank_reconciliation_contract": "bank_statements_and_reconciliation_matches",
            "posted_journal_immutability": True,
            "order_invoice_generation_owner": "canonical_command_functions",
            "grn_inventory_effect_owner": "canonical_command_functions",
            "finance_rls_enabled_and_forced": True,
        },
    }


def test_transaction_integrity_evidence_is_hash_bound_and_exact_sha(tmp_path: Path):
    version = tmp_path / "backend/alembic/versions/test_head.py"
    version.parent.mkdir(parents=True)
    version.write_text(
        'revision = "test_head"\ndown_revision = None\n', encoding="utf-8"
    )
    artifact = tmp_path / "evidence/transaction.json"
    artifact.parent.mkdir(parents=True)
    artifact.write_text(json.dumps(_valid_transaction_evidence()), encoding="utf-8")
    authority = _authority(
        canonical_staging_project_ref="rgihahbmkrmhitjdjvev",
        canonical_transaction_integrity_evidence={
            "artifact": "evidence/transaction.json",
            "artifact_sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
            "project_ref": "rgihahbmkrmhitjdjvev",
            "git_commit": "a" * 40,
            "alembic_revision": "test_head",
            "reviewer": "release-reviewer",
            "reviewed_at": "2026-08-26T00:01:00+00:00",
        },
    )

    assert not schema_readiness.check_transaction_integrity_evidence(
        authority, tmp_path, required=True
    )

    artifact.write_text(json.dumps({**_valid_transaction_evidence(), "tampered": True}))
    issues = schema_readiness.check_transaction_integrity_evidence(
        authority, tmp_path, required=True
    )

    assert any(
        issue.code == "canonical_transaction_integrity_evidence_hash_mismatch"
        for issue in issues
    )


def test_missing_transaction_integrity_evidence_stays_fail_closed():
    issues = schema_readiness.check_transaction_integrity_evidence(
        _authority(), REPO_ROOT, required=True
    )

    assert [issue.code for issue in issues] == [
        "canonical_transaction_integrity_evidence_missing"
    ]


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

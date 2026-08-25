from __future__ import annotations

import hashlib
import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
SQL_PATH = (
    REPO_ROOT
    / "backend/alembic/sql/20260824_0002_sales_invoice_fefo_expiry_equivalence.sql"
)
MANIFEST_PATH = SQL_PATH.with_suffix(".manifest.json")
REVISION_PATH = (
    REPO_ROOT
    / "backend/alembic/versions/20260824_0002_sales_invoice_fefo_expiry_equivalence.py"
)
POSTGRES_CONTRACT_PATH = (
    REPO_ROOT
    / "database/canonical/commands_automation/head_test_sales_invoice_fefo_equivalence.sql"
)
STAGING_WORKFLOW_PATH = REPO_ROOT / ".github/workflows/canonical-staging.yml"
BASELINE_GATE_PATH = REPO_ROOT / "database/canonical/ci/run_postgres15_gate.sh"
ALEMBIC_GATE_PATH = REPO_ROOT / "database/canonical/ci/run_alembic_postgres15_gate.sh"


def test_fefo_incremental_migration_is_hash_bound_and_linear() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    revision = REVISION_PATH.read_text(encoding="utf-8")
    digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()

    assert manifest == {
        "format_version": 1,
        "revision": "20260824_0002",
        "source_sql_sha256": digest,
        "target_regprocedure": (
            "erp_automation_commands.resolve_sales_invoice_prepare("
            "uuid,uuid,uuid,uuid,uuid,character varying,uuid,jsonb)"
        ),
        "authority_change": "sales_invoice_fefo_expiry_date_equivalence_v1",
    }
    assert 'revision = "20260824_0002"' in revision
    assert 'down_revision = "20260820_0001"' in revision
    assert digest in revision
    assert "CanonicalBaselineError" in revision.split("def downgrade", 1)[1]


def test_fefo_migration_is_surgical_and_fails_closed_on_source_drift() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")
    baseline = (
        REPO_ROOT / "backend/alembic/sql/20260820_0001_canonical_v1.sql"
    ).read_text(encoding="utf-8")
    old_fefo = sql.split("$old_fefo$", 2)[1]
    new_fefo = sql.split("$new_fefo$", 2)[1]

    assert "CREATE OR REPLACE FUNCTION" not in sql
    assert "pg_catalog.pg_get_functiondef" in sql
    assert "pg_catalog.replace(definition,old_fefo,new_fefo)" in sql
    assert "source differs from the reviewed migration precondition" in sql
    assert "SET LOCAL ROLE erp_migration_owner" in sql
    assert "sales_invoice_fefo_expiry_date_equivalence_v1" in sql
    assert "expiry_groups AS (" in sql
    assert "GROUP BY eligible_lot.product_id,eligible_lot.expires_on" in sql
    assert "ORDER BY expiry_group.expires_on" in sql
    assert "ORDER BY batch_row.expires_on,stock.batch_id" in sql.split(
        "old_fefo constant text", 1
    )[1].split("new_fefo constant text", 1)[0]
    assert "ORDER BY batch_row.expires_on,stock.batch_id" not in sql.split(
        "new_fefo constant text", 1
    )[1].split("BEGIN", 1)[0]
    assert baseline.count(old_fefo) == 0
    assert "sales_invoice_fefo_expiry_date_equivalence_v1" in baseline
    assert "ORDER BY batch_row.expires_on,stock.batch_id" not in baseline
    assert "sales_invoice_fefo_expiry_date_equivalence_v1" in new_fefo


def test_fefo_definition_checks_use_regular_strpos_calls() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")
    postgres_contract = POSTGRES_CONTRACT_PATH.read_text(encoding="utf-8")
    staging_workflow = STAGING_WORKFLOW_PATH.read_text(encoding="utf-8")

    assert "pg_catalog.position(" not in sql
    assert "pg_catalog.position(" not in postgres_contract
    assert "pg_catalog.strpos(definition,old_fefo)" in sql
    assert (
        "pg_catalog.strpos(definition,'sales_invoice_fefo_expiry_date_equivalence_v1')"
        in postgres_contract
    )
    assert "pg_catalog.position(" not in staging_workflow
    assert "sales_invoice_fefo_expiry_date_equivalence_v1" in staging_workflow


def test_fefo_postgres_fixture_is_explicitly_head_only() -> None:
    fixture = POSTGRES_CONTRACT_PATH.read_text(encoding="utf-8")
    baseline_gate = BASELINE_GATE_PATH.read_text(encoding="utf-8")
    alembic_gate = ALEMBIC_GATE_PATH.read_text(encoding="utf-8")
    staging_workflow = STAGING_WORKFLOW_PATH.read_text(encoding="utf-8")

    assert POSTGRES_CONTRACT_PATH.name.startswith("head_test_")
    assert "revision 20260824_0002" in fixture
    assert fixture.startswith("\\set ON_ERROR_STOP on")
    assert "BEGIN;" in fixture
    assert fixture.rstrip().endswith("ROLLBACK;")
    assert "-name 'head_test_*.sql'" not in baseline_gate
    assert "-name 'test_*.sql'" in baseline_gate
    assert "-name 'test_*.sql' -o -name 'head_test_*.sql'" in alembic_gate
    assert "-name 'test_*.sql' -o -name 'head_test_*.sql'" in staging_workflow
    assert 'mapfile -t canonical_fixtures' in staging_workflow
    assert 'test "${#canonical_fixtures[@]}" -gt 0' in staging_workflow
    assert 'test "$fixture_count" = "${#canonical_fixtures[@]}"' in staging_workflow


def test_schema_authority_includes_incremental_fefo_package() -> None:
    authority = json.loads(
        (REPO_ROOT / "database/schema-authority.json").read_text(encoding="utf-8")
    )
    required = set(authority["required_migration_files"])

    assert REVISION_PATH.relative_to(REPO_ROOT).as_posix() in required
    assert SQL_PATH.relative_to(REPO_ROOT).as_posix() in required
    assert MANIFEST_PATH.relative_to(REPO_ROOT).as_posix() in required

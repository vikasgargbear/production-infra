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
    assert baseline.count(old_fefo) == 1
    assert "sales_invoice_fefo_expiry_date_equivalence_v1" in new_fefo


def test_schema_authority_includes_incremental_fefo_package() -> None:
    authority = json.loads(
        (REPO_ROOT / "database/schema-authority.json").read_text(encoding="utf-8")
    )
    required = set(authority["required_migration_files"])

    assert REVISION_PATH.relative_to(REPO_ROOT).as_posix() in required
    assert SQL_PATH.relative_to(REPO_ROOT).as_posix() in required
    assert MANIFEST_PATH.relative_to(REPO_ROOT).as_posix() in required

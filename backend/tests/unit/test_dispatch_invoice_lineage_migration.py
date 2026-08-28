from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SQL = ROOT / "backend/alembic/sql/20260829_0051_dispatch_invoice_lineage.sql"
MANIFEST = SQL.with_suffix(".manifest.json")
REVISION = (
    ROOT / "backend/alembic/versions/20260829_0051_dispatch_invoice_lineage.py"
)


def test_dispatch_invoice_lineage_migration_is_hash_bound_and_linear() -> None:
    sql = SQL.read_text(encoding="utf-8")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    revision = REVISION.read_text(encoding="utf-8")
    digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()

    assert manifest == {
        "format_version": 1,
        "revision": "20260829_0051",
        "source_sql_sha256": digest,
        "authority_change": "canonical_dispatch_invoice_lineage_v1",
        "target_regprocedure": (
            "erp_automation_reads.sales_dispatch_post_provenance(uuid,uuid)"
        ),
    }
    assert 'revision = "20260829_0051"' in revision
    assert 'down_revision = "20260829_0050"' in revision
    assert digest in revision


def test_migration_uses_the_canonical_dispatch_resource_type() -> None:
    sql = SQL.read_text(encoding="utf-8")

    assert "canonical_dispatch_invoice_lineage_v1" in sql
    assert "request.target_resource_type = 'dispatch'" in sql
    assert "request.result_resource_type = 'dispatch'" in sql
    assert "request.target_resource_type = 'sales_dispatch'" in sql.split(
        "$old_scope$", 2
    )[1]
    assert "pg_catalog.pg_get_functiondef" in sql
    assert "differs from the reviewed dispatch-lineage precondition" in sql
    assert "CREATE OR REPLACE FUNCTION" not in sql


def test_schema_authority_includes_dispatch_invoice_lineage_package() -> None:
    authority = json.loads(
        (ROOT / "database/schema-authority.json").read_text(encoding="utf-8")
    )
    required = set(authority["required_migration_files"])

    assert SQL.relative_to(ROOT).as_posix() in required
    assert MANIFEST.relative_to(ROOT).as_posix() in required
    assert REVISION.relative_to(ROOT).as_posix() in required

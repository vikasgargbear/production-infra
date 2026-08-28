from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SQL = ROOT / "backend/alembic/sql/20260829_0050_posted_dispatch_fulfillment.sql"
MANIFEST = SQL.with_suffix(".manifest.json")
REVISION = (
    ROOT
    / "backend/alembic/versions/20260829_0050_posted_dispatch_fulfillment.py"
)


def test_posted_dispatch_fulfillment_migration_is_hash_bound_and_linear() -> None:
    sql = SQL.read_text(encoding="utf-8")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    revision = REVISION.read_text(encoding="utf-8")
    digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()

    assert manifest == {
        "format_version": 1,
        "revision": "20260829_0050",
        "source_sql_sha256": digest,
        "authority_change": "posted_dispatch_fulfillment_v1",
        "target_regprocedures": [
            (
                "erp_automation_commands.resolve_sales_dispatch_prepare("
                "uuid,uuid,uuid,uuid,uuid,character varying,uuid,jsonb)"
            ),
            "erp_trade_invariants.guard_dispatch_line()",
        ],
    }
    assert 'revision = "20260829_0050"' in revision
    assert 'down_revision = "20260828_0049"' in revision
    assert digest in revision


def test_migration_counts_only_posted_and_current_dispatch_quantities() -> None:
    sql = SQL.read_text(encoding="utf-8")

    assert "posted_dispatch_fulfillment_ceiling_v1" in sql
    assert "parent.id<>dispatch_id AND parent.status='posted'" in sql
    assert "posted_dispatch_or_current_draft_ceiling_v1" in sql
    assert "(parent.status='posted' OR parent.id=NEW.dispatch_id)" in sql
    assert "pg_catalog.pg_get_functiondef" in sql
    assert "differs from the reviewed posted-fulfillment precondition" in sql
    assert "CREATE OR REPLACE FUNCTION" not in sql


def test_schema_authority_includes_posted_dispatch_package() -> None:
    authority = json.loads(
        (ROOT / "database/schema-authority.json").read_text(encoding="utf-8")
    )
    required = set(authority["required_migration_files"])

    assert SQL.relative_to(ROOT).as_posix() in required
    assert MANIFEST.relative_to(ROOT).as_posix() in required
    assert REVISION.relative_to(ROOT).as_posix() in required

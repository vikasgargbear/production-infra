from __future__ import annotations

import hashlib
import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
SQL = REPO_ROOT / "backend/alembic/sql/20260825_0015_gst_reporting_release_dates.sql"
REVISION = REPO_ROOT / "backend/alembic/versions/20260825_0015_gst_reporting_release_dates.py"
MANIFEST = SQL.with_suffix(".manifest.json")
PG_FIXTURE = (
    REPO_ROOT
    / "database/canonical/commands_regulatory/head_test_gst_reporting_rules_importer.sql"
)


def test_release_date_migration_is_hash_bound_linear_and_narrowly_scoped() -> None:
    sql = SQL.read_text(encoding="utf-8")
    revision = REVISION.read_text(encoding="utf-8")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()

    assert manifest["source_sql_sha256"] == digest
    assert manifest["scope"] == "gst_reporting_rules_only"
    assert manifest["seed_policy"] == "no_data_or_business_defaults"
    assert 'revision = "20260825_0015"' in revision
    assert 'down_revision = "20260825_0014"' in revision
    assert digest in revision
    assert "dataset_kind = 'gst_reporting_rules' OR publication_date <= effective_from" in sql
    assert "effective_to IS NULL OR effective_to >= effective_from" in sql
    assert "reviewed_at <= created_at" in sql
    assert "INSERT" not in sql
    assert sql.startswith("SET LOCAL ROLE erp_migration_owner;")
    assert sql.rstrip().endswith("RESET ROLE;")


def test_postgres_head_fixture_inspects_the_live_constraint() -> None:
    fixture = PG_FIXTURE.read_text(encoding="utf-8")
    assert "reference_data_releases_dates_ck" in fixture
    assert "dataset_kind = ''gst_reporting_rules''" in fixture
    assert "publication_date <= effective_from" in fixture
    assert "effective_to >= effective_from" in fixture
    assert "reviewed_at <= created_at" in fixture


def test_schema_authority_includes_release_date_migration() -> None:
    authority = json.loads(
        (REPO_ROOT / "database/schema-authority.json").read_text(encoding="utf-8")
    )
    required = set(authority["required_migration_files"])

    assert REVISION.relative_to(REPO_ROOT).as_posix() in required
    assert SQL.relative_to(REPO_ROOT).as_posix() in required
    assert MANIFEST.relative_to(REPO_ROOT).as_posix() in required

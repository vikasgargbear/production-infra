from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
SQL = REPO_ROOT / "backend/alembic/sql/20260825_0003_gst_reporting_rules.sql"
REVISION = REPO_ROOT / "backend/alembic/versions/20260825_0003_gst_reporting_rules.py"
MANIFEST = SQL.with_suffix(".manifest.json")
ALEMBIC_GATE = REPO_ROOT / "database/canonical/ci/run_alembic_postgres15_gate.sh"


def test_gst_reporting_rule_migration_is_hash_bound_linear_and_unseeded() -> None:
    sql = SQL.read_text(encoding="utf-8")
    revision = REVISION.read_text(encoding="utf-8")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()

    assert manifest["source_sql_sha256"] == digest
    assert manifest["seed_policy"] == "reviewed_reference_release_required_no_application_default"
    assert 'revision = "20260825_0003"' in revision
    assert 'down_revision = "20260824_0002"' in revision
    assert digest in revision
    assert "INSERT INTO" not in sql
    assert "b2cl_threshold_amount numeric(20,2) NOT NULL" in sql
    assert "effective_from date NOT NULL" in sql
    assert "effective_to date" in sql
    assert "gstr1_reporting_rule_versions_no_overlap_excl" in sql
    assert "daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&" in sql
    assert "gst_reporting_rules" in sql
    assert sql.startswith("SET LOCAL ROLE erp_migration_owner;")
    assert sql.rstrip().endswith("RESET ROLE;")


def test_staging_gate_tracks_the_canonical_head_and_table_count() -> None:
    workflow = (REPO_ROOT / ".github/workflows/canonical-staging.yml").read_text(encoding="utf-8")
    authority = json.loads((REPO_ROOT / "database/schema-authority.json").read_text(encoding="utf-8"))
    required = set(authority["required_migration_files"])

    assert "revision.version_num='20260825_0005'" in workflow
    assert 'version_num? == "20260825_0005"' in workflow
    assert "canonical_table_count: 111" in workflow
    assert REVISION.relative_to(REPO_ROOT).as_posix() in required
    assert SQL.relative_to(REPO_ROOT).as_posix() in required
    assert MANIFEST.relative_to(REPO_ROOT).as_posix() in required


def test_alembic_postgres_gate_is_valid_shell() -> None:
    subprocess.run(["bash", "-n", str(ALEMBIC_GATE)], check=True)

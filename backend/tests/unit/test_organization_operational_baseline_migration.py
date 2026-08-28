from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
REVISION = ROOT / "backend/alembic/versions/20260828_0048_organization_operational_baseline.py"
SQL = ROOT / "backend/alembic/sql/20260828_0048_organization_operational_baseline.sql"


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_operational_baseline_is_linear_and_hash_bound() -> None:
    revision = _load(REVISION, "organization_operational_baseline_revision")
    sql = SQL.read_text(encoding="utf-8")
    assert revision.revision == "20260828_0048"
    assert revision.down_revision == "20260828_0047"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(sql.encode()).hexdigest()


def test_first_organization_gets_atomic_erp_baseline() -> None:
    sql = SQL.read_text(encoding="utf-8")
    for fragment in (
        "provision_organization_operational_baseline",
        "zz_branches_operational_baseline_trg",
        "INSERT INTO finance.accounts",
        "'accounts_receivable','1100'",
        "'accounts_payable','2100'",
        "INSERT INTO core.settings",
        "INSERT INTO inventory.locations",
        "INSERT INTO core.document_sequences",
        "organization operational baseline did not reconcile exactly",
    ):
        assert fragment in sql


def test_backfill_only_touches_genuinely_empty_organizations() -> None:
    sql = SQL.read_text(encoding="utf-8")
    assert "NOT EXISTS(SELECT 1 FROM finance.accounts account WHERE account.org_id=organization.id)" in sql
    assert "UPDATE finance.accounts" not in sql
    assert "DELETE FROM finance.accounts" not in sql
    assert "DELETE FROM core.settings" not in sql

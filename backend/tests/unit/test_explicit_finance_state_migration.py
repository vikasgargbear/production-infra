from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SQL = ROOT / "backend/alembic/sql/20260828_0041_explicit_finance_state.sql"
REVISION = ROOT / "backend/alembic/versions/20260828_0041_explicit_finance_state.py"
GENERATOR = ROOT / "backend/scripts/generate_explicit_finance_state_migration.py"


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_explicit_finance_state_migration_is_linear_hash_bound_and_generated():
    revision = _load(REVISION, "explicit_finance_state_revision")
    generator = _load(GENERATOR, "explicit_finance_state_generator")
    migration = SQL.read_text(encoding="utf-8")
    assert revision.revision == "20260828_0041"
    assert revision.down_revision == "20260828_0040"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(migration.encode()).hexdigest()
    assert generator.render() == migration
    assert migration.rstrip().endswith("RESET ROLE;")


def test_explicit_finance_state_migration_owns_lineage_and_named_transitions():
    migration = SQL.read_text(encoding="utf-8")
    assert "ADD COLUMN source_open_item_id uuid" in migration
    assert "allocations_source_open_item_fk" in migration
    assert "allocations_exact_source_ck" in migration
    for function in (
        "synchronize_open_item_status",
        "mark_journal_reversed",
        "guard_allocation",
        "guard_journal_entry",
        "resolve_inventory_adjustment_prepare",
        "persist_inventory_adjustment_prepare",
    ):
        assert function in migration
    assert 'FROM PUBLIC, "erp_app", "erp_runtime"' in migration
    assert 'TO "erp_runtime"' in migration

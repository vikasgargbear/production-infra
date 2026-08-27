from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SQL = ROOT / "backend/alembic/sql/20260828_0042_commercial_reversal_authority.sql"
REVISION = ROOT / "backend/alembic/versions/20260828_0042_commercial_reversal_authority.py"
GENERATOR = ROOT / "backend/scripts/generate_commercial_reversal_migration.py"


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_commercial_reversal_migration_is_linear_hash_bound_and_frozen():
    revision = _load(REVISION, "commercial_reversal_revision")
    generator = _load(GENERATOR, "commercial_reversal_generator")
    migration = SQL.read_text(encoding="utf-8")
    assert revision.revision == "20260828_0042"
    assert revision.down_revision == "20260828_0041"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(migration.encode()).hexdigest()
    assert generator.render() == migration


def test_commercial_reversal_migration_owns_compensation_and_closed_fences():
    migration = SQL.read_text(encoding="utf-8")
    assert "CREATE TABLE erp_commercial_commands.reversal_scopes" in migration
    assert "allocations_adjustment_note_uq" in migration
    for name in (
        "prepare_sales_return_reversal",
        "prepare_purchase_return_reversal",
        "prepare_adjustment_note_reversal",
        "post_commercial_reversal",
        "execute_approved_commercial_reversal",
        "guard_sales_return_state",
        "guard_purchase_return_state",
        "guard_adjustment_note_companions",
    ):
        assert name in migration
    assert "commercial reversal residual was consumed" in migration
    assert "mark_journal_reversed" in migration
    post_body = migration.split(
        'CREATE OR REPLACE FUNCTION "erp_commercial_commands"."post_commercial_reversal"',
        1,
    )[1].split("ALTER FUNCTION", 1)[0]
    assert post_body.index("erp_trade_commands.claim") < post_body.index(
        "resolve_commercial_reversal_prepare"
    )
    assert 'FROM PUBLIC, "erp_app", "erp_runtime"' in migration
    assert 'TO "erp_app", "erp_runtime"' in migration

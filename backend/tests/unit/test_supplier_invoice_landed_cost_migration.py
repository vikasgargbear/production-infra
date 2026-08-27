from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SQL = ROOT / "backend/alembic/sql/20260827_0034_supplier_invoice_landed_cost_authority.sql"
REVISION = ROOT / "backend/alembic/versions/20260827_0034_supplier_invoice_landed_cost_authority.py"
GENERATOR = ROOT / "backend/scripts/generate_supplier_invoice_landed_cost_migration.py"


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_is_hash_bound_linear_and_generated_from_reviewed_sources():
    revision = _load(REVISION, "supplier_invoice_landed_cost_revision")
    generator = _load(GENERATOR, "supplier_invoice_landed_cost_generator")
    migration = SQL.read_text(encoding="utf-8")
    assert revision.revision == "20260827_0034"
    assert revision.down_revision == "20260827_0033"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(migration.encode()).hexdigest()
    assert generator.generated_sql() == migration
    assert "SET LOCAL ROLE erp_migration_owner" in migration
    assert migration.rstrip().endswith("RESET ROLE;")


def test_migration_owns_explicit_once_only_variance_authority():
    migration = SQL.read_text(encoding="utf-8")
    for function in (
        "total_landed_cost_pool", "eligible_landed_cost_pool",
        "consumed_landed_cost_pool", "prepare_supplier_invoice_landed_cost_adjustment",
        "resolve_role_account", "post_supplier_invoice", "resolve_supplier_invoice_prepare",
        "persist_supplier_invoice_prepare", "execute_approved_command",
    ):
        assert f'CREATE OR REPLACE FUNCTION' in migration
        assert function in migration
    assert "landed_cost_allocation_method" in migration
    assert ") NOT VALID;" in migration
    assert "fully_allocated_receipt" in migration
    assert "receipt stock is partial or co-mingled" in migration
    assert "purchase_price_variance" in migration
    assert "Consumed supplier price or landed-cost variance" in migration
    assert "FOR UPDATE OF balance" in migration
    assert "INSERT INTO inventory.stock_ledger_entries" not in migration
    assert "INSERT INTO inventory.stock_balances" not in migration
    assert 'FROM PUBLIC, "erp_app", "erp_runtime"' in migration

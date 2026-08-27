from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
GENERATOR = ROOT / "backend/scripts/generate_supplier_invoice_transfer_lineage_migration.py"
REVISION = ROOT / "backend/alembic/versions/20260828_0045_supplier_invoice_transfer_lineage.py"
SQL = ROOT / "backend/alembic/sql/20260828_0045_supplier_invoice_transfer_lineage.sql"


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_transfer_lineage_migration_is_linear_hash_bound_and_generated() -> None:
    generator = _load(GENERATOR, "supplier_invoice_transfer_lineage_generator")
    revision = _load(REVISION, "supplier_invoice_transfer_lineage_revision")
    sql = SQL.read_text(encoding="utf-8")
    assert generator.generated_sql() == sql
    assert revision.revision == "20260828_0045"
    assert revision.down_revision == "20260828_0044"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(sql.encode()).hexdigest()


def test_prepare_and_post_share_private_exact_transfer_lineage() -> None:
    sql = SQL.read_text(encoding="utf-8")
    for fragment in (
        "landed_cost_receipt_lineage_state",
        "landed_cost_lineage_state",
        "supplier_invoice_landed_cost_lineage_v1",
        "landed_cost_stock_target",
        "last_ledger_entry_id",
        "prepare_supplier_invoice_landed_cost_adjustment",
    ):
        assert fragment in sql
    for helper in (
        "landed_cost_lineage_from_receipts",
        "landed_cost_receipt_lineage_state",
        "landed_cost_lineage_state",
    ):
        identity = f'"erp_trade_commands_v2"."{helper}"'
        assert f"REVOKE ALL ON FUNCTION {identity}" in sql
        assert not any(
            identity in line and line.startswith("GRANT EXECUTE")
            for line in sql.splitlines()
        )

from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SQL = ROOT / "backend/alembic/sql/20260827_0037_receipt_supplier_settlement.sql"
REVISION = ROOT / "backend/alembic/versions/20260827_0037_receipt_supplier_settlement.py"
GENERATOR = ROOT / "backend/scripts/generate_receipt_supplier_settlement_migration.py"


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_receipt_settlement_migration_is_linear_hash_bound_and_frozen():
    revision = _load(REVISION, "receipt_settlement_revision")
    generator = _load(GENERATOR, "receipt_settlement_generator")
    migration = SQL.read_text(encoding="utf-8")
    assert revision.revision == "20260827_0037"
    assert revision.down_revision == "20260827_0036"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(migration.encode()).hexdigest()
    assert generator.render() == migration


def test_receipt_settlement_migration_owns_instruments_and_named_commands():
    migration = SQL.read_text(encoding="utf-8")
    for column in (
        "related_payment_id", "sales_order_id", "evidence_attachment_id",
        "instrument_number", "instrument_date", "drawee_bank_name",
        "account_payee_confirmed",
    ):
        assert f"{column}" in migration
    for name in (
        "post_customer_receipt", "post_customer_cheque_clearance",
        "post_customer_cheque_bounce", "post_supplier_payment",
        "apply_supplier_adjustment_credit", "resolve_supplier_payment_prepare",
    ):
        assert name in migration
    assert "pre-existing credit-time authority" in migration
    assert "erp_compliance_commands.post_withholding" not in migration
    assert "payments_cash_evidence_ck" in migration
    assert "NOT VALID" in migration
    assert 'TO "erp_runtime"' in migration

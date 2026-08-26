from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SQL = ROOT / "backend/alembic/sql/20260826_0023_partial_input_credit_stock_lineage.sql"
REVISION = ROOT / "backend/alembic/versions/20260826_0023_partial_input_credit_stock_lineage.py"
POSTGRES_GATE = ROOT / "database/canonical/ci/run_alembic_postgres15_gate.sh"


def test_partial_input_credit_migration_is_hash_bound_and_linear() -> None:
    sql = SQL.read_text(encoding="utf-8")
    revision = REVISION.read_text(encoding="utf-8")

    assert hashlib.sha256(sql.encode("utf-8")).hexdigest() in revision
    assert 'revision = "20260826_0023"' in revision
    assert 'down_revision = "20260825_0022"' in revision
    assert "offline reviewed principal" not in revision
    assert "requires an online reviewed principal" in revision


def test_issue_consumes_only_the_exact_input_credit_backed_subset() -> None:
    sql = SQL.read_text(encoding="utf-8")
    consume = sql[sql.index("CREATE OR REPLACE FUNCTION erp_compliance_commands.consume_input_credit_lots") :]
    consume = consume[: consume.index("CREATE OR REPLACE FUNCTION erp_compliance_commands.restore_sales_return_input_credit_lots")]

    assert "applied_total numeric(20,6):=0" in consume
    assert "applied_quantity:=least(remaining_quantity,lot.remaining_base_quantity)" in consume
    assert "applied_total:=applied_total+applied_quantity" in consume
    assert "RETURN applied_total" in consume
    assert "stock issue exceeds exact eligible input-credit lot lineage" not in consume
    assert "input-credit lot changed during deterministic consumption" in consume


def test_sales_return_restores_only_previously_consumed_credit_lineage() -> None:
    sql = SQL.read_text(encoding="utf-8")
    restore = sql[sql.index("CREATE OR REPLACE FUNCTION erp_compliance_commands.restore_sales_return_input_credit_lots") :]

    assert "restored_total numeric(20,6):=0" in restore
    assert "applied_quantity:=least(remaining_quantity,available_quantity)" in restore
    assert "restored_total:=restored_total+applied_quantity" in restore
    assert "RETURN restored_total" in restore
    assert "sales return exceeds exact previously consumed input-credit lineage" not in restore
    assert "sales return would over-restore its exact input-credit source lot" in restore
    assert "input-credit lot changed during deterministic restoration" in restore


def test_revision_loader_accepts_exact_reviewed_sql() -> None:
    spec = importlib.util.spec_from_file_location("partial_itc_migration", REVISION)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    assert module._reviewed_sql() == SQL.read_text(encoding="utf-8")


def test_postgres15_gate_executes_partial_lineage_acceptance() -> None:
    gate = POSTGRES_GATE.read_text(encoding="utf-8")

    assert "backend/tests/postgres/check_partial_input_credit_stock_lineage.py" in gate
    assert "backend/tests/postgres/check_sales_dispatch_partial_input_credit_acceptance.py" in gate


def test_dispatch_acceptance_is_self_contained_for_global_tax_authority() -> None:
    source = (
        ROOT / "backend/tests/postgres/check_sales_dispatch_partial_input_credit_acceptance.py"
    ).read_text(encoding="utf-8")

    assert "if not rows:" in source
    assert "_seed_reference_authority(connection)" in source
    assert "assert len(rows) == 1" in source

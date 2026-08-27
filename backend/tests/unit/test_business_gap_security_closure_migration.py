from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path


ROOT = Path(__file__).parents[3]
GENERATOR = ROOT / "backend/scripts/generate_business_gap_security_closure_migration.py"
SQL = ROOT / "backend/alembic/sql/20260828_0044_business_gap_security_closure.sql"
REVISION = ROOT / "backend/alembic/versions/20260828_0044_business_gap_security_closure.py"


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_business_gap_security_closure_is_hash_bound_and_linear() -> None:
    generator = _load(GENERATOR, "business_gap_security_closure_generator")
    revision = _load(REVISION, "business_gap_security_closure_revision")
    sql = SQL.read_text(encoding="utf-8")

    assert generator.generate_sql() == sql
    assert revision.revision == "20260828_0044"
    assert revision.down_revision == "20260828_0043"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(sql.encode()).hexdigest()
    assert sql.count("CREATE OR REPLACE FUNCTION") == 11
    assert '"erp_core_commands"."current_organization_business_date"()' in sql
    assert "commercial reversal date cannot be in the future" in sql
    for reversal_kind in ("sales_return", "purchase_return", "adjustment_note"):
        assert reversal_kind in sql


def test_inner_mutation_helpers_are_not_runtime_callable() -> None:
    generator = _load(GENERATOR, "commercial_reversal_privilege_generator")
    sql = generator.generate_sql()

    assert len(generator.NON_RUNTIME_FUNCTIONS) == 13
    for identity in generator.NON_RUNTIME_FUNCTIONS:
        assert (
            f"REVOKE ALL ON FUNCTION {identity} "
            'FROM PUBLIC, "erp_app", "erp_runtime"'
        ) in sql
        assert f"GRANT EXECUTE ON FUNCTION {identity}" not in sql


def test_execute_revalidates_consent_and_supplier_credit_uses_business_date() -> None:
    sql = _load(GENERATOR, "commercial_reversal_execute_generator").generate_sql()

    assert "grant_row.status<>'active'" in sql
    assert "capability.operation_mode IS DISTINCT FROM command.operation_mode" in sql
    assert "erp_security.has_permission('automation.command.execute',command.branch_id)" in sql
    assert '"erp_core_commands"."current_organization_business_date"()' in sql
    assert "note.reversal_of_adjustment_note_id IS NOT NULL" in sql


def test_prepare_replays_are_claimed_before_source_resolution() -> None:
    generator = _load(GENERATOR, "commercial_reversal_replay_generator")
    sql = generator.generate_sql()

    assert "pg_advisory_xact_lock" in sql
    for function_name, _signature in generator.REPLAY_FUNCTIONS[1:]:
        start = sql.index(f'CREATE OR REPLACE FUNCTION "erp_automation_commands"."{function_name}"')
        end = sql.find("CREATE OR REPLACE FUNCTION", start + 1)
        definition = sql[start:] if end < 0 else sql[start:end]
        assert definition.index("find_exact_prepare_replay") < definition.index("resolve_")
    start = sql.index('CREATE OR REPLACE FUNCTION "erp_commercial_commands"."persist_commercial_reversal_prepare"')
    definition = sql[start:]
    assert definition.index("find_exact_prepare_replay") < definition.index("resolve_commercial_reversal_prepare")

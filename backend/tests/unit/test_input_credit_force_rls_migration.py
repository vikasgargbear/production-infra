from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SQL = ROOT / "backend/alembic/sql/20260826_0024_force_input_credit_rls.sql"
REVISION = ROOT / "backend/alembic/versions/20260826_0024_force_input_credit_rls.py"
GATE = ROOT / "database/canonical/ci/run_alembic_postgres15_gate.sh"

RELATIONS = (
    "tax.input_credit_lots",
    "tax.input_credit_reversal_events",
    "tax.input_credit_applications",
)


def test_input_credit_force_rls_migration_is_hash_bound_and_linear() -> None:
    sql = SQL.read_text(encoding="utf-8")
    revision = REVISION.read_text(encoding="utf-8")

    assert hashlib.sha256(sql.encode("utf-8")).hexdigest() in revision
    assert 'revision = "20260826_0024"' in revision
    assert 'down_revision = "20260826_0023"' in revision
    assert "requires an online reviewed principal" in revision
    assert "downgrade is intentionally unavailable" in revision


def test_migration_forces_only_the_three_reviewed_tenant_relations() -> None:
    migration = SQL.read_text(encoding="utf-8")

    for relation in RELATIONS:
        assert migration.count(f"ALTER TABLE {relation} FORCE ROW LEVEL SECURITY;") == 1
    assert "DISABLE ROW LEVEL SECURITY" not in migration
    assert "NO FORCE ROW LEVEL SECURITY" not in migration
    assert "relation_count<>3" in migration
    assert "relation.relrowsecurity AND relation.relforcerowsecurity" in migration


def test_migration_preserves_reviewed_command_owner_and_blocks_direct_runtime_dml() -> None:
    migration = SQL.read_text(encoding="utf-8")

    assert "owner_role.rolname='erp_migration_owner'" in migration
    assert "role.rolbypassrls" in migration
    assert "NOT role.rolcanlogin" in migration
    for principal in ("erp_app", "erp_runtime"):
        for privilege in ("INSERT", "UPDATE", "DELETE"):
            assert f"has_table_privilege('{principal}',target.qualified_name,'{privilege}')" in migration


def test_revision_loader_accepts_exact_reviewed_sql() -> None:
    spec = importlib.util.spec_from_file_location("input_credit_force_rls", REVISION)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    assert module._reviewed_sql() == SQL.read_text(encoding="utf-8")


def test_postgres_gate_proves_forced_rls_and_existing_mutation_lifecycles() -> None:
    gate = GATE.read_text(encoding="utf-8")

    assert "backend/tests/postgres/check_input_credit_force_rls.py" in gate
    assert "backend/tests/postgres/check_sales_dispatch_partial_input_credit_acceptance.py" in gate
    assert "backend/tests/postgres/check_partial_input_credit_stock_lineage.py" in gate

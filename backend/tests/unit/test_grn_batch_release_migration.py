from __future__ import annotations

import hashlib
import importlib.util
import json
import ast
from pathlib import Path


ROOT = Path(__file__).parents[3]
SQL = ROOT / "backend/alembic/sql/20260829_0059_grn_batch_release.sql"
REVISION = ROOT / "backend/alembic/versions/20260829_0059_grn_batch_release.py"
GENERATOR = ROOT / "backend/scripts/generate_grn_batch_release_migration.py"


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _constant(path: Path, name: str):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == name for target in node.targets
        ):
            return ast.literal_eval(node.value)
    raise AssertionError(f"missing constant {name}")


def test_grn_batch_release_migration_is_generated_hash_bound_and_linear() -> None:
    generator = _load(GENERATOR, "grn_batch_release_generator")
    assert SQL.read_text(encoding="utf-8") == generator.render()
    assert _constant(REVISION, "revision") == "20260829_0059"
    assert _constant(REVISION, "down_revision") == "20260829_0058"
    assert _constant(REVISION, "EXPECTED_SQL_SHA256") == hashlib.sha256(SQL.read_bytes()).hexdigest()


def test_grn_batch_release_is_atomic_bounded_and_not_directly_bypassable() -> None:
    sql = SQL.read_text(encoding="utf-8")
    post_at = sql.index("PERFORM erp_trade_commands.post_locked_document")
    scope_at = sql.index("'goods_receipt_batch_release'", post_at)
    release_at = sql.index("SET status='released'", scope_at)
    receipt_at = sql.index("UPDATE procurement.goods_receipts SET status='posted'", release_at)
    assert post_at < scope_at < release_at < receipt_at
    assert "qc_status IN ('accepted','partial')" in sql
    assert "base_accepted_quantity+receipt_line.base_free_quantity>0" in sql
    assert "location.location_type IN ('saleable','cold_storage')" in sql
    assert "OLD.status='quarantined' AND NEW.status='released'" in sql
    assert "batch release requires exact posted goods-receipt command provenance" in sql
    assert "REVOKE ALL ON TABLE erp_trade_commands.command_scopes" in sql


def test_grn_batch_release_files_are_schema_authority_and_runtime_head() -> None:
    authority = json.loads((ROOT / "database/schema-authority.json").read_text())
    required = set(authority["required_migration_files"])
    assert "backend/alembic/versions/20260829_0059_grn_batch_release.py" in required
    assert "backend/alembic/sql/20260829_0059_grn_batch_release.sql" in required
    assert "backend/scripts/generate_grn_batch_release_migration.py" in required
    deployment = ROOT / "backend/app/infrastructure/operator_actions/deployment_contract.py"
    assert _constant(deployment, "EXPECTED_CANONICAL_ALEMBIC_HEAD") == "20260829_0060"

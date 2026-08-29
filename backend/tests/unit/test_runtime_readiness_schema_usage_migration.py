from __future__ import annotations

import ast
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SQL = ROOT / "backend/alembic/sql/20260829_0060_runtime_readiness_schema_usage.sql"
REVISION = (
    ROOT
    / "backend/alembic/versions/20260829_0060_runtime_readiness_schema_usage.py"
)


def _constant(path: Path, name: str) -> str:
    module = ast.parse(path.read_text(encoding="utf-8"))
    for node in module.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == name:
                    value = ast.literal_eval(node.value)
                    assert isinstance(value, str)
                    return value
    raise AssertionError(f"missing {name}")


def test_migration_is_linear_hash_bound_and_declared() -> None:
    sql = SQL.read_text(encoding="utf-8")
    assert _constant(REVISION, "revision") == "20260829_0060"
    assert _constant(REVISION, "down_revision") == "20260829_0059"
    assert _constant(REVISION, "EXPECTED_SQL_SHA256") == hashlib.sha256(
        sql.encode("utf-8")
    ).hexdigest()

    authority = json.loads(
        (ROOT / "database/schema-authority.json").read_text(encoding="utf-8")
    )
    required = authority["required_migration_files"]
    assert SQL.relative_to(ROOT).as_posix() in required
    assert REVISION.relative_to(ROOT).as_posix() in required


def test_runtime_gets_only_the_access_needed_to_call_exact_head_readiness() -> None:
    sql = SQL.read_text(encoding="utf-8")
    assert "SET LOCAL ROLE erp_migration_owner" in sql
    assert "GRANT USAGE ON SCHEMA erp_security TO erp_runtime" in sql
    assert (
        "GRANT EXECUTE ON FUNCTION erp_security.deployed_canonical_revision()"
        in sql
    )
    assert "GRANT SELECT ON TABLE public.alembic_version TO erp_runtime" not in sql
    assert "GRANT erp_app TO erp_runtime" not in sql


def test_generated_canonical_security_contract_keeps_direct_runtime_usage() -> None:
    generator = (
        ROOT / "database/canonical/security/generate_security_contract.py"
    ).read_text(encoding="utf-8")
    generated = (
        ROOT / "database/canonical/security/canonical_rls.sql"
    ).read_text(encoding="utf-8")
    grant = (
        'GRANT USAGE ON SCHEMA "erp_security" TO "erp_app", "erp_runtime";'
    )
    assert grant in generator
    assert grant in generated

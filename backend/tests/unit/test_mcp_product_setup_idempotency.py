from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).parents[3]
SQL = ROOT / "backend/alembic/sql/20260829_0055_mcp_product_setup_idempotency.sql"
REVISION = ROOT / "backend/alembic/versions/20260829_0055_mcp_product_setup_idempotency.py"


def _load(path: Path):
    spec = importlib.util.spec_from_file_location("mcp_product_setup_revision", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_is_hash_bound_and_linear() -> None:
    revision = _load(REVISION)
    source = SQL.read_bytes()

    assert revision.revision == "20260829_0055"
    assert revision.down_revision == "20260829_0054"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(source).hexdigest()
    assert revision._reviewed_sql().encode("utf-8") == source


def test_setup_wrapper_is_exactly_replay_safe_and_reuses_canonical_setup() -> None:
    sql = SQL.read_text(encoding="utf-8")

    assert "CREATE FUNCTION erp_master_commands.configure_product_draft_idempotent" in sql
    assert "erp_core_commands.assert_context(" in sql
    assert "erp_core_commands.claim(" in sql
    assert "erp_master_commands.configure_product_draft(" in sql
    assert "erp_core_commands.finish_claim(" in sql
    assert "claim.resource_id IS DISTINCT FROM product_identifier" in sql
    assert "response_document:=pg_catalog.convert_from(claim.response_body,'UTF8')::jsonb" in sql
    assert "idempotency_replayed:=true" in sql
    assert "'product_name',configured.product_name" in sql
    assert "GRANT EXECUTE ON FUNCTION erp_master_commands.configure_product_draft_idempotent" in sql
    assert ") TO erp_runtime;" in sql
    assert "TO erp_app" not in sql


def test_schema_authority_and_runtime_head_include_the_wrapper() -> None:
    authority = json.loads(
        (ROOT / "database/schema-authority.json").read_text(encoding="utf-8")
    )
    required = set(authority["required_migration_files"])
    assert "backend/alembic/versions/20260829_0055_mcp_product_setup_idempotency.py" in required
    assert "backend/alembic/sql/20260829_0055_mcp_product_setup_idempotency.sql" in required

    from app.infrastructure.operator_actions.deployment_contract import (
        EXPECTED_CANONICAL_ALEMBIC_HEAD,
    )

    assert EXPECTED_CANONICAL_ALEMBIC_HEAD == "20260830_0067"

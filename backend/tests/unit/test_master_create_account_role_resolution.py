from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).parents[3]
MIGRATION = (
    ROOT
    / "backend/alembic/sql/20260829_0057_master_create_account_role_resolution.sql"
)
REVISION = (
    ROOT
    / "backend/alembic/versions/20260829_0057_master_create_account_role_resolution.py"
)
GENERATOR = (
    ROOT
    / "backend/scripts/generate_master_create_account_role_resolution_migration.py"
)


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_master_create_role_migration_is_generated_hash_bound_and_single_head() -> None:
    generator = _load(GENERATOR, "master_create_role_generator")
    revision = _load(REVISION, "master_create_role_revision")

    assert MIGRATION.read_text(encoding="utf-8") == generator.render()
    assert revision.revision == "20260829_0057"
    assert revision.down_revision == "20260829_0056"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(MIGRATION.read_bytes()).hexdigest()


def test_customer_and_supplier_creation_use_exact_canonical_account_roles() -> None:
    sql = MIGRATION.read_text(encoding="utf-8")

    assert sql.count("erp_commercial_commands.resolve_role_account(") == 2
    assert (
        "organization_id,NULL::uuid,'accounts_receivable','asset','INR',true"
        in sql
    )
    assert (
        "organization_id,NULL::uuid,'accounts_payable','liability','INR',true"
        in sql
    )
    assert "exactly one customer receivable posting account is required" not in sql
    assert "exactly one supplier payable posting account is required" not in sql
    assert "FROM finance.accounts account" not in sql


def test_master_create_role_files_are_canonical_authority_and_deployed_head() -> None:
    authority = json.loads(
        (ROOT / "database/schema-authority.json").read_text(encoding="utf-8")
    )
    required = set(authority["required_migration_files"])

    assert (
        "backend/alembic/versions/20260829_0057_master_create_account_role_resolution.py"
        in required
    )
    assert (
        "backend/alembic/sql/20260829_0057_master_create_account_role_resolution.sql"
        in required
    )
    assert (
        "backend/scripts/generate_master_create_account_role_resolution_migration.py"
        in required
    )

    from app.infrastructure.operator_actions.deployment_contract import (
        EXPECTED_CANONICAL_ALEMBIC_HEAD,
    )

    assert EXPECTED_CANONICAL_ALEMBIC_HEAD == "20260831_0074"

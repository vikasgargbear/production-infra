from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path
import sys


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
GENERATOR_PATH = (
    REPOSITORY_ROOT
    / "backend/scripts/generate_finance_business_date_context_migration.py"
)
MIGRATION_PATH = (
    REPOSITORY_ROOT
    / "backend/alembic/versions/20260828_0035_finance_business_date_context.py"
)
SQL_PATH = (
    REPOSITORY_ROOT
    / "backend/alembic/sql/20260828_0035_finance_business_date_context.sql"
)


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def test_finance_business_date_context_package_is_exact_and_self_contained() -> None:
    generator = _load(GENERATOR_PATH, "finance_business_date_context_generator")
    generated = generator.generate_sql()

    assert generated == SQL_PATH.read_text(encoding="utf-8")
    assert generated.count(
        'CREATE OR REPLACE FUNCTION "erp_automation_commands"."resolve_'
    ) == 3
    assert generated.count(
        "PERFORM erp_security.activate_context(auth_user_id,organization_id);"
    ) == 3
    assert generated.count(
        '"erp_core_commands"."current_organization_business_date"()'
    ) == 3

    migration = _load(MIGRATION_PATH, "finance_business_date_context_migration")
    assert migration.revision == "20260828_0035"
    assert migration.down_revision == "20260828_0034"
    assert hashlib.sha256(generated.encode("utf-8")).hexdigest() == (
        migration.EXPECTED_SQL_SHA256
    )

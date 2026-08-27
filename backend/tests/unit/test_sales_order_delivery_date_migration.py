from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path
import sys


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
GENERATOR_PATH = (
    REPOSITORY_ROOT / "backend/scripts/generate_sales_order_delivery_date_migration.py"
)
MIGRATION_PATH = (
    REPOSITORY_ROOT
    / "backend/alembic/versions/20260828_0036_sales_order_delivery_date.py"
)
SQL_PATH = (
    REPOSITORY_ROOT
    / "backend/alembic/sql/20260828_0036_sales_order_delivery_date.sql"
)


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def test_sales_order_delivery_date_package_is_exact_and_linear() -> None:
    generator = _load(GENERATOR_PATH, "sales_order_delivery_date_generator")
    generated = generator.generate_sql()

    assert generated == SQL_PATH.read_text(encoding="utf-8")
    assert generated.count(
        'CREATE OR REPLACE FUNCTION "erp_automation_commands".'
    ) == 2
    assert (
        "requested_delivery_date date := "
        "NULLIF(request_document->>'requested_delivery_date','')::date"
    ) in generated
    assert "requested_delivery_date<order_date" in generated
    assert "row_version=delivery_address_row_version" in generated
    assert "selected delivery address lacks exact supported India address facts" in generated
    assert "requested_delivery_date,status" in generated
    assert "(resolved_document->>'requested_delivery_date')::date,'submitted'" in generated

    migration = _load(MIGRATION_PATH, "sales_order_delivery_date_migration")
    assert migration.revision == "20260828_0036"
    assert migration.down_revision == "20260828_0035"
    assert hashlib.sha256(generated.encode("utf-8")).hexdigest() == (
        migration.EXPECTED_SQL_SHA256
    )

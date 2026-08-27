from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path


ROOT = Path(__file__).parents[3]
GENERATOR = ROOT / "backend/scripts/generate_sales_invoice_product_identity_migration.py"
SQL_PATH = ROOT / "backend/alembic/sql/20260828_0037_sales_invoice_product_identity.sql"
REVISION_PATH = (
    ROOT
    / "backend/alembic/versions/20260828_0037_sales_invoice_product_identity.py"
)
def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_product_identity_migration_is_generator_owned_and_hash_bound() -> None:
    generator = _load(GENERATOR, "sales_invoice_product_identity_generator")
    revision = _load(REVISION_PATH, "sales_invoice_product_identity_revision")
    sql = SQL_PATH.read_text(encoding="utf-8")

    assert generator.generate_sql() == sql
    assert revision.revision == "20260828_0037"
    assert revision.down_revision == "20260828_0036"
    assert hashlib.sha256(sql.encode()).hexdigest() == revision.EXPECTED_SQL_SHA256
    assert generator.FUNCTION_DEFINITION in sql


def test_product_identity_is_read_for_exact_resolved_product_versions() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")

    for fragment in (
        "resolve_sales_invoice_product_identities",
        "organization_id IS DISTINCT FROM erp_security.current_org_id()",
        "product.id=requested.product_id",
        "product.row_version=requested.product_row_version",
        "'product_code',matched.product_code",
        "'product_name',matched.product_name",
    ):
        assert fragment in sql
    assert "GRANT SELECT" not in sql
    assert "TO erp_calculator" in sql
    assert "TO erp_runtime" not in sql.split("GRANT EXECUTE", 1)[-1]

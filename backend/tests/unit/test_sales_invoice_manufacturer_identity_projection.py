from __future__ import annotations

import hashlib
import importlib.util
import inspect
from pathlib import Path

from app.api.routes import canonical_erp_reads


ROOT = Path(__file__).parents[3]
SOURCE = (
    ROOT
    / "database/canonical/operations/automation/sales_invoice_product_identity.sql"
)
GENERATOR = (
    ROOT / "backend/scripts/generate_sales_invoice_manufacturer_identity_migration.py"
)
MIGRATION_SQL = (
    ROOT / "backend/alembic/sql/20260829_0063_sales_invoice_manufacturer_identity.sql"
)
REVISION = (
    ROOT
    / "backend/alembic/versions/20260829_0063_sales_invoice_manufacturer_identity.py"
)


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_projection_has_one_reviewed_source_and_hash_bound_linear_migration() -> None:
    generator = _load(GENERATOR, "sales_invoice_manufacturer_identity_generator")
    revision = _load(REVISION, "sales_invoice_manufacturer_identity_revision")
    migration = MIGRATION_SQL.read_bytes()

    assert generator.render().encode("utf-8") == migration
    assert revision.revision == "20260829_0063"
    assert revision.down_revision == "20260829_0062"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(migration).hexdigest()


def test_projection_binds_manufacturer_to_the_exact_command_product_version() -> None:
    source = SOURCE.read_text(encoding="utf-8")
    route = inspect.getsource(canonical_erp_reads._canonical_invoice_detail)

    assert "manufacturer_name text" in source
    assert (
        "DROP FUNCTION erp_automation_reads.sales_invoice_product_identity(uuid,uuid);"
        in source
    )
    assert "product.row_version = reference.product_row_version" in source
    assert "manufacturer.org_id = product.org_id" in source
    assert "manufacturer.id = product.manufacturer_party_id" in source
    assert "pg_catalog.btrim(manufacturer.legal_name) <> ''" in source
    assert "(SELECT count(*) FROM canonical_identity) = (" in source
    assert "identity.manufacturer_name" in route
    assert "automation.command_requests" not in route
    assert "FROM catalog.products" not in route

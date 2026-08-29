from __future__ import annotations

import hashlib
import importlib.util
import inspect
from pathlib import Path

from app.api.routes import canonical_erp_reads
from app.api.routes.internal import mcp_master_commands, mcp_master_contract


ROOT = Path(__file__).resolve().parents[3]
SQL = ROOT / "backend/alembic/sql/20260829_0062_product_reference_masters.sql"
REVISION = ROOT / "backend/alembic/versions/20260829_0062_product_reference_masters.py"


def _load(path: Path):
    spec = importlib.util.spec_from_file_location("product_reference_revision", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_hash_bound_linear_reference_master_migration():
    revision = _load(REVISION)
    assert revision.revision == "20260829_0062"
    assert revision.down_revision == "20260829_0061"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(SQL.read_bytes()).hexdigest()


def test_manufacturer_is_distinct_from_supplier_and_categories_are_not_seeded():
    sql = SQL.read_text(encoding="utf-8")
    options = inspect.getsource(canonical_erp_reads.product_setup_options)
    assert "CREATE TABLE catalog.manufacturers" in sql
    assert "GRANT SELECT ON TABLE catalog.manufacturers TO erp_app,erp_runtime" in sql
    assert "INSERT INTO catalog.manufacturers" in sql
    assert "JOIN catalog.products product" not in sql
    assert "SELECT DISTINCT product.org_id" in sql
    assert "Analgesics" not in sql and "Medicines" not in sql
    assert "JOIN parties.supplier_accounts" not in options
    assert "FROM catalog.manufacturers manufacturer" in options
    assert "IF SESSION_USER='erp_runtime'" in sql
    assert "guard_product_manufacturer_reference" in sql
    assert "normalized_name,'draft',actor_id,actor_id" in sql
    assert "UPDATE parties.parties AS party" in sql
    assert "row_version=party.row_version+1" in sql
    assert "SET status='active'" in sql


def test_rest_and_mcp_share_exact_reference_create_authority():
    route = inspect.getsource(canonical_erp_reads._execute_product_reference_create)
    mcp = inspect.getsource(mcp_master_commands)
    assert "erp_master_commands.{function_name}" in route
    assert "_execute_product_reference_create" in mcp
    assert mcp_master_contract.master_write_policy_for(
        "catalog.product_category.create"
    ).permission == "catalog.product.manage"
    assert mcp_master_contract.master_write_policy_for(
        "catalog.product_manufacturer.create"
    ).permission == "catalog.product.manage"


def test_reference_contract_has_no_batch_or_commercial_facts():
    category = set(
        canonical_erp_reads.CanonicalProductCategoryCreate.model_json_schema()[
            "properties"
        ]
    )
    manufacturer = set(
        canonical_erp_reads.CanonicalProductManufacturerCreate.model_json_schema()[
            "properties"
        ]
    )
    category_readback = set(
        canonical_erp_reads.CanonicalProductCategoryReadback.model_json_schema()["properties"]
    )
    manufacturer_readback = set(
        canonical_erp_reads.CanonicalProductManufacturerReadback.model_json_schema()["properties"]
    )
    setup_options = set(
        canonical_erp_reads.CanonicalProductSetupOptionsReadback.model_json_schema()[
            "properties"
        ]
    )
    assert category == {"name"}
    assert manufacturer == {"legal_name"}
    assert category_readback == {
        "category_id", "code", "name", "parent_id", "row_version",
        "idempotency_replayed",
    }
    assert manufacturer_readback == {
        "manufacturer_party_id", "legal_name", "row_version",
        "idempotency_replayed",
    }
    assert setup_options == {
        "business_date", "categories", "units", "manufacturers",
        "ingredient_reference_ready", "hsn_reference_ready",
    }
    assert not (
        {"batch_number", "expiry_date", "mrp", "cost", "quantity"}
        & (category | manufacturer)
    )

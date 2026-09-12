from pathlib import Path
import hashlib
import inspect

from app.api.routes import canonical_erp_reads
from app.api.routes.internal import mcp_canonical_resolution_reads

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "database/canonical/operations/automation/migrated_batch_sale_rate.sql"


def test_migration_package_matches_single_source_owner():
    source = SOURCE.read_text()
    sql = (ROOT / "backend/alembic/sql/20260913_0078_migrated_sale_rate.sql").read_text()
    revision = (ROOT / "backend/alembic/versions/20260913_0078_migrated_sale_rate.py").read_text()
    assert source in sql
    assert hashlib.sha256(sql.encode()).hexdigest() in revision


def test_rest_and_mcp_share_rate_authority_not_mrp_or_cost():
    for function in (canonical_erp_reads.product_batches,
                     mcp_canonical_resolution_reads.canonical_stock_batch_search):
        source = inspect.getsource(function)
        assert "erp_automation_reads.migrated_batch_sale_rate(" in source
        assert "selling_rate.sale_price_per_unit" in source
        assert "selling_rate.sale_price_source" in source
    sql = SOURCE.read_text()
    assert "unit_cost" not in sql
    assert "batch.mrp" not in sql
    assert "SET row_security = on" in sql
    assert "erp_security.can_access_branch(selected_branch_id)" in sql
    assert "c.uom=c.base_uom_code" in sql
    assert "line.payload->>'price_basis'='tax_exclusive'" in sql


def test_missing_rate_is_optional_not_zero_in_mcp_contract():
    fields = mcp_canonical_resolution_reads.StockBatchMatch.model_fields
    assert fields["sale_price_per_unit"].default is None
    assert fields["sale_price_source"].default is None

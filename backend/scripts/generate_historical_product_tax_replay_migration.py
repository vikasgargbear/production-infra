"""Forward replay repair; the original 0077 source and migration stay frozen."""
import argparse
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "database/canonical/operations/automation/historical_product_tax_replay.sql"
BASE = ROOT / "database/canonical/operations/automation/historical_product_inventory_cutover.sql"
OUTPUT = ROOT / "backend/alembic/sql/20260917_0080_historical_product_tax_replay.sql"


def render():
    sql = BASE.read_text()
    anchor = "  FOR product_fact IN\n"
    assert sql.count(anchor) == 1
    sql = sql.replace(anchor, SOURCE.read_text() + "\n" + anchor, 1)
    # Only the original new-product loop uses the remaining batch allowance.
    marker = "AND binding.source_fact_id IS NULL\n   ORDER BY fact.id LIMIT batch_size"
    assert marker in sql
    sql = sql.replace(marker, marker.replace("LIMIT batch_size", "LIMIT (batch_size-replayed)"))
    count_anchor = "  SET CONSTRAINTS ALL IMMEDIATE;\n  RETURN pg_catalog.jsonb_build_object("
    assert sql.count(count_anchor) == 1
    sql = sql.replace(count_anchor, """  SELECT products_remaining+count(*) INTO products_remaining
    FROM automation.historical_product_bindings binding
    JOIN catalog.products product ON product.org_id=binding.org_id AND product.id=binding.product_id
    WHERE binding.org_id=organization_id AND binding.dataset_id=reviewed_dataset_id
      AND product.status='active' AND product.setup_review_required
      AND NOT EXISTS (SELECT 1 FROM tax.tax_code_versions version
        WHERE version.org_id=organization_id AND version.product_id=product.id);
""" + count_anchor)
    return "SET LOCAL ROLE erp_migration_owner;\n" + sql + "\nRESET ROLE;\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    sql = render()
    if args.check:
        assert OUTPUT.read_text() == sql
    else:
        OUTPUT.write_text(sql)
    print(hashlib.sha256(sql.encode()).hexdigest())

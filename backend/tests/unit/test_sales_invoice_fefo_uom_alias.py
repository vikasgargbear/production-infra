from __future__ import annotations

import hashlib
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
SQL = REPO_ROOT / "backend/alembic/sql/20260825_0018_sales_invoice_fefo_uom_alias.sql"
REVISION = REPO_ROOT / "backend/alembic/versions/20260825_0018_sales_invoice_fefo_uom_alias.py"
GENERATOR = REPO_ROOT / "database/canonical/commands_automation/generate_automation_commands.py"
INVENTORY_GENERATOR = REPO_ROOT / "database/canonical/commands_trade/generate_trade_commands_contract.py"
INVENTORY_SQL = REPO_ROOT / "backend/alembic/sql/20260825_0019_sales_invoice_multibatch_inventory.sql"
INVENTORY_REVISION = REPO_ROOT / "backend/alembic/versions/20260825_0019_sales_invoice_multibatch_inventory.py"


def test_fefo_uom_alias_migration_is_hash_bound_and_current() -> None:
    sql = SQL.read_text(encoding="utf-8")
    revision = REVISION.read_text(encoding="utf-8")
    generator = GENERATOR.read_text(encoding="utf-8")

    assert hashlib.sha256(sql.encode("utf-8")).hexdigest() in revision
    assert 'revision = "20260825_0018"' in revision
    assert 'down_revision = "20260825_0017"' in revision
    assert "sales_invoice_fefo_expiry_date_equivalence_v3" in sql
    assert "sales_invoice_fefo_expiry_date_equivalence_v3" in generator
    assert "JOIN catalog.uom_conversions requested_conversion" in sql
    assert "JOIN catalog.uom_conversions requested_conversion" in generator
    assert "requested_conversion.multiplier" in generator
    assert "fefo_eligible AS" in generator
    assert "FROM fefo_eligible JOIN totals" in generator
    assert "definition_sha256:=pg_catalog.encode(extensions.digest(" in sql
    assert (
        "1c3e7b3c0be0312bf18eda68ae177604a960734ffe87a6b56a8d6331068e21e1"
        in sql
    )
    assert (
        "JOIN catalog.uom_conversions conversion ON "
        "conversion.org_id=organization_id"
    ) not in generator


def test_multibatch_invoice_inventory_lineage_is_hash_bound_and_aggregated() -> None:
    sql = INVENTORY_SQL.read_text(encoding="utf-8")
    revision = INVENTORY_REVISION.read_text(encoding="utf-8")
    generator = INVENTORY_GENERATOR.read_text(encoding="utf-8")

    assert hashlib.sha256(sql.encode("utf-8")).hexdigest() in revision
    assert 'revision = "20260825_0019"' in revision
    assert 'down_revision = "20260825_0018"' in revision
    assert "sales_invoice_multibatch_inventory_lineage_v1" in sql
    assert "sales_invoice_multibatch_inventory_lineage_v1" in generator
    assert "sibling.sales_invoice_line_id=invoice_line.id" in generator
    assert "definition_sha256:=pg_catalog.encode(extensions.digest(" in sql
    assert (
        "7ded2c77a3a18d3ef9ca37d5366c16656c56ed44b12929e47fda3ba3f7be5a5b"
        in sql
    )
    assert (
        "invoice_line.base_billed_quantity+invoice_line.base_free_quantity="
        "line.base_quantity"
    ) not in generator

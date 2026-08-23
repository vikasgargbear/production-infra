from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SQL_PATH = ROOT / "backend/scripts/sql/canonical_conversion_preflight.sql"
WORKFLOW_PATH = ROOT / ".github/workflows/canonical-conversion-preflight.yml"


def test_conversion_preflight_is_one_aggregate_only_read_query() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")
    assert sql.lstrip().startswith("WITH source_counts AS (")
    assert sql.count(";") == 1
    assert "current_setting('transaction_read_only')" in sql
    assert "canonical_conversion_preflight" in sql
    assert not re.search(
        r"(?im)^\s*(?:ALTER|CALL|COPY|CREATE|DELETE|DO|DROP|GRANT|INSERT|"
        r"MERGE|REVOKE|TRUNCATE|UPDATE)\b",
        sql,
    )
    for section in (
        "source_counts",
        "orphan_counts",
        "zero_line_headers",
        "duplicate_document_number_groups",
        "validation_counts",
        "status_counts",
        "contact_counts",
        "exact_totals",
    ):
        assert f"'{section}'" in sql

    for exact_value in (
        "sum(final_amount)",
        "sum(invoice_total)",
        "sum(payment_amount)",
        "sum(allocated_amount)",
        "sum(quantity_available * coalesce(unit_cost,0))",
    ):
        assert exact_value in sql


def test_conversion_preflight_covers_every_counted_business_flow() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")
    for relation in (
        "parties.customers",
        "parties.suppliers",
        "inventory.batches",
        "inventory.inventory_movements",
        "inventory.location_wise_stock",
        "sales.orders",
        "sales.order_items",
        "sales.delivery_challans",
        "sales.delivery_challan_items",
        "sales.invoices",
        "sales.invoice_items",
        "sales.sales_returns",
        "sales.sales_return_items",
        "procurement.purchase_orders",
        "procurement.purchase_order_items",
        "procurement.goods_receipt_notes",
        "procurement.grn_items",
        "procurement.supplier_invoices",
        "procurement.supplier_invoice_items",
        "procurement.purchase_returns",
        "procurement.purchase_return_items",
        "financial.payments",
        "financial.allocations",
    ):
        assert relation in sql


def test_conversion_preflight_workflow_cannot_write_to_production() -> None:
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
    assert "SOURCE_PROJECT_REF: jfrairkkzxwkhbtqejnz" in workflow
    assert workflow.count("/database/query/read-only") == 1
    assert "/database/query\"" not in workflow
    assert "PSYCOPG_DATABASE_URL" not in workflow
    assert "SUPABASE_DB_PASSWORD" not in workflow
    assert "canonical-conversion-preflight.json" in workflow
    assert "retention-days: 7" in workflow
    assert "workflow_call:" in workflow
    assert "environment: canonical-staging" in workflow
    assert "title=Canonical conversion preflight - $section" in workflow
    assert "to_entries[] | [.key, (.value | tojson)] | @tsv" in workflow

    production_workflow = (
        ROOT / ".github/workflows/production-readiness.yml"
    ).read_text(encoding="utf-8")
    assert "run_conversion_preflight:" in production_workflow
    assert "inputs.run_conversion_preflight" in production_workflow
    assert "uses: ./.github/workflows/canonical-conversion-preflight.yml" in production_workflow

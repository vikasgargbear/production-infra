from __future__ import annotations

import hashlib
from pathlib import Path

from scripts.generate_sales_invoice_auto_fefo_migration import (
    CURRENT_DEFINITION_SHA256,
    LEGACY_DEFINITION_SHA256,
    generate_sql,
)


ROOT = Path(__file__).resolve().parents[3]
SQL_PATH = ROOT / "backend/alembic/sql/20260825_0016_sales_invoice_auto_fefo.sql"
REVISION_PATH = (
    ROOT / "backend/alembic/versions/20260825_0016_sales_invoice_auto_fefo.py"
)


def test_auto_fefo_migration_is_generated_hash_bound_and_linear() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")
    revision = REVISION_PATH.read_text(encoding="utf-8")

    assert sql == generate_sql()
    assert hashlib.sha256(sql.encode("utf-8")).hexdigest() in revision
    assert 'revision = "20260825_0016"' in revision
    assert 'down_revision = "20260825_0015"' in revision
    assert "CanonicalBaselineError" in revision.split("def downgrade", 1)[1]


def test_auto_fefo_resolver_is_fail_closed_and_source_evidenced() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")

    assert sql.count(
        'CREATE OR REPLACE FUNCTION "erp_automation_commands".'
        '"resolve_sales_invoice_prepare"'
    ) == 1
    assert "sales_invoice_fefo_expiry_date_equivalence_v1" in sql
    assert "sales_invoice_auto_fefo_v1" in sql
    assert "automatic FEFO allocation cannot satisfy locked stock" in sql
    assert "automatic FEFO allocation changed before persistence" in sql
    assert "later_expiry_override_supported',false" in sql
    assert "ORDER BY batch_row.expires_on,batch_row.batch_number,batch_row.id" in sql
    assert "FOR SHARE OF stock,batch_row" in sql
    assert "stock.on_hand_quantity-" in sql
    assert "allocation_tracker#>>ARRAY[batch_row.id::text,'base_quantity']" in sql
    assert "GRANT EXECUTE ON FUNCTION" in sql
    assert 'TO "erp_calculator"' in sql


def test_auto_fefo_precondition_accepts_only_exact_incremental_or_fresh_definition() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")
    baseline = (
        ROOT / "backend/alembic/sql/20260820_0001_canonical_v1.sql"
    ).read_text(encoding="utf-8")

    assert LEGACY_DEFINITION_SHA256 in sql
    assert CURRENT_DEFINITION_SHA256 in sql
    assert "definition_sha256" in sql
    assert "sales_invoice_auto_fefo_v1')<>0" in sql
    assert "sales_invoice_auto_fefo_v1')=0" in sql
    assert "sales_invoice_auto_fefo_v1" in baseline
    assert "automatic FEFO allocation cannot satisfy locked stock" in baseline


def test_postgres_precondition_fixture_covers_reapply_and_mismatch_rollback() -> None:
    fixture = (
        ROOT
        / "backend/tests/postgres/check_sales_invoice_auto_fefo_migration_precondition.py"
    ).read_text(encoding="utf-8")

    assert "150000 <= int(cursor.fetchone()[0]) < 160000" in fixture
    assert "assert cursor.fetchone()[0] == CURRENT_DEFINITION_SHA256" in fixture
    assert "cursor.execute(MIGRATION_SQL)" in fixture
    assert "SAVEPOINT before_mismatched_reapply" in fixture
    assert 'assert exc.pgcode == "55000"' in fixture
    assert "connection.rollback()" in fixture


def test_live_sales_invoice_matrix_requires_all_authoritative_consequences() -> None:
    import json

    matrix = json.loads(
        (ROOT / "backend/tests/live_acceptance/operation_matrix.json").read_text()
    )
    invoice = next(item for item in matrix["operations"] if item["id"] == "sales_invoice")
    assert {
        "sales.invoices",
        "sales.invoice_lines",
        "sales.invoice_dispatch_allocations",
        "inventory.inventory_documents",
        "inventory.inventory_document_lines",
        "inventory.stock_balances",
        "inventory.stock_ledger_entries",
        "tax.documents",
        "finance.open_items",
        "finance.accounting_events",
        "finance.journal_entries",
        "finance.journal_lines",
    } <= set(invoice["database_relations"])


def test_live_sales_invoice_reconciliation_proves_relational_consequences() -> None:
    source = (
        ROOT / "backend/tests/live_canonical/reconciliation.py"
    ).read_text(encoding="utf-8")

    section = source.split('if operation == "sales.invoice":', 1)[1].split(
        "allocations = []", 1
    )[0]
    for relation in (
        "sales.invoice_lines",
        "sales.invoice_dispatch_allocations",
        "inventory.inventory_documents",
        "inventory.inventory_document_lines",
        "inventory.stock_ledger_entries",
        "tax_documents",
        "open_items",
        "finance.accounting_events",
        "finance.journal_entries",
        "finance.journal_lines",
    ):
        assert relation in section
    assert 'assert len(accounting) == 1' in section
    assert 'assert len(tax_documents) == 1' in section
    assert 'assert len(open_items) == 1' in section
    assert 'assert inventory["line_count"] == inventory["ledger_count"] > 0' in section

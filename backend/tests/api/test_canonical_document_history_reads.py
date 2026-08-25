from pathlib import Path
from datetime import date, datetime, timezone
import re
from uuid import UUID

import pytest
from pydantic import ValidationError

from app.api.routes.canonical_document_history_reads import (
    CanonicalDocumentHistoryItem,
    _filter_sql,
    _history_sources,
)


def _item(**updates):
    value = {
        "document_kind": "sales_invoice",
        "document_id": UUID("d3000000-0000-7000-8000-000000000001"),
        "branch_id": UUID("d3000000-0000-7000-8000-000000000002"),
        "document_number": "SI-EXACT-1", "document_date": date(2026, 8, 25), "due_date": None,
        "status": "posted", "party_account_id": UUID("d3000000-0000-7000-8000-000000000003"),
        "party_name": "Exact Customer", "source_document_type": None, "source_document_id": None,
        "source_document_number": None,
        "line_count": 1, "total_quantity": "0.123456", "minimum_unit_rate": "1.0000",
        "maximum_unit_rate": "9007199254740993.0000", "taxable_amount": "9007199254740993.10",
        "total_tax": "0.20", "total_amount": "9007199254740993.30", "paid_amount": "0.10",
        "outstanding_amount": "9007199254740993.20", "payment_status": "partial",
        "created_at": datetime(2026, 8, 25, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 8, 25, tzinfo=timezone.utc),
    }
    value.update(updates)
    return value


def test_exact_wire_contract_rejects_json_numbers_and_overprecision():
    assert CanonicalDocumentHistoryItem.model_validate(_item()).total_amount == "9007199254740993.30"
    with pytest.raises(ValidationError):
        CanonicalDocumentHistoryItem.model_validate(_item(total_amount=0.30))
    with pytest.raises(ValidationError):
        CanonicalDocumentHistoryItem.model_validate(_item(total_quantity="0.1234567"))
    with pytest.raises(ValidationError):
        CanonicalDocumentHistoryItem.model_validate(_item(
            source_document_type="sales_dispatch",
            source_document_id=UUID("d3000000-0000-7000-8000-000000000004"),
        ))


def test_non_settlement_histories_never_claim_paid_or_outstanding_amounts():
    dispatch = _item(
        document_kind="sales_dispatch",
        taxable_amount=None,
        total_tax=None,
        total_amount=None,
        paid_amount=None,
        outstanding_amount=None,
        payment_status=None,
    )
    assert CanonicalDocumentHistoryItem.model_validate(dispatch).total_amount is None
    with pytest.raises(ValidationError):
        CanonicalDocumentHistoryItem.model_validate({**dispatch, "outstanding_amount": "168.00"})
    with pytest.raises(ValidationError):
        CanonicalDocumentHistoryItem.model_validate({**dispatch, "total_amount": "168.00"})


def test_query_is_branch_scoped_filtered_paginated_and_reversal_safe():
    source = _history_sources()
    filters = _filter_sql()
    for kind in ("sales_invoice", "sales_order", "sales_dispatch", "supplier_invoice",
                 "purchase_order", "goods_receipt", "sales_return", "purchase_return"):
        assert f"'{kind}'" in source
    assert "branch_id=ANY" in filters
    assert "document_kind IN ('sales_return','purchase_return')" in filters
    assert ":date_from" in filters and ":date_to" in filters and ":search" in filters and ":status" in filters
    assert source.count("allocation.reversal_of_allocation_id IS NULL") == 2
    assert source.count("reversal.reversal_of_allocation_id=allocation.id") == 2
    assert "allocation.status='posted'" in source
    assert "item.status<>'reversed'" in source
    assert "receipt.purchase_order_id" not in source
    assert "supplier_invoice_receipt_allocations" in source
    assert "invoice_dispatch_allocations" in source
    assert "NULLIF(order_line.billed_quantity,0)" not in source
    assert "dispatch histories cannot invent monetary values" in (Path(__file__).parents[2] / "app/api/routes/canonical_document_history_reads.py").read_text()
    assert "CURRENT_DATE" not in source
    assert ":business_date" in source
    assert "invoice.status IN ('posted','reversed','cancelled')" in source
    assert "orders.status IN ('submitted','approved','partially_fulfilled','fulfilled','cancelled')" in source
    assert "purchase.status IN ('submitted','approved','partially_received','received','cancelled')" in source
    assert "receipt.status IN ('posted','cancelled','reversed')" in source
    assert source.count("returns.status IN ('posted','cancelled','reversed')") == 2
    route = Path(__file__).parents[2] / "app/api/routes/canonical_document_history_reads.py"
    text = route.read_text()
    assert "LIMIT :limit OFFSET :offset" in text
    assert "Depends(PermissionChecker())" in text
    assert "check_module_access(user, module)" in text


def test_every_history_sql_column_exists_in_the_canonical_migration():
    migration = (Path(__file__).parents[2] / "alembic/sql/20260820_0001_canonical_v1.sql").read_text()
    selected_columns = {
        ("core", "organizations"): {"id", "timezone", "status"},
        ("parties", "parties"): {"org_id", "id", "legal_name"},
        ("parties", "customer_accounts"): {"org_id", "id", "party_id"},
        ("parties", "supplier_accounts"): {"org_id", "id", "party_id"},
        ("sales", "invoices"): {"org_id", "id", "branch_id", "invoice_number", "invoice_date", "status",
            "customer_account_id", "gst_taxable_total", "cgst_total", "sgst_total", "igst_total", "cess_total",
            "grand_total", "created_at", "updated_at"},
        ("sales", "invoice_lines"): {"org_id", "id", "invoice_id", "line_kind", "billed_quantity",
            "free_quantity", "quoted_unit_rate"},
        ("sales", "invoice_dispatch_allocations"): {"org_id", "invoice_line_id", "dispatch_line_id"},
        ("sales", "orders"): {"org_id", "id", "branch_id", "order_number", "order_date",
            "requested_delivery_date", "status", "customer_account_id", "gst_taxable_total", "cgst_total",
            "sgst_total", "igst_total", "cess_total", "grand_total", "created_at", "updated_at"},
        ("sales", "order_lines"): {"org_id", "id", "order_id", "line_kind", "billed_quantity",
            "free_quantity", "quoted_unit_rate"},
        ("sales", "dispatches"): {"org_id", "id", "branch_id", "customer_account_id", "dispatch_number",
            "dispatch_date", "status", "created_at", "updated_at"},
        ("sales", "dispatch_lines"): {"org_id", "dispatch_id", "order_line_id", "billed_quantity", "free_quantity"},
        ("sales", "returns"): {"org_id", "id", "branch_id", "customer_account_id", "invoice_id", "return_number",
            "return_date", "status", "gst_taxable_total", "cgst_total", "sgst_total", "igst_total", "cess_total",
            "grand_total", "created_at", "updated_at"},
        ("sales", "return_lines"): {"org_id", "return_id", "billed_quantity", "free_quantity", "quoted_unit_rate"},
        ("procurement", "purchase_orders"): {"org_id", "id", "branch_id", "supplier_account_id",
            "purchase_order_number", "order_date", "expected_delivery_date", "status", "gst_taxable_total",
            "cgst_total", "sgst_total", "igst_total", "cess_total", "grand_total", "created_at", "updated_at"},
        ("procurement", "purchase_order_lines"): {"org_id", "id", "purchase_order_id", "line_kind",
            "billed_quantity", "free_quantity", "quoted_unit_rate"},
        ("procurement", "supplier_invoices"): {"org_id", "id", "branch_id", "supplier_account_id",
            "supplier_invoice_number", "supplier_invoice_date", "due_date", "status", "supplier_legal_name_snapshot",
            "gst_taxable_total", "cgst_total", "sgst_total", "igst_total", "cess_total", "grand_total",
            "created_at", "updated_at"},
        ("procurement", "supplier_invoice_lines"): {"org_id", "id", "supplier_invoice_id", "line_kind",
            "billed_quantity", "free_quantity", "quoted_unit_rate"},
        ("procurement", "supplier_invoice_receipt_allocations"): {"org_id", "supplier_invoice_line_id",
            "goods_receipt_line_id"},
        ("procurement", "goods_receipts"): {"org_id", "id", "branch_id", "supplier_account_id",
            "goods_receipt_number", "received_at", "status", "created_at", "updated_at"},
        ("procurement", "goods_receipt_lines"): {"org_id", "id", "goods_receipt_id", "purchase_order_line_id",
            "base_accepted_quantity", "base_free_quantity", "unit_cost", "extended_cost"},
        ("procurement", "purchase_returns"): {"org_id", "id", "branch_id", "supplier_account_id",
            "supplier_invoice_id", "purchase_return_number", "return_date", "status", "gst_taxable_total",
            "cgst_total", "sgst_total", "igst_total", "cess_total", "grand_total", "created_at", "updated_at"},
        ("procurement", "purchase_return_lines"): {"org_id", "purchase_return_id", "billed_quantity",
            "free_quantity", "quoted_unit_rate"},
        ("finance", "accounting_events"): {"org_id", "id", "sales_invoice_id", "supplier_invoice_id"},
        ("finance", "open_items"): {"org_id", "id", "accounting_event_id", "item_side", "due_date",
            "principal_amount", "status"},
        ("finance", "allocations"): {"org_id", "id", "open_item_id", "amount", "status",
            "reversal_of_allocation_id"},
    }
    for (schema, table), expected in selected_columns.items():
        match = re.search(rf'CREATE TABLE "{schema}"\."{table}" \((.*?)\n\);', migration, re.DOTALL)
        assert match, f"canonical table missing: {schema}.{table}"
        actual = set(re.findall(r'^\s+"([^"]+)"\s', match.group(1), re.MULTILINE))
        assert expected <= actual, f"missing {schema}.{table} columns: {sorted(expected - actual)}"


def test_postgres15_runtime_role_gate_executes_the_history_union():
    root = Path(__file__).parents[3]
    runner = (root / "database/canonical/ci/run_alembic_postgres15_gate.sh").read_text()
    fixture_name = "check_canonical_document_history_runtime_role.py"
    fixture = (root / "backend/tests/postgres" / fixture_name).read_text()
    assert fixture_name in runner
    assert "SET LOCAL ROLE \"erp_runtime\"" in fixture
    assert "rolbypassrls" in fixture
    assert "for kind in KINDS" in fixture
    assert "organization_scope\": True" in fixture
    assert "document_group\": \"returns\"" in fixture

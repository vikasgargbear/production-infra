from uuid import uuid4

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from app.api.routes import canonical_sales_chain_reads as reads
from app.main import app


def valid_row():
    ids = [uuid4() for _ in range(10)]
    return {
        "sales_invoice_id": ids[0], "invoice_number": "SI-1", "status": "posted",
        "taxable_amount": "100.00", "cgst_amount": "6.00", "sgst_amount": "6.00",
        "igst_amount": "0.00", "cess_amount": "0.00", "invoice_total": "112.00",
        "invoice_lines": [{"invoice_line_id": ids[1], "product_id": ids[2],
            "billed_quantity": "1.125000", "free_quantity": "0.250000",
            "base_billed_quantity": "11.250000", "base_free_quantity": "2.500000",
            "taxable_amount": "100.00", "cgst_amount": "6.00", "sgst_amount": "6.00",
            "igst_amount": "0.00", "cess_amount": "0.00", "line_total": "112.00"}],
        "tax_document_id": ids[3], "tax_taxable_amount": "100.00", "tax_cgst_amount": "6.00",
        "tax_sgst_amount": "6.00", "tax_igst_amount": "0.00", "tax_cess_amount": "0.00",
        "tax_payable_amount": "112.00", "accounting_event_id": ids[4], "journal_entry_id": ids[5],
        "journal_debit_total": "112.00", "journal_credit_total": "112.00",
        "journal_lines": [
            {"journal_line_id": ids[6], "line_number": 1, "account_id": ids[7],
             "transaction_debit": "112.00", "transaction_credit": "0.00"},
            {"journal_line_id": ids[8], "line_number": 2, "account_id": ids[9],
             "transaction_debit": "0.00", "transaction_credit": "112.00"},
        ],
        "open_item_id": uuid4(), "receivable_principal": "112.00", "receivable_outstanding": "112.00",
        "inventory_document_id": uuid4(), "inventory_base_quantity": "13.750000", "inventory_value": "84.13",
    }


def test_order_and_dispatch_schemas_require_exact_strings_and_canonical_uuids():
    ids = [uuid4() for _ in range(12)]
    order = {
        "sales_order_id": ids[0], "order_number": "SO-1", "status": "approved",
        "customer_name": "Customer", "total_amount": "168.00", "lines": [{
            "sales_order_line_id": ids[1], "product_id": ids[2],
            "billed_quantity": "1.125000", "free_quantity": "0.250000",
            "base_billed_quantity": "11.250000", "base_free_quantity": "2.500000",
            "quoted_unit_rate": "84.1250", "taxable_amount": "150.00",
            "total_tax": "18.00", "line_total": "168.00", "reservation_id": ids[3],
            "batch_id": ids[4], "location_id": ids[5], "reserved_base_quantity": "13.750000",
        }],
    }
    dispatch = {
        "dispatch_id": ids[6], "challan_number": "DC-1", "sales_order_id": ids[0],
        "status": "posted", "customer_name": "Customer", "inventory_document_id": ids[7],
        "inventory_base_quantity": "13.750000", "inventory_value": "84.13", "lines": [{
            "dispatch_line_id": ids[8], "sales_order_line_id": ids[1], "product_id": ids[2],
            "batch_id": ids[4], "from_location_id": ids[5], "billed_quantity": "1.125000",
            "free_quantity": "0.250000", "base_billed_quantity": "11.250000",
            "base_free_quantity": "2.500000", "inventory_document_line_id": ids[9],
            "ledger_entry_id": ids[10], "ledger_base_quantity": "13.750000", "ledger_value": "84.13",
        }],
    }
    assert reads.CanonicalSalesOrderReadback.model_validate(order).lines[0].quoted_unit_rate == "84.1250"
    assert reads.CanonicalSalesDispatchReadback.model_validate(dispatch).lines[0].ledger_base_quantity == "13.750000"
    order["lines"][0]["billed_quantity"] = 1.125
    dispatch["lines"][0]["batch_id"] = "not-a-uuid"
    with pytest.raises(ValidationError):
        reads.CanonicalSalesOrderReadback.model_validate(order)
    with pytest.raises(ValidationError):
        reads.CanonicalSalesDispatchReadback.model_validate(dispatch)


def test_posting_readback_schema_preserves_uuid_and_exact_decimal_strings():
    model = reads.CanonicalSalesInvoicePostingReadback.model_validate(valid_row())
    payload = model.model_dump(mode="json")
    assert payload["invoice_lines"][0]["billed_quantity"] == "1.125000"
    assert payload["invoice_total"] == "112.00"
    assert payload["journal_debit_total"] == payload["journal_credit_total"]


@pytest.mark.parametrize("mutation", [
    lambda row: row.update(sales_invoice_id="not-a-uuid"),
    lambda row: row.update(invoice_total=112.0),
    lambda row: row.update(invoice_total="112.000"),
    lambda row: row.update(tax_payable_amount="111.99"),
    lambda row: row.update(journal_credit_total="111.00"),
])
def test_posting_readback_fails_closed_for_bad_identity_precision_or_reconciliation(mutation):
    row = valid_row(); mutation(row)
    with pytest.raises(ValidationError):
        reads.CanonicalSalesInvoicePostingReadback.model_validate(row)


def test_posting_readback_is_auth_gated_and_mounted_before_legacy_routes():
    route = next(route for route in reads.router.routes if isinstance(route, APIRoute)
                 and route.path.endswith("/posting-readback"))
    assert route.path == "/canonical/sales-invoices/{invoice_id}/posting-readback"
    assert route.dependant.dependencies  # router-level HTTP bearer plus permission dependency
    matches = []
    for route in app.routes:
        contexts = getattr(route, "effective_route_contexts", None)
        matches.extend(contexts() if callable(contexts) else [route])
    mounted = [route for route in matches if getattr(route, "path", "") ==
               "/api/canonical/sales-invoices/{invoice_id}/posting-readback"]
    assert mounted and mounted[0].endpoint is reads.posted_sales_invoice_readback


def test_posting_readback_uses_org_scoped_posted_companions(monkeypatch):
    invoice_id, org_id = uuid4(), uuid4(); captured = {}
    monkeypatch.setattr(reads, "_activate", lambda db, user: org_id)
    def fake_rows(db, sql, params):
        captured.update(sql=sql, params=params)
        return [valid_row()]
    monkeypatch.setattr(reads, "_rows", fake_rows)
    result = reads.posted_sales_invoice_readback(invoice_id, {"org_id": str(org_id)}, object())
    assert result["status"] == "posted"
    assert captured["params"] == {"org_id": org_id, "invoice_id": invoice_id}
    assert "invoice.org_id=:org_id" in captured["sql"]
    assert "journal.status='posted'" in captured["sql"]
    assert "inventory_document.status='posted'" in captured["sql"]


def test_dispatch_readback_uses_canonical_stock_ledger_columns(monkeypatch):
    dispatch_id, org_id = uuid4(), uuid4(); captured = {}
    monkeypatch.setattr(reads, "_activate", lambda db, user: org_id)
    def fake_rows(db, sql, params):
        captured.update(sql=sql, params=params)
        return [{"dispatch_id": dispatch_id}]
    monkeypatch.setattr(reads, "_rows", fake_rows)
    reads.sales_dispatch_acceptance_readback(dispatch_id, {"org_id": str(org_id)}, object())
    assert "ledger.quantity_delta" in captured["sql"]
    assert "ledger.value_delta" in captured["sql"]
    assert "ledger.quantity)" not in captured["sql"]
    assert captured["params"] == {"org_id": org_id, "dispatch_id": dispatch_id}

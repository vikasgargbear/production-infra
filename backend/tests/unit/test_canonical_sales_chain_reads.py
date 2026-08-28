from datetime import date
from uuid import uuid4

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from app.api.routes import canonical_sales_chain_reads as reads
from app.main import app


def valid_row():
    ids = [uuid4() for _ in range(16)]
    return {
        "sales_invoice_id": ids[0], "invoice_number": "SI-1", "status": "posted",
        "taxable_amount": "100.00", "cgst_amount": "6.00", "sgst_amount": "6.00",
        "igst_amount": "0.00", "cess_amount": "0.00", "invoice_total": "112.00",
        "rounding_adjustment": "0.00",
        "invoice_lines": [{"invoice_line_id": ids[1], "line_kind": "product", "product_id": ids[2],
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
        "inventory_fulfillment": "direct_invoice_issue",
        "invoice_inventory_document_id": ids[10],
        "inventory_base_quantity": "13.750000", "inventory_value": "84.13",
        "inventory_evidence": [{
            "invoice_line_id": ids[1], "source_kind": "direct_invoice_issue",
            "source_document_id": ids[0], "source_line_id": ids[1],
            "invoice_dispatch_allocation_id": None,
            "inventory_document_id": ids[10], "inventory_document_line_id": ids[11],
            "ledger_entry_id": ids[12], "allocated_base_billed_quantity": "11.250000",
            "allocated_base_free_quantity": "2.500000", "ledger_base_quantity": "13.750000",
            "ledger_value": "84.13",
        }],
    }


def valid_dispatch_valuation_row():
    ids = [uuid4() for _ in range(9)]
    return {
        "dispatch_id": ids[0], "challan_number": "DC-1",
        "sales_order_id": ids[1], "status": "posted",
        "customer_name": "Customer", "inventory_document_id": ids[2],
        "inventory_base_quantity": "1.250000", "inventory_value": "84.13",
        "lines": [{
            "dispatch_line_id": ids[3], "sales_order_line_id": ids[4],
            "product_id": ids[5], "batch_id": ids[6],
            "from_location_id": ids[7], "billed_quantity": "1.000000",
            "free_quantity": "0.250000", "base_billed_quantity": "1.000000",
            "base_free_quantity": "0.250000", "inventory_document_line_id": ids[8],
            "ledger_entry_id": uuid4(), "ledger_base_quantity": "1.250000",
            "ledger_value": "84.13",
        }],
    }


def test_order_and_dispatch_schemas_require_exact_strings_and_canonical_uuids():
    ids = [uuid4() for _ in range(12)]
    order = {
        "sales_order_id": ids[0], "order_number": "SO-1", "status": "approved",
        "customer_name": "Customer", "requested_delivery_date": "2026-08-30",
        "total_amount": "168.00", "rounding_adjustment": "0.00", "lines": [{
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
        "inventory_base_quantity": "13.750000", "lines": [{
            "dispatch_line_id": ids[8], "sales_order_line_id": ids[1], "product_id": ids[2],
            "batch_id": ids[4], "from_location_id": ids[5], "billed_quantity": "1.125000",
            "free_quantity": "0.250000", "base_billed_quantity": "11.250000",
            "base_free_quantity": "2.500000", "inventory_document_line_id": ids[9],
            "ledger_entry_id": ids[10], "ledger_base_quantity": "13.750000",
        }],
    }
    valuation = {
        **dispatch, "inventory_value": "84.13",
        "lines": [{**dispatch["lines"][0], "ledger_value": "84.13"}],
    }
    parsed_order = reads.CanonicalSalesOrderReadback.model_validate(order)
    assert parsed_order.lines[0].quoted_unit_rate == "84.1250"
    assert parsed_order.requested_delivery_date == date(2026, 8, 30)
    assert reads.CanonicalSalesDispatchReadback.model_validate(dispatch).lines[0].ledger_base_quantity == "13.750000"
    assert reads.CanonicalSalesDispatchValuationReadback.model_validate(
        valuation
    ).lines[0].ledger_value == "84.13"
    order["lines"][0]["billed_quantity"] = 1.125
    dispatch["lines"][0]["batch_id"] = "not-a-uuid"
    with pytest.raises(ValidationError):
        reads.CanonicalSalesOrderReadback.model_validate(order)
    with pytest.raises(ValidationError):
        reads.CanonicalSalesDispatchReadback.model_validate(dispatch)


@pytest.mark.parametrize("target,field,value,message", [
    ("order", "total_amount", "167.99", "header total"),
    ("order_line", "reserved_base_quantity", "13.749999", "reservation"),
    ("dispatch", "inventory_base_quantity", "13.749999", "inventory quantity"),
    ("dispatch_valuation", "inventory_value", "84.12", "inventory value"),
    ("dispatch_line", "ledger_base_quantity", "13.749999", "ledger quantity"),
])
def test_order_and_dispatch_readbacks_fail_closed_for_arithmetic_drift(target, field, value, message):
    ids = [uuid4() for _ in range(11)]
    order = {"sales_order_id": ids[0], "order_number": "SO-1", "status": "approved",
             "customer_name": "Customer", "requested_delivery_date": "2026-08-30",
             "total_amount": "112.00", "rounding_adjustment": "0.00", "lines": [{
                 "sales_order_line_id": ids[1], "product_id": ids[2], "billed_quantity": "1.000000",
                 "free_quantity": "0.250000", "base_billed_quantity": "10.000000",
                 "base_free_quantity": "2.500000", "quoted_unit_rate": "100.0000",
                 "taxable_amount": "100.00", "total_tax": "12.00", "line_total": "112.00",
                 "reservation_id": ids[3], "batch_id": ids[4], "location_id": ids[5],
                 "reserved_base_quantity": "12.500000"}]}
    dispatch = {"dispatch_id": ids[6], "challan_number": "DC-1", "sales_order_id": ids[0],
                "status": "posted", "customer_name": "Customer", "inventory_document_id": ids[7],
                "inventory_base_quantity": "12.500000", "inventory_value": "84.13", "lines": [{
                    "dispatch_line_id": ids[8], "sales_order_line_id": ids[1], "product_id": ids[2],
                    "batch_id": ids[4], "from_location_id": ids[5], "billed_quantity": "1.000000",
                    "free_quantity": "0.250000", "base_billed_quantity": "10.000000",
                    "base_free_quantity": "2.500000", "inventory_document_line_id": ids[9],
                    "ledger_entry_id": ids[10], "ledger_base_quantity": "12.500000",
                    "ledger_value": "84.13"}]}
    subject = order if target.startswith("order") else dispatch
    container = subject["lines"][0] if target.endswith("line") else subject
    container[field] = value
    model = (
        reads.CanonicalSalesOrderReadback
        if target.startswith("order")
        else reads.CanonicalSalesDispatchValuationReadback
    )
    with pytest.raises(ValidationError, match=message):
        model.model_validate(subject)


def test_posting_readback_schema_preserves_uuid_and_exact_decimal_strings():
    model = reads.CanonicalSalesInvoicePostingEvidence.model_validate(valid_row())
    payload = model.model_dump(mode="json")
    assert payload["invoice_lines"][0]["billed_quantity"] == "1.125000"
    assert payload["invoice_total"] == "112.00"
    assert payload["journal_debit_total"] == payload["journal_credit_total"]


def test_posting_readback_reconciles_one_direct_invoice_line_across_batches():
    row = valid_row()
    first = row["inventory_evidence"][0]
    first.update(
        allocated_base_billed_quantity="6.250000",
        allocated_base_free_quantity="1.250000",
        ledger_base_quantity="7.500000",
        ledger_value="45.88",
    )
    row["inventory_evidence"].append({
        **first,
        "inventory_document_line_id": uuid4(),
        "ledger_entry_id": uuid4(),
        "allocated_base_billed_quantity": "5.000000",
        "allocated_base_free_quantity": "1.250000",
        "ledger_base_quantity": "6.250000",
        "ledger_value": "38.25",
    })

    model = reads.CanonicalSalesInvoicePostingEvidence.model_validate(row)

    assert len(model.inventory_evidence) == 2


def test_posting_readback_direct_batch_split_comes_from_succeeded_command_evidence(
    monkeypatch,
):
    invoice_id, org_id = uuid4(), uuid4()
    captured = {}

    def fake_rows(db, sql, params):
        captured["sql"] = sql
        return [valid_row()]

    monkeypatch.setattr(reads, "_activate", lambda db, user: org_id)
    monkeypatch.setattr(reads, "_rows", fake_rows)
    reads.posted_sales_invoice_readback(invoice_id, {"org_id": str(org_id)}, object())

    sql = captured["sql"]
    assert "sales_invoice_direct_issue_provenance" in sql
    assert "requested_allocation.inventory_document_line_id=inventory_line.id" in sql
    assert "requested_allocation.batch_id=inventory_line.batch_id" in sql
    assert "requested_allocation.billed_quantity" in sql
    assert "requested_allocation.free_quantity" in sql
    assert "request_bytes" not in sql


def test_posting_readback_reconciles_charge_lines_and_rounding_without_inventory_lineage():
    row = valid_row()
    row["invoice_lines"].append({
        "invoice_line_id": uuid4(), "line_kind": "charge", "product_id": None,
        "billed_quantity": None, "free_quantity": None,
        "base_billed_quantity": None, "base_free_quantity": None,
        "taxable_amount": "10.00", "cgst_amount": "0.60", "sgst_amount": "0.60",
        "igst_amount": "0.00", "cess_amount": "0.00", "line_total": "11.20",
    })
    row.update(
        taxable_amount="110.00", tax_taxable_amount="110.00",
        cgst_amount="6.60", tax_cgst_amount="6.60",
        sgst_amount="6.60", tax_sgst_amount="6.60",
        invoice_total="123.00", tax_payable_amount="123.00",
        rounding_adjustment="-0.20", receivable_principal="123.00",
        receivable_outstanding="123.00", journal_debit_total="123.00",
        journal_credit_total="123.00",
    )
    row["journal_lines"][0]["transaction_debit"] = "123.00"
    row["journal_lines"][1]["transaction_credit"] = "123.00"
    assert reads.CanonicalSalesInvoicePostingEvidence.model_validate(
        row
    ).invoice_total == "123.00"


@pytest.mark.parametrize("mutation", [
    lambda row: row.update(sales_invoice_id="not-a-uuid"),
    lambda row: row.update(invoice_total=112.0),
    lambda row: row.update(invoice_total="112.000"),
    lambda row: row.update(tax_payable_amount="111.99"),
    lambda row: row.update(journal_credit_total="111.00"),
    lambda row: row.update(taxable_amount="99.99", tax_taxable_amount="99.99"),
    lambda row: row.update(inventory_base_quantity="13.749999"),
    lambda row: row.update(receivable_outstanding="-0.01"),
])
def test_posting_readback_fails_closed_for_bad_identity_precision_or_reconciliation(mutation):
    row = valid_row(); mutation(row)
    with pytest.raises(ValidationError):
        reads.CanonicalSalesInvoicePostingEvidence.model_validate(row)


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


def test_public_dispatch_readback_schema_does_not_publish_inventory_valuation():
    schema = app.openapi()["components"]["schemas"]

    assert "inventory_value" not in schema[
        "CanonicalSalesDispatchReadback"
    ]["properties"]
    assert "ledger_value" not in schema[
        "CanonicalSalesDispatchLineReadback"
    ]["properties"]
    valuation_schema = reads.CanonicalSalesDispatchValuationReadback.model_json_schema()
    assert "inventory_value" in valuation_schema["properties"]
    line_schema = reads.CanonicalSalesDispatchValuationLineReadback.model_json_schema()
    assert "ledger_value" in line_schema["properties"]


def test_public_invoice_posting_schema_does_not_publish_accounting_or_cogs():
    schema = app.openapi()["components"]["schemas"]
    public = schema["CanonicalSalesInvoicePostingReadback"]["properties"]
    assert {
        "accounting_event_id", "journal_entry_id", "journal_debit_total",
        "journal_credit_total", "journal_lines", "inventory_value",
    }.isdisjoint(public)
    assert "ledger_value" not in schema[
        "SalesInvoiceInventoryEvidence"
    ]["properties"]

    internal = reads.CanonicalSalesInvoicePostingEvidence.model_json_schema()
    assert "journal_lines" in internal["properties"]
    assert "inventory_value" in internal["properties"]
    valuation_line = reads.SalesInvoiceValuationEvidence.model_json_schema()
    assert "ledger_value" in valuation_line["properties"]


def test_posting_readback_uses_org_scoped_posted_companions(monkeypatch):
    invoice_id, org_id = uuid4(), uuid4(); captured = {}
    monkeypatch.setattr(reads, "_activate", lambda db, user: org_id)
    def fake_rows(db, sql, params):
        captured.update(sql=sql, params=params)
        return [valid_row()]
    monkeypatch.setattr(reads, "_rows", fake_rows)
    result = reads.posted_sales_invoice_readback(invoice_id, {"org_id": str(org_id)}, object())
    assert result.status == "posted"
    payload = result.model_dump()
    assert {
        "accounting_event_id", "journal_entry_id", "journal_debit_total",
        "journal_credit_total", "journal_lines", "inventory_value",
    }.isdisjoint(payload)
    assert "ledger_value" not in payload["inventory_evidence"][0]
    assert captured["params"] == {"org_id": org_id, "invoice_id": invoice_id}
    assert "invoice.org_id=:org_id" in captured["sql"]
    assert "journal.status='posted'" in captured["sql"]
    assert "document.status='posted'" in captured["sql"]
    assert "invoice_inventory.sales_invoice_id=invoice.id" in captured["sql"]
    assert "allocation.allocated_base_billed_quantity" in captured["sql"]


def test_dispatch_allocated_invoice_proves_no_second_invoice_stock_issue():
    row = valid_row()
    evidence = row["inventory_evidence"][0]
    evidence.update(
        source_kind="dispatch_issue",
        source_document_id=uuid4(),
        source_line_id=uuid4(),
        invoice_dispatch_allocation_id=uuid4(),
    )
    row.update(inventory_fulfillment="dispatch_issue", invoice_inventory_document_id=None)
    model = reads.CanonicalSalesInvoicePostingEvidence.model_validate(row)
    assert model.invoice_inventory_document_id is None
    assert model.inventory_evidence[0].source_kind == "dispatch_issue"


def test_dispatch_allocated_invoice_rejects_duplicate_invoice_owned_stock_issue():
    row = valid_row()
    row["inventory_evidence"][0].update(
        source_kind="dispatch_issue", source_document_id=uuid4(), source_line_id=uuid4(),
        invoice_dispatch_allocation_id=uuid4(),
    )
    row["inventory_fulfillment"] = "dispatch_issue"
    with pytest.raises(ValidationError, match="direct inventory ownership|second stock issue"):
        reads.CanonicalSalesInvoicePostingEvidence.model_validate(row)


def test_dispatch_readback_uses_canonical_stock_ledger_columns(monkeypatch):
    row = valid_dispatch_valuation_row()
    dispatch_id, org_id = row["dispatch_id"], uuid4(); captured = {}
    monkeypatch.setattr(reads, "_activate", lambda db, user: org_id)
    def fake_rows(db, sql, params):
        captured.update(sql=sql, params=params)
        return [row]
    monkeypatch.setattr(reads, "_rows", fake_rows)
    result = reads.sales_dispatch_acceptance_readback(
        dispatch_id, {"org_id": str(org_id)}, object()
    )
    assert "ledger.quantity_delta" in captured["sql"]
    assert "ledger.value_delta" in captured["sql"]
    assert "ledger.quantity)" not in captured["sql"]
    assert "dispatch.sales_order_id" not in captured["sql"]
    assert "JOIN sales.order_lines order_line" in captured["sql"]
    assert "GROUP BY order_line.order_id" in captured["sql"]
    assert "min(order_line.order_id)" not in captured["sql"]
    assert captured["params"] == {"org_id": org_id, "dispatch_id": dispatch_id}
    assert "inventory_value" not in result.model_dump()
    assert "ledger_value" not in result.lines[0].model_dump()


def test_dispatch_readback_fails_closed_when_lines_span_sales_orders(monkeypatch):
    first = valid_dispatch_valuation_row()
    second = valid_dispatch_valuation_row()
    second.update(
        dispatch_id=first["dispatch_id"],
        challan_number=first["challan_number"],
        inventory_document_id=first["inventory_document_id"],
    )
    monkeypatch.setattr(reads, "_activate", lambda db, user: uuid4())
    monkeypatch.setattr(reads, "_rows", lambda db, sql, params: [first, second])

    with pytest.raises(reads.HTTPException) as failure:
        reads._sales_dispatch_valuation_acceptance_readback(
            first["dispatch_id"], {"org_id": str(uuid4())}, object()
        )

    assert failure.value.status_code == 404
    assert failure.value.detail == "Posted canonical sales dispatch readback not found"


def test_dispatch_valuation_readback_remains_internal_and_exact(monkeypatch):
    row = valid_dispatch_valuation_row()
    monkeypatch.setattr(reads, "_activate", lambda db, user: uuid4())
    monkeypatch.setattr(reads, "_rows", lambda db, sql, params: [row])

    result = reads._sales_dispatch_valuation_acceptance_readback(
        row["dispatch_id"], {"org_id": str(uuid4())}, object()
    )

    assert result.inventory_value == "84.13"
    assert result.lines[0].ledger_value == "84.13"

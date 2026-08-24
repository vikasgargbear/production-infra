from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from app.api.routes import canonical_supplier_invoice_reads as reads
from app.main import app


def _allocation(**overrides):
    row = {
        "allocation_id": uuid4(),
        "goods_receipt_id": uuid4(),
        "goods_receipt_line_id": uuid4(),
        "allocated_base_billed_quantity": Decimal("1.000000"),
        "allocated_base_free_quantity": Decimal("0.000000"),
        "receipt_unit_cost": Decimal("100.0000"),
        "capitalized_value": Decimal("100.00"),
        "source_inventory_document_id": uuid4(),
        "source_inventory_document_line_id": uuid4(),
        "source_stock_ledger_entry_id": uuid4(),
    }
    row.update(overrides)
    return row


def _posted_line(allocation=None, **overrides):
    row = {
        "supplier_invoice_line_id": uuid4(),
        "line_number": 1,
        "line_kind": "product",
        "product_id": uuid4(),
        "product_name": "Canonical product",
        "hsn_sac_code": "481910",
        "uom_code": "EA",
        "billed_quantity": Decimal("1.000000"),
        "free_quantity": Decimal("0.000000"),
        "base_billed_quantity": Decimal("1.000000"),
        "base_free_quantity": Decimal("0.000000"),
        "quoted_unit_rate": Decimal("100.0000"),
        "gross_amount": Decimal("100.00"),
        "line_discount_amount": Decimal("0.00"),
        "document_discount_amount": Decimal("0.00"),
        "net_value_amount": Decimal("100.00"),
        "gst_taxable_value": Decimal("100.00"),
        "itc_eligibility": "eligible",
        "inventory_cost_treatment": "capitalize",
        "cgst_amount": Decimal("6.00"),
        "sgst_amount": Decimal("6.00"),
        "igst_amount": Decimal("0.00"),
        "cess_amount": Decimal("0.00"),
        "line_total": Decimal("112.00"),
        "allocations": [allocation or _allocation()],
    }
    row.update(overrides)
    return row


def _posted(**overrides):
    row = {
        "supplier_invoice_id": uuid4(),
        "supplier_invoice_number": "SUP-INV-1",
        "supplier_invoice_date": "2026-08-25",
        "received_date": "2026-08-25",
        "due_date": "2026-09-24",
        "branch_id": uuid4(),
        "supplier_account_id": uuid4(),
        "supplier_name": "Canonical Supplier",
        "supplier_gstin": "27ABCDE1234F1Z5",
        "buyer_gstin": "27AAAAA0000A1Z5",
        "status": "posted",
        "posted_at": datetime.now(timezone.utc),
        "subtotal": Decimal("100.00"),
        "discount_total": Decimal("0.00"),
        "charges_total": Decimal("0.00"),
        "net_value_total": Decimal("100.00"),
        "gst_taxable_total": Decimal("100.00"),
        "cgst_total": Decimal("6.00"),
        "sgst_total": Decimal("6.00"),
        "igst_total": Decimal("0.00"),
        "cess_total": Decimal("0.00"),
        "rounding_adjustment": Decimal("0.00"),
        "grand_total": Decimal("112.00"),
        "tax_document_id": uuid4(),
        "portal_document_line_id": uuid4(),
        "tax_document_taxable_total": Decimal("100.00"),
        "tax_document_cgst_total": Decimal("6.00"),
        "tax_document_sgst_total": Decimal("6.00"),
        "tax_document_igst_total": Decimal("0.00"),
        "tax_document_cess_total": Decimal("0.00"),
        "tax_document_payable_total": Decimal("112.00"),
        "portal_taxable_total": Decimal("100.00"),
        "portal_cgst_total": Decimal("6.00"),
        "portal_sgst_total": Decimal("6.00"),
        "portal_igst_total": Decimal("0.00"),
        "portal_cess_total": Decimal("0.00"),
        "portal_grand_total": Decimal("112.00"),
        "open_item_id": uuid4(),
        "open_item_status": "open",
        "open_item_principal": Decimal("112.00"),
        "journal_entry_id": uuid4(),
        "journal_number": "JRN-1",
        "journal_status": "posted",
        "journal_debit_total": Decimal("112.00"),
        "journal_credit_total": Decimal("112.00"),
        "supplier_invoice_inventory_document_count": 0,
        "supplier_invoice_inventory_value_delta": Decimal("0.00"),
        "lines": [_posted_line()],
        "journal_lines": [
            {
                "journal_line_id": uuid4(), "line_number": 1,
                "account_id": uuid4(), "account_code": "INV",
                "account_name": "Inventory", "party_id": None,
                "debit": Decimal("100.00"), "credit": Decimal("0.00"),
            },
            {
                "journal_line_id": uuid4(), "line_number": 2,
                "account_id": uuid4(), "account_code": "GST-IN",
                "account_name": "Input GST", "party_id": None,
                "debit": Decimal("12.00"), "credit": Decimal("0.00"),
            },
            {
                "journal_line_id": uuid4(), "line_number": 3,
                "account_id": uuid4(), "account_code": "AP",
                "account_name": "Accounts Payable", "party_id": uuid4(),
                "debit": Decimal("0.00"), "credit": Decimal("112.00"),
            },
        ],
    }
    row.update(overrides)
    return row


def _context_line(**overrides):
    row = {
        "goods_receipt_id": uuid4(),
        "goods_receipt_number": "GRN-1",
        "goods_receipt_line_id": uuid4(),
        "goods_receipt_line_number": 1,
        "purchase_order_line_id": uuid4(),
        "product_id": uuid4(),
        "product_name": "Canonical product",
        "sku": "SKU-1",
        "hsn_code": "481910",
        "uom_code": "EA",
        "uom_conversion_factor": Decimal("1.000000"),
        "accepted_base_quantity": Decimal("2.000000"),
        "free_base_quantity": Decimal("1.000000"),
        "allocated_base_billed_quantity": Decimal("1.000000"),
        "allocated_base_free_quantity": Decimal("0.000000"),
        "remaining_base_billed_quantity": Decimal("1.000000"),
        "remaining_base_free_quantity": Decimal("1.000000"),
        "remaining_billed_quantity": Decimal("1.000000"),
        "remaining_free_quantity": Decimal("1.000000"),
        "receipt_unit_cost": Decimal("50.0000"),
        "remaining_capitalized_value": Decimal("100.00"),
        "suggested_quoted_unit_rate": Decimal("50.0000"),
        "suggested_price_basis": "tax_exclusive",
        "suggested_free_supply_tax_treatment": "included_at_unit_rate",
        "suggested_line_discount_kind": "none",
        "suggested_line_discount_basis": "price_value",
        "suggested_line_discount_value": Decimal("0.000000"),
        "source_inventory_document_id": uuid4(),
        "source_inventory_document_line_id": uuid4(),
        "source_stock_ledger_entry_id": uuid4(),
    }
    row.update(overrides)
    return row


def test_routes_are_uuid_only_and_registered():
    paths = {
        route.path
        for route in app.routes
        if isinstance(route, APIRoute)
    }
    assert "/api/canonical/supplier-invoices/context" in paths
    assert "/api/canonical/supplier-invoices/{supplier_invoice_id}" in paths
    assert "/api/canonical/supplier-invoices/eligible-receipts" in paths


def test_context_preserves_exact_quantities_and_inventory_value():
    line = reads.SupplierInvoiceContextLine(**_context_line())
    wire = line.model_dump(mode="json")
    assert wire["remaining_base_billed_quantity"] == "1.000000"
    assert wire["receipt_unit_cost"] == "50.0000"
    assert wire["remaining_capitalized_value"] == "100.00"


def test_ready_context_requires_exact_portal_and_grn_line_set():
    line = _context_line()
    response = reads.SupplierInvoiceContextResponse(
        ready=True,
        blocking_reasons=[],
        branch_id=uuid4(),
        buyer_tax_registration_id=uuid4(),
        buyer_gstin="27AAAAA0000A1Z5",
        supplier_account_id=uuid4(),
        supplier_name="Canonical Supplier",
        supplier_tax_registration_id=uuid4(),
        supplier_gstin="27ABCDE1234F1Z5",
        purchase_order_id=uuid4(),
        document_discount_kind="none",
        document_discount_basis="price_value",
        document_discount_value=Decimal("0.000000"),
        rounding_policy="none",
        goods_receipt_ids=[line["goods_receipt_id"]],
        portal_evidence={
            "portal_document_id": uuid4(),
            "portal_document_line_id": uuid4(),
            "return_period_id": uuid4(),
            "parsed_at": datetime.now(timezone.utc),
            "source_sha256": "a" * 64,
            "source_row_hash": "b" * 64,
            "supplier_gstin": "27ABCDE1234F1Z5",
            "invoice_number": "SUP-1",
            "invoice_date": "2026-08-25",
            "taxable_amount": Decimal("100.00"),
            "cgst_amount": Decimal("6.00"),
            "sgst_amount": Decimal("6.00"),
            "igst_amount": Decimal("0.00"),
            "cess_amount": Decimal("0.00"),
            "total_amount": Decimal("112.00"),
        },
        lines=[line],
        expense_charge_lines=[],
    )
    assert response.ready is True
    with pytest.raises(ValidationError, match="readiness is inconsistent"):
        reads.SupplierInvoiceContextResponse(**{
            **response.model_dump(),
            "portal_evidence": None,
        })


def test_blocked_context_can_explain_absent_source_evidence_without_fake_line():
    response = reads.SupplierInvoiceContextResponse(
        ready=False,
        blocking_reasons=["The posted GRN has no unallocated billed or free quantity"],
        branch_id=uuid4(),
        buyer_tax_registration_id=None,
        buyer_gstin=None,
        supplier_account_id=uuid4(),
        supplier_name="Canonical Supplier",
        supplier_tax_registration_id=None,
        supplier_gstin=None,
        purchase_order_id=uuid4(),
        document_discount_kind="none",
        document_discount_basis="price_value",
        document_discount_value=Decimal("0"),
        rounding_policy="none",
        goods_receipt_ids=[uuid4()],
        portal_evidence=None,
        lines=[],
        expense_charge_lines=[],
    )
    assert response.ready is False


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"remaining_base_billed_quantity": Decimal("1.1")}, "billed receipt ceiling"),
        ({"remaining_free_quantity": Decimal("0")}, "entered/base quantities"),
        ({"remaining_capitalized_value": Decimal("99.99")}, "capitalisation"),
    ],
)
def test_context_line_fails_closed_on_drift(override, message):
    with pytest.raises(ValidationError, match=message):
        reads.SupplierInvoiceContextLine(**_context_line(**override))


def test_posted_readback_reconciles_all_domains_and_serializes_decimals():
    document = reads.PostedSupplierInvoiceResponse(**_posted())
    wire = document.model_dump(mode="json")
    assert wire["grand_total"] == "112.00"
    assert wire["lines"][0]["allocations"][0]["capitalized_value"] == "100.00"
    assert wire["supplier_invoice_inventory_value_delta"] == "0.00"


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"open_item_principal": Decimal("111.99")}, "payable"),
        ({"journal_credit_total": Decimal("111.99")}, "journal is not balanced"),
        ({"portal_cgst_total": Decimal("5.99")}, "GSTR-2B CGST"),
        ({"supplier_invoice_inventory_document_count": 1}, "second inventory movement"),
        ({"grand_total": Decimal("111.99")}, "grand total"),
    ],
)
def test_posted_readback_fails_closed_on_cross_domain_drift(override, message):
    with pytest.raises(ValidationError, match=message):
        reads.PostedSupplierInvoiceResponse(**_posted(**override))


def test_product_line_rejects_missing_grn_allocation():
    with pytest.raises(ValidationError, match="lacks receipt lineage"):
        reads.PostedSupplierInvoiceLine(**_posted_line(allocations=[]))


def test_detail_query_reads_command_portal_evidence_not_a_legacy_link(monkeypatch):
    captured: list[str] = []
    data = _posted()

    def fake_one(_db, sql, _params):
        captured.append(sql)
        return {key: value for key, value in data.items() if key not in {"lines", "journal_lines"}}

    def fake_rows(_db, sql, _params):
        captured.append(sql)
        if "FROM procurement.supplier_invoice_lines line" in sql:
            return [{key: value for key, value in data["lines"][0].items() if key != "allocations"}]
        if "FROM procurement.supplier_invoice_receipt_allocations" in sql:
            return [{"supplier_invoice_line_id": data["lines"][0]["supplier_invoice_line_id"], **data["lines"][0]["allocations"][0]}]
        return data["journal_lines"]

    monkeypatch.setattr(reads, "_one", fake_one)
    monkeypatch.setattr(reads, "_rows", fake_rows)
    monkeypatch.setattr(reads, "_activate", lambda *_: uuid4())
    result = reads.posted_supplier_invoice(
        data["supplier_invoice_id"],
        user={"org_id": str(uuid4()), "auth_user_id": str(uuid4())},
        db=object(),
    )
    assert result.grand_total == Decimal("112.00")
    assert "automation.command_requests command" in captured[0]
    assert "portal_document_line_id" in captured[0]
    assert "inventory.inventory_documents" in "\n".join(captured)

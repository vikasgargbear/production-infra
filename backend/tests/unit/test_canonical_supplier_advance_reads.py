from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from app.api.routes import canonical_supplier_advance_reads as reads


ROOT = Path(__file__).resolve().parents[3]


def _allocation(**overrides):
    row = {
        "allocation_id": uuid4(), "purchase_order_id": uuid4(),
        "purchase_order_number": "PO-1", "purchase_order_line_id": uuid4(),
        "line_number": 1, "product_id": uuid4(), "product_code": "SKU-1",
        "product_name": "Product", "prepayment_open_item_id": uuid4(),
        "cash_disbursed_amount": Decimal("168.01"),
        "withheld_amount": Decimal("0.00"),
        "gross_advance_amount": Decimal("168.01"),
        "prepayment_principal_amount": Decimal("168.01"),
        "withholding_id": None, "allocation_date": "2026-08-25", "status": "posted",
    }
    row.update(overrides)
    return row


def _posted(**overrides):
    party_id = uuid4()
    settlement_id = uuid4()
    prepayment_id = uuid4()
    row = {
        "payment_id": uuid4(), "payment_number": "SA-1", "payment_date": "2026-08-25",
        "branch_id": uuid4(), "supplier_account_id": uuid4(), "supplier_name": "Supplier",
        "party_id": party_id, "bank_account_id": uuid4(), "settlement_account_id": settlement_id,
        "supplier_prepayment_account_id": prepayment_id, "payment_method": "upi",
        "external_reference": "UPI-SA-1", "cash_disbursed_amount": Decimal("168.01"),
        "gross_advance_amount": Decimal("168.01"), "withheld_amount": Decimal("0.00"),
        "status": "posted", "accounting_event_id": uuid4(), "journal_entry_id": uuid4(),
        "journal_number": "JRN-1", "journal_debit_total": Decimal("168.01"),
        "journal_credit_total": Decimal("168.01"), "allocations": [_allocation()],
        "journal_lines": [
            {"journal_line_id": uuid4(), "line_number": 1, "account_id": prepayment_id,
             "party_id": party_id, "debit": Decimal("168.01"), "credit": Decimal("0.00")},
            {"journal_line_id": uuid4(), "line_number": 2, "account_id": settlement_id,
             "party_id": None, "debit": Decimal("0.00"), "credit": Decimal("168.01")},
        ],
        "allocation_reconciled": True, "journal_balanced": True,
        "prepayment_reconciled": True, "withholding_reconciled": True,
    }
    row.update(overrides)
    return row


def test_uuid_only_supplier_advance_context_and_readback_are_registered():
    routes = {route.path: route for route in reads.router.routes if isinstance(route, APIRoute)}
    assert routes["/canonical/supplier-advances/context"].endpoint is reads.supplier_advance_context
    assert routes["/canonical/supplier-advances/{payment_id}"].endpoint is reads.posted_supplier_advance
    main_source = (ROOT / "backend/app/main.py").read_text()
    assert "canonical_supplier_advance_reads" in main_source
    assert "api.include_router(canonical_supplier_advance_reads.router)" in main_source


def test_organization_business_date_uses_the_shared_canonical_clock(monkeypatch):
    organization_id = uuid4()
    captured = {}

    def fake_rows(_db, sql, params):
        captured["sql"] = sql
        captured["params"] = params
        return [{"business_date": reads.date(2026, 8, 28)}]

    monkeypatch.setattr(reads, "_rows", fake_rows)

    assert reads._organization_business_date(object(), organization_id) == reads.date(
        2026, 8, 28
    )
    assert "current_organization_business_date" in captured["sql"]
    assert "CURRENT_DATE" not in captured["sql"]
    assert captured["params"] == {}


def test_context_requires_exact_reconciled_po_line_remainder():
    branch_id = uuid4()
    response = reads.SupplierAdvanceContextResponse(
        ready=True, blocking_reasons=[], payment_date="2026-08-25",
        withholding_treatment="not_applicable_verified",
        branches=[{"branch_id": branch_id, "branch_code": "BR", "branch_name": "Branch"}],
        bank_accounts=[{"bank_account_id": uuid4(), "settlement_account_id": uuid4(),
                        "bank_name": "Bank", "account_holder_name": "Org",
                        "ifsc": "BANK0001", "currency_code": "INR"}],
        suppliers=[{"supplier_account_id": uuid4(), "party_id": uuid4(),
                    "supplier_code": "SUP", "supplier_name": "Supplier", "lines": [{
            "purchase_order_id": uuid4(), "branch_id": branch_id,
            "purchase_order_number": "PO-1", "order_date": "2026-08-20",
            "purchase_order_line_id": uuid4(), "line_number": 1,
            "product_id": uuid4(), "product_code": "SKU-1", "product_name": "Product",
            "uom_code": "EA", "ordered_quantity": Decimal("5"),
            "net_value_amount": Decimal("200.10"), "prior_active_gross": Decimal("32.09"),
            "remaining_advance_amount": Decimal("168.01"),
            "withholding_nature_code": "purchase_of_goods",
        }]}],
    )
    assert response.ready is True
    bad = response.model_dump()
    bad["suppliers"][0]["lines"][0]["remaining_advance_amount"] = Decimal("168.00")
    with pytest.raises(ValidationError, match="remaining amount does not reconcile"):
        reads.SupplierAdvanceContextResponse(**bad)


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"cash_disbursed_amount": Decimal("168.00")}, "allocation differs"),
        ({"journal_credit_total": Decimal("168.00")}, "journal is not balanced"),
        ({"allocations": []}, "lacks the exact allocation"),
        ({"allocations": [_allocation(withheld_amount=Decimal("0.01"))]}, "gross amount does not reconcile"),
    ],
)
def test_posted_supplier_advance_fails_closed_on_drift(override, message):
    with pytest.raises(ValidationError, match=message):
        reads.PostedSupplierAdvanceResponse(**_posted(**override))


def test_posted_supplier_advance_serializes_exact_decimal_strings():
    wire = reads.PostedSupplierAdvanceResponse(**_posted()).model_dump(mode="json")
    assert wire["gross_advance_amount"] == "168.01"
    assert wire["withheld_amount"] == "0.00"
    assert wire["allocations"][0]["prepayment_principal_amount"] == "168.01"

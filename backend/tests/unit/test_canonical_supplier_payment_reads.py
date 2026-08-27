from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.routing import APIRoute
from pydantic import ValidationError

from app.api.routes import canonical_supplier_payment_reads as reads
from app.main import app


def _allocation(**overrides):
    row = {
        "allocation_id": uuid4(), "open_item_id": uuid4(),
        "supplier_invoice_id": uuid4(), "supplier_invoice_number": "SUP-1",
        "amount": Decimal("40.01"), "principal_amount": Decimal("100.03"),
        "effective_allocated_amount": Decimal("60.02"),
        "residual_amount": Decimal("40.01"), "allocation_date": "2026-08-25",
    }
    row.update(overrides)
    return row


def _posted(**overrides):
    party_id = uuid4()
    settlement_id = uuid4()
    payable_id = uuid4()
    row = {
        "payment_id": uuid4(), "payment_number": "SP-1", "payment_date": "2026-08-25",
        "branch_id": uuid4(), "supplier_account_id": uuid4(), "supplier_name": "Supplier",
        "party_id": party_id, "bank_account_id": uuid4(), "settlement_account_id": settlement_id,
        "accounts_payable_account_id": payable_id, "payment_method": "upi",
        "external_reference": "UPI-1", "amount": Decimal("40.01"), "status": "posted",
        "journal_entry_id": uuid4(), "journal_number": "JRN-1",
        "journal_debit_total": Decimal("40.01"), "journal_credit_total": Decimal("40.01"),
        "allocations": [_allocation()],
        "journal_lines": [
            {"journal_line_id": uuid4(), "line_number": 1, "account_id": payable_id,
             "party_id": party_id, "debit": Decimal("40.01"), "credit": Decimal("0.00")},
            {"journal_line_id": uuid4(), "line_number": 2, "account_id": settlement_id,
             "party_id": None, "debit": Decimal("0.00"), "credit": Decimal("40.01")},
        ],
        "allocation_reconciled": True, "journal_balanced": True,
        "payable_residuals_reconciled": True,
    }
    row.update(overrides)
    return row


def test_uuid_only_context_and_readback_routes_are_registered():
    routes = {
        route.path: route
        for route in reads.router.routes
        if isinstance(route, APIRoute)
    }
    assert routes["/canonical/supplier-payments/context"].endpoint is reads.supplier_payment_context
    assert routes["/canonical/supplier-payments/{payment_id}"].endpoint is reads.posted_supplier_payment

    paths = app.openapi()["paths"]
    assert paths["/api/canonical/supplier-payments/context"]["get"]["operationId"].startswith(
        "supplier_payment_context"
    )
    assert paths["/api/canonical/supplier-payments/{payment_id}"]["get"]["operationId"].startswith(
        "posted_supplier_payment"
    )


def test_organization_business_date_uses_the_shared_canonical_clock(monkeypatch):
    organization_id = uuid4()
    captured = {}

    def fake_rows(_db, sql, params):
        captured["sql"] = sql
        captured["params"] = params
        return [{"business_date": date(2026, 8, 25)}]

    monkeypatch.setattr(reads, "_rows", fake_rows)

    assert reads._organization_business_date(object(), organization_id) == date(2026, 8, 25)
    assert "current_organization_business_date" in captured["sql"]
    assert "CURRENT_DATE" not in captured["sql"]
    assert captured["params"] == {}


@pytest.mark.parametrize("rows", [[], [{"business_date": "2026-08-25"}]])
def test_organization_business_date_fails_closed_without_a_valid_clock(monkeypatch, rows):
    monkeypatch.setattr(reads, "_rows", lambda *_args, **_kwargs: rows)

    with pytest.raises(HTTPException) as exc:
        reads._organization_business_date(object(), uuid4())

    assert exc.value.status_code == 503
    assert "authoritative business clock" in exc.value.detail


def test_posted_readback_preserves_exact_decimals_and_reconciles():
    result = reads.PostedSupplierPaymentResponse(**_posted())
    wire = result.model_dump(mode="json")
    assert wire["amount"] == "40.01"
    assert wire["allocations"][0]["effective_allocated_amount"] == "60.02"
    assert wire["allocations"][0]["residual_amount"] == "40.01"


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"amount": Decimal("40.02")}, "allocations do not equal"),
        ({"journal_credit_total": Decimal("40.00")}, "journal is not balanced"),
        ({"allocations": [_allocation(residual_amount=Decimal("40.00"))]}, "residual does not reconcile"),
        ({"journal_lines": []}, "lacks accounting evidence"),
    ],
)
def test_posted_readback_fails_closed_on_drift(override, message):
    with pytest.raises(ValidationError, match=message):
        reads.PostedSupplierPaymentResponse(**_posted(**override))


def test_context_readiness_requires_branch_bank_and_payable():
    branch = {"branch_id": uuid4(), "branch_code": "BR", "branch_name": "Branch"}
    bank = {"bank_account_id": uuid4(), "settlement_account_id": uuid4(), "bank_name": "Bank",
            "account_holder_name": "Org", "ifsc": "BANK0001", "currency_code": "INR"}
    item = {"open_item_id": uuid4(), "supplier_invoice_id": uuid4(), "branch_id": branch["branch_id"],
            "document_number": "SUP-1", "document_date": "2026-08-01", "due_date": "2026-08-20",
            "principal_amount": Decimal("100.03"), "allocated_amount": Decimal("60.02"),
            "outstanding_amount": Decimal("40.01")}
    response = reads.SupplierPaymentContextResponse(
        ready=True, blocking_reasons=[], payment_date="2026-08-25",
        branches=[branch], bank_accounts=[bank], suppliers=[{
            "supplier_account_id": uuid4(), "party_id": uuid4(), "supplier_code": "SUP",
            "supplier_name": "Supplier", "open_items": [item],
        }],
    )
    assert response.ready is True
    with pytest.raises(ValidationError, match="readiness is inconsistent"):
        reads.SupplierPaymentContextResponse(
            ready=True, blocking_reasons=[], payment_date="2026-08-25",
            branches=[], bank_accounts=[bank], suppliers=[],
        )

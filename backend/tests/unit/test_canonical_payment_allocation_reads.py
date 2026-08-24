import inspect
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.api.routes import canonical_erp_reads
from app.api.routes.finance.allocation import routes as legacy_allocation_routes
from app.main import app


class _Database:
    def __init__(self):
        self.statements = []

    def execute(self, statement, params):
        self.statements.append((str(statement), params))
        return SimpleNamespace()


def _user(org_id):
    return {
        "org_id": str(org_id),
        "auth_user_id": str(uuid4()),
        "branch_ids": [str(uuid4())],
        "is_admin": False,
        "data_access_level": "branch",
        "branch_scope": "assigned",
    }


def test_canonical_unpaid_invoices_preserves_uuid_ids_and_public_contract(monkeypatch):
    org_id = uuid4()
    customer_id = uuid4()
    invoice_id = uuid4()
    open_item_id = uuid4()
    branch_id = uuid4()
    database = _Database()
    user = _user(org_id)

    monkeypatch.setattr(canonical_erp_reads, "_canonical_receivable_rows", lambda *_: [{
        "customer_id": customer_id,
        "customer_name": "Demo Customer",
        "invoices": [{
            "invoice_id": invoice_id,
            "open_item_id": open_item_id,
            "branch_id": branch_id,
            "invoice_number": "DEMO-SI-1",
            "invoice_date": date(2026, 8, 24),
            "original_amount": Decimal("168.00"),
            "paid_amount": Decimal("18.00"),
            "current_outstanding": Decimal("150.00"),
            "status": "partial",
        }],
    }])

    payload = canonical_erp_reads.canonical_unpaid_invoices(
        customer_id=customer_id,
        user=user,
        db=database,
    )

    assert payload == {"invoices": [{
        "invoice_id": invoice_id,
        "open_item_id": open_item_id,
        "branch_id": branch_id,
        "invoice_number": "DEMO-SI-1",
        "invoice_date": date(2026, 8, 24),
        "customer_id": customer_id,
        "customer_name": "Demo Customer",
        "total_amount": "168.00",
        "allocated": "18.00",
        "due": "150.00",
        "payment_status": "partial",
    }], "invoice_count": 1}
    assert "erp_security.activate_context" in database.statements[0][0]


def test_canonical_unpaid_invoices_filters_by_customer(monkeypatch):
    org_id = uuid4()
    customer_id = uuid4()
    other_customer_id = uuid4()
    database = _Database()
    user = _user(org_id)
    monkeypatch.setattr(canonical_erp_reads, "_canonical_receivable_rows", lambda *_: [
        {"customer_id": other_customer_id, "customer_name": "Other", "invoices": [{
            "invoice_id": uuid4(), "current_outstanding": Decimal("1.00")
        }]},
        {"customer_id": customer_id, "customer_name": "Chosen", "invoices": [{
            "invoice_id": uuid4(), "open_item_id": uuid4(),
            "branch_id": user["branch_ids"][0],
            "invoice_number": "DEMO-SI-2",
            "invoice_date": date(2026, 8, 24),
            "original_amount": Decimal("2.00"),
            "paid_amount": Decimal("0.00"),
            "current_outstanding": Decimal("2.00"),
            "status": "pending",
        }]},
    ])

    payload = canonical_erp_reads.canonical_unpaid_invoices(
        customer_id=customer_id,
        user=user,
        db=database,
    )

    assert len(payload["invoices"]) == 1
    assert payload["invoice_count"] == 1
    assert payload["invoices"][0]["customer_id"] == customer_id


def test_unpaid_invoice_response_rejects_cardinality_and_duplicate_open_items():
    row = {
        "invoice_id": uuid4(), "open_item_id": uuid4(), "branch_id": uuid4(),
        "invoice_number": "SI-1", "invoice_date": date(2026, 8, 25),
        "customer_id": uuid4(), "customer_name": "Customer",
        "total_amount": "10.00", "allocated": "0.00", "due": "10.00",
        "payment_status": "pending",
    }
    with pytest.raises(ValidationError, match="cardinality"):
        canonical_erp_reads.CanonicalUnpaidInvoicesResponse(
            invoices=[row], invoice_count=2
        )
    with pytest.raises(ValidationError, match="repeats an open item"):
        canonical_erp_reads.CanonicalUnpaidInvoicesResponse(
            invoices=[row, {**row, "invoice_id": uuid4()}], invoice_count=2
        )


def test_canonical_payment_routes_publish_uuid_and_exact_money_openapi_contract():
    schema = app.openapi()
    unpaid = schema["paths"]["/api/payment-allocation/unpaid-invoices"]["get"]
    customer_parameter = next(
        parameter for parameter in unpaid["parameters"]
        if parameter["name"] == "customer_id"
    )
    assert customer_parameter["schema"]["anyOf"][0] == {
        "type": "string", "format": "uuid"
    }
    unpaid_response = unpaid["responses"]["200"]["content"]["application/json"]["schema"]
    assert unpaid_response == {"$ref": "#/components/schemas/CanonicalUnpaidInvoicesResponse"}

    payment_path = "/api/payment-allocation/invoice/{invoice_id}/payments"
    payment_operation = schema["paths"][payment_path]["get"]
    invoice_parameter = next(
        parameter for parameter in payment_operation["parameters"]
        if parameter["name"] == "invoice_id"
    )
    assert invoice_parameter["schema"] == {
        "type": "string", "format": "uuid", "title": "Invoice Id"
    }
    receipt_path = "/api/payment-allocation/payment/{payment_id}/readback"
    receipt_operation = schema["paths"][receipt_path]["get"]
    receipt_response = receipt_operation["responses"]["200"]["content"]["application/json"]["schema"]
    assert receipt_response == {"$ref": "#/components/schemas/CanonicalCustomerReceiptReadback"}
    legacy_source = inspect.getsource(legacy_allocation_routes)
    assert '@router.get("/unpaid-invoices")' not in legacy_source
    assert '@router.get("/invoice/{invoice_id}/payments")' not in legacy_source


def test_canonical_invoice_payment_history_preserves_ids_and_money(monkeypatch):
    org_id = uuid4()
    invoice_id = uuid4()
    allocation_id = uuid4()
    payment_id = uuid4()
    database = _Database()
    queued_rows = iter([
        [{
            "invoice_id": invoice_id,
            "invoice_number": "DEMO-SI-1",
            "total_amount": Decimal("168.00"),
            "allocated_amount": Decimal("18.00"),
            "due_amount": Decimal("150.00"),
            "payment_status": "partial",
        }],
        [{
            "allocation_id": allocation_id,
            "payment_id": payment_id,
            "payment_number": "DEMO-RCPT-1",
            "payment_date": date(2026, 8, 24),
            "payment_amount": Decimal("18.00"),
            "allocated_amount": Decimal("18.00"),
            "allocation_date": date(2026, 8, 24),
        }],
    ])
    statements = []

    def fake_rows(_db, sql, params):
        statements.append((sql, params))
        return next(queued_rows)

    monkeypatch.setattr(canonical_erp_reads, "_rows", fake_rows)
    payload = canonical_erp_reads.canonical_invoice_payments(
        invoice_id=invoice_id,
        user=_user(org_id),
        db=database,
    )

    assert payload["invoice"]["total_amount"] == "168.00"
    assert payload["invoice"]["due_amount"] == "150.00"
    assert payload["payments"][0]["allocation_id"] == allocation_id
    assert payload["payments"][0]["payment_id"] == payment_id
    assert payload["payments"][0]["payment_amount"] == "18.00"
    assert "finance.accounting_events" in statements[0][0]
    assert "invoice.branch_id=ANY" in statements[0][0]
    assert "finance.allocations allocation" in statements[1][0]
    assert "reversal_of_allocation_id" in statements[1][0]


def test_receivable_query_uses_canonical_ids_and_branch_scope():
    constants = "\n".join(
        constant for constant in canonical_erp_reads._canonical_receivable_rows.__code__.co_consts
        if isinstance(constant, str)
    )

    assert "item.id AS open_item_id" in constants
    assert "invoice.id AS sales_invoice_id" in constants
    assert "invoice.branch_id=ANY" in constants
    assert "sales.invoices invoice" in constants
    assert "finance.open_items item" in constants
    assert "financial.allocations" not in constants


def test_customer_receipt_readback_reconciles_open_item_and_two_line_journal(monkeypatch):
    org_id = uuid4()
    payment_id = uuid4()
    branch_id = uuid4()
    party_id = uuid4()
    settlement_id = uuid4()
    open_item_id = uuid4()
    journal_id = uuid4()
    database = _Database()
    user = _user(org_id)
    user["branch_ids"] = [str(branch_id)]
    queued = iter([
        [{
            "payment_id": payment_id, "payment_number": "RCPT-4",
            "payment_date": date(2026, 8, 25), "branch_id": branch_id,
            "party_id": party_id, "settlement_account_id": settlement_id,
            "payment_method": "upi", "external_reference": "UPI-168",
            "amount": Decimal("168.00"), "status": "posted",
            "journal_entry_id": journal_id, "journal_number": "JV-4",
            "journal_debit_total": Decimal("168.00"),
            "journal_credit_total": Decimal("168.00"),
        }],
        [{
            "allocation_id": uuid4(), "open_item_id": open_item_id,
            "amount": Decimal("168.00"), "allocation_date": date(2026, 8, 25),
        }],
        [
            {"journal_line_id": uuid4(), "line_number": 1,
             "account_id": settlement_id, "party_id": None,
             "transaction_debit": Decimal("168.00"), "transaction_credit": Decimal("0"),
             "functional_debit": Decimal("168.00"), "functional_credit": Decimal("0")},
            {"journal_line_id": uuid4(), "line_number": 2,
             "account_id": uuid4(), "party_id": party_id,
             "transaction_debit": Decimal("0"), "transaction_credit": Decimal("168.00"),
             "functional_debit": Decimal("0"), "functional_credit": Decimal("168.00")},
        ],
    ])
    statements = []

    def rows(_db, sql, params):
        statements.append(sql)
        assert params["payment_id"] == payment_id
        return next(queued)

    monkeypatch.setattr(canonical_erp_reads, "_rows", rows)
    payload = canonical_erp_reads.canonical_customer_receipt_readback(
        payment_id=payment_id, user=user, db=database
    )
    validated = canonical_erp_reads.CanonicalCustomerReceiptReadback.model_validate(payload)
    assert validated.allocation_reconciled is True
    assert validated.journal_balanced is True
    assert validated.allocations[0].open_item_id == open_item_id
    assert "payment.status='posted'" in statements[0]
    assert "journal.status='posted'" in statements[0]


def test_customer_receipt_readback_model_rejects_missing_evidence():
    base = {
        "payment_id": uuid4(), "payment_number": "RCPT-4",
        "payment_date": date(2026, 8, 25), "branch_id": uuid4(),
        "party_id": uuid4(), "settlement_account_id": uuid4(),
        "payment_method": "upi", "external_reference": "UPI-168",
        "amount": "168.00", "status": "posted", "journal_entry_id": uuid4(),
        "journal_number": "JV-4", "journal_debit_total": "168.00",
        "journal_credit_total": "168.00", "allocations": [], "journal_lines": [],
        "allocation_reconciled": True, "journal_balanced": True,
    }
    with pytest.raises(ValidationError, match="allocation evidence"):
        canonical_erp_reads.CanonicalCustomerReceiptReadback(**base)

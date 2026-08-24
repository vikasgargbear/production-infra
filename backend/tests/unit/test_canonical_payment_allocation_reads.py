import inspect
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

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
    database = _Database()
    user = _user(org_id)

    monkeypatch.setattr(canonical_erp_reads, "_canonical_receivable_rows", lambda *_: [{
        "customer_id": customer_id,
        "customer_name": "Demo Customer",
        "invoices": [{
            "invoice_id": invoice_id,
            "open_item_id": open_item_id,
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

    assert payload["invoices"] == [{
        "invoice_id": invoice_id,
        "open_item_id": open_item_id,
        "invoice_number": "DEMO-SI-1",
        "invoice_date": date(2026, 8, 24),
        "customer_id": customer_id,
        "customer_name": "Demo Customer",
        "total_amount": "168.00",
        "allocated": "18.00",
        "due": "150.00",
        "payment_status": "partial",
    }]
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
    assert payload["invoices"][0]["customer_id"] == customer_id


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

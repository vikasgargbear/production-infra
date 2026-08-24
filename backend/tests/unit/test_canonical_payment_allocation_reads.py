from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from app.api.services.finance.allocation.service import AllocationService


class _Database:
    def __init__(self, rows):
        self.rows = rows
        self.statements = []
        self.params = []

    def execute(self, statement, params):
        self.statements.append(str(statement))
        self.params.append(params)
        return [SimpleNamespace(_mapping=row) for row in self.rows]


def test_uuid_customer_outstanding_uses_canonical_open_items_and_preserves_ids():
    customer_id = uuid4()
    invoice_id = uuid4()
    open_item_id = uuid4()
    database = _Database([{
        "invoice_id": invoice_id,
        "open_item_id": open_item_id,
        "invoice_number": "DEMO-SI-1",
        "invoice_date": None,
        "customer_id": customer_id,
        "customer_name": "Demo Customer",
        "final_amount": Decimal("168.00"),
        "allocated_amount": Decimal("18.00"),
        "due_amount": Decimal("150.00"),
        "payment_status": "partial",
    }])

    rows = AllocationService.get_unpaid_invoices(database, "org-1", customer_id)

    statement = database.statements[0]
    assert "FROM sales.invoices invoice" in statement
    assert "JOIN finance.open_items item" in statement
    assert "FROM finance.allocations allocation" in statement
    assert "invoice.org_id=:org_id" in statement
    assert "account.id = :customer_id" in statement
    assert database.params[0]["customer_id"] == customer_id
    assert rows[0]["invoice_id"] == invoice_id
    assert rows[0]["open_item_id"] == open_item_id


def test_uuid_invoice_payment_read_never_dispatches_to_legacy_integer_tables():
    invoice_id = uuid4()
    database = _Database([])

    assert AllocationService.get_invoice_payments(database, "org-1", invoice_id) == []

    statement = database.statements[0]
    assert "FROM finance.accounting_events event" in statement
    assert "JOIN finance.allocations allocation" in statement
    assert "financial.allocations" not in statement
    assert database.params[0]["invoice_id"] == invoice_id

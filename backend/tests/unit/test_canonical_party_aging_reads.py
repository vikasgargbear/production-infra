from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.api.routes import canonical_party_aging_reads as reads
from app.main import app


class _Result:
    def __init__(self, rows=None, scalar=None):
        self.rows = rows or []
        self.scalar = scalar

    def fetchall(self):
        return [SimpleNamespace(_mapping=row) for row in self.rows]

    def scalar_one(self):
        return self.scalar


class _Database:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def execute(self, statement, params=None):
        sql = str(statement)
        self.calls.append((sql, params))
        if "WITH business_clock" in sql:
            return _Result(self.rows)
        if "current_organization_business_date" in sql:
            return _Result(scalar=date(2026, 8, 28))
        return _Result()


def _row(party_type="customer"):
    customer = party_type == "customer"
    return {
        "org_id": uuid4(),
        "branch_id": uuid4(),
        "document_id": uuid4(),
        "document_kind": "sales_invoice" if customer else "supplier_invoice",
        "party_account_id": uuid4(),
        "party_id": uuid4(),
        "party_code": "CUST-1" if customer else "SUP-1",
        "party_name": "Exact Party",
        "account_status": "closed",
        "limit_amount": Decimal("1000.00") if customer else None,
        "open_item_id": uuid4(),
        "document_number": "INV-1",
        "document_date": date(2026, 7, 1),
        "due_date": date(2026, 7, 15),
        "principal_amount": Decimal("9007199254740993.01"),
        "settled_amount": Decimal("0.01"),
        "outstanding_amount": Decimal("9007199254740993.00"),
        "days_overdue": 44,
        "as_of_date": date(2026, 8, 28),
        "phone": None,
        "email": None,
    }


@pytest.mark.parametrize("party_type", ["customer", "supplier"])
def test_query_returns_exact_reconciled_receivable_and_payable_aging(party_type):
    row = _row(party_type)
    db = _Database([row])
    branch_id = row["branch_id"]

    payload = reads.query_party_aging(
        db,
        org_id=row["org_id"],
        party_type=party_type,
        organization_scope=False,
        branch_ids=[branch_id],
    )

    assert payload["party_type"] == party_type
    assert payload["summary"]["total_outstanding"] == "9007199254740993.00"
    assert payload["summary"]["buckets"]["31-60"] == {
        "amount": "9007199254740993.00",
        "document_count": 1,
    }
    document = payload["parties"][0]["documents"][0]
    assert document["settled_amount"] == "0.01"
    assert document["outstanding_amount"] == "9007199254740993.00"
    assert db.calls[0][1]["branch_ids"] == [branch_id]
    assert db.calls[0][1]["organization_scope"] is False


def test_empty_aging_is_an_exact_empty_set_not_a_fake_party():
    payload = reads.query_party_aging(
        _Database([]),
        org_id=uuid4(),
        party_type="supplier",
        organization_scope=True,
        branch_ids=[],
    )
    assert payload["parties"] == []
    assert payload["summary"]["total_outstanding"] == "0.00"
    assert payload["summary"]["party_count"] == 0
    assert payload["summary"]["document_count"] == 0


def test_response_rejects_numeric_money_and_summary_drift():
    row = _row()
    payload = reads.query_party_aging(
        _Database([row]),
        org_id=row["org_id"],
        party_type="customer",
        organization_scope=True,
        branch_ids=[],
    )
    payload["summary"]["total_outstanding"] = 1
    with pytest.raises(ValidationError):
        reads.PartyAgingResponse.model_validate(payload)

    payload = reads.query_party_aging(
        _Database([row]),
        org_id=row["org_id"],
        party_type="customer",
        organization_scope=True,
        branch_ids=[],
    )
    payload["summary"]["document_count"] = 2
    with pytest.raises(ValidationError, match="document count"):
        reads.PartyAgingResponse.model_validate(payload)


def test_sql_is_org_branch_status_allocation_and_reversal_scoped():
    sql = reads._AGING_SQL
    for fragment in (
        "invoice.org_id=:org_id",
        "invoice.status='posted'",
        "item.status='open'",
        "document.branch_id=ANY",
        "allocation.status='posted'",
        "reversal.reversal_of_allocation_id=allocation.id",
        "current_organization_business_date",
        "item.item_side=CASE",
        "item.currency_code='INR'",
    ):
        assert fragment in sql
    assert "account.status IN ('active','on_hold')" not in sql
    assert "party.status='active'" not in sql


def test_contract_requires_all_buckets_and_exact_derived_status():
    row = _row()
    payload = reads.query_party_aging(
        _Database([row]), org_id=row["org_id"], party_type="customer",
        organization_scope=True, branch_ids=[],
    )
    payload["summary"]["buckets"].pop("over_90")
    with pytest.raises(ValidationError, match="every canonical bucket"):
        reads.PartyAgingResponse.model_validate(payload)

    payload = reads.query_party_aging(
        _Database([row]), org_id=row["org_id"], party_type="customer",
        organization_scope=True, branch_ids=[],
    )
    payload["parties"][0]["documents"][0]["status"] = "partial"
    with pytest.raises(ValidationError, match="aging status"):
        reads.PartyAgingResponse.model_validate(payload)


def test_openapi_exposes_one_typed_read_only_party_aging_route():
    operation = app.openapi()["paths"]["/api/canonical/party-aging"]
    assert set(operation) == {"get"}
    parameter = next(
        item for item in operation["get"]["parameters"] if item["name"] == "party_type"
    )
    assert set(parameter["schema"]["enum"]) == {"customer", "supplier"}

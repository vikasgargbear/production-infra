from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.routes import canonical_payment_history_reads as reads
from app.main import app


def _user(org_id, branch_id):
    return {
        "org_id": str(org_id),
        "auth_user_id": str(uuid4()),
        "branch_ids": [str(branch_id)],
        "is_admin": False,
        "data_access_level": "branch",
        "branch_scope": "assigned",
    }


def _history(**overrides):
    amount = "9007199254740993.01"
    row = {
        "payment_id": uuid4(),
        "command_request_id": uuid4(),
        "payment_number": "RCPT-9007",
        "payment_date": date(2026, 8, 25),
        "branch_id": uuid4(),
        "party_id": uuid4(),
        "party_name": "Exact Customer",
        "direction": "received",
        "payment_method": "upi",
        "external_reference": "UPI-EXACT",
        "amount": amount,
        "allocated_amount": amount,
        "allocation_count": 1,
        "journal_entry_id": uuid4(),
        "journal_number": "JV-9007",
        "journal_debit_total": amount,
        "journal_credit_total": amount,
        "allocation_reconciled": True,
        "journal_balanced": True,
        "open_item_residuals_reconciled": True,
        "status": "posted",
    }
    row.update(overrides)
    return row


class _ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar_one(self):
        return self.value


class _Database:
    def __init__(self, total=0):
        self.total = total
        self.statements = []

    def execute(self, statement, params):
        sql = str(statement)
        self.statements.append((sql, params))
        if "SELECT COUNT(*) FROM authoritative_payments" in sql:
            return _ScalarResult(self.total)
        return SimpleNamespace()


def test_list_preserves_exact_money_and_authoritative_total(monkeypatch):
    org_id = uuid4()
    branch_id = uuid4()
    database = _Database(total=57)
    row = _history(branch_id=branch_id)
    monkeypatch.setattr(reads, "_rows", lambda _db, _sql, _params: [row])

    response = reads.canonical_payment_history(
        direction="received",
        date_from=date(2026, 8, 1),
        date_to=date(2026, 8, 31),
        search=" Exact ",
        page=3,
        page_size=25,
        user=_user(org_id, branch_id),
        db=database,
    )
    wire = reads.CanonicalPaymentHistoryResponse(**response).model_dump(mode="json")

    assert wire["items"][0]["amount"] == "9007199254740993.01"
    assert wire["total"] == 57
    assert wire["page"] == 3
    count_sql, params = database.statements[1]
    assert "payment.direction=:direction" in count_sql
    assert "payment.payment_date>=CAST(:date_from AS date)" in count_sql
    assert "payment.party_name ILIKE" in count_sql
    assert params["direction"] == "received"
    assert params["search"] == "Exact"
    assert params["offset"] == 50


def test_list_rejects_invalid_date_range():
    with pytest.raises(HTTPException) as error:
        reads.canonical_payment_history(
            direction="all",
            date_from=date(2026, 8, 26),
            date_to=date(2026, 8, 25),
            search=None,
            page=1,
            page_size=25,
            user=_user(uuid4(), uuid4()),
            db=_Database(),
        )
    assert error.value.status_code == 422
    assert "date range" in str(error.value.detail)


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"allocated_amount": "1.00"}, "allocations do not reconcile"),
        ({"journal_credit_total": "1.00"}, "journal does not balance"),
        ({"allocation_reconciled": False}, "literal_error"),
    ],
)
def test_history_model_fails_closed_on_accounting_drift(override, message):
    with pytest.raises(ValidationError, match=message):
        reads.CanonicalPaymentHistoryItem(**_history(**override))


def test_detail_reconciles_allocation_residual_and_journal():
    row = _history(amount=Decimal("168.00"), allocated_amount=Decimal("168.00"),
                   journal_debit_total=Decimal("168.00"), journal_credit_total=Decimal("168.00"))
    allocation = {
        "allocation_id": uuid4(),
        "open_item_id": uuid4(),
        "source_document_id": uuid4(),
        "source_document_number": "SI-168",
        "source_document_type": "sales_invoice",
        "allocation_date": date(2026, 8, 25),
        "amount": "168.00",
        "principal_amount": "200.00",
        "effective_allocated_amount": "168.00",
        "residual_amount": "32.00",
    }
    model = reads.CanonicalPaymentDetail(
        **reads._wire_history_row(row),
        allocations=[allocation],
        journal_lines=[
            {"journal_line_id": uuid4(), "line_number": 1, "account_id": uuid4(),
             "party_id": None, "debit": "168.00", "credit": "0.00"},
            {"journal_line_id": uuid4(), "line_number": 2, "account_id": uuid4(),
             "party_id": row["party_id"], "debit": "0.00", "credit": "168.00"},
        ],
    )
    assert model.allocations[0].residual_amount == "32.00"


def test_sql_is_command_bound_branch_scoped_and_reversal_safe():
    source = reads._EVIDENCE_CTES
    assert "finance.customer_receipt.prepare" in source
    assert "finance.supplier_payment.prepare" in source
    assert "erp_automation_reads.payment_post_provenance" in source
    assert "payment.payment_purpose='commercial_settlement'" in source
    assert "payment.branch_id=ANY" in source
    assert "reversal.reversal_of_payment_id=payment.id" in source
    assert "reversal.reversal_of_allocation_id=allocation.id" in source
    assert "reversal.reversal_of_journal_entry_id=journal.id" in source
    assert "financial." not in source


def test_openapi_registers_typed_list_and_uuid_detail():
    paths = app.openapi()["paths"]
    assert paths["/api/canonical/payment-history"]["get"]["responses"]["200"][
        "content"
    ]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/CanonicalPaymentHistoryResponse"
    }
    parameter = next(
        item for item in paths["/api/canonical/payment-history/{payment_id}"]["get"]["parameters"]
        if item["name"] == "payment_id"
    )
    assert parameter["schema"]["format"] == "uuid"

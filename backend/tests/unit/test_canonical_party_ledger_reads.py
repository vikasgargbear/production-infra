from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.routes import canonical_party_ledger_reads as reads
from app.main import app


def _user(org_id, branch_id):
    return {"org_id": str(org_id), "auth_user_id": str(uuid4()), "branch_ids": [str(branch_id)],
            "is_admin": False, "data_access_level": "branch", "branch_scope": "assigned"}


def _statement(**overrides):
    row = {
        "party_account_id": uuid4(), "party_id": uuid4(), "party_type": "customer",
        "party_name": "Exact Customer", "account_id": uuid4(), "currency_code": "INR",
        "date_from": date(2026, 8, 1), "date_to": date(2026, 8, 31),
        "opening_balance": "9007199254740993.00", "page_opening_balance": "9007199254740993.00",
        "closing_balance": "9007199254740993.30",
        "total_debit": "0.30", "total_credit": "0.00", "page": 1, "page_size": 100, "total": 2,
        "items": [
            {"journal_entry_id": uuid4(), "journal_line_id": uuid4(), "accounting_event_id": uuid4(),
             "source_document_id": uuid4(), "source_type": "sales_invoice", "journal_number": "JV-1",
             "posting_date": date(2026, 8, 2), "line_number": 1, "description": "First",
             "debit": "0.10", "credit": "0.00", "running_balance": "9007199254740993.10"},
            {"journal_entry_id": uuid4(), "journal_line_id": uuid4(), "accounting_event_id": uuid4(),
             "source_document_id": uuid4(), "source_type": "sales_invoice", "journal_number": "JV-2",
             "posting_date": date(2026, 8, 3), "line_number": 1, "description": "Second",
             "debit": "0.20", "credit": "0.00", "running_balance": "9007199254740993.30"},
        ],
    }
    row.update(overrides)
    return row


def test_model_preserves_exact_money_above_js_integer_and_decimal_addition():
    model = reads.PartyLedgerStatement(**_statement())
    wire = model.model_dump(mode="json")
    assert wire["opening_balance"] == "9007199254740993.00"
    assert wire["closing_balance"] == "9007199254740993.30"
    assert wire["total_debit"] == "0.30"


def test_model_rejects_numeric_json_and_running_balance_drift():
    with pytest.raises(ValidationError, match="string_type"):
        reads.PartyLedgerStatement(**_statement(opening_balance=9007199254740993))
    invalid = _statement()
    invalid["items"][1]["running_balance"] = "9007199254740993.29"
    with pytest.raises(ValidationError, match="running balance"):
        reads.PartyLedgerStatement(**invalid)


def test_sql_is_org_branch_account_and_reversal_scoped_with_deterministic_order():
    sql = reads._STATEMENT_SQL
    assert "account.org_id=:org_id" in sql
    assert "line.branch_id=ANY" in sql
    assert "line.account_id=selected.account_id" in sql
    assert "journal.status='posted'" in sql
    assert "reversal.reversal_of_journal_entry_id=journal.id" in sql
    assert "journal.reversal_of_journal_entry_id IS NULL" in sql
    assert "ORDER BY posting_date, journal_entry_id, line_number, journal_line_id" in sql
    assert "HAVING COUNT(*)=1" in sql


class _Rows:
    def __init__(self, rows): self._rows = rows
    def fetchall(self): return [SimpleNamespace(_mapping=row) for row in self._rows]


class _Database:
    def __init__(self, rows): self.rows, self.calls = rows, []
    def execute(self, statement, params):
        self.calls.append((str(statement), params))
        return SimpleNamespace() if len(self.calls) == 1 else _Rows(self.rows)


def test_endpoint_wires_decimal_values_and_uuid_scope():
    org_id, branch_id, account_id, party_id, control_id = uuid4(), uuid4(), uuid4(), uuid4(), uuid4()
    event_id, journal_id, line_id, source_id = uuid4(), uuid4(), uuid4(), uuid4()
    rows = [{"party_account_id": account_id, "party_id": party_id, "account_id": control_id,
             "party_name": "Exact Customer", "party_type": "customer",
             "opening_balance": Decimal("0.00"), "closing_balance": Decimal("0.30"),
             "balance_before": Decimal("0.00"),
             "total_debit": Decimal("0.30"), "total_credit": Decimal("0.00"), "total": 1,
             "journal_entry_id": journal_id, "journal_line_id": line_id, "accounting_event_id": event_id,
             "source_document_id": source_id, "source_type": "sales_invoice", "journal_number": "JV-1",
             "posting_date": date(2026, 8, 25), "line_number": 1, "description": "Exact",
             "debit": Decimal("0.30"), "credit": Decimal("0.00"), "running_balance": Decimal("0.30")}]
    db = _Database(rows)
    response = reads.get_party_statement(account_id, "customer", date(2026, 8, 1), date(2026, 8, 31),
                                         1, 100, _user(org_id, branch_id), db)
    wire = reads.PartyLedgerStatement(**response).model_dump(mode="json")
    assert wire["items"][0]["debit"] == "0.30"
    assert db.calls[1][1]["branch_ids"] == [branch_id]
    assert db.calls[1][1]["party_account_id"] == account_id


def test_invalid_date_range_fails_before_database_access():
    db = _Database([])
    with pytest.raises(HTTPException, match="date_to"):
        reads.get_party_statement(uuid4(), "customer", date(2026, 8, 2), date(2026, 8, 1),
                                  1, 100, _user(uuid4(), uuid4()), db)
    assert db.calls == []


def test_openapi_registers_uuid_typed_read_only_statement():
    operation = app.openapi()["paths"]["/api/canonical/party-ledger/{party_account_id}"]
    assert set(operation) == {"get"}
    parameter = next(item for item in operation["get"]["parameters"] if item["name"] == "party_account_id")
    assert parameter["schema"]["format"] == "uuid"

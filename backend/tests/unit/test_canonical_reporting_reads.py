from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.routes import canonical_reporting_reads as reads
from app.main import app


class _Rows:
    def __init__(self, rows):
        self.rows = rows

    def fetchall(self):
        return [SimpleNamespace(_mapping=row) for row in self.rows]


def test_trial_balance_preserves_exact_money_and_reconciles_every_row():
    account_id = uuid4()
    rows = [{
        "account_id": account_id, "account_code": "1100",
        "account_name": "Receivables", "account_type": "asset",
        "opening_balance": Decimal("9007199254740993.01"),
        "period_debit": Decimal("0.19"), "period_credit": Decimal("0.10"),
    }]
    db = SimpleNamespace(execute=lambda *_args, **_kwargs: _Rows(rows))
    payload = reads.query_trial_balance(
        db, org_id=uuid4(), date_from=date(2026, 8, 1),
        date_to=date(2026, 8, 31), organization_scope=False,
        branch_ids=[uuid4()],
    )
    assert payload["rows"][0]["closing_balance"] == "9007199254740993.10"
    assert payload["total_period_debit"] == "0.19"
    assert payload["period_balanced"] is False


def test_profit_loss_model_rejects_result_or_account_drift():
    account_id = uuid4()
    payload = {
        "contract_version": "1.0.0",
        "definition_version": "canonical-factual-v1",
        "currency_code": "INR",
        "date_from": date(2026, 8, 1),
        "date_to": date(2026, 8, 31),
        "income": "100.00", "expenses": "40.00", "result": "60.00",
        "rows": [
            {"account_id": account_id, "account_code": "4000",
             "account_name": "Sales", "account_type": "income", "amount": "100.00"},
            {"account_id": uuid4(), "account_code": "5000",
             "account_name": "Expense", "account_type": "expense", "amount": "40.00"},
        ],
    }
    reads.ProfitLossResponse.model_validate(payload)
    with pytest.raises(ValidationError, match="result"):
        reads.ProfitLossResponse.model_validate({**payload, "result": "59.99"})


def test_customer_activity_model_is_billed_fact_not_lifecycle_policy():
    payload = {
        "contract_version": "1.0.0",
        "definition_version": "canonical-factual-v1",
        "currency_code": "INR",
        "date_from": date(2026, 8, 1), "date_to": date(2026, 8, 31),
        "transacting_customer_count": 1, "invoice_count": 2,
        "billed_sales": "30.00",
        "customers": [{
            "customer_account_id": uuid4(), "party_id": uuid4(),
            "customer_code": "CUST-1", "customer_name": "Buyer",
            "account_status": "active", "invoice_count": 2,
            "billed_sales": "30.00", "first_invoice_date": date(2026, 8, 1),
            "last_invoice_date": date(2026, 8, 2),
        }],
    }
    reads.CustomerActivityResponse.model_validate(payload)
    with pytest.raises(ValidationError, match="invoice count"):
        reads.CustomerActivityResponse.model_validate({**payload, "invoice_count": 3})


def test_report_period_rejects_inversion_and_unbounded_ranges():
    with pytest.raises(HTTPException) as inverted:
        reads._period(date(2026, 8, 2), date(2026, 8, 1))
    assert inverted.value.status_code == 422
    with pytest.raises(HTTPException) as unbounded:
        reads._period(date(2000, 1, 1), date(2026, 8, 1))
    assert unbounded.value.status_code == 422


def test_sql_uses_only_effective_posted_branch_scoped_canonical_evidence():
    for fragment in (
        "journal.org_id=:org_id",
        "journal.status='posted'",
        "journal.reversal_of_journal_entry_id IS NULL",
        "reversal.reversal_of_journal_entry_id=journal.id",
        "line.branch_id=ANY",
        "account.account_type",
        "line.functional_debit AS debit",
        "line.functional_credit AS credit",
    ):
        assert fragment in reads._TRIAL_BALANCE_SQL
    for fragment in (
        "invoice.org_id=:org_id",
        "invoice.status='posted'",
        "invoice.invoice_date BETWEEN :date_from AND :date_to",
        "invoice.branch_id=ANY",
        "SUM(invoice.grand_total)",
        "invoice.currency_code='INR'",
    ):
        assert fragment in reads._CUSTOMER_ACTIVITY_SQL


def test_customer_activity_does_not_leak_unscoped_account_population():
    source = __import__("inspect").getsource(reads.query_customer_activity)
    assert "FROM parties.customer_accounts WHERE org_id=:org_id" not in source
    assert "active_account_count" not in source
    assert "on_hold_account_count" not in source


def test_manifest_forbids_unreviewed_management_policy():
    source = (
        __import__("pathlib").Path(__file__).parents[3]
        / "docs/architecture/canonical-report-projections-v1.json"
    ).read_text(encoding="utf-8")
    assert '"definition_version": "canonical-factual-v1"' in source
    assert "customer churn" in source
    assert "cash-flow classification" in source
    assert "customer_billed_activity" in source


def test_openapi_exposes_only_typed_get_report_routes():
    paths = app.openapi()["paths"]
    for path in (
        "/api/canonical/reports/trial-balance",
        "/api/canonical/reports/profit-loss",
        "/api/canonical/reports/customer-activity",
    ):
        assert set(paths[path]) == {"get"}

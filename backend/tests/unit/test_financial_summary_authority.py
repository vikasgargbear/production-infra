from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.routes import canonical_erp_reads


def _totals(revenue: str, expenses: str) -> dict:
    revenue_value = Decimal(revenue)
    expense_value = Decimal(expenses)
    return {
        "total_revenue": revenue_value,
        "operating_expenses": expense_value,
        "gross_profit": revenue_value - expense_value,
        "net_profit": revenue_value - expense_value,
        "accounts_receivable": Decimal("168.00"),
        "accounts_payable": Decimal("80.00"),
    }


def test_financial_summary_compares_one_exact_equal_duration_period(monkeypatch):
    org_id = uuid4()
    calls: list[dict] = []
    rows = iter((_totals("300.00", "60.00"), _totals("200.00", "50.00")))
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: org_id)

    def totals(_db, params):
        calls.append(params)
        return next(rows)

    monkeypatch.setattr(canonical_erp_reads, "_financial_totals", totals)
    result = canonical_erp_reads.financial_summary(
        date_from=date(2026, 8, 1),
        date_to=date(2026, 8, 25),
        user={"org_id": str(org_id)},
        db=object(),
    )

    assert calls == [
        {"org_id": org_id, "date_from": date(2026, 8, 1), "date_to": date(2026, 8, 25)},
        {"org_id": org_id, "date_from": date(2026, 7, 7), "date_to": date(2026, 7, 31)},
    ]
    assert result["comparison_period"] == {
        "date_from": date(2026, 7, 7),
        "date_to": date(2026, 7, 31),
    }
    assert result["previous_revenue"] == Decimal("200.00")
    assert result["revenue_change"] == Decimal("100.00")
    assert result["revenue_change_percent"] == Decimal("50.0")
    assert result["previous_accounts_receivable"] is None
    assert result["receivable_change_percent"] is None


def test_financial_summary_never_invents_a_missing_comparison(monkeypatch):
    org_id = uuid4()
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: org_id)
    monkeypatch.setattr(
        canonical_erp_reads,
        "_financial_totals",
        lambda _db, _params: _totals("0.00", "0.00"),
    )
    result = canonical_erp_reads.financial_summary(
        user={"org_id": str(org_id)}, db=object()
    )
    assert result["comparison_period"] is None
    assert result["previous_revenue"] is None
    assert result["revenue_change_percent"] is None

    with pytest.raises(HTTPException) as error:
        canonical_erp_reads.financial_summary(
            date_from=date(2026, 8, 1),
            user={"org_id": str(org_id)},
            db=object(),
        )
    assert error.value.status_code == 422


def test_sales_summary_uses_equal_period_authority(monkeypatch):
    org_id = uuid4()
    calls: list[dict] = []
    totals = iter((
        {"total_sales": Decimal("168.00"), "total_invoices": 2,
         "avg_invoice_value": Decimal("84.00"), "unique_customers": 2},
        {"total_sales": Decimal("84.00"), "total_invoices": 1,
         "avg_invoice_value": Decimal("84.00"), "unique_customers": 1},
    ))
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: org_id)

    def read_totals(_db, params):
        calls.append(params)
        return next(totals)

    monkeypatch.setattr(canonical_erp_reads, "_sales_summary_totals", read_totals)
    result = canonical_erp_reads.sales_analytics_summary(
        date_from=date(2026, 8, 1), date_to=date(2026, 8, 25),
        user={"org_id": str(org_id)}, db=object(),
    )

    assert calls[1] == {
        "org_id": org_id,
        "date_from": date(2026, 7, 7),
        "date_to": date(2026, 7, 31),
    }
    assert result["sales_growth"] == Decimal("100")
    assert result["invoices_growth"] == Decimal("100")
    assert result["average_invoice_growth"] == Decimal("0")
    assert result["customers_growth"] == Decimal("100")


def test_dashboard_change_is_unavailable_without_a_comparison_period(monkeypatch):
    org_id = uuid4()
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: org_id)
    monkeypatch.setattr(
        canonical_erp_reads,
        "_dashboard_stats_totals",
        lambda _db, _params: {
            "total_revenue": Decimal("168.00"), "total_invoices": 1,
            "purchasing_customers": 1, "total_orders": 1,
            "total_customers": 3, "new_customers": 0,
        },
    )

    result = canonical_erp_reads.dashboard_stats(
        user={"org_id": str(org_id)}, db=object(),
    )
    assert result["comparison_period"] is None
    assert result["revenue_change"] is None
    assert result["orders_change"] is None
    assert result["new_customers_change"] is None

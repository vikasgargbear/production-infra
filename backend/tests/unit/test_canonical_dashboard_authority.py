from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.routing import APIRoute

from app.api.routes import canonical_erp_reads
from app.main import app


def test_only_canonical_dashboard_routes_are_mounted() -> None:
    dashboard_routes = [
        route for route in app.routes
        if isinstance(route, APIRoute) and route.path.startswith("/api/dashboard/")
    ]
    assert {route.path for route in dashboard_routes} == {
        "/api/dashboard/stats",
        "/api/dashboard/sales-analytics",
        "/api/dashboard/inventory-summary",
        "/api/dashboard/top-products",
        "/api/dashboard/top-customers",
    }
    assert all(
        route.endpoint.__module__ == "app.api.routes.canonical_erp_reads"
        for route in dashboard_routes
    )


def test_inventory_summary_uses_exact_stock_and_business_clock(monkeypatch) -> None:
    org_id = uuid4()
    captured: dict = {}
    expected = {
        "organization_timezone": "Asia/Kolkata",
        "business_date": date(2026, 8, 25),
        "as_of": datetime(2026, 8, 25, 12, tzinfo=timezone.utc),
        "active_products": 3,
        "stock_value": Decimal("25428.58"),
        "out_of_stock_products": 1,
    }
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: org_id)

    def rows(_db, query, params):
        captured.update({"query": query, "params": params})
        return [expected]

    monkeypatch.setattr(canonical_erp_reads, "_rows", rows)
    result = canonical_erp_reads.dashboard_inventory_summary(user={}, db=object())

    assert result == expected
    assert captured["params"] == {"org_id": org_id}
    assert "transaction_timestamp() AT TIME ZONE organization.timezone" in captured["query"]
    assert "inventory.stock_balances" in captured["query"]
    assert "<=10" not in captured["query"].replace(" ", "")
    assert "low_stock" not in result


def test_inventory_summary_fails_when_business_context_is_absent(monkeypatch) -> None:
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: uuid4())
    monkeypatch.setattr(canonical_erp_reads, "_rows", lambda *_args, **_kwargs: [])
    with pytest.raises(HTTPException) as error:
        canonical_erp_reads.dashboard_inventory_summary(user={}, db=object())
    assert error.value.status_code == 503


def test_dashboard_sales_contract_has_no_compatibility_aliases(monkeypatch) -> None:
    org_id = uuid4()
    captured: dict = {}
    rows = [{"date": date(2026, 8, 25), "invoice_count": 1, "revenue": Decimal("168.00")}]
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: org_id)

    def read(_db, query, params):
        captured.update({"query": query, "params": params})
        return rows

    monkeypatch.setattr(canonical_erp_reads, "_rows", read)
    result = canonical_erp_reads.dashboard_sales_analytics(
        date_from=date(2026, 8, 25),
        date_to=date(2026, 8, 25),
        user={},
        db=object(),
    )
    assert result == rows
    assert captured["params"] == {
        "org_id": org_id,
        "date_from": date(2026, 8, 25),
        "date_to": date(2026, 8, 25),
    }
    assert "order_count" not in captured["query"]
    assert "period" not in captured["query"]


def test_dashboard_sales_rejects_an_inverted_period(monkeypatch) -> None:
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: uuid4())
    with pytest.raises(HTTPException) as error:
        canonical_erp_reads.dashboard_sales_analytics(
            date_from=date(2026, 8, 26),
            date_to=date(2026, 8, 25),
            user={},
            db=object(),
        )
    assert error.value.status_code == 422


@pytest.mark.parametrize(
    ("reader", "expected_fact"),
    [
        (canonical_erp_reads.dashboard_top_products, "SUM(line.billed_quantity) AS sales"),
        (canonical_erp_reads.dashboard_top_customers, "count(*) AS orders"),
    ],
)
def test_dashboard_rankings_use_the_requested_period(monkeypatch, reader, expected_fact) -> None:
    org_id = uuid4()
    captured: dict = {}
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: org_id)

    def rows(_db, query, params):
        captured.update({"query": query, "params": params})
        return []

    monkeypatch.setattr(canonical_erp_reads, "_rows", rows)
    assert reader(
        date_from=date(2026, 8, 1),
        date_to=date(2026, 8, 25),
        limit=5,
        user={},
        db=object(),
    ) == []
    assert captured["params"] == {
        "org_id": org_id,
        "date_from": date(2026, 8, 1),
        "date_to": date(2026, 8, 25),
        "limit": 5,
    }
    assert expected_fact in captured["query"]

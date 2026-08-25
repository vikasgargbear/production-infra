"""Prevent inferred report policies from returning through the API boundary."""

import inspect

from app.api.routes import canonical_erp_reads
from app.main import app


UNPUBLISHED_REPORT_PATHS = {
    "/api/customers/analytics/list",
    "/api/customers/analytics/summary",
    "/api/customers/analytics/segments",
    "/api/customers/analytics/acquisition",
    "/api/products/analytics/performance",
    "/api/products/categories",
    "/api/products/analytics/summary",
    "/api/reports/profit-loss",
    "/api/reports/profit-loss/trends",
    "/api/reports/profit-loss/summary",
    "/api/financial/summary",
    "/api/financial/cash-flow",
    "/api/financial/transactions",
    "/api/financial/expense-breakdown",
}


def test_unreviewed_report_projections_are_absent_from_openapi() -> None:
    paths = app.openapi()["paths"]
    assert UNPUBLISHED_REPORT_PATHS.isdisjoint(paths)


def test_sales_daily_projection_has_one_exact_name_per_fact() -> None:
    source = inspect.getsource(canonical_erp_reads._sales_daily)
    for required in (
        "AS date", "AS invoice_count", "AS customer_count",
        "AS total_sales", "AS avg_order_value",
    ):
        assert required in source
    for compatibility_alias in (
        "AS period", "AS order_count", "AS unique_customers", "AS revenue",
    ):
        assert compatibility_alias not in source


def test_removed_business_policy_helpers_cannot_return() -> None:
    for name in (
        "_customer_analytics_rows",
        "customer_analytics_summary",
        "customer_analytics_segments",
        "_product_performance_rows",
        "product_analytics_summary",
        "_profit_loss",
        "profit_loss_summary",
        "_financial_totals",
        "financial_summary",
        "financial_cash_flow",
        "financial_transactions",
        "financial_expense_breakdown",
    ):
        assert not hasattr(canonical_erp_reads, name)

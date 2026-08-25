"""Retired management-financial projections cannot silently return guessed facts."""

import inspect

from app.api.routes import canonical_erp_reads
from app.main import app


RETIRED_FINANCIAL_PATHS = {
    "/api/financial/summary",
    "/api/financial/cash-flow",
    "/api/financial/transactions",
    "/api/financial/expense-breakdown",
}


def test_unreviewed_financial_projections_are_not_published() -> None:
    assert RETIRED_FINANCIAL_PATHS.isdisjoint(app.openapi()["paths"])


def test_unreviewed_financial_projection_code_is_deleted() -> None:
    source = inspect.getsource(canonical_erp_reads)
    for name in (
        "_financial_totals",
        "financial_summary",
        "financial_cash_flow",
        "financial_transactions",
        "financial_expense_breakdown",
    ):
        assert not hasattr(canonical_erp_reads, name)
    for invented_boundary in (
        '"type": "income" if',
        '"category": row["method"]',
        '"status": "paid" if',
    ):
        assert invented_boundary not in source

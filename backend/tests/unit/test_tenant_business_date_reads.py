from __future__ import annotations

import inspect

from app.api.routes import (
    canonical_document_history_reads,
    canonical_erp_reads,
    canonical_goods_receipts,
)
from app.api.routes.internal import (
    mcp_canonical_reads,
    mcp_canonical_resolution_reads,
)


def _source(module) -> str:
    return inspect.getsource(module)


def test_reachable_application_reads_do_not_use_session_current_date() -> None:
    for module in (
        canonical_document_history_reads,
        canonical_erp_reads,
        canonical_goods_receipts,
        mcp_canonical_reads,
        mcp_canonical_resolution_reads,
    ):
        assert "CURRENT_DATE" not in _source(module).upper()


def test_goods_receipt_dates_use_the_organization_timezone() -> None:
    history = canonical_document_history_reads._history_sources()
    listing = inspect.getsource(canonical_erp_reads.goods_receipts)

    expected = "receipt.received_at AT TIME ZONE organization.timezone"
    assert expected in history
    assert expected in listing
    assert "receipt.received_at::date" not in history
    assert "receipt.received_at::date" not in listing
    assert "JOIN core.organizations organization" in history
    assert "JOIN core.organizations organization" in listing


def test_dashboards_and_aging_share_the_canonical_business_clock() -> None:
    dashboard = inspect.getsource(canonical_erp_reads._dashboard_stats_totals)
    gst_dashboard = inspect.getsource(canonical_erp_reads.gst_dashboard)
    aging = inspect.getsource(canonical_erp_reads._canonical_receivable_rows)
    collections = inspect.getsource(canonical_erp_reads.canonical_collection_aging)

    assert "SELECT timezone FROM business_clock" in dashboard
    assert "CROSS JOIN business_clock" not in dashboard
    for source in (dashboard, gst_dashboard, aging, collections):
        assert "current_organization_business_date" in source
    assert "business_clock.business_date-item.due_date" in aging
    assert "payment_date=business_clock.business_date" in collections


def test_effective_master_and_mcp_resolution_reads_use_canonical_clock() -> None:
    application = _source(canonical_erp_reads)
    goods_receipts = inspect.getsource(
        canonical_goods_receipts._canonical_purchase_order_receipt_context
    )
    mcp_reads = _source(mcp_canonical_reads)
    mcp_resolution = _source(mcp_canonical_resolution_reads)

    assert "valid_from<=business_clock.business_date" in application
    assert "effective_from<=business_clock.business_date" in application
    assert "conversion.valid_from<=CAST(:business_date AS date)" in goods_receipts
    assert "conversion.valid_until>=CAST(:business_date AS date)" in goods_receipts
    for source in (mcp_reads, mcp_resolution):
        assert "current_organization_business_date" in source
        assert "business_clock.business_date" in source
    assert "batch.expires_on>business_clock.business_date" in mcp_resolution

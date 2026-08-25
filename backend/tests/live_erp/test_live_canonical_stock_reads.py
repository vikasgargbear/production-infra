from __future__ import annotations

from decimal import Decimal

import pytest


pytestmark = pytest.mark.integration


def _load_every_page(api_json, path: str, params: dict):
    cursor = None
    first = None
    items = []
    seen = set()
    while True:
        request = {**params, "limit": 1}
        if cursor is not None:
            request["cursor"] = cursor
        response, body = api_json("GET", path, params=request)
        assert response.status_code == 200, body
        if first is None:
            first = body
        else:
            assert body["scope"] == first["scope"]
            assert body["as_of"] == first["as_of"]
            assert body["business_date"] == first["business_date"]
            assert body["total_count"] == first["total_count"]
            assert body["summary"] == first["summary"]
        items.extend(body["items"])
        cursor = body["next_cursor"]
        if cursor is None:
            break
        assert cursor not in seen
        seen.add(cursor)
    assert first is not None
    assert len(items) == first["total_count"]
    return first, items


def test_live_stock_hub_pages_match_visible_authoritative_ledger(
    api_json, db_query, live_config,
):
    context_response, context = api_json("GET", "/api/canonical/inventory/context")
    assert context_response.status_code == 200, context
    assert context["organization_id"] == str(live_config.test_org_id)
    visible_branches = {branch["branch_id"] for branch in context["branches"]}
    assert str(live_config.test_branch_id) in visible_branches

    params = {"branch_id": str(live_config.test_branch_id)}
    current_page, current_items = _load_every_page(
        api_json, "/api/canonical/inventory/current-stock", params,
    )
    assert current_items, "live stock comparison requires at least one visible ledger product"
    direct_current = db_query("""
        WITH batch_stock AS (
          SELECT entry.product_id, entry.batch_id,
                 sum(entry.quantity_delta) AS quantity,
                 sum(entry.value_delta) AS value
            FROM inventory.stock_ledger_entries entry
           WHERE entry.org_id=%s::uuid AND entry.branch_id=%s::uuid
             AND entry.posted_at<=%s::timestamptz
           GROUP BY entry.product_id,entry.batch_id
        )
        SELECT product_id, sum(quantity) AS quantity, sum(value) AS value,
               count(*)::integer AS batch_count,
               count(*) FILTER (WHERE quantity>0)::integer AS positive_stock_batch_count,
               count(*) FILTER (WHERE quantity=0)::integer AS exhausted_batch_count,
               count(*) FILTER (WHERE quantity<0)::integer AS negative_stock_batch_count
          FROM batch_stock GROUP BY product_id ORDER BY product_id
    """, (
        str(live_config.test_org_id), str(live_config.test_branch_id),
        current_page["as_of"],
    ))
    direct_by_product = {str(row["product_id"]): row for row in direct_current}
    assert set(direct_by_product) == {row["product_id"] for row in current_items}
    for item in current_items:
        direct = direct_by_product[item["product_id"]]
        assert Decimal(item["total_quantity"]) == direct["quantity"]
        assert Decimal(item["total_value"]) == direct["value"]
        assert item["batch_count"] == direct["batch_count"]
        assert item["positive_stock_batch_count"] == direct["positive_stock_batch_count"]
        assert item["exhausted_batch_count"] == direct["exhausted_batch_count"]
        assert item["negative_stock_batch_count"] == direct["negative_stock_batch_count"]
    assert current_page["summary"]["product_count"] == len(direct_current)
    assert Decimal(current_page["summary"]["total_quantity"]) == sum(
        (row["quantity"] for row in direct_current), Decimal("0")
    )
    assert Decimal(current_page["summary"]["total_value"]) == sum(
        (row["value"] for row in direct_current), Decimal("0")
    )

    movement_page, movement_items = _load_every_page(
        api_json, "/api/canonical/inventory/movements", params,
    )
    direct_movements = db_query("""
        SELECT id, quantity_delta, value_delta
          FROM inventory.stock_ledger_entries
         WHERE org_id=%s::uuid AND branch_id=%s::uuid
           AND posted_at<=%s::timestamptz
         ORDER BY posted_at DESC,id DESC
    """, (
        str(live_config.test_org_id), str(live_config.test_branch_id),
        movement_page["as_of"],
    ))
    assert [row["movement_id"] for row in movement_items] == [
        str(row["id"]) for row in direct_movements
    ]
    for item, direct in zip(movement_items, direct_movements):
        assert Decimal(item["quantity_delta"]) == direct["quantity_delta"]
        assert Decimal(item["value_delta"]) == direct["value_delta"]
        assert item["reversal_reconciled"] is True

    batch_page, batch_items = _load_every_page(
        api_json, "/api/canonical/inventory/batches", params,
    )
    direct_batches = db_query("""
        SELECT batch_id, sum(quantity_delta) AS quantity, sum(value_delta) AS value
          FROM inventory.stock_ledger_entries
         WHERE org_id=%s::uuid AND branch_id=%s::uuid
           AND posted_at<=%s::timestamptz
         GROUP BY batch_id ORDER BY batch_id
    """, (
        str(live_config.test_org_id), str(live_config.test_branch_id),
        batch_page["as_of"],
    ))
    assert [row["batch_id"] for row in batch_items] == [
        str(row["batch_id"]) for row in direct_batches
    ]
    for item, direct in zip(batch_items, direct_batches):
        assert Decimal(item["total_quantity"]) == direct["quantity"]
        assert Decimal(item["total_value"]) == direct["value"]

import base64
import inspect
import json
from datetime import datetime
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.routes import canonical_inventory_reads as reads
from app.main import app


def movement(**overrides):
    ids = [uuid4() for _ in range(7)]
    values = dict(
        movement_id=ids[0], posted_at=datetime(2026, 8, 25, 10, 0),
        entry_kind="value_adjustment", quantity_delta="0.000000", value_delta="5.00",
        absolute_quantity="0.000000", absolute_value="5.00", unit_cost="100.0000",
        branch_id=ids[1], branch_code="MAIN", branch_name="Main", location_id=ids[2],
        location_code="SALE", location_name="Saleable", product_id=ids[3],
        product_code="BOX", product_name="Carton", batch_id=ids[4], batch_number="B-1",
        inventory_document_id=ids[5], document_number="ADJ-1", reverses_entry_id=None,
        reversed_entry_kind=None, reversal_reconciled=True, posted_by=None,
    )
    values.update(overrides)
    return values


def test_movement_wire_preserves_signed_value_adjustment_and_reversal_authority():
    adjustment = reads.MovementRow(**movement())
    reversal_id = uuid4()
    reversal = reads.MovementRow(**movement(
        movement_id=reversal_id, entry_kind="reversal", value_delta="-5.00",
        reverses_entry_id=adjustment.movement_id, reversed_entry_kind="value_adjustment",
    ))
    assert json.loads(adjustment.model_dump_json())["value_delta"] == "5.00"
    assert json.loads(reversal.model_dump_json())["value_delta"] == "-5.00"
    assert json.loads(reversal.model_dump_json())["quantity_delta"] == "0.000000"


@pytest.mark.parametrize("overrides", [
    {"entry_kind": "value_adjustment", "value_delta": "0.00", "absolute_value": "0.00"},
    {"entry_kind": "reversal", "value_delta": "-5.00", "reverses_entry_id": None,
     "reversed_entry_kind": "value_adjustment"},
    {"entry_kind": "reversal", "value_delta": "-5.00", "reverses_entry_id": uuid4(),
     "reversed_entry_kind": "value_adjustment", "reversal_reconciled": False},
    {"entry_kind": "transfer_out", "quantity_delta": "1.000000", "value_delta": "5.00",
     "absolute_quantity": "1.000000", "absolute_value": "5.00"},
    {"entry_kind": "issue", "quantity_delta": "-1.000000", "value_delta": "-5.00",
     "absolute_quantity": "2.000000", "absolute_value": "5.00"},
])
def test_movement_response_rejects_broken_ledger_semantics(overrides):
    with pytest.raises(ValueError):
        reads.MovementRow(**movement(**overrides))


def test_movement_sql_reads_signed_value_delta_and_never_recomputes_value():
    source = inspect.getsource(reads.movements)
    assert "entry.quantity_delta" in source
    assert "entry.value_delta" in source
    assert "sum(abs(entry.value_delta))" in source
    assert "sum(entry.value_delta)" in source
    assert "quantity_delta) * entry.unit_cost" not in source
    assert "entry.reverses_entry_id" in source
    assert "reversed.entry_kind AS reversed_entry_kind" in source
    assert "entry.branch_id=:branch_id" in source
    assert "entry.location_id=:location_id" in source
    assert "entry.quantity_delta=-reversed.quantity_delta" in source
    assert "entry.value_delta=-reversed.value_delta" in source
    assert "entry.location_id=reversed.location_id" in source
    assert "END AS reversal_reconciled" in source


def test_stock_routes_require_explicit_branch_and_expose_cursor_envelopes():
    schema = app.openapi()
    for path, model in [
        ("/api/canonical/inventory/current-stock", "CurrentStockPage"),
        ("/api/canonical/inventory/batches", "BatchPage"),
        ("/api/canonical/inventory/movements", "MovementPage"),
    ]:
        operation = schema["paths"][path]["get"]
        branch = next(parameter for parameter in operation["parameters"] if parameter["name"] == "branch_id")
        assert branch["required"] is True
        response = operation["responses"]["200"]["content"]["application/json"]["schema"]
        assert response == {"$ref": f"#/components/schemas/{model}"}
        properties = schema["components"]["schemas"][model]["properties"]
        assert {"scope", "as_of", "business_date", "items", "total_count", "summary", "next_cursor"} <= set(properties)


def test_cursor_is_opaque_exact_and_rejects_wrong_shape():
    values = {"movement_id": str(uuid4()), "posted_at": "2026-08-25T10:00:00+00:00",
              "as_of": "2026-08-25T10:01:00+00:00", "business_date": "2026-08-25"}
    token = reads._cursor(values)
    decoded = reads._decode_cursor(token, set(values))
    assert decoded and decoded["posted_at"].endswith("+00:00")
    with pytest.raises(HTTPException) as invalid:
        reads._decode_cursor(reads._cursor({"offset": "2"}), set(values))
    assert invalid.value.status_code == 422
    padded = token + "=" * (-len(token) % 4)
    envelope = json.loads(base64.urlsafe_b64decode(padded).decode())
    envelope["payload"]["business_date"] = "2026-08-26"
    tampered = base64.urlsafe_b64encode(json.dumps(envelope).encode()).decode().rstrip("=")
    with pytest.raises(HTTPException) as altered:
        reads._decode_cursor(tampered, set(values))
    assert altered.value.status_code == 422


def test_cursor_rejects_naive_snapshot_timestamp():
    with pytest.raises(HTTPException) as invalid:
        reads._cursor_datetime("2026-08-25T10:00:00")
    assert invalid.value.status_code == 422


def test_cursor_fingerprint_is_bound_to_tenant_scope_route_and_filters():
    org_id = uuid4()
    branch_id = uuid4()
    location_id = uuid4()
    expected = reads._query_fingerprint(
        "batches", organization_id=org_id, branch_id=branch_id,
        location_id=location_id, product_id=None, search="box",
    )
    decoded = {"query": expected}
    reads._require_cursor_query(decoded, expected)
    for changed in (
        reads._query_fingerprint(
            "batches", organization_id=uuid4(), branch_id=branch_id,
            location_id=location_id, product_id=None, search="box",
        ),
        reads._query_fingerprint(
            "batches", organization_id=org_id, branch_id=uuid4(),
            location_id=location_id, product_id=None, search="box",
        ),
        reads._query_fingerprint(
            "batches", organization_id=org_id, branch_id=branch_id,
            location_id=location_id, product_id=None, search="other",
        ),
    ):
        with pytest.raises(HTTPException) as mismatch:
            reads._require_cursor_query(decoded, changed)
        assert mismatch.value.status_code == 422


def test_expiry_uses_organization_business_date_not_database_current_date():
    current = inspect.getsource(reads.current_stock)
    batches = inspect.getsource(reads.batches)
    clock = inspect.getsource(reads._clock)
    assert "AT TIME ZONE organization.timezone" in clock
    for source in (current, batches):
        assert ":business_date" in source
        assert "CURRENT_DATE" not in source


def test_batch_saleability_requires_release_future_expiry_positive_active_saleable_stock_and_no_recall():
    source = inspect.getsource(reads.batches)
    assert "batch.status='released'" in source
    assert "batch.released_at IS NOT NULL" in source
    assert "batch.expires_on>:business_date" in source
    assert "location.status='active'" in source
    assert "location.location_type='saleable'" in source
    assert "location.allows_sale" in source
    assert "NOT location.allows_negative_stock" in source
    assert "COALESCE(stock.saleable_quantity,0)>0" in source
    assert "compliance.recall_batches" in source
    assert "recall.status IN ('initiated','in_progress')" in source


def test_current_stock_counts_tracked_positive_and_exhausted_batches_after_ledger_fold():
    source = inspect.getsource(reads.current_stock)
    assert "GROUP BY entry.product_id, entry.batch_id" in source
    assert "count(*) AS batch_count" in source
    assert "count(*) FILTER (WHERE stock.quantity>0) AS positive_stock_batch_count" in source
    assert "count(*) FILTER (WHERE stock.quantity=0) AS exhausted_batch_count" in source
    assert "count(*) FILTER (WHERE stock.quantity<0) AS negative_stock_batch_count" in source
    assert "stock.quantity>0 AND batch.expires_on<=:business_date" in source
    assert "ORDER BY stock.product_id LIMIT :limit" in source
    assert "ORDER BY balance.product_id" not in source


def test_stock_count_models_reject_unreconciled_sign_partitions():
    with pytest.raises(ValueError, match="does not reconcile"):
        reads.CurrentStockSummary(
            product_count=1,
            total_quantity="1.000000",
            total_value="1.00",
            batch_count=3,
            positive_stock_batch_count=1,
            exhausted_batch_count=1,
            negative_stock_batch_count=0,
        )
    with pytest.raises(ValueError, match="does not reconcile"):
        reads.BatchSummary(
            batch_count=2,
            positive_stock_count=1,
            exhausted_batch_count=0,
            negative_stock_count=0,
            total_quantity="1.000000",
            total_value="1.00",
            expired_count=0,
            expiring_30d_count=0,
            near_expiry_90d_count=0,
        )


def test_movement_date_filters_use_organization_timezone_and_full_snapshot_summary():
    source = inspect.getsource(reads.movements)
    assert "entry.posted_at AT TIME ZONE organization.timezone" in source
    assert "entry.posted_at<=:as_of" in source
    summary_position = source.index("SELECT count(*) AS movement_count")
    cursor_position = source.index("AND (:after_at IS NULL")
    assert summary_position < cursor_position

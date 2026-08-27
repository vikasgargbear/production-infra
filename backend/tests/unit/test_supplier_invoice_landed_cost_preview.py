from decimal import Decimal
from uuid import uuid4

import pytest

from app.infrastructure.operator_actions.supplier_invoice import landed_cost_preview


def _documents(*, exact: bool = True, on_hand: str = "6.000000"):
    line_id = str(uuid4())
    target = {
        "allocation_id": str(uuid4()),
        "goods_receipt_line_id": str(uuid4()),
        "allocated_base_billed_quantity": "10.000000",
        "allocated_base_free_quantity": "0.000000",
        "receipt_unit_cost": "10.0000",
        "location_id": str(uuid4()),
        "product_id": str(uuid4()),
        "batch_id": str(uuid4()),
        "stock_on_hand_quantity": on_hand,
        "stock_inventory_value": "60.00",
        "stock_average_unit_cost": "10.0000",
        "stock_row_version": 7,
        "exact_receipt_source_provenance": exact,
    }
    resolution = {
        "lines": [{
            "line_id": line_id,
            "line_kind": "product",
            "inventory_cost_treatment": "capitalize",
            "landed_cost_allocation_method": "quantity_weighted",
            "receipt_cost": "100.00",
            "receipt_allocations": [target],
        }],
    }
    calculation = {"lines": [{"line_id": line_id, "net_value_amount": "120.00"}]}
    return resolution, calculation


def test_preview_splits_only_exact_remaining_receipt_stock():
    effects, inventory_delta, consumed = landed_cost_preview(*_documents())
    assert inventory_delta == Decimal("12.00")
    assert consumed == Decimal("8.00")
    assert effects[0]["targets"][0]["stock_row_version"] == 7


def test_preview_rejects_co_mingled_or_unbounded_stock():
    with pytest.raises(ValueError, match="exclusive receipt provenance"):
        landed_cost_preview(*_documents(exact=False))
    with pytest.raises(ValueError, match="on-hand exceeds"):
        landed_cost_preview(*_documents(on_hand="11.000000"))


def test_exact_cost_partial_invoice_needs_no_landed_cost_provenance():
    resolution, calculation = _documents(exact=False)
    calculation["lines"][0]["net_value_amount"] = "100.00"
    effects, inventory_delta, consumed = landed_cost_preview(resolution, calculation)
    assert inventory_delta == consumed == Decimal("0.00")
    assert effects[0]["total_landed_cost_pool"] == "0.00"

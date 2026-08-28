from decimal import Decimal
from uuid import uuid4

import pytest

from app.infrastructure.operator_actions.supplier_invoice import landed_cost_preview


def _documents(*, on_hand: str = "6.000000", transferred: bool = False):
    line_id = str(uuid4())
    origin_location_id = str(uuid4())
    product_id = str(uuid4())
    batch_id = str(uuid4())
    targets = [{
        "location_id": str(uuid4()) if transferred else origin_location_id,
        "branch_id": str(uuid4()),
        "product_id": product_id,
        "batch_id": batch_id,
        "uom_code": "EA",
        "on_hand_quantity": on_hand,
        "inventory_value": "60.00",
        "average_unit_cost": "10.0000",
        "stock_row_version": 7,
        "last_ledger_entry_id": str(uuid4()),
        "origin_location_id": origin_location_id,
        "origin_product_id": product_id,
        "origin_batch_id": batch_id,
        "origin_allocated_quantity": "10.000000",
        "origin_allocated_value": "100.00",
    }]
    target = {
        "allocation_id": str(uuid4()),
        "goods_receipt_line_id": str(uuid4()),
        "allocated_base_billed_quantity": "10.000000",
        "allocated_base_free_quantity": "0.000000",
        "receipt_unit_cost": "10.0000",
        "location_id": origin_location_id,
        "product_id": product_id,
        "batch_id": batch_id,
        "landed_cost_lineage": {
            "contract_version": "supplier_invoice_landed_cost_lineage_v1",
            "source_identity_count": 1,
            "target_identity_count": 1,
            "source_quantity_basis": "10.000000",
            "source_value_basis": "100.00",
            "remaining_quantity_basis": on_hand,
            "remaining_value_basis": "60.00",
            "targets": targets,
        },
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
    assert effects[0]["targets"][0]["last_ledger_entry_id"]


def test_preview_rejects_missing_authoritative_lineage_contract():
    resolution, calculation = _documents()
    resolution["lines"][0]["receipt_allocations"][0]["landed_cost_lineage"] = {}
    with pytest.raises(ValueError, match="lineage contract"):
        landed_cost_preview(resolution, calculation)


def test_preview_capitalizes_transferred_remaining_stock():
    effects, inventory_delta, consumed = landed_cost_preview(
        *_documents(transferred=True)
    )
    assert inventory_delta == Decimal("12.00")
    assert consumed == Decimal("8.00")
    target = effects[0]["targets"][0]
    assert target["location_id"] != target["origin_location_id"]


def test_preview_preserves_every_descendant_source_version():
    resolution, calculation = _documents(transferred=True)
    lineage = resolution["lines"][0]["receipt_allocations"][0][
        "landed_cost_lineage"
    ]
    second = dict(lineage["targets"][0])
    second.update({
        "location_id": str(uuid4()),
        "on_hand_quantity": "2.000000",
        "inventory_value": "20.00",
        "stock_row_version": 11,
        "last_ledger_entry_id": str(uuid4()),
    })
    lineage["targets"][0].update({
        "on_hand_quantity": "4.000000",
        "inventory_value": "40.00",
    })
    lineage["targets"].append(second)
    lineage["target_identity_count"] = 2
    effects, inventory_delta, consumed = landed_cost_preview(resolution, calculation)
    assert inventory_delta == Decimal("12.00")
    assert consumed == Decimal("8.00")
    assert [target["stock_row_version"] for target in effects[0]["targets"]] == [
        7,
        11,
    ]
    assert len({target["last_ledger_entry_id"] for target in effects[0]["targets"]}) == 2


def test_exact_cost_partial_invoice_needs_no_landed_cost_provenance():
    resolution, calculation = _documents()
    calculation["lines"][0]["net_value_amount"] = "100.00"
    effects, inventory_delta, consumed = landed_cost_preview(resolution, calculation)
    assert inventory_delta == consumed == Decimal("0.00")
    assert effects[0]["total_landed_cost_pool"] == "0.00"

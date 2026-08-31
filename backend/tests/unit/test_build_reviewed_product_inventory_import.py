from __future__ import annotations

import csv
from datetime import date
from pathlib import Path

from scripts.build_reviewed_product_inventory_import import build_requests


ORG = "00000000-0000-4000-8000-000000000001"
BRANCH = "00000000-0000-4000-8000-000000000002"


def _write(path: Path, rows: list[dict]) -> Path:
    with path.open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    return path


def _inputs(tmp_path: Path, *, batch_value: str = "200.22") -> tuple[Path, Path]:
    products = _write(
        tmp_path / "products.csv",
        [{
            "source_product_code": "A1", "product_name": "Medicine One 1*10",
            "product_kind": "medicine", "base_uom_code": "PCS",
            "manufacturer_candidate": "Maker Limited", "company_candidate": "",
            "hsn_sac": "3004", "gst_rate": "12", "cutover_quantity": "2",
            "cutover_value": "200.22", "selection_state": "included-draft",
            "stock_state": "ready", "selection_reason": "stock-ready-reconciled-batches",
        }, {
            "source_product_code": "A2", "product_name": "Medicine Two",
            "product_kind": "medicine", "base_uom_code": "PCS",
            "manufacturer_candidate": "", "company_candidate": "Second Maker",
            "hsn_sac": "3004", "gst_rate": "12", "cutover_quantity": "-3",
            "cutover_value": "-99", "selection_state": "included-draft",
            "stock_state": "ready", "selection_reason": "stock-ready-zero",
        }],
    )
    batches = _write(
        tmp_path / "batches.csv",
        [{
            "source_product_code": "A1", "batch_number": "B1", "manufactured_on": "",
            "expires_on": "20280801", "quantity": "2", "unit_cost": "100.11",
            "inventory_value": batch_value, "mrp": "213", "rack_number": "",
            "target_location_policy": "organization-default-warehouse",
            "selection_state": "staged", "posting_state": "product-setup-or-batch-review",
            "selection_reason": "complete-reconciled-batch",
        }],
    )
    return products, batches


def test_builds_reviewed_operational_facts_and_clamps_negative_stock(tmp_path: Path):
    products, batches = _inputs(tmp_path)
    requests, summary = build_requests(
        products_path=products, batches_path=batches, organization_id=ORG,
        branch_id=BRANCH, dataset_id="marg-product-stock-v1",
        opening_date=date(2026, 8, 30),
    )
    facts = requests[0]["facts"]
    assert summary == {
        "dataset_id": "marg-product-stock-v1", "organization_id": ORG,
        "branch_id": BRANCH, "opening_date": "2026-08-30", "products": 2,
        "positive_stock_products": 1, "zero_stock_products": 1, "batches": 1,
        "opening_quantity": "2.000000", "opening_value": "200.22",
        "excluded_batches": {}, "staged_batches_outside_reviewed_products": 0,
        "facts": 3, "request_batches": 1,
    }
    assert [fact["selection_state"] for fact in facts] == ["reviewed"] * 3
    assert facts[0]["payload"]["batch_reconciliation_status"] == "exact"
    assert facts[2]["quantity"] == "0.000000"
    assert facts[2]["inventory_value"] == "0.00"
    assert facts[2]["payload"]["source_cutover_quantity"] == "-3.000000"
    assert facts[2]["payload"]["batch_reconciliation_status"] == "none"


def test_recomputes_exact_unit_cost_from_authoritative_batch_value(tmp_path: Path):
    products, batches = _inputs(tmp_path, batch_value="199.00")
    requests, _ = build_requests(
        products_path=products, batches_path=batches, organization_id=ORG,
        branch_id=BRANCH, dataset_id="marg-product-stock-v1",
        opening_date=date(2026, 8, 30),
    )
    batch = next(fact for fact in requests[0]["facts"] if fact["source_kind"] == "batch")
    assert batch["payload"]["unit_cost"] == "99.500000"

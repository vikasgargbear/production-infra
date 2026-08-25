from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.routes import canonical_inventory_transfers as reads
from app.main import app


def _line(header=None, **overrides):
    line_id = uuid4()
    product_id = uuid4()
    batch_id = uuid4()
    source_location_id = uuid4()
    destination_location_id = uuid4()
    row = {
        "inventory_document_line_id": line_id,
        "product_id": product_id,
        "batch_id": batch_id,
        "from_location_id": source_location_id,
        "to_location_id": destination_location_id,
        "base_quantity": "0.300000",
        "unit_cost": "9007199254740993.3000",
        "extended_cost": "9007199254740993.30",
        "transfer_out_ledger_id": uuid4(),
        "transfer_out_branch_id": header["branch_id"] if header else uuid4(),
        "transfer_out_location_id": source_location_id,
        "transfer_out_product_id": product_id,
        "transfer_out_batch_id": batch_id,
        "transfer_out_quantity": "-0.300000",
        "transfer_out_unit_cost": "9007199254740993.3000",
        "transfer_out_value": "-9007199254740993.30",
        "transfer_in_ledger_id": uuid4(),
        "transfer_in_branch_id": header["destination_branch_id"] if header else uuid4(),
        "transfer_in_location_id": destination_location_id,
        "transfer_in_product_id": product_id,
        "transfer_in_batch_id": batch_id,
        "transfer_in_quantity": "0.300000",
        "transfer_in_unit_cost": "9007199254740993.3000",
        "transfer_in_value": "9007199254740993.30",
    }
    row.update(overrides)
    return row


def _header(**overrides):
    row = {
        "id": uuid4(),
        "document_number": "ST/2026/0001",
        "status": "posted",
        "branch_id": uuid4(),
        "destination_branch_id": uuid4(),
        "document_date": "2026-08-25",
        "total_abs_base_quantity": "0.300000",
        "total_value": "9007199254740993.30",
        "row_version": 3,
    }
    row.update(overrides)
    return row


def test_readback_model_preserves_exact_strings_and_rejects_numeric_json():
    header = _header()
    wire = reads.TransferReadbackResponse(**{**header, "lines": [_line(header)]}).model_dump(mode="json")
    assert wire["total_value"] == "9007199254740993.30"
    assert wire["lines"][0]["base_quantity"] == "0.300000"
    with pytest.raises(ValidationError, match="string_type"):
        reads.TransferReadbackResponse(**{**_header(total_value=9007199254740993), "lines": [_line()]})


@pytest.mark.parametrize("field,value", [
    ("total_abs_base_quantity", "0.000000"),
    ("total_value", "0.00"),
])
def test_readback_model_rejects_zero_totals(field, value):
    header = _header(**{field: value})
    with pytest.raises(ValidationError, match="greater than zero"):
        reads.TransferReadbackResponse(**{**header, "lines": [_line(header)]})


@pytest.mark.parametrize("field,value", [
    ("base_quantity", "0.000000"),
    ("unit_cost", "0.0000"),
    ("extended_cost", "0.00"),
])
def test_readback_model_rejects_zero_line_evidence(field, value):
    header = _header()
    with pytest.raises(ValidationError, match="greater than zero"):
        reads.TransferReadbackResponse(**{
            **header,
            "lines": [_line(header, **{field: value})],
        })


@pytest.mark.parametrize("field,value", [
    ("uom_multiplier", "0.000000"),
    ("available_base_quantity", "0.000000"),
    ("available_selected_quantity", "0.000000"),
    ("average_unit_cost", "0.0000"),
    ("inventory_value", "0.00"),
])
def test_eligible_batch_model_rejects_zero_authority(field, value):
    batch = {
        "batch_id": uuid4(), "batch_number": "B-1", "expires_on": "2027-08-25",
        "product_id": uuid4(), "uom_conversion_id": uuid4(),
        "selected_uom_code": "EA", "base_uom_code": "EA",
        "uom_multiplier": "1.000000", "available_base_quantity": "1.000000",
        "available_selected_quantity": "1.000000", "average_unit_cost": "10.0000",
        "inventory_value": "10.00", "is_default": True,
    }
    with pytest.raises(ValidationError, match="greater than zero"):
        reads.EligibleTransferBatch(**{**batch, field: value})


class _Result:
    def __init__(self, rows=()):
        self.rows = list(rows)

    def mappings(self):
        return self

    def one_or_none(self):
        return self.rows[0] if self.rows else None

    def all(self):
        return self.rows


class _Database:
    def __init__(self, header, lines):
        self.header = header
        self.lines = lines
        self.calls = []

    def execute(self, statement, params):
        sql = str(statement)
        self.calls.append((sql, params))
        if "activate_context" in sql:
            return _Result()
        if "FROM inventory.inventory_documents" in sql:
            return _Result(() if self.header is None else (self.header,))
        if "FROM inventory.inventory_document_lines" in sql:
            return _Result(self.lines)
        raise AssertionError(sql)


def test_readback_endpoint_reconciles_exact_paired_ledger_and_branch_authority():
    org_id = uuid4()
    header = _header()
    lines = [_line(header)]
    db = _Database(header, lines)
    response = reads.get_transfer_readback(
        header["id"],
        db=db,
        current_user={"org_id": str(org_id), "auth_user_id": str(uuid4())},
    )
    wire = reads.TransferReadbackResponse(**response).model_dump(mode="json")
    assert wire["lines"][0]["transfer_out_quantity"] == "-0.300000"
    header_sql = db.calls[1][0]
    assert "can_access_branch(branch_id)" in header_sql
    assert "can_access_branch(destination_branch_id)" in header_sql


def test_readback_fails_closed_on_unbalanced_or_incomplete_evidence():
    header = _header()
    db = _Database(header, [_line(header, transfer_in_value="9007199254740993.29")])
    with pytest.raises(HTTPException, match="not quantity/value balanced"):
        reads.get_transfer_readback(
            header["id"],
            db=db,
            current_user={"org_id": str(uuid4()), "auth_user_id": str(uuid4())},
        )


def test_eligibility_query_is_business_clock_scoped_strict_fefo_and_fixed_scale():
    import inspect

    source = inspect.getsource(reads.get_eligible_transfer_batches)
    for fragment in (
        "organization.timezone",
        "source_branch.id<>destination_branch.id",
        "source_location.allows_sale AND destination_location.allows_sale",
        "can_access_branch(source_branch.id)",
        "can_access_branch(destination_branch.id)",
        "min(expires_on)",
        "earliest.expires_on=eligible.expires_on",
        "to_char(eligible.on_hand_quantity",
        "to_char(eligible.inventory_value",
    ):
        assert fragment in source


def test_openapi_registers_uuid_readback_as_get_only():
    operation = app.openapi()["paths"]["/api/canonical/inventory-transfers/{inventory_document_id}"]
    assert set(operation) == {"get"}
    parameter = next(item for item in operation["get"]["parameters"] if item["name"] == "inventory_document_id")
    assert parameter["schema"]["format"] == "uuid"

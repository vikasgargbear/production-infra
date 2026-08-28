from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import get_type_hints
from uuid import UUID

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.routing import APIRoute
from pydantic import ValidationError

from app.api.routes import canonical_goods_receipts
from app.core.utils import schema_validator


ORG_ID = UUID("10000000-0000-7000-8000-000000000001")
RECEIPT_ID = UUID("10000000-0000-7000-8000-000000000002")


def _detail_payload():
    return {
        "goods_receipt_id": RECEIPT_ID,
        "goods_receipt_number": "CODEX-E2E-GRN-0001",
        "branch_id": "10000000-0000-7000-8000-000000000003",
        "supplier_account_id": "10000000-0000-7000-8000-000000000004",
        "supplier_name": "Canonical Supplier",
        "organization_timezone": "Asia/Kolkata",
        "business_as_of": "2026-08-28T10:31:00.123456",
        "purchase_order_id": "10000000-0000-7000-8000-000000000005",
        "purchase_order_number": "CODEX-E2E-PO-0001",
        "received_at": "2026-08-25 10:30:00+05:30",
        "supplier_challan_number": "CODEX-E2E-CH-0001",
        "supplier_challan_date": "2026-08-25",
        "status": "posted",
        "posted_at": "2026-08-25 10:31:00+05:30",
        "inventory_document_id": "10000000-0000-7000-8000-000000000006",
        "inventory_document_number": "CODEX-E2E-GRN-0001",
        "inventory_document_status": "posted",
        "costing_method": "moving_weighted_average",
        "total_abs_base_quantity": "12.000000",
        "total_inventory_value": "120.00",
        "lines": [{
            "goods_receipt_line_id": "10000000-0000-7000-8000-000000000007",
            "line_number": 1,
            "purchase_order_line_id": "10000000-0000-7000-8000-000000000008",
            "product_id": "10000000-0000-7000-8000-000000000009",
            "product_name": "Canonical Product",
            "sku": "CODEX-E2E-SKU",
            "batch_id": "10000000-0000-7000-8000-000000000010",
            "manufacturer_batch_number": "CODEX-E2E-BATCH-0001",
            "manufactured_on": "2026-07-01",
            "expires_on": "2027-07-01",
            "mrp": "20.00",
            "batch_status": "quarantined",
            "location_id": "10000000-0000-7000-8000-000000000011",
            "location_code": "QUARANTINE",
            "location_name": "Quarantine",
            "location_type": "quarantine",
            "uom_code": "PACK",
            "received_quantity": "10.000000",
            "accepted_quantity": "10.000000",
            "rejected_quantity": "0.000000",
            "free_quantity": "2.000000",
            "base_accepted_quantity": "10.000000",
            "base_free_quantity": "2.000000",
            "qc_status": "accepted",
            "qc_notes": None,
            "unit_cost": "10.0000",
            "extended_cost": "120.00",
            "inventory": {
                "inventory_document_line_id": "10000000-0000-7000-8000-000000000012",
                "inventory_document_id": "10000000-0000-7000-8000-000000000006",
                "movement_kind": "receipt",
                "entered_quantity": "12.000000",
                "base_quantity": "12.000000",
                "unit_cost": "10.0000",
                "extended_cost": "120.00",
                "ledger_entry_id": "10000000-0000-7000-8000-000000000013",
                "ledger_quantity_delta": "12.000000",
                "ledger_value_delta": "120.00",
                "current_on_hand_quantity": "12.000000",
                "current_inventory_value": "120.00",
                "current_average_unit_cost": "10.0000",
            },
        }],
    }


def _context_payload():
    return {
        "purchase_order_id": "10000000-0000-7000-8000-000000000005",
        "purchase_order_number": "CODEX-E2E-PO-0001",
        "order_date": "2026-08-28",
        "total_amount": "188.16",
        "branch_id": "10000000-0000-7000-8000-000000000003",
        "supplier_account_id": "10000000-0000-7000-8000-000000000004",
        "supplier_name": "Canonical Supplier",
        "organization_timezone": "Asia/Kolkata",
        "business_as_of": "2026-08-28T10:30:00.123456",
        "status": "approved",
        "lines": [{
            "purchase_order_line_id": "10000000-0000-7000-8000-000000000008",
            "line_number": 1,
            "product_id": "10000000-0000-7000-8000-000000000009",
            "product_name": "Canonical Product",
            "sku": "CODEX-E2E-SKU",
            "ordered_uom_code": "PACK",
            "base_uom_code": "PACK",
            "uom_conversion_factor": "1.000000",
            "ordered_billed_quantity": "2.000000",
            "ordered_free_quantity": "0.000000",
            "remaining_billed_quantity": "2.000000",
            "remaining_free_quantity": "0.000000",
            "eligible_locations": [{
                "id": "10000000-0000-7000-8000-000000000011",
                "code": "SALEABLE",
                "name": "Saleable",
                "location_type": "saleable",
            }],
            "mrp_conversions": [{
                "id": "10000000-0000-7000-8000-000000000014",
                "from_uom_code": "PACK",
                "to_uom_code": "PACK",
                "multiplier": "1.000000",
            }],
        }],
    }


def test_routes_are_uuid_only_and_do_not_shadow_legacy_grn_crud():
    routes = [route for route in canonical_goods_receipts.router.routes if isinstance(route, APIRoute)]
    assert {route.path for route in routes} == {
        "/canonical/goods-receipts/purchase-orders/{purchase_order_id}/context",
        "/canonical/goods-receipts/{goods_receipt_id}",
    }
    assert all(
        get_type_hints(route.endpoint).get(
            "purchase_order_id",
            get_type_hints(route.endpoint).get("goods_receipt_id"),
        ) is UUID
        for route in routes
    )


def test_openapi_publishes_bearer_auth_and_uuid_path_contracts():
    app = FastAPI()
    app.include_router(canonical_goods_receipts.router, prefix="/api")
    schema = app.openapi()
    paths = schema["paths"]
    for path, parameter_name in (
        (
            "/api/canonical/goods-receipts/purchase-orders/{purchase_order_id}/context",
            "purchase_order_id",
        ),
        ("/api/canonical/goods-receipts/{goods_receipt_id}", "goods_receipt_id"),
    ):
        operation = paths[path]["get"]
        assert operation["security"] == [{"HTTPBearer": []}]
        parameter = next(
            value for value in operation["parameters"]
            if value["name"] == parameter_name and value["in"] == "path"
        )
        assert parameter["required"] is True
        assert parameter["schema"]["format"] == "uuid"
    assert schema["components"]["securitySchemes"]["HTTPBearer"] == {
        "type": "http",
        "scheme": "bearer",
    }
    context_schema = schema["components"]["schemas"]["ReceiptContextResponse"]
    assert {"order_date", "total_amount", "business_as_of"} <= set(context_schema["required"])


def test_purchase_permission_rejects_missing_bearer_token():
    checker = canonical_goods_receipts.PermissionChecker("purchase", "view")
    with pytest.raises(HTTPException) as missing:
        asyncio.run(checker(None))
    assert missing.value.status_code == 401


def test_receipt_sql_matches_checked_in_canonical_schema_catalogs():
    result = schema_validator.validate_module(Path(canonical_goods_receipts.__file__))
    assert result["errors"] == []


def test_detail_reconciles_receipt_inventory_ledger_and_value():
    response = canonical_goods_receipts.ReceiptDetailResponse.model_validate(_detail_payload())
    assert response.total_abs_base_quantity == Decimal("12.000000")
    assert response.total_inventory_value == Decimal("120.00")
    assert response.tax_impact == []
    assert response.journal_impact == []


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("base_quantity", "11.000000", "base quantity"),
        ("unit_cost", "9.0000", "unit cost"),
        ("extended_cost", "119.00", "inventory line value"),
        ("ledger_quantity_delta", "11.000000", "stock ledger quantity"),
        ("ledger_value_delta", "119.00", "stock ledger valuation"),
    ],
)
def test_detail_fails_closed_on_inventory_reconciliation_drift(field, value, message):
    payload = deepcopy(_detail_payload())
    payload["lines"][0]["inventory"][field] = value
    with pytest.raises(ValidationError, match=message):
        canonical_goods_receipts.ReceiptDetailResponse.model_validate(payload)


def test_detail_rejects_inventory_evidence_from_another_document():
    payload = deepcopy(_detail_payload())
    payload["lines"][0]["inventory"]["inventory_document_id"] = (
        "10000000-0000-7000-8000-000000000099"
    )
    with pytest.raises(ValidationError, match="different inventory document"):
        canonical_goods_receipts.ReceiptDetailResponse.model_validate(payload)


def test_detail_returns_404_instead_of_falling_back_to_legacy(monkeypatch):
    monkeypatch.setattr(canonical_goods_receipts, "_one", lambda *_args, **_kwargs: None)
    with pytest.raises(HTTPException) as missing:
        canonical_goods_receipts._canonical_goods_receipt_detail(
            object(), ORG_ID, RECEIPT_ID
        )
    assert missing.value.status_code == 404


def test_context_requires_at_least_one_receivable_line():
    payload = _context_payload()
    payload["lines"] = []
    with pytest.raises(ValidationError, match="no remaining canonical receipt lines"):
        canonical_goods_receipts.ReceiptContextResponse.model_validate(payload)


@pytest.mark.parametrize("payload_factory", [_context_payload, _detail_payload])
def test_receipt_clock_rejects_a_nonlocal_timestamp(payload_factory):
    payload = payload_factory()
    payload["business_as_of"] = "2026-08-28T10:30:00+05:30"
    model = (
        canonical_goods_receipts.ReceiptContextResponse
        if payload_factory is _context_payload
        else canonical_goods_receipts.ReceiptDetailResponse
    )
    with pytest.raises(ValidationError, match="organization-local"):
        model.model_validate(payload)


def test_receipt_wire_decimals_remain_exact_strings():
    context_wire = canonical_goods_receipts.ReceiptContextResponse.model_validate(
        _context_payload()
    ).model_dump(mode="json")
    assert context_wire["total_amount"] == "188.16"
    assert context_wire["lines"][0]["uom_conversion_factor"] == "1.000000"
    assert context_wire["lines"][0]["mrp_conversions"][0]["multiplier"] == "1.000000"

    detail_wire = canonical_goods_receipts.ReceiptDetailResponse.model_validate(
        _detail_payload()
    ).model_dump(mode="json")
    assert detail_wire["total_inventory_value"] == "120.00"
    assert detail_wire["lines"][0]["mrp"] == "20.00"
    assert detail_wire["lines"][0]["inventory"]["current_average_unit_cost"] == "10.0000"


def test_context_and_readback_publish_the_postgres_organization_local_clock(monkeypatch):
    context_payload = _context_payload()
    context_lines = context_payload.pop("lines")
    context_payload["business_date"] = date(2026, 8, 28)
    captured_sql: list[str] = []
    captured_line_params: list[dict] = []

    def context_one(_db, sql, _params):
        captured_sql.append(sql)
        return context_payload

    monkeypatch.setattr(canonical_goods_receipts, "_one", context_one)
    def context_rows(_db, _sql, params):
        captured_line_params.append(params)
        return context_lines

    monkeypatch.setattr(canonical_goods_receipts, "_rows", context_rows)
    response = canonical_goods_receipts._canonical_purchase_order_receipt_context(
        object(), ORG_ID, UUID(str(context_payload["purchase_order_id"]))
    )

    assert response.business_as_of.isoformat() == "2026-08-28T10:30:00.123456"
    assert "transaction_timestamp() AT TIME ZONE organization.timezone" in captured_sql[0]
    assert "CURRENT_TIMESTAMP" not in captured_sql[0]
    assert captured_line_params == [{
        "org_id": ORG_ID,
        "purchase_order_id": UUID(str(context_payload["purchase_order_id"])),
        "branch_id": context_payload["branch_id"],
        "business_date": date(2026, 8, 28),
    }]

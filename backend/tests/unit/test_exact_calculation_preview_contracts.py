import json
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.api.routes.calculations import (
    preview_challan_totals,
    preview_invoice_totals,
    preview_note_totals,
    preview_purchase_order_totals,
    preview_return_totals,
    preview_sales_order_totals,
)
from app.api.schemas.calculations import (
    ChallanCalculationRequest,
    InvoiceCalculationRequest,
    NoteCalculationRequest,
    PurchaseCalculationRequest,
    ReturnCalculationRequest,
    SalesOrderCalculationRequest,
)
from app.api.services.purchase.calculations import PurchaseCalculator
from app.api.services.sales.challan.service import ChallanService
from app.api.services.sales.invoice.invoice_service import InvoiceService
from app.main import app


_CONTEXT = SimpleNamespace(org_id=uuid4(), primary_branch_id=uuid4())
_UUID = "d3000000-0000-7000-8000-000000000015"


def _json_body(response):
    return json.loads(response.model_dump_json(exclude_none=True))


def _line(**overrides):
    return {
        "product_id": _UUID,
        "quantity": "1.000001",
        "free_quantity": "0",
        "unit_price": "0.10",
        "discount_percent": "0",
        "gst_percent": "18",
        **overrides,
    }


def test_all_preview_response_decimal_fields_are_openapi_string_only():
    schema = app.openapi()["components"]["schemas"]
    models = {
        "CalculationPreviewLine": {"product_id", "batch_id", "free_supply_tax_treatment"},
        "InvoiceCalculationPreviewTotals": set(),
        "ChallanCalculationPreviewTotals": set(),
        "PurchaseCalculationPreviewLine": {"product_id", "product_name"},
        "PurchaseCalculationPreviewTotals": set(),
        "ReturnCalculationPreviewLine": {"product_id"},
        "ReturnCalculationPreviewTotals": set(),
        "NoteCalculationPreviewLine": {
            "product_id", "product_name", "free_supply_tax_treatment",
        },
        "NoteCalculationPreviewTotals": set(),
    }

    for model_name, non_decimal_fields in models.items():
        for field_name, field_schema in schema[model_name]["properties"].items():
            if field_name in non_decimal_fields:
                continue
            candidates = field_schema.get("anyOf", [field_schema])
            non_null = [item for item in candidates if item.get("type") != "null"]
            assert non_null and all(item.get("type") == "string" for item in non_null), (
                model_name, field_name, field_schema
            )
            assert all(item.get("type") != "number" for item in non_null)

    for endpoint, response_name in {
        "invoice": "InvoiceCalculationPreviewResponse",
        "sales-order": "InvoiceCalculationPreviewResponse",
        "purchase-order": "PurchaseCalculationPreviewResponse",
        "challan": "ChallanCalculationPreviewResponse",
        "return": "ReturnCalculationPreviewResponse",
        "note": "NoteCalculationPreviewResponse",
    }.items():
        response_schema = app.openapi()["paths"][f"/api/calculations/{endpoint}"][
            "post"
        ]["responses"]["200"]["content"]["application/json"]["schema"]
        assert response_schema["$ref"].endswith(f"/{response_name}")


@pytest.mark.asyncio
async def test_invoice_and_sales_order_wire_preserve_exact_decimal_inputs():
    lines = [
        _line(unit_price="0.10"),
        _line(quantity="1", unit_price="0.20"),
        _line(quantity="9007199254740993.000001", unit_price="1"),
    ]
    invoice = InvoiceCalculationRequest.model_validate({
        "customer_id": _UUID,
        "gst_type": "IGST",
        "items": lines,
    })
    invoice_response = await preview_invoice_totals.__wrapped__(
        invoice, {}, db=None, context=_CONTEXT
    )
    invoice_body = _json_body(invoice_response)

    assert invoice_body["line_items"][0]["quantity"] == "1.000001"
    assert invoice_body["line_items"][0]["subtotal"] == "0.10"
    assert invoice_body["line_items"][1]["subtotal"] == "0.20"
    assert invoice_body["line_items"][2]["quantity"] == "9007199254740993.000001"
    assert invoice_body["totals"]["subtotal_amount"] == "9007199254740993.30"
    assert isinstance(invoice_body["totals"]["subtotal_amount"], str)

    order = SalesOrderCalculationRequest.model_validate({
        "customer_id": _UUID,
        "gst_type": "IGST",
        "items": lines,
    })
    order_response = await preview_sales_order_totals.__wrapped__(
        order, {}, db=None, context=_CONTEXT
    )
    order_body = _json_body(order_response)
    assert order_body["line_items"][2]["quantity"] == "9007199254740993.000001"
    assert order_body["totals"]["subtotal_amount"] == "9007199254740993.30"


@pytest.mark.asyncio
async def test_purchase_challan_return_and_note_wire_values_are_exact_strings():
    purchase_request = PurchaseCalculationRequest.model_validate({
        "supplier_id": _UUID,
        "gst_type": "IGST",
        "items": [_line(quantity="9007199254740993.000001", unit_price="1")],
    })
    purchase = _json_body(await preview_purchase_order_totals.__wrapped__(
        purchase_request, {}, db=None, context=_CONTEXT
    ))
    assert purchase["line_items"][0]["quantity"] == "9007199254740993.000001"
    assert purchase["totals"]["subtotal_amount"] == "9007199254740993.00"

    challan_request = ChallanCalculationRequest.model_validate({
        "customer_id": _UUID,
        "gst_type": "IGST",
        "items": [_line(quantity="9007199254740993.000001", unit_price="1")],
    })
    challan = _json_body(await preview_challan_totals.__wrapped__(
        challan_request, {}, db=None, context=_CONTEXT
    ))
    assert challan["line_items"][0]["quantity"] == "9007199254740993.000001"
    assert challan["totals"]["subtotal_amount"] == "9007199254740993.00"

    return_request = ReturnCalculationRequest.model_validate({
        "return_type": "sales",
        "customer_id": _UUID,
        "gst_type": "IGST",
        "items": [{
            "product_id": _UUID,
            "return_quantity": "9007199254740993.000001",
            "unit_price": "1",
            "tax_percent": "18",
        }],
    })
    returned = _json_body(await preview_return_totals.__wrapped__(
        return_request,
        user={"is_admin": True},
        db=None,
        context=_CONTEXT,
    ))
    assert returned["line_items"][0]["return_quantity"] == (
        "9007199254740993.000001"
    )
    assert returned["totals"]["subtotal"] == "9007199254740993.00"

    note_request = NoteCalculationRequest.model_validate({
        "note_type": "credit",
        "party_id": _UUID,
        "gst_type": "IGST",
        "items": [_line(quantity="9007199254740993.000001", unit_price="1")],
    })
    note = _json_body(await preview_note_totals.__wrapped__(
        note_request, {}, db=None, context=_CONTEXT
    ))
    assert note["line_items"][0]["quantity"] == "9007199254740993.000001"
    assert note["totals"]["subtotal_amount"] == "9007199254740993.00"


def test_legacy_calculation_service_defaults_remain_float_compatible():
    item = _line(quantity="1", unit_price="100")
    exact_invoice = InvoiceService.calculate_invoice_totals(
        [item], "IGST", exact_output=True
    )
    legacy_invoice = InvoiceService.calculate_invoice_totals([item], "IGST")
    assert exact_invoice.keys() == legacy_invoice.keys()
    assert exact_invoice["calculated_items"][0].keys() == (
        legacy_invoice["calculated_items"][0].keys()
    )
    assert isinstance(exact_invoice["final_amount"], Decimal)
    assert isinstance(legacy_invoice["final_amount"], float)

    exact_challan = ChallanService.calculate_challan_totals(
        [item], "IGST", exact_output=True
    )
    legacy_challan = ChallanService.calculate_challan_totals([item], "IGST")
    assert exact_challan.keys() == legacy_challan.keys()
    assert exact_challan["calculated_items"][0].keys() == (
        legacy_challan["calculated_items"][0].keys()
    )
    assert isinstance(exact_challan["final_amount"], Decimal)
    assert isinstance(legacy_challan["final_amount"], float)

    exact_purchase = PurchaseCalculator.calculate_totals(
        [item], "IGST", exact_output=True
    )
    legacy_purchase = PurchaseCalculator.calculate_totals([item], "IGST")
    assert exact_purchase.keys() == legacy_purchase.keys()
    assert exact_purchase["calculated_items"][0].keys() == (
        legacy_purchase["calculated_items"][0].keys()
    )
    assert isinstance(exact_purchase["total_amount"], Decimal)
    assert isinstance(legacy_purchase["total_amount"], float)

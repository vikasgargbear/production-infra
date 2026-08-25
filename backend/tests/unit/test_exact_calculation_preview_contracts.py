import json
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.api.routes.calculations import (
    preview_invoice_totals,
    preview_sales_order_totals,
)
from app.api.schemas.calculations import (
    InvoiceCalculationRequest,
    SalesOrderCalculationRequest,
)
from app.main import app


_CONTEXT = SimpleNamespace(org_id=uuid4(), primary_branch_id=uuid4())
_UUID = "d3000000-0000-7000-8000-000000000015"
_BRANCH_UUID = "d3000000-0000-7000-8000-000000000016"
_TAX_UUID = "d3000000-0000-7000-8000-000000000017"
_RELEASE_UUID = "d3000000-0000-7000-8000-000000000018"


def _json_body(response):
    return json.loads(response.model_dump_json(exclude_none=True))


def _sales_line(**overrides):
    return {
        "product_id": _UUID,
        "quantity": "1.000001",
        "free_quantity": "0",
        "unit_price": "0.10",
        "discount_percent": "0",
        **overrides,
    }


def _authority(line_count):
    line = SimpleNamespace(
        hsn_code="481910",
        gst_rate=Decimal("18"),
        taxability="taxable",
        tax_code_version_id=uuid4(),
        tax_release_id=uuid4(),
        tax_version_number=1,
        tax_effective_from=__import__("datetime").date(2026, 4, 1),
        tax_effective_to=None,
        tax_ruleset_version="gst-2026.04",
    )
    return SimpleNamespace(gst_type="IGST", lines=tuple(line for _ in range(line_count)))


def test_all_preview_response_decimal_fields_are_openapi_string_only():
    schema = app.openapi()["components"]["schemas"]
    models = {
        "CanonicalSalesCalculationPreviewLine": {
            "product_id", "batch_id", "free_supply_tax_treatment", "hsn_code",
            "taxability", "tax_code_version_id", "tax_release_id",
            "tax_version_number", "tax_effective_from", "tax_effective_to",
            "tax_ruleset_version",
        },
        "InvoiceCalculationPreviewTotals": set(),
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
    }.items():
        response_schema = app.openapi()["paths"][f"/api/calculations/{endpoint}"][
            "post"
        ]["responses"]["200"]["content"]["application/json"]["schema"]
        assert response_schema["$ref"].endswith(f"/{response_name}")


@pytest.mark.asyncio
async def test_invoice_and_sales_order_wire_preserve_exact_decimal_inputs(monkeypatch):
    lines = [
        _sales_line(unit_price="0.10"),
        _sales_line(quantity="1", unit_price="0.20"),
        _sales_line(quantity="9007199254740993.000001", unit_price="1"),
    ]
    monkeypatch.setattr(
        "app.api.routes.calculations.resolve_sales_tax_authority",
        lambda *args, **kwargs: _authority(len(lines)),
    )
    invoice = InvoiceCalculationRequest.model_validate({
        "branch_id": _BRANCH_UUID,
        "customer_id": _UUID,
        "document_date": "2026-08-25",
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
        "branch_id": _BRANCH_UUID,
        "customer_id": _UUID,
        "order_date": "2026-08-25",
        "items": lines,
    })
    order_response = await preview_sales_order_totals.__wrapped__(
        order, {}, db=None, context=_CONTEXT
    )
    order_body = _json_body(order_response)
    assert order_body["line_items"][2]["quantity"] == "9007199254740993.000001"
    assert order_body["totals"]["subtotal_amount"] == "9007199254740993.30"

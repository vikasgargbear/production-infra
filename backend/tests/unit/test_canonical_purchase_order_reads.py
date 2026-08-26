from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from app.api.routes import canonical_purchase_order_reads as reads
from app.main import app


def _line(**overrides):
    row = {
        "purchase_order_line_id": uuid4(),
        "line_number": 1,
        "line_kind": "product",
        "product_id": uuid4(),
        "product_name": "Canonical product",
        "product_code": "SKU-1",
        "hsn_code": "481910",
        "charge_code": None,
        "uom_code": "EA",
        "uom_conversion_id": uuid4(),
        "billed_quantity": Decimal("1.000000"),
        "free_quantity": Decimal("0.000000"),
        "free_supply_tax_treatment": "excluded_from_taxable_value",
        "quoted_unit_rate": Decimal("100.0000"),
        "price_basis": "tax_exclusive",
        "gross_amount": Decimal("100.00"),
        "line_discount_amount": Decimal("0.00"),
        "document_discount_amount": Decimal("0.00"),
        "net_value_amount": Decimal("100.00"),
        "gst_taxable_value": Decimal("100.00"),
        "cgst_rate": Decimal("6.000000"),
        "sgst_rate": Decimal("6.000000"),
        "igst_rate": Decimal("0.000000"),
        "cess_rate": Decimal("0.000000"),
        "cgst_amount": Decimal("6.00"),
        "sgst_amount": Decimal("6.00"),
        "igst_amount": Decimal("0.00"),
        "cess_amount": Decimal("0.00"),
        "line_total": Decimal("112.00"),
    }
    row.update(overrides)
    return row


def _document(**overrides):
    row = {
        "purchase_order_id": uuid4(),
        "branch_id": uuid4(),
        "supplier_id": uuid4(),
        "supplier_name": "Canonical Supplier",
        "purchase_order_number": "PO-1",
        "order_date": "2026-08-25",
        "expected_delivery_date": "2026-09-01",
        "status": "approved",
        "supply_type": "intra_state",
        "currency_code": "INR",
        "subtotal": Decimal("100.00"),
        "discount_total": Decimal("0.00"),
        "charges_total": Decimal("0.00"),
        "net_value_total": Decimal("100.00"),
        "taxable_amount": Decimal("100.00"),
        "cgst_amount": Decimal("6.00"),
        "sgst_amount": Decimal("6.00"),
        "igst_amount": Decimal("0.00"),
        "cess_amount": Decimal("0.00"),
        "rounding_adjustment": Decimal("0.00"),
        "total_amount": Decimal("112.00"),
        "calculation_ruleset_version": "gst-v1",
        "row_version": 1,
        "items": [_line()],
    }
    row.update(overrides)
    return row


def test_purchase_order_readback_route_is_published_by_the_application():
    matches = [
        route for route in reads.router.routes
        if isinstance(route, APIRoute)
        and route.path == "/canonical/purchase-orders/{purchase_order_id}"
    ]
    assert matches
    assert matches[0].endpoint is reads.canonical_purchase_order_detail
    operation = app.openapi()["paths"][
        "/api/canonical/purchase-orders/{purchase_order_id}"
    ]["get"]
    assert operation["operationId"].startswith("canonical_purchase_order_detail")


def test_purchase_order_readback_preserves_exact_decimals_and_reconciles():
    document = reads.CanonicalPurchaseOrderDetailResponse(**_document())
    assert document.total_amount == Decimal("112.00")
    assert document.items[0].billed_quantity == Decimal("1.000000")
    assert document.items[0].uom_conversion_id
    wire = document.model_dump(mode="json")
    assert wire["total_amount"] == "112.00"
    assert wire["items"][0]["billed_quantity"] == "1.000000"


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"subtotal": Decimal("99.99")}, "subtotal does not reconcile"),
        ({"cgst_amount": Decimal("6.01")}, "CGST total does not reconcile"),
        ({"total_amount": Decimal("111.99")}, "grand total does not reconcile"),
        ({"items": []}, "has no lines"),
    ],
)
def test_purchase_order_readback_fails_closed_on_inconsistent_totals(override, message):
    with pytest.raises(ValidationError, match=message):
        reads.CanonicalPurchaseOrderDetailResponse(**_document(**override))


def test_purchase_order_product_line_requires_canonical_identity():
    with pytest.raises(ValidationError, match="product line is incomplete"):
        reads.CanonicalPurchaseOrderDetailLine(**_line(uom_code=None))


def test_purchase_order_query_projects_all_reconciliation_fields(monkeypatch):
    captured = []
    document = _document()

    def fake_rows(_db, sql, params):
        captured.append((sql, params))
        if "FROM procurement.purchase_orders" in sql:
            return [{key: value for key, value in document.items() if key != "items"}]
        return document["items"]

    monkeypatch.setattr(reads, "_rows", fake_rows)
    result = reads._canonical_purchase_order_detail(
        object(), document["purchase_order_id"], document["purchase_order_id"]
    )
    assert result.purchase_order_number == "PO-1"
    assert "purchase.net_value_total" in captured[0][0]
    assert "line.document_discount_amount" in captured[1][0]
    assert "purchase_order_uom_provenance" in captured[1][0]
    assert "requested.uom_conversion_id" in captured[1][0]
    assert "request_bytes" not in captured[1][0]
    assert captured[0][1]["purchase_order_id"] == document["purchase_order_id"]

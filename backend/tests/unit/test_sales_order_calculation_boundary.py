"""Tests for the shared sales-order preview/commit calculation boundary."""

from types import SimpleNamespace

from app.api.services.sales.order.order_service import OrderService


class OrderLine:
    def model_dump(self):
        return {
            "product_id": 11,
            "quantity": "2",
            "unit_price": "100.00",
            "discount_percent": "5",
            "tax_percent": "18",
        }


def test_order_calculation_uses_commit_rules_and_delivery_charge(monkeypatch):
    captured = {}

    monkeypatch.setattr(
        "app.api.services.sales.order.order_service.OrderRepository.get_order_context",
        lambda db, org_id, customer_id: {"branch_id": 7, "user_id": 9},
    )
    monkeypatch.setattr(
        "app.api.services.sales.order.order_service.GSTService.determine_gst_type",
        lambda **kwargs: "IGST",
    )

    def calculate_invoice_totals(**kwargs):
        captured.update(kwargs)
        return {"final_amount": 236.0, "calculated_items": [{"line_total": 224.0}]}

    monkeypatch.setattr(
        "app.api.services.sales.order.order_service.InvoiceCalc.calculate_invoice_totals",
        calculate_invoice_totals,
    )

    order = SimpleNamespace(
        customer_id=5,
        items=[OrderLine()],
        delivery_charges="12.00",
        other_charges="0",
        discount_percent="0",
        discount_amount="0",
    )
    result = OrderService.calculate_order_totals(None, "org-1", None, order)

    assert result["gst_type"] == "IGST"
    assert result["branch_id"] == 7
    assert result["fallback_user_id"] == 9
    assert result["totals"]["final_amount"] == 236.0
    assert captured["gst_type"] == "IGST"
    assert captured["freight_charges"] == 12.0
    assert captured["items"][0]["gst_percent"] == "18"


def test_order_calculation_returns_canonical_tax_and_rounding(monkeypatch):
    monkeypatch.setattr(
        "app.api.services.sales.order.order_service.OrderRepository.get_order_context",
        lambda db, org_id, customer_id: {"branch_id": 7, "user_id": 9},
    )
    monkeypatch.setattr(
        "app.api.services.sales.order.order_service.GSTService.determine_gst_type",
        lambda **kwargs: "IGST",
    )

    order = SimpleNamespace(
        customer_id=5,
        items=[OrderLine()],
        delivery_charges="12.00",
        other_charges="0",
        discount_percent="0",
        discount_amount="0",
    )
    totals = OrderService.calculate_order_totals(
        None, "org-1", None, order
    )["totals"]

    assert totals["subtotal_amount"] == 200.0
    assert totals["discount_amount"] == 10.0
    assert totals["taxable_amount"] == 190.0
    assert totals["igst_amount"] == 34.2
    assert totals["freight_charges"] == 12.0
    assert totals["round_off_amount"] == -0.2
    assert totals["final_amount"] == 236.0
    assert totals["calculated_items"][0]["line_total"] == 224.2


def test_order_creation_delegates_to_shared_calculation(monkeypatch):
    calls = []

    class FakeDB:
        def commit(self):
            calls.append("commit")

        def rollback(self):
            calls.append("rollback")

    order = SimpleNamespace(
        customer_id=5,
        order_date="2026-08-19",
        items=[OrderLine()],
    )
    monkeypatch.setattr(
        "app.api.services.sales.order.order_service.OrderValidator.validate_order_data",
        lambda value: None,
    )
    monkeypatch.setattr(
        OrderService,
        "calculate_order_totals",
        lambda **kwargs: {
            "totals": {"final_amount": 236.0, "calculated_items": []},
            "gst_type": "IGST",
            "branch_id": 7,
            "fallback_user_id": 9,
        },
    )
    monkeypatch.setattr(
        "app.api.services.sales.order.order_service.DocumentNumberService.generate_number",
        lambda db, document_type, org_id: "SO-1",
    )
    monkeypatch.setattr(
        "app.api.services.sales.order.order_service.OrderRepository.create_order",
        lambda **kwargs: 101,
    )
    monkeypatch.setattr(OrderService, "_prepare_order_items", lambda *args: [])
    monkeypatch.setattr(
        "app.api.services.sales.order.order_service.OrderRepository.create_order_items_bulk",
        lambda db, items: calls.append(("items", items)),
    )

    result = OrderService.create_order_with_items(
        FakeDB(), "org-1", user_id=3, branch_id=7, order_data=order
    )

    assert result == {
        "order_id": 101,
        "order_number": "SO-1",
        "final_amount": 236.0,
        "items_created": 0,
    }
    assert "commit" in calls
    assert "rollback" not in calls

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any

import pytest

from app.domain.operator_actions.contract import (
    PREPARE_PAYLOAD_MODELS,
    validate_prepare_payload_semantics,
)


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend/scripts/provision_canonical_demo.py"
UUID_A = "d3000000-0000-7000-8000-0000000000aa"
UUID_B = "d3000000-0000-7000-8000-0000000000ab"
UUID_C = "d3000000-0000-7000-8000-0000000000ac"


def _module():
    spec = importlib.util.spec_from_file_location(
        "provision_canonical_demo_prepare_contract", SCRIPT
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _cases() -> list[tuple[str, str, dict[str, Any], dict[str, Any]]]:
    module = _module()
    portal = {
        "supplier_invoice_number": "DEMO-SUP-CONTRACT",
        "portal_document_line_id": UUID_A,
        "supplier_credit_note_portal_line_id": UUID_B,
    }
    dispatch_line = {
        "dispatch_line_id": UUID_A,
        "base_billed_quantity": "12",
        "base_free_quantity": "2",
        "allocated_base_billed_quantity": "12",
        "allocated_base_free_quantity": "2",
        "invoice_dispatch_allocation_id": UUID_B,
        "batch_id": UUID_C,
        "uom_conversion_factor": "1",
    }
    dispatch_batches = [
        {"batch_id": UUID_C, "billed_quantity": "12", "free_quantity": "2"}
    ]
    return [
        (
            "sales_order",
            "sales.order.prepare",
            module.sales_order_payload(7),
            {
                "customer_account_id": module.IDS["customer_account"],
                "delivery_address_id": module.IDS["customer_address"],
                "delivery_address_row_version": "7",
            },
        ),
        (
            "purchase_order",
            "procurement.purchase_order.prepare",
            module.purchase_order_payload(),
            {"supplier_account_id": module.IDS["supplier_account"]},
        ),
        (
            "ui_purchase_order",
            "procurement.purchase_order.prepare",
            module.supplier_invoice_ui_purchase_order_payload(),
            {"supplier_account_id": module.IDS["supplier_account"]},
        ),
        (
            "supplier_advance",
            "finance.supplier_advance.prepare",
            module.supplier_advance_payload(UUID_A, UUID_B),
            {"purchase_order_id": UUID_A},
        ),
        (
            "goods_receipt",
            "procurement.goods_receipt.prepare",
            module.goods_receipt_payload(UUID_A, UUID_B),
            {"purchase_order_id": UUID_A},
        ),
        (
            "ui_goods_receipt",
            "procurement.goods_receipt.prepare",
            module.supplier_invoice_ui_goods_receipt_payload(UUID_A, UUID_B),
            {"purchase_order_id": UUID_A},
        ),
        (
            "supplier_invoice",
            "procurement.supplier_invoice.prepare",
            module.supplier_invoice_payload(UUID_A, UUID_B, portal),
            {"portal_document_line_id": UUID_A},
        ),
        (
            "supplier_payment",
            "finance.supplier_payment.prepare",
            module.supplier_payment_payload(UUID_A),
            {"allocations.0.open_item_id": UUID_A},
        ),
        (
            "sales_dispatch",
            "sales.dispatch.prepare",
            module.sales_dispatch_payload(UUID_A, UUID_B, dispatch_batches),
            {"sales_order_id": UUID_A},
        ),
        (
            "sales_invoice",
            "sales.invoice.prepare",
            module.sales_invoice_payload([dispatch_line], 7),
            {
                "delivery_address_id": module.IDS["customer_address"],
                "delivery_address_row_version": "7",
            },
        ),
        (
            "customer_receipt",
            "finance.customer_receipt.prepare",
            module.customer_receipt_payload(UUID_A),
            {"allocations.0.open_item_id": UUID_A},
        ),
        (
            "sales_return",
            "sales.return.prepare",
            module.sales_return_payload(UUID_A, UUID_B, [dispatch_line]),
            {"original_invoice_id": UUID_A},
        ),
        (
            "purchase_return",
            "procurement.purchase_return.prepare",
            module.purchase_return_payload(UUID_A, UUID_B, UUID_C, UUID_A, portal),
            {"original_supplier_invoice_id": UUID_A},
        ),
        (
            "inventory_adjustment",
            "inventory.adjustment.prepare",
            module.inventory_adjustment_payload(UUID_A, "100"),
            {"lines.0.batch_counts.0.batch_id": UUID_A},
        ),
    ]


def _value_at(payload: dict[str, Any], path: str) -> Any:
    value: Any = payload
    for part in path.split("."):
        value = value[int(part)] if isinstance(value, list) else value[part]
    return value


@pytest.mark.parametrize(
    ("fixture_name", "operation", "payload", "lineage"),
    _cases(),
    ids=lambda value: value if isinstance(value, str) and "." not in value else None,
)
def test_every_demo_prepare_payload_matches_the_published_contract_and_semantics(
    fixture_name: str,
    operation: str,
    payload: dict[str, Any],
    lineage: dict[str, Any],
) -> None:
    del fixture_name
    validated = PREPARE_PAYLOAD_MODELS[operation].model_validate(payload)
    validate_prepare_payload_semantics(operation, validated)

    for path, expected in lineage.items():
        assert str(_value_at(payload, path)) == expected


def test_demo_chain_keeps_exact_lineage_between_each_prepare_payload() -> None:
    module = _module()
    portal = {
        "supplier_invoice_number": "DEMO-SUP-CONTRACT",
        "portal_document_line_id": UUID_A,
        "supplier_credit_note_portal_line_id": UUID_B,
    }
    dispatch_line = {
        "dispatch_line_id": UUID_A,
        "base_billed_quantity": "12",
        "base_free_quantity": "2",
        "allocated_base_billed_quantity": "12",
        "allocated_base_free_quantity": "2",
        "invoice_dispatch_allocation_id": UUID_B,
        "batch_id": UUID_C,
        "uom_conversion_factor": "1",
    }

    advance = module.supplier_advance_payload(UUID_A, UUID_B)
    receipt = module.goods_receipt_payload(UUID_A, UUID_B)
    supplier_invoice = module.supplier_invoice_payload(UUID_A, UUID_B, portal)
    dispatch = module.sales_dispatch_payload(
        UUID_A,
        UUID_B,
        [{"batch_id": UUID_C, "billed_quantity": "12", "free_quantity": "2"}],
    )
    invoice = module.sales_invoice_payload([dispatch_line], 7)
    sales_return = module.sales_return_payload(UUID_A, UUID_B, [dispatch_line])
    purchase_return = module.purchase_return_payload(
        UUID_A, UUID_B, UUID_C, UUID_A, portal
    )

    assert advance["allocations"][0]["purchase_order_line_id"] == UUID_B
    assert receipt["lines"][0]["purchase_order_line_id"] == UUID_B
    assert supplier_invoice["goods_receipt_ids"] == [UUID_A]
    assert supplier_invoice["lines"][0]["goods_receipt_line_id"] == UUID_B
    assert dispatch["lines"][0]["sales_order_line_id"] == UUID_B
    assert dispatch["lines"][0]["batch_allocations"][0]["batch_id"] == UUID_C
    assert invoice["lines"][0]["dispatch_allocations"][0]["dispatch_line_id"] == UUID_A
    assert sales_return["lines"][0]["original_invoice_line_id"] == UUID_B
    assert sales_return["lines"][0]["invoice_dispatch_allocation_id"] == UUID_B
    assert sales_return["lines"][0]["batch_allocation"]["batch_id"] == UUID_C
    assert purchase_return["lines"][0]["goods_receipt_line_id"] == UUID_B
    assert purchase_return["lines"][0]["supplier_invoice_receipt_allocation_id"] == UUID_C
    assert purchase_return["supplier_credit_note_portal_line_id"] == UUID_B


def test_bespoke_sales_order_preflight_uses_the_same_strict_contract_as_the_api() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    preflight = source.split("def preflight_sales_order", 1)[1].split(
        "\ndef exercise_sales_order", 1
    )[0]

    assert 'PREPARE_PAYLOAD_MODELS["sales.order.prepare"].model_validate' in preflight
    assert 'validate_prepare_payload_semantics("sales.order.prepare"' in preflight
    assert 'model_dump(mode="json", exclude_none=True)' in preflight

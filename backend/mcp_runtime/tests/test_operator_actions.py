from __future__ import annotations

import json
from pathlib import Path

import pytest

from aasopharma_mcp.operator_actions import (
    APPROVE_INPUT_SCHEMA,
    EXECUTE_INPUT_SCHEMA,
    OPERATOR_ACTIONS_EXPORTED,
    PUBLISHED_PREPARE_TOOL_NAMES,
    PREPARE_ACTIONS,
    RELEASE_GATES,
    SHARED_ACTION_SCHEMAS,
    OperatorActionsUnavailable,
    planned_operator_action_tool_names,
    require_operator_action_publication_ready,
)


EXPECTED_PREPARES = {
    "erp_sales_order_prepare",
    "erp_sales_dispatch_prepare",
    "erp_sales_invoice_prepare",
    "erp_sales_return_prepare",
    "erp_purchase_order_prepare",
    "erp_goods_receipt_prepare",
    "erp_supplier_invoice_prepare",
    "erp_purchase_return_prepare",
    "erp_customer_receipt_prepare",
    "erp_customer_cheque_clearance_prepare",
    "erp_customer_cheque_bounce_prepare",
    "erp_supplier_payment_prepare",
    "erp_supplier_advance_prepare",
    "erp_adjustment_note_prepare",
    "erp_bank_reconciliation_prepare",
    "erp_inventory_transfer_prepare",
    "erp_inventory_adjustment_prepare",
    "erp_inventory_destruction_prepare",
    "erp_expense_claim_prepare",
    "erp_sales_return_reversal_prepare",
    "erp_purchase_return_reversal_prepare",
    "erp_adjustment_note_reversal_prepare",
}


def _property_names(schema):
    names = set(schema.get("properties", {}))
    for child in schema.get("properties", {}).values():
        names.update(_property_names(child))
    if isinstance(schema.get("items"), dict):
        names.update(_property_names(schema["items"]))
    return names


def test_only_reviewed_operator_action_subset_is_live_registered() -> None:
    service_contract = json.loads(
        (Path(__file__).parents[1] / "service-contract.json").read_text(
            encoding="utf-8"
        )
    )
    live_tools = tuple(service_contract["tools"])
    assert set(PREPARE_ACTIONS) == EXPECTED_PREPARES
    assert set(SHARED_ACTION_SCHEMAS) == {
        "erp_operation_approve",
        "erp_operation_review_get",
        "erp_operation_execute",
        "erp_operation_status_get",
        "erp_bank_reconciliation_get",
        "erp_sales_dispatch_readback",
        "erp_sales_return_readback",
        "erp_purchase_return_readback",
        "erp_customer_receipt_readback",
        "erp_customer_cheque_clearance_readback",
        "erp_customer_cheque_bounce_readback",
        "erp_supplier_payment_readback",
        "erp_supplier_advance_readback",
        "erp_inventory_transfer_readback",
        "erp_inventory_adjustment_readback",
        "erp_expense_claim_readback",
        "erp_sales_return_reversal_readback",
        "erp_purchase_return_reversal_readback",
        "erp_adjustment_note_reversal_readback",
    }
    assert OPERATOR_ACTIONS_EXPORTED is True
    published = set(PUBLISHED_PREPARE_TOOL_NAMES) | set(SHARED_ACTION_SCHEMAS)
    assert set(planned_operator_action_tool_names()) & set(live_tools) == published
    assert EXPECTED_PREPARES == set(PUBLISHED_PREPARE_TOOL_NAMES)
    assert require_operator_action_publication_ready() is None
    assert all(value is True for value in RELEASE_GATES.values())

    blocked = dict(RELEASE_GATES)
    blocked["idempotency_concurrency_audit_verified"] = False
    with pytest.raises(OperatorActionsUnavailable, match="not publishable"):
        require_operator_action_publication_ready(blocked)


def test_execute_can_only_reference_an_immutable_approved_preview() -> None:
    expected = {"command_request_id", "preview_hash", "idempotency_key"}
    assert set(EXECUTE_INPUT_SCHEMA["properties"]) == expected
    assert set(EXECUTE_INPUT_SCHEMA["required"]) == expected
    assert EXECUTE_INPUT_SCHEMA["additionalProperties"] is False
    assert EXECUTE_INPUT_SCHEMA["properties"]["preview_hash"]["pattern"].startswith(
        "^sha256:"
    )
    assert not (
        {"payload", "business_payload", "lines", "amount", "quantity"}
        & _property_names(EXECUTE_INPUT_SCHEMA)
    )


def test_approval_binds_human_intent_to_same_preview_without_business_input() -> None:
    assert set(APPROVE_INPUT_SCHEMA["properties"]) == {
        "command_request_id",
        "preview_hash",
        "approval_intent",
        "idempotency_key",
    }
    assert APPROVE_INPUT_SCHEMA["properties"]["approval_intent"]["enum"] == [
        "approve"
    ]
    assert APPROVE_INPUT_SCHEMA["additionalProperties"] is False


def test_commercial_discounts_are_explicit_and_tax_is_never_client_selected() -> None:
    tax_fields = {
        "gst_rate",
        "cgst_rate",
        "sgst_rate",
        "igst_rate",
        "cess_rate",
        "tax_rate",
        "tax_amount",
        "tax_rule_id",
        "withholding_rate",
    }
    for tool in (
        "erp_sales_order_prepare",
        "erp_sales_invoice_prepare",
        "erp_purchase_order_prepare",
        "erp_supplier_invoice_prepare",
    ):
        schema = PREPARE_ACTIONS[tool].input_schema
        names = _property_names(schema)
        assert {
            "line_discount",
            "line_discount_kind",
            "line_discount_basis",
            "line_discount_value",
            "document_discount",
            "document_discount_kind",
            "document_discount_basis",
            "document_discount_value",
        } <= names
        assert not (names & tax_fields)

    line_discount = PREPARE_ACTIONS["erp_sales_order_prepare"].input_schema[
        "properties"
    ]["lines"]["items"]["properties"]["line_discount"]
    assert line_discount["additionalProperties"] is False
    assert line_discount["properties"]["line_discount_kind"]["enum"] == [
        "none",
        "percent",
        "amount",
    ]
    assert line_discount["properties"]["line_discount_value"]["type"] == "string"


def test_adjustment_note_mcp_forbids_duplicate_source_supply_and_tax_authority() -> None:
    schema = PREPARE_ACTIONS["erp_adjustment_note_prepare"].input_schema
    line = schema["properties"]["lines"]["items"]
    forbidden_header = {
        "currency_code",
        "supply_type",
        "zero_rated_payment_mode",
        "tax_charge_mechanism",
        "calculation_ruleset_version",
    }
    forbidden_line = {
        "uom_code",
        "uom_conversion_factor",
        "tax_charge_mechanism",
        "tax_classification_code_snapshot",
        "tax_code_version_id",
        "taxability_snapshot",
        "cgst_rate",
        "sgst_rate",
        "igst_rate",
        "cess_rate",
    }

    assert schema["additionalProperties"] is False
    assert line["additionalProperties"] is False
    assert not (forbidden_header & set(schema["properties"]))
    assert not (forbidden_line & set(line["properties"]))


def test_commercial_field_names_match_canonical_semantics() -> None:
    names = _property_names(
        PREPARE_ACTIONS["erp_sales_order_prepare"].input_schema
    )
    assert {
        "uom_conversion_id",
        "billed_quantity",
        "free_quantity",
        "quoted_unit_rate",
        "price_basis",
        "rounding_policy",
    } <= names
    assert not names & {
        "unit_id",
        "quantity",
        "unit_price",
        "price_tax_mode",
        "discount",
    }


def test_every_physical_movement_requires_explicit_batch_facts() -> None:
    for tool in (
        "erp_sales_dispatch_prepare",
        "erp_sales_invoice_prepare",
        "erp_sales_return_prepare",
        "erp_goods_receipt_prepare",
        "erp_purchase_return_prepare",
        "erp_inventory_transfer_prepare",
        "erp_inventory_adjustment_prepare",
        "erp_inventory_destruction_prepare",
    ):
        assert {"batch_allocation", "batch_allocations", "batch_counts", "batches"} & _property_names(
            PREPARE_ACTIONS[tool].input_schema
        ), tool


def test_inventory_adjustment_is_a_hidden_typed_cycle_count_gain() -> None:
    schema = PREPARE_ACTIONS["erp_inventory_adjustment_prepare"].input_schema
    properties = schema["properties"]

    assert properties["reason_code"]["enum"] == ["cycle_count"]
    assert {"counted_at", "counted_by_membership_id", "evidence_attachment_id"} <= set(properties)
    assert "direction" not in properties
    assert "evidence_reference" not in properties
    batch = properties["lines"]["items"]["properties"]["batch_counts"]["items"]
    assert set(batch["required"]) == {
        "batch_id", "counted_quantity", "stock_balance_row_version",
    }
    assert OPERATOR_ACTIONS_EXPORTED is True


def test_supplier_advance_transport_is_single_line_non_cheque() -> None:
    schema = PREPARE_ACTIONS["erp_supplier_advance_prepare"].input_schema
    properties = schema["properties"]

    assert properties["payment_method"]["enum"] == ["bank_transfer", "upi"]
    assert properties["allocations"]["minItems"] == 1
    assert properties["allocations"]["maxItems"] == 1
    assert set(properties["allocations"]["items"]["required"]) == {
        "purchase_order_line_id",
        "gross_amount",
    }
    assert OPERATOR_ACTIONS_EXPORTED is True


def test_supplier_payment_transport_is_exact_non_cheque_invoice_allocation() -> None:
    schema = PREPARE_ACTIONS["erp_supplier_payment_prepare"].input_schema
    properties = schema["properties"]

    assert properties["payment_method"]["enum"] == ["bank_transfer", "upi"]
    assert set(properties["allocations"]["items"]["required"]) == {
        "open_item_id",
        "cash_amount",
    }
    assert "expected_gross_amount" in schema["required"]
    assert "permanently consumed" in properties["external_reference"]["description"]
    assert OPERATOR_ACTIONS_EXPORTED is True

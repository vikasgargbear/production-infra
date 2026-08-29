#!/usr/bin/env python3
"""Audit the bounded published MCP operator-action boundary."""

from __future__ import annotations

import ast
import importlib.util
import json
from pathlib import Path
import sys
from types import ModuleType
from typing import Any, Iterable, Mapping


REPO_ROOT = Path(__file__).resolve().parents[3]
CONTRACT_PATH = REPO_ROOT / "docs/architecture/mcp-operator-actions.json"
SERVICE_CONTRACT_PATH = REPO_ROOT / "backend/mcp_runtime/service-contract.json"
APP_CONTRACT_PATH = REPO_ROOT / "docs/architecture/app-data-contract.json"
RUNTIME_PATH = (
    REPO_ROOT / "backend/mcp_runtime/aasopharma_mcp/operator_actions.py"
)
APPLICATION_CONTRACT_PATH = (
    REPO_ROOT / "backend/app/domain/operator_actions/contract.py"
)
ACTION_ROUTE_PATH = REPO_ROOT / "backend/app/api/routes/internal/mcp_actions.py"

EXPECTED_PREPARE_TOOLS = {
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
    "erp_inventory_transfer_prepare",
    "erp_inventory_adjustment_prepare",
    "erp_inventory_destruction_prepare",
    "erp_bank_reconciliation_prepare",
    "erp_expense_claim_prepare",
    "erp_sales_return_reversal_prepare",
    "erp_purchase_return_reversal_prepare",
    "erp_adjustment_note_reversal_prepare",
}
EXPECTED_SHARED_TOOLS = {
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
EXPECTED_BASE_READ_TOOLS = {
    "erp_customer_activity_get",
    "erp_customer_get",
    "erp_party_aging_get",
    "erp_party_statement_get",
    "erp_product_master_search",
    "erp_product_search",
    "erp_product_setup_options_get",
    "erp_product_ingredient_search",
    "erp_product_hsn_search",
    "erp_product_setup_get",
    "erp_profit_loss_get",
    "erp_purchase_bill_mapping_review",
    "erp_supplier_search",
    "erp_supplier_get",
    "erp_gst_settings_get",
    "erp_trial_balance_get",
}
EXPECTED_MASTER_WRITE_TOOLS = {
    "erp_drug_license_record",
    "erp_product_activate",
    "erp_product_create",
    "erp_product_setup",
    "erp_product_category_create",
    "erp_product_manufacturer_create",
    "erp_customer_create",
    "erp_customer_update",
    "erp_supplier_create",
    "erp_supplier_update",
}
EXPECTED_INVOICE_DRAFT_TOOLS = {
    "erp_invoice_draft_abandon",
    "erp_invoice_draft_get",
    "erp_invoice_draft_list",
    "erp_invoice_draft_prepare",
    "erp_invoice_draft_save",
    "erp_invoice_draft_update",
}
EXPECTED_INVOICE_DRAFT_READ_TOOLS = {
    "erp_invoice_draft_get",
    "erp_invoice_draft_list",
}
EXPECTED_UNAVAILABLE_PREPARE_TOOLS = set()
EXPECTED_RESOLUTION_TOOLS = {
    "erp_customer_search",
    "erp_inventory_location_search",
    "erp_stock_batch_search",
    "erp_sales_order_get",
    "erp_sales_invoice_get",
    "erp_purchase_order_get",
    "erp_goods_receipt_get",
    "erp_supplier_invoice_get",
    "erp_open_item_search",
    "erp_settlement_choice_search",
    "erp_adjustment_note_readback_get",
    "erp_inventory_destruction_readback_get",
}
EXPECTED_RELEASE_GATES = {
    "canonical_api_command_boundary_verified",
    "canonical_database_commands_deployed_verified",
    "calculation_tax_inventory_parity_verified",
    "idempotency_concurrency_audit_verified",
    "hosted_oauth_consent_verified",
    "official_mcp_sdk_staging_verified",
}
EXECUTE_FIELDS = {"command_request_id", "preview_hash", "idempotency_key"}
FORBIDDEN_BUSINESS_INPUT_FIELDS = {
    "gst_rate",
    "gst_percent",
    "gst_percentage",
    "cgst_rate",
    "sgst_rate",
    "igst_rate",
    "cess_rate",
    "tax_rate",
    "tax_amount",
    "tax_rule_id",
    "withholding_rate",
    "withholding_rule_id",
}
FORBIDDEN_AMBIGUOUS_INPUT_FIELDS = {
    "id",
    "qty",
    "unit_id",
    "quantity",
    "unit_price",
    "unit_rate",
    "price_tax_mode",
    "price_mode",
    "discount",
    "gst_percent",
    "gst_percentage",
    "tax_percent",
    "generate_no",
    "version",
    "amount_total",
    "final_amount",
    "invoice_status",
    "order_status",
}

SELECTED_UOM_QUANTITY_FIELDS = {
    "billed_quantity",
    "free_quantity",
    "entered_quantity",
    "received_quantity",
    "accepted_quantity",
    "rejected_quantity",
    "counted_quantity",
}
BASE_UOM_QUANTITY_FIELDS = {
    "allocated_base_billed_quantity",
    "allocated_base_free_quantity",
}

# These names are intentionally polymorphic only in the listed, fully qualified
# contexts. Every other repeated name must retain one recursive JSON shape.
EXPLICIT_CONTEXT_QUALIFIED_REUSE = {
    "fulfillment_source": {
        "erp_sales_invoice_prepare.lines[].fulfillment_source",
        "erp_sales_return_prepare.lines[].fulfillment_source",
    },
    "allocations": {
        "erp_customer_receipt_prepare.allocations",
        "erp_supplier_payment_prepare.allocations",
        "erp_supplier_advance_prepare.allocations",
    },
    "batch_allocations": {
        "erp_sales_dispatch_prepare.lines[].batch_allocations",
        "erp_sales_invoice_prepare.lines[].batch_allocations",
        "erp_inventory_transfer_prepare.lines[].batch_allocations",
        "erp_inventory_destruction_prepare.lines[].batch_allocations",
    },
    "lines": {
        "erp_adjustment_note_prepare.lines",
        "erp_sales_order_prepare.lines",
        "erp_sales_dispatch_prepare.lines",
        "erp_sales_invoice_prepare.lines",
        "erp_sales_return_prepare.lines",
        "erp_purchase_order_prepare.lines",
        "erp_goods_receipt_prepare.lines",
        "erp_supplier_invoice_prepare.lines",
        "erp_purchase_return_prepare.lines",
        "erp_inventory_transfer_prepare.lines",
        "erp_inventory_adjustment_prepare.lines",
        "erp_inventory_destruction_prepare.lines",
        "erp_expense_claim_prepare.lines",
    },
    "payment_method": {
        "erp_customer_receipt_prepare.payment_method",
        "erp_supplier_payment_prepare.payment_method",
        "erp_supplier_advance_prepare.payment_method",
    },
    "reason_code": {
        "erp_adjustment_note_prepare.reason_code",
        "erp_customer_cheque_bounce_prepare.reason_code",
        "erp_sales_return_prepare.reason_code",
        "erp_purchase_return_prepare.reason_code",
        "erp_inventory_adjustment_prepare.reason_code",
        "erp_inventory_destruction_prepare.reason_code",
    },
    "amount": {
        "erp_customer_receipt_prepare.amount",
        "erp_customer_receipt_prepare.allocations[].amount",
    },
    "open_item_id": {
        "erp_customer_receipt_prepare.allocations[].open_item_id",
        "erp_supplier_payment_prepare.allocations[].open_item_id",
    },
    "bank_account_id": {
        "erp_customer_receipt_prepare.bank_account_id",
        "erp_customer_cheque_clearance_prepare.bank_account_id",
        "erp_supplier_payment_prepare.bank_account_id",
        "erp_supplier_advance_prepare.bank_account_id",
    },
    "evidence_attachment_id": {
        "erp_customer_receipt_prepare.evidence_attachment_id",
        "erp_customer_cheque_clearance_prepare.evidence_attachment_id",
        "erp_customer_cheque_bounce_prepare.evidence_attachment_id",
        "erp_inventory_adjustment_prepare.evidence_attachment_id",
    },
    "sales_order_id": {
        "erp_customer_receipt_prepare.sales_order_id",
        "erp_sales_dispatch_prepare.sales_order_id",
    },
    "billed_quantity": {
        "erp_adjustment_note_prepare.lines[].billed_quantity",
        "erp_sales_order_prepare.lines[].billed_quantity",
        "erp_sales_dispatch_prepare.lines[].billed_quantity",
        "erp_sales_dispatch_prepare.lines[].batch_allocations[].billed_quantity",
        "erp_sales_invoice_prepare.lines[].billed_quantity",
        "erp_sales_invoice_prepare.lines[].batch_allocations[].billed_quantity",
        "erp_sales_return_prepare.lines[].billed_quantity",
        "erp_sales_return_prepare.lines[].batch_allocation.billed_quantity",
        "erp_purchase_order_prepare.lines[].billed_quantity",
        "erp_supplier_invoice_prepare.lines[].billed_quantity",
        "erp_purchase_return_prepare.lines[].billed_quantity",
        "erp_purchase_return_prepare.lines[].batch_allocation.billed_quantity",
    },
    "command_request_id": {
        "erp_operation_approve.command_request_id",
        "erp_operation_execute.command_request_id",
        "erp_operation_review_get.command_request_id",
        "erp_operation_status_get.command_request_id",
        "erp_bank_reconciliation_get.command_request_id",
        "erp_sales_dispatch_readback.command_request_id",
        "erp_sales_return_readback.command_request_id",
        "erp_purchase_return_readback.command_request_id",
        "erp_customer_receipt_readback.command_request_id",
        "erp_customer_cheque_clearance_readback.command_request_id",
        "erp_customer_cheque_bounce_readback.command_request_id",
        "erp_supplier_payment_readback.command_request_id",
        "erp_supplier_advance_readback.command_request_id",
        "erp_inventory_transfer_readback.command_request_id",
        "erp_inventory_adjustment_readback.command_request_id",
        "erp_expense_claim_readback.command_request_id",
        "erp_sales_return_reversal_readback.command_request_id",
        "erp_purchase_return_reversal_readback.command_request_id",
        "erp_adjustment_note_reversal_readback.command_request_id",
    },
    "document_discount_eligible": {
        "erp_adjustment_note_prepare.lines[].document_discount_eligible",
        *(f"{tool}.{kind}[].document_discount_eligible"
        for tool in (
            "erp_sales_order_prepare", "erp_sales_invoice_prepare",
            "erp_purchase_order_prepare", "erp_supplier_invoice_prepare",
        )
        for kind in ("charge_lines", "lines")
        if not (tool == "erp_supplier_invoice_prepare" and kind == "charge_lines"))
    },
    "external_reference": {
        "erp_customer_receipt_prepare.external_reference",
        "erp_supplier_payment_prepare.external_reference",
        "erp_supplier_advance_prepare.external_reference",
    },
    "gst_tax_treatment": {
        "erp_adjustment_note_prepare.gst_tax_treatment",
        "erp_sales_return_prepare.gst_tax_treatment",
        "erp_purchase_return_prepare.gst_tax_treatment",
    },
    "recipient_itc_reversal_evidence_attachment_id": {
        "erp_adjustment_note_prepare.recipient_itc_reversal_evidence_attachment_id",
        "erp_sales_return_prepare.recipient_itc_reversal_evidence_attachment_id",
    },
    "recipient_itc_reversal_confirmed_at": {
        "erp_adjustment_note_prepare.recipient_itc_reversal_confirmed_at",
        "erp_sales_return_prepare.recipient_itc_reversal_confirmed_at",
    },
    "reason": {
        "erp_adjustment_note_prepare.reason",
        "erp_inventory_destruction_prepare.reason",
        "erp_sales_return_reversal_prepare.reason",
        "erp_purchase_return_reversal_prepare.reason",
        "erp_adjustment_note_reversal_prepare.reason",
    },
    "free_quantity": {
        "erp_adjustment_note_prepare.lines[].free_quantity",
        "erp_sales_order_prepare.lines[].free_quantity",
        "erp_sales_dispatch_prepare.lines[].free_quantity",
        "erp_sales_dispatch_prepare.lines[].batch_allocations[].free_quantity",
        "erp_sales_invoice_prepare.lines[].free_quantity",
        "erp_sales_invoice_prepare.lines[].batch_allocations[].free_quantity",
        "erp_sales_return_prepare.lines[].free_quantity",
        "erp_sales_return_prepare.lines[].batch_allocation.free_quantity",
        "erp_purchase_order_prepare.lines[].free_quantity",
        "erp_goods_receipt_prepare.lines[].batches[].free_quantity",
        "erp_supplier_invoice_prepare.lines[].free_quantity",
        "erp_purchase_return_prepare.lines[].free_quantity",
        "erp_purchase_return_prepare.lines[].batch_allocation.free_quantity",
    },
    "from_location_id": {
        "erp_sales_dispatch_prepare.from_location_id",
        "erp_sales_invoice_prepare.from_location_id",
        "erp_purchase_return_prepare.lines[].from_location_id",
    },
    "gross_amount": {
        "erp_supplier_advance_prepare.gross_amount",
        "erp_supplier_advance_prepare.allocations[].gross_amount",
    },
    "idempotency_key": {
        *(f"{tool}.idempotency_key" for tool in EXPECTED_PREPARE_TOOLS),
        "erp_operation_approve.idempotency_key",
        "erp_operation_execute.idempotency_key",
    },
    "invoice_date": {
        "erp_sales_invoice_prepare.invoice_date",
        "erp_supplier_invoice_prepare.invoice_date",
    },
    "location_id": {
        "erp_inventory_adjustment_prepare.location_id",
        "erp_inventory_destruction_prepare.location_id",
    },
    "order_date": {
        "erp_sales_order_prepare.order_date",
        "erp_purchase_order_prepare.order_date",
    },
    "payment_date": {
        "erp_customer_receipt_prepare.payment_date",
        "erp_supplier_payment_prepare.payment_date",
        "erp_supplier_advance_prepare.payment_date",
    },
    "price_basis": {
        "erp_adjustment_note_prepare.lines[].price_basis",
        *(f"{tool}.{kind}[].price_basis"
        for tool in (
            "erp_sales_order_prepare", "erp_sales_invoice_prepare",
            "erp_purchase_order_prepare", "erp_supplier_invoice_prepare",
        )
        for kind in ("charge_lines", "lines")
        if not (tool == "erp_supplier_invoice_prepare" and kind == "charge_lines"))
    },
    "product_id": {
        "erp_sales_order_prepare.lines[].product_id",
        "erp_sales_invoice_prepare.lines[].product_id",
        "erp_purchase_order_prepare.lines[].product_id",
        "erp_inventory_transfer_prepare.lines[].product_id",
        "erp_inventory_adjustment_prepare.lines[].product_id",
        "erp_inventory_destruction_prepare.lines[].product_id",
    },
    "purchase_order_line_id": {
        "erp_goods_receipt_prepare.lines[].purchase_order_line_id",
        "erp_supplier_advance_prepare.allocations[].purchase_order_line_id",
    },
    "return_date": {
        "erp_sales_return_prepare.return_date",
        "erp_purchase_return_prepare.return_date",
    },
    "settlement_account_id": {
        "erp_customer_receipt_prepare.settlement_account_id",
        "erp_supplier_payment_prepare.settlement_account_id",
        "erp_supplier_advance_prepare.settlement_account_id",
    },
    "supplier_account_id": {
        "erp_purchase_order_prepare.supplier_account_id",
        "erp_goods_receipt_prepare.supplier_account_id",
        "erp_supplier_invoice_prepare.supplier_account_id",
        "erp_supplier_payment_prepare.supplier_account_id",
        "erp_supplier_advance_prepare.supplier_account_id",
    },
    "to_location_id": {
        "erp_sales_return_prepare.lines[].to_location_id",
        "erp_goods_receipt_prepare.lines[].batches[].to_location_id",
    },
    "uom_conversion_id": {
        "erp_sales_order_prepare.lines[].uom_conversion_id",
        "erp_sales_invoice_prepare.lines[].uom_conversion_id",
        "erp_purchase_order_prepare.lines[].uom_conversion_id",
        "erp_inventory_transfer_prepare.lines[].uom_conversion_id",
        "erp_inventory_adjustment_prepare.lines[].uom_conversion_id",
        "erp_inventory_destruction_prepare.lines[].uom_conversion_id",
    },
}
BATCHED_TOOLS = {
    "erp_sales_dispatch_prepare",
    "erp_sales_invoice_prepare",
    "erp_sales_return_prepare",
    "erp_goods_receipt_prepare",
    "erp_purchase_return_prepare",
    "erp_inventory_transfer_prepare",
    "erp_inventory_adjustment_prepare",
    "erp_inventory_destruction_prepare",
}
EXPECTED_APPROVAL_POLICIES = {
    "erp_sales_order_prepare": "actor_confirmation",
    "erp_sales_dispatch_prepare": "actor_confirmation",
    "erp_sales_invoice_prepare": "actor_confirmation",
    "erp_sales_return_prepare": "separate_approver",
    "erp_purchase_order_prepare": "actor_confirmation",
    "erp_goods_receipt_prepare": "actor_confirmation",
    "erp_supplier_invoice_prepare": "actor_confirmation",
    "erp_purchase_return_prepare": "separate_approver",
    "erp_customer_receipt_prepare": "actor_confirmation",
    "erp_customer_cheque_clearance_prepare": "separate_approver",
    "erp_customer_cheque_bounce_prepare": "separate_approver",
    "erp_supplier_payment_prepare": "actor_confirmation",
    "erp_supplier_advance_prepare": "separate_approver",
    "erp_adjustment_note_prepare": "separate_approver",
    "erp_inventory_transfer_prepare": "actor_confirmation",
    "erp_inventory_adjustment_prepare": "separate_approver",
    "erp_inventory_destruction_prepare": "separate_approver",
    "erp_bank_reconciliation_prepare": "separate_approver",
    "erp_expense_claim_prepare": "separate_approver",
    "erp_sales_return_reversal_prepare": "separate_approver",
    "erp_purchase_return_reversal_prepare": "separate_approver",
    "erp_adjustment_note_reversal_prepare": "separate_approver",
}


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_runtime() -> ModuleType:
    name = "_aasopharma_operator_actions_audit"
    spec = importlib.util.spec_from_file_location(name, RUNTIME_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load MCP operator action runtime")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def _duplicates(values: Iterable[str]) -> set[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for value in values:
        if value in seen:
            duplicates.add(value)
        seen.add(value)
    return duplicates


def _property_names(schema: Mapping[str, Any]) -> set[str]:
    found: set[str] = set()
    properties = schema.get("properties", {})
    if isinstance(properties, dict):
        found.update(properties)
        for child in properties.values():
            if isinstance(child, dict):
                found.update(_property_names(child))
    items = schema.get("items")
    if isinstance(items, dict):
        found.update(_property_names(items))
    return found


def _schema_shape(schema: Mapping[str, Any]) -> tuple[Any, ...]:
    """Return the recursive transport shape, excluding explanatory prose."""
    properties = schema.get("properties", {})
    return (
        schema.get("type"),
        schema.get("format"),
        schema.get("pattern"),
        tuple(schema.get("enum", ())),
        schema.get("minItems"),
        schema.get("maxItems"),
        tuple(schema.get("required", ())),
        tuple(
            (name, _schema_shape(child))
            for name, child in properties.items()
            if isinstance(child, Mapping)
        ) if isinstance(properties, Mapping) else (),
        _schema_shape(schema["items"])
        if isinstance(schema.get("items"), Mapping)
        else None,
    )


def _field_uses(
    schema: Mapping[str, Any], path: str
) -> list[tuple[str, str, Mapping[str, Any]]]:
    uses: list[tuple[str, str, Mapping[str, Any]]] = []
    if schema.get("type") == "object":
        properties = schema.get("properties", {})
        if isinstance(properties, Mapping):
            for name, child in properties.items():
                if not isinstance(child, Mapping):
                    continue
                child_path = f"{path}.{name}"
                uses.append((name, child_path, child))
                uses.extend(_field_uses(child, child_path))
    elif schema.get("type") == "array" and isinstance(schema.get("items"), Mapping):
        uses.extend(_field_uses(schema["items"], f"{path}[]"))
    return uses


def _validate_field_semantics(
    schemas: Mapping[str, Mapping[str, Any]],
) -> list[str]:
    by_name: dict[str, list[tuple[str, Mapping[str, Any]]]] = {}
    issues: list[str] = []
    for tool, schema in schemas.items():
        for name, path, field_schema in _field_uses(schema, tool):
            by_name.setdefault(name, []).append((path, field_schema))

    for name, uses in by_name.items():
        if len(uses) < 2:
            continue
        semantic_shapes = {
            (
                _schema_shape(schema),
                schema.get("description", "").strip()
                if isinstance(schema.get("description"), str)
                else "",
            )
            for _path, schema in uses
        }
        if len(semantic_shapes) == 1:
            continue
        qualified_paths = EXPLICIT_CONTEXT_QUALIFIED_REUSE.get(name)
        actual_paths = {path for path, _schema in uses}
        if qualified_paths != actual_paths:
            issues.append(
                f"field {name!r} has conflicting meanings/shapes outside its "
                f"explicit contexts: {sorted(actual_paths)}"
            )

    all_fields = set(by_name)
    aliases = all_fields & FORBIDDEN_AMBIGUOUS_INPUT_FIELDS
    if aliases:
        issues.append(f"ambiguous operator field aliases are forbidden: {sorted(aliases)}")

    quantity_fields = {name for name in all_fields if "quantity" in name}
    unknown_quantity_fields = quantity_fields - (
        SELECTED_UOM_QUANTITY_FIELDS | BASE_UOM_QUANTITY_FIELDS
    )
    if unknown_quantity_fields:
        issues.append(
            "operator quantity names must pin selected-UOM or base-UOM semantics: "
            f"{sorted(unknown_quantity_fields)}"
        )
    return issues


def _line_properties(schema: Mapping[str, Any]) -> Mapping[str, Any]:
    lines = schema.get("properties", {}).get("lines", {})
    items = lines.get("items", {}) if isinstance(lines, Mapping) else {}
    properties = items.get("properties", {}) if isinstance(items, Mapping) else {}
    return properties if isinstance(properties, Mapping) else {}


def _validate_workflow_semantics(
    runtime_prepares: Mapping[str, Any],
) -> list[str]:
    issues: list[str] = []
    source_lines = {
        "erp_sales_dispatch_prepare": "sales_order_line_id",
        "erp_goods_receipt_prepare": "purchase_order_line_id",
        "erp_supplier_invoice_prepare": "goods_receipt_line_id",
    }
    for tool, source_id in source_lines.items():
        action = runtime_prepares.get(tool)
        if action is None:
            continue
        line_properties = _line_properties(action.input_schema)
        leaked = set(line_properties) & {"product_id", "uom_conversion_id", "uom_code"}
        if leaked:
            issues.append(
                f"{tool}: source-derived line re-requests canonical facts {sorted(leaked)}"
            )
        if source_id not in line_properties:
            issues.append(f"{tool}: source-derived line lacks {source_id}")

    payment_tools = {
        "erp_customer_receipt_prepare": True,
        "erp_supplier_payment_prepare": False,
        "erp_supplier_advance_prepare": False,
    }
    for tool, allows_cash in payment_tools.items():
        action = runtime_prepares.get(tool)
        if action is None:
            continue
        schema = action.input_schema
        properties = schema.get("properties", {})
        required = set(schema.get("required", ()))
        expected = {"bank_account_id", "payment_method", "external_reference"}
        if not isinstance(properties, Mapping) or not expected <= set(properties):
            issues.append(f"{tool}: payment settlement conditional fields are incomplete")
            continue
        if "settlement_account_id" in properties:
            issues.append(f"{tool}: settlement ledger must be derived from configuration")
        if "payment_method" not in required:
            issues.append(f"{tool}: payment method is optional")
        if "bank_account_id" in required or "external_reference" in required:
            issues.append(f"{tool}: conditional payment fields must remain schema-optional")
        methods = set(properties["payment_method"].get("enum", ()))
        if ("cash" in methods) is not allows_cash:
            issues.append(f"{tool}: cash method eligibility drifted")

    sales_invoice = runtime_prepares.get("erp_sales_invoice_prepare")
    if sales_invoice is not None:
        line_properties = _line_properties(sales_invoice.input_schema)
        source = line_properties.get("fulfillment_source", {})
        if set(source.get("enum", ())) != {"direct_issue", "dispatch_allocated"}:
            issues.append("erp_sales_invoice_prepare: fulfillment_source contract drifted")
        if not {
            "batch_allocation_mode", "batch_allocations", "dispatch_allocations"
        } <= set(line_properties):
            issues.append("erp_sales_invoice_prepare: exact fulfillment inputs are incomplete")
        allocation_modes = set(
            line_properties.get("batch_allocation_mode", {}).get("enum", ())
        )
        if allocation_modes != {"auto_fefo", "explicit_fefo"}:
            issues.append("erp_sales_invoice_prepare: batch allocation policy drifted")
        line_required = set(
            sales_invoice.input_schema["properties"]["lines"]["items"].get("required", ())
        )
        if line_required & {"batch_allocations", "dispatch_allocations"}:
            issues.append(
                "erp_sales_invoice_prepare: conditional fulfillment arrays cannot both be required"
            )
    return issues


def _validate_semantic_validator_wiring() -> list[str]:
    issues: list[str] = []
    contract_source = APPLICATION_CONTRACT_PATH.read_text(encoding="utf-8")
    required_contract_fragments = (
        '"finance.customer_receipt.prepare"',
        '"finance.supplier_payment.prepare"',
        '"finance.supplier_advance.prepare"',
        'if method == "cash"',
        "elif bank_account_id is None",
        'if method != "cash" and not external_reference',
        'if operation_key == "sales.invoice.prepare"',
        'if source == "direct_issue":',
        'if mode == "explicit_fefo" and not direct:',
        'if mode == "auto_fefo" and direct:',
        'if source == "dispatch_allocated" and (',
    )
    missing = [fragment for fragment in required_contract_fragments if fragment not in contract_source]
    if missing:
        issues.append(f"application semantic validator contract is incomplete: {missing}")

    route_tree = ast.parse(ACTION_ROUTE_PATH.read_text(encoding="utf-8"))
    prepare = next(
        (
            node for node in route_tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            and node.name == "prepare_action"
        ),
        None,
    )
    call_lines: dict[str, list[int]] = {}
    if prepare is not None:
        for node in ast.walk(prepare):
            if not isinstance(node, ast.Call):
                continue
            name = (
                node.func.id if isinstance(node.func, ast.Name)
                else node.func.attr if isinstance(node.func, ast.Attribute)
                else ""
            )
            call_lines.setdefault(name, []).append(node.lineno)
    model_lines = call_lines.get("model_validate", [])
    semantic_lines = call_lines.get("validate_prepare_payload_semantics", [])
    service_lines = call_lines.get("prepare", [])
    if not (
        prepare is not None and model_lines and semantic_lines and service_lines
        and min(model_lines) < min(semantic_lines) < max(service_lines)
    ):
        issues.append(
            "prepare route must run model validation then semantic validation before service preparation"
        )
    return issues


def _validate_schema(schema: Mapping[str, Any], path: str) -> list[str]:
    issues: list[str] = []
    schema_type = schema.get("type")
    description = schema.get("description")
    if not isinstance(description, str) or not description.strip():
        issues.append(f"{path}: input schema node lacks a nonblank description")
    if schema_type == "object":
        properties = schema.get("properties")
        required = schema.get("required")
        if schema.get("additionalProperties") is not False:
            issues.append(f"{path}: object must reject additional properties")
        if not isinstance(properties, dict) or not properties:
            issues.append(f"{path}: object properties must be non-empty")
            return issues
        if not isinstance(required, list):
            issues.append(f"{path}: object required must be an array")
            required = []
        unknown = set(required) - set(properties)
        if unknown:
            issues.append(f"{path}: unknown required properties {sorted(unknown)}")
        for name, child in properties.items():
            if not isinstance(child, dict):
                issues.append(f"{path}.{name}: property schema must be an object")
                continue
            issues.extend(_validate_schema(child, f"{path}.{name}"))
    elif schema_type == "array":
        permits_unapplied_advance = path == "erp_customer_receipt_prepare.allocations"
        minimum_is_valid = schema.get("minItems", 0) >= (0 if permits_unapplied_advance else 1)
        if not minimum_is_valid or schema.get("maxItems", 0) < 1:
            issues.append(f"{path}: business arrays must be explicitly bounded and non-empty")
        items = schema.get("items")
        if not isinstance(items, dict):
            issues.append(f"{path}: array items schema is required")
        else:
            issues.extend(_validate_schema(items, f"{path}[]"))
    elif schema_type == "string":
        if not schema.get("description"):
            issues.append(f"{path}: string field lacks a semantic description")
    elif schema_type == "boolean":
        if not schema.get("description"):
            issues.append(f"{path}: boolean field lacks a semantic description")
    elif schema_type == "integer" and path.rsplit(".", 1)[-1] in {
        "expected_row_version",
        "stock_balance_row_version",
    }:
        if schema.get("minimum") != 1:
            issues.append(f"{path}: row version integer must have minimum 1")
    elif schema_type in {"number", "integer"}:
        issues.append(f"{path}: numeric JSON values are forbidden; use exact decimal strings")
    else:
        issues.append(f"{path}: unsupported or missing schema type {schema_type!r}")
    return issues


def validate(
    contract: dict[str, Any] | None = None,
    service_contract: dict[str, Any] | None = None,
    app_contract: dict[str, Any] | None = None,
    runtime: ModuleType | None = None,
) -> list[str]:
    document = contract or load_json(CONTRACT_PATH)
    service = service_contract or load_json(SERVICE_CONTRACT_PATH)
    application = app_contract or load_json(APP_CONTRACT_PATH)
    module = runtime or load_runtime()
    issues: list[str] = []

    if document.get("schema_version") != "1.0.0":
        issues.append("operator action schema_version must be 1.0.0")
    publication = document.get("publication", {})
    if publication.get("operator_actions_exported") is not True:
        issues.append("bounded operator actions must be exported")
    if publication.get("writes_exported") is not True:
        issues.append("bounded operator writes must be exported")
    if publication.get("fail_closed") is not True:
        issues.append("operator action publication must fail closed")
    gates = publication.get("release_gates", {})
    if set(gates) != EXPECTED_RELEASE_GATES:
        issues.append("operator action release gate set drifted")
    for gate, value in gates.items():
        if value is not True:
            issues.append(f"published operator release gate is not verified: {gate}")

    prepares = document.get("prepare_actions", [])
    shared = document.get("shared_actions", [])
    resolution = document.get("resolution_reads", [])
    if not isinstance(prepares, list) or not isinstance(shared, list) or not isinstance(resolution, list):
        return issues + ["resolution_reads, prepare_actions and shared_actions must be arrays"]
    prepare_names = [item.get("tool", "") for item in prepares if isinstance(item, dict)]
    shared_names = [item.get("tool", "") for item in shared if isinstance(item, dict)]
    resolution_names = [item.get("tool", "") for item in resolution if isinstance(item, dict)]
    if set(prepare_names) != EXPECTED_PREPARE_TOOLS:
        issues.append("business-specific prepare tool set is incomplete or has drifted")
    if set(shared_names) != EXPECTED_SHARED_TOOLS:
        issues.append("shared approve/execute/status tool set has drifted")
    if set(resolution_names) != EXPECTED_RESOLUTION_TOOLS:
        issues.append("operator resolution read set is incomplete or has drifted")
    operation_to_tool = {
        item.get("operation_key"): item.get("tool")
        for item in prepares
        if isinstance(item, dict)
    }
    published_prepare_tools = {
        operation_to_tool.get(operation)
        for operation in publication.get("published_prepare_operations", [])
    }
    unavailable_prepare_tools = {
        operation_to_tool.get(operation)
        for operation in publication.get("unavailable_prepare_operations", [])
    }
    if published_prepare_tools != (
        EXPECTED_PREPARE_TOOLS - EXPECTED_UNAVAILABLE_PREPARE_TOOLS
    ):
        issues.append("published prepare tool scope drifted")
    if unavailable_prepare_tools != EXPECTED_UNAVAILABLE_PREPARE_TOOLS:
        issues.append("unavailable prepare tool scope drifted")
    duplicates = _duplicates((*prepare_names, *shared_names, *resolution_names))
    if duplicates:
        issues.append(f"duplicate planned operator tools: {sorted(duplicates)}")

    runtime_prepares = getattr(module, "PREPARE_ACTIONS", {})
    runtime_shared = getattr(module, "SHARED_ACTION_SCHEMAS", {})
    if set(runtime_prepares) != set(prepare_names):
        issues.append("runtime prepare schemas drifted from architecture contract")
    if set(runtime_shared) != set(shared_names):
        issues.append("runtime shared schemas drifted from architecture contract")
    if getattr(module, "OPERATOR_ACTIONS_EXPORTED", None) is not True:
        issues.append("runtime bounded operator action export flag must be true")
    if dict(getattr(module, "RELEASE_GATES", {})) != gates:
        issues.append("runtime release gates drifted from architecture contract")

    architecture_by_tool = {
        item["tool"]: item for item in prepares if isinstance(item, dict) and item.get("tool")
    }
    for tool, action in runtime_prepares.items():
        declared = architecture_by_tool.get(tool, {})
        if declared.get("approval_policy") != EXPECTED_APPROVAL_POLICIES.get(tool):
            issues.append(f"{tool}: approval policy drifted")
        for field in ("operation_key", "permission", "risk", "schema_profile"):
            runtime_field = "risk_class" if field == "risk" else field
            if getattr(action, runtime_field, None) != declared.get(field):
                issues.append(f"{tool}: runtime {field} drifted from architecture contract")
        if action.approval_policy != declared.get("approval_policy"):
            issues.append(f"{tool}: runtime approval policy drifted from architecture contract")
        schema = action.input_schema
        issues.extend(_validate_schema(schema, tool))
        fields = _property_names(schema)
        forbidden = fields & FORBIDDEN_BUSINESS_INPUT_FIELDS
        if forbidden:
            issues.append(f"{tool}: caller-controlled tax fields are forbidden: {sorted(forbidden)}")
        ambiguous = fields & FORBIDDEN_AMBIGUOUS_INPUT_FIELDS
        if ambiguous:
            issues.append(
                f"{tool}: ambiguous transport aliases are forbidden: {sorted(ambiguous)}"
            )
        if tool in BATCHED_TOOLS and not ({"batch_allocations", "batch_allocation", "batch_counts", "batches"} & fields):
            issues.append(f"{tool}: physical stock movement lacks explicit batch input")

    for tool, schema in runtime_shared.items():
        issues.extend(_validate_schema(schema, tool))
        declared = next((item for item in shared if item.get("tool") == tool), {})
        properties = set(schema.get("properties", {}))
        if properties != set(declared.get("allowed_fields", [])):
            issues.append(f"{tool}: allowed field contract drift")
    all_input_schemas = {
        **{tool: action.input_schema for tool, action in runtime_prepares.items()},
        **dict(runtime_shared),
    }
    issues.extend(_validate_field_semantics(all_input_schemas))
    issues.extend(_validate_workflow_semantics(runtime_prepares))
    issues.extend(_validate_semantic_validator_wiring())
    execute_schema = runtime_shared.get("erp_operation_execute", {})
    execute_fields = set(execute_schema.get("properties", {}))
    if execute_fields != EXECUTE_FIELDS or set(execute_schema.get("required", [])) != EXECUTE_FIELDS:
        issues.append("execute must accept exactly command_request_id, preview_hash, idempotency_key")
    if _property_names(execute_schema) & set(
        document.get("transport_boundary", {}).get("execute_forbidden_fields", [])
    ):
        issues.append("execute schema contains business payload fields")

    planned = set(prepare_names) | set(shared_names)
    planned_resolution = set(resolution_names)
    live_tools = set(service.get("tools", []))
    operator_service = service.get("operator_actions", {})
    expected_published_actions = (
        published_prepare_tools | EXPECTED_SHARED_TOOLS | EXPECTED_INVOICE_DRAFT_TOOLS
    )
    expected_live_tools = (
        EXPECTED_BASE_READ_TOOLS
        | EXPECTED_MASTER_WRITE_TOOLS
        | EXPECTED_RESOLUTION_TOOLS
        | expected_published_actions
    )
    if service.get("writes_exported") is not True:
        issues.append("MCP service contract does not export bounded writes")
    if operator_service.get("exported") is not True:
        issues.append("MCP service contract does not export bounded operator actions")
    if set(operator_service.get("published_tools", [])) != expected_published_actions:
        issues.append("MCP service published tool list drifted")
    if set(operator_service.get("direct_master_writes", [])) != EXPECTED_MASTER_WRITE_TOOLS:
        issues.append("MCP service direct master write list drifted")
    if set(operator_service.get("unavailable_tools", [])) != EXPECTED_UNAVAILABLE_PREPARE_TOOLS:
        issues.append("MCP service unavailable tool list drifted")
    if set(operator_service.get("published_resolution_tools", [])) != planned_resolution:
        issues.append("MCP service published resolution tool list drifted")
    if operator_service.get("release_gates") != gates:
        issues.append("MCP service operator release gates drifted")
    if live_tools != expected_live_tools:
        issues.append("live MCP tool registry drifted from the bounded publication set")

    app_operations = application.get("mcp_operations", [])
    if not isinstance(app_operations, list):
        issues.append("app-data mcp_operations must be an array")
        app_operations = []
    app_by_tool = {
        item.get("tool"): item
        for item in app_operations
        if isinstance(item, dict) and item.get("tool")
    }
    expected_app_tools = live_tools | planned | planned_resolution
    if set(app_by_tool) != expected_app_tools:
        issues.append("app-data MCP operation set drifted from live and planned operator tools")
    architecture_resources = {
        item["tool"]: item["resource"]
        for item in (*prepares, *shared)
        if isinstance(item, dict) and item.get("tool") and item.get("resource")
    }
    architecture_resources.update(
        {
            item["tool"]: item["resource"]
            for item in resolution
            if isinstance(item, dict) and item.get("tool") and item.get("resource")
        }
    )
    for tool in planned | planned_resolution:
        app_operation = app_by_tool.get(tool, {})
        if app_operation.get("resource") != architecture_resources.get(tool):
            issues.append(f"{tool}: app-data workflow owner drifted from operator contract")
    for tool in EXPECTED_BASE_READ_TOOLS | EXPECTED_RESOLUTION_TOOLS | {"erp_operation_status_get"}:
        app_operation = app_by_tool.get(tool, {})
        if (
            app_operation.get("mode") != "read"
            or app_operation.get("risk") != "read_only"
            or app_operation.get("approval") != "none"
            or app_operation.get("idempotency") != "not_applicable"
        ):
            issues.append(f"{tool}: reviewed live read metadata drifted")
    for tool in EXPECTED_INVOICE_DRAFT_TOOLS:
        app_operation = app_by_tool.get(tool, {})
        is_read = tool in EXPECTED_INVOICE_DRAFT_READ_TOOLS
        if (
            app_operation.get("mode") != ("read" if is_read else "write")
            or app_operation.get("risk") != ("read_only" if is_read else "reversible_write")
            or app_operation.get("approval") != ("none" if is_read else "actor_confirmation")
            or app_operation.get("idempotency") != (
                "not_applicable" if is_read else "required"
            )
        ):
            issues.append(f"{tool}: shared invoice-draft metadata drifted")
    for tool in EXPECTED_RESOLUTION_TOOLS:
        app_operation = app_by_tool.get(tool, {})
        if (
            app_operation.get("mode") != "read"
            or app_operation.get("risk") != "read_only"
            or app_operation.get("approval") != "none"
            or app_operation.get("idempotency") != "not_applicable"
        ):
            issues.append(f"{tool}: planned resolution read metadata drifted")
    for tool in EXPECTED_PREPARE_TOOLS:
        app_operation = app_by_tool.get(tool, {})
        expected_approval = (
            "separate_approver"
            if tool in {
                "erp_adjustment_note_prepare",
                "erp_bank_reconciliation_prepare",
                "erp_customer_cheque_clearance_prepare",
                "erp_customer_cheque_bounce_prepare",
                "erp_sales_return_reversal_prepare",
                "erp_purchase_return_reversal_prepare",
                "erp_adjustment_note_reversal_prepare",
            }
            else "actor_confirmation"
        )
        expected_risk = (
            "consequential_write"
            if tool in {
                "erp_adjustment_note_prepare",
                "erp_bank_reconciliation_prepare",
                "erp_customer_cheque_clearance_prepare",
                "erp_customer_cheque_bounce_prepare",
                "erp_sales_return_reversal_prepare",
                "erp_purchase_return_reversal_prepare",
                "erp_adjustment_note_reversal_prepare",
            }
            else "reversible_write"
        )
        if (
            app_operation.get("mode") != "write"
            or app_operation.get("risk") != expected_risk
            or app_operation.get("approval") != expected_approval
            or app_operation.get("idempotency") != "required"
        ):
            issues.append(f"{tool}: prepare metadata drifted from non-posting preview semantics")

    for tool in EXPECTED_MASTER_WRITE_TOOLS:
        app_operation = app_by_tool.get(tool, {})
        expected_risk = (
            "consequential_write"
            if tool in {"erp_product_activate", "erp_drug_license_record"}
            else "reversible_write"
        )
        if (
            app_operation.get("mode") != "write"
            or app_operation.get("risk") != expected_risk
            or app_operation.get("approval") != "actor_confirmation"
            or app_operation.get("idempotency") != "required"
        ):
            issues.append(f"{tool}: canonical master write metadata drifted")

    execute_operation = app_by_tool.get("erp_operation_execute", {})
    if execute_operation.get("approval") != "command_policy":
        issues.append("erp_operation_execute: approval must be resolved from the immutable command policy")

    return issues


def main() -> int:
    issues = validate()
    if issues:
        print("MCP operator action contract: BLOCKED")
        for issue in issues:
            print(f"- {issue}")
        return 1
    print(
        "MCP operator action contract: OK "
        f"({len(EXPECTED_RESOLUTION_TOOLS)} resolution reads, "
        f"{len(EXPECTED_PREPARE_TOOLS) - len(EXPECTED_UNAVAILABLE_PREPARE_TOOLS)} "
        f"published prepares, {len(EXPECTED_UNAVAILABLE_PREPARE_TOOLS)} "
        f"unavailable prepare tools, {len(EXPECTED_SHARED_TOOLS)} shared tools)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

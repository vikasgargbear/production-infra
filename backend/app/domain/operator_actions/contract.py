"""Typed application contract for reviewed operator actions.

The MCP runtime owns and publishes the reviewed machine-readable input schemas.
Compiling those schemas into strict Pydantic models here keeps UI and MCP
transports on one validation contract without coupling either transport to a
legacy service or database table.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Annotated, Literal, Mapping, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StringConstraints, create_model

from mcp_runtime.aasopharma_mcp.operator_actions import (
    PREPARE_ACTIONS,
    PUBLISHED_PREPARE_TOOL_NAMES,
)


# UUID/date values arrive as JSON strings and must be parsed. Decimal-bearing
# fields remain strict strings through StringConstraints below.
STRICT_MODEL_CONFIG = ConfigDict(extra="forbid")


@dataclass(frozen=True)
class ActionPolicy:
    operation_key: str
    permission: str
    risk_class: str
    schema_profile: str
    approval_policy: str
    branch_fields: tuple[str, ...]


def _enum_type(values: list[str]):
    return Literal.__getitem__(tuple(values))


def _schema_type(schema: Mapping[str, Any], model_name: str):
    schema_type = schema.get("type")
    if schema_type == "boolean":
        return StrictBool

    if schema_type == "string":
        enum_values = schema.get("enum")
        if enum_values:
            return _enum_type(list(enum_values))
        if schema.get("format") == "uuid":
            return UUID
        if schema.get("format") == "date":
            return date
        if schema.get("format") == "date-time":
            return datetime
        constraints: dict[str, Any] = {"max_length": 1024, "strict": True}
        if pattern := schema.get("pattern"):
            constraints["pattern"] = pattern
        return Annotated[str, StringConstraints(**constraints)]

    if schema_type == "array":
        item_type = _schema_type(schema["items"], f"{model_name}Item")
        return Annotated[
            list[item_type],
            Field(
                min_length=int(schema.get("minItems", 0)),
                max_length=int(schema.get("maxItems", 500)),
            ),
        ]

    if schema_type == "object":
        required = set(schema.get("required", ()))
        fields: dict[str, tuple[Any, Any]] = {}
        for field_name, field_schema in schema.get("properties", {}).items():
            field_type = _schema_type(
                field_schema,
                f"{model_name}{''.join(part.title() for part in field_name.split('_'))}",
            )
            if field_name in required:
                fields[field_name] = (field_type, ...)
            else:
                fields[field_name] = (Optional[field_type], None)
        return create_model(
            model_name,
            __config__=STRICT_MODEL_CONFIG,
            **fields,
        )

    raise ValueError(f"Unsupported operator-action JSON schema type: {schema_type!r}")


PREPARE_PAYLOAD_MODELS: dict[str, type[BaseModel]] = {}
ACTION_POLICIES: dict[str, ActionPolicy] = {}

for action in PREPARE_ACTIONS.values():
    operation_key = action.operation_key
    model_name = "".join(part.title() for part in operation_key.split(".")) + "Payload"
    payload_model = _schema_type(action.input_schema, model_name)
    if not isinstance(payload_model, type) or not issubclass(payload_model, BaseModel):
        raise RuntimeError(f"Prepare action {operation_key} did not compile to an object model")
    PREPARE_PAYLOAD_MODELS[operation_key] = payload_model
    branch_fields = (
        ("source_branch_id", "destination_branch_id")
        if operation_key == "inventory.transfer.prepare"
        else ("branch_id",)
    )
    ACTION_POLICIES[operation_key] = ActionPolicy(
        operation_key=operation_key,
        permission=action.permission,
        risk_class=action.risk_class,
        schema_profile=action.schema_profile,
        approval_policy=action.approval_policy,
        branch_fields=branch_fields,
    )


_SHARED_POLICIES = (
    ActionPolicy(
        operation_key="automation.command.approve",
        permission="automation.command.approve",
        risk_class="consequential_write",
        schema_profile="immutable_command_approval",
        approval_policy="explicit_human",
        branch_fields=(),
    ),
    ActionPolicy(
        operation_key="automation.command.execute",
        permission="automation.command.execute",
        risk_class="consequential_write",
        schema_profile="approved_command_execution",
        approval_policy="command_policy",
        branch_fields=(),
    ),
    ActionPolicy(
        operation_key="automation.command.status.get",
        permission="automation.command.view",
        risk_class="read_only",
        schema_profile="command_status",
        approval_policy="none",
        branch_fields=(),
    ),
)
ACTION_POLICIES.update((policy.operation_key, policy) for policy in _SHARED_POLICIES)
PUBLISHED_OPERATOR_OPERATION_KEYS = frozenset(
    PREPARE_ACTIONS[tool_name].operation_key
    for tool_name in PUBLISHED_PREPARE_TOOL_NAMES
) | frozenset(policy.operation_key for policy in _SHARED_POLICIES)


OperatorCommandType = Enum(
    "OperatorCommandType",
    {key.upper().replace(".", "_"): key for key in PREPARE_PAYLOAD_MODELS},
    type=str,
)


def policy_for(operation_key: str) -> Optional[ActionPolicy]:
    return ACTION_POLICIES.get(operation_key)


def validate_prepare_payload_semantics(
    operation_key: str, payload: BaseModel
) -> None:
    """Enforce conditional action rules that JSON Schema field shapes cannot express."""

    values = payload.model_dump(mode="python")
    if operation_key == "finance.bank_reconciliation.prepare":
        amount = Decimal(values["matched_amount"])
        if amount <= 0 or amount != amount.quantize(Decimal("0.01")):
            raise ValueError(
                "bank reconciliation requires a positive amount with exactly supported paise precision"
            )
    if operation_key == "inventory.transfer.prepare":
        if values["source_branch_id"] == values["destination_branch_id"]:
            raise ValueError("source and destination branches must be distinct")
        if values["source_location_id"] == values["destination_location_id"]:
            raise ValueError("source and destination locations must be distinct")
        seen_batches: set[UUID] = set()
        for line in values["lines"]:
            for allocation in line["batch_allocations"]:
                quantity = Decimal(allocation["entered_quantity"])
                if quantity <= 0 or quantity != quantity.quantize(Decimal("0.000001")):
                    raise ValueError(
                        "transfer quantities must be positive with at most six decimals"
                    )
                batch_id = allocation["batch_id"]
                if batch_id in seen_batches:
                    raise ValueError("each batch may appear only once in a transfer")
                seen_batches.add(batch_id)
    if operation_key == "inventory.destruction.prepare":
        if not values.get("authority_reference"):
            raise ValueError("destruction requires authority_reference")
        if not values.get("witness_credential"):
            raise ValueError("destruction requires witness_credential")
        seen_batches: set[UUID] = set()
        for line in values["lines"]:
            for allocation in line["batch_allocations"]:
                quantity = Decimal(allocation["entered_quantity"])
                if quantity <= 0 or quantity != quantity.quantize(Decimal("0.000001")):
                    raise ValueError(
                        "destruction quantities must be positive with at most six decimals"
                    )
                batch_id = allocation["batch_id"]
                if batch_id in seen_batches:
                    raise ValueError("each batch may appear only once in a destruction")
                seen_batches.add(batch_id)
    if operation_key in {
        "finance.customer_receipt.prepare",
        "finance.supplier_payment.prepare",
        "finance.supplier_advance.prepare",
    }:
        method = values["payment_method"]
        bank_account_id = values.get("bank_account_id")
        external_reference = values.get("external_reference")
        if method == "cash":
            if bank_account_id is not None:
                raise ValueError("cash payment must not include bank_account_id")
        elif bank_account_id is None:
            raise ValueError("non-cash payment requires bank_account_id")
        if method != "cash" and not external_reference:
            raise ValueError("non-cash payment requires external_reference")

    if operation_key == "finance.customer_receipt.prepare":
        if values["payment_method"] not in {"bank_transfer", "card", "upi"}:
            raise ValueError(
                "customer receipt supports only bank_transfer, card, or upi"
            )
        allocations = values["allocations"]
        open_item_ids = [item["open_item_id"] for item in allocations]
        if len(set(open_item_ids)) != len(open_item_ids):
            raise ValueError("customer receipt allocations require unique open_item_id")
        if any(Decimal(str(item["amount"])) <= 0 for item in allocations):
            raise ValueError("customer receipt allocations must be positive")
        if sum(Decimal(str(item["amount"])) for item in allocations) != Decimal(
            str(values["amount"])
        ):
            raise ValueError("customer receipt allocations must exactly equal amount")

    if operation_key == "finance.supplier_advance.prepare":
        if values["payment_method"] not in {"bank_transfer", "upi"}:
            raise ValueError("supplier advance supports only bank_transfer or upi")
        allocations = values["allocations"]
        if len(allocations) != 1:
            raise ValueError(
                "supplier advance pilot requires exactly one purchase order line allocation"
            )
        allocation_amount = Decimal(str(allocations[0]["gross_amount"]))
        if allocation_amount <= 0:
            raise ValueError("supplier advance allocation must be positive")
        if allocation_amount != Decimal(str(values["gross_amount"])):
            raise ValueError(
                "supplier advance allocation must exactly equal gross_amount"
            )

    if operation_key == "finance.supplier_payment.prepare":
        if values["payment_method"] not in {"bank_transfer", "upi"}:
            raise ValueError("supplier payment supports only bank_transfer or upi")
        allocations = values["allocations"]
        open_item_ids = [item["open_item_id"] for item in allocations]
        if len(set(open_item_ids)) != len(open_item_ids):
            raise ValueError("supplier payment allocations require unique open_item_id")
        if any(Decimal(str(item["amount"])) <= 0 for item in allocations):
            raise ValueError("supplier payment allocations must be positive")
        if sum(Decimal(str(item["amount"])) for item in allocations) != Decimal(
            str(values["gross_amount"])
        ):
            raise ValueError(
                "supplier payment allocations must exactly equal gross_amount"
            )

    if operation_key == "finance.adjustment_note.prepare":
        side = values["side"]
        direction = values["direction"]
        if (side, direction) not in {("sales", "credit"), ("purchase", "debit")}:
            raise ValueError(
                "standalone pilot supports only customer credit notes and supplier debit notes"
            )
        allowed_reasons = (
            {"customer_rejection", "damage", "expiry", "quality", "recall", "wrong_supply"}
            if side == "sales"
            else {"wrong_supply", "excess_supply"}
        )
        if values["reason_code"] not in allowed_reasons:
            raise ValueError("adjustment-note reason_code is not reviewed for the selected side")
        treatment = values["gst_tax_treatment"]
        sales_evidence = values.get("recipient_itc_reversal_evidence_attachment_id")
        sales_confirmed = values.get("recipient_itc_reversal_confirmed_at")
        purchase_evidence = values.get("counterparty_portal_document_line_id")
        if treatment == "statutory" and side == "sales":
            if sales_evidence is None or sales_confirmed is None or purchase_evidence is not None:
                raise ValueError(
                    "statutory customer credit note requires only recipient ITC-reversal evidence"
                )
        elif treatment == "statutory":
            if purchase_evidence is None or sales_evidence is not None or sales_confirmed is not None:
                raise ValueError(
                    "statutory supplier debit note requires only parsed GSTR-2B credit-note evidence"
                )
        elif any(value is not None for value in (sales_evidence, sales_confirmed, purchase_evidence)):
            raise ValueError("commercial-only adjustment note forbids statutory evidence")
        original_line_ids = [line["original_line_id"] for line in values["lines"]]
        if len(set(original_line_ids)) != len(original_line_ids):
            raise ValueError("adjustment note requires unique original_line_id values")
        for index, line in enumerate(values["lines"]):
            billed = Decimal(str(line["billed_quantity"]))
            free = Decimal(str(line["free_quantity"]))
            if billed < 0 or free < 0:
                raise ValueError(f"lines[{index}] quantities must be nonnegative")
            if billed + free <= 0:
                raise ValueError(f"lines[{index}] requires a positive adjusted quantity")

    if operation_key == "finance.expense_claim.prepare":
        if values["period_end"] < values["period_start"]:
            raise ValueError("expense claim period_end must not precede period_start")
        if values["claim_date"] < values["period_end"]:
            raise ValueError("expense claim claim_date must not precede period_end")
        receipt_ids: set[UUID] = set()
        for index, line in enumerate(values["lines"]):
            if not values["period_start"] <= line["expense_date"] <= values["period_end"]:
                raise ValueError(
                    f"lines[{index}] expense_date must fall inside the claim period"
                )
            amount = Decimal(str(line["claimed_amount"]))
            if amount <= 0 or amount != amount.quantize(Decimal("0.01")):
                raise ValueError(
                    f"lines[{index}] claimed_amount must be positive INR at two-decimal precision"
                )
            receipt_id = line["receipt_attachment_id"]
            if receipt_id in receipt_ids:
                raise ValueError("each expense receipt may appear only once in a claim")
            receipt_ids.add(receipt_id)

    if operation_key == "sales.invoice.prepare":
        if values["zero_rated_payment_mode"] == "without_payment":
            raise ValueError(
                "sales invoice SEZ without_payment is unavailable until "
                "effective LUT or bond evidence is reviewed"
            )
        uses_direct_issue = False
        for index, line in enumerate(values["lines"]):
            direct = line.get("batch_allocations")
            dispatched = line.get("dispatch_allocations")
            source = line["fulfillment_source"]
            if source == "direct_issue":
                uses_direct_issue = True
                mode = line.get("batch_allocation_mode") or (
                    "explicit_fefo" if direct else "auto_fefo"
                )
                if dispatched:
                    raise ValueError(
                        f"lines[{index}] direct_issue forbids dispatch_allocations"
                    )
                if mode == "explicit_fefo" and not direct:
                    raise ValueError(
                        f"lines[{index}] explicit_fefo requires batch_allocations"
                    )
                if mode == "auto_fefo" and direct:
                    raise ValueError(
                        f"lines[{index}] auto_fefo forbids caller batch_allocations"
                    )
            if source == "dispatch_allocated" and (
                not dispatched or direct or line.get("batch_allocation_mode") is not None
            ):
                raise ValueError(
                    f"lines[{index}] dispatch_allocated requires only dispatch_allocations"
                )
        logistics = values.get("logistics")
        from_location_id = values.get("from_location_id")
        if uses_direct_issue and (from_location_id is None or logistics is None):
            raise ValueError("direct_issue invoice requires from_location_id and logistics")
        if not uses_direct_issue and (
            from_location_id is not None or logistics is not None
        ):
            raise ValueError(
                "dispatch_allocated invoice must not include from_location_id or logistics"
            )

    if operation_key == "sales.return.prepare":
        treatment = values["gst_tax_treatment"]
        evidence_id = values.get("recipient_itc_reversal_evidence_attachment_id")
        confirmed_at = values.get("recipient_itc_reversal_confirmed_at")
        if treatment == "statutory":
            if evidence_id is None or confirmed_at is None:
                raise ValueError(
                    "statutory sales return requires recipient ITC-reversal evidence and confirmation time"
                )
        elif evidence_id is not None or confirmed_at is not None:
            raise ValueError(
                "commercial_only sales return must not include recipient ITC-reversal evidence"
            )
        seen_invoice_lines = set()
        for index, line in enumerate(values["lines"]):
            invoice_line_id = line["original_invoice_line_id"]
            if invoice_line_id in seen_invoice_lines:
                raise ValueError(
                    f"lines[{index}] repeats original_invoice_line_id; split multi-batch returns"
                )
            seen_invoice_lines.add(invoice_line_id)
            allocation = line["batch_allocation"]
            if (
                Decimal(allocation["billed_quantity"])
                != Decimal(line["billed_quantity"])
                or Decimal(allocation["free_quantity"])
                != Decimal(line["free_quantity"])
            ):
                raise ValueError(
                    f"lines[{index}] batch allocation must equal returned billed/free quantities"
                )

    if operation_key == "procurement.purchase_return.prepare":
        source_kind = values["return_source_kind"]
        treatment = values["gst_tax_treatment"]
        supplier_invoice_id = values.get("original_supplier_invoice_id")
        portal_line_id = values.get("supplier_credit_note_portal_line_id")
        if source_kind == "invoiced":
            if supplier_invoice_id is None:
                raise ValueError(
                    "invoiced purchase return requires original_supplier_invoice_id"
                )
            if any(
                line.get("supplier_invoice_receipt_allocation_id") is None
                for line in values["lines"]
            ):
                raise ValueError(
                    "invoiced purchase return requires one supplier invoice receipt allocation per line"
                )
            if treatment == "statutory" and portal_line_id is None:
                raise ValueError(
                    "statutory invoiced purchase return requires supplier GSTR-2B credit-note evidence"
                )
            if treatment == "commercial_only" and portal_line_id is not None:
                raise ValueError(
                    "commercial_only purchase return must not include supplier credit-note portal evidence"
                )
        else:
            raise ValueError(
                "uninvoiced purchase return is unavailable until invoice-allocation concurrency is guarded"
            )
        seen_receipt_lines = set()
        for index, line in enumerate(values["lines"]):
            receipt_line_id = line["goods_receipt_line_id"]
            if receipt_line_id in seen_receipt_lines:
                raise ValueError(
                    f"lines[{index}] repeats goods_receipt_line_id; split multi-batch returns"
                )
            seen_receipt_lines.add(receipt_line_id)
            allocation = line["batch_allocation"]
            if (
                Decimal(allocation["billed_quantity"])
                != Decimal(line["billed_quantity"])
                or Decimal(allocation["free_quantity"])
                != Decimal(line["free_quantity"])
            ):
                raise ValueError(
                    f"lines[{index}] batch allocation must equal returned billed/free quantities"
                )

    if operation_key == "procurement.purchase_order.prepare":
        if values["zero_rated_payment_mode"] != "not_applicable":
            raise ValueError(
                "purchase order SEZ zero-rated modes are unavailable in the domestic pilot"
            )
        if values["expected_on"] < values["order_date"]:
            raise ValueError("purchase order expected_on must not precede order_date")

    if operation_key == "procurement.goods_receipt.prepare":
        if values["received_at"].utcoffset() is None:
            raise ValueError(
                "goods receipt received_at must include an explicit timezone offset"
            )
        receipt_date = values["received_at"].date()
        challan_number = values.get("supplier_challan_number")
        challan_date = values.get("supplier_challan_date")
        if (challan_number is None) != (challan_date is None):
            raise ValueError(
                "goods receipt supplier challan number and date must be supplied together"
            )
        if challan_date is not None and challan_date > receipt_date:
            raise ValueError(
                "goods receipt supplier_challan_date must not follow received_at"
            )
        for line_index, line in enumerate(values["lines"]):
            for batch_index, batch in enumerate(line["batches"]):
                received = batch["received_quantity"]
                accepted = batch["accepted_quantity"]
                rejected = batch["rejected_quantity"]
                free = batch["free_quantity"]
                prefix = f"lines[{line_index}].batches[{batch_index}]"
                # Values remain canonical decimal strings until the reviewed
                # database authority derives fixed-precision quantities.
                received_value = Decimal(received)
                accepted_value = Decimal(accepted)
                rejected_value = Decimal(rejected)
                free_value = Decimal(free)
                if received_value <= 0:
                    raise ValueError(f"{prefix} received_quantity must be positive")
                if accepted_value + rejected_value != received_value:
                    raise ValueError(
                        f"{prefix} accepted_quantity plus rejected_quantity must equal received_quantity"
                    )
                if accepted_value + free_value <= 0:
                    raise ValueError(
                        f"{prefix} fully rejected receipt is unavailable in the pilot"
                    )
                qc_status = batch["qc_status"]
                if qc_status == "accepted" and rejected_value != 0:
                    raise ValueError(
                        f"{prefix} accepted QC status requires rejected_quantity 0"
                    )
                if qc_status == "partial" and (
                    accepted_value <= 0
                    or rejected_value <= 0
                    or not batch.get("qc_notes")
                ):
                    raise ValueError(
                        f"{prefix} partial QC requires accepted and rejected quantities plus qc_notes"
                    )
                manufactured_on = batch.get("manufactured_on")
                if manufactured_on is not None and manufactured_on > receipt_date:
                    raise ValueError(
                        f"{prefix} manufactured_on must not follow received_at"
                    )
                if batch["expires_on"] <= receipt_date:
                    raise ValueError(
                        f"{prefix} expires_on must be after received_at"
                    )

    if operation_key == "inventory.adjustment.prepare":
        seen_batch_ids = set()
        for line_index, line in enumerate(values["lines"]):
            for batch_index, batch in enumerate(line["batch_counts"]):
                prefix = f"lines[{line_index}].batch_counts[{batch_index}]"
                if Decimal(batch["counted_quantity"]) < 0:
                    raise ValueError(f"{prefix} counted_quantity must be nonnegative")
                if batch["batch_id"] in seen_batch_ids:
                    raise ValueError(
                        f"{prefix} repeats batch_id; each batch may be counted only once"
                    )
                seen_batch_ids.add(batch["batch_id"])

    if operation_key == "procurement.supplier_invoice.prepare":
        invoice_date = values["invoice_date"]
        if values["received_date"] < invoice_date:
            raise ValueError(
                "supplier invoice received_date must not precede invoice_date"
            )
        if values["zero_rated_payment_mode"] != "not_applicable":
            raise ValueError(
                "supplier invoice SEZ zero-rated modes are unavailable in the domestic pilot"
            )
        receipt_ids = values["goods_receipt_ids"]
        if len(set(receipt_ids)) != len(receipt_ids):
            raise ValueError("goods_receipt_ids must be a unique exact GRN set")
        seen_receipt_lines = set()
        for line_index, line in enumerate(values["lines"]):
            receipt_line_id = line["goods_receipt_line_id"]
            if receipt_line_id in seen_receipt_lines:
                raise ValueError(
                    "one goods_receipt_line_id may appear only once in a supplier invoice"
                )
            seen_receipt_lines.add(receipt_line_id)
            allocated_billed = Decimal(line["allocated_base_billed_quantity"])
            allocated_free = Decimal(line["allocated_base_free_quantity"])
            if allocated_billed < 0 or allocated_free < 0 or (
                allocated_billed + allocated_free <= 0
            ):
                raise ValueError(
                    f"lines[{line_index}] requires a positive billed or free base quantity"
                )
            if line["landed_cost_allocation_method"] not in {
                "direct", "quantity_weighted", "value_weighted"
            }:
                raise ValueError(
                    f"lines[{line_index}] requires an explicit reviewed landed-cost allocation method"
                )
        for line_index, line in enumerate(values.get("expense_charge_lines") or ()):
            treatment = line["charge_inventory_cost_treatment"]
            method = line.get("landed_cost_allocation_method")
            if treatment == "capitalize" and method not in {
                "direct", "quantity_weighted", "value_weighted"
            }:
                raise ValueError(
                    f"expense_charge_lines[{line_index}] capitalized charge requires an explicit reviewed allocation method"
                )
            if treatment == "expense" and method is not None:
                raise ValueError(
                    f"expense_charge_lines[{line_index}] expensed charge must not carry a landed-cost allocation method"
                )

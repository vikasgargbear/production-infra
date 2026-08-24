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
            if source == "direct_issue" and (not direct or dispatched):
                raise ValueError(
                    f"lines[{index}] direct_issue requires only batch_allocations"
                )
            if source == "direct_issue":
                uses_direct_issue = True
            if source == "dispatch_allocated" and (not dispatched or direct):
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
                if Decimal(batch["counted_quantity"]) <= 0:
                    raise ValueError(f"{prefix} counted_quantity must be positive")
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

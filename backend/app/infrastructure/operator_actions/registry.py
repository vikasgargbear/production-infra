"""Reviewed database-command coverage for canonical operator actions.

An existing posting function is not a prepare adapter. The operator contract
starts from business input and must create an immutable preview plus every
typed draft needed by the posting command. Until both sides exist, the action
stays unavailable even when a narrower function can post an existing row.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from ...domain.operator_actions.contract import ACTION_POLICIES


@dataclass(frozen=True)
class ActionAdapterBinding:
    operation_key: str
    available: bool
    prepare_function: Optional[str]
    execute_function: Optional[str]
    unavailable_reason: Optional[str]


def _missing_action_resolver(
    operation_key: str,
    execute_function: Optional[str],
) -> ActionAdapterBinding:
    return ActionAdapterBinding(
        operation_key=operation_key,
        available=False,
        prepare_function="erp_automation_commands.prepare_operator_command",
        execute_function=execute_function,
        unavailable_reason=(
            "The shared reviewed durable prepare function exists, but no complete "
            "action-specific resolver yet creates and validates every typed draft, "
            "source version, calculation artifact, and impact for this workflow"
        ),
    )


# Candidate posting functions are recorded only to make the missing half of
# each workflow auditable. They are never called by an unavailable binding.
_PREPARE_BINDINGS = {
    "sales.order.prepare": ActionAdapterBinding(
        operation_key="sales.order.prepare",
        available=True,
        prepare_function="erp_automation_commands.persist_sales_order_prepare",
        execute_function="erp_trade_commands_v2.approve_sales_order",
        unavailable_reason=None,
    ),
    "sales.dispatch.prepare": ActionAdapterBinding(
        operation_key="sales.dispatch.prepare",
        available=True,
        prepare_function="erp_automation_commands.persist_sales_dispatch_prepare",
        execute_function=(
            "erp_trade_commands.post_dispatch + "
            "erp_commercial_commands.post_dispatch_inventory_valuation"
        ),
        unavailable_reason=None,
    ),
    "sales.invoice.prepare": ActionAdapterBinding(
        operation_key="sales.invoice.prepare",
        available=True,
        prepare_function="erp_automation_commands.persist_sales_invoice_prepare",
        execute_function="erp_commercial_commands.post_sales_invoice",
        unavailable_reason=None,
    ),
    "sales.return.prepare": ActionAdapterBinding(
        operation_key="sales.return.prepare",
        available=True,
        prepare_function="erp_automation_commands.persist_sales_return_prepare",
        execute_function="erp_commercial_commands.post_sales_return",
        unavailable_reason=None,
    ),
    "procurement.purchase_order.prepare": ActionAdapterBinding(
        operation_key="procurement.purchase_order.prepare",
        available=True,
        prepare_function="erp_automation_commands.persist_purchase_order_prepare",
        execute_function="erp_trade_commands_v2.approve_purchase_order",
        unavailable_reason=None,
    ),
    "procurement.goods_receipt.prepare": ActionAdapterBinding(
        operation_key="procurement.goods_receipt.prepare",
        available=True,
        prepare_function="erp_automation_commands.persist_goods_receipt_prepare",
        execute_function="erp_trade_commands.post_goods_receipt",
        unavailable_reason=None,
    ),
    "procurement.supplier_invoice.prepare": ActionAdapterBinding(
        operation_key="procurement.supplier_invoice.prepare",
        available=True,
        prepare_function="erp_automation_commands.persist_supplier_invoice_prepare",
        execute_function="erp_commercial_commands.post_supplier_invoice",
        unavailable_reason=None,
    ),
    "procurement.purchase_return.prepare": ActionAdapterBinding(
        operation_key="procurement.purchase_return.prepare",
        available=True,
        prepare_function="erp_automation_commands.persist_purchase_return_prepare",
        execute_function="erp_commercial_commands.post_purchase_return",
        unavailable_reason=None,
    ),
    "finance.customer_receipt.prepare": ActionAdapterBinding(
        operation_key="finance.customer_receipt.prepare",
        available=True,
        prepare_function="erp_automation_commands.persist_customer_receipt_prepare",
        execute_function="erp_finance_commands.post_payment + finance.allocations",
        unavailable_reason=None,
    ),
    "finance.supplier_payment.prepare": ActionAdapterBinding(
        operation_key="finance.supplier_payment.prepare",
        available=True,
        prepare_function="erp_automation_commands.persist_supplier_payment_prepare",
        execute_function="erp_finance_commands.post_payment + finance.allocations",
        unavailable_reason=None,
    ),
    "finance.supplier_advance.prepare": ActionAdapterBinding(
        operation_key="finance.supplier_advance.prepare",
        available=True,
        prepare_function="erp_automation_commands.persist_supplier_advance_prepare",
        execute_function="erp_finance_commands.post_supplier_advance_payment",
        unavailable_reason=None,
    ),
    "finance.adjustment_note.prepare": ActionAdapterBinding(
        operation_key="finance.adjustment_note.prepare",
        available=True,
        prepare_function="erp_automation_commands.persist_adjustment_note_prepare",
        execute_function="erp_commercial_commands.post_adjustment_note",
        unavailable_reason=None,
    ),
    "inventory.transfer.prepare": ActionAdapterBinding(
        operation_key="inventory.transfer.prepare",
        available=True,
        prepare_function="erp_automation_commands.persist_inventory_transfer_prepare",
        execute_function="erp_automation_commands.execute_approved_command:inventory_transfer",
        unavailable_reason=None,
    ),
    "inventory.adjustment.prepare": ActionAdapterBinding(
        operation_key="inventory.adjustment.prepare",
        available=True,
        prepare_function="erp_automation_commands.persist_inventory_adjustment_prepare",
        execute_function="erp_automation_commands.execute_approved_command:inventory_count_gain",
        unavailable_reason=None,
    ),
    "inventory.destruction.prepare": ActionAdapterBinding(
        operation_key="inventory.destruction.prepare",
        available=True,
        prepare_function="erp_automation_commands.persist_inventory_destruction_prepare",
        execute_function="erp_automation_commands.execute_inventory_destruction_command",
        unavailable_reason=None,
    ),
}

_SHARED_BINDINGS = {
    "automation.command.approve": ActionAdapterBinding(
        operation_key="automation.command.approve",
        available=True,
        prepare_function=None,
        execute_function="erp_automation_commands.approve_operator_command",
        unavailable_reason=None,
    ),
    "automation.command.execute": ActionAdapterBinding(
        operation_key="automation.command.execute",
        available=True,
        prepare_function=None,
        execute_function="erp_automation_commands.execute_approved_command",
        unavailable_reason=None,
    ),
    "automation.command.status.get": ActionAdapterBinding(
        operation_key="automation.command.status.get",
        available=True,
        prepare_function=None,
        execute_function=None,
        unavailable_reason=None,
    ),
}

ACTION_ADAPTER_BINDINGS = {**_PREPARE_BINDINGS, **_SHARED_BINDINGS}

if set(ACTION_ADAPTER_BINDINGS) != set(ACTION_POLICIES):
    missing = sorted(set(ACTION_POLICIES) - set(ACTION_ADAPTER_BINDINGS))
    extra = sorted(set(ACTION_ADAPTER_BINDINGS) - set(ACTION_POLICIES))
    raise RuntimeError(
        f"Operator action adapter registry drifted; missing={missing}, extra={extra}"
    )

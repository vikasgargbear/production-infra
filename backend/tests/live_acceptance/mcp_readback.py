"""Exact MCP input adapters for canonical live18 readbacks."""

from __future__ import annotations


RESOURCE_ID_ARGUMENTS = {
    "erp_sales_invoice_get": "sales_invoice_id",
    "erp_sales_order_get": "sales_order_id",
    "erp_purchase_order_get": "purchase_order_id",
    "erp_goods_receipt_get": "goods_receipt_id",
    "erp_supplier_invoice_get": "supplier_invoice_id",
    "erp_adjustment_note_readback_get": "note_id",
}
COMMAND_ID_READBACKS = {
    "erp_operation_status_get",
    "erp_bank_reconciliation_get",
    "erp_customer_receipt_readback",
    "erp_customer_cheque_clearance_readback",
    "erp_customer_cheque_bounce_readback",
    "erp_expense_claim_readback",
    "erp_inventory_adjustment_readback",
    "erp_inventory_transfer_readback",
    "erp_purchase_return_readback",
    "erp_sales_dispatch_readback",
    "erp_sales_return_readback",
    "erp_supplier_advance_readback",
    "erp_supplier_payment_readback",
    "erp_sales_return_reversal_readback",
    "erp_purchase_return_reversal_readback",
    "erp_adjustment_note_reversal_readback",
}


def mcp_readback_arguments(
    tool_name: str,
    *,
    branch_id: str,
    command_id: str,
    resource_id: str,
) -> dict[str, str]:
    if tool_name in COMMAND_ID_READBACKS:
        return {"command_request_id": command_id}
    if tool_name == "erp_inventory_destruction_readback_get":
        return {"branch_id": branch_id, "command_request_id": command_id}
    resource_argument = RESOURCE_ID_ARGUMENTS.get(tool_name)
    if resource_argument:
        return {"branch_id": branch_id, resource_argument: resource_id}
    raise AssertionError(f"live18 has no reviewed MCP argument contract for {tool_name}")

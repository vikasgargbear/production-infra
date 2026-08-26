"""Exact cross-transport projections for Live18 posted resources."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID


@dataclass(frozen=True)
class ProjectionField:
    rest_key: str | None
    mcp_key: str
    database_path: str
    absolute_database_value: bool = False


FIELDS_BY_OPERATION: dict[str, tuple[ProjectionField, ...]] = {
    "sales.invoice": (
        ProjectionField("sales_invoice_id", "sales_invoice_id", "header.id"),
        ProjectionField("invoice_total", "grand_total", "header.grand_total"),
    ),
    "sales.order": (
        ProjectionField("sales_order_id", "sales_order_id", "header.id"),
        ProjectionField("total_amount", "grand_total", "header.grand_total"),
        ProjectionField("status", "status", "header.status"),
    ),
    "sales.dispatch": (
        ProjectionField("dispatch_id", "dispatch_id", "header.id"),
        ProjectionField(
            "inventory_base_quantity", "inventory_base_quantity",
            "stock.quantity_delta", True,
        ),
        ProjectionField(None, "inventory_value", "stock.value_delta", True),
        ProjectionField("status", "status", "header.status"),
    ),
    "procurement.purchase_order": (
        ProjectionField("purchase_order_id", "purchase_order_id", "header.id"),
        ProjectionField("total_amount", "grand_total", "header.grand_total"),
        ProjectionField("status", "status", "header.status"),
    ),
    "finance.supplier_advance": (
        ProjectionField("payment_id", "payment_id", "header.id"),
        ProjectionField("cash_disbursed_amount", "cash_disbursed_amount", "header.amount"),
        ProjectionField("status", "status", "header.status"),
    ),
    "procurement.goods_receipt": (
        ProjectionField("goods_receipt_id", "goods_receipt_id", "header.id"),
        ProjectionField("unit_cost", "unit_cost", "lines.0.unit_cost"),
    ),
    "procurement.supplier_invoice": (
        ProjectionField("supplier_invoice_id", "supplier_invoice_id", "header.id"),
        ProjectionField("grand_total", "grand_total", "header.grand_total"),
    ),
    "finance.customer_receipt": (
        ProjectionField("payment_id", "payment_id", "header.id"),
        ProjectionField("amount", "amount", "header.amount"),
        ProjectionField("status", "status", "header.status"),
    ),
    "finance.supplier_payment": (
        ProjectionField("payment_id", "payment_id", "header.id"),
        ProjectionField("amount", "amount", "header.amount"),
        ProjectionField("status", "status", "header.status"),
    ),
    "sales.return": (
        ProjectionField("return_id", "return_id", "header.id"),
        ProjectionField("grand_total", "grand_total", "header.grand_total"),
        ProjectionField("status", "status", "header.status"),
    ),
    "procurement.purchase_return": (
        ProjectionField("return_id", "return_id", "header.id"),
        ProjectionField("grand_total", "grand_total", "header.grand_total"),
        ProjectionField("status", "status", "header.status"),
    ),
    "inventory.adjustment": (
        ProjectionField(
            "inventory_document_id", "inventory_document_id", "header.id"
        ),
        ProjectionField(
            "total_gain_base_quantity", "total_gain_base_quantity",
            "stock.quantity_delta", True,
        ),
        ProjectionField("total_gain_value", "total_gain_value", "stock.value_delta", True),
        ProjectionField("status", "status", "header.status"),
    ),
    "inventory.transfer": (
        ProjectionField("id", "id", "header.id"),
        ProjectionField(
            "total_abs_base_quantity", "total_abs_base_quantity",
            "header.total_abs_base_quantity",
        ),
        ProjectionField("total_value", "total_value", "header.total_value"),
        ProjectionField("status", "status", "header.status"),
    ),
    "inventory.destruction": (
        ProjectionField("destruction_id", "destruction_id", "header.id"),
        ProjectionField(
            "total_destroyed_base_quantity", "total_destroyed_base_quantity",
            "destruction_evidence.0.total_abs_base_quantity",
        ),
        ProjectionField(
            "total_destroyed_value", "total_destroyed_value",
            "destruction_evidence.0.total_value",
        ),
        ProjectionField("status", "status", "header.status"),
    ),
    "finance.adjustment_note": (
        ProjectionField("id", "id", "header.id"),
        ProjectionField(
            "counterparty_payable_amount", "counterparty_payable_amount",
            "header.counterparty_payable_amount",
        ),
        ProjectionField("status", "status", "header.status"),
    ),
    "finance.bank_reconciliation": (
        ProjectionField(
            "reconciliation_match_id", "reconciliation_match_id", "header.id"
        ),
        ProjectionField(
            "matched_amount", "matched_amount",
            "bank_reconciliation_evidence.0.matched_amount",
        ),
        ProjectionField("status", "status", "header.status"),
    ),
    "finance.expense_claim": (
        ProjectionField("expense_claim_id", "expense_claim_id", "header.id"),
        ProjectionField("approved_amount", "approved_amount", "header.approved_amount"),
        ProjectionField("status", "status", "header.status"),
    ),
}


def _find(value: Any, key: str) -> Any:
    if isinstance(value, dict):
        if key in value:
            return value[key]
        for child in value.values():
            found = _find(child, key)
            if found is not None:
                return found
    elif isinstance(value, list):
        for child in value:
            found = _find(child, key)
            if found is not None:
                return found
    return None


def _path(value: Any, path: str) -> Any:
    current = value
    for part in path.split("."):
        if isinstance(current, list):
            current = current[int(part)]
        elif isinstance(current, dict) and part in current:
            current = current[part]
        else:
            raise AssertionError(f"database reconciliation omitted {path}")
    return current


def _canonical(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, (Decimal, int, float)):
        return Decimal(str(value))
    if isinstance(value, str):
        try:
            return Decimal(value)
        except InvalidOperation:
            return value
    return str(value)


def assert_canonical_projection_consistency(
    operation: str,
    *,
    rest: dict[str, Any],
    mcp: dict[str, Any],
    database: dict[str, Any],
) -> None:
    """Reconcile public fields across REST/MCP/DB and privileged fields across MCP/DB."""

    rules = FIELDS_BY_OPERATION.get(operation)
    if not rules:
        raise AssertionError(f"{operation} has no reviewed cross-authority projection")
    for rule in rules:
        mcp_value = _find(mcp, rule.mcp_key)
        if mcp_value is None:
            raise AssertionError(f"MCP readback omitted {operation}.{rule.mcp_key}")
        database_value = _path(database, rule.database_path)
        if rule.absolute_database_value:
            database_value = abs(Decimal(str(database_value)))
        expected = _canonical(mcp_value)
        if rule.rest_key is not None:
            rest_value = _find(rest, rule.rest_key)
            if rest_value is None:
                raise AssertionError(
                    f"REST readback omitted {operation}.{rule.rest_key}"
                )
            expected = _canonical(rest_value)
            assert _canonical(mcp_value) == expected, (
                f"{operation}.{rule.rest_key} differs between REST and MCP"
            )
        assert _canonical(database_value) == expected, (
            f"{operation}.{rule.mcp_key} differs between MCP and PostgreSQL"
        )

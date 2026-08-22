"""Closed MCP read allowlist shared by grant issuance and canonical reads."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class CanonicalReadPolicy:
    operation_key: str
    capability_code: str
    permission_code: str
    path: str
    maximum_records: int
    sensitive_read: bool = False
    exposed_in_mcp: bool = True
    readiness_verified: bool = True


CANONICAL_READ_POLICIES = {
    "master.products.search": CanonicalReadPolicy(
        "master.products.search",
        "master.products.search",
        "catalog.product.manage",
        "/internal/mcp/reads/products",
        100,
    ),
    "master.suppliers.search": CanonicalReadPolicy(
        "master.suppliers.search",
        "master.suppliers.search",
        "parties.supplier.manage",
        "/internal/mcp/reads/suppliers",
        200,
        sensitive_read=True,
    ),
    "gst.settings.get": CanonicalReadPolicy(
        "gst.settings.get",
        "gst.settings.get",
        "tax.registration.manage",
        "/internal/mcp/reads/gst-settings",
        1,
    ),
}


# These bounded reads resolve canonical IDs needed by the published operator
# actions. They remain separately catalogued so their branch requirements and
# record limits stay auditable.
PLANNED_RESOLUTION_READ_POLICIES = {
    "parties.customers.search": CanonicalReadPolicy(
        "parties.customers.search",
        "parties.customers.search",
        "parties.customer.manage",
        "/internal/mcp/resolution/customers",
        50,
        sensitive_read=True,
        exposed_in_mcp=True,
        readiness_verified=True,
    ),
    "inventory.locations.search": CanonicalReadPolicy(
        "inventory.locations.search",
        "inventory.locations.search",
        "inventory.location.manage",
        "/internal/mcp/resolution/locations",
        50,
        exposed_in_mcp=True,
        readiness_verified=True,
    ),
    "inventory.stock_batches.search": CanonicalReadPolicy(
        "inventory.stock_batches.search",
        "inventory.stock_batches.search",
        "inventory.batch.manage",
        "/internal/mcp/resolution/stock-batches",
        100,
        exposed_in_mcp=True,
        readiness_verified=True,
    ),
    "sales.orders.get": CanonicalReadPolicy(
        "sales.orders.get", "sales.orders.get", "sales.order.manage",
        "/internal/mcp/resolution/sales-orders", 1,
        exposed_in_mcp=True, readiness_verified=True,
    ),
    "sales.invoices.get": CanonicalReadPolicy(
        "sales.invoices.get", "sales.invoices.get", "sales.invoice.create",
        "/internal/mcp/resolution/sales-invoices", 1,
        exposed_in_mcp=True, readiness_verified=True,
    ),
    "procurement.purchase_orders.get": CanonicalReadPolicy(
        "procurement.purchase_orders.get", "procurement.purchase_orders.get",
        "procurement.order.manage", "/internal/mcp/resolution/purchase-orders", 1,
        exposed_in_mcp=True, readiness_verified=True,
    ),
    "procurement.goods_receipts.get": CanonicalReadPolicy(
        "procurement.goods_receipts.get", "procurement.goods_receipts.get",
        "procurement.receipt.post", "/internal/mcp/resolution/goods-receipts", 1,
        exposed_in_mcp=True, readiness_verified=True,
    ),
    "procurement.supplier_invoices.get": CanonicalReadPolicy(
        "procurement.supplier_invoices.get", "procurement.supplier_invoices.get",
        "procurement.supplier_invoice.create", "/internal/mcp/resolution/supplier-invoices", 1,
        exposed_in_mcp=True, readiness_verified=True,
    ),
    "finance.open_items.search": CanonicalReadPolicy(
        "finance.open_items.search", "finance.open_items.search", "finance.payment.manage",
        "/internal/mcp/resolution/open-items", 100,
        exposed_in_mcp=True, readiness_verified=True,
    ),
    "finance.settlement_choices.search": CanonicalReadPolicy(
        "finance.settlement_choices.search", "finance.settlement_choices.search",
        "finance.payment.manage", "/internal/mcp/resolution/settlement-choices", 100,
        exposed_in_mcp=True, readiness_verified=True,
    ),
}

ALL_CANONICAL_READ_POLICIES = {
    **CANONICAL_READ_POLICIES,
    **PLANNED_RESOLUTION_READ_POLICIES,
}


def policy_for(operation_key: str) -> Optional[CanonicalReadPolicy]:
    return ALL_CANONICAL_READ_POLICIES.get(operation_key)

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
        "inventory.view",
        "/internal/mcp/reads/products",
        100,
    ),
    "master.suppliers.search": CanonicalReadPolicy(
        "master.suppliers.search",
        "master.suppliers.search",
        "master.view",
        "/internal/mcp/reads/suppliers",
        200,
        sensitive_read=True,
    ),
    "gst.settings.get": CanonicalReadPolicy(
        "gst.settings.get",
        "gst.settings.get",
        "gst.view",
        "/internal/mcp/reads/gst-settings",
        1,
    ),
}


# These operations are application-owned dependencies of the operator-action
# contract.  They are deliberately distinct from CANONICAL_READ_POLICIES so
# adding the hidden API cannot accidentally expand the live MCP tool registry.
PLANNED_RESOLUTION_READ_POLICIES = {
    "parties.customers.search": CanonicalReadPolicy(
        "parties.customers.search",
        "parties.customers.search",
        "master.view",
        "/internal/mcp/resolution/customers",
        50,
        sensitive_read=True,
        exposed_in_mcp=False,
        readiness_verified=False,
    ),
    "inventory.locations.search": CanonicalReadPolicy(
        "inventory.locations.search",
        "inventory.locations.search",
        "inventory.view",
        "/internal/mcp/resolution/locations",
        50,
        exposed_in_mcp=False,
        readiness_verified=False,
    ),
    "inventory.stock_batches.search": CanonicalReadPolicy(
        "inventory.stock_batches.search",
        "inventory.stock_batches.search",
        "inventory.view",
        "/internal/mcp/resolution/stock-batches",
        100,
        exposed_in_mcp=False,
        readiness_verified=False,
    ),
    "sales.orders.get": CanonicalReadPolicy(
        "sales.orders.get", "sales.orders.get", "sales.view",
        "/internal/mcp/resolution/sales-orders", 1,
        exposed_in_mcp=False, readiness_verified=False,
    ),
    "sales.invoices.get": CanonicalReadPolicy(
        "sales.invoices.get", "sales.invoices.get", "sales.view",
        "/internal/mcp/resolution/sales-invoices", 1,
        exposed_in_mcp=False, readiness_verified=False,
    ),
    "procurement.purchase_orders.get": CanonicalReadPolicy(
        "procurement.purchase_orders.get", "procurement.purchase_orders.get",
        "procurement.view", "/internal/mcp/resolution/purchase-orders", 1,
        exposed_in_mcp=False, readiness_verified=False,
    ),
    "procurement.goods_receipts.get": CanonicalReadPolicy(
        "procurement.goods_receipts.get", "procurement.goods_receipts.get",
        "procurement.view", "/internal/mcp/resolution/goods-receipts", 1,
        exposed_in_mcp=False, readiness_verified=False,
    ),
    "procurement.supplier_invoices.get": CanonicalReadPolicy(
        "procurement.supplier_invoices.get", "procurement.supplier_invoices.get",
        "procurement.view", "/internal/mcp/resolution/supplier-invoices", 1,
        exposed_in_mcp=False, readiness_verified=False,
    ),
    "finance.open_items.search": CanonicalReadPolicy(
        "finance.open_items.search", "finance.open_items.search", "finance.view",
        "/internal/mcp/resolution/open-items", 100,
        exposed_in_mcp=False, readiness_verified=False,
    ),
    "finance.settlement_choices.search": CanonicalReadPolicy(
        "finance.settlement_choices.search", "finance.settlement_choices.search",
        "finance.view", "/internal/mcp/resolution/settlement-choices", 100,
        exposed_in_mcp=False, readiness_verified=False,
    ),
}

ALL_CANONICAL_READ_POLICIES = {
    **CANONICAL_READ_POLICIES,
    **PLANNED_RESOLUTION_READ_POLICIES,
}


def policy_for(operation_key: str) -> Optional[CanonicalReadPolicy]:
    return ALL_CANONICAL_READ_POLICIES.get(operation_key)

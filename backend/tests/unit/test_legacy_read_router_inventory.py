"""Lock the remaining legacy GET exceptions and canonical route retirements.

Every endpoint in ``LEGACY_READ_INVENTORY`` is still a migration blocker.  A
new legacy GET must be added here deliberately; it cannot enter the runtime
route graph unnoticed.  Retired modules below must remain unmounted even when
their source files still exist for migration archaeology.
"""

import re
from pathlib import Path

from fastapi.routing import APIRoute

from app.main import app


ROOT = Path(__file__).resolve().parents[3]

EXPECTED_LEGACY_ROUTER_REFERENCES = {
    "sales_returns_router", "purchase_returns_router", "inventory.router",
    "stock_adjustments.router", "stock_movements.router", "stock_writeoff.router",
    "payments.router", "payment_allocation.router", "credit_debit_notes.router",
    "gst.router", "gstr2b.router", "compliance.router",
}


RETIRED_MODULE_PREFIXES = (
    "app.api.routes.master.customers.",
    "app.api.routes.master.suppliers.",
    "app.api.routes.master.products.",
    "app.api.routes.master.branches.",
    "app.api.routes.master.departments.",
    "app.api.routes.master.employees.",
    "app.api.routes.master.bank_accounts.",
    "app.api.routes.sales.orders.",
    "app.api.routes.sales.invoices.",
    "app.api.routes.sales.challans.",
    "app.api.routes.sales.conversions.",
    "app.api.routes.purchase.orders.",
    "app.api.routes.purchase.supplier_invoices.",
    "app.api.routes.purchase.grn",
    "app.api.routes.purchase.upload.",
    "app.api.routes.finance.tax.",
    "app.api.routes.finance.expenses.",
    "app.api.routes.documents",
    "app.api.routes.reports.collection",
    "app.api.routes.reports.outstanding",
)


LEGACY_READ_INVENTORY = {
    "app.api.routes.returns.sales.routes": {
        "/api/sale-returns/", "/api/sale-returns/returnable-invoices",
        "/api/sale-returns/invoice/{invoice_id}/returns",
        "/api/sale-returns/invoice/{invoice_id}/returnable-items",
        "/api/sale-returns/invoice/{invoice_id}/items", "/api/sale-returns/{return_id}",
        "/api/sale-returns/test/verify-return/{return_id}",
        "/api/sale-returns/test/return-methods", "/api/sale-returns/test/validate/{return_id}",
    },
    "app.api.routes.returns.purchase.routes": {
        "/api/purchase-returns/", "/api/purchase-returns/{return_id}",
        "/api/purchase-returns/supplier-invoice/{invoice_id}/returnable-items",
        "/api/purchase-returns/test/validate/{return_id}",
        "/api/purchase-returns/test/return-methods",
    },
    "app.api.routes.inventory.stock.routes": {
        "/api/inventory/", "/api/inventory/batches/{batch_id}",
        "/api/inventory/batches/", "/api/inventory/batches",
        "/api/inventory/stock/current/{product_id}", "/api/inventory/stock/current",
        "/api/inventory/movements", "/api/inventory/expiry/alerts",
        "/api/inventory/valuation", "/api/inventory/dashboard",
    },
    "app.api.routes.inventory.adjustments.routes": {
        "/api/stock-adjustments/", "/api/stock-adjustments/analytics/summary",
    },
    "app.api.routes.inventory.movements.routes": {
        "/api/stock-movements/", "/api/stock-movements/reasons",
        "/api/stock-movements/product/{product_id}/batches",
        "/api/stock-movements/near-expiry", "/api/stock-movements/low-stock",
    },
    "app.api.routes.inventory.writeoff.routes": {
        "/api/stock-writeoff/expiry-report", "/api/stock-writeoff/",
        "/api/stock-writeoff/{writeoff_id}", "/api/stock-writeoff/itc-summary",
    },
    "app.api.routes.finance.payments.routes": {
        "/api/payments/", "/api/payments/search", "/api/payments/pending",
        "/api/payments/methods", "/api/payments/outstanding",
        "/api/payments/invoice/{invoice_id}", "/api/payments/summary",
        "/api/payments/aging-report", "/api/payments/{payment_id}",
    },
    "app.api.routes.finance.allocation.routes": {
        "/api/payment-allocation/payment/{payment_id}/allocations",
        "/api/payment-allocation/unallocated-payments",
    },
    "app.api.routes.finance.credit_notes.routes": {
        "/api/credit-debit-notes/", "/api/credit-debit-notes/{note_id}",
        "/api/credit-debit-notes/{note_id}/print", "/api/credit-debit-notes/reasons/list",
        "/api/credit-debit-notes/linked-invoices/{party_id}",
        "/api/credit-debit-notes/invoice-items/{invoice_id}",
        "/api/credit-debit-notes/credit-note-reasons",
        "/api/credit-debit-notes/debit-note-reasons",
    },
    "app.api.routes.compliance.gst": {
        "/api/gst/dashboard", "/api/gst/returns/status", "/api/gst/calculate",
        "/api/gst/verification", "/api/gst/compliance/status", "/api/gst/settings",
        "/api/gst/metrics", "/api/gst/reports/tax/gstr2a",
        "/api/gst/reports/credit-debit-notes",
    },
    "app.api.routes.compliance.gstr2b": {
        "/api/gst/gstr2b/status", "/api/gst/gstr2b/mismatches",
    },
    "app.api.routes.compliance.compliance": {
        "/api/compliance/compliance/drug-licenses",
        "/api/compliance/compliance/drug-licenses/expiring",
        "/api/compliance/compliance/checklist", "/api/compliance/compliance/alerts",
        "/api/compliance/compliance/reports/regulatory",
    },
}

def _get_routes():
    return [
        route for route in app.routes
        if isinstance(route, APIRoute) and "GET" in (route.methods or set())
    ]


def test_every_legacy_router_mount_is_explicitly_inventoried() -> None:
    main_source = (ROOT / "backend/app/main.py").read_text(encoding="utf-8")
    mounted = set(re.findall(
        r"include_legacy_read_only_router\(api,\s*([a-zA-Z0-9_.]+)",
        main_source,
    ))
    assert mounted == EXPECTED_LEGACY_ROUTER_REFERENCES


def test_every_remaining_legacy_get_is_explicitly_inventoried() -> None:
    expected_modules = set(LEGACY_READ_INVENTORY)
    actual = {module: set() for module in expected_modules}
    unexpected_modules = set()

    for route in _get_routes():
        module = route.endpoint.__module__
        if module in expected_modules:
            actual[module].add(route.path)
        elif any(module.startswith(prefix) for prefix in RETIRED_MODULE_PREFIXES):
            unexpected_modules.add(module)

    assert not unexpected_modules
    assert actual == LEGACY_READ_INVENTORY


def test_retired_read_paths_are_absent_or_canonically_covered_in_openapi() -> None:
    paths = app.openapi()["paths"]

    for retired_path in {
        "/api/customers/{customer_id}", "/api/customers/{customer_id}/ledger",
        "/api/customers/{customer_id}/outstanding",
        "/api/suppliers/search", "/api/suppliers/{supplier_id}",
        "/api/suppliers/{supplier_id}/products", "/api/suppliers/{supplier_id}/purchases",
        "/api/products/search",
        "/api/products/master/categories", "/api/products/master/types",
        "/api/products/master/classes", "/api/branches/{branch_id}",
        "/api/departments/", "/api/departments/{department_id}",
        "/api/employees/{employee_id}",
        "/api/sales-orders/employees", "/api/sales-orders/dashboard/stats",
        "/api/challan/analytics/summary", "/api/conversions/conversions/eligible-challans",
        "/api/purchases/{purchase_id}/for-entry", "/api/purchases/{purchase_id}/items",
        "/api/purchases/pending-receipts", "/api/supplier-invoices/{invoice_id}",
        "/api/supplier-invoices/{invoice_id}/items", "/api/grn/{grn_id}",
        "/api/purchase-upload/version", "/api/purchase-upload/check-supplier",
        "/api/purchase-upload/parse-history", "/api/tax-entries/",
        "/api/tax-entries/{entry_id}", "/api/tax-entries/overview",
        "/api/expense-claims", "/api/expense-claims/expense-types",
        "/api/expense-claims/{claim_id}",
        "/api/collection-center/collection/analytics/performance",
        "/api/collection-center/collection/analytics/agent-performance",
        "/api/collection-center/collection/customer/{customer_id}/outstanding",
        "/api/collection-center/collection/hub-stats",
        "/api/collection-center/collection/notifications",
        "/api/collection-center/collection/campaigns",
        "/api/customer-outstanding/net-position",
        "/api/customer-outstanding/collection-metrics",
    }:
        assert retired_path not in paths

    assert "get" not in paths["/api/products/{product_id}"]
    assert {"put", "delete"} <= set(paths["/api/products/{product_id}"])

    for canonical_path in {
        "/api/customers", "/api/customers/", "/api/customers/all-with-addresses",
        "/api/customers/{customer_id}/addresses",
        "/api/suppliers", "/api/suppliers/", "/api/products", "/api/products/",
        "/api/products/search-with-batches", "/api/products/all-with-batches",
        "/api/products/{product_id}/batches", "/api/employees", "/api/employees/",
        "/api/branches", "/api/branches/", "/api/bank-accounts", "/api/bank-accounts/",
        "/api/sales-orders/", "/api/sales-orders/{order_id}",
        "/api/canonical/sales-orders/{order_id}/acceptance-readback",
        "/api/invoices/", "/api/invoices/{invoice_id}",
        "/api/canonical/sales-invoices/{invoice_id}/posting-readback",
        "/api/challan/", "/api/challan/{challan_id}",
        "/api/canonical/sales-dispatches/{dispatch_id}/acceptance-readback",
        "/api/purchases/", "/api/canonical/purchase-orders/{purchase_order_id}",
        "/api/supplier-invoices/", "/api/canonical/supplier-invoices/{supplier_invoice_id}",
        "/api/grn", "/api/canonical/goods-receipts/{goods_receipt_id}",
        "/api/tax-entries/analytics/summary", "/api/tax-entries/gstr1/summary",
        "/api/web/actions/expense-claims/context",
        "/api/web/actions/expense-claims/commands/{command_request_id}/readback",
        "/api/canonical/document-history",
    }:
        assert canonical_path in paths

    assert paths["/api/sales-orders/{order_id}"]["get"]["operationId"] == (
        "canonical_sales_order_uuid_compatibility_detail"
    )
    assert paths["/api/invoices/{invoice_id}"]["get"]["operationId"] == (
        "canonical_invoice_uuid_compatibility_detail"
    )
    assert paths["/api/challan/{challan_id}"]["get"]["operationId"] == (
        "canonical_challan_uuid_compatibility_detail"
    )

    assert "post" in paths["/api/purchase-upload/parse-invoice-safe"]
    assert "post" in paths["/api/purchase-upload/validate-invoice"]
    assert "post" in paths["/api/tax-entries/calculate"]
    assert paths["/api/collection-center/collection/aging-data"]["get"][
        "operationId"
    ].startswith("canonical_collection_aging")

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

EXPECTED_LEGACY_ROUTER_REFERENCES = set()


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
    "app.api.routes.finance.payments.",
    "app.api.routes.finance.allocation.",
    "app.api.routes.finance.credit_notes.",
    "app.api.routes.finance.ledger.",
    "app.api.routes.returns.sales.",
    "app.api.routes.returns.purchase.",
    "app.api.routes.documents",
    "app.api.routes.reports.collection",
    "app.api.routes.reports.outstanding",
    "app.api.routes.inventory.stock.",
    "app.api.routes.inventory.adjustments.",
    "app.api.routes.inventory.movements.",
    "app.api.routes.inventory.writeoff.",
    "app.api.routes.compliance.gst",
    "app.api.routes.compliance.gstr2b",
    "app.api.routes.compliance.compliance",
)


LEGACY_READ_INVENTORY = {}

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
        "/api/payments/", "/api/payments/search", "/api/payments/pending", "/api/payments/methods",
        "/api/payments/outstanding", "/api/payments/invoice/{invoice_id}",
        "/api/payments/summary", "/api/payments/aging-report",
        "/api/payments/{payment_id}",
        "/api/payment-allocation/payment/{payment_id}/allocations",
        "/api/payment-allocation/unallocated-payments",
        "/api/credit-debit-notes/", "/api/credit-debit-notes/{note_id}",
        "/api/credit-debit-notes/{note_id}/print",
        "/api/credit-debit-notes/reasons/list",
        "/api/credit-debit-notes/linked-invoices/{party_id}",
        "/api/credit-debit-notes/invoice-items/{invoice_id}",
        "/api/credit-debit-notes/credit-note-reasons",
        "/api/credit-debit-notes/debit-note-reasons",
        "/api/ledger/statement/{party_id}",
        "/api/ledger/balance/{party_id}",
        "/api/ledger/outstanding/{party_id}",
        "/api/ledger/opening-balance/{party_id}",
        "/api/ledger/last-payment/{party_id}",
        "/api/ledger/interest-calculation/{party_id}",
        "/api/ledger/summary", "/api/ledger/top-debtors",
        "/api/sale-returns/", "/api/sale-returns/returnable-invoices",
        "/api/sale-returns/invoice/{invoice_id}/returns",
        "/api/sale-returns/invoice/{invoice_id}/returnable-items",
        "/api/sale-returns/invoice/{invoice_id}/items",
        "/api/sale-returns/{return_id}",
        "/api/purchase-returns/{return_id}",
        "/api/metadata/return-reasons",
        "/api/inventory/", "/api/inventory/batches/{batch_id}",
        "/api/inventory/batches", "/api/inventory/batches/",
        "/api/inventory/stock/current", "/api/inventory/list",
        "/api/inventory/stock-status", "/api/inventory/movements",
        "/api/inventory/categories", "/api/inventory/expiry/alerts",
        "/api/inventory/valuation", "/api/inventory/dashboard",
        "/api/stock-adjustments/", "/api/stock-adjustments/analytics/summary",
        "/api/stock-movements/", "/api/stock-movements/reasons",
        "/api/stock-movements/product/{product_id}/batches",
        "/api/stock-movements/near-expiry", "/api/stock-movements/low-stock",
        "/api/stock-writeoff/expiry-report", "/api/stock-writeoff/",
        "/api/stock-writeoff/{writeoff_id}", "/api/stock-writeoff/itc-summary",
        "/api/gst/calculate", "/api/gst/verification",
        "/api/gst/compliance/status", "/api/gst/metrics",
        "/api/gst/reports/tax/gstr2a", "/api/gst/gstr2b/status",
        "/api/gst/gstr2b/mismatches",
        "/api/reports/tax/hsn",
        "/api/compliance/compliance/drug-licenses",
        "/api/compliance/compliance/drug-licenses/expiring",
        "/api/compliance/compliance/checklist",
        "/api/compliance/compliance/alerts",
        "/api/compliance/compliance/reports/regulatory",
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
        "/api/canonical/payment-history",
        "/api/canonical/payment-history/{payment_id}",
        "/api/canonical/customer-receipts/context",
        "/api/payment-allocation/unpaid-invoices",
        "/api/payment-allocation/invoice/{invoice_id}/payments",
        "/api/payment-allocation/payment/{payment_id}/readback",
        "/api/canonical/adjustment-notes/context",
        "/api/canonical/adjustment-notes/{note_id}",
        "/api/canonical/party-ledger/{party_account_id}",
        "/api/canonical/returns/sales-invoices/{invoice_id}/context",
        "/api/canonical/returns/supplier-invoices/{invoice_id}/context",
        "/api/canonical/returns/sales/{return_id}",
        "/api/canonical/returns/purchases/{return_id}",
        "/api/canonical/returns/approval-inbox",
        "/api/canonical/returns/requester-inbox",
        "/api/canonical/returns/requester/commands/{command_request_id}",
        "/api/canonical/returns/commands/{command_request_id}/review",
        "/api/purchase-returns/supplier-invoice/{invoice_id}/returnable-items",
        "/api/canonical/inventory/context",
        "/api/canonical/inventory/current-stock",
        "/api/canonical/inventory/batches",
        "/api/canonical/inventory/movements",
        "/api/canonical/inventory-transfers/eligible-batches",
        "/api/gst/dashboard", "/api/gst/returns/status",
        "/api/gst/reports/gstr1", "/api/gst/reports/gstr3b",
        "/api/gst/reports/credit-debit-notes", "/api/gst/settings",
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

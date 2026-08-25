"""Prevent reintroduction of the retired integer/alias sales authority."""

from pathlib import Path

from app.main import app


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


RETIRED_PATHS = (
    "backend/app/api/routes/sales/invoices/routes.py",
    "backend/app/api/routes/sales/orders/routes.py",
    "backend/app/api/routes/master/products/routes.py",
    "backend/app/api/routes/purchase/orders/routes.py",
    "backend/app/api/services/sales/invoice/invoice_service.py",
    "backend/app/api/services/sales/order/order_service.py",
    "backend/app/api/services/master/product/service.py",
    "backend/app/api/services/purchase/order/order_service.py",
)


def _read(relative_path: str) -> str:
    return (REPOSITORY_ROOT / relative_path).read_text(encoding="utf-8")


def test_legacy_sales_master_and_purchase_order_packages_are_absent():
    assert all(not (REPOSITORY_ROOT / path).exists() for path in RETIRED_PATHS)


def test_package_exports_and_main_do_not_restore_legacy_authorities():
    source = "\n".join([
        _read("backend/app/main.py"),
        _read("backend/app/api/routes/master/__init__.py"),
        _read("backend/app/api/routes/purchase/__init__.py"),
        _read("backend/app/api/services/__init__.py"),
        _read("backend/app/api/services/master/__init__.py"),
        _read("backend/app/api/services/purchase/__init__.py"),
        _read("backend/app/api/services/sales/__init__.py"),
    ])

    for token in (
        "from .sales.invoice",
        "from .sales.order",
        "from .master.product",
        "from .purchase.order",
        "routes.sales.invoices",
        "routes.sales.orders",
        "routes.master.products",
        "routes.purchase.orders",
    ):
        assert token not in source


def test_openapi_keeps_only_uuid_canonical_sales_and_product_surfaces():
    paths = app.openapi()["paths"]

    assert "/api/products" in paths
    assert "/api/products/" in paths
    assert "/api/products/{product_id}" in paths
    assert "/api/invoices/" in paths
    assert "/api/sales-orders/" in paths
    assert "/api/invoices/{invoice_id}" in paths
    assert "/api/sales-orders/{order_id}" in paths
    assert "/api/canonical/invoices/{invoice_id}" in paths
    assert "/api/canonical/sales-orders/{order_id}/import-detail" in paths
    assert "/api/products/search" not in paths
    assert "/api/canonical/purchase-orders/{purchase_order_id}" in paths


def test_sales_preview_accepts_no_browser_tax_rate_and_resolves_server_facts():
    schemas = _read("backend/app/api/schemas/calculations.py")
    routes = _read("backend/app/api/routes/calculations.py")
    authority = _read("backend/app/api/services/sales/tax_authority.py")
    canonical_line = schemas.split(
        "class CanonicalSalesCalculationLine", 1
    )[1].split("class InvoiceCalculationRequest", 1)[0]

    assert "gst_percent" not in canonical_line
    assert "tax_percent" not in canonical_line
    assert "resolve_sales_tax_authority" in routes
    assert "tax.tax_code_versions" in authority
    assert "core.reference_data_releases" in authority
    assert "effective_from<=:document_date" in authority


def test_retired_purchase_upload_write_cannot_recreate_legacy_products():
    source = _read("backend/app/api/routes/purchase/upload/routes.py")

    assert "ProductService" not in source
    assert "create-from-parsed" not in source
    assert "DocumentNumberService" not in source

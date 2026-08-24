from pathlib import Path

from fastapi.routing import APIRoute

from app.api.routes import canonical_erp_reads
from app.core.utils import schema_validator
from app.main import app


CRITICAL_UI_READS = {
    "/api/products",
    "/api/products/{product_id}/batches",
    "/api/customers",
    "/api/suppliers",
    "/api/employees",
    "/api/invoices/",
    "/api/sales-orders/",
    "/api/challan/",
    "/api/purchases/",
    "/api/grn/",
    "/api/sale-returns/",
    "/api/purchase-returns/",
    "/api/payments/search",
    "/api/gst/dashboard",
    "/api/inventory/list",
    "/api/financial/summary",
    "/api/dashboard/stats",
    "/api/settings/features",
}


def test_canonical_router_is_read_only_and_covers_critical_ui_reads() -> None:
    routes = [route for route in canonical_erp_reads.router.routes if isinstance(route, APIRoute)]
    assert {route.path for route in routes} >= {path.removeprefix("/api") for path in CRITICAL_UI_READS}
    assert all(route.methods <= {"GET", "HEAD"} for route in routes)


def test_canonical_routes_precede_legacy_compatibility_routes() -> None:
    # FastAPI 0.137+ preserves included routers instead of flattening copies of
    # their APIRoutes.  Its effective route contexts expose the fully-prefixed
    # request path while older supported versions still expose APIRoute objects.
    routes = []
    for route in app.routes:
        effective_contexts = getattr(route, "effective_route_contexts", None)
        if callable(effective_contexts):
            routes.extend(effective_contexts())
        elif isinstance(route, APIRoute):
            routes.append(route)
    for path in CRITICAL_UI_READS:
        matches = [route for route in routes if route.path == path]
        assert matches, path
        assert matches[0].endpoint.__module__ == canonical_erp_reads.__name__


def test_canonical_reads_activate_rls_and_do_not_use_legacy_schemas() -> None:
    source = canonical_erp_reads.__file__
    text = open(source, encoding="utf-8").read()
    assert "erp_security.activate_context" in text
    assert "master." not in text
    assert "public." not in text
    assert "legacy" not in text.lower().replace("legacy routes", "")


def test_canonical_read_sql_matches_checked_in_domain_catalogs() -> None:
    result = schema_validator.validate_module(Path(canonical_erp_reads.__file__))
    assert result["errors"] == []

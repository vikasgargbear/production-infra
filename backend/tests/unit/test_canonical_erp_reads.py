from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

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


def test_canonical_router_covers_reads_and_bounded_master_writes() -> None:
    routes = [route for route in canonical_erp_reads.router.routes if isinstance(route, APIRoute)]
    assert {route.path for route in routes} >= {path.removeprefix("/api") for path in CRITICAL_UI_READS}
    writes = [route for route in routes if not route.methods <= {"GET", "HEAD"}]
    assert [(route.path, route.methods) for route in writes] == [
        ("/products/", {"POST"}),
        ("/products/{product_id}", {"PUT"}),
        ("/customers/", {"POST"}),
        ("/suppliers/", {"POST"}),
    ]


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

    product_writes = [
        route for route in routes
        if route.path == "/api/products/" and "POST" in route.methods
    ]
    assert product_writes
    assert product_writes[0].endpoint is canonical_erp_reads.create_product_draft

    product_updates = [
        route for route in routes
        if route.path == "/api/products/{product_id}" and "PUT" in route.methods
    ]
    assert product_updates
    assert product_updates[0].endpoint is canonical_erp_reads.update_product_draft

    for path, endpoint in (
        ("/api/customers/", canonical_erp_reads.create_customer),
        ("/api/suppliers/", canonical_erp_reads.create_supplier),
    ):
        writes = [
            route for route in routes
            if route.path == path and "POST" in route.methods
        ]
        assert writes
        assert writes[0].endpoint is endpoint


def test_canonical_reads_activate_rls_and_do_not_use_legacy_schemas() -> None:
    source = canonical_erp_reads.__file__
    text = open(source, encoding="utf-8").read()
    assert "erp_security.activate_context" in text
    for sql_verb in ("FROM", "JOIN", "INTO", "UPDATE"):
        assert f"{sql_verb} master." not in text
        assert f"{sql_verb} public." not in text
    assert "legacy" not in text.lower().replace("legacy routes", "")


def test_canonical_read_sql_matches_checked_in_domain_catalogs() -> None:
    result = schema_validator.validate_module(Path(canonical_erp_reads.__file__))
    assert result["errors"] == []


def test_batch_reads_use_canonical_inventory_lifecycle_states() -> None:
    source = Path(canonical_erp_reads.__file__).read_text(encoding="utf-8")

    assert "batch.status IN ('released','blocked')" in source
    assert "batch.status IN ('active','blocked')" not in source


class ProductDraftDatabase:
    def __init__(self) -> None:
        self.statements = []
        self.commits = 0

    def execute(self, statement, params):
        sql = str(statement)
        self.statements.append(sql)
        if "activate_context" in sql:
            return SimpleNamespace()
        if "SELECT 1 FROM catalog.products" in sql:
            return SimpleNamespace(first=lambda: None)
        if "INSERT INTO catalog.products" in sql:
            row = SimpleNamespace(id=uuid4(), sku=params["sku"], name=params["name"])
            return SimpleNamespace(one=lambda: row)
        raise AssertionError(sql)

    def commit(self):
        self.commits += 1


def test_product_draft_write_uses_canonical_catalog_and_returns_uuid() -> None:
    database = ProductDraftDatabase()
    result = canonical_erp_reads.create_product_draft(
        canonical_erp_reads.CanonicalProductDraftCreate(product_name="E2E draft"),
        user={"org_id": str(uuid4()), "auth_user_id": str(uuid4())},
        db=database,
    )

    assert result["lifecycle_status"] == "draft"
    assert str(result["product_id"])
    assert database.commits == 1
    sql = "\n".join(database.statements)
    assert "catalog.products" in sql
    assert "inventory.products" not in sql

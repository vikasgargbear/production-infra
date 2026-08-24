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
        ("/customers/{customer_id:uuid}/addresses/", {"POST"}),
        ("/customers/{customer_id:uuid}/addresses/{address_id:uuid}", {"PUT"}),
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


def test_uuid_customer_address_routes_precede_legacy_integer_routes() -> None:
    routes = [route for route in canonical_erp_reads.router.routes if isinstance(route, APIRoute)]
    paths = {(route.path, frozenset(route.methods)) for route in routes}

    assert ("/customers/{customer_id:uuid}/addresses", frozenset({"GET"})) in paths
    assert ("/customers/{customer_id:uuid}/addresses/", frozenset({"POST"})) in paths
    assert (
        "/customers/{customer_id:uuid}/addresses/{address_id:uuid}",
        frozenset({"PUT"}),
    ) in paths


def test_offline_sync_routes_are_not_registered() -> None:
    routes = [route for route in canonical_erp_reads.router.routes if isinstance(route, APIRoute)]
    assert not any(route.path.startswith("/sync/") for route in routes)


def test_party_creation_activates_party_before_active_account_commit() -> None:
    source = Path(canonical_erp_reads.__file__).read_text(encoding="utf-8")
    assert "SET status='active', updated_at=transaction_timestamp()" in source
    assert "WHERE org_id=:org_id AND id=:party_id AND status='draft'" in source
    assert "Party activation failed" in source


def test_customer_address_primary_is_scoped_by_address_kind() -> None:
    source = Path(canonical_erp_reads.__file__).read_text(encoding="utf-8")
    assert source.count("address_kind=:kind") >= 4
    assert "other.address_kind=:kind" in source


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


def test_batch_reads_project_branch_from_authoritative_stock_balance() -> None:
    source = Path(canonical_erp_reads.__file__).read_text(encoding="utf-8")

    assert source.count("COUNT(DISTINCT balance.branch_id)=1") == 1
    assert "JOIN inventory.stock_balances balance" in source
    assert "balance.on_hand_quantity>0" in source
    assert "location.allows_sale" in source
    assert "COUNT(DISTINCT location.branch_id)=1" not in source


def test_product_and_batch_reads_project_effective_canonical_gst_rate() -> None:
    source = Path(canonical_erp_reads.__file__).read_text(encoding="utf-8")

    assert source.count("FROM tax.tax_code_versions") >= 4
    assert "tax_version.taxability='taxable'" in source
    assert "tax_version.taxability IS NULL THEN NULL" in source
    assert "tax_version.igst_rate" in source


def test_company_profile_projects_canonical_invoice_identity_and_settlement_details() -> None:
    source = Path(canonical_erp_reads.__file__).read_text(encoding="utf-8")

    assert "organization.legal_name" in source
    assert "registration.gstin AS gst_number" in source
    assert "COALESCE(license.licenses, '[]'::jsonb) AS licenses" in source
    assert "COALESCE(bank.accounts, '[]'::jsonb) AS bank_accounts" in source
    assert "FROM compliance.licenses" in source
    assert "FROM finance.bank_accounts" in source


def test_hsn_report_projects_complete_numeric_contract_for_selected_period() -> None:
    source = Path(canonical_erp_reads.__file__).read_text(encoding="utf-8")

    assert "AS tax_amount" in source
    assert "AS tax_rate" in source
    assert ":date_from IS NULL OR invoice.invoice_date" in source
    assert ":date_to IS NULL OR invoice.invoice_date" in source


def test_current_stock_projects_one_canonical_row_per_product() -> None:
    source = Path(canonical_erp_reads.__file__).read_text(encoding="utf-8")

    assert "SUM(balance.on_hand_quantity) AS total_quantity_available" in source
    assert "SUM(balance.inventory_value) AS total_value" in source
    assert "GROUP BY balance.product_id" in source


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

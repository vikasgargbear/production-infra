from fastapi import APIRouter
from fastapi.routing import APIRoute

from app.core.read_only_router import (
    include_explicit_safe_post_utilities,
    include_legacy_read_only_router,
)
from app.main import api


MUTATION_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
LEGACY_PREFIXES = (
    "/api/sales-orders", "/api/invoices", "/api/challan", "/api/conversions",
    "/api/sale-returns", "/api/purchase-returns", "/api/purchases",
    "/api/supplier-invoices", "/api/grn", "/api/inventory",
    "/api/stock-adjustments", "/api/stock-movements", "/api/stock-writeoff",
    "/api/payments", "/api/payment-allocation", "/api/journal-entries",
    "/api/tax-entries", "/api/credit-debit-notes", "/api/expense-claims",
    "/api/gst", "/api/compliance",
    "/api/documents",
    "/api/collection-center", "/api/settings",
    "/api/branches", "/api/departments", "/api/employees", "/api/bank-accounts",
)
SAFE_POSTS = {
    "/api/purchase-upload/parse-invoice-safe",
    "/api/purchase-upload/validate-invoice",
    "/api/tax-entries/calculate",
    "/api/gst/calculate",
}
CANONICAL_MASTER_WRITES = {
    ("POST", "/api/products/"): "create_product_draft",
    ("PUT", "/api/products/{product_id}"): "update_product_draft",
    ("DELETE", "/api/products/{product_id}"): "delete_product_draft",
    ("POST", "/api/customers/"): "create_customer",
    ("POST", "/api/suppliers/"): "create_supplier",
    ("POST", "/api/customers/{customer_id:uuid}/addresses/"): "create_customer_address",
    ("PUT", "/api/customers/{customer_id:uuid}/addresses/{address_id:uuid}"): "update_customer_address",
}
CANONICAL_MASTER_PREFIXES = (
    "/api/products", "/api/customers", "/api/suppliers",
)
ALLOWED_EFFECTIVE_MUTATIONS = {
    ("POST", "/api/auth/logout"),
    ("POST", "/api/auth/oauth/supabase/session"),
    ("POST", "/api/internal/mcp/agent-grants/authorize"),
    ("POST", "/api/internal/mcp/agent-grants/authorize-action"),
    ("POST", "/api/internal/mcp/actions/{command_type}/prepare"),
    ("POST", "/api/internal/mcp/commands/{command_request_id}/approve"),
    ("POST", "/api/internal/mcp/commands/{command_request_id}/execute"),
    ("POST", "/api/web/actions/{command_type}/prepare"),
    ("POST", "/api/web/actions/commands/{command_request_id}/approve"),
    ("POST", "/api/web/actions/commands/{command_request_id}/execute"),
    ("POST", "/api/internal/tax-provider/requests:fetch"),
    ("POST", "/api/internal/tax-provider/completions"),
    *CANONICAL_MASTER_WRITES,
    *(("POST", path) for path in SAFE_POSTS),
    ("POST", "/api/company/qr-code"),
    ("DELETE", "/api/company/logo"),
    ("POST", "/api/company/logo"),
    ("PUT", "/api/company/settings"),
    ("PUT", "/api/company/info"),
    ("POST", "/api/calculations/invoice"),
    ("POST", "/api/calculations/sales-order"),
    ("POST", "/api/calculations/purchase-order"),
    ("POST", "/api/calculations/challan"),
    ("POST", "/api/calculations/return"),
    ("POST", "/api/calculations/note"),
}


def _routes():
    return [route for route in api.routes if isinstance(route, APIRoute)]


def test_read_only_helper_drops_legacy_mutations_and_non_http_routes():
    source = APIRouter()

    @source.get("/records")
    def records():
        return []

    @source.post("/records")
    def create_record():
        return {}

    parent = APIRouter(prefix="/api")
    include_legacy_read_only_router(parent, source, prefix="/legacy")

    mounted = {(route.path, frozenset(route.methods or ())) for route in parent.routes}
    assert mounted == {("/api/legacy/records", frozenset({"GET"}))}


def test_safe_post_utility_allowlist_is_exact_and_fails_on_drift():
    source = APIRouter()

    @source.post("/parse")
    def parse():
        return {}

    parent = APIRouter(prefix="/api")
    include_explicit_safe_post_utilities(parent, source, paths={"/parse"})
    assert [(route.path, route.methods) for route in parent.routes] == [
        ("/api/parse", {"POST"})
    ]

    missing = APIRouter()
    try:
        include_explicit_safe_post_utilities(missing, source, paths={"/renamed"})
    except RuntimeError as exc:
        assert "missing=['/renamed']" in str(exc)
    else:
        raise AssertionError("a missing safe utility path must fail startup")


def test_no_legacy_core_mutation_is_mounted():
    leaked = []
    for route in _routes():
        methods = set(route.methods or ()) & MUTATION_METHODS
        if not methods or route.path in SAFE_POSTS:
            continue
        if route.path.startswith(LEGACY_PREFIXES):
            leaked.append((route.path, sorted(methods), route.name))
    assert leaked == []


def test_every_effective_mutation_has_an_explicit_reviewed_owner():
    mounted = {
        (method, route.path)
        for route in _routes()
        for method in set(route.methods or ()) & MUTATION_METHODS
    }
    assert mounted == ALLOWED_EFFECTIVE_MUTATIONS

    company_routes = [
        route for route in _routes()
        if route.path.startswith("/api/company/")
        and set(route.methods or ()) & MUTATION_METHODS
    ]
    assert company_routes
    assert all(route.endpoint.__module__ == "app.api.routes.org.company_assets" for route in company_routes)
    assert all(route.endpoint.__name__ == "reject_company_mutation" for route in company_routes)


def test_collection_and_settings_reads_remain_available():
    reads = {
        route.path for route in _routes() if "GET" in (route.methods or set())
    }
    assert {
        "/api/collection-center/collection/aging-data",
        "/api/collection-center/collection/hub-stats",
        "/api/settings/features",
        "/api/settings/business/all",
        "/api/settings/business/billing",
        "/api/settings/business/inventory",
        "/api/settings/business/compliance",
    } <= reads


def test_bounded_master_writes_have_exactly_one_canonical_owner():
    routes = _routes()
    for (method, path), endpoint_name in CANONICAL_MASTER_WRITES.items():
        matches = [
            route for route in routes
            if route.path == path and method in (route.methods or set())
        ]
        assert len(matches) == 1, (method, path, [(route.name, route.endpoint.__module__) for route in matches])
        route = matches[0]
        assert route.endpoint.__module__ == "app.api.routes.canonical_erp_reads"
        assert route.endpoint.__name__ == endpoint_name


def test_no_additional_legacy_master_mutation_is_reachable():
    mounted = {
        (method, route.path): (route.name, route.endpoint.__module__)
        for route in _routes()
        if route.path.startswith(CANONICAL_MASTER_PREFIXES)
        for method in set(route.methods or ()) & MUTATION_METHODS
    }
    assert set(mounted) == set(CANONICAL_MASTER_WRITES)
    assert all(
        module == "app.api.routes.canonical_erp_reads"
        for _name, module in mounted.values()
    )


def test_only_explicit_side_effect_free_post_utilities_survive_the_fence():
    mounted = {
        route.path
        for route in _routes()
        if "POST" in (route.methods or set()) and (
            route.path.startswith("/api/purchase-upload")
            or route.path.startswith("/api/tax-entries")
            or route.path.startswith("/api/gst")
        )
    }
    assert mounted == SAFE_POSTS
    assert "/api/purchase-upload/create-from-parsed" not in mounted


def test_canonical_command_and_calculation_posts_remain_mounted():
    posts = {
        route.path for route in _routes() if "POST" in (route.methods or set())
    }
    assert {
        "/api/web/actions/{command_type}/prepare",
        "/api/web/actions/commands/{command_request_id}/approve",
        "/api/web/actions/commands/{command_request_id}/execute",
        "/api/calculations/invoice",
        "/api/calculations/purchase-order",
        "/api/calculations/return",
    } <= posts
    assert "/api/documents/generate-number" not in posts

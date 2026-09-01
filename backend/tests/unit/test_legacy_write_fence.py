import ast
import importlib
import inspect
import json
import os
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

from fastapi import APIRouter
from fastapi.routing import APIRoute

from app.core.read_only_router import (
    include_explicit_non_persistent_post_utilities,
    include_legacy_read_only_router,
)


def _effective_route_leaves(routes):
    """Flatten FastAPI 0.137+ lazy include wrappers and older flat routers."""

    for route in routes:
        effective_contexts = getattr(route, "effective_route_contexts", None)
        if callable(effective_contexts):
            yield from effective_contexts()
        else:
            yield route


def _load_effective_app_routes():
    """Audit a true first import, independent of pytest's module graph."""

    marker = "__ERP_ROUTE_GRAPH__="
    probe = f"""
import json
from app.main import app
rows = []
def route_leaves(routes):
    for route in routes:
        effective_contexts = getattr(route, 'effective_route_contexts', None)
        if callable(effective_contexts):
            yield from effective_contexts()
        else:
            yield route
for route in route_leaves(app.routes):
    endpoint = getattr(route, 'endpoint', None)
    methods = sorted(getattr(route, 'methods', None) or ())
    # Restrict the probe to the public API contract.  Do not key this audit to
    # FastAPI's private APIRoute internals: the attribute layout changed in
    # 0.141 even though the mounted HTTP contract did not.
    if endpoint is None or not methods or not route.path.startswith('/api'):
        continue
    rows.append({{
        'path': route.path,
        'methods': methods,
        'name': route.name,
        'endpoint_module': endpoint.__module__,
        'endpoint_name': endpoint.__name__,
    }})
print({marker!r} + json.dumps(rows, sort_keys=True))
"""
    backend_root = Path(__file__).resolve().parents[2]
    probe_environment = os.environ.copy()
    probe_environment["PYTHONPATH"] = os.pathsep.join(
        filter(
            None,
            (str(backend_root), probe_environment.get("PYTHONPATH", "")),
        )
    )
    completed = subprocess.run(
        [sys.executable, "-c", probe],
        check=True,
        capture_output=True,
        text=True,
        cwd=backend_root.parent,
        env=probe_environment,
    )
    if marker not in completed.stdout:
        raise AssertionError(
            "isolated production route probe returned no route graph: "
            + completed.stderr[-1000:]
        )
    rows = json.loads(completed.stdout.rsplit(marker, 1)[1].strip())
    routes = []
    for row in rows:
        endpoint_module = importlib.import_module(row["endpoint_module"])
        endpoint = getattr(endpoint_module, row["endpoint_name"])
        routes.append(
            SimpleNamespace(
                path=row["path"],
                methods=set(row["methods"]),
                name=row["name"],
                endpoint=endpoint,
            )
        )
    return tuple(routes)


_EFFECTIVE_APP_ROUTES = _load_effective_app_routes()


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
}
CALCULATION_POSTS = {
    "/api/calculations/invoice": "preview_invoice_totals",
    "/api/calculations/sales-order": "preview_sales_order_totals",
}
NON_PERSISTENT_POST_OWNERS = {
    "/api/purchase-upload/parse-invoice-safe": (
        "app.api.routes.purchase.upload.routes", "parse_purchase_invoice_safe"
    ),
    **{
        path: ("app.api.routes.calculations", endpoint)
        for path, endpoint in CALCULATION_POSTS.items()
    },
}
CANONICAL_MASTER_WRITES = {
    ("POST", "/api/products/setup-options/categories"): "create_product_category",
    ("POST", "/api/products/setup-options/manufacturers"): "create_product_manufacturer",
    ("POST", "/api/products/"): "create_product_draft",
    ("PUT", "/api/products/{product_id}"): "update_product_draft",
    ("DELETE", "/api/products/{product_id}"): "delete_product_draft",
    ("PUT", "/api/products/{product_id}/setup"): "configure_product_setup",
    ("POST", "/api/products/{product_id}/activate"): "activate_product_setup",
    ("POST", "/api/customers/"): "create_customer",
    ("POST", "/api/suppliers/"): "create_supplier",
    ("PATCH", "/api/customers/{customer_id:uuid}"): "update_customer",
    ("PATCH", "/api/suppliers/{supplier_id:uuid}"): "update_supplier",
    ("POST", "/api/customers/{customer_id:uuid}/addresses/"): "create_customer_address",
    ("PUT", "/api/customers/{customer_id:uuid}/addresses/{address_id:uuid}"): "update_customer_address",
}
CANONICAL_MASTER_PREFIXES = (
    "/api/products", "/api/customers", "/api/suppliers",
)
AUTHENTICATED_ONBOARDING_WRITES = {
    ("POST", "/api/auth/onboarding/organizations"): "create_organization",
    ("POST", "/api/auth/onboarding/invitations/accept"): "accept_invitation",
    ("POST", "/api/auth/onboarding/invitations"): "create_invitation",
}
CANONICAL_INVOICE_DRAFT_WRITES = {
    ("POST", "/api/canonical/invoice-drafts"),
    ("PATCH", "/api/canonical/invoice-drafts/{draft_id}"),
    ("POST", "/api/canonical/invoice-drafts/{draft_id}/abandon"),
    ("POST", "/api/canonical/invoice-drafts/{draft_id}/prepare"),
    ("POST", "/api/internal/mcp/invoice-drafts"),
    ("PATCH", "/api/internal/mcp/invoice-drafts/{draft_id}"),
    ("POST", "/api/internal/mcp/invoice-drafts/{draft_id}/abandon"),
    ("POST", "/api/internal/mcp/invoice-drafts/{draft_id}/prepare"),
}
ALLOWED_EFFECTIVE_MUTATIONS = {
    ("POST", "/api/auth/logout"),
    ("POST", "/api/auth/oauth/supabase/session"),
    ("POST", "/api/internal/mcp/agent-grants/authorize"),
    ("POST", "/api/internal/mcp/agent-grants/authorize-action"),
    ("POST", "/api/internal/mcp/master/products"),
    ("POST", "/api/internal/mcp/master/products/activate"),
    ("POST", "/api/internal/mcp/master/products/setup"),
    ("POST", "/api/internal/mcp/master/product-categories"),
    ("POST", "/api/internal/mcp/master/product-manufacturers"),
    ("POST", "/api/internal/mcp/master/customers"),
    ("POST", "/api/internal/mcp/master/customers/update"),
    ("POST", "/api/internal/mcp/master/suppliers"),
    ("POST", "/api/internal/mcp/master/suppliers/update"),
    ("POST", "/api/internal/mcp/master/drug-licenses"),
    ("POST", "/api/internal/mcp/actions/{command_type}/prepare"),
    ("POST", "/api/internal/mcp/commands/{command_request_id}/approve"),
    ("POST", "/api/internal/mcp/commands/{command_request_id}/execute"),
    ("POST", "/api/web/actions/{command_type}/prepare"),
    ("POST", "/api/web/actions/commands/{command_request_id}/approve"),
    ("POST", "/api/web/actions/commands/{command_request_id}/execute"),
    ("POST", "/api/web/evidence/expense-receipts"),
    ("POST", "/api/web/evidence/customer-receipts"),
    ("POST", "/api/canonical/compliance/drug-licenses/evidence"),
    ("POST", "/api/canonical/compliance/drug-licenses"),
    ("POST", "/api/canonical/company/gst-registration"),
    ("POST", "/api/canonical/migration-history/facts"),
    ("POST", "/api/canonical/migration-history/operational-cutover"),
    ("POST", "/api/canonical/migration-history/product-inventory-cutover"),
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
    *AUTHENTICATED_ONBOARDING_WRITES,
    *CANONICAL_INVOICE_DRAFT_WRITES,
}


def _routes():
    # Snapshot the production application at test-module import. CORS tests
    # intentionally reload app.main later in the same pytest process; that
    # must not replace the exact route graph this write fence is auditing.
    return list(_EFFECTIVE_APP_ROUTES)


def _direct_durable_side_effects(route: APIRoute):
    """Return direct writes in a handler; called services have focused tests."""

    tree = ast.parse(inspect.getsource(route.endpoint))
    findings = []
    forbidden_calls = {
        "add", "commit", "delete", "flush", "mkdir", "patch", "post",
        "publish", "put", "send", "touch", "write_bytes", "write_text",
    }
    forbidden_sql = (
        "INSERT INTO", "UPDATE ", "DELETE FROM", "UPSERT ",
        "CREATE TABLE", "ALTER TABLE", "DROP TABLE",
    )
    function = next(
        node for node in tree.body
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef))
    )
    body_nodes = (
        node for statement in function.body for node in ast.walk(statement)
    )
    for node in body_nodes:
        if isinstance(node, ast.Call):
            called = node.func.attr if isinstance(node.func, ast.Attribute) else (
                node.func.id if isinstance(node.func, ast.Name) else ""
            )
            if called in forbidden_calls or called.startswith("send_"):
                findings.append((node.lineno, called))
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            upper = node.value.upper()
            for token in forbidden_sql:
                if token in upper:
                    findings.append((node.lineno, token.strip()))
                    break
    return findings


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

    mounted = {
        (route.path, frozenset(route.methods or ()))
        for route in _effective_route_leaves(parent.routes)
    }
    assert mounted == {("/api/legacy/records", frozenset({"GET"}))}


def test_non_persistent_post_allowlist_is_exact_and_owner_pinned():
    source = APIRouter()

    @source.post("/parse")
    def parse():
        return {}

    parent = APIRouter(prefix="/api")
    include_explicit_non_persistent_post_utilities(
        parent, source, routes={"/parse": parse}
    )
    assert [
        (route.path, route.methods)
        for route in _effective_route_leaves(parent.routes)
    ] == [
        ("/api/parse", {"POST"})
    ]

    missing = APIRouter()
    try:
        include_explicit_non_persistent_post_utilities(
            missing, source, routes={"/renamed": parse}
        )
    except RuntimeError as exc:
        assert "missing=['/renamed']" in str(exc)
    else:
        raise AssertionError("a missing safe utility path must fail startup")

    impostor_source = APIRouter()

    @impostor_source.post("/parse")
    def impostor():
        return {}

    try:
        include_explicit_non_persistent_post_utilities(
            APIRouter(), impostor_source, routes={"/parse": parse}
        )
    except RuntimeError as exc:
        assert "endpoint owner mismatch" in str(exc)
    else:
        raise AssertionError("a different handler at a safe path must fail startup")


def test_no_legacy_core_mutation_is_mounted():
    leaked = []
    for route in _routes():
        methods = set(route.methods or ()) & MUTATION_METHODS
        if not methods or route.path in SAFE_POSTS:
            continue
        if route.path.startswith(LEGACY_PREFIXES):
            leaked.append((route.path, sorted(methods), route.name))
    assert leaked == []


def test_mounted_legacy_safe_method_handlers_have_no_direct_durable_effects():
    audited = []
    findings = []
    for route in _routes():
        if not set(route.methods or ()) & {"GET", "HEAD", "OPTIONS"}:
            continue
        if not route.path.startswith(LEGACY_PREFIXES):
            continue
        audited.append((route.path, route.name))
        effects = _direct_durable_side_effects(route)
        if effects:
            findings.append((route.path, route.name, effects))
    assert audited
    assert findings == []


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


def test_onboarding_writes_have_exact_reviewed_owners_and_bearer_security():
    routes = _routes()
    schema = importlib.import_module("app.main").app.openapi()
    mounted_onboarding = {
        (method, route.path): route
        for route in routes
        if route.path.startswith("/api/auth/onboarding")
        for method in set(route.methods or ()) & MUTATION_METHODS
    }

    assert set(mounted_onboarding) == set(AUTHENTICATED_ONBOARDING_WRITES)
    for route_key, endpoint_name in AUTHENTICATED_ONBOARDING_WRITES.items():
        method, path = route_key
        route = mounted_onboarding[route_key]
        assert route.endpoint.__module__ == "app.api.routes.auth.onboarding"
        assert route.endpoint.__name__ == endpoint_name
        assert schema["paths"][path][method.lower()]["security"] == [
            {"HTTPBearer": []}
        ]


def test_only_canonical_collection_aging_and_feature_reads_remain_available():
    reads = {
        route.path for route in _routes() if "GET" in (route.methods or set())
    }
    assert {
        "/api/collection-center/collection/aging-data",
        "/api/settings/features",
    } <= reads
    assert "/api/collection-center/collection/hub-stats" not in reads


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


def test_non_persistent_post_handlers_have_exact_reviewed_owners():
    mounted = {
        route.path: route
        for route in _routes()
        if "POST" in (route.methods or set())
        and route.path in NON_PERSISTENT_POST_OWNERS
    }
    assert set(mounted) == set(NON_PERSISTENT_POST_OWNERS)
    for path, (module, endpoint) in NON_PERSISTENT_POST_OWNERS.items():
        route = mounted[path]
        assert (route.endpoint.__module__, route.endpoint.__name__) == (module, endpoint)
        # The PDF parser's bounded tempfile is an explicit scratch exception;
        # upload security tests prove it is removed in a finally block.
        effects = _direct_durable_side_effects(route)
        assert effects == [], (path, effects)


def test_canonical_command_and_calculation_posts_remain_mounted():
    posts = {
        route.path for route in _routes() if "POST" in (route.methods or set())
    }
    assert {
        "/api/web/actions/{command_type}/prepare",
        "/api/web/actions/commands/{command_request_id}/approve",
        "/api/web/actions/commands/{command_request_id}/execute",
        "/api/web/evidence/expense-receipts",
        "/api/web/evidence/customer-receipts",
        "/api/calculations/invoice",
        "/api/calculations/sales-order",
    } <= posts
    assert "/api/documents/generate-number" not in posts


def test_canonical_evidence_uploads_have_one_reviewed_owner_each():
    expected = {
        "/api/web/evidence/expense-receipts": "upload_expense_receipt",
        "/api/web/evidence/customer-receipts": "upload_customer_receipt",
    }
    for path, endpoint_name in expected.items():
        matches = [
            route for route in _routes()
            if route.path == path and "POST" in (route.methods or set())
        ]
        assert len(matches) == 1
        assert matches[0].endpoint.__module__ == "app.api.routes.canonical_evidence_uploads"
        assert matches[0].endpoint.__name__ == endpoint_name

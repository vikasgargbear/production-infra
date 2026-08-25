"""Route-graph proof for the reachable purchase-upload application boundary."""

from __future__ import annotations

import ast
import inspect
import re
import textwrap
from pathlib import Path

from fastapi.routing import APIRoute

from app.api.routes.purchase.upload.routes import _mark_supplier_match_not_performed
from app.main import app


ROOT = Path(__file__).resolve().parents[3]
PURCHASE_UPLOAD_PREFIX = "/api/purchase-upload"
SQL_TOKEN = re.compile(
    r"\b(?:SELECT|INSERT|UPDATE|DELETE|MERGE)\b\s+.+\b(?:FROM|INTO|SET|USING)\b",
    re.IGNORECASE | re.DOTALL,
)


def _mounted_purchase_upload_routes() -> list[APIRoute]:
    return [
        route
        for route in app.routes
        if isinstance(route, APIRoute) and route.path.startswith(PURCHASE_UPLOAD_PREFIX)
    ]


def test_route_graph_exposes_only_the_parse_only_upload_utility() -> None:
    routes = _mounted_purchase_upload_routes()
    assert [
        (route.path, set(route.methods or ()), route.endpoint.__module__, route.endpoint.__name__)
        for route in routes
    ] == [(
        "/api/purchase-upload/parse-invoice-safe",
        {"POST"},
        "app.api.routes.purchase.upload.routes",
        "parse_purchase_invoice_safe",
    )]

    paths = app.openapi()["paths"]
    assert "/api/purchase-upload/validate-invoice" not in paths
    assert "/api/purchase-upload/check-supplier" not in paths
    assert "/api/purchase-upload/parse-history" not in paths


def test_reachable_upload_handler_has_no_database_or_sql_dependency() -> None:
    """Inspect only handlers selected by the effective application route graph."""

    routes = _mounted_purchase_upload_routes()
    assert routes
    for route in routes:
        endpoint_source = textwrap.dedent(inspect.getsource(inspect.unwrap(route.endpoint)))
        endpoint_tree = ast.parse(endpoint_source)
        durable_calls = {
            node.func.attr
            for node in ast.walk(endpoint_tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in {"add", "commit", "delete", "execute", "flush", "rollback"}
        }
        sql_literals = [
            node.value
            for node in ast.walk(endpoint_tree)
            if isinstance(node, ast.Constant)
            and isinstance(node.value, str)
            and SQL_TOKEN.search(node.value)
        ]
        assert durable_calls == set()
        assert sql_literals == []

        endpoint_module = inspect.getmodule(route.endpoint)
        assert endpoint_module is not None
        module_file = inspect.getsourcefile(endpoint_module)
        assert module_file is not None
        module_source = Path(module_file).read_text(encoding="utf-8")
        module_tree = ast.parse(module_source)
        module_database_calls = {
            node.func.attr
            for node in ast.walk(module_tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in {"add", "commit", "delete", "execute", "flush", "rollback"}
        }
        module_sql_literals = [
            node.value
            for node in ast.walk(module_tree)
            if isinstance(node, ast.Constant)
            and isinstance(node.value, str)
            and SQL_TOKEN.search(node.value)
        ]
        assert module_database_calls == set()
        assert module_sql_literals == []
        assert "UploadService" not in module_source
        assert "services.purchase.upload" not in module_source
        assert "parties.suppliers" not in module_source
        assert "procurement.supplier_invoices" not in module_source

    assert not (ROOT / "backend/app/api/services/purchase/upload/service.py").exists()


def test_parse_result_cannot_claim_a_supplier_identity_match() -> None:
    result = _mark_supplier_match_not_performed({
        "success": True,
        "extracted_data": {
            "supplier_name": "Candidate text",
            "supplier_id": "retired-identity",
            "supplier_exists": True,
            "supplier_match_type": "guess",
            "existing_supplier": {"supplier_id": "retired-identity"},
        },
    })

    assert result == {
        "success": True,
        "extracted_data": {
            "supplier_name": "Candidate text",
            "supplier_match_status": "not_performed",
        },
    }

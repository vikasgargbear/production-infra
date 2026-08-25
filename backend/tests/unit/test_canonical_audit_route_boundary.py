"""Mounted-route proof for the canonical audit/application boundary.

Source files retained for migration archaeology are intentionally irrelevant
to these checks.  The assertions inspect FastAPI's effective production route
graph, then inspect only the handler that owns the reachable logout path.
"""

import ast
import inspect

from app.main import app


def _effective_routes():
    for route in app.routes:
        contexts = getattr(route, "effective_route_contexts", None)
        if callable(contexts):
            yield from contexts()
        else:
            yield route


def _api_routes():
    return [
        route
        for route in _effective_routes()
        if getattr(route, "endpoint", None) is not None
        and getattr(route, "path", "").startswith("/api")
    ]


def test_retired_activity_log_routes_are_absent_from_effective_route_graph():
    paths = {route.path for route in _api_routes()}

    assert not any(
        path == "/api/audit-logs" or path.startswith("/api/audit-logs/")
        for path in paths
    )
    assert not any(
        path == "/api/audit-logs" or path.startswith("/api/audit-logs/")
        for path in app.openapi()["paths"]
    )


def test_logout_has_one_reviewed_owner_and_no_database_dependency():
    matches = [
        route
        for route in _api_routes()
        if route.path == "/api/auth/logout"
        and "POST" in (route.methods or set())
    ]

    assert len(matches) == 1
    route = matches[0]
    assert route.endpoint.__module__ == "app.api.routes.auth.enterprise"
    assert route.endpoint.__name__ == "logout"
    assert not any(
        getattr(dependency.call, "__name__", "") == "get_db"
        for dependency in route.dependant.dependencies
    )


def test_reachable_logout_handler_has_no_sql_or_audit_fallback():
    route = next(
        route
        for route in _api_routes()
        if route.path == "/api/auth/logout"
        and "POST" in (route.methods or set())
    )
    source = inspect.getsource(route.endpoint)
    tree = ast.parse(source)
    function = next(
        node
        for node in tree.body
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef))
    )
    executable_nodes = [
        node
        for statement in function.body
        if not (
            isinstance(statement, ast.Expr)
            and isinstance(statement.value, ast.Constant)
            and isinstance(statement.value.value, str)
        )
        for node in ast.walk(statement)
    ]
    called_attributes = {
        node.func.attr
        for node in executable_nodes
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
    }
    string_literals = "\n".join(
        node.value
        for node in executable_nodes
        if isinstance(node, ast.Constant) and isinstance(node.value, str)
    ).lower()

    assert called_attributes.isdisjoint({"execute", "commit", "rollback"})
    for retired_or_unowned_dependency in (
        "system_config.audit_logs",
        "master.org_users",
        "core.audit_events",
        "core.outbox_events",
        "insert into",
    ):
        assert retired_or_unowned_dependency not in string_literals

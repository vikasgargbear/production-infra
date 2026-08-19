"""Fail closed when an API operation lacks declared bearer authentication."""

from app.main import app


PUBLIC_OPERATIONS = {
    ("GET", "/"),
    ("GET", "/health"),
    ("POST", "/api/auth/logout"),
    ("GET", "/api/auth/oauth/providers"),
    ("GET", "/api/auth/oauth/status"),
}


def test_openapi_has_only_reviewed_public_operations():
    unauthenticated = set()
    for path, path_item in app.openapi()["paths"].items():
        for method, operation in path_item.items():
            if method.upper() not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
                continue
            if not operation.get("security"):
                unauthenticated.add((method.upper(), path))

    assert unauthenticated == PUBLIC_OPERATIONS


def test_debug_and_connectivity_routes_are_not_published():
    paths = app.openapi()["paths"]

    assert "/api/test-connection" not in paths
    assert not any("/test/" in path or path.startswith("/api/test") for path in paths)
    assert "/api/company/test-save" not in paths

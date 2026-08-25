"""Reconcile retired frontend clients with the mounted FastAPI route graph."""

from pathlib import Path

from fastapi.routing import APIRoute

from app.main import app


ROOT = Path(__file__).resolve().parents[3]
INVENTORY = ROOT / "docs/architecture/legacy-surface-inventory.yaml"


RETIRED_CLIENT_ROUTES = {
    "frontend.expenses_api": {
        "/api/expense-claims",
        "/api/expense-claims/{claim_id}",
        "/api/expense-claims/expense-types",
    },
    "loyalty.route_contract": {
        "/api/loyalty",
        "/api/loyalty-points",
    },
}

RETIRED_ROUTE_PREFIXES = {
    "/api/expense-claims",
    "/api/loyalty",
    "/api/loyalty-points",
}


def _mounted_http_paths() -> set[str]:
    return {
        route.path
        for route in app.routes
        if isinstance(route, APIRoute) and route.methods
    }


def test_retired_client_routes_are_absent_from_the_mounted_application() -> None:
    mounted = _mounted_http_paths()

    for retired_paths in RETIRED_CLIENT_ROUTES.values():
        assert mounted.isdisjoint(retired_paths)
    assert not {
        path
        for path in mounted
        if any(path.startswith(prefix) for prefix in RETIRED_ROUTE_PREFIXES)
    }


def test_route_client_inventory_names_each_runtime_verified_retirement() -> None:
    inventory = INVENTORY.read_text(encoding="utf-8")

    for client_id, retired_paths in RETIRED_CLIENT_ROUTES.items():
        assert inventory.count(f"  - id: {client_id}\n") == 1
        for path in retired_paths:
            assert f"      - {path}\n" in inventory

    assert not (ROOT / "frontend/src/services/api/modules/finance/expenses.api.ts").exists()
    assert not (ROOT / "frontend/src/services/api/modules/sales/loyaltyPoints.api.ts").exists()

"""Fail-closed checks for features intentionally outside the wholesale runtime."""

from pathlib import Path

from app.api.routes import canonical_erp_reads
from app.main import app


BACKEND_ROOT = Path(__file__).resolve().parents[2]


def test_deferred_routes_are_absent_from_openapi() -> None:
    paths = app.openapi()["paths"]

    assert not any(path.startswith("/api/payroll") for path in paths)
    assert not any(path.startswith("/api/loyalty") for path in paths)
    assert "post" not in paths.get("/api/compliance/compliance/audits", {})
    assert "post" not in paths.get("/api/compliance/compliance/inspector-visits", {})


def test_employee_read_remains_canonical_and_department_surface_is_retired() -> None:
    paths = app.openapi()["paths"]

    assert set(paths["/api/employees"]) == {"get"}
    assert "/api/departments/" not in paths


def test_deferred_backend_modules_cannot_be_imported_accidentally() -> None:
    deferred_paths = (
        "app/api/routes/payroll",
        "app/api/services/payroll",
        "app/api/schemas/payroll.py",
        "app/api/routes/loyalty",
        "app/api/services/loyalty",
        "app/api/schemas/loyalty",
    )

    assert [path for path in deferred_paths if (BACKEND_ROOT / path).exists()] == []


def test_deferred_document_number_types_are_absent() -> None:
    source = (BACKEND_ROOT / "app/api/services/document_number_service.py").read_text()

    assert '"payroll_run"' not in source
    assert '"salary_slip"' not in source


def test_deferred_compliance_tables_are_not_queried_by_runtime_routes() -> None:
    assert not (BACKEND_ROOT / "app/api/routes/compliance/compliance.py").exists()


def test_zero_consumer_backend_archaeology_stays_retired() -> None:
    retired_paths = (
        "app/api/routes/audit/routes.py",
        "app/api/routes/settings/business.py",
        "app/api/routes/settings/features.py",
        "app/api/services/dashboard_service.py",
        "app/api/services/email/email_service.py",
        "app/api/services/settings/settings_service.py",
    )

    assert [path for path in retired_paths if (BACKEND_ROOT / path).exists()] == []


def test_retired_audit_and_settings_routes_are_absent() -> None:
    api_routes = [
        route for route in app.routes
        if getattr(route, "endpoint", None) is not None
    ]
    paths = {route.path for route in api_routes}

    assert not any(path.startswith("/api/audit-logs") for path in paths)
    assert not any(path.startswith("/api/settings/business") for path in paths)
    settings_routes = [
        route for route in canonical_erp_reads.router.routes
        if route.path.startswith("/settings/")
    ]
    assert {
        route.path for route in settings_routes
    } == {
        "/settings/company-info",
        "/settings/features",
        "/settings/integrations",
        "/settings/system",
    }
    assert {
        route.endpoint.__module__ for route in settings_routes
    } == {"app.api.routes.canonical_erp_reads"}
    main_source = (BACKEND_ROOT / "app/main.py").read_text(encoding="utf-8")
    assert "api.include_router(canonical_erp_reads.router" in main_source

"""Fail-closed checks for features intentionally outside the wholesale runtime."""

from pathlib import Path

from app.main import app


BACKEND_ROOT = Path(__file__).resolve().parents[2]


def test_deferred_routes_are_absent_from_openapi() -> None:
    paths = app.openapi()["paths"]

    assert not any(path.startswith("/api/payroll") for path in paths)
    assert not any(path.startswith("/api/loyalty") for path in paths)
    assert "post" not in paths.get("/api/compliance/compliance/audits", {})
    assert "post" not in paths.get("/api/compliance/compliance/inspector-visits", {})


def test_employee_and_department_reads_remain_mounted_without_legacy_writes() -> None:
    paths = app.openapi()["paths"]

    assert set(paths["/api/employees"]) == {"get"}
    assert set(paths["/api/departments/"]) == {"get"}


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

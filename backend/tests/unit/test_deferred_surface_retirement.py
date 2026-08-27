"""Fail-closed checks for features intentionally outside the wholesale runtime."""

import json
from pathlib import Path

from app.api.routes import canonical_erp_reads
from app.main import app


BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPOSITORY_ROOT = BACKEND_ROOT.parent


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


def test_deferred_compliance_tables_are_not_queried_by_runtime_routes() -> None:
    assert not (BACKEND_ROOT / "app/api/routes/compliance/compliance.py").exists()


def test_zero_consumer_backend_archaeology_stays_retired() -> None:
    retired_paths = (
        "app/api/routes/audit/routes.py",
        "app/api/routes/settings/business.py",
        "app/api/routes/settings/features.py",
        "app/api/routes/finance/allocation/routes.py",
        "app/api/routes/finance/expenses/routes.py",
        "app/api/routes/finance/journal/routes.py",
        "app/api/routes/finance/payments/routes.py",
        "app/api/routes/master/bank_accounts/routes.py",
        "app/api/routes/master/branches/routes.py",
        "app/api/routes/master/departments/routes.py",
        "app/api/routes/master/employees/routes.py",
        "app/api/routes/purchase/grn.py",
        "app/api/routes/purchase/supplier_invoices/routes.py",
        "app/api/routes/reports/outstanding.py",
        "app/api/routes/sales/conversions/routes.py",
        "app/api/services/dashboard_service.py",
        "app/api/services/email/email_service.py",
        "app/api/services/document_number_service.py",
        "app/api/services/finance/allocation/service.py",
        "app/api/services/finance/expense",
        "app/api/services/finance/journal/service.py",
        "app/api/services/finance/outstanding",
        "app/api/services/finance/payment/service.py",
        "app/api/services/finance/tax",
        "app/api/services/inventory/inventory_service.py",
        "app/api/services/master/bank_account_service.py",
        "app/api/services/master/department_branch_service.py",
        "app/api/services/master/employee",
        "app/api/services/purchase/shared",
        "app/api/services/purchase/grn/grn_service.py",
        "app/api/services/purchase/grn/grn_repository.py",
        "app/api/services/purchase/supplier_invoice",
        "app/api/services/sales/challan",
        "app/api/services/sales/conversion",
        "app/api/services/sales/shared",
        "app/api/services/settings/settings_service.py",
        "app/core/idempotency.py",
        "scripts/audit/payment_idempotency_readiness.py",
        "scripts/validate_routes.py",
    )

    assert [path for path in retired_paths if (BACKEND_ROOT / path).exists()] == []


def test_retired_mutation_services_have_canonical_command_owners() -> None:
    matrix_path = (
        BACKEND_ROOT.parent
        / "docs/architecture/core-operation-authority-matrix.json"
    )
    operations = {
        operation["id"]: operation
        for operation in json.loads(matrix_path.read_text(encoding="utf-8"))["operations"]
    }
    replacements = {
        "goods_receipt",
        "customer_receipt",
        "supplier_payment",
        "supplier_advance",
        "inventory_transfer",
        "inventory_adjustment",
        "inventory_destruction",
        "bank_reconciliation",
    }

    for operation_id in replacements:
        operation = operations[operation_id]
        assert operation["operation_key"].endswith(".prepare")
        assert operation["mcp_prepare_tool"].startswith("erp_")
        assert operation["rest_readback"].startswith("/api/")
        assert operation["prepare_sql"].startswith("erp_")
        assert operation["execute_sql"]
        assert operation["authoritative_tables"]


def test_retired_numbering_and_bank_reads_have_canonical_owners() -> None:
    core_commands = (
        BACKEND_ROOT.parent
        / "database/canonical/commands_core/generate_core_commands_contract.py"
    ).read_text(encoding="utf-8")
    paths = app.openapi()["paths"]

    assert '"allocate_document_number"' in core_commands
    assert "core.idempotency_keys" in core_commands
    assert set(paths["/api/bank-accounts"]) == {"get"}


def test_legacy_live_erp_harness_stays_retired() -> None:
    legacy_root = BACKEND_ROOT / "tests/live_erp"
    implementation_audit = (
        BACKEND_ROOT / "scripts/audit/test_implementation_audit.py"
    ).read_text(encoding="utf-8")

    assert [
        path
        for path in legacy_root.rglob("*")
        if path.is_file() and "__pycache__" not in path.parts
    ] == []
    assert 'ROOT / "backend/tests/live_canonical"' in implementation_audit
    assert 'ROOT / "backend/tests/live_acceptance"' in implementation_audit
    assert 'ROOT / "backend/tests/live_erp"' not in implementation_audit

    stale_doc_references = []
    docs_root = BACKEND_ROOT.parent / "docs"
    allowed_negative_evidence = docs_root / "architecture/legacy-retirement.md"
    for path in docs_root.rglob("*.md"):
        if path == allowed_negative_evidence:
            continue
        if "tests/live_erp" in path.read_text(encoding="utf-8"):
            stale_doc_references.append(path.relative_to(BACKEND_ROOT.parent).as_posix())
    assert stale_doc_references == []


def test_stale_developer_guides_stay_retired() -> None:
    retired_guides = (
        "docs/backend/api/auth/README.md",
        "docs/backend/api/idempotency.md",
        "docs/backend/api/sdk-examples.md",
        "docs/backend/api/webhooks.md",
        "docs/backend/architecture/authentication.md",
        "docs/backend/architecture/multi-tenancy.md",
        "frontend/docs/05-api-integration/api-client-usage.md",
        "frontend/docs/05-api-integration/endpoints-reference.md",
        "frontend/docs/08-security/security-guide.md",
    )
    maintained_guides = (
        "docs/backend/api/README.md",
        "docs/backend/architecture/README.md",
        "frontend/docs/05-api-integration/README.md",
        "frontend/docs/08-security/README.md",
    )

    assert [
        path for path in retired_guides if (REPOSITORY_ROOT / path).exists()
    ] == []
    for relative_path in maintained_guides:
        source = (REPOSITORY_ROOT / relative_path).read_text(encoding="utf-8")
        assert "financial." not in source
        assert "master.org_users" not in source
        assert "system_config.audit_logs" not in source


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


def test_unreachable_legacy_sql_operators_and_docs_stay_retired() -> None:
    retired_paths = (
        "backend/scripts/repair_finance_denormalized_drift.py",
        "backend/scripts/schema_audit.py",
        "database/schema-docs/CURRENT_SCHEMA_STATE.txt",
        "database/schema-docs/README.md",
        "database/schema-docs/finance_gst_audit_queries.sql",
        "database/schema-docs/generate_schema_docs.sh",
        "database/schema-docs/validate_schemas.py",
        "docs/SECURITY_AUDIT.md",
        "docs/backend/database/finance-gst-hardening-audit.md",
    )

    assert [
        path for path in retired_paths if (REPOSITORY_ROOT / path).exists()
    ] == []

    core_sources = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (
            BACKEND_ROOT / "app/core/__init__.py",
            BACKEND_ROOT / "app/core/database.py",
            BACKEND_ROOT / "app/core/auth/jwt_auth.py",
        )
    )
    assert "set_org_context" not in core_sources
    assert "verify_user_org_access" not in core_sources
    assert "master.org_users" not in core_sources


def test_reset_only_strategy_has_no_retired_project_conversion_tools() -> None:
    retired_paths = (
        ".github/workflows/canonical-conversion-preflight.yml",
        "backend/scripts/compile_legacy_conversion_plan.py",
        "backend/scripts/sql/canonical_conversion_preflight.sql",
        "backend/tests/unit/test_canonical_conversion_preflight.py",
        "backend/tests/unit/test_legacy_conversion_plan.py",
        "database/live-conversion-preflight-evidence.json",
        "database/live-source-relation-inventory.json",
        "backend/scripts/capture_supabase_schema.py",
        "backend/scripts/sql/capture_supabase_schema.sql",
        "backend/tests/unit/test_supabase_schema_capture.py",
        "docs/operations/supabase-live-schema-capture.md",
    )

    assert [
        path for path in retired_paths if (REPOSITORY_ROOT / path).exists()
    ] == []

    production_workflow = (
        REPOSITORY_ROOT / ".github/workflows/production-readiness.yml"
    ).read_text(encoding="utf-8")
    assert "run_conversion_preflight" not in production_workflow
    assert "canonical-conversion-preflight" not in production_workflow
    assert "compile_legacy_conversion_plan" not in production_workflow
    assert "Require executable canonical constraints and RLS before reset baseline" in production_workflow

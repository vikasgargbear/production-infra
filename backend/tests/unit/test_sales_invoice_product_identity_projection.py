from __future__ import annotations

import hashlib
import importlib.util
import inspect
from pathlib import Path

from app.api.routes import canonical_erp_reads


ROOT = Path(__file__).parents[3]
SOURCE = (
    ROOT
    / "database/canonical/operations/automation/sales_invoice_product_identity.sql"
)
GENERATOR = (
    ROOT
    / "backend/scripts/generate_sales_invoice_history_product_identity_projection.py"
)
MIGRATION_SQL = (
    ROOT / "backend/alembic/sql/20260829_0056_sales_invoice_product_identity.sql"
)
REVISION = (
    ROOT
    / "backend/alembic/versions/20260829_0056_sales_invoice_product_identity.py"
)


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_projection_has_one_reviewed_source_and_hash_bound_linear_migration() -> None:
    generator = _load(GENERATOR, "sales_invoice_product_identity_generator")
    revision = _load(REVISION, "sales_invoice_product_identity_revision")
    migration = MIGRATION_SQL.read_bytes()

    assert generator.render().encode("utf-8") == migration
    assert revision.revision == "20260829_0056"
    assert revision.down_revision == "20260829_0055"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(migration).hexdigest()
    assert SOURCE.read_text(encoding="utf-8").count(
        "CREATE FUNCTION "
        "erp_automation_reads.sales_invoice_product_identity("
    ) == 1


def test_projection_is_tenant_actor_branch_hash_status_and_result_bound() -> None:
    source = SOURCE.read_text(encoding="utf-8")

    for boundary in (
        "organization_id = erp_security.current_org_id()",
        "erp_security.current_membership_id() IS NOT NULL",
        "erp_security.current_actor_is_active()",
        "erp_security.can_access_branch(request.branch_id)",
        "invoice.branch_id = request.branch_id",
        "request.request_hash = pg_catalog.sha256(request.request_bytes)",
        "request.preview_hash = pg_catalog.sha256(request.preview_bytes)",
        "request.response_hash = pg_catalog.sha256(request.response_bytes)",
        "request.capability_code = 'sales.invoice.prepare'",
        "request.operation = 'sales.invoice.post'",
        "request.status = 'succeeded'",
        "request.target_resource_type = 'sales_invoice'",
        "request.target_resource_id = sales_invoice_id",
        "request.result_resource_type = 'sales_invoice'",
        "request.result_resource_id = sales_invoice_id",
        "request.response_status = 200",
        "candidate.candidate_count = 1",
        "reference.product_reference_count = 1",
        "reference.total_reference_count = (",
        "invalid_reference.product_reference_count <> 1",
    ):
        assert boundary in source
    assert "invoice.status = 'posted'" in source
    assert "request.destination_branch_id IS NULL" in source


def test_projection_returns_only_typed_immutable_product_identity() -> None:
    source = SOURCE.read_text(encoding="utf-8")

    assert "RETURNS TABLE (\n    product_id uuid," in source
    assert "product_row_version bigint" in source
    assert "product_code text" in source
    assert "product_name text" in source
    assert "reference.product_row_version >= 1" in source
    assert "FROM sales.invoice_lines AS line" in source
    assert "JOIN catalog.products AS product" in source
    assert "product.row_version = reference.product_row_version" in source
    assert "manufacturer.legal_name AS manufacturer_name" in source
    assert "UPDATE " not in source
    assert "INSERT INTO " not in source
    assert "DELETE FROM " not in source


def test_runtime_receives_only_the_projection_not_raw_command_table_access() -> None:
    source = SOURCE.read_text(encoding="utf-8")
    route = inspect.getsource(canonical_erp_reads._canonical_invoice_detail)

    assert (
        "REVOKE ALL ON FUNCTION "
        "erp_automation_reads.sales_invoice_product_identity(uuid,uuid)"
    ) in source
    assert (
        "GRANT EXECUTE ON FUNCTION "
        "erp_automation_reads.sales_invoice_product_identity(uuid,uuid)"
    ) in source
    assert "TO erp_runtime" in source
    assert "erp_automation_reads.sales_invoice_product_identity(" in route
    assert "automation.command_requests" not in route
    assert "resolved_references" not in route
    assert "FROM catalog.products" not in route
    assert "line.tax_classification_code_snapshot" in route


def test_invoice_detail_exposes_persisted_discount_input_and_allocations() -> None:
    route = inspect.getsource(canonical_erp_reads._canonical_invoice_detail)

    for field in (
        "line.line_discount_kind",
        "line.line_discount_basis",
        "line.line_discount_value",
        "line.line_discount_amount",
        "line.line_taxable_discount_amount",
        "line.document_discount_amount",
        "line.document_taxable_discount_amount",
    ):
        assert field in route
    assert "WHEN line.line_discount_kind='percent'" in route
    assert "THEN line.line_discount_value ELSE 0 END" in route
    assert "automation.command_requests" not in route

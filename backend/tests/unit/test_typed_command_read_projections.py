from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path


ROOT = Path(__file__).parents[3]
SQL = ROOT / "backend/alembic/sql/20260826_0025_typed_command_read_projections.sql"
REVISION = (
    ROOT
    / "backend/alembic/versions/20260826_0025_typed_command_read_projections.py"
)


def _sql() -> str:
    return SQL.read_text(encoding="utf-8")


def test_projection_migration_is_hash_bound_and_linear() -> None:
    spec = importlib.util.spec_from_file_location("typed_command_projection", REVISION)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    assert module.revision == "20260826_0025"
    assert module.down_revision == "20260826_0024"
    assert module.EXPECTED_SQL_SHA256 == hashlib.sha256(SQL.read_bytes()).hexdigest()


def test_generic_command_helper_is_private_and_public_projections_are_narrow() -> None:
    sql = _sql()

    assert (
        "REVOKE ALL ON FUNCTION erp_automation_reads._command_facts(uuid,uuid) "
        "FROM PUBLIC, erp_runtime;"
    ) in sql
    assert "GRANT EXECUTE ON FUNCTION erp_automation_reads._command_facts" not in sql
    assert "request.id = command_request_id" in sql
    assert (
        "_return_command_facts(uuid,uuid,boolean) FROM PUBLIC, erp_runtime"
        in sql
    )
    for signature in (
        "requester_command_status(uuid,uuid,uuid,uuid)",
        "reviewable_command(uuid,uuid,uuid,varchar)",
        "lock_requester_command(uuid,uuid,uuid,uuid)",
        "approval_result(uuid,uuid,bytea)",
        "approval_deadline(uuid,uuid,uuid,varchar,bytea)",
        "sales_order_address_provenance(uuid,uuid,uuid)",
        "sales_invoice_address_provenance(uuid,uuid,uuid)",
        "sales_invoice_direct_issue_provenance(uuid,uuid,uuid)",
        "purchase_order_uom_provenance(uuid,uuid)",
        "supplier_invoice_portal_provenance(uuid,uuid)",
        "active_command_evidence_in_use(uuid,varchar,text,uuid)",
        "requester_return_commands(uuid)",
        "reviewable_return_commands(uuid,varchar)",
    ):
        assert f"GRANT EXECUTE ON FUNCTION erp_automation_reads.{signature}" in sql


def test_review_projection_binds_exact_reviewer_delegation_and_hashes() -> None:
    sql = _sql()

    assert "reviewer_grant.id = reviewer_grant_id" in sql
    assert "reviewer_grant.client_id = reviewer_client_id" in sql
    assert "reviewer_grant.subject_membership_id = actor_id" in sql
    assert "reviewer_grant.branch_id = request.branch_id" in sql
    assert "reviewer_grant.branch_id = request.destination_branch_id" in sql
    assert "request.request_hash = pg_catalog.sha256(request.request_bytes)" in sql
    assert "request.preview_hash = pg_catalog.sha256(request.preview_bytes)" in sql
    assert "FOR SHARE OF request" in sql


def test_payload_parsing_is_confined_to_typed_projection_boundary() -> None:
    converted = (
        "backend/app/api/routes/canonical_purchase_order_reads.py",
        "backend/app/api/routes/canonical_supplier_invoice_reads.py",
        "backend/app/api/routes/canonical_sales_chain_reads.py",
        "backend/app/api/routes/internal/mcp_canonical_resolution_reads.py",
    )
    for relative_path in converted:
        source = (ROOT / relative_path).read_text(encoding="utf-8")
        assert "command.request_bytes" not in source
        assert "request.request_bytes" not in source

    sql = _sql()
    assert "sales_invoice_direct_issue_provenance" in sql
    assert "purchase_order_uom_provenance" in sql
    assert "supplier_invoice_portal_provenance" in sql
    assert "active_command_evidence_in_use" in sql


def test_direct_issue_provenance_requires_exact_command_line_and_allocation() -> None:
    sql = _sql()

    assert "count(*) OVER () AS command_count" in sql
    assert "PARTITION BY command.id, line.value->>'line_id'" in sql
    assert "AS request_line_count" in sql
    assert (
        "PARTITION BY invoice_line_id, inventory_document_line_id, batch_id"
        in sql
    )
    assert "command_count = 1" in sql
    assert "request_line_count = 1" in sql
    assert "payload_count = 1" in sql


def test_address_row_version_casts_are_bounded_before_bigint_conversion() -> None:
    sql = _sql()

    assert sql.count(
        "delivery_address_row_version' ~ '^[1-9][0-9]{0,18}$'"
    ) == 2
    assert "delivery_address_row_version' ~ '^[1-9][0-9]*$'" not in sql

from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
MIGRATION_SQL = (
    ROOT / "backend/alembic/sql/20260827_0031_canonical_write_function_boundary.sql"
)
MIGRATION_REVISION = (
    ROOT
    / "backend/alembic/versions/20260827_0031_canonical_write_function_boundary.py"
)
GENERATOR = ROOT / "backend/scripts/generate_canonical_write_boundary_migration.py"
ROUTE_SOURCES = (
    ROOT / "backend/app/api/routes/canonical_erp_reads.py",
    ROOT / "backend/app/api/routes/canonical_evidence_uploads.py",
)
REVIEWED_SOURCES = (
    ROOT / "database/canonical/operations/master/product_draft_commands.sql",
    ROOT / "database/canonical/operations/master/customer_address_commands.sql",
    ROOT / "database/canonical/operations/evidence/attachment_commands.sql",
)


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_reviewed_sources_generate_one_hash_bound_linear_migration() -> None:
    generator = _load(GENERATOR, "canonical_write_boundary_generator")
    revision = _load(MIGRATION_REVISION, "canonical_write_boundary_revision")
    migration_bytes = MIGRATION_SQL.read_bytes()

    assert generator.render().encode("utf-8") == migration_bytes
    assert revision.revision == "20260827_0031"
    assert revision.down_revision == "20260827_0030"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(migration_bytes).hexdigest()


def test_each_write_function_has_one_reviewed_source_owner() -> None:
    source = "\n".join(path.read_text(encoding="utf-8") for path in REVIEWED_SOURCES)
    functions = (
        "erp_master_commands.update_product_draft",
        "erp_master_commands.delete_product_draft",
        "erp_master_commands.create_party_address",
        "erp_master_commands.update_party_address",
        "erp_core_commands.initiate_expense_receipt_attachment",
        "erp_core_commands.transition_expense_receipt_attachment",
    )

    for function in functions:
        assert source.count(f"CREATE FUNCTION {function}(") == 1
    assert "SECURITY DEFINER" in source
    assert "SET search_path=''" in source
    assert "erp_core_commands.assert_context" in source


def test_runtime_tables_are_read_only_outside_named_functions() -> None:
    migration = MIGRATION_SQL.read_text(encoding="utf-8")
    adapter = (
        ROOT / "backend/app/infrastructure/canonical_write_commands.py"
    ).read_text(encoding="utf-8")
    routes = "\n".join(path.read_text(encoding="utf-8") for path in ROUTE_SOURCES)
    demo = (ROOT / "backend/scripts/provision_canonical_demo.py").read_text(
        encoding="utf-8"
    )

    assert "REVOKE UPDATE ON TABLE catalog.products FROM erp_app,erp_runtime" in migration
    assert "REVOKE INSERT,UPDATE ON TABLE parties.addresses FROM erp_app,erp_runtime" in migration
    assert "REVOKE INSERT,UPDATE ON TABLE core.attachments FROM erp_app,erp_runtime" in migration
    for relation in ("catalog.products", "parties.addresses", "core.attachments"):
        for verb in ("INSERT INTO", "UPDATE", "DELETE FROM"):
            assert f"{verb} {relation}" not in routes
            assert f"{verb} {relation}" not in adapter
    assert "FROM catalog.products WHERE org_id=%s AND id=%s FOR UPDATE" not in demo
    assert "erp_regulatory_commands.activate_product" in demo


def test_functions_fail_closed_on_context_staleness_and_evidence_conflict() -> None:
    product, address, evidence = (
        path.read_text(encoding="utf-8") for path in REVIEWED_SOURCES
    )

    assert "current_product.row_version<>expected_row_version" in product
    assert "current_product.status<>'draft'" in product
    assert "current_address.row_version<>expected_row_version" in address
    assert "pg_advisory_xact_lock" in address
    assert "existing.sha256 IS DISTINCT FROM sha256" in evidence
    assert "current_attachment.status<>'pending_upload'" in evidence
    assert "target_status NOT IN ('verified','rejected')" in evidence

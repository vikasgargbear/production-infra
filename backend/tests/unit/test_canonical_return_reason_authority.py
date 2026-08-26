import hashlib
from pathlib import Path


ROOT = Path(__file__).parents[3]
MIGRATION = (
    ROOT
    / "backend/alembic/sql/20260825_0010_return_reason_authority.sql"
)
REVISION = (
    ROOT
    / "backend/alembic/versions/20260825_0010_return_reason_authority.py"
)


def test_purchase_return_reason_is_resolved_from_effective_rule_authority():
    source = MIGRATION.read_text()
    assert 'CREATE OR REPLACE FUNCTION "erp_automation_commands"."resolve_purchase_return_prepare"' in source
    assert "request_document->>'reason_code' NOT IN" not in source
    assert "tax.gst_adjustment_rule_versions adjustment_rule" in source
    assert "adjustment_rule.reason_code=request_document->>'reason_code'" in source
    assert "adjustment_rule.tax_effect=request_document->>'gst_tax_treatment'" in source
    assert "adjustment_rule.effective_from<=return_date" in source
    assert "candidate_count<>1" in source
    assert "core.reference_data_releases WHERE id=rule.release_id AND status='active'" in source


def test_return_reason_migration_preserves_full_purchase_return_resolver():
    source = MIGRATION.read_text()
    for authority in (
        "erp_security.activate_context",
        "procurement.supplier_invoice_receipt_allocations",
        "tax.portal_document_lines",
        "inventory.stock_balances",
        "finance.open_items",
        "source_versions",
        "legal_scope",
    ):
        assert authority in source
    assert source.count("CREATE OR REPLACE FUNCTION") == 1
    assert 'OWNER TO "erp_migration_owner";' in source
    assert source.rstrip().endswith("RESET ROLE;")


def test_return_reason_revision_is_hash_bound_and_forward_only():
    revision = REVISION.read_text()
    digest = hashlib.sha256(MIGRATION.read_bytes()).hexdigest()
    assert 'revision = "20260825_0010"' in revision
    assert 'down_revision = "20260825_0009"' in revision
    assert f'EXPECTED_SQL_SHA256 = "{digest}"' in revision
    assert "hashlib.sha256" in revision
    assert "downgrade is intentionally unavailable" in revision

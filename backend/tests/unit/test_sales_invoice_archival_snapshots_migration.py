from __future__ import annotations

import hashlib
import importlib.util
import inspect
from pathlib import Path

from app.api.routes import canonical_erp_reads


ROOT = Path(__file__).resolve().parents[3]
SQL = ROOT / "backend/alembic/sql/20260829_0052_sales_invoice_archival_snapshots.sql"
REVISION = ROOT / "backend/alembic/versions/20260829_0052_sales_invoice_archival_snapshots.py"
POSTGRES_GATE = ROOT / "database/canonical/ci/run_alembic_postgres15_gate.sh"


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_archival_migration_is_linear_hash_bound_and_forward_only() -> None:
    revision = _load(REVISION, "sales_invoice_archival_snapshot_revision")
    migration = SQL.read_bytes()

    assert revision.revision == "20260829_0052"
    assert revision.down_revision == "20260829_0051"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(migration).hexdigest()
    assert "downgrade is intentionally unavailable" in inspect.getsource(
        revision.downgrade
    )


def test_canonical_prepare_archives_distinct_address_and_regulatory_evidence() -> None:
    migration = SQL.read_text(encoding="utf-8")

    assert "address.id=billing_identifier" in migration
    assert "address.id=shipping_identifier" in migration
    assert "shipping_address_snapshot=snapshot_document#>>'{shipping_address,display}'" in migration
    assert "shipping_address_snapshot=invoice.buyer_address_snapshot" not in migration
    assert "invoice_predates_archival_migration" in migration
    assert "Never\n  -- reconstruct its missing evidence from mutable master rows" in migration
    assert "result_document->>'replayed'" in migration
    assert "seller_gst_evidence_snapshot" in migration
    assert "buyer_gst_evidence_snapshot" in migration
    assert "seller_drug_licence_evidence_snapshot" in migration
    assert "buyer_drug_licence_evidence_snapshot" in migration
    assert "license.valid_from<=document_date" in migration
    assert "registration.effective_from<=document_date" in migration
    assert "sales invoice cannot post without captured archival evidence" in migration
    assert "sales-invoice archival snapshots are immutable" in migration

    # The archival wrapper surrounds the reviewed persistence function; no
    # calculated header or line amount is rewritten by this migration.
    for calculated_column in (
        "subtotal=", "discount_total=", "net_value_total=", "gst_taxable_total=",
        "cgst_total=", "sgst_total=", "igst_total=", "cess_total=", "grand_total=",
    ):
        assert calculated_column not in migration


def test_invoice_readback_uses_only_archived_display_evidence() -> None:
    source = inspect.getsource(canonical_erp_reads._canonical_invoice_detail)

    assert "invoice.billing_address_snapshot AS billing_address" in source
    assert "invoice.shipping_address_snapshot AS shipping_address" in source
    assert "invoice.buyer_address_snapshot AS billing_address" not in source
    assert "invoice.buyer_address_snapshot AS shipping_address" not in source
    assert "invoice.buyer_legal_name_snapshot AS customer_name" in source
    assert "invoice.seller_gst_evidence_snapshot AS seller_gst_evidence" in source
    assert "invoice.buyer_gst_evidence_snapshot AS customer_gst_evidence" in source
    assert "FROM compliance.licenses" not in source
    assert "FROM parties.contacts" not in source
    assert "invoice.seller_drug_licence_evidence_snapshot->'licences'" in source
    assert "invoice.buyer_drug_licence_evidence_snapshot->'licences'" in source


def test_postgresql_acceptance_is_in_the_canonical_alembic_gate() -> None:
    gate = POSTGRES_GATE.read_text(encoding="utf-8")

    assert "backend/tests/postgres/check_sales_invoice_archival_snapshots.py" in gate

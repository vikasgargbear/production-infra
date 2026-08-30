from __future__ import annotations

import hashlib
from pathlib import Path
from uuid import UUID

import pytest
from pydantic import ValidationError

from app.api.routes.canonical_historical_migration import (
    HistoricalFactWrite,
    HistoricalImportRequest,
    HistoricalInsightsResponse,
    HistoricalInvoiceArchiveResponse,
    OperationalCutoverRequest,
    OperationalCutoverResponse,
    OperationalCutoverStatus,
    _wire_fact,
)


ROOT = Path(__file__).resolve().parents[2]
ORG_ID = UUID("11111111-1111-4111-8111-111111111111")
BRANCH_ID = UUID("22222222-2222-4222-8222-222222222222")


def _sales_fact(**overrides) -> HistoricalFactWrite:
    value = {
        "source_kind": "sales_invoice",
        "record_key": "invoice-1",
        "event_date": "2026-04-01",
        "party_key": "customer-1",
        "party_name": "Observed customer",
        "taxable_amount": "100.00",
        "tax_amount": "12.00",
        "total_amount": "112.00",
        "selection_state": "included",
        "payload": {"source": "reviewed"},
        **overrides,
    }
    return HistoricalFactWrite.model_validate(value)


def test_historical_fact_identity_and_hash_are_repeatable() -> None:
    fact = _sales_fact()
    first = _wire_fact(
        org_id=ORG_ID,
        dataset_id="marg-history-v1",
        branch_id=BRANCH_ID,
        fact=fact,
    )
    second = _wire_fact(
        org_id=ORG_ID,
        dataset_id="marg-history-v1",
        branch_id=BRANCH_ID,
        fact=fact,
    )

    assert first == second
    assert first["taxable_amount"] == "100.00"
    assert len(first["row_sha256"]) == 64


def test_negative_zero_is_normalized_without_changing_real_negatives() -> None:
    zero = _wire_fact(
        org_id=ORG_ID,
        dataset_id="marg-history-v1",
        branch_id=BRANCH_ID,
        fact=_sales_fact(total_amount="-0.00"),
    )
    negative = _wire_fact(
        org_id=ORG_ID,
        dataset_id="marg-history-v1",
        branch_id=BRANCH_ID,
        fact=_sales_fact(record_key="invoice-2", total_amount="-12.50"),
    )

    assert zero["total_amount"] == "0.00"
    assert negative["total_amount"] == "-12.50"


def test_dated_facts_and_opening_items_require_observed_fields() -> None:
    with pytest.raises(ValidationError, match="requires event_date"):
        HistoricalFactWrite.model_validate(
            {
                "source_kind": "purchase_invoice",
                "record_key": "purchase-1",
                "selection_state": "included",
                "payload": {},
            }
        )
    with pytest.raises(ValidationError, match="requires amount"):
        HistoricalFactWrite.model_validate(
            {
                "source_kind": "opening_item",
                "record_key": "open-1",
                "event_date": "2026-04-01",
                "selection_state": "staged",
                "payload": {},
            }
        )


def test_import_batch_is_bounded() -> None:
    with pytest.raises(ValidationError):
        HistoricalImportRequest.model_validate(
            {
                "dataset_id": "marg-history-v1",
                "branch_id": BRANCH_ID,
                "facts": [],
            }
        )


def test_operational_cutover_contract_is_bounded_and_exact() -> None:
    request = OperationalCutoverRequest.model_validate(
        {
            "dataset_id": "marg-history-v1",
            "batch_size": 500,
            "confirmation": f"PROMOTE-HISTORY:{ORG_ID}:marg-history-v1",
        }
    )
    assert request.batch_size == 500
    with pytest.raises(ValidationError):
        OperationalCutoverRequest.model_validate(
            {
                "dataset_id": "marg-history-v1",
                "batch_size": 501,
                "confirmation": "PROMOTE-HISTORY:invalid",
            }
        )
    result = OperationalCutoverResponse.model_validate(
        {
            "parties_promoted": 1,
            "parties_bound": 2,
            "parties_remaining": 0,
            "openings_promoted": 3,
            "openings_remaining": 0,
            "complete": True,
        }
    )
    assert result.complete is True
    status = OperationalCutoverStatus.model_validate(
        {
            "source_parties": 3,
            "bound_parties": 3,
            "source_openings": 3,
            "posted_openings": 3,
            "receivable": "12.30",
            "payable": "4.50",
        }
    )
    assert status.receivable == "12.30"


def test_insight_contract_requires_exact_decimal_strings() -> None:
    payload = {
        "contract_version": "1.0.0",
        "definition_version": "historical-observed-v1",
        "currency_code": "INR",
        "date_from": None,
        "date_to": None,
        "coverage": {},
        "sales": {"invoice_count": 0, "taxable": "0.00", "tax": "0.00", "total": "0.00"},
        "purchases": {"invoice_count": 0, "taxable": "0.00", "tax": "0.00", "total": "0.00"},
        "returns": {"sales_count": 0, "purchase_count": 0, "sales_total": "0.00", "purchase_total": "0.00"},
        "outstanding": {"receivable": "0.00", "payable": "0.00", "overdue_receivable": "0.00", "item_count": 0},
        "inventory": {"batch_count": 0, "quantity": "0.000000", "value": "0.00", "near_expiry_batches": 0, "near_expiry_value": "0.00"},
        "monthly_sales": [],
        "top_products": [],
        "top_customers": [],
        "limitations": [],
    }
    assert HistoricalInsightsResponse.model_validate(payload).sales.total == "0.00"
    payload["sales"]["total"] = 0
    with pytest.raises(ValidationError):
        HistoricalInsightsResponse.model_validate(payload)


def test_historical_invoice_archive_preserves_exact_observed_totals() -> None:
    payload = {
        "items": [{
            "record_key": "marg:sale:one", "invoice_number": "MARG-1",
            "invoice_date": "2026-08-01", "customer_name": "Observed customer",
            "line_count": 3, "taxable_amount": "100.00", "tax_amount": "12.00",
            "total_amount": "112.00",
        }],
        "total": 1, "offset": 0, "limit": 50,
    }
    assert HistoricalInvoiceArchiveResponse.model_validate(payload).items[0].total_amount == "112.00"
    payload["items"][0]["total_amount"] = 112
    with pytest.raises(ValidationError):
        HistoricalInvoiceArchiveResponse.model_validate(payload)


def test_migration_is_hash_bound_and_runtime_has_no_table_access() -> None:
    version = ROOT / "alembic/versions/20260830_0065_historical_migration_facts.py"
    sql_path = ROOT / "alembic/sql/20260830_0065_historical_migration_facts.sql"
    source = version.read_text(encoding="utf-8")
    sql = sql_path.read_text(encoding="utf-8")
    digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()

    assert digest in source
    assert "REVOKE ALL ON TABLE automation.historical_migration_facts" in sql
    assert "GRANT EXECUTE ON FUNCTION erp_automation_commands.import_historical_migration_facts" in sql
    assert "core.organization.manage" in sql
    assert "Profit and margin are unavailable" in sql


def test_invoice_archive_is_a_hash_bound_runtime_read_not_direct_table_access() -> None:
    version = ROOT / "alembic/versions/20260830_0066_historical_sales_invoice_archive.py"
    sql_path = ROOT / "alembic/sql/20260830_0066_historical_sales_invoice_archive.sql"
    source_path = (
        ROOT.parent
        / "database/canonical/operations/automation/historical_sales_invoice_archive.sql"
    )
    source = version.read_text(encoding="utf-8")
    sql = sql_path.read_text(encoding="utf-8")
    digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()

    assert digest in source
    assert source_path.read_text(encoding="utf-8").strip() in sql
    assert "SECURITY DEFINER" in sql
    assert "SET row_security = off" in sql
    assert "GRANT EXECUTE ON FUNCTION erp_automation_reads.historical_sales_invoice_archive" in sql
    route = (ROOT / "app/api/routes/canonical_historical_migration.py").read_text(
        encoding="utf-8"
    )
    assert "SELECT erp_automation_reads.historical_sales_invoice_archive" in route
    assert "FROM automation.historical_migration_facts" not in route


def test_operational_cutover_is_hash_bound_typed_and_replay_safe() -> None:
    version = ROOT / "alembic/versions/20260830_0067_historical_operational_cutover.py"
    sql_path = ROOT / "alembic/sql/20260830_0067_historical_operational_cutover.sql"
    source_path = (
        ROOT.parent
        / "backend/alembic/source_snapshots/20260830_0067_historical_operational_cutover.sql"
    )
    source = version.read_text(encoding="utf-8")
    sql = sql_path.read_text(encoding="utf-8")
    digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()

    assert digest in source
    assert source_path.read_text(encoding="utf-8").strip() in sql
    assert "finance.opening_balance_documents" in sql
    assert "event_type='opening_balance'" in sql
    assert "historical_party_bindings_source_uq" in sql
    assert "opening_balance_documents_source_uq" in sql
    assert "WHEN 'dr' THEN 'receivable'" in sql
    assert "WHEN 'cr' THEN 'payable'" in sql
    assert "primary_phone" in sql
    assert "phone_value ~ '^[0-9]{10}$'" in sql
    assert "opening_balance_equity" in sql
    assert "GRANT EXECUTE ON FUNCTION erp_automation_commands.promote_historical_operational_batch" in sql


def test_archive_only_party_cutover_correction_is_hash_bound_and_fail_closed() -> None:
    version = ROOT / "alembic/versions/20260830_0068_historical_archive_party_cutover.py"
    sql_path = ROOT / "alembic/sql/20260830_0068_historical_archive_party_cutover.sql"
    source = version.read_text(encoding="utf-8")
    sql = sql_path.read_text(encoding="utf-8")
    digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()

    assert digest in source
    assert sql.count("payload->>'selection_state'='archive-only'") == 3
    assert "CREATE OR REPLACE FUNCTION erp_automation_commands.promote_historical_operational_batch" in sql
    assert "CREATE OR REPLACE FUNCTION erp_automation_reads.historical_operational_cutover_status" in sql
    assert "fact.selection_state<>'quarantined'" in sql
    assert "payload->>'selection_state'='quarantined'" not in sql


def test_referenced_party_cutover_correction_is_hash_bound_and_fail_closed() -> None:
    version = ROOT / "alembic/versions/20260830_0069_historical_referenced_party_cutover.py"
    sql_path = ROOT / "alembic/sql/20260830_0069_historical_referenced_party_cutover.sql"
    source = version.read_text(encoding="utf-8")
    sql = sql_path.read_text(encoding="utf-8")
    digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()

    assert digest in source
    assert sql.count("opening.party_key=fact.party_key") == 3
    assert sql.count("opening.selection_state<>'quarantined'") == 3
    assert sql.count(
        "opening.payload->>'party_role'=fact.payload->>'party_role'"
    ) == 3
    assert "payload->>'selection_state'='archive-only'" not in sql
    assert "CREATE OR REPLACE FUNCTION erp_automation_commands.promote_historical_operational_batch" in sql
    assert "CREATE OR REPLACE FUNCTION erp_automation_reads.historical_operational_cutover_status" in sql


def test_opening_party_identity_cutover_correction_is_hash_bound_and_fail_closed() -> None:
    version = ROOT / "alembic/versions/20260830_0070_historical_opening_party_identity.py"
    sql_path = ROOT / "alembic/sql/20260830_0070_historical_opening_party_identity.sql"
    source = version.read_text(encoding="utf-8")
    sql = sql_path.read_text(encoding="utf-8")
    digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()

    assert digest in source
    assert sql.count("opening.party_key=fact.party_key") == 3
    assert "AND binding.source_party_id=opening_fact.party_key;" in sql
    assert "binding.party_role=opening_fact.payload->>'party_role'" not in sql
    assert "CREATE OR REPLACE FUNCTION erp_automation_commands.promote_historical_operational_batch" in sql
    assert "CREATE OR REPLACE FUNCTION erp_automation_reads.historical_operational_cutover_status" in sql


def test_source_party_alias_cutover_correction_is_hash_bound_and_fail_closed() -> None:
    version = ROOT / "alembic/versions/20260830_0071_historical_source_party_alias.py"
    sql_path = ROOT / "alembic/sql/20260830_0071_historical_source_party_alias.sql"
    source_path = (
        ROOT.parent
        / "database/canonical/operations/automation/historical_operational_cutover.sql"
    )
    source = version.read_text(encoding="utf-8")
    sql = sql_path.read_text(encoding="utf-8")
    digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()

    assert digest in source
    current_source = source_path.read_text(encoding="utf-8")
    for text_value in (current_source, sql):
        assert text_value.count(
            "opening.payload->>'source_party_id'=fact.payload->>'source_party_id'"
        ) == 3
        assert "party_source_key:=COALESCE" in text_value
        assert "binding.source_party_id IN (" in text_value
        assert "SELECT binding.party_id INTO STRICT party_identifier" in text_value
    assert "CREATE OR REPLACE FUNCTION erp_automation_commands.promote_historical_operational_batch" in sql
    assert "CREATE OR REPLACE FUNCTION erp_automation_reads.historical_operational_cutover_status" in sql


def test_historical_cutover_diagnostic_is_hash_bound_scoped_and_read_only() -> None:
    version = ROOT / "alembic/versions/20260830_0072_historical_cutover_diagnostic.py"
    sql_path = ROOT / "alembic/sql/20260830_0072_historical_cutover_diagnostic.sql"
    source = version.read_text(encoding="utf-8")
    sql = sql_path.read_text(encoding="utf-8")
    digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()

    assert digest in source
    assert "erp_core_commands.assert_context(organization_id,NULL,NULL::uuid)" in sql
    assert "CREATE OR REPLACE FUNCTION erp_automation_reads.historical_operational_cutover_unmatched" in sql
    assert "sample_limit NOT BETWEEN 1 AND 100" in sql
    assert "GRANT EXECUTE ON FUNCTION" in sql
    assert "TO erp_runtime" in sql
    for forbidden in ("INSERT INTO", "UPDATE ", "DELETE FROM", "TRUNCATE "):
        assert forbidden not in sql

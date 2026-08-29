from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_migration_keeps_wholesale_scope_and_verified_evidence_fail_closed():
    sql = read("backend/alembic/sql/20260829_0061_canonical_drug_license_onboarding.sql")
    assert "'drug_wholesale_form_20b','drug_wholesale_form_21b'" in sql
    assert "drug_schedule_x_wholesale_form_20g" not in sql
    assert "evidence.status IN ('verified','retained')" in sql
    assert "evidence.document_date=issued_on" in sql
    assert "evidence.legal_hold=true" in sql
    assert "pg_catalog.num_nonnulls(subject_branch_id,subject_party_id)<>1" in sql
    assert "next_verification_due_on<business_day" in sql
    assert "erp_compliance_commands.claim" in sql
    assert "erp_compliance_commands.finish_claim" in sql
    assert "parties.supplier_accounts" in sql
    assert "procurement.suppliers" not in sql
    route = read("backend/app/api/routes/canonical_drug_licenses.py")
    assert 'target_status="rejected"' in route
    assert "storage.delete(object_key)" in route
    assert '"23P01"' in route
    authority = read("database/schema-authority.json")
    assert "20260829_0061_canonical_drug_license_onboarding.py" in authority
    assert "20260829_0061_canonical_drug_license_onboarding.sql" in authority


def test_rest_ui_and_mcp_share_the_same_command_owner():
    route = read("backend/app/api/routes/canonical_drug_licenses.py")
    internal = read("backend/app/api/routes/internal/mcp_master_commands.py")
    command = read("backend/app/infrastructure/canonical_write_commands.py")
    operations = read("backend/mcp_runtime/aasopharma_mcp/operations.py")
    assert "execute_drug_license_record" in route
    assert "execute_drug_license_record" in internal
    assert "record_effective_wholesale_license" in command
    assert "compliance.wholesale_license.record" in operations
    assert "/api/internal/mcp/master/drug-licenses" in operations


def test_operator_surface_never_asks_for_raw_subject_ids():
    ui = read("frontend/src/components/master/settings/DrugLicenseSetup.tsx")
    operations = read("backend/mcp_runtime/aasopharma_mcp/operations.py")
    internal = read("backend/app/api/routes/internal/mcp_master_commands.py")
    assert "context?.branches" in ui
    assert "context?.suppliers" in ui
    assert "type=\"file\"" in ui
    assert "Schedule H/H1/X" in ui and "NDPS" in ui
    assert "subject UUID" not in ui
    assert "party UUID" not in ui
    assert "canonical authority" not in ui.lower()
    assert "signed <code>" not in ui
    license_schema = operations.split("DRUG_LICENSE_RECORD_SCHEMA", 1)[1].split(
        "OPERATOR_OPERATIONS.update", 1
    )[0]
    assert '"subject_code"' in license_schema
    assert '"evidence_branch_code"' in license_schema
    assert '"evidence_filename"' in license_schema
    assert '"subject_id"' not in license_schema
    assert '"evidence_attachment_id"' not in license_schema
    assert "canonical_request = DrugLicenseRecordRequest" in internal

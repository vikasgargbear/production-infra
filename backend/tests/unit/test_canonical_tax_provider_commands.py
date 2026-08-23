from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


REPO = Path(__file__).resolve().parents[3]
ROOT = REPO / "database/canonical/commands_tax_provider"
GENERATOR = ROOT / "generate_tax_provider_commands.py"


def _module():
    spec = importlib.util.spec_from_file_location("tax_provider_commands", GENERATOR)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _sql() -> str:
    return (ROOT / "tax-provider-commands.sql").read_text()


def test_generated_provider_artifacts_are_current() -> None:
    sql, manifest, mapping = _module().generated_artifacts()
    assert sql == (ROOT / "tax-provider-commands.sql").read_text()
    assert manifest == (ROOT / "tax-provider-command-manifest.json").read_text()
    assert mapping == (ROOT / "baseline-tax-provider-command-enforcements.json").read_text()


def test_mapping_resolves_provider_and_registration_branch_invariants() -> None:
    mapping = json.loads((ROOT / "baseline-tax-provider-command-enforcements.json").read_text())
    assert {
        f"{entry['table']}:{entry['invariant']}" for entry in mapping["enforcements"]
    } == {
        "tax.einvoices:einvoices_cross_row_guard",
        "tax.eway_bills:eway_bills_cross_row_guard",
        "tax.registration_branches:registration_branches_effective_guard",
    }

    scripts = REPO / "backend/scripts"
    sys.path.insert(0, str(scripts))
    try:
        import generate_canonical_baseline as baseline
    finally:
        sys.path.remove(str(scripts))
    catalog = baseline.load_and_validate_catalog(REPO / "database/canonical/domains")
    before = baseline.generate_baseline(catalog, allow_draft=True)
    reviewed = baseline._load_enforcement_mapping(
        ROOT / "baseline-tax-provider-command-enforcements.json"
    )
    after = baseline.generate_baseline(
        catalog,
        enforcement_mapping=reviewed.invariants,
        allow_draft=True,
    )
    removed = {item["key"] for item in before.blockers} - {
        item["key"] for item in after.blockers
    }
    assert removed == {
        "tax.einvoices:einvoices_cross_row_guard",
        "tax.eway_bills:eway_bills_cross_row_guard",
        "tax.registration_branches:registration_branches_effective_guard",
    }


def test_request_bytes_and_attempt_chain_are_database_authoritative() -> None:
    sql = _sql()
    for fragment in (
        "canonical_einvoice_request",
        "canonical_eway_bill_request",
        "canonical_eway_bill_inventory_request",
        "pg_catalog.convert_to(envelope::text,'UTF8')",
        "extensions.digest(request_bytes,'sha256')",
        "ORDER BY chain.artifact_version DESC LIMIT 1 FOR UPDATE",
        "provider request id already binds different canonical bytes",
        "one immutable successor per authority artifact",
    ):
        if fragment == "one immutable successor per authority artifact":
            catalog = (REPO / "database/canonical/domains/tax.json").read_text()
            assert fragment in catalog
        else:
            assert fragment in sql
    assert "ON CONFLICT DO NOTHING" not in sql


def test_eway_requires_physical_inventory_source_with_optional_tax_association() -> None:
    sql = _sql()
    tax = json.loads((REPO / "database/canonical/domains/tax.json").read_text())
    table = next(item for item in tax["tables"] if item["name"] == "tax.eway_bills")
    columns = {column[0]: column for column in table["columns"]}
    assert columns["tax_document_id"][2] is True
    assert columns["inventory_document_id"][2] is True
    assert any(
        check["expression"] == "inventory_document_id IS NOT NULL"
        for check in table["checks"]
    )
    inventory_fk = next(
        fk for fk in table["foreign_keys"] if fk["name"] == "eway_bills_inventory_document_fk"
    )
    assert inventory_fk["references"] == "inventory.inventory_documents"
    for fragment in (
        "inventory_document_id IS NULL",
        "status='posted'",
        "('sales_issue','purchase_return_issue','transfer')",
        "'stock_transfer'",
        "'supply'",
        "'purchase_return'",
        "'delivery_challan'",
        "inventory.inventory_document_lines",
        "line.movement_kind IN ('issue','transfer')",
    ):
        assert fragment in sql


def test_permissions_are_checked_at_the_source_branch() -> None:
    sql = _sql()
    assert "has_permission('tax.einvoice.generate',source_branch_id)" in sql
    assert "has_permission('tax.eway_bill.generate',inventory_document.branch_id)" in sql
    assert "has_permission('tax.einvoice.generate',NULL::uuid)" not in sql
    assert "has_permission('tax.eway_bill.generate',NULL::uuid)" not in sql


def test_einvoice_applicability_is_effective_dated_and_fail_closed() -> None:
    sql = _sql()
    manifest = json.loads((ROOT / "tax-provider-command-manifest.json").read_text())
    assert "tax.organization_fiscal_tax_facts" in sql
    assert "tax.einvoice_rule_versions" in sql
    assert "outside the reviewed e-invoice reporting window" in sql
    assert "document_class IN ('sales_invoice','adjustment_note')" in sql
    assert len(manifest["application_readiness_blockers"]) == 1


def test_operational_readiness_audit_has_exact_expected_blockers() -> None:
    audit_path = REPO / "backend/scripts/audit/tax_provider_operational_readiness.py"
    spec = importlib.util.spec_from_file_location("tax_provider_readiness", audit_path)
    assert spec and spec.loader
    audit = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(audit)
    evidence = json.loads((ROOT / "provider-operational-readiness.json").read_text())
    assert audit.blockers(evidence) == [
        "einvoice_applicability_unreviewed",
    ]
    enabled = json.loads(json.dumps(evidence))
    enabled["external_provider_feature"]["enabled"] = True
    assert audit.blockers(enabled) == [
        "sandbox_conformance_unreviewed",
        "provider_credentials_unprovisioned",
        "einvoice_applicability_unreviewed",
    ]


def test_provider_boundary_is_allowlisted_scoped_and_credential_free() -> None:
    sql = _sql()
    manifest = json.loads((ROOT / "tax-provider-command-manifest.json").read_text())
    assert "SESSION_USER<>'erp_tax_provider'" in sql
    assert "nic_irp_v1" in sql and "licensed_gsp_eway_v1" in sql
    assert 'TO "erp_app"' in sql and 'TO "erp_tax_provider"' in sql
    assert "GRANT EXECUTE" in sql
    assert "GRANT INSERT" not in sql and "GRANT UPDATE" not in sql
    assert manifest["database_boundary"]["credentials_embedded"] is False
    assert manifest["database_boundary"]["live_access_claimed"] is False
    assert len(manifest["external_operator_gates"]) == 3
    for forbidden in ("password=", "api_key", "client_secret", "https://"):
        assert forbidden not in sql.lower()

    security = json.loads((REPO / "database/canonical/security/policy-manifest.json").read_text())
    mappings = {item["table"]: item for item in security["tables"]}
    for table_name in ("tax.einvoices", "tax.eway_bills"):
        assert mappings[table_name]["runtime_grants"] == ["SELECT"]
        assert mappings[table_name]["policies"] == ["SELECT"]
        assert mappings[table_name]["mutation_enforcement"] == (
            "isolated_provider_security_definer_commands_only"
        )


def test_terminal_evidence_and_cancellation_are_append_only() -> None:
    sql = _sql()
    assert "provider authority evidence is retained" in sql
    assert "OLD.status<>'requested'" in sql
    assert "OLD.response_bytes IS NOT NULL" in sql
    assert "cancellation does not supersede generated IRN evidence" in sql
    assert "terminal e-way evidence does not supersede a generated bill" in sql
    assert "supersedes_artifact_id" in sql
    assert "signed_qr_sha256<>extensions.digest(signed_qr_bytes,'sha256')" in sql


def test_catalog_chain_has_single_successor_and_no_mutable_active_index() -> None:
    tax = json.loads((REPO / "database/canonical/domains/tax.json").read_text())
    for name in ("tax.einvoices", "tax.eway_bills"):
        table = next(item for item in tax["tables"] if item["name"] == name)
        assert table["mutation_class"] == "provider_evidence_state_machine"
        indexes = {item["name"]: item for item in table["indexes"]}
        assert not any(index_name.endswith("active_uq") for index_name in indexes)
        successor = next(item for item in indexes.values() if item["name"].endswith("successor_uq"))
        assert successor["unique"] is True
        assert successor["columns"] == ["org_id", "supersedes_artifact_id"]


def test_plumbing_allows_only_exact_provider_completion_system_audit() -> None:
    plumbing = (REPO / "database/canonical/plumbing/canonical_plumbing.sql").read_text()
    assert "SESSION_USER = 'erp_tax_provider'" in plumbing
    assert "scope.scope='provider_complete'" in plumbing
    assert "WHEN provider_completion_scope THEN 'system'" in plumbing
    assert 'GRANT "erp_migration_owner" TO "erp_tax_provider"' not in plumbing


def test_postgres_fixture_is_rollback_only() -> None:
    fixture = (ROOT / "test_tax_provider_commands_rollback.sql").read_text()
    assert "GROUP BY true" not in fixture
    assert ")<>2 THEN" in fixture
    assert fixture.startswith("\\set ON_ERROR_STOP on\n\nBEGIN;")
    assert fixture.rstrip().endswith("ROLLBACK;")
    assert "has_function_privilege" in fixture

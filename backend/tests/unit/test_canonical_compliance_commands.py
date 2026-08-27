from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOT = REPO_ROOT / "database" / "canonical" / "commands_compliance"
GENERATOR = ROOT / "generate_compliance_commands.py"


def _module():
    spec = importlib.util.spec_from_file_location("canonical_compliance_commands", GENERATOR)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_generated_compliance_command_artifacts_are_current() -> None:
    mapping, manifest = _module().generated_artifacts()
    assert mapping == (ROOT / "baseline-compliance-command-enforcements.json").read_text()
    assert manifest == (ROOT / "compliance-command-manifest.json").read_text()


def test_disposition_exactly_partitions_prior_blockers() -> None:
    source = json.loads(
        (REPO_ROOT / "database/canonical/commands_finance/finance-command-manifest.json").read_text()
    )
    mapping = json.loads((ROOT / "baseline-compliance-command-enforcements.json").read_text())
    manifest = json.loads((ROOT / "compliance-command-manifest.json").read_text())
    resolved = {f"{item['table']}:{item['invariant']}" for item in mapping["enforcements"]}

    assert len(resolved) == manifest["resolved_count"]
    assert len(manifest["blocked_invariants"]) == manifest["blocked_count"]
    assert resolved | set(manifest["blocked_invariants"]) == set(source["blocked_invariants"])
    assert resolved.isdisjoint(manifest["blocked_invariants"])
    assert manifest["blocker_delta"] == {"before": len(source["blocked_invariants"]), "resolved": len(resolved), "after": len(manifest["blocked_invariants"])}


def test_commands_are_private_idempotent_and_fixed_search_path() -> None:
    mapping = (ROOT / "baseline-compliance-command-enforcements.json").read_text()
    manifest = json.loads((ROOT / "compliance-command-manifest.json").read_text())

    assert "SET search_path = ''" in mapping
    assert "SECURITY DEFINER" in mapping
    assert "ON CONFLICT (org_id,actor_membership_id,operation,idempotency_key_hash) DO NOTHING" in mapping
    assert "response_status=200,response_media_type='application/json'" in mapping
    assert "response_hash=extensions.digest(terminal_response_body,'sha256')" in mapping
    assert 'REVOKE ALL ON TABLE \\"erp_compliance_commands\\".\\"command_scopes\\"' in mapping
    assert mapping.count("GRANT EXECUTE ON FUNCTION") == len(manifest["security"]["runtime_commands"])
    assert "EXECUTE FORMAT" not in mapping.upper()
    assert "IF NOT EXISTS" not in mapping.upper()
    assert "OUT p_claim_id uuid, OUT p_replay_resource_id uuid" in mapping
    assert mapping.count("SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id") == 16


def test_goods_advance_non_withholding_uses_exact_verified_fiscal_fact_names() -> None:
    mapping = (ROOT / "baseline-compliance-command-enforcements.json").read_text()

    assert "fact.gst_tds_notified_deductor" in mapping
    assert "org_fact.gst_tds_notified_deductor" in mapping
    assert "fact.gst_tds_notified)" not in mapping
    assert "org_fact.gst_tds_notified)" not in mapping
    assert "line.withholding_nature_code='purchase_of_goods'" in mapping
    assert "fact.prior_fiscal_year_turnover<=100000000" in mapping
    assert "party.tax_residency_status='resident'" in mapping
    assert "party.pan_verification_status='verified'" in mapping


def test_temperature_ingestion_derives_range_and_verifies_envelope() -> None:
    mapping = (ROOT / "baseline-compliance-command-enforcements.json").read_text()

    assert "GREATEST(product_rule.minimum_celsius,location_rule.minimum_celsius)" in mapping
    assert "LEAST(product_rule.maximum_celsius,location_rule.maximum_celsius)" in mapping
    assert "extensions.digest(payload_bytes,'sha256')" in mapping
    assert "sum(ledger.quantity_delta)>0" in mapping
    assert "compliance.storage_rule_versions" in mapping
    assert "temperature readings are append-only" in mapping
    assert "complete batch, provider, payload, hash" in mapping
    assert "temperature_batch_block" in mapping
    assert "UPDATE inventory.batches SET status='blocked'" in mapping


def test_destruction_and_expense_commands_preserve_sod_and_posting_provenance() -> None:
    mapping = (ROOT / "baseline-compliance-command-enforcements.json").read_text()

    assert "destruction.created_by_membership_id=actor_id" in mapping
    assert "attachment.status NOT IN ('verified','retained')" in mapping
    assert "approved destruction inventory lines are immutable" in mapping
    assert "destruction posting is unavailable until typed waste-disposal authority" in mapping
    post_start = mapping.index("post_destruction")
    blocked_at = mapping.index(
        "destruction posting is unavailable until typed waste-disposal authority",
        post_start,
    )
    claim_at = mapping.index("compliance.destruction.post", blocked_at)
    inventory_at = mapping.index("erp_trade_commands.post_locked_document", claim_at)
    assert post_start < blocked_at < claim_at < inventory_at
    manifest = json.loads((ROOT / "compliance-command-manifest.json").read_text())
    assert manifest["destruction_posting"]["status"] == "blocked_fail_closed"
    assert "erp_trade_commands.post_locked_document" in mapping
    assert "claim.claimant_membership_id=actor_id" in mapping
    assert "claim.claimant_membership_id=actor_id" in mapping
    assert "journal does not exactly map approved lines to active expense accounts" in mapping
    assert "INSERT INTO finance.accounting_events" in mapping


def test_only_provider_decimal_and_regulated_import_authority_remain_blocked() -> None:
    manifest = json.loads((ROOT / "compliance-command-manifest.json").read_text())
    blocked = manifest["blocked_invariants"]

    assert "tax.withholdings:withholdings_cross_row_guard" not in blocked
    assert "tax.withholding_rule_versions:withholding_rule_versions_release_authority" in blocked
    assert "tax.einvoices:einvoices_cross_row_guard" in blocked
    assert "tax.eway_bills:eway_bills_cross_row_guard" in blocked
    assert "tax.documents:documents_cross_row_guard" in blocked
    assert "compliance.recall_batches:recall_batches_cross_row_guard" not in blocked
    assert "tax.return_documents:return_documents_cross_row_guard" not in blocked
    assert "finance.expense_claim_lines:expense_claim_lines_cross_row_guard" not in blocked
    reasons = " ".join(item["reason"] for item in blocked.values())
    assert "regulated withholding_rules importer" in reasons.lower()
    assert "external provider" in reasons
    assert "Decimal" in reasons


def test_mapping_composes_and_removes_exactly_sixteen_baseline_blockers() -> None:
    scripts = REPO_ROOT / "backend" / "scripts"
    sys.path.insert(0, str(scripts))
    try:
        import generate_canonical_baseline as baseline
    finally:
        sys.path.remove(str(scripts))

    paths = [
        "database/canonical/security/baseline-platform-enforcements.json",
        "database/canonical/platform/baseline-platform-enforcements.json",
        "database/canonical/invariants/baseline-stable-enforcements.json",
        "database/canonical/invariants_trade/baseline-trade-enforcements.json",
        "database/canonical/invariants_finance/baseline-finance-enforcements.json",
        "database/canonical/commands_finance/baseline-finance-command-enforcements.json",
    ]
    catalog = baseline.load_and_validate_catalog(REPO_ROOT / "database/canonical/domains")
    before_mapping = baseline._merge_reviewed_mappings(
        [baseline._load_enforcement_mapping(REPO_ROOT / path) for path in paths]
    )
    command_mapping = baseline._load_enforcement_mapping(
        ROOT / "baseline-compliance-command-enforcements.json"
    )
    after_mapping = baseline._merge_reviewed_mappings([before_mapping, command_mapping])
    before = baseline.generate_baseline(
        catalog,
        enforcement_mapping=before_mapping.invariants,
        platform_mapping=before_mapping.platform,
        allow_draft=True,
    )
    after = baseline.generate_baseline(
        catalog,
        enforcement_mapping=after_mapping.invariants,
        platform_mapping=after_mapping.platform,
        allow_draft=True,
    )
    removed = {item["key"] for item in before.blockers} - {item["key"] for item in after.blockers}

    assert removed == set(json.loads((ROOT / "compliance-command-manifest.json").read_text())["resolved_invariants"])
    assert len(before.blockers) - len(after.blockers) == 16


def test_withholding_commands_are_typed_immutable_and_component_exact() -> None:
    mapping = (ROOT / "baseline-compliance-command-enforcements.json").read_text()

    assert '\\"post_withholding\\"' in mapping
    assert '\\"reverse_withholding\\"' in mapping
    assert '\\"post_withholding_deposit\\"' in mapping
    assert '\\"file_withholding_statement\\"' in mapping
    assert '\\"import_withholding_certificate\\"' in mapping
    assert "exactly one imported withholding rule must apply" in mapping
    assert "classified gross advance crosses imported withholding threshold and must deduct atomically" in mapping
    assert "prior_advance_basis_amount" in mapping
    assert "withholding_evaluation" in mapping
    assert "reverse later statutory basis observations before this vendor advance" in mapping
    assert "withholding journal lines do not match canonical account roles and components" in mapping
    assert "challan must deposit each deduction and component exactly once" in mapping
    assert "payment.payment_purpose<>'withholding_deposit'" in mapping
    assert "rule.statement_form_code" in mapping
    assert "rule.certificate_form_code" in mapping


def test_organization_fiscal_tax_fact_command_is_maker_checker_and_immutable() -> None:
    mapping = (ROOT / "baseline-compliance-command-enforcements.json").read_text()

    assert '\\"verify_organization_fiscal_tax_fact\\"' in mapping
    assert "'tax.registration.manage'" in mapping
    assert "maker_id=actor_id" in mapping
    assert "permission.code='tax.registration.manage'" in mapping
    assert "grant_row.scope_kind='organization'" in mapping
    assert "evidence.status NOT IN ('verified','retained')" in mapping
    assert "organization_fiscal_tax_fact_supersede" in mapping
    assert "OLD.status<>'active' OR NEW.status<>'superseded'" in mapping
    assert "fiscal tax facts are immutable except command-scoped supersession" in mapping
    assert "fact.fiscal_year_start_year=fiscal_year_start_year" in mapping


def test_postgres_fixture_is_rollback_only() -> None:
    fixture = (ROOT / "test_compliance_commands_rollback.sql").read_text()
    assert fixture.startswith("\\set ON_ERROR_STOP on\n\nBEGIN;")
    assert fixture.rstrip().endswith("ROLLBACK;")
    assert "prosecdef" in fixture
    assert "has_function_privilege" in fixture
    assert "command_scopes" in fixture


def test_controlled_register_derives_immutable_ledger_and_license_facts() -> None:
    mapping = (ROOT / "baseline-compliance-command-enforcements.json").read_text()

    assert "controlled-substance register entries are immutable" in mapping
    assert "compliance.controlled_movement_rule_versions" in mapping
    assert "candidate.ndps_scope IN ('any'" in mapping
    assert "entry_quantity:=pg_catalog.abs(ledger.quantity_delta)" in mapping
    assert "entry_day:=(ledger.posted_at AT TIME ZONE organization.timezone)::date" in mapping
    assert "SELECT * INTO STRICT organization FROM core.organizations" in mapping
    assert "counterparty and license number must be supplied together" in mapping
    assert "license.valid_from<=entry_day" in mapping
    assert "license.next_verification_due_on>=entry_day" in mapping
    assert "license.license_type_code=rule.organization_license_type_code" in mapping
    assert "license.license_type_code=rule.counterparty_license_type_code" in mapping
    assert "evidence.status IN ('verified','retained')" in mapping


def test_expense_lines_require_verified_evidence_exact_sum_and_freeze() -> None:
    mapping = (ROOT / "baseline-compliance-command-enforcements.json").read_text()

    assert "line.receipt_attachment_id IS NOT NULL AND EXISTS" in mapping
    assert "line_total IS DISTINCT FROM claim.claimed_amount" in mapping
    assert "expense lines are frozen outside draft or reviewed approval" in mapping
    assert "expense evidence must remain verified through posting" in mapping


def test_recall_actions_are_ledger_derived_and_generic_posting_is_closed() -> None:
    mapping = (ROOT / "baseline-compliance-command-enforcements.json").read_text()
    trade = (
        REPO_ROOT / "database/canonical/commands_trade/baseline-trade-command-enforcements.json"
    ).read_text()

    assert "recall batch exposure and action quantities are command-derived" in mapping
    assert "sum(ledger.quantity_delta)" in mapping
    assert "document.recall_id=target_recall_id" in mapping
    assert "ledger.entry_kind='transfer_out'" in mapping
    assert "ledger.entry_kind='transfer_in'" in mapping
    assert "ledger.entry_kind='receipt'" in mapping
    assert "ledger.entry_kind='issue'" in mapping
    assert "posted recall actions exceed immutable batch exposure" in mapping
    assert "post_recall_inventory_action" in mapping
    assert "document_recall_id IS NOT NULL" in trade
    assert "recall_quarantine','recall_release" in trade

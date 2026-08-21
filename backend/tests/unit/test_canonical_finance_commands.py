import hashlib
import importlib.util
import json
import sys
from pathlib import Path

from scripts import generate_canonical_baseline as baseline


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOT = REPO_ROOT / "database" / "canonical" / "commands_finance"
GENERATOR_PATH = ROOT / "generate_finance_commands.py"


def _load_generator():
    spec = importlib.util.spec_from_file_location("canonical_finance_command_generator", GENERATOR_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_checked_in_command_artifacts_are_deterministic() -> None:
    generator = _load_generator()
    mapping_text, manifest_text = generator.generated_artifacts()
    manifest = json.loads(manifest_text)

    assert (ROOT / "baseline-finance-command-enforcements.json").read_text() == mapping_text
    assert (ROOT / "finance-command-manifest.json").read_text() == manifest_text
    assert manifest["resolved_count"] == 8
    assert manifest["blocked_count"] == 26
    assert manifest["mapping_sha256"] == hashlib.sha256(mapping_text.encode()).hexdigest()


def test_commands_partition_the_prior_thirty_four_blockers_without_claiming_external_authority() -> None:
    generator = _load_generator()
    source = json.loads(
        (REPO_ROOT / "database" / "canonical" / "invariants_finance" / "finance-invariants-manifest.json").read_text()
    )
    definitions = generator._definitions()
    blocked = generator.BLOCKED_REASONS

    assert set(definitions).isdisjoint(blocked)
    assert set(definitions) | set(blocked) == (
        set(source["blocked_invariants"])
        - {"tax.tax_code_versions:tax_code_versions_release_authority"}
    )
    assert "tax.einvoices:einvoices_cross_row_guard" in blocked
    assert "tax.eway_bills:eway_bills_cross_row_guard" in blocked
    assert "tax.withholdings:withholdings_cross_row_guard" in blocked
    assert "compliance.temperature_readings:temperature_readings_cross_row_guard" in blocked


def test_command_sql_has_private_provenance_and_fixed_security_boundary() -> None:
    generator = _load_generator()
    sql = "\n".join(statement for statements in generator._definitions().values() for statement in statements)

    assert "SECURITY DEFINER" in sql
    assert "SET search_path = ''" in sql
    assert "#variable_conflict use_variable" in sql
    assert "EXECUTE format" not in sql
    assert "IF NOT EXISTS" not in sql.upper()
    assert 'REVOKE ALL ON TABLE "erp_finance_commands"."command_scopes"' in sql
    assert "pg_catalog.txid_current()" in sql
    assert "pg_catalog.pg_backend_pid()" in sql
    assert "erp_security.has_permission" in sql
    assert "accounting event source financial snapshot is immutable" in sql
    assert "withholdings_accounted_source_ct" in sql


def test_commands_are_idempotent_and_reconciliation_requires_snapshot_isolation() -> None:
    sql = "\n".join(statement for statements in _load_generator()._definitions().values() for statement in statements)

    assert "payment.status='posted' AND existing_event=event_id" in sql
    assert "existing=reversal_payment_id AND original.status='reversed'" in sql
    assert "bank parser idempotency payload mismatch" in sql
    assert "portal parser idempotency payload mismatch" in sql
    assert "existing_line.portal_document_id=parse_portal_document.portal_document_id" in sql
    assert (
        "FROM tax.portal_document_lines WHERE org_id=organization_id "
        "AND portal_document_id=portal_document_id"
    ) not in sql
    assert "repeatable read" in sql
    assert "serializable" in sql
    assert "reconciliation idempotency key reused with different state" in sql


def test_payment_posting_uses_typed_cash_or_bank_settlement_identity() -> None:
    sql = "\n".join(
        statement
        for statements in _load_generator()._definitions().values()
        for statement in statements
    )

    assert "payment.settlement_account_id" in sql
    assert "payment branch permission denied" in sql
    assert "cash payment cannot reference a bank account" in sql
    assert "bank.account_id<>settlement.id" in sql
    assert "line.account_id=payment.settlement_account_id" in sql
    assert "line.branch_id<>payment.branch_id" in sql


def test_supplier_advance_is_gross_typed_and_applied_once_to_matching_invoice() -> None:
    sql = "\n".join(statement for statements in _load_generator()._definitions().values() for statement in statements)

    assert '"post_supplier_advance_payment"' in sql
    assert '"apply_supplier_advance"' in sql
    assert "payment.payment_purpose<>'supplier_advance'" in sql
    assert "assert_no_advance_withholding_required" in sql
    assert "assert_advance_withholding_reversible" in sql
    assert "supplier advance must use the typed gross-advance posting command" in sql
    assert "scope_active\"('supplier_advance_payment'" in sql or "scope_active('supplier_advance_payment'" in sql
    assert "statutory deposit payment is retained after challan allocation" in sql
    assert "gross_advance_amount" in sql
    assert "cash_disbursed_amount" in sql
    assert "invoice_line.purchase_order_line_id IS DISTINCT FROM advance.purchase_order_line_id" in sql
    assert "supplier invoice basis was already deducted at advance payment" not in sql
    assert "supplier_advance_application" in sql
    assert "'supplier_prepayment'" in sql
    assert "purchase_order_advance_allocation_id=advance_allocation_id" in sql

    catalog = json.loads((REPO_ROOT / "database/canonical/domains/finance.json").read_text())
    allocations = next(table for table in catalog["tables"] if table["name"] == "finance.allocations")
    withholding_uq = next(index for index in allocations["indexes"] if index["name"] == "allocations_withholding_uq")
    assert withholding_uq["where"] == "withholding_id IS NOT NULL AND reversal_of_allocation_id IS NULL"


def test_command_fragment_composes_and_resolves_exactly_eight_prior_blockers() -> None:
    catalog = baseline.load_and_validate_catalog(REPO_ROOT / "database" / "canonical" / "domains")
    prior_paths = [
        REPO_ROOT / "database" / "canonical" / "security" / "baseline-platform-enforcements.json",
        REPO_ROOT / "database" / "canonical" / "platform" / "baseline-platform-enforcements.json",
        REPO_ROOT / "database" / "canonical" / "invariants" / "baseline-stable-enforcements.json",
        REPO_ROOT / "database" / "canonical" / "invariants_trade" / "baseline-trade-enforcements.json",
        REPO_ROOT / "database" / "canonical" / "invariants_finance" / "baseline-finance-enforcements.json",
    ]
    before = baseline._merge_reviewed_mappings(
        [baseline._load_enforcement_mapping(path) for path in prior_paths]
    )
    commands = baseline._load_enforcement_mapping(ROOT / "baseline-finance-command-enforcements.json")
    after = baseline._merge_reviewed_mappings([before, commands])
    before_result = baseline.generate_baseline(
        catalog,
        enforcement_mapping=before.invariants,
        platform_mapping=before.platform,
        allow_draft=True,
    )
    after_result = baseline.generate_baseline(
        catalog,
        enforcement_mapping=after.invariants,
        platform_mapping=after.platform,
        allow_draft=True,
    )

    assert len(commands.invariants) == 8
    assert len(before_result.blockers) - len(after_result.blockers) == 8
    remaining = {item["key"] for item in after_result.blockers if item["category"] == "cross_row_invariant"}
    assert set(_load_generator().BLOCKED_REASONS) <= remaining


def test_postgres_fixture_is_rollback_only() -> None:
    fixture = (ROOT / "test_finance_commands.sql").read_text()
    assert fixture.lstrip().startswith("\\set ON_ERROR_STOP on\n\nBEGIN;")
    assert fixture.rstrip().endswith("ROLLBACK;")
    assert "prosecdef" in fixture
    assert "has_function_privilege" in fixture
    assert "command_scopes" in fixture


def test_return_membership_is_draft_only_typed_and_actor_scoped() -> None:
    sql = "\n".join(_load_generator()._definitions()[
        "tax.return_documents:return_documents_cross_row_guard"
    ])

    assert "return membership rows are immutable" in sql
    assert "tax_return.status<>'draft'" in sql
    assert "document.registration_id IS DISTINCT FROM period.registration_id" in sql
    assert "document.document_date NOT BETWEEN period.period_start AND period.period_end" in sql
    assert "tax_return.return_type='gstr1' AND document.direction<>'outward'" in sql
    assert "period.period_kind<>'annual'" in sql
    assert "population role must be derived from immutable document effect" in sql
    assert "erp_security.has_permission('tax.return.compose',NULL::uuid)" in sql
    assert "NEW.included_by_membership_id IS DISTINCT FROM actor_id" in sql

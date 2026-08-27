import hashlib
import importlib.util
import json
import sys
from pathlib import Path

from scripts import generate_canonical_baseline as baseline


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOT = REPO_ROOT / "database" / "canonical" / "invariants_finance"
GENERATOR_PATH = ROOT / "generate_finance_contract.py"


def _load_generator():
    spec = importlib.util.spec_from_file_location("canonical_finance_invariant_generator", GENERATOR_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_checked_in_finance_artifacts_are_deterministic_and_catalog_bound() -> None:
    generator = _load_generator()
    mapping_text, manifest_text = generator.generated_artifacts()
    manifest = json.loads(manifest_text)

    assert (ROOT / "baseline-finance-enforcements.json").read_text(encoding="utf-8") == mapping_text
    assert (ROOT / "finance-invariants-manifest.json").read_text(encoding="utf-8") == manifest_text
    assert manifest["resolved_count"] == 14
    assert manifest["blocked_count"] == 35
    assert "tax.tax_code_versions:tax_code_versions_release_authority" in manifest["blocked_invariants"]
    assert {
        "compliance.controlled_movement_rule_versions:controlled_movement_rule_versions_release_authority",
        "compliance.storage_rule_versions:storage_rule_versions_effective_guard",
        "tax.einvoice_rule_versions:einvoice_rule_versions_release_authority",
        "tax.gst_adjustment_rule_versions:gst_adjustment_rule_versions_release_authority",
        "tax.registration_branches:registration_branches_effective_guard",
    } <= set(manifest["blocked_invariants"])
    assert manifest["resolved_count"] + manifest["blocked_count"] == 49
    assert manifest["mapping_sha256"] == hashlib.sha256(mapping_text.encode()).hexdigest()


def test_every_owned_invariant_has_exactly_one_honest_disposition() -> None:
    generator = _load_generator()
    invariants = generator._load_invariants()
    definitions = generator._definitions()

    assert set(definitions).isdisjoint(generator.BLOCKED_REASONS)
    assert set(definitions) | set(generator.BLOCKED_REASONS) == set(invariants)
    assert {
        "finance.journal_entries:journal_entries_cross_row_guard",
        "finance.allocations:allocations_cross_row_guard",
        "finance.reconciliation_matches:reconciliation_matches_cross_row_guard",
        "tax.returns:returns_cross_row_guard",
        "compliance.licenses:licenses_cross_row_guard",
        "compliance.recalls:recalls_cross_row_guard",
    } <= set(definitions)


def test_sql_has_fixed_invoker_boundary_and_no_runtime_callable_helpers() -> None:
    generator = _load_generator()
    sql = "\n".join(
        statement for statements in generator._definitions().values() for statement in statements
    )

    assert "SECURITY DEFINER" not in sql
    assert "SECURITY INVOKER" in sql
    assert "SET search_path = ''" in sql
    assert "EXECUTE format" not in sql
    assert "IF NOT EXISTS" not in sql.upper()
    assert "registrations_branch_period_excl" not in sql
    assert "ROW(NEW.branch_id,NEW.gstin" not in sql
    assert 'REVOKE ALL ON FUNCTION' in sql
    assert 'FROM PUBLIC, "erp_app", "erp_runtime"' in sql
    assert json.loads((ROOT / "finance-invariants-manifest.json").read_text())["security"][
        "runtime_callable_functions"
    ] == []


def test_blockers_name_missing_authorities_and_command_boundaries() -> None:
    generator = _load_generator()
    blockers = generator.BLOCKED_REASONS

    assert "imported-rule" in blockers["tax.withholdings:withholdings_cross_row_guard"]
    assert "posting command" in blockers["tax.documents:documents_cross_row_guard"]
    assert "recall-tagged" in blockers["compliance.recall_batches:recall_batches_cross_row_guard"].lower()
    assert "approved batch/quantity" in blockers["compliance.destructions:destructions_cross_row_guard"]
    assert "storage-rule" in blockers["compliance.temperature_readings:temperature_readings_cross_row_guard"]
    assert "cryptographic" in blockers["tax.einvoices:einvoices_cross_row_guard"]
    assert "parser command" in blockers["tax.portal_documents:portal_documents_cross_row_guard"]


def test_after_insert_aggregate_guards_count_the_new_row_once() -> None:
    sql = "\n".join(
        statement for statements in _load_generator()._definitions().values() for statement in statements
    )

    assert "source_allocated>payment.amount" in sql
    assert "allocated>item.principal_amount" in sql
    assert "line_matched>statement_line_amount" in sql
    assert "SELECT line.amount,bank.account_id,statement.currency_code" in sql
    assert "SELECT line,bank.account_id" not in sql
    assert "source_allocated+NEW.amount" not in sql
    assert "line_matched+NEW.matched_amount" not in sql


def test_allocation_trigger_is_deferred_and_assertion_only() -> None:
    sql = "\n".join(
        statement for statements in _load_generator()._definitions().values() for statement in statements
    )

    assert '"allocations_guard_ct"' in sql
    assert "DEFERRABLE INITIALLY DEFERRED" in sql
    allocation_guard = "\n".join(
        _load_generator()._definitions()["finance.allocations:allocations_cross_row_guard"]
    )
    assert "UPDATE finance.open_items" not in allocation_guard
    assert "allocated>item.principal_amount" in allocation_guard
    assert "NEW.source_open_item_id" in allocation_guard
    assert "event.event_type='adjustment_note'" in allocation_guard
    assert "po_advance.prepayment_open_item_id=source_item.id" in allocation_guard
    assert "po_advance.status='posted'" in allocation_guard
    assert "source_item.item_side=item.item_side" in allocation_guard
    assert "residual credit open item over-allocation" in allocation_guard


def test_journal_trigger_is_assertion_only() -> None:
    journal_guard = "\n".join(
        _load_generator()._definitions()[
            "finance.journal_entries:journal_entries_cross_row_guard"
        ]
    )

    assert "journal reversal is not an exact sign inversion" in journal_guard
    assert "journal can be reversed only by a posted compensating journal" in journal_guard
    assert "UPDATE finance.journal_entries" not in journal_guard


def test_finance_fragment_composes_and_resolves_exactly_its_reviewed_keys() -> None:
    catalog = baseline.load_and_validate_catalog(REPO_ROOT / "database" / "canonical" / "domains")
    mapping_paths = [
        REPO_ROOT / "database" / "canonical" / "security" / "baseline-platform-enforcements.json",
        REPO_ROOT / "database" / "canonical" / "platform" / "baseline-platform-enforcements.json",
        REPO_ROOT / "database" / "canonical" / "invariants" / "baseline-stable-enforcements.json",
        REPO_ROOT / "database" / "canonical" / "invariants_trade" / "baseline-trade-enforcements.json",
    ]
    before = baseline._merge_reviewed_mappings(
        [baseline._load_enforcement_mapping(path) for path in mapping_paths]
    )
    finance = baseline._load_enforcement_mapping(ROOT / "baseline-finance-enforcements.json")
    after = baseline._merge_reviewed_mappings([before, finance])
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

    assert len(finance.invariants) == 14
    assert len(before_result.blockers) - len(after_result.blockers) == 14
    remaining = {blocker["key"] for blocker in after_result.blockers if blocker["category"] == "cross_row_invariant"}
    assert set(_load_generator().BLOCKED_REASONS) <= remaining


def test_postgres_fixture_checks_private_trigger_surface() -> None:
    fixture = (ROOT / "test_finance_invariants.sql").read_text(encoding="utf-8")

    assert "prosecdef" in fixture
    assert "proconfig" in fixture
    assert "has_function_privilege" in fixture
    assert "tgconstraint=0" in fixture

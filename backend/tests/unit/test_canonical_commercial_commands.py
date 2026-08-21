from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import sys
from pathlib import Path


REPO = Path(__file__).resolve().parents[3]
ROOT = REPO / "database" / "canonical" / "commands_commercial"
GENERATOR = ROOT / "generate_commercial_commands.py"


def _module():
    spec = importlib.util.spec_from_file_location("commercial_command_contract", GENERATOR)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_commercial_readiness_artifacts_are_deterministic() -> None:
    mapping, manifest = _module().generated_artifacts()
    assert mapping == (ROOT / "baseline-commercial-command-enforcements.json").read_text()
    assert manifest == (ROOT / "commercial-command-manifest.json").read_text()
    assert "pg_catalog.extract(" not in mapping
    assert "pg_catalog.date_part('year'" in mapping
    assert "companion_count<>(CASE WHEN NEW.gst_tax_treatment='statutory'" in mapping
    assert "companion_count<>CASE WHEN NEW.gst_tax_treatment='statutory'" not in mapping
    assert "companion_count<>(CASE WHEN EXISTS" in mapping
    assert "SELECT open_item.* INTO STRICT original_open" in mapping
    assert "INTO STRICT original_event_id,original_open" not in mapping
    assert "statutory return requires exactly one active branch GST registration association on return date" in mapping
    assert "FOR SHARE OF registration,association" in mapping
    assert "FROM procurement.supplier_invoice_lines tax_line JOIN tax.tax_code_versions" in mapping
    assert "FROM sales.invoice_lines tax_line JOIN tax.tax_code_versions" in mapping
    assert "FROM procurement.supplier_invoice_lines line JOIN tax.tax_code_versions" not in mapping
    assert "FROM sales.invoice_lines invoice_product_line" in mapping
    assert "FROM sales.invoice_lines line WHERE line.org_id=organization_id" not in mapping
    assert mapping.count("header.status='posted' THEN header.row_version-1") >= 4
    parsed = json.loads(manifest)
    assert parsed["mapping_sha256"] == hashlib.sha256(mapping.encode()).hexdigest()
    assert parsed["implementation_status"] == "implemented"


def test_contract_resolves_trade_and_generic_adjustment_posting_blockers() -> None:
    source = json.loads(
        (REPO / "database/canonical/commands_trade_v2/trade-posting-manifest.json").read_text()
    )
    mapping = json.loads((ROOT / "baseline-commercial-command-enforcements.json").read_text())
    manifest = json.loads((ROOT / "commercial-command-manifest.json").read_text())
    assert len(mapping["enforcements"]) == 11
    assert mapping["platform_enforcements"] == []
    assert manifest["resolved_count"] == 11
    assert manifest["blocked_count"] == 0
    assert manifest["blocked_invariants"] == {}
    assert manifest["target_resolved_count_after_catalog_correction"] == 11
    assert set(manifest["resolved_invariants"]) == set(source["blocked_invariants"]) | {
        "finance.adjustment_note_lines:adjustment_note_lines_cross_row_guard",
        "finance.adjustment_notes:adjustment_notes_cross_row_guard",
        "tax.documents:documents_cross_row_guard",
    }


def test_minimal_catalog_correction_has_no_new_table_and_all_required_facts() -> None:
    manifest = json.loads((ROOT / "commercial-command-manifest.json").read_text())
    changes = manifest["required_catalog_changes"]
    assert all("add_table" not in change for change in changes)
    by_table = {change["table"]: change for change in changes}
    assert {column[0] for column in by_table["finance.adjustment_notes"]["add_columns"]} == {
        "sales_return_id",
        "purchase_return_id",
        "adjusts_open_item_id",
        "gst_adjustment_rule_version_id",
        "gst_tax_treatment",
        "counterparty_portal_document_line_id",
        "recipient_itc_reversal_evidence_attachment_id",
        "recipient_itc_reversal_confirmed_at",
    }
    assert {column[0] for column in by_table["procurement.purchase_returns"]["add_columns"]} == {
        "return_source_kind",
        "supplier_invoice_id",
        "supplier_credit_note_portal_line_id",
        "gst_adjustment_rule_version_id",
        "gst_tax_treatment",
    }
    assert by_table["sales.return_lines"]["add_columns"][0][0] == "final_residual"
    assert by_table["procurement.purchase_return_lines"]["add_columns"][0][0] == "final_residual"
    assert by_table["sales.invoice_lines"]["add_columns"][0][0] == "revenue_account_id"
    supplier_columns = {
        column[0] for column in by_table["procurement.supplier_invoice_lines"]["add_columns"]
    }
    assert supplier_columns == {"net_value_account_id", "itc_eligibility"}
    assert by_table["sales.invoices"]["replace_check"] == (
        "invoice_type IN ('tax_invoice','bill_of_supply')"
    )


def test_approved_catalog_corrections_are_present_without_implicit_residual_defaults() -> None:
    tables = {}
    for domain in ("sales", "procurement", "finance"):
        document = json.loads((REPO / f"database/canonical/domains/{domain}.json").read_text())
        tables.update({table["name"]: table for table in document["tables"]})

    sales_lines = {column[0]: column for column in tables["sales.invoice_lines"]["columns"]}
    supplier_lines = {
        column[0]: column for column in tables["procurement.supplier_invoice_lines"]["columns"]
    }
    sales_return_lines = {
        column[0]: column for column in tables["sales.return_lines"]["columns"]
    }
    purchase_return_lines = {
        column[0]: column for column in tables["procurement.purchase_return_lines"]["columns"]
    }
    purchase_returns = {
        column[0]: column for column in tables["procurement.purchase_returns"]["columns"]
    }
    notes = {column[0]: column for column in tables["finance.adjustment_notes"]["columns"]}

    assert sales_lines["revenue_account_id"][1:4] == ["uuid", False, None]
    assert supplier_lines["net_value_account_id"][1:4] == ["uuid", False, None]
    assert supplier_lines["itc_eligibility"][1:4] == ["text", False, None]
    assert sales_return_lines["final_residual"][1:4] == ["boolean", False, None]
    assert purchase_return_lines["final_residual"][1:4] == ["boolean", False, None]
    assert purchase_returns["return_source_kind"][1:4] == ["text", False, None]
    assert purchase_returns["supplier_invoice_id"][1:4] == ["uuid", True, None]
    assert notes["sales_return_id"][1:4] == ["uuid", True, None]
    assert notes["purchase_return_id"][1:4] == ["uuid", True, None]
    assert notes["adjusts_open_item_id"][1:4] == ["uuid", True, None]
    assert notes["gst_adjustment_rule_version_id"][1:4] == ["uuid", False, None]
    assert notes["gst_tax_treatment"][1:4] == ["text", False, None]
    assert purchase_returns["supplier_credit_note_portal_line_id"][1:4] == ["uuid", True, None]

    invoice_checks = " ".join(check["expression"] for check in tables["sales.invoices"]["checks"])
    supplier_checks = " ".join(
        check["expression"] for check in tables["procurement.supplier_invoice_lines"]["checks"]
    )
    assert "credit_note" not in invoice_checks and "debit_note" not in invoice_checks
    assert "itc_eligibility IN ('eligible','ineligible','blocked','deferred')" in supplier_checks

    note_indexes = {index["name"]: index for index in tables["finance.adjustment_notes"]["indexes"]}
    assert note_indexes["adjustment_notes_sales_return_uq"]["unique"] is True
    assert note_indexes["adjustment_notes_purchase_return_uq"]["unique"] is True


def test_account_roles_and_cogs_are_explicit_and_fail_closed() -> None:
    manifest = json.loads((ROOT / "commercial-command-manifest.json").read_text())
    mapping = (ROOT / "baseline-commercial-command-enforcements.json").read_text()
    roles = manifest["account_role_settings"]
    assert roles["namespace"] == "finance.account_roles"
    assert "branch setting first" in roles["resolution"]
    assert {
        "inventory_asset", "inventory_count_gain", "cost_of_goods_sold", "rcm_igst_payable",
        "sales_revenue", "supplier_prepayment", "income_tax_tds_payable", "gst_tds_payable",
    } <= set(
        roles["required_roles"]
    )
    assert manifest["inventory_value_authority"]["source"] == "inventory.stock_ledger_entries"
    assert "sum(-value_delta)" in manifest["inventory_value_authority"]["cogs_formula"]
    assert "No inferred ITC eligibility." in manifest["prohibitions"]
    assert "No invented account IDs or fallback suspense account." in manifest["prohibitions"]
    assert "line.revenue_account_id,'income',header.currency_code" in mapping
    assert "line.revenue_account_id,income,header.currency_code" not in mapping


def test_generic_adjustment_catalog_persists_fixed_calculation_and_lineage_facts() -> None:
    finance = json.loads((REPO / "database/canonical/domains/finance.json").read_text())
    calculation = json.loads((REPO / "database/canonical/domains/calculation.json").read_text())
    tax = json.loads((REPO / "database/canonical/domains/tax.json").read_text())
    tables = {table["name"]: table for table in finance["tables"]}
    notes = {column[0]: column for column in tables["finance.adjustment_notes"]["columns"]}
    lines = {column[0]: column for column in tables["finance.adjustment_note_lines"]["columns"]}
    artifacts = {
        column[0]: column
        for column in next(table for table in calculation["tables"] if table["name"] == "calculation.artifacts")["columns"]
    }
    tax_columns = {
        column[0]
        for column in next(table for table in tax["tables"] if table["name"] == "tax.documents")["columns"]
    }
    assert artifacts["adjustment_note_id"][1:4] == ["uuid", True, None]
    assert {"document_effect", "rounding_policy", "document_discount_kind", "document_discount_basis", "document_discount_value", "calculation_ruleset_version", "gst_adjustment_rule_version_id", "gst_tax_treatment", "counterparty_portal_document_line_id", "recipient_itc_reversal_evidence_attachment_id", "recipient_itc_reversal_confirmed_at"} <= set(notes)
    assert {"sales_invoice_line_id", "supplier_invoice_line_id", "charge_code", "quoted_amount", "free_quantity", "uom_conversion_factor", "base_billed_quantity", "base_free_quantity", "free_supply_tax_treatment", "line_discount_kind", "line_discount_basis", "line_discount_value", "document_discount_eligible", "final_residual", "gst_tax_treatment", "inventory_cost_treatment", "itc_eligibility"} <= set(lines)
    assert lines["quoted_amount"][1:4] == ["numeric(20,2)", True, None]
    assert lines["final_residual"][1:4] == ["boolean", False, None]
    assert "taxable_advance_payment_id" not in tax_columns


def test_commercial_fragment_composes_and_resolves_exactly_eleven_blockers(tmp_path: Path) -> None:
    before_sql = tmp_path / "before.sql"
    after_sql = tmp_path / "after.sql"
    before_blockers = tmp_path / "before.json"
    after_blockers = tmp_path / "after.json"
    base = [
        sys.executable,
        str(REPO / "backend/scripts/generate_canonical_baseline.py"),
        "--catalog-root",
        str(REPO / "database/canonical/domains"),
        "--enforcement-map",
        str(REPO / "database/canonical/commands_trade/baseline-trade-command-enforcements.json"),
        "--enforcement-map",
        str(REPO / "database/canonical/commands_trade_v2/baseline-trade-posting-enforcements.json"),
        "--draft",
    ]
    subprocess.run(base + ["--output", str(before_sql), "--blockers-output", str(before_blockers)], check=True)
    subprocess.run(
        base
        + [
            "--enforcement-map",
            str(ROOT / "baseline-commercial-command-enforcements.json"),
            "--output",
            str(after_sql),
            "--blockers-output",
            str(after_blockers),
        ],
        check=True,
    )
    before = json.loads(before_blockers.read_text())["unresolved_invariants"]
    after = json.loads(after_blockers.read_text())["unresolved_invariants"]
    before_keys = {item["key"] for item in before}
    after_keys = {item["key"] for item in after}
    manifest = json.loads((ROOT / "commercial-command-manifest.json").read_text())
    assert before_keys - after_keys == set(manifest["resolved_invariants"])
    assert after_keys == before_keys - set(manifest["resolved_invariants"])
    sql = after_sql.read_text()
    assert sql.index('CREATE SCHEMA "erp_commercial_commands"') < sql.index(
        'CREATE FUNCTION "erp_commercial_commands"."assert_purchase_return_artifact"'
    )
    assert after_sql.read_text() != before_sql.read_text()


def test_postgres_fixture_is_rollback_only_and_exercises_commercial_authority() -> None:
    fixture = (ROOT / "test_commercial_commands_rollback.sql").read_text()
    assert fixture.startswith("\\set ON_ERROR_STOP on\n\nBEGIN;")
    assert fixture.rstrip().endswith("ROLLBACK;")
    assert "to_regnamespace('erp_commercial_commands')" in fixture
    assert "post_sales_invoice" in fixture
    assert "post_supplier_invoice" in fixture
    assert "post_sales_return" in fixture
    assert "post_purchase_return" in fixture
    assert "post_adjustment_note" in fixture
    assert "assert_adjustment_note_artifact" in fixture
    assert "cumulative adjustment header or payable exceeds original plus increases" in fixture
    assert "positive_rounding" in fixture and "negative_rounding" in fixture
    assert "service-advance tax writer must remain absent" in fixture
    assert "rounding_gain" in fixture and "rounding_loss" in fixture
    assert "rcm_igst_payable" in fixture
    assert "purchase_return_inventory_variance" in fixture
    assert "gst_adjustment_rule_versions" in fixture
    assert "recipient ITC-reversal evidence" in fixture
    assert "registration_branches" in fixture
    assert "supplier_credit_note_portal_line_id" in fixture
    assert "commercial-only return cannot alter GST" in fixture


def test_generated_sql_is_fail_closed_and_covers_accounting_edge_cases() -> None:
    mapping = json.loads((ROOT / "baseline-commercial-command-enforcements.json").read_text())
    sql = "\n".join(
        statement
        for enforcement in mapping["enforcements"]
        for statement in enforcement["statements"]
    )
    assert "SET search_path = ''" in sql
    assert "FROM sales.return_lines return_adjustment_line" in sql
    assert "FROM procurement.purchase_return_lines return_adjustment_line" in sql
    assert sql.count("original_open finance.open_items%ROWTYPE; posting_line record;") == 2
    assert sql.count("header.status='posted' THEN header.row_version-1") >= 4
    assert "EXECUTE FORMAT" not in sql.upper()
    assert "EXECUTE IMMEDIATE" not in sql.upper()
    assert "consume_artifact" in sql
    assert "final_residual" in sql
    assert "cumulative sales return exceeds original" in sql
    assert "cumulative purchase return exceeds source" in sql
    assert "allocated dispatch lacks exactly one posted inventory-valuation accounting event" in sql
    assert "post_dispatch_inventory_valuation" in sql
    assert "Dispatch COGS from posted stock ledger" in sql
    assert "COGS from posted stock ledger" in sql
    assert "Returned inventory from posted ledger" in sql
    assert "Purchase return inventory variance" in sql
    assert "Reverse-charge liability reversal" in sql
    assert "rounding_adjustment>0" in sql
    assert "rounding_adjustment<0" in sql
    assert "reversed_billed_quantity" in sql
    assert "gross_price_amount" in sql
    assert "artifact prior state differs from locked posted sales returns" in sql
    assert "artifact prior state differs from locked posted purchase returns" in sql
    assert "post_adjustment_note" in sql
    assert "typed adjustment artifact metadata differs" in sql
    assert "cumulative adjustment exceeds original plus increases" in sql
    assert "SELECT DISTINCT sales_invoice_line_id,supplier_invoice_line_id" in sql
    assert "coalesce(sales_invoice_line_id,supplier_invoice_line_id) source_id" not in sql
    assert "pg_advisory_xact_lock" in sql
    assert "return after a generic adjustment is blocked because the reversal artifact cannot encode an adjusted original basis" in sql
    assert "residual is inexact" in sql
    assert "original plus increases" in sql
    assert "quoted_amount" in sql
    assert "adjustment open item does not belong to the original invoice event" in sql
    assert "Adjustment RCM liability" in sql
    assert "adjustment reversal requires a separate reviewed compensating-note command" in sql
    assert "return reversal requires a reviewed compensating command for tax, finance, allocation, and inventory effects" in sql
    assert "commercial-only adjustment cannot alter GST" in sql
    assert "statutory sales credit requires verified recipient ITC-reversal evidence" in sql
    assert "supplier GST credit-note portal evidence differs from purchase return" in sql
    assert "gst_tax_treatment" in sql
    assert "guard_tax_document_source" in sql
    assert "INITIALLY DEFERRED" in sql


def test_generic_adjustment_tax_boundary_is_typed_and_service_advances_stay_deferred() -> None:
    manifest = json.loads((ROOT / "commercial-command-manifest.json").read_text())
    boundary = manifest["generic_adjustment_tax_boundary"]
    assert boundary["implementation_status"] == "implemented"
    assert boundary["resolved_count"] == 3
    assert boundary["blocked_count"] == 0
    assert set(boundary["resolved_invariants"]) == {
        "finance.adjustment_note_lines:adjustment_note_lines_cross_row_guard",
        "finance.adjustment_notes:adjustment_notes_cross_row_guard",
        "tax.documents:documents_cross_row_guard",
    }
    changes = {change["table"]: change for change in boundary["catalog_changes"]}
    artifact_columns = {column[0] for column in changes["calculation.artifacts"]["add_columns"]}
    line_columns = {column[0] for column in changes["finance.adjustment_note_lines"]["add_columns"]}
    assert artifact_columns == {"adjustment_note_id"}
    assert {"sales_invoice_line_id", "supplier_invoice_line_id", "free_quantity", "uom_conversion_factor"} <= line_columns
    assert changes["tax.documents"]["remove_source_classes"] == ["taxable_advance"]
    limitations = " ".join(boundary["workflow_limitations"])
    assert "return after a posted generic adjustment" in limitations
    assert "compensating-note command" in limitations
    assert "service-advance tax is deferred" in limitations
    fixture = (ROOT / "test_commercial_commands_rollback.sql").read_text()
    assert "post_adjustment_note" in fixture
    assert "post_taxable_advance_tax_document" in fixture
    assert "service-advance tax writer must remain absent" in fixture
    assert "guard_posted_sales_invoice_lines" in fixture
    assert "guard_posted_supplier_invoice_lines" in fixture
    assert "guard_posted_sales_return_lines" in fixture
    assert "guard_posted_purchase_return_lines" in fixture
    assert "'search_path=\"\"'=ANY" in fixture
    assert "reviewed security modes and empty fixed search_path" in fixture

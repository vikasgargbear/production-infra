"""Column-level gates for the finance, tax, and compliance canonical catalogs."""

from __future__ import annotations

import json
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
DOMAIN_ROOT = REPO_ROOT / "database" / "canonical" / "domains"
MODEL_PATH = REPO_ROOT / "docs" / "architecture" / "canonical-data-model.json"
CONTRACT = json.loads((DOMAIN_ROOT / "_contract.json").read_text())
CATALOGS = {
    domain: json.loads((DOMAIN_ROOT / f"{domain}.json").read_text())
    for domain in ("finance", "tax", "compliance")
}

EXPECTED_TABLES = {
    "finance": {
        "finance.accounts", "finance.bank_accounts", "finance.accounting_events",
        "finance.journal_entries", "finance.journal_lines", "finance.payments",
        "finance.open_items", "finance.allocations", "finance.adjustment_notes",
        "finance.adjustment_note_lines", "finance.expense_claims",
        "finance.expense_claim_lines", "finance.bank_statements",
        "finance.bank_statement_lines", "finance.reconciliation_matches",
    },
    "tax": {
        "tax.registrations", "tax.registration_branches", "tax.tax_code_versions",
        "tax.documents", "tax.withholdings",
        "tax.withholding_rule_versions", "tax.organization_fiscal_tax_facts",
        "tax.withholding_basis_lines",
        "tax.withholding_deposits", "tax.withholding_deposit_lines",
        "tax.withholding_statements", "tax.withholding_statement_lines",
        "tax.withholding_certificates", "tax.withholding_certificate_lines",
        "tax.return_periods", "tax.returns", "tax.return_documents",
        "tax.portal_documents", "tax.portal_document_lines",
        "tax.reconciliation_runs", "tax.reconciliation_items",
        "tax.eway_bills", "tax.einvoices", "tax.einvoice_rule_versions",
        "tax.gst_adjustment_rule_versions",
    },
    "compliance": {
        "compliance.licenses", "compliance.recalls", "compliance.recall_batches",
        "compliance.temperature_readings",
        "compliance.controlled_substance_entries", "compliance.destructions",
        "compliance.controlled_movement_rule_versions", "compliance.storage_rule_versions",
    },
}

GLOBAL_REFERENCE_TABLES = {
    "tax.tax_code_versions",
    "tax.withholding_rule_versions",
    "tax.einvoice_rule_versions",
    "tax.gst_adjustment_rule_versions",
    "compliance.controlled_movement_rule_versions",
}


def _tables(domain: str) -> dict[str, dict]:
    return {table["name"]: table for table in CATALOGS[domain]["tables"]}


def _table(name: str) -> dict:
    domain = name.split(".", 1)[0]
    return _tables(domain)[name]


def _columns(table: dict) -> dict[str, list]:
    return {column[0]: column for column in table["columns"]}


def _expressions(table: dict) -> str:
    return " ".join(check["expression"] for check in table["checks"])


def _cross_row_rules(table: dict) -> str:
    return " ".join(invariant["rule"] for invariant in table["cross_row_invariants"])


def _index(table: dict, name: str) -> dict:
    return next(index for index in table["indexes"] if index["name"] == name)


def test_payment_settlement_identity_distinguishes_cash_from_bank() -> None:
    payment = _table("finance.payments")
    columns = _columns(payment)
    expressions = _expressions(payment)
    rules = _cross_row_rules(payment)

    assert columns["branch_id"][2] is False
    assert columns["settlement_account_id"][:4] == [
        "settlement_account_id", "uuid", False, None
    ]
    assert columns["bank_account_id"][:4] == [
        "bank_account_id", "uuid", True, None
    ]
    assert "payment_method IN ('cash','cheque')" in expressions
    assert "payment_method NOT IN ('cash','cheque') AND bank_account_id IS NOT NULL" in expressions
    assert "bank_account whose account_id exactly equals settlement_account_id" in rules
    assert "reauthorizes payment.branch_id" in rules


def test_catalogs_cover_exact_final_domain_authority() -> None:
    model = json.loads(MODEL_PATH.read_text())

    assert sum(len(names) for names in EXPECTED_TABLES.values()) == 48
    for domain, expected in EXPECTED_TABLES.items():
        catalog = CATALOGS[domain]
        names = {table["name"] for table in catalog["tables"]}
        assert catalog["domain"] == domain
        assert catalog["table_count"] == len(expected) == len(catalog["tables"])
        assert names == expected == set(model["canonical_tables"][domain])
        assert catalog["unresolved_design_choices"] == []


@pytest.mark.parametrize("domain", CATALOGS)
def test_catalog_shape_columns_and_lifecycle_are_complete(domain: str) -> None:
    required = set(CONTRACT["required_table_keys"])
    sensitivities = set(CONTRACT["column_rules"]["sensitivity"])
    forbidden_types = set(CONTRACT["column_rules"]["forbidden_types"])

    for table in CATALOGS[domain]["tables"]:
        assert required <= table.keys()
        assert isinstance(table["fact_owner"], str) and table["fact_owner"].strip()
        assert isinstance(table["cross_row_invariants"], list)
        assert table["cross_row_invariants"], f"{table['name']} omits trigger-only invariants"
        for invariant in table["cross_row_invariants"]:
            assert set(invariant) == set(CONTRACT["cross_row_invariant_shape"]["required_keys"])
            assert invariant["enforcement"] in CONTRACT["cross_row_invariant_shape"]["allowed_enforcement"]
            assert invariant["name"] and invariant["rule"].strip()

        columns = _columns(table)
        assert len(columns) == len(table["columns"])
        for column in table["columns"]:
            assert len(column) in (5, 6), (table["name"], column)
            name, postgres_type, nullable, default_sql, sensitivity = column[:5]
            assert name and postgres_type == postgres_type.lower()
            assert isinstance(nullable, bool)
            assert default_sql is None or isinstance(default_sql, str)
            assert sensitivity in sensitivities
            assert postgres_type not in forbidden_types
            if postgres_type == "jsonb":
                assert len(column) == 6
                assert column[5] in CONTRACT["bounded_json_purposes"]
            else:
                assert len(column) == 5

            if name == "id":
                assert postgres_type == "uuid"
                assert nullable is False
                if table["name"] in GLOBAL_REFERENCE_TABLES:
                    assert default_sql is None, "reviewed importer must supply deterministic reference IDs"
                else:
                    assert default_sql == "gen_random_uuid()"
            assert default_sql is None or "uuidv7" not in default_sql
            if name.endswith("_amount") or name == "amount_tolerance":
                assert postgres_type == "numeric(20,2)", (table["name"], name)
            if name.endswith("_quantity") or name == "quantity":
                assert postgres_type == "numeric(20,6)", (table["name"], name)
            if name.endswith("_rate") and name != "quoted_unit_rate":
                assert postgres_type == "numeric(9,6)", (table["name"], name)
            if name == "quoted_unit_rate":
                assert postgres_type == "numeric(20,4)", (table["name"], name)

        lifecycle = table["lifecycle"]
        assert set(CONTRACT["lifecycle_shape"]["required_keys"]) == lifecycle.keys()
        state_column = lifecycle["state_column"]
        if state_column is None:
            assert lifecycle == {
                "state_column": None, "states": [], "initial": None,
                "terminal": [], "transitions": [],
            }
        else:
            assert state_column in columns
            assert lifecycle["initial"] in lifecycle["states"]
            assert set(lifecycle["terminal"]) <= set(lifecycle["states"])


def test_tenant_keys_fks_actors_rls_and_indexes_fail_closed() -> None:
    model = json.loads(MODEL_PATH.read_text())
    tenant_relations = {
        name for domain, names in model["canonical_tables"].items()
        for name in names
        if name not in {"core.organizations", "core.users", "core.permissions",
                        "catalog.ingredients", "catalog.units_of_measure",
                        *GLOBAL_REFERENCE_TABLES}
    }
    association_pks = {
        "tax.return_documents": ["org_id", "return_id", "tax_document_id"],
        "tax.registration_branches": [
            "org_id", "registration_id", "branch_id", "effective_from",
        ],
        "compliance.recall_batches": ["org_id", "recall_id", "batch_id"],
    }
    fk_keys = set(CONTRACT["foreign_key_shape"]["required_keys"])

    for catalog in CATALOGS.values():
        for table in catalog["tables"]:
            columns = _columns(table)
            if table["tenant_class"] == "global_reference":
                assert table["name"] in {
                    *GLOBAL_REFERENCE_TABLES,
                }
                continue

            assert table["rls"] == {
                **table["rls"], "class": "tenant_membership", "force": True
            }
            assert table["primary_key"] == association_pks.get(
                table["name"], ["org_id", "id"]
            )
            assert columns["org_id"][2] is False
            for key_column in table["primary_key"]:
                assert columns[key_column][2] is False

            for foreign_key in table["foreign_keys"]:
                assert set(foreign_key) == fk_keys
                assert len(foreign_key["columns"]) == len(foreign_key["referenced_columns"])
                assert foreign_key["on_delete"] in CONTRACT["foreign_key_shape"]["allowed_on_delete"]
                if foreign_key["references"] in tenant_relations:
                    assert foreign_key["columns"][0] == "org_id", (table["name"], foreign_key)
                    assert foreign_key["referenced_columns"][0] == "org_id"

            for name in columns:
                if not name.endswith("membership_id"):
                    continue
                actor_fks = [
                    fk["columns"] == ["org_id", name]
                    and fk["references"] == "core.memberships"
                    and fk["referenced_columns"] == ["org_id", "id"]
                    for fk in table["foreign_keys"]
                ]
                assert any(actor_fks), (table["name"], name)
                matching_fk = next(
                    fk for fk in table["foreign_keys"]
                    if fk["columns"] == ["org_id", name]
                    and fk["references"] == "core.memberships"
                )
                expected_cardinality = "M:0..1" if columns[name][2] else "M:1"
                assert matching_fk["cardinality"] == expected_cardinality

            for index in table["indexes"]:
                assert set(CONTRACT["index_shape"]["required_keys"]) == index.keys()
                assert index["columns"][0] == "org_id", (table["name"], index["name"])
                assert index["purpose"].strip()


def test_business_facts_are_typed_relational_and_not_unbounded_json() -> None:
    denied = set(CONTRACT["json_business_fact_denylist"])
    generic_source_columns = {"source_id", "source_type", "document_ids", "foreign_keys"}

    for catalog in CATALOGS.values():
        for table in catalog["tables"]:
            columns = _columns(table)
            assert not (set(columns) & generic_source_columns), table["name"]
            for column in table["columns"]:
                if column[1] != "jsonb":
                    continue
                lowered = column[0].lower()
                assert not any(term in lowered for term in denied)


def test_accounting_event_has_exactly_one_typed_source_and_unique_journal() -> None:
    table = _table("finance.accounting_events")
    source_columns = {
        "sales_invoice_id", "supplier_invoice_id", "adjustment_note_id",
        "payment_id", "expense_claim_id", "inventory_document_id", "withholding_id",
    }
    columns = _columns(table)
    expression = _expressions(table)

    assert source_columns <= columns.keys()
    assert "num_nonnulls(" in expression and "= 1" in expression
    assert _index(table, "accounting_events_journal_uq")["unique"] is True
    for source in source_columns:
        matching = [
            index for index in table["indexes"]
            if index["columns"] == ["org_id", source]
            and index["unique"] and index["where"] == f"{source} IS NOT NULL"
        ]
        assert len(matching) == 1, source


def test_double_entry_fx_and_reversal_invariants_are_explicit() -> None:
    journal = _table("finance.journal_entries")
    journal_checks = _expressions(journal)
    journal_triggers = _cross_row_rules(journal).lower()
    line_checks = _expressions(_table("finance.journal_lines"))

    assert "transaction_debit_total = transaction_credit_total" in journal_checks
    assert "functional_debit_total = functional_credit_total" in journal_checks
    assert "fx_rate > 0" in journal_checks
    assert all(term in journal_triggers for term in ("at least two lines", "line sums", "currency", "reversal"))
    assert "transaction_debit > 0" in line_checks and "transaction_credit > 0" in line_checks
    assert _index(journal, "journal_entries_reversal_uq")["unique"] is True


def test_open_items_allocations_and_bank_reconciliation_are_reversible_links() -> None:
    open_item = _table("finance.open_items")
    allocation = _table("finance.allocations")
    match = _table("finance.reconciliation_matches")

    assert "balance" not in _columns(open_item)
    assert {
        "payment_id", "withholding_id", "adjustment_note_id",
        "purchase_order_advance_allocation_id", "open_item_id",
        "reversal_of_allocation_id",
    } <= _columns(allocation).keys()
    assert (
        "num_nonnulls(payment_id,withholding_id,adjustment_note_id,"
        "purchase_order_advance_allocation_id,source_open_item_id) = 1"
    ) in _expressions(allocation)
    assert any(
        fk["columns"] == ["org_id", "purchase_order_advance_allocation_id"]
        and fk["references"] == "procurement.purchase_order_advance_allocations"
        for fk in allocation["foreign_keys"]
    )
    assert _index(allocation, "allocations_purchase_advance_idx")["where"] == (
        "purchase_order_advance_allocation_id IS NOT NULL"
    )
    assert _index(allocation, "allocations_reversal_uq")["unique"] is True
    allocation_triggers = _cross_row_rules(allocation)
    assert "Lock the exact settlement source" in allocation_triggers
    assert "not above either source amount or target principal" in allocation_triggers
    assert {"bank_statement_line_id", "journal_entry_id", "reversal_of_match_id"} <= _columns(match).keys()
    assert _index(match, "reconciliation_matches_reversal_uq")["unique"] is True
    assert "exceeding" in _cross_row_rules(match)


def test_expense_claim_approval_precedes_exactly_one_accounting_event() -> None:
    claim = _table("finance.expense_claims")
    checks = _expressions(claim)
    triggers = _cross_row_rules(claim)

    assert "approved_by_membership_id <> claimant_membership_id" in checks
    assert "status NOT IN ('posted','reversed')" in checks
    assert "Only approved claims may post" in triggers
    assert "exactly one accounting event" in triggers


def test_adjustment_notes_preserve_canonical_tax_and_payable_outputs() -> None:
    header = _table("finance.adjustment_notes")
    line = _table("finance.adjustment_note_lines")
    header_columns = _columns(header)
    line_columns = _columns(line)

    assert {
        "gross_price_amount", "discount_amount", "net_value_amount",
        "gst_taxable_value", "cgst_amount", "sgst_amount", "igst_amount",
        "cess_amount", "recipient_assessed_tax_amount", "rounding_adjustment",
        "counterparty_payable_amount", "zero_rated_payment_mode",
        "tax_charge_mechanism",
    } <= header_columns.keys()
    assert not ({"subtotal_amount", "taxable_amount", "tax_amount", "total_amount"}
                & header_columns.keys())
    assert {
        "billed_quantity", "quoted_unit_rate", "price_basis",
        "net_value_amount", "gst_taxable_value", "taxability_snapshot",
        "tax_charge_mechanism", "recipient_assessed_tax_amount",
    } <= line_columns.keys()
    assert not ({"quantity", "unit_price", "taxable_amount"} & line_columns.keys())
    assert "tax_charge_mechanism = 'reverse_charge'" in _expressions(header)
    assert "line_total = net_value_amount" in _expressions(line)
    assert "canonical Decimal calculator" in _cross_row_rules(line)


def test_tax_documents_have_exact_typed_sources_and_immutable_snapshots() -> None:
    table = _table("tax.documents")
    columns = _columns(table)
    sources = {"sales_invoice_id", "supplier_invoice_id", "adjustment_note_id"}
    expression = _expressions(table)

    assert sources <= columns.keys()
    assert "taxable_advance_payment_id" not in columns
    assert {"tax_ruleset_version", "tax_ruleset_effective_date", "source_hash",
            "place_of_supply_state_code", "supply_type",
            "net_value_amount", "gst_taxable_value", "tax_charge_mechanism",
            "tax_liability_party", "self_assessed_tax_amount",
            "counterparty_payable_amount", "zero_rated_payment_mode",
            "rounding_adjustment", "document_effect",
            "adjusts_tax_document_id"} <= columns.keys()
    assert "num_nonnulls(" in expression and "= 1" in expression
    assert "cgst_amount = sgst_amount" in expression
    assert "direction = 'inward' AND self_assessed_tax_amount" in expression
    assert "direction = 'outward' AND self_assessed_tax_amount = 0" in expression
    assert "zero_rated_payment_mode = 'without_payment'" in expression
    assert "zero_rated_payment_mode = 'with_igst'" in expression
    for source in sources:
        assert any(
            index["unique"] and index["columns"] == ["org_id", source]
            and index["where"] == f"{source} IS NOT NULL"
            for index in table["indexes"]
        )
    assert "block update and delete" in _cross_row_rules(table).lower()


def test_withholding_is_typed_statutory_settlement_not_payment_metadata() -> None:
    table = _table("tax.withholdings")
    columns = _columns(table)
    checks = _expressions(table)
    rules = _cross_row_rules(table)

    assert {
        "open_item_id", "triggered_by_payment_id", "counterparty_party_id",
        "tax_regime", "governing_act_code", "provision_code", "rule_version_id",
        "deduction_trigger", "deduction_date", "basis_amount", "withholding_rate",
        "income_tax_rate", "cgst_rate", "sgst_rate", "igst_rate",
        "income_tax_amount", "cgst_amount", "sgst_amount", "igst_amount",
        "withheld_amount", "deductor_tax_identifier", "deductee_identifier_kind",
        "deposit_due_date", "reversal_of_withholding_id",
    } <= columns.keys()
    assert "tax_regime = 'income_tax_tds'" in checks
    assert "tax_regime = 'gst_tds'" in checks
    assert "206c" not in json.dumps(table).lower()
    assert "income_tax_amount = round(basis_amount * income_tax_rate / 100,2)" in checks
    assert "cgst_amount = round(basis_amount * cgst_rate / 100,2)" in checks
    assert "sgst_amount = round(basis_amount * sgst_rate / 100,2)" in checks
    assert "igst_amount = round(basis_amount * igst_rate / 100,2)" in checks
    assert "earlier credit/payment event" in rules
    assert "GST TDS" in rules
    assert "basis excludes invoice GST and cess" in rules
    assert "exactly one accounting event" in rules

    accounting = _table("finance.accounting_events")
    allocation = _table("finance.allocations")
    assert "withholding_id" in _columns(accounting)
    assert "withholding_id" in _columns(allocation)
    assert _index(allocation, "allocations_withholding_uq")["unique"] is True

    assert not {
        "deposited_at", "challan_reference", "reported_at",
        "statement_reference", "certificate_reference",
    } & columns.keys()
    assert {
        "tax.withholding_deposits", "tax.withholding_deposit_lines",
        "tax.withholding_statements", "tax.withholding_statement_lines",
        "tax.withholding_certificates", "tax.withholding_certificate_lines",
    } <= EXPECTED_TABLES["tax"]


def test_withholding_rules_fiscal_facts_and_basis_are_typed_authorities() -> None:
    rule = _table("tax.withholding_rule_versions")
    facts = _table("tax.organization_fiscal_tax_facts")
    basis = _table("tax.withholding_basis_lines")
    withholding = _table("tax.withholdings")

    assert rule["tenant_class"] == "global_reference"
    assert rule["population_mode"] == "regulated_import"
    assert _columns(rule)["id"][3] is None
    assert any(
        fk["columns"] == ["release_id"]
        and fk["references"] == "core.reference_data_releases"
        for fk in rule["foreign_keys"]
    )
    rule_checks = _expressions(rule)
    assert "fiscal_year_start_from BETWEEN 2000 AND 9999" in rule_checks
    assert "deductor_person_type IN ('any','individual','huf','company'" in rule_checks
    assert "deductee_person_type IN ('any','individual','huf','company'" in rule_checks
    assert "organization_prior_fy_turnover_threshold" in rule_checks
    assert "aggregation_scope IN ('party_rule_fiscal_year','contract')" in rule_checks

    fact_columns = _columns(facts)
    assert {
        "fiscal_year_start_year", "effective_from", "effective_to",
        "organization_person_type", "prior_fiscal_year_turnover",
        "gst_tds_notified_deductor", "tan", "evidence_attachment_id",
        "verified_at", "verified_by_membership_id",
    } <= fact_columns.keys()
    fact_checks = _expressions(facts)
    assert "effective_from=make_date(fiscal_year_start_year,4,1)" in fact_checks
    assert "effective_to=make_date(fiscal_year_start_year+1,3,31)" in fact_checks
    assert "tan ~ '^[A-Z]{4}[0-9]{5}[A-Z]$'" in fact_checks
    assert "Indian fiscal year beginning 1 April" in _cross_row_rules(facts)

    basis_columns = _columns(basis)
    assert {
        "withholding_id", "rule_version_id", "supplier_invoice_line_id",
        "expense_claim_line_id", "purchase_order_advance_allocation_id",
        "counterparty_party_id",
        "fiscal_year_start_year", "nature_code", "contract_reference",
        "source_event_date", "source_gross_amount",
        "excluded_gst_cess_amount", "prior_advance_basis_amount",
        "eligible_basis_amount",
    } <= basis_columns.keys()
    basis_checks = _expressions(basis)
    assert (
        "num_nonnulls(supplier_invoice_line_id,expense_claim_line_id,"
        "purchase_order_advance_allocation_id)=1"
    ) in basis_checks
    assert (
        "eligible_basis_amount=source_gross_amount-excluded_gst_cess_amount-"
        "prior_advance_basis_amount"
    ) in basis_checks
    assert any(
        fk["columns"] == ["org_id", "purchase_order_advance_allocation_id"]
        and fk["references"] == "procurement.purchase_order_advance_allocations"
        for fk in basis["foreign_keys"]
    )
    assert _index(basis, "withholding_basis_lines_advance_idx")["unique"] is True
    assert "cannot be updated or deleted" in _cross_row_rules(basis)

    assert any(
        fk["columns"] == ["rule_version_id"]
        and fk["references"] == "tax.withholding_rule_versions"
        for fk in withholding["foreign_keys"]
    )
    assert any(
        fk["columns"] == ["rule_version_id"]
        and fk["references"] == "tax.withholding_rule_versions"
        for fk in basis["foreign_keys"]
    )


def test_license_vocabulary_is_executable_and_perpetual_drug_licenses_use_review_dates() -> None:
    table = _table("compliance.licenses")
    columns = _columns(table)
    checks = _expressions(table)
    rules = _cross_row_rules(table)

    assert "license_type_version" not in columns
    assert "next_verification_due_on" in columns
    assert columns["valid_until"][2] is True
    for code in (
        "drug_wholesale_form_20b",
        "drug_wholesale_form_21b",
        "drug_schedule_x_wholesale_form_20g",
        "state_pharmacist_registration",
    ):
        assert code in checks
    assert "valid_until IS NULL AND next_verification_due_on IS NOT NULL" in checks
    assert "database CHECK is the executable v1 vocabulary" in rules


def test_return_population_portal_and_reconciliation_are_relational() -> None:
    membership = _table("tax.return_documents")
    portal = _table("tax.portal_documents")
    portal_line = _table("tax.portal_document_lines")
    item = _table("tax.reconciliation_items")

    assert membership["tenant_class"] == "tenant_association"
    assert membership["primary_key"] == ["org_id", "return_id", "tax_document_id"]
    assert portal["mutation_class"] == "guarded_external_import"
    assert {"source_attachment_id", "source_sha256"} <= _columns(portal).keys()
    assert "immutable" in _cross_row_rules(portal).lower()
    assert {"portal_document_id", "source_row_hash"} <= _columns(portal_line).keys()
    assert {"tax_document_id", "portal_document_line_id"} <= _columns(item).keys()
    assert "num_nonnulls(tax_document_id,portal_document_line_id) >= 1" in _expressions(item)


@pytest.mark.parametrize("name", ["tax.eway_bills", "tax.einvoices"])
def test_authority_artifacts_are_versioned_bounded_and_typed_source_owned(name: str) -> None:
    table = _table(name)
    columns = _columns(table)
    references = {fk["references"] for fk in table["foreign_keys"]}

    assert "tax_document_id" in columns
    if name == "tax.eway_bills":
        assert "inventory_document_id" in columns
        assert "inventory.inventory_documents" in references
        assert "inventory_document_id IS NOT NULL" in _expressions(table)
        assert columns["tax_document_id"][2] is True
        assert any(
            fk["columns"] == ["org_id", "inventory_document_id"]
            and fk["references"] == "inventory.inventory_documents"
            for fk in table["foreign_keys"]
        )
        assert any(
            fk["columns"] == ["org_id", "tax_document_id"]
            and fk["references"] == "tax.documents"
            and fk["cardinality"] == "M:0..1"
            for fk in table["foreign_keys"]
        )
    assert not ({"sales.invoices", "procurement.supplier_invoices"} & references)
    assert {"request_media_type", "request_bytes", "request_sha256",
            "response_media_type", "response_bytes", "response_sha256"} <= columns.keys()
    assert any(
        index["unique"]
        and index["columns"] == ["org_id", "supersedes_artifact_id"]
        and index["where"] == "supersedes_artifact_id IS NOT NULL"
        for index in table["indexes"]
    )
    assert "supersedes_artifact_id" in columns
    assert "regeneration" in _cross_row_rules(table).lower()


def test_recall_license_temperature_and_regulated_stock_lineage() -> None:
    license_table = _table("compliance.licenses")
    recall_batch = _table("compliance.recall_batches")
    reading = _table("compliance.temperature_readings")
    controlled = _table("compliance.controlled_substance_entries")
    destruction = _table("compliance.destructions")

    assert "num_nonnulls(organization_subject_id,branch_id,membership_id,employee_id,party_id) = 1" in _expressions(license_table)
    assert recall_batch["tenant_class"] == "tenant_association"
    assert recall_batch["primary_key"] == ["org_id", "recall_id", "batch_id"]
    assert {"affected_quantity", "quarantined_quantity", "recovered_quantity",
            "destroyed_quantity", "released_quantity"} <= _columns(recall_batch).keys()
    assert _columns(reading)["location_id"][2] is False
    assert _columns(reading)["batch_id"][2] is True
    assert {"batch_id", "stock_ledger_entry_id"} <= _columns(controlled).keys()
    assert not ({"patient_id", "doctor_id", "prescription_id"} & _columns(controlled).keys())
    assert any(unique["name"] == "controlled_substance_entries_ledger_uq"
               for unique in controlled["uniques"])
    assert any(unique["name"] == "destructions_inventory_document_uq"
               for unique in destruction["uniques"])
    assert "never mutates stock" in _cross_row_rules(destruction)

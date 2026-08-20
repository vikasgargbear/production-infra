import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT = REPO_ROOT / "backend" / "scripts" / "generate_canonical_data_dictionary.py"
DICTIONARY = REPO_ROOT / "docs" / "architecture" / "canonical-field-dictionary.json"
AGENT_GUIDE = REPO_ROOT / "docs" / "architecture" / "data-model-for-agents.md"


def _module():
    spec = importlib.util.spec_from_file_location("canonical_data_dictionary", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def _minimal_table(name: str, column_name: str, sql_type: str) -> dict:
    return {
        "name": name,
        "fact_owner": name.replace(".", "_"),
        "tenant_class": "tenant_direct",
        "mutation_class": "stateful",
        "lifecycle": {"states": ["active"], "initial": "active", "terminal": []},
        "retention": "test only",
        "columns": [
            ["org_id", "uuid", False, None, "internal"],
            ["id", "uuid", False, "gen_random_uuid()", "internal"],
            [column_name, sql_type, False, None, "internal"],
        ],
        "foreign_keys": [],
        "checks": [],
    }


def test_dictionary_is_current_complete_and_agent_readable() -> None:
    module = _module()
    assert DICTIONARY.read_text(encoding="utf-8") == module.generated_text()
    document = json.loads(DICTIONARY.read_text(encoding="utf-8"))

    assert document["table_count"] == len(document["tables"])
    fields = [field for table in document["tables"] for field in table["fields"]]
    assert document["field_count"] == len(fields)
    assert len({field["qualified_name"] for field in fields}) == len(fields)
    assert all(len(field["definition"]) >= 30 for field in fields)
    assert all(field["semantic_id"] for field in fields)
    assert all(field["definition_source"] for field in fields)
    assert not {field["name"] for field in fields} & module.FORBIDDEN_COLUMN_ALIASES
    assert not any(
        field["definition_source"] == "generic_inference"
        for field in fields
        if field["data_classification"] == "regulated"
    )

    semantics_by_name = {}
    for field in fields:
        semantics_by_name.setdefault(field["name"], set()).add(field["semantic_id"])
    ambiguous = document["naming_contract"]["ambiguous_shared_names"]
    assert {
        name for name, semantic_ids in semantics_by_name.items() if len(semantic_ids) > 1
    } == set(ambiguous)
    assert all(
        "Allowed values:" in field["definition"]
        for field in fields
        if field["allowed_values"]
    )

    by_name = {field["name"]: field for field in fields}
    for name in (
        "net_value_amount",
        "gst_taxable_value",
        "counterparty_payable_amount",
        "rounding_adjustment",
    ):
        assert by_name[name]["do_not_confuse_with"]

    by_qualified_name = {field["qualified_name"]: field for field in fields}
    assert "percentage-rate precision" not in by_qualified_name[
        "sales.order_lines.quoted_unit_rate"
    ]["definition"]
    assert "percentage-rate precision" not in by_qualified_name[
        "finance.payments.fx_rate"
    ]["definition"]
    assert "percentage-rate precision" in by_qualified_name[
        "tax.tax_code_versions.igst_rate"
    ]["definition"]
    assert len(ambiguous["direction"]) > 1
    assert len(ambiguous["rule_version_id"]) > 1
    assert len(ambiguous["return_id"]) > 1
    price_basis_ids = {
        field["semantic_id"] for field in fields if field["name"] == "price_basis"
    }
    assert price_basis_ids == {"vocabulary.price_basis"}

    exact_regulated = {
        "catalog.products.drug_schedule",
        "parties.tax_registrations.taxpayer_type",
        "procurement.supplier_invoice_lines.itc_eligibility",
        "sales.invoices.zero_rated_payment_mode",
        "inventory.batches.mrp_uom_conversion_id",
    }
    assert all(
        by_qualified_name[name]["definition_source"] == "exact_glossary"
        for name in exact_regulated
    )
    assert "Schedule H2" in by_qualified_name["catalog.products.drug_schedule"]["definition"]
    assert "GST registration taxpayer category" in by_qualified_name[
        "parties.tax_registrations.taxpayer_type"
    ]["definition"]
    assert "Input Tax Credit eligibility snapshot" in by_qualified_name[
        "procurement.supplier_invoice_lines.itc_eligibility"
    ]["definition"]
    assert "IGST payment route" in by_qualified_name[
        "sales.invoices.zero_rated_payment_mode"
    ]["definition"]
    assert "Tax-inclusive Maximum Retail Price in INR" in by_qualified_name[
        "inventory.batches.mrp"
    ]["definition"]


def test_dictionary_rejects_legacy_aliases(monkeypatch) -> None:
    module = _module()
    catalog = SimpleNamespace(tables=[_minimal_table("test.rows", "unit_rate", "numeric(20,4)")])
    monkeypatch.setattr(module, "_load_catalog", lambda: catalog)
    with pytest.raises(module.DictionaryError, match="unit_rate"):
        module._dictionary()


def test_dictionary_rejects_same_name_with_conflicting_types(monkeypatch) -> None:
    module = _module()
    catalog = SimpleNamespace(
        tables=[
            _minimal_table("test.first", "effective_marker", "date"),
            _minimal_table("test.second", "effective_marker", "timestamptz"),
        ]
    )
    monkeypatch.setattr(module, "_load_catalog", lambda: catalog)
    with pytest.raises(module.DictionaryError, match="conflicting SQL types"):
        module._dictionary()


def test_contextual_names_are_qualified_but_shared_business_names_are_stable(monkeypatch) -> None:
    module = _module()
    first = _minimal_table("test.first", "currency_code", "char(3)")
    second = _minimal_table("test.second", "currency_code", "char(3)")
    catalog = SimpleNamespace(tables=[first, second])
    monkeypatch.setattr(module, "_load_catalog", lambda: catalog)
    document = module._dictionary()
    currency_ids = {
        field["semantic_id"]
        for table in document["tables"]
        for field in table["fields"]
        if field["name"] == "currency_code"
    }
    id_ids = {
        field["semantic_id"]
        for table in document["tables"]
        for field in table["fields"]
        if field["name"] == "id"
    }
    assert currency_ids == {"common.currency_code"}
    assert id_ids == {"test.first.id", "test.second.id"}


def test_agent_guide_uses_current_canonical_fact_names() -> None:
    guide = AGENT_GUIDE.read_text(encoding="utf-8")
    for canonical_name in (
        "sales.invoice_lines",
        "inventory.stock_ledger_entries",
        "inventory.stock_balances",
        "finance.open_items",
        "finance.allocations",
        "finance.journal_entries",
        "finance.journal_lines",
    ):
        assert f"`{canonical_name}`" in guide
    for obsolete_name in (
        "sales.invoice_items",
        "inventory.inventory_movements",
        "financial.customer_outstanding",
        "financial.supplier_outstanding",
    ):
        assert f"`{obsolete_name}`" not in guide

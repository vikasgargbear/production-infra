from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import sys
from pathlib import Path


REPO = Path(__file__).resolve().parents[3]
ROOT = REPO / "database" / "canonical" / "commands_trade_v2"
GENERATOR = ROOT / "generate_trade_posting_contract.py"


def _module():
    spec = importlib.util.spec_from_file_location("trade_posting_contract", GENERATOR)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_generated_trade_posting_artifacts_are_current() -> None:
    mapping, manifest = _module().generated_artifacts()
    assert mapping == (ROOT / "baseline-trade-posting-enforcements.json").read_text()
    assert manifest == (ROOT / "trade-posting-manifest.json").read_text()
    parsed = json.loads(manifest)
    assert parsed["mapping_sha256"] == hashlib.sha256(mapping.encode()).hexdigest()


def test_trade_fragments_compose_without_duplicate_authority(tmp_path: Path) -> None:
    sql_path = tmp_path / "trade-composition.sql"
    blockers_path = tmp_path / "trade-composition-blockers.json"
    subprocess.run(
        [
            sys.executable,
            str(REPO / "backend/scripts/generate_canonical_baseline.py"),
            "--catalog-root",
            str(REPO / "database/canonical/domains"),
            "--enforcement-map",
            str(REPO / "database/canonical/commands_trade/baseline-trade-command-enforcements.json"),
            "--enforcement-map",
            str(ROOT / "baseline-trade-posting-enforcements.json"),
            "--draft",
            "--output",
            str(sql_path),
            "--blockers-output",
            str(blockers_path),
        ],
        cwd=REPO,
        check=True,
    )
    sql = sql_path.read_text()
    assert sql.count('CREATE FUNCTION "erp_trade_commands"."emit_entry"') == 1
    assert sql.count('CREATE FUNCTION "erp_trade_commands_v2"."approve_sales_order"') == 1
    assert sql.count('CREATE FUNCTION "erp_trade_commands_v2"."approve_purchase_order"') == 1
    unresolved = json.loads(blockers_path.read_text())["unresolved_invariants"]
    keys = {f"{item['table']}:{item['invariant']}" for item in unresolved}
    assert "sales.orders:sales_orders_invariant_1" not in keys
    assert "procurement.purchase_orders:procurement_purchase_orders_invariant_1" not in keys


def test_followup_exactly_partitions_the_seventeen_prior_blockers() -> None:
    mapping = json.loads((ROOT / "baseline-trade-posting-enforcements.json").read_text())
    manifest = json.loads((ROOT / "trade-posting-manifest.json").read_text())
    prior = json.loads(
        (REPO / "database/canonical/commands_trade/trade-commands-manifest.json").read_text()
    )
    resolved = {f"{entry['table']}:{entry['invariant']}" for entry in mapping["enforcements"]}
    assert len(resolved) == manifest["resolved_count"] == 9
    assert manifest["blocked_count"] == 8
    assert resolved.isdisjoint(manifest["blocked_invariants"])
    assert resolved | set(manifest["blocked_invariants"]) == set(prior["blocked_invariants"])


def test_landed_cost_uses_persisted_pools_and_deterministic_residuals() -> None:
    text = (ROOT / "baseline-trade-posting-enforcements.json").read_text()
    assert "SELECT line.* INTO source" in text
    assert "SELECT line, invoice.status INTO source" not in text
    assert "inventory_cost_treatment<>'capitalize'" in text
    assert "source.net_value_amount-receipt_cost" in text
    assert "cost_allocation_basis_quantity" in text
    assert "cost_allocation_basis_value" in text
    assert "pg_catalog.round(allocation.basis/allocation.basis_total,12)" in text
    assert "ELSE 1-COALESCE" in text
    assert "pool-COALESCE" in text
    assert "balance.on_hand_quantity<=0" in text
    assert "balance.inventory_value+line.extended_cost<0" in text


def test_followup_composes_the_only_writer_and_projector() -> None:
    text = (ROOT / "baseline-trade-posting-enforcements.json").read_text()
    manifest = json.loads((ROOT / "trade-posting-manifest.json").read_text())
    assert "INSERT INTO inventory.stock_ledger_entries" not in text
    assert "INSERT INTO inventory.stock_balances" not in text
    assert "erp_trade_commands.emit_entry" in text
    assert "erp_trade_commands.project_entry" not in text
    assert manifest["ownership"]["inventory_ledger_writer_added"] is False
    assert manifest["ownership"]["inventory_projector_added"] is False


def test_source_ownership_is_deferred_and_covers_every_typed_source() -> None:
    text = (ROOT / "baseline-trade-posting-enforcements.json").read_text()
    for token in (
        "sales_dispatch",
        "sales_invoice",
        "sales_return",
        "goods_receipt",
        "purchase_return",
        "destruction",
        "supplier_invoice",
    ):
        assert token in text
    assert text.count("DEFERRABLE INITIALLY DEFERRED") >= 9
    assert "reverses_document_id=owned_id AND status='posted'" in text


def test_mwa_adjustment_and_reversal_are_exact_zero_quantity_entries() -> None:
    text = (ROOT / "baseline-trade-posting-enforcements.json").read_text()
    assert "'value_adjustment',line.from_location_id" in text
    assert "0,new_average,line.extended_cost" in text
    assert "0,new_average,-original_entry.value_delta" in text
    assert "NEW.value_delta IS DISTINCT FROM -original.value_delta" in text
    assert "(balance.inventory_value+NEW.value_delta)/balance.on_hand_quantity,4" in text


def test_calculation_authority_is_consumed_only_where_all_effects_are_available() -> None:
    manifest = json.loads((ROOT / "trade-posting-manifest.json").read_text())
    gate = manifest["calculation_gate"]
    assert gate["status"] == "consumed_for_order_approvals; downstream-posting-effects-still-blocked"
    assert "calculation.artifacts" in gate["required_interface"]
    assert "authenticated, database-hashed fixed input/output" in gate["required_interface"]
    assert "application-supplied hash alone is never proof" in gate["required_interface"]
    assert all(
        "same restricted transaction" in item["reason"]
        for item in manifest["blocked_invariants"].values()
    )


def test_order_approvals_compare_fixed_input_output_and_consume_once() -> None:
    text = (ROOT / "baseline-trade-posting-enforcements.json").read_text()
    sql = "\n".join(
        statement
        for entry in json.loads(text)["enforcements"]
        for statement in entry["statements"]
    )
    assert "IS DISTINCT FROM\n          (CASE WHEN header.supply_type=" in sql
    assert "END) IS DISTINCT FROM header.document_discount_basis" in sql
    for token in (
        "erp_calculation_authority.consume_artifact(",
        "artifact.input_bytes",
        "pg_catalog.jsonb_array_length(p_output->'lines')<>expected_lines",
        "count(DISTINCT value->>'line_id')",
        "tax_version.ruleset_version IS DISTINCT FROM header.calculation_ruleset_version",
        "header.order_date<tax_version.effective_from",
        "output_line.item->>'final_residual')::boolean",
        "line.document_discount_amount",
        "line.document_taxable_discount_amount",
        "line.recipient_assessed_tax_amount",
    ):
        if token == "line.recipient_assessed_tax_amount":
            assert token not in text
        else:
            assert token in text
    assert "core.claim_idempotency_key" in json.loads(
        (ROOT / "trade-posting-manifest.json").read_text()
    )["ownership"]["preclaim_interface"]
    assert "status='consumed'" in text
    assert "consumed_at=pg_catalog.transaction_timestamp()" in text
    assert "approved commercial lines are immutable" in text
    assert "approved commercial terms are immutable" in text


def test_runtime_surface_has_three_idempotent_commands_and_fixture_rolls_back() -> None:
    text = (ROOT / "baseline-trade-posting-enforcements.json").read_text()
    fixture = (ROOT / "test_trade_posting_rollback.sql").read_text()
    grants = [line for line in text.splitlines() if "GRANT EXECUTE ON FUNCTION" in line]
    assert len(grants) == 3
    assert "erp_trade_commands.claim(" in text
    assert "erp_trade_commands.finish_claim(" in text
    assert "erp_trade_commands.assert_permission('inventory.document.post',doc.branch_id)" in text
    assert "erp_trade_commands.assert_permission('sales.order.manage',header.branch_id)" in text
    assert "erp_trade_commands.assert_permission('procurement.order.manage',header.branch_id)" in text
    assert "SET search_path = ''" in text
    assert fixture.startswith("\\set ON_ERROR_STOP on\n\nBEGIN;")
    assert fixture.rstrip().endswith("ROLLBACK;")


def test_mcp_prepare_boundary_requires_canonical_ids_and_explicit_commercial_facts() -> None:
    mapping = (ROOT / "baseline-trade-posting-enforcements.json").read_text()
    catalogs = {
        name: json.loads((REPO / "database/canonical/domains" / f"{name}.json").read_text())
        for name in ("sales", "procurement", "inventory")
    }
    sales_lines = next(t for t in catalogs["sales"]["tables"] if t["name"] == "sales.order_lines")
    purchase_lines = next(t for t in catalogs["procurement"]["tables"] if t["name"] == "procurement.purchase_order_lines")
    inventory_lines = next(t for t in catalogs["inventory"]["tables"] if t["name"] == "inventory.inventory_document_lines")

    for table in (sales_lines, purchase_lines):
        columns = {column[0]: column for column in table["columns"]}
        assert columns["product_id"][1] == "uuid"
        assert columns["uom_code"][1] == "varchar(16)"
        assert columns["line_discount_kind"][2] is False
        assert columns["line_discount_basis"][2] is False
        assert columns["line_discount_value"][2] is False
    inventory_columns = {column[0]: column for column in inventory_lines["columns"]}
    assert inventory_columns["product_id"][1:3] == ["uuid", False]
    assert inventory_columns["batch_id"][1:3] == ["uuid", False]
    assert inventory_columns["uom_code"][1:3] == ["varchar(16)", False]

    assert "p_resource_id uuid" in mapping
    assert "product_name" not in mapping
    assert "supplier_name" not in mapping
    assert "tax_version.id IS NULL" in mapping
    assert "tax_version.ruleset_version IS DISTINCT FROM header.calculation_ruleset_version" in mapping
    assert "input_line.item#>>'{line_discount,kind}' IS DISTINCT FROM line.line_discount_kind" in mapping
    assert "input_line.item->>'uom_conversion_factor'" in mapping

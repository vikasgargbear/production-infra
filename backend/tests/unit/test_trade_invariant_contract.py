import hashlib
import importlib.util
import json
import sys
from pathlib import Path

from scripts import generate_canonical_baseline as baseline


REPO_ROOT = Path(__file__).resolve().parents[3]
TRADE_ROOT = REPO_ROOT / "database" / "canonical" / "invariants_trade"
GENERATOR_PATH = TRADE_ROOT / "generate_trade_contract.py"
MAPPING_PATH = TRADE_ROOT / "baseline-trade-enforcements.json"
MANIFEST_PATH = TRADE_ROOT / "trade-invariants-manifest.json"


def _load_generator():
    spec = importlib.util.spec_from_file_location("canonical_trade_invariants", GENERATOR_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _mapping_sql() -> tuple[dict, dict[str, str], str]:
    mapping = json.loads(MAPPING_PATH.read_text(encoding="utf-8"))
    by_key = {
        f"{entry['table']}:{entry['invariant']}": "\n".join(entry["statements"])
        for entry in mapping["enforcements"]
    }
    return mapping, by_key, "\n".join(by_key.values())


def test_trade_artifacts_are_deterministic_and_catalog_bound() -> None:
    generator = _load_generator()
    mapping_text, manifest_text = generator.generated_artifacts()
    manifest = json.loads(manifest_text)

    assert MAPPING_PATH.read_text(encoding="utf-8") == mapping_text
    assert MANIFEST_PATH.read_text(encoding="utf-8") == manifest_text
    assert manifest["mapping_sha256"] == hashlib.sha256(mapping_text.encode()).hexdigest()
    assert manifest["resolved_count"] == 10
    assert manifest["blocked_count"] == 26
    assert manifest["resolved_count"] + manifest["blocked_count"] == 36
    assert {
        "inventory.inventory_documents:inventory_inventory_documents_physical_logistics",
        "procurement.purchase_order_advance_allocations:purchase_order_advance_allocations_cross_row_guard",
    } <= set(manifest["blocked_invariants"])
    assert set(manifest["trade_domains"]) == {"inventory", "sales", "procurement"}


def test_every_trade_invariant_has_one_honest_disposition() -> None:
    generator = _load_generator()
    invariants = generator._load_invariants()
    definitions = generator._definitions()

    assert set(definitions).isdisjoint(generator.BLOCKED_REASONS)
    assert set(invariants) == set(definitions) | set(generator.BLOCKED_REASONS)
    assert all(len(reason) >= 100 for reason in generator.BLOCKED_REASONS.values())


def test_trade_mapping_composes_without_claiming_blocked_rules() -> None:
    catalog = baseline.load_and_validate_catalog(REPO_ROOT / "database" / "canonical" / "domains")
    mapping_paths = sorted(
        (REPO_ROOT / "database" / "canonical").glob("**/baseline-*-enforcements.json")
    )
    mappings = baseline._merge_reviewed_mappings(
        [baseline._load_enforcement_mapping(path) for path in mapping_paths]
    )
    command_mapping_paths = [
        path
        for path in mapping_paths
        if any(part.startswith("commands_") for part in path.relative_to(REPO_ROOT).parts)
    ]
    command_mappings = baseline._merge_reviewed_mappings(
        [baseline._load_enforcement_mapping(path) for path in command_mapping_paths]
    )
    result = baseline.generate_baseline(
        catalog,
        enforcement_mapping=mappings.invariants,
        platform_mapping=mappings.platform,
        allow_draft=True,
    )
    unresolved = {
        blocker["key"]
        for blocker in result.blockers
        if blocker["category"] == "cross_row_invariant"
    }
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

    previously_blocked = set(manifest["blocked_invariants"])
    assert previously_blocked <= unresolved | set(command_mappings.invariants)
    assert previously_blocked & unresolved == (
        previously_blocked - set(command_mappings.invariants)
    )
    assert set(manifest["resolved_invariants"]).isdisjoint(unresolved)
    assert set(manifest["resolved_invariants"]) <= set(mappings.invariants)


def test_sql_is_static_private_and_does_not_add_a_stock_writer() -> None:
    _, _, sql = _mapping_sql()

    assert "IF NOT EXISTS" not in sql.upper()
    assert "SECURITY DEFINER" not in sql.upper()
    assert "SET search_path = ''" in sql
    assert "EXECUTE format" not in sql
    assert "set_config(" not in sql
    assert "INSERT INTO inventory.stock_ledger_entries" not in sql
    assert "UPDATE inventory.stock_balances" not in sql
    assert "DELETE FROM inventory.stock_balances" not in sql
    assert sql.count("CREATE SCHEMA \"erp_trade_invariants\"") == 1
    assert sql.count("CREATE FUNCTION \"erp_trade_invariants\"") == 9
    assert sql.count("REVOKE ALL ON FUNCTION \"erp_trade_invariants\"") == 9
    assert 'CREATE FUNCTION "inventory"."available_quantity"' in sql
    assert 'GRANT EXECUTE ON FUNCTION "inventory"."available_quantity"' in sql


def test_stock_identity_capacity_and_availability_are_exact_numeric_guards() -> None:
    _, by_key, _ = _mapping_sql()
    location = by_key["inventory.locations:inventory_locations_invariant_1"]
    batch = by_key["inventory.batches:inventory_batches_invariant_1"]
    capacity = by_key["inventory.reservations:inventory_reservations_invariant_1"]
    availability = by_key["inventory.stock_balances:inventory_stock_balances_invariant_2"]

    assert "posted batch identity, MRP, and marketed-pack basis are immutable" in batch
    assert "conversion.id=NEW.mrp_uom_conversion_id" in batch
    assert "conversion.product_id=NEW.product_id" in batch
    assert "conversion.to_uom_code=product.base_uom_code" in batch
    assert "conversion.valid_from<=NEW.created_at::date" in batch
    assert "validate_mrp_conversion:=TG_OP='INSERT'" in batch
    assert "INSERT OR UPDATE" in batch
    assert "inventory_document_lines" in location
    assert "goods_receipt_lines" in location
    assert "pg_advisory_xact_lock" in capacity
    assert "FOR UPDATE" in capacity
    assert "active_quantity > balance.on_hand_quantity" in capacity
    assert "RETURNS numeric(20,6)" in availability
    assert "balance.on_hand_quantity - COALESCE" in availability
    assert "reservation.expires_at > pg_catalog.transaction_timestamp()" in availability


def test_billed_free_dispatch_receipt_and_allocation_caps_are_separate() -> None:
    _, by_key, _ = _mapping_sql()
    dispatch = by_key["sales.dispatch_lines:sales_dispatch_lines_invariant_1"]
    receipt = by_key["procurement.goods_receipt_lines:procurement_goods_receipt_lines_invariant_1"]
    sales_allocation = by_key[
        "sales.invoice_dispatch_allocations:sales_invoice_dispatch_allocations_invariant_1"
    ]
    purchase_allocation = by_key[
        "procurement.supplier_invoice_receipt_allocations:procurement_supplier_invoice_receipt_allocations_invariant_1"
    ]

    for sql in (dispatch, receipt):
        assert "round(" in sql and ", 6)" in sql
        assert "billed_total" in sql and "free_total" in sql
        assert "pg_advisory_xact_lock" in sql
    assert "sum(line.base_accepted_quantity)" in receipt
    assert "sum(line.accepted_quantity + line.rejected_quantity)" not in receipt
    assert "parent.status='posted' OR parent.id=NEW.goods_receipt_id" in receipt
    for sql in (sales_allocation, purchase_allocation):
        assert "allocated_base_billed_quantity" in sql
        assert "allocated_base_free_quantity" in sql
        assert "pg_advisory_xact_lock" in sql
        assert "posted" in sql and "immutable" in sql


def test_direct_invoice_issue_is_exclusive_and_idempotency_gaps_stay_blocked() -> None:
    _, by_key, _ = _mapping_sql()
    direct = by_key["sales.invoices:sales_invoices_invariant_2"]
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    blocked = manifest["blocked_invariants"]

    assert "direct_count > 1" in direct
    assert "one invoice line cannot be both dispatch allocated and directly issued" in direct
    assert "NEW.document_type <> 'sales_issue'" in direct
    assert "pg_advisory_xact_lock" in direct
    assert "idempotent" in blocked[
        "inventory.inventory_documents:inventory_inventory_documents_invariant_1"
    ]["reason"]
    assert "cumulative reversal residuals" in blocked[
        "sales.return_lines:sales_return_lines_invariant_1"
    ]["reason"]
    assert "MWA" in blocked[
        "inventory.stock_ledger_entries:inventory_stock_ledger_entries_landed_cost"
    ]["reason"]

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


REPO = Path(__file__).resolve().parents[3]
ROOT = REPO / "database" / "canonical" / "commands_trade"
GENERATOR = ROOT / "generate_trade_commands_contract.py"


def _module():
    spec = importlib.util.spec_from_file_location("trade_commands_contract", GENERATOR)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_generated_trade_command_artifacts_are_current() -> None:
    mapping, manifest = _module().generated_artifacts()
    assert mapping == (ROOT / "baseline-trade-command-enforcements.json").read_text()
    assert manifest == (ROOT / "trade-commands-manifest.json").read_text()


def test_command_mapping_is_disjoint_and_partitions_prior_blockers() -> None:
    mapping = json.loads((ROOT / "baseline-trade-command-enforcements.json").read_text())
    manifest = json.loads((ROOT / "trade-commands-manifest.json").read_text())
    prior = json.loads(
        (REPO / "database/canonical/invariants_trade/trade-invariants-manifest.json").read_text()
    )
    keys = [f"{entry['table']}:{entry['invariant']}" for entry in mapping["enforcements"]]
    assert len(keys) == len(set(keys)) == manifest["resolved_count"] == 9
    assert set(keys).isdisjoint(prior["resolved_invariants"])
    assert set(keys) | set(manifest["blocked_invariants"]) == set(prior["blocked_invariants"])


def test_inventory_mutation_has_one_command_and_one_projector_owner() -> None:
    mapping_text = (ROOT / "baseline-trade-command-enforcements.json").read_text()
    manifest = json.loads((ROOT / "trade-commands-manifest.json").read_text())
    assert manifest["ownership"]["inventory_ledger_writer_count"] == 1
    assert manifest["ownership"]["inventory_projector_writer_count"] == 1
    assert mapping_text.count("INSERT INTO inventory.stock_ledger_entries") == 1
    assert mapping_text.count("INSERT INTO inventory.stock_balances") == 1
    assert "stock_ledger_command_owner_guard" in mapping_text
    assert "stock_balances_projector_owner_guard" in mapping_text


def test_inventory_posting_freezes_strict_batch_and_physical_logistics_facts() -> None:
    mapping_text = (ROOT / "baseline-trade-command-enforcements.json").read_text()

    assert "doc.document_date < batch.expires_on" in mapping_text
    assert "batch.lot_kind<>'manufacturer_batch'" in mapping_text
    assert "batch.status<>'released'" in mapping_text
    assert "doc.destination_branch_id=doc.branch_id" in mapping_text
    assert "source_location.branch_id IS DISTINCT FROM doc.branch_id" in mapping_text
    assert "destination_location.branch_id IS DISTINCT FROM doc.destination_branch_id" in mapping_text
    assert "assert_physical_logistics" in mapping_text
    assert "physical movement snapshot lacks active source, carrier, or valid start time" in mapping_text


def test_generic_inventory_post_and_reversal_cannot_bypass_typed_inventory_workflows() -> None:
    mapping_text = (ROOT / "baseline-trade-command-enforcements.json").read_text()

    assert "locked_document_type IN ('stock_count','transfer')" in mapping_text
    assert "event.inventory_document_id=doc.reverses_document_id" in mapping_text
    assert "original.document_type IN ('cost_adjustment','destruction','transfer')" in mapping_text
    assert "typed source documents must use their owning domain command" in mapping_text


def test_released_batch_blocking_requires_exact_cold_chain_scope() -> None:
    trade_invariants = (
        REPO / "database/canonical/invariants_trade/baseline-trade-enforcements.json"
    ).read_text()
    assert "OLD.status='released' AND NEW.status='blocked'" in trade_invariants
    assert "scope.scope='temperature_batch_block'" in trade_invariants
    assert "scope.org_id=NEW.org_id AND scope.entity_id=NEW.id" in trade_invariants


def test_commands_claim_idempotency_and_do_not_fake_calculation_or_landed_cost() -> None:
    mapping_text = (ROOT / "baseline-trade-command-enforcements.json").read_text()
    manifest = json.loads((ROOT / "trade-commands-manifest.json").read_text())
    assert "ON CONFLICT (org_id,actor_membership_id,operation,idempotency_key_hash) DO NOTHING" in mapping_text
    assert "response_status=200,response_media_type='application/json'" in mapping_text
    assert "response_hash=extensions.digest(response_body,'sha256')" in mapping_text
    assert "request_hash IS DISTINCT FROM p_request_hash" in mapping_text
    assert "document_type='cost_adjustment'" in mapping_text
    limitations = " ".join(manifest["limitations"])
    assert "landed-cost" in limitations
    assert "Decimal" in limitations
    assert "return" in limitations
    assert "sales.invoices:sales_invoices_invariant_1" in manifest["blocked_invariants"]
    assert "inventory.inventory_documents:inventory_inventory_documents_landed_cost" in manifest["blocked_invariants"]


def test_security_definer_commands_recheck_live_permission_and_branch_scope() -> None:
    mapping_text = (ROOT / "baseline-trade-command-enforcements.json").read_text()
    fixture = (ROOT / "test_trade_commands_rollback.sql").read_text()
    security_text = (
        REPO / "database/canonical/security/canonical_rls.sql"
    ).read_text()
    assert "erp_security.can_access_branch(p_branch_id)" in mapping_text
    assert "erp_security.has_permission(p_permission_code,p_branch_id)" in mapping_text
    assert "assert_permission('inventory.document.post',document_branch_id)" in mapping_text
    assert "assert_permission('sales.dispatch.post',source.branch_id)" in mapping_text
    assert "assert_permission('procurement.receipt.post',source.branch_id)" in mapping_text
    assert mapping_text.count("assert_permission('inventory.document.post',source.branch_id)") == 2
    assert "revoked trade permission remained executable" in fixture
    assert "EXCEPTION WHEN insufficient_privilege" in fixture
    assert "trade permission authority does not reject revoked or expired grants" in fixture
    assert "'app.org_id','91000000-0000-7000-8000-000000000002',true" in fixture
    assert "'app.request_id','91000000-0000-7000-8000-000000000008',true" in fixture
    assert "ALTER TABLE core.organizations DISABLE TRIGGER USER" in fixture
    assert fixture.index("DISABLE TRIGGER USER") < fixture.index("INSERT INTO core.organizations")
    assert "ENABLE TRIGGER USER" not in fixture
    assert "valid_from_at" in fixture
    assert "valid_from," not in fixture
    assert "grant_row.status = 'active'" in security_text
    assert "grant_row.expires_at > pg_catalog.transaction_timestamp()" in security_text


def test_goods_receipt_post_rechecks_po_ceilings_and_updates_lifecycle() -> None:
    mapping_text = (ROOT / "baseline-trade-command-enforcements.json").read_text()
    for fragment in (
        "count(DISTINCT line.purchase_order_id)",
        "purchase_order.status IN ('approved','partially_received')",
        "receipt_line.base_accepted_quantity",
        "receipt_line.base_free_quantity",
        "receipt.status='posted' OR receipt.id=p_goods_receipt_id",
        "goods receipt exceeds the locked accepted billed or free purchase-order ceiling",
        "PERFORM erp_trade_commands.post_locked_document",
        "CASE WHEN remaining_count=0 THEN 'received' ELSE 'partially_received' END",
        "purchase order receipt lifecycle changed during posting",
    ):
        assert fragment in mapping_text
    post_inventory_at = mapping_text.index(
        "PERFORM erp_trade_commands.post_locked_document(p_org_id,p_inventory_document_id,p_actor_id)"
    )
    mark_receipt_at = mapping_text.index(
        "UPDATE procurement.goods_receipts SET status='posted'", post_inventory_at
    )
    mark_order_at = mapping_text.index(
        "UPDATE procurement.purchase_orders", mark_receipt_at
    )
    finish_at = mapping_text.index(
        "erp_trade_commands.finish_claim", mark_order_at
    )
    assert post_inventory_at < mark_receipt_at < mark_order_at < finish_at


def test_runtime_surface_is_narrow_and_rollback_fixture_is_non_persistent() -> None:
    mapping_text = (ROOT / "baseline-trade-command-enforcements.json").read_text()
    fixture = (ROOT / "test_trade_commands_rollback.sql").read_text()
    grants = [line for line in mapping_text.splitlines() if "GRANT EXECUTE ON FUNCTION" in line]
    assert len(grants) == 3
    assert fixture.startswith("\\set ON_ERROR_STOP on\n\nBEGIN;")
    assert fixture.rstrip().endswith("ROLLBACK;")

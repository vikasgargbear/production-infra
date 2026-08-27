from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from .config import Live18GateError, load_live18_config
from .contract import (
    REQUIRED_DATABASE_RELATIONS,
    load_operation_matrix,
    load_ready_operation_matrix,
)
from .mcp_readback import mcp_readback_arguments
from .scope import out_of_scope_paths


ROOT = Path(__file__).resolve().parents[3]


def _json(path: Path):
    return json.loads(path.read_text())


def test_matrix_has_the_exact_18_named_business_operations() -> None:
    contracts = load_operation_matrix()
    assert {item.id for item in contracts} == {
        "sales_invoice", "sales_order", "delivery_challan", "purchase_order",
        "goods_receipt", "supplier_invoice", "customer_receipt", "supplier_payment",
        "supplier_advance", "sales_return", "purchase_return", "stock_adjustment",
        "stock_transfer", "destruction", "customer_credit_note", "supplier_debit_note",
        "bank_reconciliation", "expense_claim",
    }


def test_browser_certification_selects_only_explicitly_ready_templates() -> None:
    ready = load_ready_operation_matrix()
    readiness = _json(ROOT / "docs/testing/live18-ui-template-readiness.json")
    assert len(ready) == readiness["ready_count"]
    assert {item.id for item in ready} == {
        row["id"] for row in readiness["operations"] if row["status"] == "ready"
    }
    assert "destruction" in {item.id for item in ready}
    assert len(ready) == 17
    assert "expense_claim" not in {item.id for item in ready}
    deferred = next(
        item for item in load_operation_matrix() if item.id == "expense_claim"
    )
    assert deferred.certification_status == "deferred"
    assert deferred.certification_blocker_code == "EXPENSE_EVIDENCE_STORAGE_DEFERRED"
    assert deferred.certification_blocker


def test_published_matrix_matches_the_reviewed_mcp_registry() -> None:
    contracts = load_operation_matrix()
    published = [item for item in contracts if item.availability == "published"]
    mcp_contract = _json(ROOT / "docs/architecture/mcp-operator-actions.json")
    published_commands = set(mcp_contract["publication"]["published_prepare_operations"])
    prepare_tools = {row["tool"] for row in mcp_contract["prepare_actions"]}
    read_tools = {
        row["tool"] for section in ("resolution_reads", "shared_actions")
        for row in mcp_contract[section]
    }

    assert {item.command_operation for item in published} == published_commands
    assert all(item.prepare_tool in prepare_tools for item in published)
    assert all(item.mcp_readback_tool in read_tools for item in published)


def test_matrix_cannot_drift_from_the_central_core_authority_matrix() -> None:
    contracts = load_operation_matrix()
    authority = _json(ROOT / "docs/architecture/core-operation-authority-matrix.json")
    authority_by_id = {row["id"]: row for row in authority["operations"]}
    aliases = {
        "delivery_challan": "sales_dispatch",
        "stock_adjustment": "inventory_adjustment",
        "stock_transfer": "inventory_transfer",
        "destruction": "inventory_destruction",
    }
    for contract in contracts:
        row = authority_by_id[aliases.get(contract.id, contract.id)]
        assert contract.command_operation == row["operation_key"]
        assert contract.prepare_tool == row["mcp_prepare_tool"]
        assert contract.rest_readback == row["rest_readback"]
        assert set(contract.database_relations) <= set(row["authoritative_tables"])
        assert REQUIRED_DATABASE_RELATIONS[contract.id] <= set(
            contract.database_relations
        ), f"{contract.id} omitted required persisted effects"
    assert set(REQUIRED_DATABASE_RELATIONS) == {contract.id for contract in contracts}


def test_every_claimed_scenario_is_present_and_owned_by_the_same_command() -> None:
    contracts = load_operation_matrix()
    scenario = _json(ROOT / "backend/tests/live_canonical/scenario_matrix.json")
    steps = {
        step["id"]: f"{step['operation']}.prepare"
        for journey in scenario["journeys"] for step in journey["steps"]
    }
    for contract in contracts:
        for step_id in contract.scenario_steps:
            assert steps[step_id] == contract.command_operation


def test_every_published_rest_readback_is_mounted() -> None:
    from app.main import app

    shape = lambda value: re.sub(r"\{[^}]+\}", "{}", value)
    mounted = {
        shape(path) for path, methods in app.openapi()["paths"].items()
        if "get" in methods
    }
    for contract in load_operation_matrix():
        if contract.availability == "published":
            assert shape(contract.rest_readback or "") in mounted, contract.id


def test_all_18_source_operations_remain_published_despite_one_release_deferral() -> None:
    contracts = load_operation_matrix()
    assert all(item.availability == "published" for item in contracts)
    expense = next(item for item in contracts if item.id == "expense_claim")
    assert expense.command_operation == "finance.expense_claim.prepare"
    assert expense.prepare_tool == "erp_expense_claim_prepare"
    assert expense.mcp_readback_tool == "erp_expense_claim_readback"


def test_every_declared_mcp_readback_has_an_exact_argument_contract() -> None:
    for operation in load_operation_matrix():
        assert operation.mcp_readback_tool != "erp_operation_status_get", operation.id
        arguments = mcp_readback_arguments(
            operation.mcp_readback_tool or "",
            branch_id="branch-id",
            command_id="command-id",
            resource_id="resource-id",
        )
        assert arguments


def test_command_bound_mcp_readbacks_receive_only_the_exact_command() -> None:
    command_bound = {
        "erp_sales_dispatch_readback",
        "erp_supplier_advance_readback",
        "erp_customer_receipt_readback",
        "erp_supplier_payment_readback",
        "erp_sales_return_readback",
        "erp_purchase_return_readback",
        "erp_inventory_adjustment_readback",
        "erp_inventory_transfer_readback",
        "erp_bank_reconciliation_get",
        "erp_expense_claim_readback",
    }
    for tool_name in command_bound:
        assert mcp_readback_arguments(
            tool_name,
            branch_id="branch-id",
            command_id="command-id",
            resource_id="resource-id",
        ) == {"command_request_id": "command-id"}


def test_scope_gate_rejects_product_edits() -> None:
    assert out_of_scope_paths([
        "frontend/e2e/live18/sales.spec.ts",
        "backend/tests/live_acceptance/test_contract.py",
        "frontend/src/components/payment/entry/ModularPaymentEntry.tsx",
    ]) == ("frontend/src/components/payment/entry/ModularPaymentEntry.tsx",)


def test_browser_harness_has_no_local_or_legacy_authority() -> None:
    files = [
        *(ROOT / "frontend/e2e/live18").glob("*.ts"),
        *(ROOT / "frontend/e2e/support/live18").glob("*.ts"),
    ]
    source = "\n".join(path.read_text() for path in files)
    for forbidden in (
        "localStorage", "indexedDB", "financial.", "master.organizations",
        "party-ledger-v2",
    ):
        assert forbidden not in source
    assert "parsed.protocol !== 'https:'" in source
    assert "LIVE18_FIXTURE_PATH" in source
    assert "LIVE18_EXPECTED_DEPLOYED_SHA" in source
    assert "LIVE18_DENIAL_ACCESS_TOKEN" in source
    assert "missing_required_steps" in source
    assert "self_approval_probe" in source
    assert "{{command_request_id}}" in source
    assert "unsupported runtime token" in source
    assert "LIVE18_RUN_TOKEN" in source
    assert re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", source, re.I) is None


def test_secondary_finance_reconciliation_is_bound_to_exact_prepare_lineage() -> None:
    source = (ROOT / "backend/tests/live_canonical/reconciliation.py").read_text()
    for fragment in (
        'prepare_request["bank_statement_line_id"]',
        'prepare_request["journal_entry_id"]',
        'prepare_request["reimbursement_account_id"]',
        'expected["expense_account_id"]',
        'expected["receipt_attachment_id"]',
        'prepare_request["original_document_id"]',
        'note["adjusts_open_item_id"] is not None',
        'note["tax_document_count"] == 1',
    ):
        assert fragment in source


def test_live_config_fails_before_io_when_incomplete() -> None:
    with pytest.raises(Live18GateError, match="LIVE18_WRITE_ACK"):
        load_live18_config({})


def test_live_config_rejects_one_user_and_non_sha(tmp_path: Path) -> None:
    fixture = tmp_path / "fixture.json"
    fixture.write_text("{}")
    values = {
        "LIVE18_WRITE_ACK": "canonical-disposable-only",
        "LIVE18_EXPECTED_DEPLOYED_SHA": "short",
    }
    with pytest.raises(Live18GateError, match="full lowercase git SHA"):
        load_live18_config(values)


def test_live_config_repr_redacts_passwords(tmp_path: Path) -> None:
    fixture = tmp_path / "fixture.json"
    fixture.write_text("{}")
    values = {
        "LIVE18_WRITE_ACK": "canonical-disposable-only",
        "LIVE18_EXPECTED_DEPLOYED_SHA": "a" * 40,
        "LIVE18_METADATA_URLS_JSON": '["https://app.invalid/meta","https://api.invalid/meta"]',
        "LIVE18_REQUESTER_EMAIL": "maker@example.invalid",
        "LIVE18_REQUESTER_PASSWORD": "maker-secret",
        "LIVE18_REVIEWER_EMAIL": "checker@example.invalid",
        "LIVE18_REVIEWER_PASSWORD": "checker-secret",
        "LIVE18_EXPECTED_ORG_ID": "d3000000-0000-7000-8000-000000000001",
        "LIVE18_EXPECTED_BRANCH_ID": "d3000000-0000-7000-8000-000000000002",
        "LIVE18_FIXTURE_PATH": str(fixture),
        "LIVE18_APP_ORIGIN": "https://app.invalid",
        "LIVE18_API_ORIGIN": "https://api.invalid",
        "LIVE18_MCP_ORIGIN": "https://mcp.invalid",
    }
    config = load_live18_config(values)
    assert "maker-secret" not in repr(config)
    assert "checker-secret" not in repr(config)

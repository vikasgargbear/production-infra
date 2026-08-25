from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime, timezone
from pathlib import Path
from uuid import uuid4

import pytest

from app.domain.operator_actions.contract import (
    PREPARE_PAYLOAD_MODELS,
    validate_prepare_payload_semantics,
)
from app.api.routes import canonical_adjustment_note_reads as reads
from app.infrastructure.operator_actions.registry import ACTION_ADAPTER_BINDINGS
from mcp_runtime.aasopharma_mcp.operator_actions import (
    PREPARE_ACTIONS,
    PUBLISHED_PREPARE_TOOL_NAMES,
)


def payload(*, side: str = "sales", direction: str = "credit", treatment: str = "commercial_only"):
    value = {
        "idempotency_key": "adjustment-note-contract-0001",
        "branch_id": str(uuid4()),
        "side": side,
        "direction": direction,
        "original_document_id": str(uuid4()),
        "note_date": date(2026, 8, 25).isoformat(),
        "gst_tax_treatment": treatment,
        "reason_code": "customer_rejection" if side == "sales" else "wrong_supply",
        "reason": "Contract test adjustment",
        "rounding_policy": "none",
        "document_discount": {
            "document_discount_kind": "none",
            "document_discount_basis": "taxable_value",
            "document_discount_value": "0",
        },
        "lines": [{
            "original_line_id": str(uuid4()),
            "billed_quantity": "1",
            "free_quantity": "0",
            "free_supply_tax_treatment": "excluded_from_taxable_value",
            "quoted_unit_rate": "100.0000",
            "price_basis": "tax_exclusive",
            "line_discount": {
                "line_discount_kind": "none",
                "line_discount_basis": "taxable_value",
                "line_discount_value": "0",
            },
            "document_discount_eligible": True,
        }],
    }
    return value


def validate(value):
    model = PREPARE_PAYLOAD_MODELS["finance.adjustment_note.prepare"].model_validate(value)
    validate_prepare_payload_semantics("finance.adjustment_note.prepare", model)


def test_standalone_adjustment_contract_is_typed_but_not_published() -> None:
    action = PREPARE_ACTIONS["erp_adjustment_note_prepare"]
    binding = ACTION_ADAPTER_BINDINGS[action.operation_key]

    assert action.permission == "finance.adjustment_note.manage"
    assert action.approval_policy == "separate_approver"
    assert action.tool_name not in PUBLISHED_PREPARE_TOOL_NAMES
    assert binding.available is False
    assert binding.execute_function == "erp_commercial_commands.post_adjustment_note"
    assert "no complete action-specific resolver" in binding.unavailable_reason


def test_only_exact_customer_credit_and_supplier_debit_pairs_are_accepted() -> None:
    validate(payload())
    validate(payload(side="purchase", direction="debit"))

    with pytest.raises(ValueError, match="only customer credit notes"):
        validate(payload(side="sales", direction="debit"))
    with pytest.raises(ValueError, match="only customer credit notes"):
        validate(payload(side="purchase", direction="credit"))


def test_statutory_evidence_is_side_specific_and_commercial_only_forbids_it() -> None:
    sales = payload(treatment="statutory")
    sales["recipient_itc_reversal_evidence_attachment_id"] = str(uuid4())
    sales["recipient_itc_reversal_confirmed_at"] = datetime.now(timezone.utc).isoformat()
    validate(sales)

    purchase = payload(side="purchase", direction="debit", treatment="statutory")
    purchase["counterparty_portal_document_line_id"] = str(uuid4())
    validate(purchase)

    invalid = deepcopy(payload())
    invalid["counterparty_portal_document_line_id"] = str(uuid4())
    with pytest.raises(ValueError, match="forbids statutory evidence"):
        validate(invalid)


def test_lines_require_unique_original_identity_and_positive_quantity() -> None:
    duplicate = payload()
    duplicate["lines"].append(deepcopy(duplicate["lines"][0]))
    with pytest.raises(ValueError, match="unique original_line_id"):
        validate(duplicate)

    zero = payload()
    zero["lines"][0]["billed_quantity"] = "0"
    with pytest.raises(ValueError, match="positive adjusted quantity"):
        validate(zero)


def test_database_has_exact_poster_but_shared_command_halves_are_absent() -> None:
    root = Path(__file__).resolve().parents[3]
    sql = (root / "backend/alembic/sql/20260820_0001_canonical_v1.sql").read_text()
    registry = (root / "backend/app/infrastructure/operator_actions/registry.py").read_text()

    assert 'CREATE FUNCTION "erp_commercial_commands"."post_adjustment_note"' in sql
    assert "generic posting requires an approved non-return adjustment note" in sql
    assert "adjustment journal is not balanced" in sql
    assert "INSERT INTO finance.allocations" in sql
    assert "INSERT INTO finance.open_items" in sql
    assert "INSERT INTO tax.documents" in sql
    assert "INSERT INTO finance.accounting_events" in sql
    assert "'finance.adjustment_note.post'" in sql

    # Recording the posting primitive in the unavailable binding is deliberate:
    # a poster cannot substitute for source resolution, immutable prepare, or a
    # reviewed automation dispatcher.
    assert '"finance.adjustment_note.prepare": _missing_action_resolver' in registry
    execute_function = sql.split(
        'CREATE FUNCTION "erp_automation_commands"."execute_approved_command"', 1
    )[1].split(
        'ALTER FUNCTION "erp_automation_commands"."execute_approved_command"', 1
    )[0]
    assert "WHEN 'finance.adjustment_note.post'" not in execute_function
    assert 'resolve_adjustment_note_prepare' not in sql
    assert 'persist_adjustment_note_prepare' not in sql


def test_authenticated_context_and_posted_readback_routes_are_mounted() -> None:
    paths = {route.path for route in reads.router.routes}
    assert paths == {
        "/canonical/adjustment-notes/context",
        "/canonical/adjustment-notes/{note_id}",
    }
    source = (Path(__file__).resolve().parents[3] / "backend/app/api/routes/canonical_adjustment_note_reads.py").read_text()
    assert 'PermissionChecker("finance", "view")' in source
    assert "erp_security.activate_context" in source
    assert "finance.adjustment_note_lines" in source
    assert "finance.accounting_events" in source
    assert "finance.journal_entries" in source
    assert "finance.allocations" in source
    assert "tax.gst_adjustment_rule_versions" in source
    assert "legacy" not in source.lower()

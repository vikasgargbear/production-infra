from __future__ import annotations

from datetime import date
import hashlib
import inspect
import json
from pathlib import Path
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.domain.operator_actions.contract import (
    ACTION_POLICIES,
    PREPARE_PAYLOAD_MODELS,
    validate_prepare_payload_semantics,
)
from app.infrastructure.operator_actions.registry import ACTION_ADAPTER_BINDINGS
from mcp_runtime.aasopharma_mcp.operator_actions import (
    PREPARE_ACTIONS,
    PUBLISHED_PREPARE_TOOL_NAMES,
)


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "alembic/sql/20260825_0009_expense_claim_command.sql"
REVISION = ROOT / "alembic/versions/20260825_0009_expense_claim_command.py"


def _payload() -> dict:
    return {
        "idempotency_key": "expense-claim-contract-0001",
        "branch_id": str(uuid4()),
        "claim_date": "2026-08-25",
        "period_start": "2026-08-01",
        "period_end": "2026-08-25",
        "purpose": "Approved customer-site consumables visit",
        "reimbursement_account_id": str(uuid4()),
        "tax_treatment": "non_creditable_gross_expense",
        "lines": [
            {
                "expense_date": "2026-08-24",
                "expense_account_id": str(uuid4()),
                "description": "Local transport to customer site",
                "merchant_name": "Verified Taxi Operator",
                "receipt_attachment_id": str(uuid4()),
                "claimed_amount": "168.00",
            }
        ],
    }


def test_expense_claim_is_one_published_strict_rest_and_mcp_prepare_contract() -> None:
    action = PREPARE_ACTIONS["erp_expense_claim_prepare"]
    assert action.operation_key == "finance.expense_claim.prepare"
    assert action.permission == "finance.expense.manage"
    assert action.approval_policy == "separate_approver"
    assert action.schema_profile == "verified_expense_receipts"
    assert "erp_expense_claim_prepare" in PUBLISHED_PREPARE_TOOL_NAMES
    assert ACTION_POLICIES[action.operation_key].branch_fields == ("branch_id",)
    assert ACTION_ADAPTER_BINDINGS[action.operation_key].available is True
    assert (
        ACTION_ADAPTER_BINDINGS[action.operation_key].prepare_function
        == "erp_automation_commands.persist_expense_claim_prepare"
    )

    model = PREPARE_PAYLOAD_MODELS[action.operation_key].model_validate(_payload())
    validate_prepare_payload_semantics(action.operation_key, model)
    assert model.lines[0].claimed_amount == "168.00"
    schema = action.input_schema
    assert schema["additionalProperties"] is False
    assert schema["properties"]["tax_treatment"]["enum"] == [
        "non_creditable_gross_expense"
    ]
    assert "approved_amount" not in json.dumps(schema)
    assert "tax_amount" not in json.dumps(schema)


def test_expense_claim_semantics_reject_bad_period_precision_and_receipt_reuse() -> None:
    operation = "finance.expense_claim.prepare"
    bad_period = _payload()
    bad_period["period_start"] = "2026-08-26"
    model = PREPARE_PAYLOAD_MODELS[operation].model_validate(bad_period)
    with pytest.raises(ValueError, match="period_end"):
        validate_prepare_payload_semantics(operation, model)

    bad_amount = _payload()
    bad_amount["lines"][0]["claimed_amount"] = "168.001"
    with pytest.raises(ValidationError, match="String should match pattern"):
        PREPARE_PAYLOAD_MODELS[operation].model_validate(bad_amount)

    duplicate = _payload()
    duplicate["lines"].append(dict(duplicate["lines"][0]))
    duplicate["lines"][1]["expense_date"] = date(2026, 8, 23).isoformat()
    model = PREPARE_PAYLOAD_MODELS[operation].model_validate(duplicate)
    with pytest.raises(ValueError, match="receipt"):
        validate_prepare_payload_semantics(operation, model)


def test_expense_claim_database_boundary_is_runtime_only_reviewed_and_exact_once() -> None:
    sql = MIGRATION.read_text(encoding="utf-8")
    revision = REVISION.read_text(encoding="utf-8")
    digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()
    assert 'revision = "20260825_0009"' in revision
    assert 'down_revision = "20260825_0008"' in revision
    assert digest in revision
    assert "CanonicalBaselineError" in revision.split("def downgrade", 1)[1]
    for function_name in (
        "resolve_expense_claim_prepare",
        "persist_expense_claim_prepare",
        "approve_expense_claim_command",
        "execute_approved_expense_claim",
    ):
        assert function_name in sql
    assert "SESSION_USER<>'erp_runtime'" in sql
    assert "finance.expense.submit" not in sql  # the reviewed primitive owns this label
    assert "erp_compliance_commands.submit_expense_claim" in sql
    assert "erp_compliance_commands.approve_expense_claim" in sql
    assert "erp_compliance_commands.post_expense_claim" in sql
    assert "approval.approver_membership_id<>command.requested_by_membership_id" in sql
    assert "line.approved_amount IS DISTINCT FROM line.claimed_amount" in sql
    assert "event_type='expense_claim'" not in sql  # event insertion stays inside post_expense_claim
    assert "GRANT EXECUTE" in sql
    assert "TO \"erp_runtime\"" in sql
    assert "TO \"erp_app\"" not in sql
    assert "non_creditable_gross_expense" in sql
    assert "expense receipt was already consumed" in sql
    assert "expense claim exceeds the active INR delegation limit" in sql
    assert "command.requested_amount>capability.maximum_amount" in sql
    assert "finance.expense_claim.prepare" in sql
    assert "finance.expense_claim.post" in sql
    assert "expense_claim" in sql


def test_expense_claim_has_mcp_posted_detail_readback_and_live_reconciliation() -> None:
    operations = (ROOT / "mcp_runtime/aasopharma_mcp/operations.py").read_text()
    assert '"erp_expense_claim_readback": (' in operations
    assert '"expense_claim_readback", "expense-claim-readback"' in operations
    assert '"automation.command.status.get"' in operations
    assert 'SHARED_ACTION_SCHEMAS[tool_name]' in operations
    routes = (ROOT / "app/api/routes/internal/mcp_actions.py").read_text()
    web = (ROOT / "app/api/routes/web_operator_actions.py").read_text()
    reconciler = (ROOT / "tests/live_canonical/reconciliation.py").read_text()
    assert "/commands/{command_request_id}/expense-claim-readback" in routes
    assert "/expense-claims/commands/{command_request_id}/review" in web
    assert "/expense-claims/commands/{command_request_id}/readback" in web
    assert '"finance.expense_claim"' in reconciler
    assert "expense_evidence" in reconciler


def test_postgres15_runtime_fixture_covers_two_actor_exactly_once_lifecycle() -> None:
    fixture_name = "check_canonical_expense_claim_lifecycle_runtime_role.py"
    fixture = (ROOT / "tests/postgres" / fixture_name).read_text(encoding="utf-8")
    gate = (
        ROOT.parent / "database/canonical/ci/run_alembic_postgres15_gate.sh"
    ).read_text(encoding="utf-8")
    for fragment in (
        'SET SESSION AUTHORIZATION "erp_runtime"',
        'join_transaction_mode="create_savepoint"',
        "service.prepare(",
        "claimant approved their own expense claim",
        "service.approve(",
        "service.execute(",
        "idempotency_replayed is True",
        'event.event_type=\'expense_claim\'',
        'Decimal("168.00")',
        "unverified receipt reached an expense claim command",
        "SELECT count(*) FROM core.organizations WHERE id=:other_org",
        "web_operator_actions.expense_claim_readback",
        "mcp_actions.expense_claim_readback",
        'journal_line_debit_total"] == Decimal("168.00")',
        "outer.rollback()",
    ):
        assert fragment in fixture
    assert fixture.count('SET SESSION AUTHORIZATION "erp_runtime"') >= 2
    assert fixture.count("service.execute(") == 2
    assert fixture_name in gate


def test_postgres15_head_privilege_fixture_keeps_helpers_private() -> None:
    fixture_name = "head_test_expense_claim_command.sql"
    fixture = (
        ROOT.parent / "database/canonical/commands_automation" / fixture_name
    ).read_text(encoding="utf-8")
    for fragment in (
        "runtime_count<>4",
        "resolve_expense_claim_prepare",
        "persist_expense_claim_prepare",
        "approve_expense_claim_command",
        "execute_approved_expense_claim",
        "private expense-claim assertion exposes execute privilege",
        "primitive_count<>3",
    ):
        assert fragment in fixture


def test_expense_claim_boundary_has_no_legacy_supabase_or_offline_fallback() -> None:
    migration = MIGRATION.read_text(encoding="utf-8").lower()
    adapter = (
        ROOT / "app/infrastructure/operator_actions/expense_claim.py"
    ).read_text(encoding="utf-8").lower()
    service = inspect.getsource(
        __import__(
            "app.infrastructure.operator_actions.service",
            fromlist=["SqlAlchemyOperatorActionService"],
        ).SqlAlchemyOperatorActionService._prepare_expense_claim
    ).lower()
    web_review = inspect.getsource(
        __import__(
            "app.api.routes.web_operator_actions",
            fromlist=["expense_claim_review"],
        ).expense_claim_review
    ).lower()
    mcp_readback = inspect.getsource(
        __import__(
            "app.api.routes.internal.mcp_actions",
            fromlist=["expense_claim_readback"],
        ).expense_claim_readback
    ).lower()
    boundary = "\n".join((migration, adapter, service, web_review, mcp_readback))
    for forbidden in (
        "supabase",
        "localstorage",
        "indexeddb",
        "offline",
        "legacy",
        " public.",
        "/api/expense-claims",
    ):
        assert forbidden not in boundary
    for canonical in (
        "finance.expense_claims",
        "finance.expense_claim_lines",
        "finance.journal_entries",
        "finance.accounting_events",
        "automation.command_requests",
    ):
        assert canonical in boundary

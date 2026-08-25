from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime, timezone
import hashlib
from pathlib import Path
from uuid import uuid4

import pytest

from app.domain.operator_actions.contract import (
    PREPARE_PAYLOAD_MODELS,
    validate_prepare_payload_semantics,
)
from app.api.routes import canonical_adjustment_note_reads as reads
from app.infrastructure.operator_actions.registry import ACTION_ADAPTER_BINDINGS
from app.infrastructure.operator_actions.adjustment_note import calculation_documents
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


def test_standalone_adjustment_contract_is_typed_published_and_durable() -> None:
    action = PREPARE_ACTIONS["erp_adjustment_note_prepare"]
    binding = ACTION_ADAPTER_BINDINGS[action.operation_key]

    assert action.permission == "finance.adjustment_note.manage"
    assert action.approval_policy == "separate_approver"
    assert action.tool_name in PUBLISHED_PREPARE_TOOL_NAMES
    assert binding.available is True
    assert binding.prepare_function == "erp_automation_commands.persist_adjustment_note_prepare"
    assert binding.execute_function == "erp_commercial_commands.post_adjustment_note"
    assert binding.unavailable_reason is None


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


@pytest.mark.parametrize(
    ("treatment", "expected_gst"),
    (("statutory", "18.00"), ("commercial_only", "0.00")),
)
def test_adjustment_calculation_is_typed_and_treatment_exact(
    treatment: str, expected_gst: str
) -> None:
    value = payload(treatment=treatment)
    line_id = uuid4()
    value["lines"][0]["line_id"] = str(line_id)
    resolution = {
        "supply_type": "inter_state",
        "zero_rated_payment_mode": "not_applicable",
        "ruleset_version": "gst-ruleset-test-v1",
        "lines": [{
            "line_id": str(line_id),
            "line_kind": "product",
            "multiplier": "1.000000",
            "gst_rate": "18.000000",
            "cess_rate": "0.000000",
            "taxability": "taxable",
            "input": value["lines"][0],
        }],
    }

    input_document, output_document = calculation_documents(
        value, resolution, adjustment_note_id=uuid4()
    )

    assert input_document["operation"] == "finance.adjustment_note.post"
    assert input_document["resource_type"] == "adjustment_note"
    assert input_document["document"]["gst_tax_treatment"] == treatment
    assert output_document["gst_tax_treatment"] == treatment
    assert output_document["totals"]["igst_total"] == expected_gst


def test_database_has_exact_resolve_prepare_dispatch_and_post_lifecycle() -> None:
    root = Path(__file__).resolve().parents[3]
    baseline = (root / "backend/alembic/sql/20260820_0001_canonical_v1.sql").read_text()
    sql = (
        root
        / "backend/alembic/sql/20260825_0007_adjustment_note_command.sql"
    ).read_text()
    registry = (root / "backend/app/infrastructure/operator_actions/registry.py").read_text()

    assert 'CREATE FUNCTION "erp_commercial_commands"."post_adjustment_note"' in baseline
    assert "generic posting requires an approved non-return adjustment note" in baseline
    assert "adjustment journal is not balanced" in baseline
    assert "INSERT INTO finance.allocations" in baseline
    assert "INSERT INTO finance.open_items" in baseline
    assert "INSERT INTO tax.documents" in baseline
    assert "INSERT INTO finance.accounting_events" in baseline

    assert '"finance.adjustment_note.prepare": ActionAdapterBinding' in registry
    execute_function = sql.split(
        'CREATE OR REPLACE FUNCTION "erp_automation_commands"."execute_approved_command"', 1
    )[1].split(
        'ALTER FUNCTION "erp_automation_commands"."execute_approved_command"', 1
    )[0]
    assert "WHEN 'finance.adjustment_note.post'" in execute_function
    assert 'resolve_adjustment_note_prepare' in sql
    assert 'persist_adjustment_note_prepare' in sql
    assert "WHEN 'finance.adjustment_note.prepare' THEN 'adjustment_note'" in sql
    assert (
        "WHEN 'finance.adjustment_note.prepare' THEN 'finance.adjustment_note.post'"
        in sql
    )
    command_guard = sql.rsplit(
        'CREATE OR REPLACE FUNCTION "erp_automation_commands"."guard_command_request_match"',
        1,
    )[1]
    assert command_guard.count("'finance.adjustment_note.prepare'") >= 6
    assert (
        "'sales.return.prepare','procurement.purchase_return.prepare',"
        "'finance.adjustment_note.prepare'"
    ) in command_guard
    assert "sales credit quantity exceeds remaining original invoice quantity" in sql
    assert "purchase debit quantity exceeds remaining original supplier-invoice quantity" in sql
    assert "adjustment-note approval transition lost its draft state" in sql
    assert "actual_status='draft' AND p_command_request_id IS NOT NULL" in sql
    assert "adjustment note is neither approved nor a command-bound draft" in sql


def test_incremental_adjustment_migration_is_hash_bound_linear_and_pg15_gated() -> None:
    root = Path(__file__).resolve().parents[3]
    sql_path = root / "backend/alembic/sql/20260825_0007_adjustment_note_command.sql"
    revision_path = (
        root / "backend/alembic/versions/20260825_0007_adjustment_note_command.py"
    )
    sql = sql_path.read_text()
    revision = revision_path.read_text()
    digest = hashlib.sha256(sql.encode()).hexdigest()
    gate = (root / "database/canonical/ci/run_alembic_postgres15_gate.sh").read_text()

    assert 'revision = "20260825_0007"' in revision
    assert 'down_revision = "20260825_0006"' in revision
    assert digest in revision
    assert "CanonicalBaselineError" in revision.split("def downgrade", 1)[1]
    assert sql.count("CREATE OR REPLACE FUNCTION") == 6
    assert "TO \"erp_runtime\"" in sql
    assert "TO \"erp_calculator\"" in sql
    assert "check_canonical_adjustment_note_runtime_role.py" in gate
    assert 'version_num FROM public.alembic_version\')\" = \"20260825_0009\"' in gate


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

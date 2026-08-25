from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime, timezone
from decimal import Decimal
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
    post_function = baseline.split(
        'CREATE FUNCTION "erp_commercial_commands"."post_adjustment_note"', 1
    )[1].split(
        'ALTER FUNCTION "erp_commercial_commands"."post_adjustment_note"', 1
    )[0]
    assert "inventory." not in post_function
    assert "note.sales_return_id IS NOT NULL" in post_function
    assert "note.purchase_return_id IS NOT NULL" in post_function
    inventory_table = baseline.split(
        'CREATE TABLE "inventory"."inventory_documents"', 1
    )[1].split("CREATE TABLE", 1)[0]
    assert "adjustment_note_id" not in inventory_table

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
    assert 'version_num FROM public.alembic_version\')\" = \"$expected_alembic_head\"' in gate


def test_source_authority_migration_is_hash_bound_and_rejects_client_policy() -> None:
    root = Path(__file__).resolve().parents[3]
    sql_path = (
        root
        / "backend/alembic/sql/20260825_0014_adjustment_note_source_authority.sql"
    )
    revision_path = (
        root
        / "backend/alembic/versions/20260825_0014_adjustment_note_source_authority.py"
    )
    sql = sql_path.read_text()
    revision = revision_path.read_text()

    assert 'revision = "20260825_0014"' in revision
    assert 'down_revision = "20260825_0013"' in revision
    assert hashlib.sha256(sql.encode()).hexdigest() in revision
    assert "CanonicalBaselineError" in revision.split("def downgrade", 1)[1]
    assert "resolve_adjustment_note_prepare_unchecked_v0013" in sql
    assert (
        "adjustment-note header calculation policy differs from the original document"
        in sql
    )
    assert (
        "adjustment-note line pricing or discount policy differs from the original sales invoice line"
        in sql
    )
    assert (
        "adjustment-note line pricing or discount policy differs from the original supplier invoice line"
        in sql
    )
    assert (
        "adjustment-note supply and tax authority must be derived from the original document"
        in sql
    )
    assert "FROM PUBLIC, erp_app, erp_runtime, erp_calculator" in sql
    assert "TO erp_runtime, erp_calculator" in sql


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
    assert "command.requested_by_membership_id" in source
    assert "approval.approver_membership_id<>command.requested_by_membership_id" in source
    assert "artifact.adjustment_note_id=note.id" in source
    assert "note.sales_return_id IS NULL AND note.purchase_return_id IS NULL" in source

    mcp_source = (
        Path(__file__).resolve().parents[3]
        / "backend/app/api/routes/internal/mcp_canonical_resolution_reads.py"
    ).read_text()
    assert "load_adjustment_note_readback" in mcp_source
    assert "return load_adjustment_note_readback(" in mcp_source


def test_context_publishes_exact_original_calculation_and_tax_authority() -> None:
    source = (
        Path(__file__).resolve().parents[3]
        / "backend/app/api/routes/canonical_adjustment_note_reads.py"
    ).read_text()

    for fact in (
        "invoice.rounding_policy",
        "invoice.document_discount_kind",
        "invoice.document_discount_basis",
        "invoice.document_discount_value",
        "source.line_discount_kind",
        "source.line_discount_basis",
        "source.line_discount_value",
        "source.document_discount_eligible",
        "source.tax_charge_mechanism",
        "source.tax_classification_code_snapshot",
        "source.tax_code_version_id",
        "source.taxability_snapshot",
        "source.cgst_rate",
        "source.sgst_rate",
        "source.igst_rate",
        "source.cess_rate",
    ):
        assert fact in source
    assert "LEFT JOIN LATERAL" in source
    assert "GROUP BY source.id" not in source
    assert "GROUP BY invoice.id" not in source


def test_context_model_reconciles_exact_source_policy_and_tax_shape() -> None:
    context = reads.AdjustmentNoteContext.model_validate({
        "side": "sales",
        "direction": "credit",
        "document_effect": "decrease",
        "original_document_id": uuid4(),
        "original_document_number": "SI-EXACT-1",
        "original_document_date": "2026-08-20",
        "branch_id": uuid4(),
        "party_id": uuid4(),
        "party_account_id": uuid4(),
        "party_name": "Exact Customer",
        "original_open_item_id": uuid4(),
        "original_open_item_principal": "336.00",
        "original_open_item_outstanding": "168.00",
        "currency_code": "INR",
        "supply_type": "intra_state",
        "zero_rated_payment_mode": "not_applicable",
        "tax_charge_mechanism": "normal",
        "rounding_policy": "nearest_rupee",
        "document_discount": {
            "kind": "percent",
            "basis": "price_value",
            "value": "5.000000",
        },
        "lines": [{
            "original_line_id": uuid4(),
            "line_number": 1,
            "product_id": uuid4(),
            "product_name": "Exact Product",
            "sku": "EXACT-1",
            "uom_code": "EA",
            "uom_conversion_factor": "1.000000",
            "original_billed_quantity": "2.000000",
            "original_free_quantity": "1.000000",
            "net_decreased_billed_quantity": "1.000000",
            "net_decreased_free_quantity": "0.000000",
            "remaining_billed_quantity": "1.000000",
            "remaining_free_quantity": "1.000000",
            "quoted_unit_rate": "150.0000",
            "price_basis": "tax_exclusive",
            "line_discount": {
                "kind": "amount",
                "basis": "taxable_value",
                "value": "10.00",
            },
            "document_discount_eligible": False,
            "free_supply_tax_treatment": "excluded_from_taxable_value",
            "tax_charge_mechanism": "normal",
            "tax_classification_code_snapshot": "481910",
            "tax_code_version_id": uuid4(),
            "taxability_snapshot": "taxable",
            "cgst_rate": "6.000000",
            "sgst_rate": "6.000000",
            "igst_rate": "0.000000",
            "cess_rate": "0.000000",
        }],
        "rule_choices": [{
            "id": uuid4(),
            "reason_code": "customer_rejection",
            "gst_tax_treatment": "commercial_only",
            "deadline_policy": "none",
            "deadline_days": None,
            "effective_from": "2026-04-01",
            "effective_to": None,
            "rule_version": "gst-adjustment-v1",
        }],
    })

    assert context.rounding_policy == "nearest_rupee"
    assert context.document_discount.value == Decimal("5.000000")
    assert context.lines[0].line_discount.value == Decimal("10.00")
    assert context.lines[0].document_discount_eligible is False

    settled = context.model_dump()
    settled["original_open_item_outstanding"] = Decimal("0.00")
    assert reads.AdjustmentNoteContext.model_validate(
        settled
    ).original_open_item_outstanding == Decimal("0.00")

    invalid = context.model_dump()
    invalid["lines"][0]["igst_rate"] = Decimal("12.000000")
    with pytest.raises(ValueError, match="intra-state source unexpectedly carries IGST"):
        reads.AdjustmentNoteContext.model_validate(invalid)


def _customer_credit_readback() -> dict:
    source_document_id = uuid4()
    original_tax_document_id = uuid4()
    requester_id = uuid4()
    approver_id = uuid4()
    return {
        "id": uuid4(),
        "note_number": "CN-2026-000001",
        "note_date": "2026-08-25",
        "side": "sales",
        "direction": "credit",
        "document_effect": "decrease",
        "status": "posted",
        "original_document_id": source_document_id,
        "party_id": uuid4(),
        "gst_tax_treatment": "statutory",
        "recipient_itc_reversal_evidence_attachment_id": uuid4(),
        "recipient_itc_reversal_confirmed_at": "2026-08-25T08:00:00Z",
        "counterparty_portal_document_line_id": None,
        "counterparty_payable_amount": "168.00",
        "posted_at": "2026-08-25T08:10:00Z",
        "command_request_id": uuid4(),
        "preview_hash": "sha256:" + "a" * 64,
        "requested_by_membership_id": requester_id,
        "approved_by_membership_id": approver_id,
        "approved_at": "2026-08-25T08:05:00Z",
        "calculation_artifact_id": uuid4(),
        "calculation_authority_hash": "sha256:" + "b" * 64,
        "original_tax_document_id": original_tax_document_id,
        "tax_document_id": uuid4(),
        "tax_adjusts_document_id": original_tax_document_id,
        "tax_document_total": "168.00",
        "accounting_event_id": uuid4(),
        "journal_entry_id": uuid4(),
        "journal_debit_total": "168.00",
        "journal_credit_total": "168.00",
        "journal_line_debit_total": "168.00",
        "journal_line_credit_total": "168.00",
        "original_open_item_id": uuid4(),
        "original_open_item_side": "receivable",
        "original_open_item_principal": "336.00",
        "original_open_item_outstanding_before": "100.00",
        "original_open_item_outstanding_after": "0.00",
        "original_open_item_status": "settled",
        "allocated_amount": "100.00",
        "residual_open_item_amount": "68.00",
        "residual_open_item_id": uuid4(),
        "residual_open_item_side": "payable",
        "residual_open_item_status": "open",
        "settlement_effect": "reduce_receivable_or_create_refund_payable",
        "sales_return_id": None,
        "purchase_return_id": None,
        "inventory_effect": "none",
        "lines": [{
            "id": uuid4(),
            "line_number": 1,
            "original_line_id": uuid4(),
            "original_document_id": source_document_id,
            "original_line_number": 1,
            "product_id": uuid4(),
            "uom_code": "EA",
            "uom_conversion_factor": "2.000000",
            "original_billed_quantity": "2.000000",
            "original_free_quantity": "1.000000",
            "billed_quantity": "1.000000",
            "free_quantity": "1.000000",
            "base_billed_quantity": "2.000000",
            "base_free_quantity": "2.000000",
            "free_supply_tax_treatment": "excluded_from_taxable_value",
            "net_value_amount": "150.00",
            "gst_taxable_value": "150.00",
            "cgst_amount": "9.00",
            "sgst_amount": "9.00",
            "igst_amount": "0.00",
            "cess_amount": "0.00",
            "line_total": "168.00",
        }],
    }


def test_customer_credit_readback_proves_lineage_refund_and_no_inventory() -> None:
    readback = reads.AdjustmentNoteReadback.model_validate(
        _customer_credit_readback()
    )

    assert readback.original_open_item_outstanding_after == Decimal("0.00")
    assert readback.allocated_amount == Decimal("100.00")
    assert readback.residual_open_item_amount == Decimal("68.00")
    assert readback.residual_open_item_side == "payable"
    assert readback.inventory_effect == "none"
    assert readback.lines[0].base_free_quantity == Decimal("2.000000")


def test_shared_readback_keeps_supplier_debit_settlement_semantics() -> None:
    value = _customer_credit_readback()
    value.update({
        "side": "purchase",
        "direction": "debit",
        "recipient_itc_reversal_evidence_attachment_id": None,
        "recipient_itc_reversal_confirmed_at": None,
        "counterparty_portal_document_line_id": uuid4(),
        "original_open_item_side": "payable",
        "residual_open_item_side": "receivable",
        "settlement_effect": "reduce_payable_or_create_supplier_receivable",
    })

    readback = reads.AdjustmentNoteReadback.model_validate(value)
    assert readback.original_open_item_side == "payable"
    assert readback.residual_open_item_side == "receivable"


def test_customer_credit_readback_rejects_self_approval_and_physical_return_link() -> None:
    value = _customer_credit_readback()
    value["approved_by_membership_id"] = value["requested_by_membership_id"]
    with pytest.raises(ValueError, match="approval is not independent"):
        reads.AdjustmentNoteReadback.model_validate(value)

    value = _customer_credit_readback()
    value["sales_return_id"] = uuid4()
    with pytest.raises(ValueError, match="linked to a physical return"):
        reads.AdjustmentNoteReadback.model_validate(value)


def test_customer_credit_readback_rejects_quantity_and_gst_lineage_drift() -> None:
    value = _customer_credit_readback()
    value["lines"][0]["original_document_id"] = uuid4()
    with pytest.raises(ValueError, match="exact source invoice"):
        reads.AdjustmentNoteReadback.model_validate(value)

    value = _customer_credit_readback()
    value["lines"][0]["base_free_quantity"] = "1.000000"
    with pytest.raises(ValueError, match="free base quantity"):
        reads.AdjustmentNoteReadback.model_validate(value)

    value = _customer_credit_readback()
    value["tax_adjusts_document_id"] = uuid4()
    with pytest.raises(ValueError, match="lacks exact tax document"):
        reads.AdjustmentNoteReadback.model_validate(value)


def test_context_sql_supports_settled_invoice_refunds_without_fake_partial_state() -> None:
    source = (
        Path(__file__).resolve().parents[3]
        / "backend/app/api/routes/canonical_adjustment_note_reads.py"
    ).read_text()

    assert "item.status IN ('open','settled')" in source
    assert "partially_settled" not in source
    assert 'Decimal(str(header["original_open_item_outstanding"])) < 0' in source

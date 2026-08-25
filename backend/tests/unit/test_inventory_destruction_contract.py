from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest

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


ROOT = Path(__file__).resolve().parents[3]
SQL = (
    ROOT / "backend/alembic/sql/20260825_0006_inventory_destruction_command.sql"
).read_text(encoding="utf-8") + (
    ROOT / "backend/alembic/sql/20260825_0021_gst_registered_inventory_destruction.sql"
).read_text(encoding="utf-8")


def _payload(**overrides):
    value = {
        "idempotency_key": "erp-test-destruction:0001",
        "branch_id": uuid4(),
        "destruction_date": "2026-08-25",
        "physical_destruction_confirmed_at": "2026-08-25T10:00:00+05:30",
        "location_id": uuid4(),
        "method_code": "licensed_incineration",
        "reason_code": "damaged",
        "reason": "Outer packaging irreparably water damaged while quarantined.",
        "authority_reference": "STATE-WASTE-AUTH-2026-001",
        "witness_name": "Licensed Disposal Witness",
        "witness_credential": "PCB-AUTH-2026-001",
        "certificate_attachment_id": uuid4(),
        "itc_reversal_evidence_attachment_id": uuid4(),
        "itc_treatment": "section_17_5_h_reversal",
        "lines": [
            {
                "product_id": uuid4(),
                "uom_conversion_id": uuid4(),
                "batch_allocations": [
                    {
                        "inventory_document_line_id": uuid4(),
                        "batch_id": uuid4(),
                        "entered_quantity": "3.000000",
                    }
                ],
            }
        ],
    }
    value.update(overrides)
    return PREPARE_PAYLOAD_MODELS["inventory.destruction.prepare"].model_validate(value)


def test_destruction_is_a_published_separate_approver_operation() -> None:
    policy = ACTION_POLICIES["inventory.destruction.prepare"]
    binding = ACTION_ADAPTER_BINDINGS["inventory.destruction.prepare"]
    assert policy.branch_fields == ("branch_id",)
    assert policy.approval_policy == "separate_approver"
    assert policy.risk_class == "consequential_write"
    assert "erp_inventory_destruction_prepare" in PUBLISHED_PREPARE_TOOL_NAMES
    assert binding.available is True
    assert binding.prepare_function == (
        "erp_automation_commands.persist_inventory_destruction_prepare"
    )
    assert binding.execute_function == (
        "erp_automation_commands.execute_inventory_destruction_command"
    )


def test_destruction_schema_is_narrow_and_evidence_typed() -> None:
    properties = PREPARE_ACTIONS[
        "erp_inventory_destruction_prepare"
    ].input_schema["properties"]
    assert properties["method_code"]["enum"] == ["licensed_incineration"]
    assert properties["reason_code"]["enum"] == [
        "expired",
        "damaged",
        "quality_rejected",
    ]
    assert properties["itc_treatment"]["enum"] == ["section_17_5_h_reversal"]
    assert {
        "physical_destruction_confirmed_at",
        "authority_reference",
        "witness_name",
        "witness_credential",
        "certificate_attachment_id",
        "itc_reversal_evidence_attachment_id",
    } <= set(properties)
    allocation = properties["lines"]["items"]["properties"][
        "batch_allocations"
    ]["items"]
    assert set(allocation["required"]) == {
        "inventory_document_line_id", "batch_id", "entered_quantity",
    }


def test_destruction_semantics_reject_blank_authority_duplicate_and_zero_quantity() -> None:
    with pytest.raises(ValueError, match="authority_reference"):
        validate_prepare_payload_semantics(
            "inventory.destruction.prepare",
            _payload(authority_reference=""),
        )
    duplicate = uuid4()
    payload = _payload()
    payload.lines[0].batch_allocations[0].batch_id = duplicate
    payload.lines[0].batch_allocations.append(
        payload.lines[0].batch_allocations[0].model_copy()
    )
    with pytest.raises(ValueError, match="batch may appear only once"):
        validate_prepare_payload_semantics("inventory.destruction.prepare", payload)
    invalid = _payload()
    invalid.lines[0].batch_allocations[0].entered_quantity = "0.000000"
    with pytest.raises(ValueError, match="quantities must be positive"):
        validate_prepare_payload_semantics("inventory.destruction.prepare", invalid)


def test_sql_fail_closes_unreviewed_regulatory_and_stock_variants() -> None:
    for fragment in (
        "SESSION_USER<>'erp_runtime'",
        "capability.capability_code='inventory.destruction.prepare'",
        "capability.approval_policy='separate_approver'",
        "evidence_kind='inventory_destruction_certificate'",
        "request_document->>'method_code'<>'licensed_incineration'",
        "request_document->>'itc_treatment'<>'section_17_5_h_reversal'",
        "GST-registered destruction requires a reviewed Section 17(5)(h) ITC reversal command",
        "candidate.location_type IN ('quarantine','damaged')",
        "NOT candidate.allows_sale",
        "candidate.temperature_min_c IS NULL",
        "cold_chain_required=false",
        "COALESCE(drug_schedule,'NONE') NOT IN ('H','H1','X')",
        "COALESCE(ndps_regulated,false)=false",
        "recalled stock requires a recall-linked destruction command",
        "bounded destruction requires the full locked batch-location balance",
        "license.license_type_code IN ('drug_wholesale_form_20b','drug_wholesale_form_21b')",
        "approver_membership_id<>request_row.requested_by_membership_id",
    ):
        assert fragment in SQL


def test_sql_posts_exact_inventory_value_loss_and_readback_evidence() -> None:
    for fragment in (
        "resolve_role_account(\n       organization_id,branch.id,'inventory_destruction_loss','expense','INR',false)",
        "'moving_weighted_average'",
        "entry.quantity_delta=-(expected.value->>'base_quantity')::numeric",
        "entry.value_delta=-(expected.value->>'extended_cost')::numeric",
        "transaction_debit_total=ledger_value",
        "transaction_credit_total=ledger_value",
        "event_type,inventory_document_id,journal_entry_id",
        "response_media_type='application/vnd.aasopharma.command-result+json'",
        "IF request_row.status='succeeded' THEN RETURN request_row.response_bytes; END IF;",
    ):
        assert fragment in SQL


def test_runtime_privilege_contract_lists_only_reviewed_destruction_functions() -> None:
    contract = (
        ROOT
        / "database/canonical/commands_automation/head_test_inventory_destruction_command.sql"
    ).read_text(encoding="utf-8")
    for function in (
        "resolve_inventory_destruction_prepare",
        "persist_inventory_destruction_prepare",
        "execute_inventory_destruction_command",
    ):
        assert contract.count(f"'{function}'") == 1
    assert "runtime_count<>3" in contract
    assert "private inventory destruction assertion exposes execute privilege" in contract


def test_rest_readback_requires_posted_destruction_ledger_and_journal() -> None:
    route = (
        ROOT / "backend/app/api/routes/web_operator_actions.py"
    ).read_text(encoding="utf-8")
    for fragment in (
        '"/inventory-destruction/commands/{command_request_id}/readback"',
        "command.capability_code='inventory.destruction.prepare'",
        "command.operation='compliance.destruction.post'",
        "command.status='succeeded'",
        "ledger.entry_kind='issue'",
        "event.event_type='inventory_valuation'",
        'Literal["licensed_incineration"]',
    ):
        assert fragment in route


def test_postgres15_fixture_compiles_readback_under_rls_app_role() -> None:
    fixture_name = "check_inventory_destruction_web_runtime_role.py"
    fixture = (ROOT / "backend/tests/postgres" / fixture_name).read_text(
        encoding="utf-8"
    )
    gate = (
        ROOT / "database/canonical/ci/run_alembic_postgres15_gate.sh"
    ).read_text(encoding="utf-8")
    for fragment in (
        'SET LOCAL ROLE "erp_app"',
        "FROM automation.command_requests AS command",
        "other_org_rows",
        "assert rows == []",
    ):
        assert fragment in fixture
    assert fixture_name in gate

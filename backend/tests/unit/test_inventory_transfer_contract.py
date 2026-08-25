from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest

from app.domain.operator_actions.contract import (
    ACTION_POLICIES,
    PREPARE_PAYLOAD_MODELS,
    validate_prepare_payload_semantics,
)


def _payload(**overrides):
    source_branch = uuid4()
    value = {
        "idempotency_key": "erp-test-transfer:0001",
        "source_branch_id": source_branch,
        "destination_branch_id": uuid4(),
        "source_location_id": uuid4(),
        "destination_location_id": uuid4(),
        "transfer_date": "2026-08-25",
        "lines": [{
            "product_id": uuid4(),
            "uom_conversion_id": uuid4(),
            "batch_allocations": [{"batch_id": uuid4(), "entered_quantity": "0.300000"}],
        }],
        "logistics": {"transport_mode": "in_person", "distance_km": "0.00"},
    }
    value.update(overrides)
    return PREPARE_PAYLOAD_MODELS["inventory.transfer.prepare"].model_validate(value)


def test_transfer_policy_is_reviewed_actor_confirmation_for_two_branches():
    policy = ACTION_POLICIES["inventory.transfer.prepare"]
    assert policy.branch_fields == ("source_branch_id", "destination_branch_id")
    assert policy.approval_policy == "actor_confirmation"
    assert policy.risk_class == "consequential_write"


def test_transfer_semantics_reject_same_branch_and_duplicate_batch():
    branch = uuid4()
    with pytest.raises(ValueError, match="branches must be distinct"):
        validate_prepare_payload_semantics(
            "inventory.transfer.prepare",
            _payload(source_branch_id=branch, destination_branch_id=branch),
        )
    duplicate = uuid4()
    payload = _payload()
    first_line = payload.lines[0]
    first_line.batch_allocations.append(first_line.batch_allocations[0].model_copy(update={"batch_id": duplicate}))
    first_line.batch_allocations[0].batch_id = duplicate
    with pytest.raises(ValueError, match="batch may appear only once"):
        validate_prepare_payload_semantics("inventory.transfer.prepare", payload)


def test_transfer_semantics_accept_tied_multi_batch_and_reject_location_or_quantity_errors():
    payload = _payload()
    payload.lines[0].batch_allocations.append(
        payload.lines[0].batch_allocations[0].model_copy(
            update={"batch_id": uuid4(), "entered_quantity": "0.200000"}
        )
    )
    validate_prepare_payload_semantics("inventory.transfer.prepare", payload)
    location = uuid4()
    with pytest.raises(ValueError, match="locations must be distinct"):
        validate_prepare_payload_semantics(
            "inventory.transfer.prepare",
            _payload(source_location_id=location, destination_location_id=location),
        )
    invalid = _payload()
    invalid.lines[0].batch_allocations[0].entered_quantity = "0.000000"
    with pytest.raises(ValueError, match="quantities must be positive"):
        validate_prepare_payload_semantics("inventory.transfer.prepare", invalid)


def test_generated_sql_authorizes_both_branches_and_balances_ledger():
    root = Path(__file__).resolve().parents[3]
    sql = (root / "backend/alembic/sql/20260825_0005_inventory_transfer_command.sql").read_text()
    for fragment in (
        "can_access_branch(source_branch_id)",
        "can_access_branch(destination_branch_id)",
        "has_permission('inventory.transfer.create',source_branch_id)",
        "has_permission('inventory.transfer.create',destination_branch_id)",
        "source_branch_id=destination_branch_id",
        "location_type='saleable' AND allows_sale",
        "strict_fefo_earliest_expiry_tier",
        "FOR UPDATE",
        "transfer_out_count",
        "transfer_in_count",
        "transfer_quantity_net<>0",
        "transfer_value_net<>0",
        "destination_entry.inventory_document_id=request_row.target_resource_id",
        "source_entry.branch_id=(current_resolution->>'source_branch_id')::uuid",
        "destination_entry.branch_id=(current_resolution->>'destination_branch_id')::uuid",
        "source_entry.unit_cost=(expected.value->>'unit_cost')::numeric",
        "destination_entry.unit_cost=(expected.value->>'unit_cost')::numeric",
    ):
        assert fragment in sql
    assert sql.count("location_type='saleable' AND allows_sale") >= 2


def test_missing_stock_transfer_sequence_fails_closed():
    root = Path(__file__).resolve().parents[3]
    sql = (root / "backend/alembic/sql/20260825_0005_inventory_transfer_command.sql").read_text()
    assert "SELECT id INTO STRICT sequence_id FROM core.document_sequences" in sql
    assert "document_type='stock_transfer'" in sql
    assert "INSERT INTO core.document_sequences" not in sql


def test_demo_provisions_transfer_authority_route_and_numbering():
    root = Path(__file__).resolve().parents[3]
    source = (root / "backend/scripts/provision_canonical_demo.py").read_text()
    for fragment in (
        '"inventory.transfer.create"',
        '"inventory.document.post"',
        '("inventory.transfer.prepare", "actor_confirmation")',
        '"transfer_destination_branch"',
        '"transfer_destination_location"',
        '"stock_transfer": "DEMO-ST-"',
    ):
        assert fragment in source


def test_postgres_route_fixture_uses_real_runtime_role_and_useful_rows():
    root = Path(__file__).resolve().parents[3]
    fixture = (root / "backend/tests/postgres/check_canonical_inventory_transfer_runtime_role.py").read_text()
    gate = (root / "database/canonical/ci/run_alembic_postgres15_gate.sh").read_text()
    for fragment in (
        'SET LOCAL ROLE "erp_runtime"',
        "available_base_quantity",
        "transfer_out_branch_id == SOURCE_BRANCH",
        "transfer_in_branch_id == DESTINATION_BRANCH",
        'transfer_out_value == "-10.00"',
        'transfer_in_value == "10.00"',
        "SELECT count(*) FROM core.organizations WHERE id=:other_org",
        "source-only actor read destination transfer evidence",
        "transaction.rollback()",
    ):
        assert fragment in fixture
    assert 'SET LOCAL ROLE "erp_app"' not in fixture
    assert "check_canonical_inventory_transfer_runtime_role.py" in gate

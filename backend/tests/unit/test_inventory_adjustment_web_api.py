from datetime import date, datetime, timezone
from decimal import Decimal
import inspect
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.routes import web_operator_actions as web


class _Result:
    def __init__(self, rows):
        self._rows = [SimpleNamespace(_mapping=row) for row in rows]

    def fetchall(self):
        return self._rows

    def first(self):
        return self._rows[0] if self._rows else None


class _Db:
    def __init__(self, result_sets):
        self._result_sets = iter(result_sets)
        self.calls = []

    def execute(self, statement, params):
        self.calls.append((str(statement), params))
        return _Result(next(self._result_sets))


def _context(org_id=None, membership_id=None):
    return SimpleNamespace(
        organization_id=org_id or uuid4(),
        membership_id=membership_id or uuid4(),
    )


def test_cycle_count_eligibility_returns_only_server_owned_facts(monkeypatch):
    branch_id, location_id, batch_id, product_id = (uuid4() for _ in range(4))
    membership_id, evidence_id, conversion_id = (uuid4() for _ in range(3))
    org_id = uuid4()
    monkeypatch.setattr(
        web,
        "_resolve_context",
        lambda *_args, **_kwargs: _context(org_id, membership_id),
    )
    today = date(2026, 8, 25)
    db = _Db([
        [{
            "product_id": product_id,
            "batch_id": batch_id,
            "system_base_quantity": Decimal("12.345678"),
            "uom_conversion_id": conversion_id,
            "from_uom_code": "PK",
            "to_uom_code": "EA",
            "multiplier": Decimal("10.000000"),
        }],
        [{
            "evidence_attachment_id": evidence_id,
            "status": "verified",
            "document_date": today,
            "verified_at": datetime(2026, 8, 25, tzinfo=timezone.utc),
            "retention_until": date(2027, 8, 25),
        }],
    ])

    response = web.inventory_adjustment_eligibility(
        branch_id=branch_id,
        location_id=location_id,
        batch_id=batch_id,
        adjustment_date=today,
        user={},
        db=db,
    )

    assert response.counted_by_membership_id == membership_id
    assert response.system_base_quantity == Decimal("12.345678")
    assert response.uom_conversions[0].uom_conversion_id == conversion_id
    assert response.evidence[0].evidence_attachment_id == evidence_id
    assert "conversion.from_uom_code<>conversion.to_uom_code" in db.calls[0][0]
    assert "prior.status NOT IN ('failed','expired','cancelled')" in db.calls[1][0]


def test_cycle_count_eligibility_fails_closed_without_evidence(monkeypatch):
    ids = [uuid4() for _ in range(7)]
    branch_id, location_id, batch_id, product_id, conversion_id, org_id, membership_id = ids
    monkeypatch.setattr(
        web,
        "_resolve_context",
        lambda *_args, **_kwargs: _context(org_id, membership_id),
    )
    db = _Db([[
        {
            "product_id": product_id,
            "batch_id": batch_id,
            "system_base_quantity": Decimal("1.000000"),
            "uom_conversion_id": conversion_id,
            "from_uom_code": "PK",
            "to_uom_code": "EA",
            "multiplier": Decimal("10.000000"),
        }
    ], []])
    with pytest.raises(HTTPException) as error:
        web.inventory_adjustment_eligibility(
            branch_id=branch_id,
            location_id=location_id,
            batch_id=batch_id,
            adjustment_date=date(2026, 8, 25),
            user={},
            db=db,
        )
    assert error.value.status_code == 409
    assert "No unused verified" in error.value.detail["message"]


def test_posted_cycle_count_readback_reconciles_stock_value_and_journal(monkeypatch):
    command_id, document_id, branch_id, journal_id, event_id = (uuid4() for _ in range(5))
    line_id, product_id, batch_id, ledger_id = (uuid4() for _ in range(4))
    org_id = uuid4()
    monkeypatch.setattr(
        web,
        "_command_context",
        lambda *_args, **_kwargs: _context(org_id),
    )
    row = {
        "command_request_id": command_id,
        "inventory_document_id": document_id,
        "document_number": "SC-2026-000001",
        "status": "posted",
        "branch_id": branch_id,
        "total_gain_base_quantity": Decimal("2.500000"),
        "total_gain_value": Decimal("25.00"),
        "journal_entry_id": journal_id,
        "journal_status": "posted",
        "journal_debit_total": Decimal("25.00"),
        "journal_credit_total": Decimal("25.00"),
        "accounting_event_id": event_id,
        "inventory_document_line_id": line_id,
        "product_id": product_id,
        "batch_id": batch_id,
        "system_base_quantity": Decimal("10.000000"),
        "counted_base_quantity": Decimal("12.500000"),
        "gain_base_quantity": Decimal("2.500000"),
        "unit_cost": Decimal("10.0000"),
        "gain_value": Decimal("25.00"),
        "ledger_entry_id": ledger_id,
        "ledger_quantity_delta": Decimal("2.500000"),
        "ledger_value_delta": Decimal("25.00"),
        "current_on_hand_quantity": Decimal("12.500000"),
    }
    response = web.inventory_adjustment_readback(
        command_request_id=command_id,
        user={},
        db=_Db([[row]]),
    )
    assert response.status == "posted"
    assert response.journal_status == "posted"
    assert response.lines[0].ledger_quantity_delta == Decimal("2.500000")


def test_posted_cycle_count_readback_rejects_stock_drift(monkeypatch):
    monkeypatch.setattr(
        web,
        "_command_context",
        lambda *_args, **_kwargs: _context(),
    )
    command_id = uuid4()
    row = {
        "command_request_id": command_id,
        "inventory_document_id": uuid4(), "document_number": "SC-1", "status": "posted",
        "branch_id": uuid4(), "total_gain_base_quantity": Decimal("1"),
        "total_gain_value": Decimal("2"), "journal_entry_id": uuid4(),
        "journal_status": "posted", "journal_debit_total": Decimal("2"),
        "journal_credit_total": Decimal("2"), "accounting_event_id": uuid4(),
        "inventory_document_line_id": uuid4(), "product_id": uuid4(), "batch_id": uuid4(),
        "system_base_quantity": Decimal("5"), "counted_base_quantity": Decimal("6"),
        "gain_base_quantity": Decimal("1"), "unit_cost": Decimal("2"), "gain_value": Decimal("2"),
        "ledger_entry_id": uuid4(), "ledger_quantity_delta": Decimal("1"),
        "ledger_value_delta": Decimal("2"), "current_on_hand_quantity": Decimal("5"),
    }
    with pytest.raises(HTTPException) as error:
        web.inventory_adjustment_readback(command_request_id=command_id, user={}, db=_Db([[row]]))
    assert error.value.status_code == 409
    assert "does not match" in error.value.detail["message"]


def test_inventory_adjustment_response_models_are_strict():
    with pytest.raises(ValidationError):
        web.InventoryAdjustmentUom(
            uom_conversion_id=uuid4(),
            from_uom_code="PK",
            to_uom_code="EA",
            multiplier=Decimal("10"),
            invented=True,
        )


def test_distinct_approver_context_is_not_bound_to_requester_grant():
    org_id, auth_user_id, user_id = (uuid4() for _ in range(3))
    grant_id, membership_id, branch_id, command_id = (uuid4() for _ in range(4))
    db = _Db([[], [{
        "agent_grant_id": grant_id,
        "membership_id": membership_id,
        "grant_branch_id": None,
        "command_branch_id": branch_id,
        "command_destination_branch_id": None,
    }]])
    context = web._resolve_context(
        db,
        {"org_id": org_id, "auth_user_id": auth_user_id, "user_id": user_id},
        "automation.command.approve",
        command_request_id=command_id,
    )
    assert context.membership_id == membership_id
    assert context.branch_ids == (branch_id,)
    assert db.calls[1][1]["approval_mode"] is True
    assert ":approval_mode OR" in db.calls[1][0]
    assert "command.approval_policy<>'separate_approver'" in db.calls[1][0]
    assert "OR command.requested_by_membership_id<>membership.id" in db.calls[1][0]


def test_actor_confirmation_approval_keeps_requester_eligible():
    """Only persisted separate-approver commands exclude their requester.

    Purchase orders and customer receipts use actor confirmation, so the
    shared web authority resolver must not turn their explicit confirmation
    into an impossible second-user requirement.
    """
    source = inspect.getsource(web._resolve_context)

    assert "command.approval_policy<>'separate_approver'" in source
    assert "OR command.requested_by_membership_id<>membership.id" in source


def test_review_returns_exact_immutable_preview_for_distinct_member(monkeypatch):
    command_id, org_id, membership_id = (uuid4() for _ in range(3))
    monkeypatch.setattr(
        web,
        "_command_context",
        lambda *_args, **_kwargs: _context(org_id, membership_id),
    )
    batch_id = uuid4()
    class Service:
        def deployment_readiness(self): return True
        def adapter_readiness(self): return {"automation.command.approve": True}
        def review(self, **_kwargs):
            return SimpleNamespace(
                command_request_id=command_id, command_type="inventory.document.post",
                capability_code="inventory.adjustment.prepare", status="prepared",
                requested_by_membership_id=uuid4(), branch_id=uuid4(),
                destination_branch_id=None, target_resource_type="inventory_document",
                target_resource_id=uuid4(), target_row_version=1,
                serializer_version="canonical-json-v1", preview_media_type="application/json",
                preview_canonical_json='{"inventory_impact":[]}',
                preview_hash="sha256:" + "ab" * 32, request_hash="sha256:" + "cd" * 32,
                aggregate_version_hash="sha256:" + "ef" * 32,
                approval_policy="separate_approver", required_approval_count=1,
                expires_at=datetime(2026, 8, 25, 12, tzinfo=timezone.utc),
                resolved_references=(), source_versions=(), calculation_ruleset=(),
                inventory_impact=({"batch_id": str(batch_id)},),
                financial_impact=({"amount": "25.00"},), tax_impact=(),
                policy_warnings=(),
                required_approvals=({"policy": "separate_approver", "count": 1},),
            )
    response = web.inventory_adjustment_review(
        command_request_id=command_id,
        user={},
        db=_Db([]),
        service=Service(),
    )
    assert response.command_request_id == command_id
    assert response.preview_hash == "sha256:" + "ab" * 32
    assert response.preview_canonical_json == '{"inventory_impact":[]}'
    assert response.required_approvals == [{"policy": "separate_approver", "count": 1}]

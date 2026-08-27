from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict

from app.api.routes import web_operator_actions as web
from app.domain.operator_actions import (
    ActionErrorCode,
    CommandState,
    OperatorActionError,
    PreparedCommand,
)


class _Payload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    idempotency_key: str
    branch_id: UUID


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return self._rows


class _Db:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def execute(self, statement, params):
        self.calls.append((str(statement), params))
        return _Result([] if len(self.calls) == 1 else self.rows)


def _user():
    return {
        "org_id": str(uuid4()),
        "auth_user_id": str(uuid4()),
        "user_id": str(uuid4()),
    }


def test_web_context_is_bound_to_the_distinct_reviewed_client():
    grant_id = uuid4()
    membership_id = uuid4()
    row = SimpleNamespace(
        _mapping={
            "agent_grant_id": grant_id,
            "membership_id": membership_id,
            "grant_branch_id": None,
            "command_branch_id": None,
            "command_destination_branch_id": None,
        }
    )
    db = _Db([row])
    user = _user()
    branch_id = uuid4()

    context = web._resolve_context(
        db, user, "sales.invoice.prepare", branch_ids=(branch_id,)
    )

    assert context.client_id == "aasopharma-erp-web"
    assert context.agent_grant_id == grant_id
    assert context.membership_id == membership_id
    assert context.organization_scope is True
    assert context.branch_ids == (branch_id,)
    assert db.calls[1][1]["client_id"] == "aasopharma-erp-web"
    assert db.calls[1][1]["operation_key"] == "sales.invoice.prepare"


def test_web_context_fails_closed_when_authority_is_ambiguous():
    row = SimpleNamespace(
        _mapping={
            "agent_grant_id": uuid4(),
            "membership_id": uuid4(),
            "grant_branch_id": None,
            "command_branch_id": None,
            "command_destination_branch_id": None,
        }
    )
    with pytest.raises(HTTPException) as denied:
        web._resolve_context(
            _Db([row, row]), _user(), "sales.invoice.prepare", branch_ids=(uuid4(),)
        )
    assert denied.value.status_code == 403
    assert denied.value.detail["code"] == "SCOPE_DENIED"


def test_web_prepare_calls_the_shared_operator_service(monkeypatch):
    operation = "sales.invoice.prepare"
    branch_id = uuid4()
    command_id = uuid4()
    context = SimpleNamespace()
    captured = {}

    class Service:
        def deployment_readiness(self):
            return True

        def adapter_readiness(self):
            return {operation: True}

        def prepare(self, **kwargs):
            captured.update(kwargs)
            return PreparedCommand(
                command_request_id=command_id,
                command_type=operation,
                preview_hash="sha256:" + "a" * 64,
                expires_at=datetime(2099, 1, 1, tzinfo=timezone.utc),
                resolved_references=(),
                source_versions=(),
                calculation_ruleset=(),
                inventory_impact=(),
                financial_impact=(),
                tax_impact=(),
            )

    monkeypatch.setitem(web.PREPARE_PAYLOAD_MODELS, operation, _Payload)
    monkeypatch.setattr(web, "validate_prepare_payload_semantics", lambda *_: None)
    monkeypatch.setattr(web, "_resolve_context", lambda *_args, **_kwargs: context)

    response = web.prepare_action(
        web.OperatorCommandType(operation),
        {"idempotency_key": "web-test-0001", "branch_id": str(branch_id)},
        user=_user(),
        db=object(),
        service=Service(),
    )

    assert response.command_request_id == command_id
    assert captured["context"] is context
    assert captured["idempotency_key"] == "web-test-0001"
    assert captured["payload"] == {"branch_id": branch_id}


def test_web_command_status_preserves_recovery_metadata(monkeypatch):
    command_id = uuid4()
    resource_id = uuid4()
    audit_id = uuid4()
    expires_at = datetime(2099, 1, 1, tzinfo=timezone.utc)
    context = SimpleNamespace(organization_id=uuid4())

    class Service:
        def deployment_readiness(self):
            return True

        def adapter_readiness(self):
            return {"automation.command.status.get": True}

        def get_status(self, **kwargs):
            assert kwargs == {
                "command_request_id": command_id,
                "context": context,
            }
            return CommandState(
                command_request_id=command_id,
                command_type="inventory.document.post",
                status="succeeded",
                preview_hash="sha256:" + "c" * 64,
                expires_at=expires_at,
                resource_type="inventory_document",
                resource_id=resource_id,
                failure=None,
                audit_references=({"id": str(audit_id)},),
            )

    monkeypatch.setattr(web, "_command_context", lambda *_args, **_kwargs: context)
    monkeypatch.setattr(web, "record_operator_action", lambda **_kwargs: None)

    response = web.get_command_status(
        command_id,
        user=_user(),
        db=object(),
        service=Service(),
    )

    assert response.status == "succeeded"
    assert response.expires_at == expires_at
    assert response.resource_id == resource_id
    assert response.failure is None
    assert response.audit_references == ({"id": str(audit_id)},)


def test_web_prepare_maps_fefo_policy_rejection_to_structured_conflict(monkeypatch):
    operation = "sales.invoice.prepare"
    branch_id = uuid4()

    class Service:
        def deployment_readiness(self):
            return True

        def adapter_readiness(self):
            return {operation: True}

        def prepare(self, **_kwargs):
            raise OperatorActionError(
                ActionErrorCode.BATCH_BLOCKED,
                "Selected batches do not follow FEFO; refresh and use the earliest eligible batch",
                metadata={"reason": "FEFO_ALLOCATION_REQUIRED"},
            )

    monkeypatch.setitem(web.PREPARE_PAYLOAD_MODELS, operation, _Payload)
    monkeypatch.setattr(web, "validate_prepare_payload_semantics", lambda *_: None)
    monkeypatch.setattr(web, "_resolve_context", lambda *_args, **_kwargs: SimpleNamespace())

    with pytest.raises(HTTPException) as error:
        web.prepare_action(
            web.OperatorCommandType(operation),
            {"idempotency_key": "web-test-fefo", "branch_id": str(branch_id)},
            user=_user(),
            db=object(),
            service=Service(),
        )

    assert error.value.status_code == 409
    assert error.value.detail["code"] == "BATCH_BLOCKED"
    assert error.value.detail["metadata"]["reason"] == "FEFO_ALLOCATION_REQUIRED"


def test_web_cycle_count_preserves_exact_strings_and_rejects_inexact_quantities(monkeypatch):
    operation = "inventory.adjustment.prepare"
    command_id = uuid4()
    calls = []

    class Service:
        def deployment_readiness(self):
            return True

        def adapter_readiness(self):
            return {operation: True}

        def prepare(self, **kwargs):
            calls.append(kwargs)
            return PreparedCommand(
                command_request_id=command_id,
                command_type=operation,
                preview_hash="sha256:" + "b" * 64,
                expires_at=datetime(2099, 1, 1, tzinfo=timezone.utc),
                resolved_references=(),
                source_versions=(),
                calculation_ruleset=(),
                inventory_impact=(),
                financial_impact=(),
                tax_impact=(),
            )

    monkeypatch.setattr(web, "_resolve_context", lambda *_args, **_kwargs: SimpleNamespace())
    counted_at = datetime.now(timezone.utc)
    payload = {
        "idempotency_key": "erp-web-inventory-adjustment:test-0001",
        "branch_id": str(uuid4()),
        "adjustment_date": counted_at.astimezone(
            timezone.utc
        ).date().isoformat(),
        "counted_at": counted_at.isoformat(),
        "counted_by_membership_id": str(uuid4()),
        "location_id": str(uuid4()),
        "reason_code": "cycle_count",
        "evidence_attachment_id": str(uuid4()),
        "lines": [{
            "product_id": str(uuid4()),
            "uom_conversion_id": str(uuid4()),
            "batch_counts": [{
                "batch_id": str(uuid4()),
                "counted_quantity": "12.000001",
            }],
        }],
    }

    response = web.prepare_action(
        web.OperatorCommandType(operation),
        payload,
        user=_user(),
        db=object(),
        service=Service(),
    )
    assert response.command_request_id == command_id
    assert calls[0]["payload"]["lines"][0]["batch_counts"][0]["counted_quantity"] == "12.000001"

    for invalid_quantity in (12, "9007199254740993", "12.0000001", "0", "-1", "NaN"):
        invalid_payload = {
            **payload,
            "lines": [{
                **payload["lines"][0],
                "batch_counts": [{
                    **payload["lines"][0]["batch_counts"][0],
                    "counted_quantity": invalid_quantity,
                }],
            }],
        }
        with pytest.raises(HTTPException) as error:
            web.prepare_action(
                web.OperatorCommandType(operation),
                invalid_payload,
                user=_user(),
                db=object(),
                service=Service(),
            )
        assert error.value.status_code == 422
    assert len(calls) == 1

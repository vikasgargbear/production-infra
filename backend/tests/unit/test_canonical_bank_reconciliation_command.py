from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest

from app.domain.operator_actions.contract import (
    ACTION_POLICIES,
    PREPARE_PAYLOAD_MODELS,
    validate_prepare_payload_semantics,
)
from app.infrastructure.operator_actions.registry import ACTION_ADAPTER_BINDINGS
from app.domain.operator_actions.models import ActionContext, ActionErrorCode, OperatorActionError
from app.infrastructure.operator_actions.service import SqlAlchemyOperatorActionService


ROOT = Path(__file__).resolve().parents[3]
SQL = ROOT / "backend/alembic/sql/20260825_0008_bank_reconciliation_command.sql"
REVISION = ROOT / "backend/alembic/versions/20260825_0008_bank_reconciliation_command.py"
RUNTIME_FIXTURE = ROOT / "backend/tests/postgres/check_canonical_bank_reconciliation_runtime_role.py"
POSTGRES_GATE = ROOT / "database/canonical/ci/run_alembic_postgres15_gate.sh"


def _payload(amount: str = "168.00"):
    return {
        "idempotency_key": "bank-reconciliation:test-0001",
        "branch_id": str(uuid4()),
        "bank_statement_id": str(uuid4()),
        "bank_statement_line_id": str(uuid4()),
        "journal_entry_id": str(uuid4()),
        "matched_amount": amount,
        "match_method": "manual",
    }


def test_bank_reconciliation_has_one_published_strict_prepare_contract():
    policy = ACTION_POLICIES["finance.bank_reconciliation.prepare"]
    assert policy.permission == "finance.bank_reconcile"
    assert policy.approval_policy == "separate_approver"
    assert policy.branch_fields == ("branch_id",)
    assert ACTION_ADAPTER_BINDINGS[policy.operation_key].available is True
    model = PREPARE_PAYLOAD_MODELS[policy.operation_key]
    payload = model.model_validate(_payload())
    validate_prepare_payload_semantics(policy.operation_key, payload)
    with pytest.raises(ValueError, match="positive amount"):
        validate_prepare_payload_semantics(
            policy.operation_key, model.model_validate(_payload("0.00"))
        )
    with pytest.raises(ValueError):
        model.model_validate(_payload("168.001"))


def test_bank_reconciliation_migration_is_hash_bound_and_fail_closed():
    sql = SQL.read_text(encoding="utf-8")
    revision = REVISION.read_text(encoding="utf-8")
    digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()
    assert digest in revision
    assert 'revision = "20260825_0008"' in revision
    assert 'down_revision = "20260825_0007"' in revision
    assert "CanonicalBaselineError" in revision.split("def downgrade", 1)[1]
    for evidence in (
        "resolve_bank_reconciliation_prepare",
        "persist_bank_reconciliation_prepare",
        "execute_bank_reconciliation_command",
        "execute_bank_reconciliation_command",
        "pg_get_functiondef",
        "bank reconciliation migration requires the exact reviewed adjustment-note command guard",
        "bank reconciliation migration requires the exact reviewed adjustment-note generic prepare boundary",
        "WHEN ''finance.bank_reconciliation.prepare'' THEN ''reconciliation_match''",
        "WHEN ''finance.bank_reconciliation.prepare'' THEN ''finance.bank_reconciliation.match''",
        "PERFORM erp_automation_commands.prepare_operator_command(",
        "set_config('app.request_id',command_id::text,true)",
        "approval.approver_membership_id<>request_row.requested_by_membership_id",
        "pg_advisory_xact_lock",
        "statement and posted bank-ledger journal are not one exact full match",
        "statement_line.amount",
        "journal_line.transaction_debit",
        "journal_line.transaction_credit",
        "source_versions",
        "aggregate_version_hash",
        "finance_reconciliation_matches_outbox_trg",
        "REVOKE INSERT,UPDATE ON finance.reconciliation_matches FROM erp_app",
    ):
        assert evidence in sql
    assert "partial_match" in sql
    assert "foreign_currency" in sql
    assert "already_matched_owner" in sql
    assert "reversal" in sql


def test_bank_reconciliation_readback_is_shared_by_rest_and_mcp():
    adapter = (
        ROOT
        / "backend/app/infrastructure/operator_actions/bank_reconciliation.py"
    ).read_text(encoding="utf-8")
    web = (ROOT / "backend/app/api/routes/web_operator_actions.py").read_text(encoding="utf-8")
    mcp = (ROOT / "backend/app/api/routes/internal/mcp_actions.py").read_text(encoding="utf-8")
    operations = (
        ROOT / "backend/mcp_runtime/aasopharma_mcp/operations.py"
    ).read_text(encoding="utf-8")
    service = (
        ROOT / "backend/app/infrastructure/operator_actions/service.py"
    ).read_text(encoding="utf-8")
    assert "READBACK_BANK_RECONCILIATION_SQL" in adapter
    assert "/bank-reconciliation/commands/{command_request_id}/readback" in web
    assert "service.get_bank_reconciliation_readback" in web
    assert "/commands/{command_request_id}/bank-reconciliation-readback" in mcp
    assert "get_bank_reconciliation_readback" in mcp
    assert '"erp_bank_reconciliation_get"' in operations
    assert '"read"\n            if operation.kind in {"status", "bank_reconciliation_readback", "readback"}' in operations
    assert "EXECUTE_BANK_RECONCILIATION_SQL" in service
    assert 'before["operation"] == "finance.bank_reconciliation.match"' in service


def test_bank_reconciliation_has_restricted_postgres15_concurrency_evidence():
    fixture = RUNTIME_FIXTURE.read_text(encoding="utf-8")
    gate = POSTGRES_GATE.read_text(encoding="utf-8")
    assert "SET SESSION AUTHORIZATION \"erp_runtime\"" in fixture
    assert "ThreadPoolExecutor(max_workers=2)" in fixture
    assert "changed bank-account source version executed" in fixture
    assert "partial bank reconciliation was accepted" in fixture
    assert "outbox_event_count" in fixture and "audit_event_count" in fixture
    assert "bypassed the reviewed reconciliation command" in fixture
    assert RUNTIME_FIXTURE.name in gate
    assert 'version_num FROM public.alembic_version\')\" = \"20260825_0009\"' in gate


class _Result:
    def __init__(self, rows=()):
        self.rows = list(rows)

    def mappings(self):
        return self

    def all(self):
        return self.rows


class _Transaction:
    def __enter__(self):
        return self

    def __exit__(self, *_):
        return None


class _BankSession:
    def __init__(self, readback=None):
        self.executions = []
        self.readback = readback

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return None

    def begin(self):
        return _Transaction()

    def execute(self, statement, params=None):
        sql = str(statement)
        params = dict(params or {})
        self.executions.append((sql, params))
        if "FROM pg_catalog.pg_roles AS role" in sql:
            return _Result(({"role_name": "erp_runtime", "rolsuper": False, "rolbypassrls": False},))
        if "pg_advisory_xact_lock" in sql or "activate_context" in sql:
            return _Result()
        if "FROM automation.agent_grants AS grant_row" in sql:
            return _Result(({"branch_id": None},))
        if "resolve_bank_reconciliation_prepare" in sql:
            request = json.loads(params["request_json"])
            return _Result(({"resolution": {
                "branch_id": request["branch_id"],
                "bank_statement_id": request["bank_statement_id"],
                "bank_statement_line_id": request["bank_statement_line_id"],
                "bank_account_id": str(uuid4()),
                "bank_ledger_account_id": str(uuid4()),
                "journal_entry_id": request["journal_entry_id"],
                "journal_bank_line_id": str(uuid4()),
                "statement_direction": "credit",
                "matched_amount": request["matched_amount"],
                "currency_code": "INR",
                "journal_debit_total": request["matched_amount"],
                "journal_credit_total": request["matched_amount"],
                "match_method": request["match_method"],
                "source_versions": [{"resource_type": "bank_statement", "role": "statement", "id": request["bank_statement_id"], "row_version": 1}],
                "legal_scope": {"effect": "reconciliation_only"},
            }},))
        if "persist_bank_reconciliation_prepare" in sql:
            preview = json.loads(params["preview_bytes"])
            return _Result(({"command_request_id": {
                "command_request_id": preview["command_request_id"],
                "expires_at": datetime.now(timezone.utc).isoformat(),
                "preview_hash": hashlib.sha256(params["preview_bytes"]).hexdigest(),
            }},))
        if "FROM automation.command_requests command" in sql:
            return _Result(() if self.readback is None else (self.readback,))
        raise AssertionError(sql)


def _context(operation="finance.bank_reconciliation.prepare", permission="finance.bank_reconcile"):
    return ActionContext(
        auth_user_id=uuid4(), user_id=uuid4(), organization_id=uuid4(),
        membership_id=uuid4(), agent_grant_id=uuid4(), client_id="test-client",
        operation_key=operation, permission=permission, branch_ids=(),
        organization_scope=True,
    )


def test_bank_reconciliation_prepare_is_one_exact_backend_transaction():
    session = _BankSession()
    service = SqlAlchemyOperatorActionService(lambda: session, runtime_principal_configured=True)
    payload = _payload()
    payload = {key: value for key, value in payload.items() if key != "idempotency_key"}
    payload = {key: (uuid4() if key.endswith("_id") else value) for key, value in payload.items()}
    prepared = service.prepare(
        policy=ACTION_POLICIES["finance.bank_reconciliation.prepare"],
        payload=payload,
        idempotency_key="bank-reconciliation:test-0001",
        context=_context(),
    )
    assert prepared.command_type == "finance.bank_reconciliation.match"
    assert prepared.required_approvals == ({"policy": "separate_approver", "count": 1},)
    assert prepared.inventory_impact == () and prepared.tax_impact == ()
    assert prepared.financial_impact[0]["creates_journal"] is False
    sql = "\n".join(item[0] for item in session.executions)
    assert "pg_advisory_xact_lock" in sql
    assert "resolve_bank_reconciliation_prepare" in sql
    assert "persist_bank_reconciliation_prepare" in sql


def test_bank_reconciliation_readback_rejects_missing_provenance():
    context = _context("automation.command.status.get", "automation.command.view")
    valid = {
        "command_request_id": uuid4(), "reconciliation_match_id": uuid4(), "status": "matched",
        "bank_statement_id": uuid4(), "bank_statement_status": "reconciled",
        "bank_statement_line_id": uuid4(), "statement_direction": "credit",
        "bank_account_id": uuid4(), "bank_ledger_account_id": uuid4(),
        "journal_entry_id": uuid4(), "journal_status": "posted", "journal_bank_line_id": uuid4(),
        "matched_amount": Decimal("168.00"), "currency_code": "INR", "match_method": "manual",
        "journal_bank_debit": Decimal("168.00"), "journal_bank_credit": Decimal("0"),
        "audit_event_count": 1, "outbox_event_count": 2,
    }
    service = SqlAlchemyOperatorActionService(lambda: _BankSession(valid), runtime_principal_configured=True)
    with pytest.raises(OperatorActionError) as error:
        service.get_bank_reconciliation_readback(
            command_request_id=valid["command_request_id"], context=context
        )
    assert error.value.code is ActionErrorCode.STALE_VERSION

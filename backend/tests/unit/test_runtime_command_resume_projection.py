from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path


ROOT = Path(__file__).parents[3]
SQL = (
    ROOT
    / "backend/alembic/sql/20260827_0030_runtime_command_resume_projection.sql"
)
REVISION = (
    ROOT
    / "backend/alembic/versions/20260827_0030_runtime_command_resume_projection.py"
)


def _sql() -> str:
    return SQL.read_text(encoding="utf-8")


def test_runtime_resume_projection_is_hash_bound_and_linear() -> None:
    spec = importlib.util.spec_from_file_location("runtime_command_resume", REVISION)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    assert module.revision == "20260827_0030"
    assert module.down_revision == "20260826_0029"
    assert module.EXPECTED_SQL_SHA256 == hashlib.sha256(SQL.read_bytes()).hexdigest()


def test_resume_projection_is_requester_client_grant_branch_and_hash_bound() -> None:
    sql = _sql()

    assert "requester_command_by_idempotency" in sql
    assert "request.requested_by_membership_id = actor_id" in sql
    assert "agent_grant.subject_membership_id = actor_id" in sql
    assert "agent_grant.consented_by_membership_id = actor_id" in sql
    assert "agent_grant.client_id = requester_client_id" in sql
    assert "agent_grant.status = 'active'" in sql
    assert "agent_grant.expires_at > pg_catalog.transaction_timestamp()" in sql
    assert "capability.capability_code = request.capability_code" in sql
    assert "capability.status = 'active'" in sql
    assert "request.operation_mode = capability.operation_mode" in sql
    assert "request.risk_class = capability.risk_class" in sql
    assert "request.approval_policy = capability.approval_policy" in sql
    assert "request.requested_amount <= capability.maximum_amount" in sql
    assert "request.currency_code = capability.currency_code" in sql
    assert "OR capability.allow_sensitive_read" in sql
    assert "agent_grant.branch_id = request.branch_id" in sql
    assert "agent_grant.branch_id = request.destination_branch_id" in sql
    assert "request.idempotency_key_hash = expected_idempotency_key_hash" in sql
    assert "erp_security.can_access_branch(request.branch_id)" in sql
    assert "request.destination_branch_id IS NULL" in sql
    assert "OR erp_security.can_access_branch(request.destination_branch_id)" in sql
    assert "erp_security.can_access_branch(request.destination_branch_id)" in sql
    assert "request.request_hash = pg_catalog.sha256(request.request_bytes)" in sql
    assert "request.preview_hash = pg_catalog.sha256(request.preview_bytes)" in sql
    assert "request.response_hash = pg_catalog.sha256(request.response_bytes)" in sql
    assert "candidate.candidate_count = 1" in sql


def test_runtime_keeps_raw_command_table_private() -> None:
    sql = _sql()

    assert (
        "REVOKE ALL ON TABLE automation.command_requests FROM erp_app, erp_runtime;"
        in sql
    )
    assert "GRANT SELECT ON" not in sql
    assert (
        "GRANT EXECUTE ON FUNCTION erp_automation_reads.requester_command_by_idempotency"
        in sql
    )


def test_evidence_projection_has_exact_reviewed_field_allowlist() -> None:
    sql = _sql()

    for pair in (
        "('procurement.supplier_invoice.prepare', 'portal_document_line_id')",
        "('inventory.adjustment.prepare', 'evidence_attachment_id')",
        "('inventory.destruction.prepare', 'certificate_attachment_id')",
    ):
        assert pair in sql
    assert "(expected_capability_code, evidence_field) NOT IN" in sql


def test_runtime_python_callers_do_not_read_raw_command_requests() -> None:
    runtime_callers = (
        "backend/scripts/compile_live18_browser_fixture.py",
        "backend/tests/live_canonical/test_live_operator_journeys.py",
        "backend/tests/live_canonical/reconciliation.py",
    )
    for relative_path in runtime_callers:
        source = (ROOT / relative_path).read_text(encoding="utf-8")
        assert "automation.command_requests" not in source, relative_path

    demo = (
        ROOT / "backend/scripts/provision_canonical_demo.py"
    ).read_text(encoding="utf-8")
    assert demo.count("automation.command_requests") == 1
    owner_audit = demo.split("def reconcile_cross_table_invariants", 1)[1].split(
        "\ndef main", 1
    )[0]
    assert "automation.command_requests" in owner_audit
    main = demo.split("def main", 1)[1]
    assert "with staging_owner_audit_connection() as owner" in main
    assert "reconcile_cross_table_invariants(\n            owner," in main
    assert "requester_command_by_idempotency" in demo

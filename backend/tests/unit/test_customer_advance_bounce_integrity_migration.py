from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
GENERATOR = ROOT / "backend/scripts/generate_customer_advance_bounce_integrity_migration.py"
REVISION = ROOT / "backend/alembic/versions/20260828_0046_customer_advance_bounce_integrity.py"
SQL = ROOT / "backend/alembic/sql/20260828_0046_customer_advance_bounce_integrity.sql"
RUNTIME_FIXTURE = (
    ROOT
    / "backend/tests/postgres/check_customer_advance_cheque_bounce_lifecycle_runtime_role.py"
)


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_customer_advance_migration_is_linear_hash_bound_and_generated() -> None:
    generator = _load(GENERATOR, "customer_advance_bounce_generator")
    revision = _load(REVISION, "customer_advance_bounce_revision")
    sql = SQL.read_text(encoding="utf-8")

    assert generator.generated_sql() == sql
    assert revision.revision == "20260828_0046"
    assert revision.down_revision == "20260828_0045"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(sql.encode()).hexdigest()


def test_customer_advance_authority_is_branch_bound_and_bounce_replacement_safe() -> None:
    sql = SQL.read_text(encoding="utf-8")
    for fragment in (
        "FROM sales.orders AS source_order",
        "source_order.branch_id=branch_id",
        ":customer-advance-order:",
        "reversal.related_payment_id=existing.id",
        "reversal.payment_purpose='cheque_bounce'",
        "FROM finance.payments AS source_payment",
        "source_payment.branch_id=branch_id",
        "payment.payment_purpose NOT IN ('commercial_settlement','customer_advance')",
        "SELECT event.journal_entry_id INTO STRICT original_journal_id",
        "event.payment_id=(resolved_document->>'original_payment_id')::uuid",
        "THEN resolved_document->>'cheques_in_hand_account_id' ELSE resolved_document->>'settlement_account_id'",
        "THEN resolved_document->>'offset_account_id' ELSE resolved_document->>'cheques_in_hand_account_id'",
    ):
        assert fragment in sql
    assert "AND branch_id=branch_id AND customer_account_id=customer.id" not in sql
    assert "FROM finance.payments WHERE org_id=organization_id AND id=original_id" not in sql


def test_shared_prepare_authority_preserves_post_baseline_capabilities() -> None:
    sql = SQL.read_text(encoding="utf-8")
    expected = {
        "finance.adjustment_note.prepare": (
            "adjustment_note",
            "finance.adjustment_note.post",
        ),
        "finance.bank_reconciliation.prepare": (
            "reconciliation_match",
            "finance.bank_reconciliation.match",
        ),
        "finance.expense_claim.prepare": (
            "expense_claim",
            "finance.expense_claim.post",
        ),
    }
    for capability, (target, operation) in expected.items():
        assert f"WHEN '{capability}' THEN '{target}'" in sql
        assert f"WHEN '{capability}' THEN '{operation}'" in sql
        assert capability in sql


def test_postgresql_gate_runs_the_customer_advance_bounce_lifecycle() -> None:
    gate = (ROOT / "database/canonical/ci/run_alembic_postgres15_gate.sh").read_text(
        encoding="utf-8"
    )
    fixture_name = RUNTIME_FIXTURE.relative_to(ROOT).as_posix()
    assert fixture_name in gate
    source = RUNTIME_FIXTURE.read_text(encoding="utf-8")
    for fragment in (
        "CANONICAL_CI_ALLOW_DISPOSABLE",
        "canonical_alembic_ci",
        "PostgreSQL 15",
        "cross-branch",
        "replacement",
        "customer_advance",
        "cheque_bounce",
        "session.rollback()",
    ):
        assert fragment in source

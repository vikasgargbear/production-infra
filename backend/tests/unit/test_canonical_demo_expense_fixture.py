from __future__ import annotations

import hashlib
import importlib.util
from datetime import date
from pathlib import Path
from uuid import UUID

import pytest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend/scripts/provision_canonical_demo.py"
WORKFLOW = ROOT / ".github/workflows/canonical-staging.yml"


def _module():
    spec = importlib.util.spec_from_file_location(
        "provision_canonical_demo_expense_fixture", SCRIPT
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_reviewed_expense_receipt_requires_exact_external_pdf_hash(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    module = _module()
    receipt = tmp_path / "reviewed-receipt.pdf"
    value = b"%PDF-1.7\n" + b"externally-reviewed-live18-receipt\n" * 4
    receipt.write_bytes(value)
    monkeypatch.setenv("CANONICAL_DEMO_EXPENSE_RECEIPT_PATH", str(receipt))
    monkeypatch.setenv(
        "CANONICAL_DEMO_EXPENSE_RECEIPT_SHA256", hashlib.sha256(value).hexdigest()
    )

    assert module.reviewed_expense_receipt() == value

    monkeypatch.setenv("CANONICAL_DEMO_EXPENSE_RECEIPT_SHA256", "0" * 64)
    with pytest.raises(RuntimeError, match="reviewed receipt SHA-256 differs"):
        module.reviewed_expense_receipt()


def test_expense_receipt_is_run_scoped_but_ledger_accounts_are_stable_master_data(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GITHUB_RUN_ID", "32850000000")
    monkeypatch.setenv("GITHUB_RUN_ATTEMPT", "2")
    first = _module()
    monkeypatch.setenv("GITHUB_RUN_ID", "32850000001")
    monkeypatch.setenv("GITHUB_RUN_ATTEMPT", "1")
    second = _module()

    assert first.IDS["expense_receipt_evidence"] != second.IDS[
        "expense_receipt_evidence"
    ]
    assert UUID(first.IDS["expense_receipt_evidence"]).version == 5
    for account_key in (
        "expense_claim_expense_account",
        "expense_claim_reimbursement_account",
    ):
        assert first.IDS[account_key] == second.IDS[account_key]
        assert UUID(first.IDS[account_key]).version == 7


class _ReceiptCursor:
    def __init__(self, rows: list[tuple]) -> None:
        self.rows = rows
        self.statements: list[str] = []

    def execute(self, statement: str, _parameters: tuple) -> None:
        self.statements.append(statement)

    def fetchall(self) -> list[tuple]:
        return self.rows


def test_reviewed_expense_receipt_reuses_exact_retained_content() -> None:
    module = _module()
    value = b"%PDF-1.7\nreviewed-replay-safe-receipt"
    digest = hashlib.sha256(value).digest()
    existing_id = UUID("d3000000-0000-5000-8000-000000000099")
    cursor = _ReceiptCursor(
        [
            (
                existing_id,
                "application/pdf",
                len(value),
                memoryview(digest),
                "expense_receipt",
                "retained",
            )
        ]
    )

    assert module.reconcile_reviewed_expense_receipt_metadata(
        cursor, value, business_date=date(2026, 8, 28)
    ) == str(existing_id)
    assert module.IDS["expense_receipt_evidence"] == str(existing_id)
    assert len(cursor.statements) == 1


def test_reviewed_expense_receipt_rejects_contradictory_existing_metadata() -> None:
    module = _module()
    value = b"%PDF-1.7\nreviewed-conflicting-receipt"
    digest = hashlib.sha256(value).digest()
    cursor = _ReceiptCursor(
        [
            (
                UUID(module.IDS["expense_receipt_evidence"]),
                "application/pdf",
                len(value),
                memoryview(digest),
                "other",
                "retained",
            )
        ]
    )

    with pytest.raises(RuntimeError, match="metadata contradicts"):
        module.reconcile_reviewed_expense_receipt_metadata(
            cursor, value, business_date=date(2026, 8, 28)
        )


def test_expense_prerequisites_use_only_canonical_evidence_accounts_and_role() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    assert "'expense_receipt'" in source
    assert "member_reimbursement_liability" in source
    assert "erp_core_commands.replace_setting" in source
    assert "UPDATE core.settings" not in source
    assert 'INSERT INTO core.attachments' in source
    assert 'INSERT INTO finance.accounts' in source
    assert "financial." not in source
    assert "CANONICAL_EXPENSE_RECEIPT_AUTHORITY_MISSING" in source
    assert "CANONICAL_DEMO_EXPENSE_RECEIPT_BASE64" in workflow
    assert "CANONICAL_DEMO_EXPENSE_RECEIPT_SHA256" in workflow
    assert "sha256sum" in workflow


def test_demo_provisions_a_bounded_canonical_expense_retention_policy() -> None:
    module = _module()
    source = SCRIPT.read_text(encoding="utf-8")

    assert module.DEMO_EXPENSE_RECEIPT_RETENTION_MONTHS == 84
    assert "'evidence_retention'" in source
    assert "'expense_receipt_months'" in source
    assert "value_type, value_numeric" in source
    assert 'Decimal("1") <= retention_months <= Decimal("1200")' in source
    assert "UPDATE core.settings" not in source

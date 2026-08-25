from __future__ import annotations

import hashlib
import importlib.util
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


def test_expense_fixture_ids_are_run_scoped_and_canonical(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GITHUB_RUN_ID", "32850000000")
    monkeypatch.setenv("GITHUB_RUN_ATTEMPT", "2")
    module = _module()

    values = {
        module.IDS["expense_receipt_evidence"],
        module.IDS["expense_claim_expense_account"],
        module.IDS["expense_claim_reimbursement_account"],
    }
    assert len(values) == 3
    assert all(UUID(value).version == 5 for value in values)


def test_expense_prerequisites_use_only_canonical_evidence_accounts_and_role() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    assert "'expense_receipt'" in source
    assert "member_reimbursement_liability" in source
    assert 'INSERT INTO core.attachments' in source
    assert 'INSERT INTO finance.accounts' in source
    assert "financial." not in source
    assert "CANONICAL_EXPENSE_RECEIPT_AUTHORITY_MISSING" in source
    assert "CANONICAL_DEMO_EXPENSE_RECEIPT_BASE64" in workflow
    assert "CANONICAL_DEMO_EXPENSE_RECEIPT_SHA256" in workflow
    assert "sha256sum" in workflow

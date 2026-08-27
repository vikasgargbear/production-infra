"""Hash-bound canonical transaction-integrity evidence checks."""

import json
from pathlib import Path

from scripts.audit import transaction_integrity_audit as transaction_audit


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def test_release_audit_requires_canonical_live_evidence():
    codes = {issue.code for issue in transaction_audit.collect_issues()}
    assert codes == {"CANONICAL_TRANSACTION_LIVE_EVIDENCE_MISSING"}


def _canonical_live_evidence(module, git_sha: str) -> dict:
    return {
        "schema_version": module.EVIDENCE_SCHEMA_VERSION,
        "project_ref": module.CANONICAL_STAGING_PROJECT_REF,
        "git_commit": git_sha,
        "alembic_revision": module._canonical_head_revision(REPOSITORY_ROOT),
        "captured_at": "2026-08-25T12:00:00+00:00",
        "runtime_role": {
            "session_user": "erp_runtime",
            "superuser": False,
            "bypass_rls": False,
            "owns_business_relations": False,
        },
        "transaction_checks": {
            "payment_idempotency_unique": True,
            "allocation_table_present": True,
            "allocation_projection_owner": "canonical_database_invariant",
            "bank_reconciliation_contract": "bank_statements_and_reconciliation_matches",
            "posted_journal_immutability": True,
            "order_invoice_generation_owner": "canonical_command_functions",
            "grn_inventory_effect_owner": "canonical_command_functions",
            "finance_rls_enabled_and_forced": True,
        },
    }


def test_release_audit_accepts_fresh_exact_sha_canonical_evidence(tmp_path):
    git_sha = "a" * 40
    evidence_path = tmp_path / "transaction-integrity.json"
    evidence_path.write_text(
        json.dumps(_canonical_live_evidence(transaction_audit, git_sha)),
        encoding="utf-8",
    )

    assert transaction_audit.collect_issues(
        live_evidence_path=evidence_path,
        expected_git_sha=git_sha,
    ) == []


def test_release_audit_rejects_retired_project_and_stale_sha_evidence(tmp_path):
    evidence = _canonical_live_evidence(transaction_audit, "b" * 40)
    evidence["project_ref"] = transaction_audit.RETIRED_SOURCE_PROJECT_REF
    evidence_path = tmp_path / "transaction-integrity.json"
    evidence_path.write_text(json.dumps(evidence), encoding="utf-8")

    codes = {
        issue.code
        for issue in transaction_audit.collect_issues(
            live_evidence_path=evidence_path,
            expected_git_sha="a" * 40,
        )
    }

    assert codes == {
        "CANONICAL_TRANSACTION_EVIDENCE_WRONG_PROJECT",
        "CANONICAL_TRANSACTION_EVIDENCE_STALE_SHA",
    }

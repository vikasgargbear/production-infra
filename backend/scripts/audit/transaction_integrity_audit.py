#!/usr/bin/env python3
"""Fail-closed release audit for the canonical transaction database boundary.

The checked-in ``database/live-schema-evidence.json`` describes the retired
legacy Supabase source project. It remains migration evidence, but it must not
be interpreted as evidence about the isolated canonical staging project. This
audit therefore separates the hash-bound Alembic contract from a fresh,
external exact-SHA capture from canonical staging.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime
import json
from pathlib import Path
import re
import subprocess
from typing import Any, Mapping


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
CANONICAL_STAGING_PROJECT_REF = "rgihahbmkrmhitjdjvev"
RETIRED_SOURCE_PROJECT_REF = "jfrairkkzxwkhbtqejnz"
EVIDENCE_SCHEMA_VERSION = "1.0.0"


@dataclass(frozen=True)
class IntegrityIssue:
    code: str
    message: str


def _read(root: Path, relative_path: str) -> str:
    return (root / relative_path).read_text(encoding="utf-8")


def _json(root: Path, relative_path: str) -> dict[str, Any]:
    value = json.loads(_read(root, relative_path))
    if not isinstance(value, dict):
        raise ValueError(f"{relative_path} must contain a JSON object")
    return value


def _canonical_head_revision(root: Path) -> str:
    revisions: dict[str, str | None] = {}
    for path in (root / "backend/alembic/versions").glob("*.py"):
        source = path.read_text(encoding="utf-8")
        revision_match = re.search(
            r'^revision\s*=\s*["\']([^"\']+)["\']', source, re.MULTILINE
        )
        parent_match = re.search(
            r'^down_revision\s*=\s*(?:["\']([^"\']+)["\']|None)',
            source,
            re.MULTILINE,
        )
        if revision_match and parent_match:
            revisions[revision_match.group(1)] = parent_match.group(1)
    if not revisions:
        raise ValueError("canonical Alembic revision chain is empty")
    parents = {parent for parent in revisions.values() if parent is not None}
    heads = sorted(set(revisions) - parents)
    if len(heads) != 1:
        raise ValueError(f"canonical Alembic chain must have one head, found {heads}")
    return heads[0]


def _repository_sha(root: Path) -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=root,
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    value = result.stdout.strip().lower()
    return value if re.fullmatch(r"[0-9a-f]{40}", value) else None


def _missing_tokens(source: str, tokens: tuple[str, ...]) -> list[str]:
    return [token for token in tokens if token not in source]


def _static_canonical_issues(root: Path) -> list[IntegrityIssue]:
    issues: list[IntegrityIssue] = []
    authority = _json(root, "database/schema-authority.json")
    if authority.get("canonical_migration_root") != "backend/alembic":
        issues.append(IntegrityIssue(
            "CANONICAL_MIGRATION_AUTHORITY_INVALID",
            "backend/alembic must be the canonical production migration authority",
        ))

    legacy_capture = _json(root, "database/live-schema-evidence.json")
    if legacy_capture.get("project_ref") != RETIRED_SOURCE_PROJECT_REF:
        issues.append(IntegrityIssue(
            "RETIRED_SOURCE_EVIDENCE_IDENTITY_INVALID",
            "the checked-in historical schema capture no longer identifies the retired source project",
        ))

    baseline = _read(root, "backend/alembic/sql/20260820_0001_canonical_v1.sql")
    bank_reconciliation = _read(
        root, "backend/alembic/sql/20260825_0008_bank_reconciliation_command.sql"
    )
    canonical_sql = "\n".join(
        path.read_text(encoding="utf-8")
        for path in sorted((root / "backend/alembic/sql").glob("*.sql"))
    )

    payment_tokens = (
        'ALTER TABLE "automation"."command_requests" ADD CONSTRAINT "command_requests_idempotency_uq" UNIQUE',
        'CREATE FUNCTION "erp_automation_commands"."persist_customer_receipt_prepare"',
        'CREATE FUNCTION "erp_automation_commands"."persist_supplier_payment_prepare"',
        "capability_code='finance.customer_receipt.prepare' AND idempotency_key_hash=key_hash FOR SHARE",
        "capability_code='finance.supplier_payment.prepare' AND idempotency_key_hash=key_hash FOR SHARE",
    )
    if _missing_tokens(baseline, payment_tokens):
        issues.append(IntegrityIssue(
            "CANONICAL_PAYMENT_IDEMPOTENCY_MISSING",
            "canonical receipt/payment prepare lacks a durable scoped command-key replay contract",
        ))

    allocation_tokens = (
        'CREATE TABLE "finance"."allocations"',
        'CREATE CONSTRAINT TRIGGER "allocations_guard_ct"',
        'CREATE TRIGGER "finance_allocations_immutable_trg" BEFORE UPDATE OR DELETE',
        'ALTER TABLE "finance"."allocations" ENABLE ROW LEVEL SECURITY',
        'ALTER TABLE "finance"."allocations" FORCE ROW LEVEL SECURITY',
        'REVOKE ALL ON TABLE "finance"."allocations" FROM PUBLIC, "erp_app", "erp_runtime"',
    )
    if _missing_tokens(baseline, allocation_tokens):
        issues.append(IntegrityIssue(
            "CANONICAL_ALLOCATION_CONTRACT_MISSING",
            "canonical allocations are not fully owned, immutable, and tenant constrained",
        ))

    journal_tokens = (
        'CREATE CONSTRAINT TRIGGER "journal_entries_guard_ct"',
        'CREATE CONSTRAINT TRIGGER "journal_lines_guard_ct"',
        "posted journal financial fields are immutable",
        "journal lines may change only while parent is draft",
        "journal reversal is not an exact sign inversion",
        'ALTER TABLE "finance"."journal_entries" FORCE ROW LEVEL SECURITY',
        'ALTER TABLE "finance"."journal_lines" FORCE ROW LEVEL SECURITY',
    )
    if _missing_tokens(baseline, journal_tokens):
        issues.append(IntegrityIssue(
            "CANONICAL_JOURNAL_IMMUTABILITY_MISSING",
            "canonical posted journals or their lines are not immutable and tenant constrained",
        ))

    reconciliation_tokens = (
        "finance.bank_reconciliation.prepare",
        "finance.bank_reconciliation.match",
        "INSERT INTO finance.reconciliation_matches",
        "SESSION_USER<>'erp_runtime'",
        "idempotency_key_hash=key_hash FOR SHARE",
        "GRANT EXECUTE ON FUNCTION erp_automation_commands.execute_bank_reconciliation_command",
        "REVOKE INSERT,UPDATE ON finance.reconciliation_matches FROM erp_app",
    )
    if _missing_tokens(bank_reconciliation, reconciliation_tokens):
        issues.append(IntegrityIssue(
            "CANONICAL_BANK_RECONCILIATION_CONTRACT_MISSING",
            "bank reconciliation is not fully command-owned and idempotent in the canonical chain",
        ))

    ownership_tokens = (
        'CREATE FUNCTION "erp_automation_commands"."persist_sales_invoice_prepare"',
        'CREATE FUNCTION "erp_trade_commands"."post_goods_receipt"',
        'CREATE FUNCTION "erp_trade_commands"."post_inventory_document"',
        'CREATE TRIGGER "finance_accounting_events_immutable_trg"',
    )
    forbidden_legacy_owners = (
        "CREATE OR REPLACE FUNCTION update_inventory_on_sale()",
        "CREATE OR REPLACE FUNCTION generate_invoice_on_delivery()",
        "CREATE OR REPLACE FUNCTION update_inventory_on_grn()",
    )
    if _missing_tokens(baseline, ownership_tokens) or any(
        token in canonical_sql for token in forbidden_legacy_owners
    ):
        issues.append(IntegrityIssue(
            "CANONICAL_TRANSACTION_OWNERSHIP_CONFLICT",
            "sales invoice or GRN effects are not exclusively owned by canonical command functions",
        ))

    runtime_tokens = (
        'CREATE ROLE "erp_runtime" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS',
        'REVOKE ALL ON SCHEMA "erp_automation_commands" FROM PUBLIC, "erp_app", "erp_runtime"',
        'GRANT USAGE ON SCHEMA "erp_automation_commands" TO "erp_runtime"',
        'GRANT EXECUTE ON FUNCTION "erp_automation_commands"."execute_approved_command"',
    )
    if _missing_tokens(baseline, runtime_tokens):
        issues.append(IntegrityIssue(
            "CANONICAL_RUNTIME_ROLE_BOUNDARY_MISSING",
            "the canonical runtime role is not non-owner/NOBYPASSRLS with an explicit command boundary",
        ))
    return issues


def _load_evidence(
    root: Path,
    evidence_path: str | Path | None,
) -> dict[str, Any] | None:
    if evidence_path is None:
        configured = _json(root, "database/schema-authority.json").get(
            "canonical_transaction_integrity_evidence"
        )
        if configured is None:
            return None
        if not isinstance(configured, str) or not configured.strip():
            raise ValueError(
                "canonical_transaction_integrity_evidence must be null or a repository-relative path"
            )
        path = root / configured
    else:
        path = Path(evidence_path)
        if not path.is_absolute():
            path = root / path
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("canonical transaction evidence must contain a JSON object")
    return value


def _live_evidence_issues(
    root: Path,
    evidence: Mapping[str, Any] | None,
    expected_git_sha: str | None,
) -> list[IntegrityIssue]:
    if evidence is None:
        return [IntegrityIssue(
            "CANONICAL_TRANSACTION_LIVE_EVIDENCE_MISSING",
            "deploy the exact release SHA to canonical staging and capture its transaction schema using erp_runtime",
        )]

    issues: list[IntegrityIssue] = []
    expected_sha = (expected_git_sha or _repository_sha(root) or "").lower()
    if not re.fullmatch(r"[0-9a-f]{40}", expected_sha):
        issues.append(IntegrityIssue(
            "CANONICAL_TRANSACTION_EXPECTED_SHA_MISSING",
            "an exact 40-character release SHA is required to review live transaction evidence",
        ))
    if evidence.get("schema_version") != EVIDENCE_SCHEMA_VERSION:
        issues.append(IntegrityIssue(
            "CANONICAL_TRANSACTION_EVIDENCE_SCHEMA_INVALID",
            "canonical transaction evidence does not use the reviewed schema version",
        ))
    if evidence.get("project_ref") != CANONICAL_STAGING_PROJECT_REF:
        issues.append(IntegrityIssue(
            "CANONICAL_TRANSACTION_EVIDENCE_WRONG_PROJECT",
            "transaction evidence is not from the isolated canonical staging project",
        ))
    evidence_sha = str(evidence.get("git_commit", "")).lower()
    if expected_sha and evidence_sha != expected_sha:
        issues.append(IntegrityIssue(
            "CANONICAL_TRANSACTION_EVIDENCE_STALE_SHA",
            "transaction evidence was not captured from the exact reviewed release SHA",
        ))
    if evidence.get("alembic_revision") != _canonical_head_revision(root):
        issues.append(IntegrityIssue(
            "CANONICAL_TRANSACTION_EVIDENCE_STALE_REVISION",
            "canonical staging is not at the checked-in Alembic head",
        ))
    try:
        captured_at = datetime.fromisoformat(
            str(evidence.get("captured_at", "")).replace("Z", "+00:00")
        )
        if captured_at.tzinfo is None:
            raise ValueError("timezone required")
    except ValueError:
        issues.append(IntegrityIssue(
            "CANONICAL_TRANSACTION_EVIDENCE_TIME_INVALID",
            "canonical transaction evidence needs a timezone-aware capture timestamp",
        ))

    runtime = evidence.get("runtime_role")
    if not isinstance(runtime, dict) or runtime != {
        "session_user": "erp_runtime",
        "superuser": False,
        "bypass_rls": False,
        "owns_business_relations": False,
    }:
        issues.append(IntegrityIssue(
            "CANONICAL_RUNTIME_ROLE_LIVE_UNVERIFIED",
            "live evidence does not prove erp_runtime is non-owner, non-superuser, and NOBYPASSRLS",
        ))

    required_checks = {
        "payment_idempotency_unique": True,
        "allocation_table_present": True,
        "allocation_projection_owner": "canonical_database_invariant",
        "bank_reconciliation_contract": "bank_statements_and_reconciliation_matches",
        "posted_journal_immutability": True,
        "order_invoice_generation_owner": "canonical_command_functions",
        "grn_inventory_effect_owner": "canonical_command_functions",
        "finance_rls_enabled_and_forced": True,
    }
    checks = evidence.get("transaction_checks")
    if not isinstance(checks, dict) or any(
        checks.get(name) != expected for name, expected in required_checks.items()
    ):
        issues.append(IntegrityIssue(
            "CANONICAL_TRANSACTION_LIVE_CONTRACT_UNVERIFIED",
            "live canonical transaction ownership, idempotency, immutability, or forced-RLS checks are incomplete",
        ))
    return issues


def collect_issues(
    root: Path = REPOSITORY_ROOT,
    *,
    live_evidence_path: str | Path | None = None,
    expected_git_sha: str | None = None,
) -> list[IntegrityIssue]:
    issues = _static_canonical_issues(root)
    evidence = _load_evidence(root, live_evidence_path)
    issues.extend(_live_evidence_issues(root, evidence, expected_git_sha))
    return issues


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--live-evidence",
        help="fresh external JSON capture from canonical staging",
    )
    parser.add_argument(
        "--expected-git-sha",
        help="exact release SHA that the staging services must expose",
    )
    args = parser.parse_args()
    try:
        issues = collect_issues(
            live_evidence_path=args.live_evidence,
            expected_git_sha=args.expected_git_sha,
        )
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"Canonical transaction integrity: BLOCKED: {error}")
        return 2

    print("=== Canonical Transaction Integrity Audit ===")
    if not issues:
        print("PASS: canonical static contract and exact-SHA staging evidence verified")
        return 0
    for issue in issues:
        print(f"FAIL [{issue.code}] {issue.message}")
    print(f"\n{len(issues)} release blocker(s)")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

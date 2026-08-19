#!/usr/bin/env python3
"""Fail-closed readiness audit for the dedicated payment idempotency store."""

from dataclasses import dataclass
import json
from pathlib import Path
from typing import List


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
CONTRACT_PATH = REPOSITORY_ROOT / "docs/architecture/payment-idempotency-store.json"
AUTHORITY_PATH = REPOSITORY_ROOT / "database/schema-authority.json"


@dataclass(frozen=True)
class ReadinessIssue:
    code: str
    message: str


def _json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def collect_issues() -> List[ReadinessIssue]:
    issues: List[ReadinessIssue] = []
    contract = _json(CONTRACT_PATH)
    authority = _json(AUTHORITY_PATH)

    if contract.get("status") != "implemented":
        issues.append(ReadinessIssue(
            "DEDICATED_IDEMPOTENCY_STORE_UNIMPLEMENTED",
            "dedicated payment idempotency store has no approved implementation",
        ))
    if authority.get("readiness_state") != "baselined":
        issues.append(ReadinessIssue(
            "LIVE_SCHEMA_BASELINE_REQUIRED",
            "live schema must be reviewed before an idempotency migration is authored",
        ))

    temporary_backend = contract.get("temporary_backend")
    if temporary_backend:
        issues.append(ReadinessIssue(
            "TEMPORARY_IDEMPOTENCY_BACKEND",
            f"{temporary_backend} is restricted to development and test",
        ))

    payment_routes = (
        REPOSITORY_ROOT / "backend/app/api/routes/finance/payments/routes.py"
    ).read_text(encoding="utf-8")
    allocation_routes = (
        REPOSITORY_ROOT / "backend/app/api/routes/finance/allocation/routes.py"
    ).read_text(encoding="utf-8")
    uncovered = []
    mutation_contracts = (
        (payment_routes, "cancel_payment", "payment.cancel"),
        (payment_routes, "create_bank_reconciliation", "payment.reconcile"),
        (payment_routes, "allocate_payment", "payment.allocate"),
        (allocation_routes, "allocate_payment", "payment.allocate"),
        (allocation_routes, "allocate_payment_bulk", "payment.allocate"),
        (allocation_routes, "auto_allocate_payment", "payment.allocate"),
        (allocation_routes, "delete_allocation", "payment.allocate"),
    )
    for source, function_name, operation in mutation_contracts:
        method = source.split(f"async def {function_name}", 1)[1].split(
            "@router.", 1
        )[0]
        guarded = (
            f'operation="{operation}"' in method
            or (
                "_require_allocation_idempotency(idempotency_key)" in method
                and f'operation="{operation}"' in source
            )
        )
        if 'alias="X-Idempotency-Key"' not in method or not guarded:
            uncovered.append(function_name)
    if uncovered:
        issues.append(ReadinessIssue(
            "PAYMENT_MUTATIONS_NOT_COVERED",
            "missing idempotency contract: " + ", ".join(uncovered),
        ))

    return issues


def main() -> int:
    issues = collect_issues()
    print("=== Payment Idempotency Readiness ===")
    if not issues:
        print("PASS: dedicated payment idempotency store is promotion-ready")
        return 0
    for issue in issues:
        print(f"FAIL [{issue.code}] {issue.message}")
    print(f"\n{len(issues)} blocker(s)")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

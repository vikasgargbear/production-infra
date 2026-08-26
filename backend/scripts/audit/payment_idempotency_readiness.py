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

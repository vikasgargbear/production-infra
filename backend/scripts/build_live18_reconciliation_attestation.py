#!/usr/bin/env python3
"""Create a fixed-schema marker only after Live18 reconciliation succeeds."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

try:
    from scripts.build_live18_artifact_manifest import (
        ArtifactManifestError,
        DEFAULT_OPERATION_MATRIX,
        RECONCILIATION_SCHEMA,
        SHA,
        _digest,
        _evidence_set_sha256,
        _expected_operations,
        _operation_set_sha256,
        _read_json,
    )
except ModuleNotFoundError:  # Direct script execution adds this directory to sys.path.
    from build_live18_artifact_manifest import (
        ArtifactManifestError,
        DEFAULT_OPERATION_MATRIX,
        RECONCILIATION_SCHEMA,
        SHA,
        _digest,
        _evidence_set_sha256,
        _expected_operations,
        _operation_set_sha256,
        _read_json,
    )


def build_attestation(
    *,
    deployed_sha: Path,
    evidence_dir: Path,
    operation_matrix: Path,
    database_evidence: Path | None,
    provider: str,
    run_id: str,
    run_attempt: str,
) -> dict[str, Any]:
    deployment = _read_json(deployed_sha)
    commit_sha = deployment.get("commit_sha")
    if (
        deployment.get("schema") != "aasopharma.live18.deployment-evidence.v1"
        or deployment.get("provider") != provider
        or not isinstance(commit_sha, str)
        or SHA.fullmatch(commit_sha) is None
    ):
        raise ArtifactManifestError("reconciliation deployment evidence is invalid")
    if provider not in {"render", "railway"}:
        raise ArtifactManifestError("reconciliation provider must be render or railway")

    expected = _expected_operations(operation_matrix)
    actual_files = {
        path.name
        for path in evidence_dir.glob("*.json")
        if path.name != "completed-resources.json"
    }
    expected_files = {f"{operation_id}.json" for operation_id in expected}
    if actual_files != expected_files:
        raise ArtifactManifestError(
            "reconciliation requires the exact release-ready browser evidence files"
        )

    rows: list[dict[str, Any]] = []
    evidence_storage_backend_proof: dict[str, Any] | None = None
    for operation_id, command_operation in sorted(expected.items()):
        path = evidence_dir / f"{operation_id}.json"
        value = _read_json(path)
        if (
            value.get("evidence_schema") != "aasopharma.live18.browser.v1"
            or value.get("operation_id") != operation_id
            or value.get("command_operation") != command_operation
            or value.get("tested_sha") != commit_sha
        ):
            raise ArtifactManifestError(
                f"reconciliation browser evidence drifted for {operation_id}"
            )
        rows.append({
            "operation_id": operation_id,
            "raw_evidence_sha256": _digest(path),
        })
        if operation_id == "expense_claim" and provider == "render":
            http_rows = value.get("http_evidence")
            if not isinstance(http_rows, list):
                raise ArtifactManifestError(
                    "expense claim omitted backend HTTP evidence"
                )
            uploads = [
                row
                for row in http_rows
                if isinstance(row, dict)
                and row.get("actor") == "requester"
                and row.get("method") == "POST"
                and str(row.get("path", "")).split("?", 1)[0]
                == "/api/web/evidence/expense-receipts"
                and row.get("status") in {200, 201}
            ]
            if len(uploads) != 1:
                raise ArtifactManifestError(
                    "expense claim must prove exactly one successful backend evidence upload"
                )
            evidence_storage_backend_proof = {
                "actor": "requester",
                "method": "POST",
                "path": "/api/web/evidence/expense-receipts",
                "status": uploads[0]["status"],
                "browser_evidence_sha256": _digest(path),
            }

    database_path = (
        database_evidence
        if database_evidence is not None
        and database_evidence.is_file()
        and database_evidence.stat().st_size > 0
        else None
    )
    if database_path is None:
        raise ArtifactManifestError(
            f"{provider.title()} reconciliation requires captured database evidence"
        )

    if (
        provider == "render"
        and "expense_claim" in expected
        and evidence_storage_backend_proof is None
    ):
        raise ArtifactManifestError(
            "reconciliation omitted the evidence-storage backend proof"
        )

    result = {
        "schema": RECONCILIATION_SCHEMA,
        "status": "success",
        "provider": provider,
        "commit_sha": commit_sha,
        "run": {"id": run_id, "attempt": run_attempt},
        "operation_count": len(expected),
        "operation_ids": sorted(expected),
        "operation_set_sha256": _operation_set_sha256(expected),
        "browser_evidence_set_sha256": _evidence_set_sha256(rows),
        "database_mode": {
            "railway": "captured_railway",
            "render": "captured_render_runtime",
        }[provider],
        "database_evidence_sha256": _digest(database_path),
    }
    if evidence_storage_backend_proof is not None:
        result["evidence_storage_backend_proof"] = evidence_storage_backend_proof
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--deployed-sha", required=True, type=Path)
    parser.add_argument("--evidence-dir", required=True, type=Path)
    parser.add_argument(
        "--operation-matrix", type=Path, default=DEFAULT_OPERATION_MATRIX
    )
    parser.add_argument("--database-evidence", type=Path)
    parser.add_argument("--provider", required=True, choices=("render", "railway"))
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    value = build_attestation(
        deployed_sha=args.deployed_sha,
        evidence_dir=args.evidence_dir,
        operation_matrix=args.operation_matrix,
        database_evidence=args.database_evidence,
        provider=args.provider,
        run_id=os.getenv("GITHUB_RUN_ID", "local"),
        run_attempt=os.getenv("GITHUB_RUN_ATTEMPT", "local"),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(
        args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600
    )
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump(value, handle, indent=2, sort_keys=True)
        handle.write("\n")


if __name__ == "__main__":
    main()

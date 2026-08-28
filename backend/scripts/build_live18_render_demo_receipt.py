#!/usr/bin/env python3
"""Commit a successful Render demo summary to a fixed, scrubbed receipt."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path

try:
    from scripts.build_live18_artifact_manifest import (
        ArtifactManifestError,
        RENDER_DEMO_RECEIPT_SCHEMA,
        SAFE_PROJECT_REF,
        SHA,
        UUID,
        _content_sha256,
    )
except ModuleNotFoundError:  # Direct script execution adds this directory to sys.path.
    from build_live18_artifact_manifest import (
        ArtifactManifestError,
        RENDER_DEMO_RECEIPT_SCHEMA,
        SAFE_PROJECT_REF,
        SHA,
        UUID,
        _content_sha256,
    )


def build_receipt(
    *,
    summary_path: Path,
    project_ref: str,
    commit_sha: str,
    deployed_sha: str,
    run_id: str,
    run_attempt: str,
) -> dict[str, object]:
    summary_bytes = summary_path.read_bytes()
    if not summary_bytes or len(summary_bytes) > 32 * 1024 * 1024:
        raise ArtifactManifestError("canonical demo summary is missing or oversized")
    summary = json.loads(summary_bytes)
    if not isinstance(summary, dict):
        raise ArtifactManifestError("canonical demo summary must be one JSON object")
    organization_id = summary.get("organization_id")
    denial_id = summary.get("rls_denial_organization_id")
    run_numbers_valid = all(
        value.isascii()
        and value.isdecimal()
        and 0 < int(value) <= 9_999_999_999_999_999_999
        for value in (run_id, run_attempt)
    )
    if (
        SAFE_PROJECT_REF.fullmatch(project_ref) is None
        or summary.get("project_ref") != project_ref
        or summary.get("organization_classification")
        != "disposable_synthetic_demo"
        or not isinstance(organization_id, str)
        or UUID.fullmatch(organization_id) is None
        or not isinstance(denial_id, str)
        or UUID.fullmatch(denial_id) is None
        or denial_id == organization_id
        or SHA.fullmatch(commit_sha) is None
        or deployed_sha != commit_sha
        or not run_numbers_valid
    ):
        raise ArtifactManifestError("canonical demo summary is not exact-run Render evidence")
    receipt: dict[str, object] = {
        "schema": RENDER_DEMO_RECEIPT_SCHEMA,
        "action": "provision-demo",
        "provider": "render",
        "project_ref": project_ref,
        "commit_sha": commit_sha,
        "deployed_sha": deployed_sha,
        "run": {"id": run_id, "attempt": run_attempt},
        "summary_sha256": hashlib.sha256(summary_bytes).hexdigest(),
    }
    receipt["content_sha256"] = _content_sha256(receipt)
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--summary", required=True, type=Path)
    parser.add_argument("--project-ref", required=True)
    parser.add_argument("--commit-sha", required=True)
    parser.add_argument("--deployed-sha", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--run-attempt", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    receipt = build_receipt(
        summary_path=args.summary,
        project_ref=args.project_ref,
        commit_sha=args.commit_sha,
        deployed_sha=args.deployed_sha,
        run_id=args.run_id,
        run_attempt=args.run_attempt,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump(receipt, handle, indent=2, sort_keys=True)
        handle.write("\n")


if __name__ == "__main__":
    main()

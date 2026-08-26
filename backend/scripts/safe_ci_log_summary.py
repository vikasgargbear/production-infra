#!/usr/bin/env python3
"""Emit fixed GitHub annotation metadata for a potentially sensitive CI log."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import BinaryIO, Optional


_ANNOTATION_TITLES = {
    "evidence-cleanup": "Canonical evidence reset cleanup failed",
    "evidence-identity": "Canonical evidence identity provisioning failed",
    "fixture": "Live canonical fixture failed",
    "readiness": "Canonical CI API failed readiness",
    "render": "Render reconciliation blocked",
    "reset": "Disposable canonical reset failed",
    "reset-role-cleanup": "Canonical reset role cleanup failed",
    "runtime": "Canonical CI API runtime diagnostic",
}
_CHUNK_SIZE = 1024 * 1024


def fingerprint_stream(stream: BinaryIO) -> dict[str, int | str]:
    digest = hashlib.sha256()
    byte_count = 0
    while True:
        chunk = stream.read(_CHUNK_SIZE)
        if not chunk:
            break
        digest.update(chunk)
        byte_count += len(chunk)
    return {"byte_count": byte_count, "sha256": digest.hexdigest()}


def safe_log_annotation(path: Path, *, label: str) -> str:
    title = _ANNOTATION_TITLES[label]
    with path.open("rb") as stream:
        summary = fingerprint_stream(stream)
    if label in {"evidence-identity", "render"}:
        text = path.read_text(encoding="utf-8", errors="replace")
        diagnostic = _safe_render_diagnostic(text)
        if diagnostic:
            summary["diagnostic"] = diagnostic
    elif label == "evidence-cleanup":
        text = path.read_text(encoding="utf-8", errors="replace")
        diagnostic = _safe_evidence_cleanup_diagnostic(text)
        if diagnostic:
            summary["diagnostic"] = diagnostic
    return (
        f"::error title={title}::"
        + json.dumps(summary, sort_keys=True, separators=(",", ":"))
    )


def _safe_render_diagnostic(text: str) -> Optional[str]:
    """Classify known provisioner failures without emitting provider payloads."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    for line in reversed(lines):
        evidence_identity = re.fullmatch(
            r"evidence storage service identity blocked: ([A-Z0-9_]+)",
            line,
        )
        if evidence_identity:
            return "evidence_storage_identity_" + evidence_identity.group(1).lower()
        missing = re.fullmatch(
            r"provisioning blocked: Missing required operator values: ([A-Z0-9_, ]+)",
            line,
        )
        if missing:
            return "missing_operator_values:" + missing.group(1).replace(" ", "")
        environment = re.fullmatch(
            r"provisioning blocked: Existing ([a-z0-9-]+) has unreviewed "
            r"environment keys: ([A-Z0-9_, ]+)",
            line,
        )
        if environment:
            return (
                "unreviewed_environment_keys:"
                + environment.group(1)
                + ":"
                + environment.group(2).replace(" ", "")
            )
        http = re.fullmatch(
            r"provisioning blocked: Render API (GET|POST|PATCH|DELETE) .+ "
            r"failed with HTTP ([0-9]{3})",
            line,
        )
        if http:
            return f"render_api_{http.group(1).lower()}_http_{http.group(2)}"
        if line.startswith("provisioning blocked:"):
            return "provisioning_contract_blocked"
    return None


def _safe_evidence_cleanup_diagnostic(text: str) -> Optional[str]:
    """Classify cleanup failures without emitting object keys or provider data."""

    normalized = " ".join(text.lower().split())
    if "requires the reviewed service-user token provider" in normalized:
        return "evidence_cleanup_credential_unavailable"
    if "do not reconcile one-to-one" in normalized:
        return "evidence_cleanup_inventory_reconciliation_failed"
    if "refused protected metadata" in normalized:
        return "evidence_cleanup_protected_metadata_present"
    if "canonical evidence reset cleanup blocked:" in normalized:
        return "evidence_cleanup_contract_blocked"
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", required=True, choices=sorted(_ANNOTATION_TITLES))
    parser.add_argument("log_path", type=Path)
    args = parser.parse_args()
    print(safe_log_annotation(args.log_path, label=args.label))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

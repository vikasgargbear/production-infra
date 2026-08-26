#!/usr/bin/env python3
"""Prove the canonical evidence key's allowed and denied Storage operations."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

import httpx


BUCKET = "canonical-evidence-private-v1"
ORGANIZATION_ID = "00000000-0000-7000-8000-000000000001"
BRANCH_ID = "00000000-0000-7000-8000-000000000002"
DIGEST = "c" * 64
OBJECT_KEY = f"{ORGANIZATION_ID}/{BRANCH_ID}/expense_receipt/{DIGEST}.pdf"
FIXTURE = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n"


class EvidenceCanaryError(RuntimeError):
    """The restricted Storage authority did not match its reviewed contract."""


def _status(response: httpx.Response, allowed: set[int], operation: str) -> str:
    if response.status_code not in allowed:
        raise EvidenceCanaryError(
            f"canonical evidence {operation} returned HTTP {response.status_code}"
        )
    return str(response.status_code)


def verify_canary(
    *,
    project_ref: str,
    api_key: str,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, Any]:
    origin = f"https://{project_ref}.supabase.co/storage/v1"
    object_url = f"{origin}/object/{BUCKET}/{OBJECT_KEY}"
    cleanup_required = False
    with httpx.Client(
        headers={"apikey": api_key}, timeout=20.0, transport=transport
    ) as client:
        try:
            upload = client.post(
                object_url,
                content=FIXTURE,
                headers={"Content-Type": "application/pdf", "x-upsert": "false"},
            )
            upload_status = _status(upload, {200, 201}, "upload")
            cleanup_required = True

            read = client.get(object_url)
            read_status = _status(read, {200}, "read")
            if read.content != FIXTURE:
                raise EvidenceCanaryError("canonical evidence readback bytes differ")

            listing = client.post(
                f"{origin}/object/list/{BUCKET}",
                json={
                    "prefix": f"{ORGANIZATION_ID}/{BRANCH_ID}/expense_receipt",
                    "limit": 100,
                },
            )
            list_status = _status(listing, {200}, "list denial")
            try:
                list_body = listing.json()
            except ValueError as exc:
                raise EvidenceCanaryError(
                    "canonical evidence list denial returned invalid JSON"
                ) from exc
            if list_body != []:
                raise EvidenceCanaryError("canonical evidence key can list private objects")

            update = client.put(
                object_url,
                content=FIXTURE,
                headers={"Content-Type": "application/pdf"},
            )
            if 200 <= update.status_code < 300:
                raise EvidenceCanaryError("canonical evidence key can update objects")

            invalid_path = client.post(
                f"{origin}/object/{BUCKET}/outside-reviewed-path/{DIGEST}.pdf",
                content=FIXTURE,
                headers={"Content-Type": "application/pdf", "x-upsert": "false"},
            )
            if 200 <= invalid_path.status_code < 300:
                raise EvidenceCanaryError("canonical evidence key can write an invalid path")

            cross_bucket = client.get(
                f"{origin}/object/canonical-evidence-unreviewed/{OBJECT_KEY}"
            )
            if 200 <= cross_bucket.status_code < 300:
                raise EvidenceCanaryError("canonical evidence key can read another bucket")

            delete = client.delete(object_url)
            delete_status = _status(delete, {200, 204}, "delete")
            cleanup_required = False
            return {
                "state": "verified",
                "allowed": {
                    "upload": upload_status,
                    "read": read_status,
                    "delete": delete_status,
                },
                "denied": {
                    "list_result_count": 0,
                    "update": str(update.status_code),
                    "invalid_path": str(invalid_path.status_code),
                    "cross_bucket": str(cross_bucket.status_code),
                },
            }
        finally:
            if cleanup_required:
                try:
                    client.delete(object_url)
                except httpx.RequestError:
                    pass


def _write_receipt(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(value, output, indent=2, sort_keys=True)
            output.write("\n")
        os.replace(temporary, path)
        path.chmod(0o600)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-ref", required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    api_key = os.getenv("EVIDENCE_STORAGE_SERVER_API_KEY", "")
    if not api_key.startswith("sb_secret_"):
        raise SystemExit("canonical evidence canary requires its restricted API key")
    try:
        receipt = verify_canary(project_ref=args.project_ref, api_key=api_key)
    except (EvidenceCanaryError, httpx.RequestError) as error:
        raise SystemExit(f"canonical evidence canary blocked: {error}") from None
    _write_receipt(args.receipt, receipt)
    print(json.dumps({"state": "verified", "project_ref": args.project_ref}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

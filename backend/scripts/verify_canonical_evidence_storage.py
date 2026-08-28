#!/usr/bin/env python3
"""Prove the canonical evidence key's allowed and denied Storage operations."""

from __future__ import annotations

import argparse
from collections.abc import Callable
import json
import os
from pathlib import Path
import time
from typing import Any

import httpx

from app.infrastructure.evidence_storage_credentials import (
    EvidenceCredentialConfig,
    EvidenceCredentialUnavailable,
    EvidenceServiceTokenProvider,
)


BUCKET = "canonical-evidence-private-v1"
ORGANIZATION_ID = "00000000-0000-7000-8000-000000000001"
BRANCH_ID = "00000000-0000-7000-8000-000000000002"
DIGEST = "c" * 64
OBJECT_KEY = f"{ORGANIZATION_ID}/{BRANCH_ID}/expense_receipt/{DIGEST}.pdf"
FIXTURE = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n"


class EvidenceCanaryError(RuntimeError):
    """The restricted Storage authority did not match its reviewed contract."""


def _object_presence(client: httpx.Client, object_url: str) -> bool:
    response = client.get(object_url)
    if response.status_code == 200:
        return True
    if response.status_code == 404:
        return False
    raise EvidenceCanaryError(
        "canonical evidence canary presence check returned "
        f"HTTP {response.status_code}"
    )


def _delete_and_prove_absent(
    client: httpx.Client,
    object_url: str,
    *,
    sleep: Callable[[float], None],
) -> None:
    """Delete the fixed canary key and positively prove terminal absence."""

    last_failure = "absence was not observed"
    for attempt in range(1, 4):
        try:
            response = client.delete(object_url)
            if response.status_code not in {200, 204, 404}:
                last_failure = f"delete returned HTTP {response.status_code}"
            elif not _object_presence(client, object_url):
                return
            else:
                last_failure = "object remained readable after delete"
        except httpx.RequestError:
            last_failure = "Storage request did not complete"
        if attempt < 3:
            sleep(float(attempt))
    raise EvidenceCanaryError(
        "canonical evidence canary cleanup could not prove exact-key absence: "
        + last_failure
    )


def _status(response: httpx.Response, allowed: set[int], operation: str) -> str:
    if response.status_code not in allowed:
        raise EvidenceCanaryError(
            f"canonical evidence {operation} returned HTTP {response.status_code}"
        )
    return str(response.status_code)


def verify_canary(
    *,
    project_ref: str,
    token_provider: EvidenceServiceTokenProvider,
    transport: httpx.BaseTransport | None = None,
    cleanup_sleep: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    origin = f"https://{project_ref}.supabase.co/storage/v1"
    object_url = f"{origin}/object/{BUCKET}/{OBJECT_KEY}"
    cleanup_required = False
    recovered_preexisting_object = False
    try:
        headers = token_provider.authorization_headers()
    except EvidenceCredentialUnavailable as exc:
        raise EvidenceCanaryError(
            "canonical evidence service-user token is unavailable"
        ) from exc
    with httpx.Client(headers=headers, timeout=20.0, transport=transport) as client:
        try:
            if _object_presence(client, object_url):
                _delete_and_prove_absent(client, object_url, sleep=cleanup_sleep)
                recovered_preexisting_object = True

            # Storage may accept an upload even when its response is lost. From
            # this point every exit path owns exact-key cleanup.
            cleanup_required = True
            upload = client.post(
                object_url,
                content=FIXTURE,
                headers={"Content-Type": "application/pdf", "x-upsert": "false"},
            )
            upload_status = _status(upload, {200, 201}, "upload")

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
            if _object_presence(client, object_url):
                raise EvidenceCanaryError(
                    "canonical evidence canary remained readable after delete"
                )
            cleanup_required = False
            return {
                "state": "verified",
                "recovered_preexisting_object": recovered_preexisting_object,
                "cleanup_absence_verified": True,
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
                _delete_and_prove_absent(client, object_url, sleep=cleanup_sleep)


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
    try:
        config = EvidenceCredentialConfig.from_environment(
            base_url=f"https://{args.project_ref}.supabase.co",
            project_ref=args.project_ref,
        )
        receipt = verify_canary(
            project_ref=args.project_ref,
            token_provider=EvidenceServiceTokenProvider(config),
        )
    except (
        EvidenceCanaryError,
        EvidenceCredentialUnavailable,
        httpx.RequestError,
    ) as error:
        raise SystemExit(f"canonical evidence canary blocked: {error}") from None
    _write_receipt(args.receipt, receipt)
    print(json.dumps({"state": "verified", "project_ref": args.project_ref}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

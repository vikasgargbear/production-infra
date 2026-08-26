#!/usr/bin/env python3
"""Reconcile evidence before a disposable staging reset.

The cleanup authority is deliberately narrower than the normal application
adapter.  It resolves every object key from PostgreSQL with an administrator
connection, requires a one-to-one match with canonical attachment metadata,
and sends one exact-key bulk delete to Supabase Storage only when reconciled
objects exist. An exactly empty database inventory needs no Storage credential.
The explicit reset authorization may override fixture retention only on the
pinned disposable project; legal holds still fail closed. It never mutates
``storage.objects`` with SQL and never prints or records object keys or API
credentials.
"""

from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
from typing import Any, Callable, Mapping, Sequence
from urllib.parse import quote

import httpx
import psycopg2


BUCKET = "canonical-evidence-private-v1"
CANONICAL_STAGING_PROJECT_REF = "rgihahbmkrmhitjdjvev"
CONTRACT_VERSION = "canonical-evidence-reset-cleanup-v1"
MAX_EXACT_KEYS = 1_000
PROJECT_REF_RE = re.compile(r"[a-z0-9]{20}")
SERVER_API_KEY_RE = re.compile(r"sb_secret_[A-Za-z0-9._-]{24,}")
OBJECT_KEY_RE = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/"
    r"[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/"
    r"expense_receipt/[0-9a-f]{64}\.pdf"
)
CANONICAL_METADATA_STATUSES = frozenset(
    {"pending_upload", "verified", "quarantined", "retained"}
)


class EvidenceResetCleanupError(RuntimeError):
    """The reviewed evidence reset cleanup could not be proven safe."""


@dataclass(frozen=True)
class AttachmentRecord:
    object_key: str
    status: str
    legal_hold: bool
    retention_until: date | None


@dataclass(frozen=True)
class EvidenceInventory:
    database_date: date
    storage_object_keys: tuple[str, ...]
    attachments: tuple[AttachmentRecord, ...]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _key_digest(keys: Sequence[str]) -> str:
    encoded = (
        json.dumps(sorted(keys), separators=(",", ":"), ensure_ascii=True) + "\n"
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _validate_project_ref(project_ref: str) -> None:
    if (
        PROJECT_REF_RE.fullmatch(project_ref) is None
        or project_ref != CANONICAL_STAGING_PROJECT_REF
    ):
        raise EvidenceResetCleanupError(
            "evidence cleanup is restricted to the reviewed canonical staging project"
        )


def load_inventory(connection: Any) -> EvidenceInventory:
    """Read the complete bucket/metadata inventory through the admin database."""

    with connection.cursor() as cursor:
        cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        cursor.execute("SELECT CURRENT_DATE")
        current_row = cursor.fetchone()
        if current_row is None or not isinstance(current_row[0], date):
            raise EvidenceResetCleanupError("could not resolve the database civil date")
        database_date = current_row[0]

        cursor.execute(
            "SELECT name FROM storage.objects WHERE bucket_id=%s "
            'ORDER BY name COLLATE "C"',
            (BUCKET,),
        )
        storage_keys = tuple(str(row[0]) for row in cursor.fetchall())

        cursor.execute(
            """
            SELECT storage_object_path, status, legal_hold, retention_until
              FROM core.attachments
             WHERE storage_bucket=%s
             ORDER BY storage_object_path COLLATE "C", org_id, id
            """,
            (BUCKET,),
        )
        attachments = tuple(
            AttachmentRecord(
                object_key=str(object_key),
                status=str(status),
                legal_hold=bool(legal_hold),
                retention_until=retention_until,
            )
            for object_key, status, legal_hold, retention_until in cursor.fetchall()
        )
    # End the read transaction before the Storage API performs its own delete.
    connection.commit()
    return EvidenceInventory(
        database_date=database_date,
        storage_object_keys=storage_keys,
        attachments=attachments,
    )


def validated_cleanup_keys(inventory: EvidenceInventory) -> tuple[str, ...]:
    """Return exact reset keys, rejecting ambiguity, legal holds, or bad state."""

    storage_counter = Counter(inventory.storage_object_keys)
    attachment_counter = Counter(item.object_key for item in inventory.attachments)
    duplicate_storage = sum(count - 1 for count in storage_counter.values() if count > 1)
    duplicate_metadata = sum(
        count - 1 for count in attachment_counter.values() if count > 1
    )
    if duplicate_storage or duplicate_metadata:
        raise EvidenceResetCleanupError(
            "evidence inventory is not one-to-one: "
            f"duplicate_storage={duplicate_storage} "
            f"duplicate_metadata={duplicate_metadata}"
        )
    if storage_counter != attachment_counter:
        storage_only = sorted((storage_counter - attachment_counter).elements())
        metadata_only = sorted((attachment_counter - storage_counter).elements())
        raise EvidenceResetCleanupError(
            "evidence storage and canonical metadata do not reconcile one-to-one: "
            f"storage_only_count={len(storage_only)} "
            f"metadata_only_count={len(metadata_only)} "
            f"storage_only_sha256={_key_digest(storage_only)} "
            f"metadata_only_sha256={_key_digest(metadata_only)}"
        )

    keys = tuple(sorted(storage_counter))
    if len(keys) > MAX_EXACT_KEYS:
        raise EvidenceResetCleanupError(
            "evidence cleanup exceeds the single-request exact-key bound: "
            f"observed={len(keys)} maximum={MAX_EXACT_KEYS}"
        )
    invalid_count = sum(OBJECT_KEY_RE.fullmatch(key) is None for key in keys)
    if invalid_count:
        raise EvidenceResetCleanupError(
            f"evidence inventory contains {invalid_count} invalid object key(s)"
        )

    held = sum(item.legal_hold for item in inventory.attachments)
    missing_retention = sum(
        item.retention_until is None for item in inventory.attachments
    )
    retention_in_force = sum(
        item.retention_until is not None
        and item.retention_until >= inventory.database_date
        for item in inventory.attachments
    )
    invalid_lifecycle = sum(
        item.status not in CANONICAL_METADATA_STATUSES
        for item in inventory.attachments
    )
    if held or missing_retention or invalid_lifecycle:
        raise EvidenceResetCleanupError(
            "evidence reset cleanup refused protected metadata: "
            f"legal_hold={held} missing_retention={missing_retention} "
            f"retention_in_force={retention_in_force} "
            f"invalid_status={invalid_lifecycle}"
        )
    return keys


def _delete_exact_keys(
    *,
    project_ref: str,
    api_key: str,
    keys: Sequence[str],
    transport: httpx.BaseTransport | None = None,
) -> int:
    if not keys:
        return 0
    if SERVER_API_KEY_RE.fullmatch(api_key) is None:
        raise EvidenceResetCleanupError(
            "evidence cleanup requires the bucket-restricted Supabase secret API key"
        )
    url = (
        f"https://{project_ref}.supabase.co/storage/v1/object/"
        f"{quote(BUCKET, safe='')}"
    )
    try:
        with httpx.Client(
            headers={"apikey": api_key}, timeout=30.0, transport=transport
        ) as client:
            response = client.request("DELETE", url, json={"prefixes": list(keys)})
    except httpx.RequestError as exc:
        raise EvidenceResetCleanupError(
            "restricted Storage API could not be reached for exact-key cleanup"
        ) from exc
    if response.status_code not in {200, 204}:
        raise EvidenceResetCleanupError(
            "restricted Storage API rejected exact-key cleanup: "
            f"http_status={response.status_code}"
        )
    return len(keys)


def execute_cleanup(
    *,
    project_ref: str,
    api_key: str,
    inventory: EvidenceInventory,
    observed_bucket_count: Callable[[], int],
    transport: httpx.BaseTransport | None = None,
) -> dict[str, object]:
    """Delete the reconciled set and attest that the bucket is empty."""

    _validate_project_ref(project_ref)
    keys = validated_cleanup_keys(inventory)
    if keys:
        deleted_count = _delete_exact_keys(
            project_ref=project_ref,
            api_key=api_key,
            keys=keys,
            transport=transport,
        )
    else:
        # The two inventory queries share one repeatable-read snapshot.  When
        # both sets are exactly empty, a Storage credential adds no evidence
        # and must not become a prerequisite for the canonical database reset.
        deleted_count = 0
    remaining = observed_bucket_count()
    if not isinstance(remaining, int) or isinstance(remaining, bool) or remaining < 0:
        raise EvidenceResetCleanupError("post-cleanup bucket count is invalid")
    if remaining != 0:
        raise EvidenceResetCleanupError(
            "evidence bucket is not empty after restricted API cleanup: "
            f"remaining={remaining}"
        )
    return {
        "contract_version": CONTRACT_VERSION,
        "state": "empty",
        "project_ref": project_ref,
        "bucket": BUCKET,
        "database_date": inventory.database_date.isoformat(),
        "reconciled_object_count": len(keys),
        "deleted_object_count": deleted_count,
        "remaining_object_count": remaining,
        "object_key_set_sha256": _key_digest(keys),
        "legal_hold_count": 0,
        "retention_in_force_deleted_count": sum(
            item.retention_until is not None
            and item.retention_until >= inventory.database_date
            for item in inventory.attachments
        ),
        "completed_at": _utc_now(),
    }


def _bucket_count(connection: Any) -> int:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT count(*) FROM storage.objects WHERE bucket_id=%s",
            (BUCKET,),
        )
        row = cursor.fetchone()
    connection.commit()
    if row is None:
        raise EvidenceResetCleanupError("could not verify evidence bucket count")
    return int(row[0])


def _write_receipt(path: Path, receipt: Mapping[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(receipt, output, indent=2, sort_keys=True)
            output.write("\n")
        os.replace(temporary, path)
        path.chmod(0o600)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-ref", required=True)
    parser.add_argument("--database-url-env", required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    database_url = os.getenv(args.database_url_env, "")
    if not database_url:
        raise SystemExit(f"database URL environment is empty: {args.database_url_env}")
    try:
        connection = psycopg2.connect(database_url, connect_timeout=20)
        try:
            inventory = load_inventory(connection)
            receipt = execute_cleanup(
                project_ref=args.project_ref,
                api_key=os.getenv("EVIDENCE_STORAGE_SERVER_API_KEY", ""),
                inventory=inventory,
                observed_bucket_count=lambda: _bucket_count(connection),
            )
        finally:
            connection.close()
        _write_receipt(args.receipt, receipt)
        print(
            json.dumps(
                {
                    "state": receipt["state"],
                    "reconciled_object_count": receipt["reconciled_object_count"],
                    "deleted_object_count": receipt["deleted_object_count"],
                },
                sort_keys=True,
            )
        )
        return 0
    except (EvidenceResetCleanupError, psycopg2.Error) as error:
        raise SystemExit(f"canonical evidence reset cleanup blocked: {error}") from None


if __name__ == "__main__":
    raise SystemExit(main())

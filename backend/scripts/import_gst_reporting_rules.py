#!/usr/bin/env python3
"""Activate an independently reviewed global GST reporting-rules release.

This command is deliberately operator-driven.  It has no statutory defaults,
does not fetch or seed source material, and connects only as the isolated
``erp_regulatory_importer`` principal.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Sequence
from urllib.parse import urlparse
from uuid import UUID


CONFIRMATION = "ACTIVATE_GST_REPORTING_RULES"
DATABASE_ENV = "ERP_REGULATORY_IMPORTER_DATABASE_URL"
OFFICIAL_AUTHORITIES = {
    "gst_portal": ("gst.gov.in",),
    "gst_council": ("gstcouncil.gov.in",),
    "cbic": ("cbic-gst.gov.in",),
    "gstn": ("gstn.org.in",),
}


class ImportInputError(ValueError):
    """The operator supplied an incomplete or unattested release."""


@dataclass(frozen=True)
class ImportEnvelope:
    release_id: UUID
    ruleset_version: str
    source_authority: str
    source_uri: str
    source_storage_bucket: str
    source_storage_object_path: str
    source_media_type: str
    source_bytes: bytes
    source_sha256: bytes
    dataset_storage_bucket: str
    dataset_storage_object_path: str
    dataset_bytes: bytes
    dataset_sha256: bytes
    publication_date: date
    effective_from: date
    effective_to: date | None
    reviewed_by_user_id: UUID
    reviewed_at: datetime
    activated_by_user_id: UUID
    activated_at: datetime
    request_id: UUID


def _required_text(value: str, label: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ImportInputError(f"{label} is required")
    return stripped


def validate_official_source(authority: str, uri: str) -> None:
    allowed = OFFICIAL_AUTHORITIES.get(authority)
    parsed = urlparse(uri)
    host = (parsed.hostname or "").lower()
    if (
        allowed is None
        or parsed.scheme != "https"
        or parsed.username is not None
        or parsed.password is not None
        or not any(host == domain or host.endswith(f".{domain}") for domain in allowed)
    ):
        raise ImportInputError("source URI is not an HTTPS location for the selected official authority")


def checked_bytes(path: Path, expected_hex: str, label: str) -> tuple[bytes, bytes]:
    payload = path.read_bytes()
    if not payload:
        raise ImportInputError(f"{label} artifact is empty")
    try:
        expected = bytes.fromhex(expected_hex)
    except ValueError as exc:
        raise ImportInputError(f"{label} SHA-256 is not hexadecimal") from exc
    if len(expected) != 32:
        raise ImportInputError(f"{label} SHA-256 must contain 32 bytes")
    if hashlib.sha256(payload).digest() != expected:
        raise ImportInputError(f"{label} SHA-256 mismatch")
    return payload, expected


def canonicalize_dataset(cursor: Any, dataset_path: Path) -> bytes:
    raw = dataset_path.read_bytes()
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ImportInputError("dataset must be UTF-8 JSON") from exc
    if not isinstance(value, list) or not value:
        raise ImportInputError("dataset must be a non-empty JSON array")
    cursor.execute("SELECT %s::jsonb::text", (json.dumps(value, separators=(",", ":")),))
    row = cursor.fetchone()
    if not row or not isinstance(row[0], str):
        raise ImportInputError("database did not return canonical PostgreSQL JSONB text")
    return row[0].encode("utf-8")


def import_release(connection: Any, envelope: ImportEnvelope) -> UUID:
    if envelope.reviewed_by_user_id == envelope.activated_by_user_id:
        raise ImportInputError("reviewer and activator must be distinct users")
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT erp_regulatory_commands.import_gstr1_reporting_release(
              %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s
            )
            """,
            (
                str(envelope.release_id), envelope.ruleset_version,
                envelope.source_authority, envelope.source_uri,
                envelope.source_storage_bucket, envelope.source_storage_object_path,
                envelope.source_media_type, envelope.source_bytes, envelope.source_sha256,
                envelope.dataset_storage_bucket, envelope.dataset_storage_object_path,
                envelope.dataset_bytes, envelope.dataset_sha256,
                envelope.publication_date, envelope.effective_from, envelope.effective_to,
                str(envelope.reviewed_by_user_id), envelope.reviewed_at,
                str(envelope.activated_by_user_id), envelope.activated_at,
                str(envelope.request_id),
            ),
        )
        row = cursor.fetchone()
    if not row or str(row[0]) != str(envelope.release_id):
        raise RuntimeError("GST reporting-rules import returned an unexpected release identity")
    connection.commit()
    return envelope.release_id


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    required = parser.add_argument_group("required reviewed release inputs")
    for option in (
        "release-id", "ruleset-version", "source-authority", "source-uri",
        "source-file", "source-sha256", "source-storage-bucket",
        "source-storage-object-path", "source-media-type", "dataset-file",
        "dataset-sha256", "dataset-storage-bucket", "dataset-storage-object-path",
        "publication-date", "effective-from", "effective-to",
        "reviewed-by-user-id", "reviewed-at", "activated-by-user-id",
        "activated-at", "request-id", "confirm-global-activation",
    ):
        required.add_argument(f"--{option}", required=True)
    return parser


def _date(value: str) -> date:
    return date.fromisoformat(value)


def _timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ImportInputError("review and activation timestamps must include an offset")
    return parsed


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.confirm_global_activation != CONFIRMATION:
        raise ImportInputError(f"confirmation must equal {CONFIRMATION}")
    database_url = os.environ.get(DATABASE_ENV, "").strip()
    if not database_url:
        raise ImportInputError(f"{DATABASE_ENV} is required")
    validate_official_source(args.source_authority, args.source_uri)
    source_bytes, source_sha = checked_bytes(
        Path(args.source_file), args.source_sha256, "official source"
    )

    import psycopg2

    with psycopg2.connect(database_url) as connection:
        with connection.cursor() as cursor:
            dataset_bytes = canonicalize_dataset(cursor, Path(args.dataset_file))
        try:
            dataset_sha = bytes.fromhex(args.dataset_sha256)
        except ValueError as exc:
            raise ImportInputError("dataset SHA-256 is not hexadecimal") from exc
        if len(dataset_sha) != 32 or hashlib.sha256(dataset_bytes).digest() != dataset_sha:
            raise ImportInputError("canonical PostgreSQL JSONB dataset SHA-256 mismatch")
        envelope = ImportEnvelope(
            release_id=UUID(args.release_id),
            ruleset_version=_required_text(args.ruleset_version, "ruleset version"),
            source_authority=args.source_authority,
            source_uri=args.source_uri,
            source_storage_bucket=_required_text(args.source_storage_bucket, "source storage bucket"),
            source_storage_object_path=_required_text(args.source_storage_object_path, "source storage object path"),
            source_media_type=_required_text(args.source_media_type, "source media type"),
            source_bytes=source_bytes,
            source_sha256=source_sha,
            dataset_storage_bucket=_required_text(args.dataset_storage_bucket, "dataset storage bucket"),
            dataset_storage_object_path=_required_text(args.dataset_storage_object_path, "dataset storage object path"),
            dataset_bytes=dataset_bytes,
            dataset_sha256=dataset_sha,
            publication_date=_date(args.publication_date),
            effective_from=_date(args.effective_from),
            effective_to=None if args.effective_to == "open" else _date(args.effective_to),
            reviewed_by_user_id=UUID(args.reviewed_by_user_id),
            reviewed_at=_timestamp(args.reviewed_at),
            activated_by_user_id=UUID(args.activated_by_user_id),
            activated_at=_timestamp(args.activated_at),
            request_id=UUID(args.request_id),
        )
        release_id = import_release(connection, envelope)
    print(f"Activated reviewed GST reporting-rules release {release_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

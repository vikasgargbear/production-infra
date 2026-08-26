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

from app.infrastructure.evidence_storage_credentials import (
    EvidenceCredentialConfig,
    EvidenceCredentialUnavailable,
    EvidenceServiceTokenProvider,
)


BUCKET = "canonical-evidence-private-v1"
EVIDENCE_ROLE = "erp_evidence_storage"
AUTHENTICATOR_ROLE = "authenticator"
OPEN_WRITER_SQL = "GRANT erp_evidence_storage TO authenticator"
CLOSE_WRITER_SQL = "REVOKE erp_evidence_storage FROM authenticator"
CANONICAL_STAGING_PROJECT_REF = "rgihahbmkrmhitjdjvev"
CONTRACT_VERSION = "canonical-evidence-reset-cleanup-v2"
MAX_EXACT_KEYS = 1_000
PROJECT_REF_RE = re.compile(r"[a-z0-9]{20}")
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


@dataclass(frozen=True)
class WriterClosure:
    membership_open: bool
    role_posture_safe: bool
    unexpected_member_count: int
    inherited_role_count: int
    observed_authenticator_session_count: int
    terminated_authenticator_session_count: int
    remaining_preclosure_authenticator_session_count: int
    verified_at: str


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


def _writer_membership_open(connection: Any) -> bool:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT pg_catalog.pg_has_role(%s,%s,'MEMBER')",
            (AUTHENTICATOR_ROLE, EVIDENCE_ROLE),
        )
        row = cursor.fetchone()
    connection.commit()
    if row is None:
        raise EvidenceResetCleanupError(
            "could not verify the canonical evidence writer membership"
        )
    return bool(row[0])


def _writer_closure_catalog(connection: Any) -> tuple[bool, bool, int, int]:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT pg_catalog.pg_has_role(%s,%s,'MEMBER'),
                   NOT role.rolcanlogin
                     AND NOT role.rolinherit
                     AND NOT role.rolsuper
                     AND NOT role.rolcreaterole
                     AND NOT role.rolcreatedb
                     AND NOT role.rolreplication
                     AND NOT role.rolbypassrls,
                   (SELECT count(*)::integer
                      FROM pg_catalog.pg_auth_members AS membership
                     WHERE membership.roleid=role.oid
                       AND (
                         membership.member<>current_user::regrole::oid
                         OR NOT membership.admin_option
                       )),
                   (SELECT count(*)::integer
                      FROM pg_catalog.pg_auth_members AS membership
                     WHERE membership.member=role.oid)
              FROM pg_catalog.pg_roles AS role
             WHERE role.rolname=%s
            """,
            (AUTHENTICATOR_ROLE, EVIDENCE_ROLE, EVIDENCE_ROLE),
        )
        row = cursor.fetchone()
    connection.commit()
    if row is None:
        raise EvidenceResetCleanupError(
            "canonical evidence writer role is missing"
        )
    return bool(row[0]), bool(row[1]), int(row[2]), int(row[3])


def open_writer_authority(connection: Any) -> None:
    """Open only the reviewed Storage role path for an exact API deletion."""

    with connection.cursor() as cursor:
        cursor.execute(OPEN_WRITER_SQL)
    connection.commit()
    if not _writer_membership_open(connection):
        raise EvidenceResetCleanupError(
            "canonical evidence writer authority did not open"
        )


def close_writer_authority(connection: Any) -> WriterClosure:
    """Close the Storage role path and end sessions that could retain it."""

    with connection.cursor() as cursor:
        cursor.execute(CLOSE_WRITER_SQL)
    connection.commit()

    observed = 0
    terminated = 0
    remaining_preclosure = 0
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT pid
              FROM pg_catalog.pg_stat_activity
             WHERE datname=pg_catalog.current_database()
               AND pid<>pg_catalog.pg_backend_pid()
               AND usename=%s
               AND backend_type='client backend'
             ORDER BY pid
            """,
            (AUTHENTICATOR_ROLE,),
        )
        pids = tuple(int(row[0]) for row in cursor.fetchall())
        observed = len(pids)
        for pid in pids:
            cursor.execute("SELECT pg_catalog.pg_terminate_backend(%s)", (pid,))
            row = cursor.fetchone()
            terminated += int(row is not None and bool(row[0]))
        cursor.execute(
            """
            SELECT count(*)::integer
              FROM pg_catalog.pg_stat_activity
             WHERE pid=ANY(%s)
            """,
            (list(pids),),
        )
        row = cursor.fetchone()
        if row is None:
            raise EvidenceResetCleanupError(
                "could not verify terminated authenticator sessions"
            )
        remaining_preclosure = int(row[0])
    connection.commit()

    (
        membership_open,
        role_posture_safe,
        unexpected_member_count,
        inherited_role_count,
    ) = _writer_closure_catalog(connection)
    if (
        membership_open
        or not role_posture_safe
        or unexpected_member_count
        or inherited_role_count
        or remaining_preclosure
    ):
        raise EvidenceResetCleanupError(
            "canonical evidence writer closure posture is unsafe: "
            f"membership_open={int(membership_open)} "
            f"role_posture_safe={int(role_posture_safe)} "
            f"unexpected_member_count={unexpected_member_count} "
            f"inherited_role_count={inherited_role_count} "
            f"remaining_preclosure_session_count={remaining_preclosure}"
        )
    return WriterClosure(
        membership_open=False,
        role_posture_safe=True,
        unexpected_member_count=0,
        inherited_role_count=0,
        observed_authenticator_session_count=observed,
        terminated_authenticator_session_count=terminated,
        remaining_preclosure_authenticator_session_count=0,
        verified_at=_utc_now(),
    )


def _delete_exact_keys(
    *,
    project_ref: str,
    token_provider: EvidenceServiceTokenProvider,
    keys: Sequence[str],
    transport: httpx.BaseTransport | None = None,
) -> int:
    if not keys:
        return 0
    url = (
        f"https://{project_ref}.supabase.co/storage/v1/object/"
        f"{quote(BUCKET, safe='')}"
    )
    response: httpx.Response | None = None
    for attempt in range(2):
        try:
            headers = token_provider.authorization_headers()
        except EvidenceCredentialUnavailable as exc:
            raise EvidenceResetCleanupError(
                "evidence cleanup requires the reviewed service-user token provider"
            ) from exc
        if set(headers) != {"apikey", "Authorization"} or not headers[
            "Authorization"
        ].startswith("Bearer "):
            raise EvidenceResetCleanupError(
                "evidence cleanup token provider returned an invalid header contract"
            )
        rejected_token = headers["Authorization"].removeprefix("Bearer ")
        try:
            with httpx.Client(
                headers=headers, timeout=30.0, transport=transport
            ) as client:
                response = client.request(
                    "DELETE", url, json={"prefixes": list(keys)}
                )
        except httpx.RequestError as exc:
            raise EvidenceResetCleanupError(
                "restricted Storage API could not be reached for exact-key cleanup"
            ) from exc
        if response.status_code != 401 or attempt == 1:
            break
        token_provider.invalidate(rejected_token)
    if response is None:
        raise AssertionError("unreachable evidence cleanup response state")
    if response.status_code not in {200, 204}:
        raise EvidenceResetCleanupError(
            "restricted Storage API rejected exact-key cleanup: "
            f"http_status={response.status_code}"
        )
    return len(keys)


def execute_cleanup(
    *,
    project_ref: str,
    inventory: EvidenceInventory,
    final_inventory: EvidenceInventory,
    writer_closure: WriterClosure,
) -> dict[str, object]:
    """Validate deletion results after the Storage writer is closed."""

    _validate_project_ref(project_ref)
    keys = validated_cleanup_keys(inventory)
    deleted_count = len(keys)
    remaining = len(final_inventory.storage_object_keys)
    if remaining != 0:
        raise EvidenceResetCleanupError(
            "evidence bucket is not empty after restricted API cleanup: "
            f"remaining={remaining}"
        )
    if final_inventory.database_date != inventory.database_date:
        raise EvidenceResetCleanupError(
            "database civil date changed during evidence reset cleanup"
        )
    if final_inventory.attachments != inventory.attachments:
        raise EvidenceResetCleanupError(
            "canonical evidence metadata changed during restricted cleanup"
        )
    if writer_closure.membership_open:
        raise EvidenceResetCleanupError(
            "canonical evidence writer authority is open after cleanup"
        )
    if (
        not writer_closure.role_posture_safe
        or writer_closure.unexpected_member_count
        or writer_closure.inherited_role_count
        or writer_closure.remaining_preclosure_authenticator_session_count
    ):
        raise EvidenceResetCleanupError(
            "canonical evidence writer closure posture is unsafe"
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
        "evidence_writer_membership_open": False,
        "evidence_writer_role_posture_safe": True,
        "evidence_writer_unexpected_member_count": 0,
        "evidence_writer_inherited_role_count": 0,
        "observed_authenticator_session_count": (
            writer_closure.observed_authenticator_session_count
        ),
        "terminated_authenticator_session_count": (
            writer_closure.terminated_authenticator_session_count
        ),
        "remaining_preclosure_authenticator_session_count": (
            writer_closure.remaining_preclosure_authenticator_session_count
        ),
        "evidence_writer_closed_at": writer_closure.verified_at,
        "retention_in_force_deleted_count": sum(
            item.retention_until is not None
            and item.retention_until >= inventory.database_date
            for item in inventory.attachments
        ),
        "completed_at": _utc_now(),
    }


def execute_fenced_cleanup(
    *,
    project_ref: str,
    load_current_inventory: Callable[[], EvidenceInventory],
    open_writer: Callable[[], None],
    close_writer: Callable[[], WriterClosure],
    token_provider_factory: Callable[[], EvidenceServiceTokenProvider],
    transport: httpx.BaseTransport | None = None,
) -> dict[str, object]:
    """Run cleanup while guaranteeing the external Storage writer ends closed."""

    _validate_project_ref(project_ref)
    closure: WriterClosure | None = None
    primary_error: BaseException | None = None
    try:
        # Close first so an empty snapshot cannot race a valid Storage API write.
        closure = close_writer()
        inventory = load_current_inventory()
        keys = validated_cleanup_keys(inventory)
        if keys:
            try:
                token_provider = token_provider_factory()
            except EvidenceCredentialUnavailable as exc:
                raise EvidenceResetCleanupError(
                    "evidence cleanup requires the reviewed service-user token provider"
                ) from exc
            open_writer()
            try:
                _delete_exact_keys(
                    project_ref=project_ref,
                    token_provider=token_provider,
                    keys=keys,
                    transport=transport,
                )
            finally:
                closure = close_writer()
        # Re-read both sides only after the writer path is provably closed.
        final_inventory = load_current_inventory()
        return execute_cleanup(
            project_ref=project_ref,
            inventory=inventory,
            final_inventory=final_inventory,
            writer_closure=closure,
        )
    except BaseException as error:
        primary_error = error
        raise
    finally:
        # Every failure path attempts closure again. If closure itself cannot be
        # verified, that is the authoritative failure rather than a false-safe
        # cleanup result.
        if primary_error is not None:
            try:
                close_writer()
            except BaseException as closure_error:
                raise EvidenceResetCleanupError(
                    "evidence cleanup failed and writer closure could not be verified"
                ) from closure_error


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
            def token_provider() -> EvidenceServiceTokenProvider:
                config = EvidenceCredentialConfig.from_environment(
                    base_url=f"https://{args.project_ref}.supabase.co",
                    project_ref=args.project_ref,
                )
                return EvidenceServiceTokenProvider(config)

            receipt = execute_fenced_cleanup(
                project_ref=args.project_ref,
                load_current_inventory=lambda: load_inventory(connection),
                open_writer=lambda: open_writer_authority(connection),
                close_writer=lambda: close_writer_authority(connection),
                token_provider_factory=token_provider,
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
    except (
        EvidenceCredentialUnavailable,
        EvidenceResetCleanupError,
        psycopg2.Error,
    ) as error:
        raise SystemExit(f"canonical evidence reset cleanup blocked: {error}") from None


if __name__ == "__main__":
    raise SystemExit(main())

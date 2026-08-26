#!/usr/bin/env python3
"""Reset disposable canonical staging while Railway is the sole provider.

The reset runs through the manifest-owned direct database authority.  It closes
the canonical write fence before terminating isolated-role sessions, delegates
the migration-owner role only for the reset transaction, and leaves the fence
closed until an exact reviewed Railway deployment has been activated.  The
separate ``open-fence`` action is therefore safe to call only after the workflow
has proved the replacement deployment and inactive standby providers.

This script never changes Railway or Render service configuration and never
falls back to Supavisor.
"""

from __future__ import annotations

import argparse
import contextlib
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
from typing import Any, Iterator, Mapping
from urllib.parse import quote

import psycopg2

try:
    from .canonical_data_reset_authority import (
        execute_reset,
        load_reset_authority,
        verify_post_cleanup_role_state,
        verify_reset_boundary,
    )
    from .canonical_staging_database import (
        build_direct_dsn,
        load_direct_database_contract,
        verify_direct_database,
    )
    from .deployment_control import (
        DEFAULT_MANIFEST,
        active_provider_name,
        load_manifest,
    )
    from .manage_canonical_write_fence import FenceError, apply_fence
except ImportError:  # direct ``python backend/scripts/...`` execution
    from canonical_data_reset_authority import (
        execute_reset,
        load_reset_authority,
        verify_post_cleanup_role_state,
        verify_reset_boundary,
    )
    from canonical_staging_database import (
        build_direct_dsn,
        load_direct_database_contract,
        verify_direct_database,
    )
    from deployment_control import DEFAULT_MANIFEST, active_provider_name, load_manifest
    from manage_canonical_write_fence import FenceError, apply_fence


RECEIPT_SCHEMA = "aasopharma.railway-canonical-reset.v1"
EVIDENCE_CLEANUP_CONTRACT = "canonical-evidence-reset-cleanup-v2"
EVIDENCE_BUCKET = "canonical-evidence-private-v1"
SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$")
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
RESET_LOCK_KEY = 8_260_827_1
CONTROL_TRANSPORT_GITHUB_IPV4 = "github_direct_ipv4"
CONTROL_TRANSPORT_RAILWAY_IPV6 = "railway_ssh_direct_ipv6"


class RailwayCanonicalResetError(RuntimeError):
    """The provider-bound disposable reset could not be proven safe."""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _required(value: str, label: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise RailwayCanonicalResetError(f"{label} is required")
    return normalized


def _database_failure_code(error: Exception) -> str:
    sqlstate = getattr(error, "pgcode", None)
    suffix = (
        f":sqlstate_{sqlstate}"
        if isinstance(sqlstate, str) and re.fullmatch(r"[0-9A-Z]{5}", sqlstate)
        else ""
    )
    return f"{type(error).__name__}{suffix}"


def _validate_boundary(
    *, expected_sha: str, project_ref: str, production_project_refs: str
) -> None:
    if SHA_PATTERN.fullmatch(expected_sha) is None:
        raise RailwayCanonicalResetError(
            "expected SHA must be 40 lowercase hexadecimal characters"
        )
    manifest = load_manifest(DEFAULT_MANIFEST)
    if active_provider_name(manifest) != "railway":
        raise RailwayCanonicalResetError(
            "canonical reset requires Railway as the sole active provider"
        )
    manifest_ref = manifest["supabase"]["project_ref"]
    if project_ref != manifest_ref:
        raise RailwayCanonicalResetError(
            "canonical reset project differs from the deployment authority"
        )
    production_refs = {
        item.strip() for item in production_project_refs.split(",") if item.strip()
    }
    if not production_refs:
        raise RailwayCanonicalResetError(
            "production project denylist must be explicitly configured"
        )
    if project_ref in production_refs:
        raise RailwayCanonicalResetError("refusing to reset a production project")


def _admin_database_url(
    *,
    password: str,
    application_name: str,
    control_transport: str = CONTROL_TRANSPORT_GITHUB_IPV4,
) -> tuple[str, Mapping[str, Any]]:
    """Resolve and attest the provider-owned database control transport.

    GitHub-hosted runners use the separately reviewed direct-IPv4 contract.
    Railway control actions execute inside the API service and must prove that
    the same direct database hostname was reached over IPv6.  Neither path may
    fall back to Supavisor.
    """

    contract = load_direct_database_contract()
    dsn = build_direct_dsn(
        contract=contract,
        role=contract.administrator_role,
        password=password,
        application_name=application_name,
    )
    if control_transport == CONTROL_TRANSPORT_GITHUB_IPV4:
        evidence = asdict(
            verify_direct_database(
                contract=contract,
                role=contract.administrator_role,
                password=password,
                application_name=application_name,
            )
        )
        evidence["mode"] = CONTROL_TRANSPORT_GITHUB_IPV4
        evidence["network_family"] = 4
        evidence["selected_ipv4_address"] = "verified-not-persisted"
        return dsn, evidence
    if control_transport != CONTROL_TRANSPORT_RAILWAY_IPV6:
        raise RailwayCanonicalResetError(
            "canonical reset control transport is unsupported"
        )

    try:
        answers = socket.getaddrinfo(
            contract.host,
            contract.port,
            family=socket.AF_INET6,
            type=socket.SOCK_STREAM,
        )
    except OSError as error:
        raise RailwayCanonicalResetError(
            "Railway cannot resolve the canonical direct IPv6 database host"
        ) from error
    public_ipv6: set[str] = set()
    for answer in answers:
        try:
            if answer[0] != socket.AF_INET6:
                continue
            address = ipaddress.ip_address(answer[4][0])
        except (IndexError, TypeError, ValueError):
            continue
        if isinstance(address, ipaddress.IPv6Address) and address.is_global:
            public_ipv6.add(str(address))
    if not public_ipv6:
        raise RailwayCanonicalResetError(
            "Railway has no caller-visible public direct IPv6 database resolution"
        )
    selected_ipv6_address = sorted(public_ipv6, key=ipaddress.ip_address)[0]
    # Keep the reviewed hostname for TLS/SNI, but pin every later libpq
    # connection to the exact public IPv6 address attested here.
    pinned_dsn = f"{dsn}&hostaddr={quote(selected_ipv6_address, safe='')}"
    try:
        with contextlib.closing(psycopg2.connect(pinned_dsn)) as connection:
            parameters = connection.get_dsn_parameters()
            try:
                connected_hostaddr = str(
                    ipaddress.ip_address(parameters.get("hostaddr", ""))
                )
            except ValueError:
                connected_hostaddr = ""
            client_checks = {
                "libpq_host": parameters.get("host") == contract.host,
                "libpq_hostaddr": connected_hostaddr == selected_ipv6_address,
                "libpq_port": parameters.get("port") == str(contract.port),
                "libpq_database": parameters.get("dbname") == contract.database,
                "libpq_user": parameters.get("user") == contract.administrator_role,
                "libpq_sslmode": parameters.get("sslmode") == "require",
                "libpq_gssencmode": parameters.get("gssencmode") == "disable",
                "libpq_application_name": (
                    parameters.get("application_name") == application_name
                ),
                "tls_active": connection.info.ssl_in_use is True,
            }
            with connection:
                connection.set_session(readonly=True)
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT current_user,
                               current_database(),
                               current_setting('ssl'),
                               current_setting('row_security')='on',
                               pg_has_role(current_user,'erp_migration_owner','MEMBER'),
                               role.rolsuper,
                               role.rolcreaterole,
                               role.rolbypassrls
                          FROM pg_catalog.pg_roles AS role
                         WHERE role.rolname=current_user
                        """
                    )
                    row = cursor.fetchone()
            try:
                role_cleanup = verify_post_cleanup_role_state(
                    connection, project_ref=contract.project_ref
                )
            except Exception:
                raise RailwayCanonicalResetError(
                    "railway_ipv6_role_cleanup_attestation_failed"
                ) from None
    except RailwayCanonicalResetError:
        raise
    except Exception as error:
        raise RailwayCanonicalResetError(
            "railway_ipv6_database_connection_failed:"
            f"{type(error).__name__}"
        ) from None
    mismatches = [name for name, passed in client_checks.items() if not passed]
    if not isinstance(row, tuple) or len(row) != 8:
        mismatches.append("server_posture_shape")
    else:
        server_checks = {
            "current_user": row[0] == contract.administrator_role,
            "current_database": row[1] == contract.database,
            "server_ssl": row[2] == "on",
            "row_security": row[3] is True,
            "superuser": row[5] is False,
            "createrole": row[6] is True,
            "bypassrls": row[7] is True,
        }
        mismatches.extend(
            name for name, passed in server_checks.items() if not passed
        )
    if mismatches:
        raise RailwayCanonicalResetError(
            "railway_ipv6_database_authority_attestation_mismatch:"
            + ",".join(sorted(mismatches))
        )
    if (
        role_cleanup.get("postgres_migration_owner_set") is not False
        or role_cleanup.get("postgres_migration_owner_usage") is not False
        or role_cleanup.get("verification_principal_superuser") is not False
    ):
        raise RailwayCanonicalResetError(
            "railway_ipv6_migration_owner_authority_unsafe"
        )
    return pinned_dsn, {
        "mode": CONTROL_TRANSPORT_RAILWAY_IPV6,
        "role": contract.administrator_role,
        "host": contract.host,
        "port": contract.port,
        "database": contract.database,
        "network_family": 6,
        "ipv6_answer_count": len(public_ipv6),
        "selected_ipv6_address": "verified-not-persisted",
        "row_security": True,
        # PostgreSQL 16+ may retain a standing membership row with both SET
        # and INHERIT disabled.  Report membership truthfully while attesting
        # the executable SET/USAGE paths separately.
        "migration_owner_member": bool(row[4]),
        "migration_owner_set": False,
        "migration_owner_usage": False,
    }


def _set_owner_delegation(database_url: str, *, enabled: bool) -> None:
    try:
        with psycopg2.connect(database_url) as connection:
            connection.autocommit = True
            with connection.cursor() as cursor:
                cursor.execute("SHOW server_version_num")
                supports_membership_options = int(cursor.fetchone()[0]) >= 160000
                if enabled and supports_membership_options:
                    cursor.execute(
                        'GRANT "erp_migration_owner" TO CURRENT_USER '
                        "WITH INHERIT FALSE, SET TRUE"
                    )
                elif enabled:
                    cursor.execute('GRANT "erp_migration_owner" TO CURRENT_USER')
                elif supports_membership_options:
                    cursor.execute(
                        'GRANT "erp_migration_owner" TO CURRENT_USER '
                        "WITH INHERIT FALSE, SET FALSE"
                    )
                else:
                    cursor.execute('REVOKE "erp_migration_owner" FROM CURRENT_USER')
    except Exception as error:
        action = "enable" if enabled else "disable"
        raise RailwayCanonicalResetError(
            f"railway_migration_owner_delegation_{action}_failed:"
            f"{_database_failure_code(error)}"
        ) from None


@contextlib.contextmanager
def _temporary_owner_delegation(
    database_url: str, *, project_ref: str
) -> Iterator[None]:
    _set_owner_delegation(database_url, enabled=True)
    try:
        yield
    finally:
        _set_owner_delegation(database_url, enabled=False)
        # The verifier owns its transaction context.  Use closing() here so
        # psycopg2 is not asked to re-enter the same connection context.
        with contextlib.closing(psycopg2.connect(database_url)) as connection:
            verify_post_cleanup_role_state(connection, project_ref=project_ref)


def _terminate_isolated_sessions(database_url: str) -> dict[str, int]:
    """Terminate the exact pre-reset isolated-role sessions and prove absence."""

    roles = load_direct_database_contract().isolated_roles
    with psycopg2.connect(database_url) as connection:
        connection.autocommit = True
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT pg_catalog.pg_advisory_lock(%s)", (RESET_LOCK_KEY,)
            )
            try:
                cursor.execute(
                    """
                    SELECT pid
                      FROM pg_catalog.pg_stat_activity
                     WHERE pid <> pg_catalog.pg_backend_pid()
                       AND usename=ANY(%s)
                     ORDER BY pid
                    """,
                    (list(roles),),
                )
                targets = tuple(int(row[0]) for row in cursor.fetchall())
                terminated = 0
                for process_id in targets:
                    cursor.execute(
                        "SELECT pg_catalog.pg_terminate_backend(%s,5000)",
                        (process_id,),
                    )
                    terminated += int(cursor.fetchone()[0] is True)
                if targets:
                    cursor.execute(
                        "SELECT count(*) FROM pg_catalog.pg_stat_activity "
                        "WHERE pid=ANY(%s)",
                        (list(targets),),
                    )
                    remaining = int(cursor.fetchone()[0])
                else:
                    remaining = 0
                if remaining:
                    raise RailwayCanonicalResetError(
                        "pre-reset isolated-role sessions remained after termination"
                    )
            finally:
                cursor.execute(
                    "SELECT pg_catalog.pg_advisory_unlock(%s)", (RESET_LOCK_KEY,)
                )
    return {
        "targeted_session_count": len(targets),
        "terminated_session_count": terminated,
        "remaining_targeted_session_count": remaining,
    }


def _write_receipt(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(payload, output, indent=2, sort_keys=True)
            output.write("\n")
        os.replace(temporary, path)
        path.chmod(0o600)
    finally:
        temporary.unlink(missing_ok=True)


def _load_evidence_cleanup_receipt(
    path: Path, *, project_ref: str
) -> tuple[dict[str, Any], str]:
    """Load the exact Storage-API cleanup proof required by reset.

    The canonical reset still checks ``storage.objects`` transactionally.  This
    receipt proves how a previously non-empty bucket was reconciled and removed
    without granting the reset authority permission to SQL-delete Storage rows.
    """

    try:
        raw = path.read_bytes()
    except OSError as error:
        raise RailwayCanonicalResetError(
            "canonical evidence cleanup receipt is required before reset"
        ) from error
    if not raw or len(raw) > 65_536:
        raise RailwayCanonicalResetError(
            "canonical evidence cleanup receipt size is invalid"
        )
    try:
        payload = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RailwayCanonicalResetError(
            "canonical evidence cleanup receipt is not valid JSON"
        ) from error
    if not isinstance(payload, dict):
        raise RailwayCanonicalResetError(
            "canonical evidence cleanup receipt must be an object"
        )
    numeric_fields = (
        "reconciled_object_count",
        "deleted_object_count",
        "remaining_object_count",
        "legal_hold_count",
        "evidence_writer_unexpected_member_count",
        "evidence_writer_inherited_role_count",
        "observed_authenticator_session_count",
        "terminated_authenticator_session_count",
        "remaining_preclosure_authenticator_session_count",
        "retention_in_force_deleted_count",
    )
    if any(
        isinstance(payload.get(field), bool)
        or not isinstance(payload.get(field), int)
        or payload[field] < 0
        for field in numeric_fields
    ):
        raise RailwayCanonicalResetError(
            "canonical evidence cleanup receipt counts are invalid"
        )
    role_installed = payload.get("evidence_writer_role_installed")
    role_absence_verified = payload.get("evidence_writer_role_absence_verified")
    if (
        payload.get("contract_version") != EVIDENCE_CLEANUP_CONTRACT
        or payload.get("state") != "empty"
        or payload.get("project_ref") != project_ref
        or payload.get("bucket") != EVIDENCE_BUCKET
        or payload["remaining_object_count"] != 0
        or payload["legal_hold_count"] != 0
        or payload["deleted_object_count"] != payload["reconciled_object_count"]
        or payload.get("evidence_writer_membership_open") is not False
        or payload.get("evidence_writer_role_posture_safe") is not True
        or payload["evidence_writer_unexpected_member_count"] != 0
        or payload["evidence_writer_inherited_role_count"] != 0
        or payload["remaining_preclosure_authenticator_session_count"] != 0
        or payload["terminated_authenticator_session_count"]
        > payload["observed_authenticator_session_count"]
        or not isinstance(payload.get("evidence_writer_closed_at"), str)
        or not payload["evidence_writer_closed_at"]
        or not isinstance(payload.get("completed_at"), str)
        or not payload["completed_at"]
        or not isinstance(role_installed, bool)
        or not isinstance(role_absence_verified, bool)
        or role_installed == role_absence_verified
        or SHA256_PATTERN.fullmatch(str(payload.get("object_key_set_sha256", "")))
        is None
    ):
        raise RailwayCanonicalResetError(
            "canonical evidence cleanup receipt did not prove an empty closed boundary"
        )
    return payload, hashlib.sha256(raw).hexdigest()


def _upgrade_exact_migration_head(
    database_url: str, *, authority: Any, project_ref: str
) -> dict[str, Any]:
    environment = dict(os.environ)
    environment["DATABASE_URL"] = "postgresql+psycopg2://" + database_url.removeprefix(
        "postgresql://"
    )
    backend_root = Path(__file__).resolve().parents[1]
    command = (
        sys.executable,
        "-m",
        "alembic",
        "-c",
        "alembic.ini",
        "upgrade",
        "head",
    )
    try:
        subprocess.run(command, cwd=backend_root, env=environment, check=True)
        subprocess.run(command, cwd=backend_root, env=environment, check=True)
    except subprocess.CalledProcessError as error:
        raise RailwayCanonicalResetError(
            "canonical Alembic upgrade did not reach the reviewed head"
        ) from error
    with contextlib.closing(psycopg2.connect(database_url)) as connection:
        return verify_reset_boundary(
            connection, authority=authority, project_ref=project_ref
        )


def prepare_reset_boundary(
    *,
    expected_sha: str,
    project_ref: str,
    production_project_refs: str,
    password: str,
    control_transport: str = CONTROL_TRANSPORT_GITHUB_IPV4,
) -> dict[str, Any]:
    """Fence, quiesce and migrate before hosted evidence cleanup starts."""

    _validate_boundary(
        expected_sha=expected_sha,
        project_ref=project_ref,
        production_project_refs=production_project_refs,
    )
    database_url, transport = _admin_database_url(
        password=_required(password, "Supabase database password"),
        application_name="canonical_railway_reset_prepare",
        control_transport=control_transport,
    )
    authority = load_reset_authority()
    with _temporary_owner_delegation(database_url, project_ref=project_ref):
        fence_receipt = apply_fence(
            database_url, action="close", commit_sha=expected_sha
        )
        session_receipt = _terminate_isolated_sessions(database_url)
        migration_receipt = _upgrade_exact_migration_head(
            database_url, authority=authority, project_ref=project_ref
        )
    with contextlib.closing(psycopg2.connect(database_url)) as connection:
        role_receipt = verify_post_cleanup_role_state(
            connection, project_ref=project_ref
        )
    return {
        "schema": RECEIPT_SCHEMA,
        "action": "prepare-reset",
        "provider": "railway",
        "expected_sha": expected_sha,
        "project_ref": project_ref,
        "transport": dict(transport),
        "write_fence": fence_receipt,
        "session_quiescence": session_receipt,
        "migration": migration_receipt,
        "role_cleanup": role_receipt,
        "completed_at": _utc_now(),
    }


def reset_disposable_staging(
    *,
    expected_sha: str,
    project_ref: str,
    production_project_refs: str,
    password: str,
    evidence_cleanup_receipt_path: Path,
    control_transport: str = CONTROL_TRANSPORT_GITHUB_IPV4,
) -> dict[str, Any]:
    _validate_boundary(
        expected_sha=expected_sha,
        project_ref=project_ref,
        production_project_refs=production_project_refs,
    )
    database_url, transport = _admin_database_url(
        password=_required(password, "Supabase database password"),
        application_name="canonical_railway_reset",
        control_transport=control_transport,
    )
    authority = load_reset_authority()
    fence_receipt: dict[str, Any]
    session_receipt: dict[str, int]
    reset_receipt: dict[str, Any]
    evidence_cleanup: Mapping[str, Any]
    evidence_cleanup_sha256: str
    with _temporary_owner_delegation(database_url, project_ref=project_ref):
        fence_receipt = apply_fence(
            database_url, action="close", commit_sha=expected_sha
        )
        evidence_cleanup, evidence_cleanup_sha256 = _load_evidence_cleanup_receipt(
            evidence_cleanup_receipt_path, project_ref=project_ref
        )
        session_receipt = _terminate_isolated_sessions(database_url)
        with contextlib.closing(psycopg2.connect(database_url)) as connection:
            reset_receipt = execute_reset(
                connection,
                authority=authority,
                project_ref=project_ref,
                expected_evidence_object_count=0,
            )
    with contextlib.closing(psycopg2.connect(database_url)) as connection:
        role_receipt = verify_post_cleanup_role_state(
            connection, project_ref=project_ref
        )
    return {
        "schema": RECEIPT_SCHEMA,
        "action": "reset",
        "provider": "railway",
        "expected_sha": expected_sha,
        "project_ref": project_ref,
        "transport": dict(transport),
        "write_fence": fence_receipt,
        "evidence_cleanup": {
            "contract_version": evidence_cleanup["contract_version"],
            "state": evidence_cleanup["state"],
            "bucket": evidence_cleanup["bucket"],
            "reconciled_object_count": evidence_cleanup[
                "reconciled_object_count"
            ],
            "deleted_object_count": evidence_cleanup["deleted_object_count"],
            "remaining_object_count": evidence_cleanup["remaining_object_count"],
            "writer_closed_at": evidence_cleanup["evidence_writer_closed_at"],
            "receipt_sha256": evidence_cleanup_sha256,
        },
        "session_quiescence": session_receipt,
        "reset": reset_receipt,
        "role_cleanup": role_receipt,
        "post_reset_fence_state": "closed",
        "completed_at": _utc_now(),
    }


def _set_fence_after_deploy(
    *,
    action: str,
    expected_sha: str,
    project_ref: str,
    production_project_refs: str,
    password: str,
    control_transport: str = CONTROL_TRANSPORT_GITHUB_IPV4,
) -> dict[str, Any]:
    if action not in {"open", "close"}:
        raise RailwayCanonicalResetError("post-deploy fence action is invalid")
    _validate_boundary(
        expected_sha=expected_sha,
        project_ref=project_ref,
        production_project_refs=production_project_refs,
    )
    database_url, transport = _admin_database_url(
        password=_required(password, "Supabase database password"),
        application_name=f"canonical_railway_fence_{action}",
        control_transport=control_transport,
    )
    try:
        with _temporary_owner_delegation(database_url, project_ref=project_ref):
            fence_receipt = apply_fence(
                database_url, action=action, commit_sha=expected_sha
            )
    except RailwayCanonicalResetError:
        raise
    except FenceError as error:
        raise RailwayCanonicalResetError(
            f"railway_write_fence_{action}_failed:{error}"
        ) from None
    except Exception as error:
        raise RailwayCanonicalResetError(
            f"railway_write_fence_{action}_failed:"
            f"{_database_failure_code(error)}"
        ) from None
    with contextlib.closing(psycopg2.connect(database_url)) as connection:
        role_receipt = verify_post_cleanup_role_state(
            connection, project_ref=project_ref
        )
    return {
        "schema": RECEIPT_SCHEMA,
        "action": f"{action}-fence",
        "provider": "railway",
        "expected_sha": expected_sha,
        "project_ref": project_ref,
        "transport": dict(transport),
        "write_fence": fence_receipt,
        "role_cleanup": role_receipt,
        "completed_at": _utc_now(),
    }


def open_fence_after_deploy(**kwargs: Any) -> dict[str, Any]:
    return _set_fence_after_deploy(action="open", **kwargs)


def close_fence_after_failure(**kwargs: Any) -> dict[str, Any]:
    return _set_fence_after_deploy(action="close", **kwargs)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "action", choices=("prepare-reset", "reset", "open-fence", "close-fence")
    )
    parser.add_argument("--expected-sha", required=True)
    parser.add_argument("--project-ref", required=True)
    parser.add_argument("--production-project-refs", required=True)
    parser.add_argument("--receipt", required=True, type=Path)
    parser.add_argument("--evidence-cleanup-receipt", type=Path)
    return parser.parse_args()


def main() -> int:
    arguments = parse_args()
    common = {
        "expected_sha": arguments.expected_sha,
        "project_ref": arguments.project_ref,
        "production_project_refs": arguments.production_project_refs,
        "password": os.getenv("SUPABASE_DB_PASSWORD", ""),
    }
    if arguments.action == "prepare-reset":
        payload = prepare_reset_boundary(**common)
    elif arguments.action == "reset":
        if arguments.evidence_cleanup_receipt is None:
            raise RailwayCanonicalResetError(
                "--evidence-cleanup-receipt is required for reset"
            )
        payload = reset_disposable_staging(
            **common,
            evidence_cleanup_receipt_path=arguments.evidence_cleanup_receipt,
        )
    elif arguments.action == "open-fence":
        payload = open_fence_after_deploy(**common)
    else:
        payload = close_fence_after_failure(**common)
    _write_receipt(arguments.receipt, payload)
    print(
        json.dumps(
            {
                "action": payload["action"],
                "provider": payload["provider"],
                "expected_sha": payload["expected_sha"],
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

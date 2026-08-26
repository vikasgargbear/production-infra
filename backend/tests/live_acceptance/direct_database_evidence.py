"""Bounded direct-PostgreSQL evidence for provider-neutral Live18 runs."""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import stat
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Callable, Mapping
from uuid import UUID


OUTPUT_ENV = "LIVE18_DIRECT_DATABASE_EVIDENCE_OUTPUT_PATH"
CAPTURED_EVIDENCE_ENV = "PHARMA_CANONICAL_LIVE_DATABASE_EVIDENCE_PATH"
SCHEMA = "aasopharma.live18.database-evidence.v1"
TRANSPORT = "supabase_direct_ipv4_from_github_actions"
PROJECT_REF = re.compile(r"^[a-z0-9]{20}$")
FORBIDDEN_KEYS = {
    "access_token",
    "authorization",
    "database_url",
    "dsn",
    "jwt",
    "password",
    "refresh_token",
    "service_token",
}

Query = Callable[[str, tuple[Any, ...]], list[dict[str, Any]]]


class DirectDatabaseEvidenceError(RuntimeError):
    """The direct evidence output boundary is incomplete or unsafe."""


def _canonical_json_value(value: Any) -> Any:
    if isinstance(value, dict):
        normalized: dict[str, Any] = {}
        for key, child in value.items():
            if not isinstance(key, str):
                raise DirectDatabaseEvidenceError("database evidence keys must be strings")
            if key.lower() in FORBIDDEN_KEYS:
                raise DirectDatabaseEvidenceError(
                    "database evidence contains a forbidden credential field"
                )
            normalized[key] = _canonical_json_value(child)
        return normalized
    if isinstance(value, (list, tuple)):
        return [_canonical_json_value(child) for child in value]
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (bytes, bytearray, memoryview)):
        return {"hex": bytes(value).hex()}
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, float):
        if not math.isfinite(value):
            raise DirectDatabaseEvidenceError("database evidence contains a non-finite number")
        return value
    if value is None or isinstance(value, (str, int, bool)):
        if isinstance(value, str) and (
            value.lower().startswith(("postgres://", "postgresql://"))
            or value.lower().startswith("bearer ")
        ):
            raise DirectDatabaseEvidenceError(
                "database evidence contains a credential-bearing transport value"
            )
        return value
    raise DirectDatabaseEvidenceError(
        f"database evidence contains unsupported {type(value).__name__}"
    )


def _canonical_bytes(value: dict[str, Any]) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    ).encode("utf-8")


def _canonical_uuid(value: str, label: str) -> str:
    try:
        parsed = UUID(value)
    except (ValueError, AttributeError) as exc:
        raise DirectDatabaseEvidenceError(f"{label} must be a canonical UUID") from exc
    if str(parsed) != value.lower():
        raise DirectDatabaseEvidenceError(f"{label} must use canonical UUID text")
    return str(parsed)


def _configured_output_path(environment: Mapping[str, str]) -> Path | None:
    value = environment.get(OUTPUT_ENV, "").strip()
    if not value:
        return None
    if environment.get(CAPTURED_EVIDENCE_ENV, "").strip():
        raise DirectDatabaseEvidenceError(
            "direct and captured database evidence cannot be selected together"
        )
    runner_value = environment.get("RUNNER_TEMP", "").strip()
    output = Path(value)
    runner_temp = Path(runner_value)
    if not output.is_absolute() or not runner_temp.is_absolute():
        raise DirectDatabaseEvidenceError(
            "direct database evidence requires absolute output and RUNNER_TEMP paths"
        )
    resolved_runner = runner_temp.resolve()
    if not resolved_runner.is_dir() or output.parent.resolve() != resolved_runner:
        raise DirectDatabaseEvidenceError(
            "direct database evidence output must be a direct child of RUNNER_TEMP"
        )
    if output.exists() or output.is_symlink():
        raise DirectDatabaseEvidenceError(
            "direct database evidence output must not already exist"
        )
    return output


def _runtime_role(query: Query) -> dict[str, Any]:
    rows = query(
        """
        SELECT current_user::text AS current_user,
               role.rolsuper AS superuser,
               role.rolbypassrls AS bypassrls,
               pg_has_role(current_user,'erp_migration_owner','MEMBER')
                 AS migration_owner_member,
               current_setting('row_security')::boolean AS row_security,
               family(inet_server_addr())::integer AS network_family
          FROM pg_catalog.pg_roles role
         WHERE role.rolname=current_user
        """,
        (),
    )
    if len(rows) != 1:
        raise DirectDatabaseEvidenceError("direct database role evidence is missing")
    row = rows[0]
    role = {
        "current_user": row.get("current_user"),
        "superuser": row.get("superuser"),
        "bypassrls": row.get("bypassrls"),
        "migration_owner_member": row.get("migration_owner_member"),
        "row_security": row.get("row_security"),
        "network_family": row.get("network_family"),
        "transport": TRANSPORT,
    }
    if (
        role["current_user"] != "erp_runtime"
        or role["superuser"] is not False
        or role["bypassrls"] is not False
        or role["migration_owner_member"] is not False
        or role["row_security"] is not True
        or role["network_family"] not in {4, 6}
    ):
        raise DirectDatabaseEvidenceError(
            "direct evidence requires erp_runtime with row_security and no owner/RLS bypass"
        )
    return role


@dataclass
class DirectDatabaseEvidenceRecorder:
    output_path: Path
    expected_commands: dict[str, str]
    resources: dict[str, dict[str, Any]] = field(default_factory=dict)

    @classmethod
    def from_environment(
        cls,
        expected_commands: Mapping[str, str],
        environment: Mapping[str, str] | None = None,
    ) -> DirectDatabaseEvidenceRecorder | None:
        output = _configured_output_path(os.environ if environment is None else environment)
        if output is None:
            return None
        if len(expected_commands) != 18 or len(set(expected_commands)) != 18:
            raise DirectDatabaseEvidenceError(
                "direct database evidence requires the exact 18-operation matrix"
            )
        if any(
            not operation_id or not command.endswith(".prepare")
            for operation_id, command in expected_commands.items()
        ):
            raise DirectDatabaseEvidenceError(
                "direct database evidence matrix contains an invalid command"
            )
        return cls(output_path=output, expected_commands=dict(expected_commands))

    def record(
        self,
        *,
        operation_id: str,
        command_operation: str,
        command_request_id: str,
        resource_id: str,
        database: dict[str, Any],
    ) -> None:
        if self.expected_commands.get(operation_id) != command_operation:
            raise DirectDatabaseEvidenceError(
                f"{operation_id} differs from the exact published command matrix"
            )
        if operation_id in self.resources:
            raise DirectDatabaseEvidenceError(
                f"{operation_id} database evidence was recorded more than once"
            )
        canonical_database = _canonical_json_value(database)
        if not isinstance(canonical_database, dict) or not canonical_database:
            raise DirectDatabaseEvidenceError(
                f"{operation_id} database evidence must be a non-empty object"
            )
        self.resources[operation_id] = {
            "command_operation": command_operation,
            "command_request_id": _canonical_uuid(
                command_request_id, f"{operation_id} command request"
            ),
            "resource_id": _canonical_uuid(resource_id, f"{operation_id} resource"),
            "database": canonical_database,
            "cross_tenant_denied": True,
        }

    def finalize(
        self,
        *,
        organization_id: str,
        denial_organization_id: str,
        expected_sha: str,
        project_ref: str,
        query: Query,
    ) -> None:
        if set(self.resources) != set(self.expected_commands):
            missing = sorted(set(self.expected_commands) - set(self.resources))
            extra = sorted(set(self.resources) - set(self.expected_commands))
            raise DirectDatabaseEvidenceError(
                f"direct database evidence is incomplete; missing={missing}, extra={extra}"
            )
        for operation_id, command in self.expected_commands.items():
            if self.resources[operation_id]["command_operation"] != command:
                raise DirectDatabaseEvidenceError(
                    f"{operation_id} database evidence command drifted before write"
                )
        if len(expected_sha) != 40 or any(char not in "0123456789abcdef" for char in expected_sha):
            raise DirectDatabaseEvidenceError("direct database evidence requires an exact SHA")
        if PROJECT_REF.fullmatch(project_ref) is None:
            raise DirectDatabaseEvidenceError(
                "direct database evidence requires an exact staging project ref"
            )
        canonical_org = _canonical_uuid(organization_id, "organization")
        canonical_denial_org = _canonical_uuid(
            denial_organization_id, "denial organization"
        )
        if canonical_org == canonical_denial_org:
            raise DirectDatabaseEvidenceError(
                "direct database evidence requires a distinct denial organization"
            )
        unsigned = {
            "schema": SCHEMA,
            "action": "capture-evidence",
            "expected_sha": expected_sha,
            "project_ref": project_ref,
            "organization_id": canonical_org,
            "denial_organization_id": canonical_denial_org,
            "runtime_role": _runtime_role(query),
            "resources": {
                operation_id: self.resources[operation_id]
                for operation_id in sorted(self.resources)
            },
        }
        unsigned = _canonical_json_value(unsigned)
        content_hash = hashlib.sha256(_canonical_bytes(unsigned)).hexdigest()
        artifact = {**unsigned, "content_sha256": content_hash}
        payload = json.dumps(
            artifact,
            sort_keys=True,
            indent=2,
            ensure_ascii=True,
        ).encode("utf-8") + b"\n"
        descriptor: int | None = None
        created = False
        try:
            descriptor = os.open(
                self.output_path,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                0o600,
            )
            created = True
            with os.fdopen(descriptor, "wb") as output:
                descriptor = None
                output.write(payload)
                output.flush()
                os.fchmod(output.fileno(), 0o600)
                os.fsync(output.fileno())
            if self.output_path.is_symlink() or (
                stat.S_IMODE(self.output_path.stat().st_mode) != 0o600
            ):
                raise DirectDatabaseEvidenceError(
                    "direct database evidence permissions are not owner-only"
                )
        except BaseException:
            if descriptor is not None:
                os.close(descriptor)
            if created and self.output_path.exists() and not self.output_path.is_symlink():
                self.output_path.unlink()
            raise

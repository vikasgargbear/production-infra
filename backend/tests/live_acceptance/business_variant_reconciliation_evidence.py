"""Scrubbed MCP/PostgreSQL commitments for supported-business browser variants."""

from __future__ import annotations

import hashlib
import json
import os
import stat
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping
from uuid import UUID


OUTPUT_ENV = "LIVE23_BUSINESS_RECONCILIATION_EVIDENCE_PATH"
SCHEMA = "aasopharma.live23.business-variant-reconciliation.v1"


class BusinessVariantReconciliationEvidenceError(RuntimeError):
    """Variant reconciliation evidence is incomplete or escaped its boundary."""


def _canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        default=str,
        allow_nan=False,
    ).encode("utf-8")


def _digest_value(value: Any) -> str:
    return hashlib.sha256(_canonical_bytes(value)).hexdigest()


def _canonical_uuid(value: str, label: str) -> str:
    try:
        parsed = UUID(value)
    except (AttributeError, ValueError) as exc:
        raise BusinessVariantReconciliationEvidenceError(
            f"{label} must be a UUID"
        ) from exc
    if str(parsed) != value.lower():
        raise BusinessVariantReconciliationEvidenceError(
            f"{label} must use canonical UUID text"
        )
    return str(parsed)


def _output_path(environment: Mapping[str, str]) -> Path | None:
    configured = environment.get(OUTPUT_ENV, "").strip()
    if not configured:
        return None
    runner = environment.get("RUNNER_TEMP", "").strip()
    output = Path(configured)
    runner_temp = Path(runner)
    if not output.is_absolute() or not runner_temp.is_absolute():
        raise BusinessVariantReconciliationEvidenceError(
            "variant reconciliation requires absolute runner-temporary paths"
        )
    if not runner_temp.resolve().is_dir() or output.parent.resolve() != runner_temp.resolve():
        raise BusinessVariantReconciliationEvidenceError(
            "variant reconciliation output must be a direct child of RUNNER_TEMP"
        )
    if output.exists() or output.is_symlink():
        raise BusinessVariantReconciliationEvidenceError(
            "variant reconciliation output must not already exist"
        )
    return output


@dataclass
class BusinessVariantReconciliationEvidenceRecorder:
    output_path: Path
    expected_commands: dict[str, str]
    rows: dict[str, dict[str, str]] = field(default_factory=dict)

    @classmethod
    def from_environment(
        cls,
        expected_commands: Mapping[str, str],
        environment: Mapping[str, str] | None = None,
    ) -> BusinessVariantReconciliationEvidenceRecorder | None:
        output = _output_path(os.environ if environment is None else environment)
        if output is None:
            return None
        if (
            len(expected_commands) != 7
            or len(set(expected_commands)) != 7
            or any(not key or not command.endswith(".prepare") for key, command in expected_commands.items())
        ):
            raise BusinessVariantReconciliationEvidenceError(
                "variant reconciliation requires the exact seven-command scope"
            )
        return cls(output, dict(expected_commands))

    def record(
        self,
        *,
        variant_id: str,
        command_operation: str,
        command_request_id: str,
        resource_id: str,
        browser_evidence_path: Path,
        mcp_status: Any,
        mcp_readback: Any,
        database: Any,
    ) -> None:
        if self.expected_commands.get(variant_id) != command_operation:
            raise BusinessVariantReconciliationEvidenceError(
                f"{variant_id} differs from the reviewed command scope"
            )
        if variant_id in self.rows:
            raise BusinessVariantReconciliationEvidenceError(
                f"{variant_id} reconciliation was recorded twice"
            )
        if not browser_evidence_path.is_file() or browser_evidence_path.is_symlink():
            raise BusinessVariantReconciliationEvidenceError(
                f"{variant_id} browser evidence is missing"
            )
        self.rows[variant_id] = {
            "variant_id": variant_id,
            "command_operation": command_operation,
            "command_request_id": _canonical_uuid(
                command_request_id, f"{variant_id} command request"
            ),
            "resource_id": _canonical_uuid(resource_id, f"{variant_id} resource"),
            "browser_evidence_sha256": hashlib.sha256(
                browser_evidence_path.read_bytes()
            ).hexdigest(),
            "mcp_status_sha256": _digest_value(mcp_status),
            "mcp_readback_sha256": _digest_value(mcp_readback),
            "database_projection_sha256": _digest_value(database),
        }

    def finalize(
        self,
        *,
        expected_sha: str,
        organization_id: str,
        branch_id: str,
    ) -> None:
        if set(self.rows) != set(self.expected_commands):
            raise BusinessVariantReconciliationEvidenceError(
                "variant reconciliation did not cover all seven reviewed variants"
            )
        if len(expected_sha) != 40 or any(char not in "0123456789abcdef" for char in expected_sha):
            raise BusinessVariantReconciliationEvidenceError(
                "variant reconciliation requires an exact lowercase SHA"
            )
        expected_set_hash = hashlib.sha256(
            _canonical_bytes(self.expected_commands)
        ).hexdigest()
        unsigned = {
            "schema": SCHEMA,
            "expected_sha": expected_sha,
            "organization_id": _canonical_uuid(organization_id, "organization"),
            "branch_id": _canonical_uuid(branch_id, "branch"),
            "variant_count": 7,
            "variant_ids": sorted(self.expected_commands),
            "variant_set_sha256": expected_set_hash,
            "variants": [self.rows[key] for key in sorted(self.rows)],
        }
        artifact = {**unsigned, "content_sha256": _digest_value(unsigned)}
        payload = json.dumps(artifact, sort_keys=True, indent=2).encode("utf-8") + b"\n"
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
            if self.output_path.is_symlink() or stat.S_IMODE(self.output_path.stat().st_mode) != 0o600:
                raise BusinessVariantReconciliationEvidenceError(
                    "variant reconciliation evidence is not owner-only"
                )
        except BaseException:
            if descriptor is not None:
                os.close(descriptor)
            if created and self.output_path.exists() and not self.output_path.is_symlink():
                self.output_path.unlink()
            raise

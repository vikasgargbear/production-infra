#!/usr/bin/env python3
"""Build the only uploadable Live18 artifact from ephemeral raw evidence.

Raw browser/network evidence is required for same-run reconciliation, but it can
contain request bodies or authenticated application state. This boundary emits
only reviewed scalar metadata plus SHA-256 commitments to the runner-local raw
files. It deliberately cannot copy an input file into the artifact directory.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import struct
from pathlib import Path
from typing import Any


SHA = re.compile(r"^[0-9a-f]{40}$")
UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
PREVIEW_HASH = re.compile(r"^sha256:[0-9a-f]{64}$", re.IGNORECASE)
SAFE_IDENTIFIER = re.compile(r"^[a-z][a-z0-9_]{0,79}$")
SAFE_ERROR_KIND = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,79}$")
SAFE_PROJECT_REF = re.compile(r"^[a-z0-9]{20}$")
SAFE_HTTP_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
SAFE_ACTORS = {"requester", "reviewer"}
SAFE_UI_ACTIONS = {
    "goto", "click", "fill", "select", "setInputFiles", "press", "expectText",
    "expectDisabled",
}
SAFE_LOCATOR_KINDS = {"role", "label", "placeholder", "text", "testId"}
SAFE_SCREENSHOT_STAGES = ("missing-required", "posted")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
DEFAULT_OPERATION_MATRIX = (
    Path(__file__).resolve().parents[1]
    / "tests"
    / "live_acceptance"
    / "operation_matrix.json"
)
RECONCILIATION_SCHEMA = "aasopharma.live18.reconciliation-attestation.v1"
RENDER_DEMO_RECEIPT_SCHEMA = "aasopharma.live18.render-demo-receipt.v1"


class ArtifactManifestError(RuntimeError):
    """Runner-local evidence does not satisfy the public artifact contract."""


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ArtifactManifestError(f"{path.name} must contain one JSON object")
    return value


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _content_sha256(value: dict[str, Any]) -> str:
    unsigned = {key: item for key, item in value.items() if key != "content_sha256"}
    return hashlib.sha256(
        json.dumps(unsigned, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _optional_nonempty_file(path: Path | None) -> Path | None:
    if path is None or not path.is_file() or path.stat().st_size == 0:
        return None
    return path


def _required_text(value: dict[str, Any], key: str, pattern: re.Pattern[str]) -> str:
    item = value.get(key)
    if not isinstance(item, str) or pattern.fullmatch(item) is None:
        raise ArtifactManifestError(f"invalid {key}")
    return item


def _optional_uuid(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or UUID.fullmatch(value) is None:
        raise ArtifactManifestError("invalid optional UUID")
    return value


def _request_id_sha256(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ArtifactManifestError("invalid HTTP request ID")
    encoded = value.encode("utf-8")
    if not encoded or len(encoded) > 256:
        raise ArtifactManifestError("HTTP request ID must contain 1 to 256 UTF-8 bytes")
    return hashlib.sha256(encoded).hexdigest()


def _http_summary(row: Any) -> dict[str, Any]:
    if not isinstance(row, dict):
        raise ArtifactManifestError("HTTP evidence row must be an object")
    method = row.get("method")
    path = row.get("path")
    status = row.get("status")
    actor = row.get("actor")
    request_id = row.get("requestId")
    if (
        method not in SAFE_HTTP_METHODS
        or not isinstance(path, str)
        or not path.startswith("/api/")
        or not isinstance(status, int)
        or isinstance(status, bool)
        or status < 100
        or status > 599
        or actor not in {"requester", "reviewer"}
    ):
        raise ArtifactManifestError("invalid HTTP evidence metadata")
    scrubbed_path = path.split("?", 1)[0]
    return {
        "actor": actor,
        "method": method,
        "path": scrubbed_path,
        "status": status,
        # Preserve the reviewed manifest schema while committing only the hash.
        "request_id": _request_id_sha256(request_id),
    }


def _expected_operations(path: Path) -> dict[str, str]:
    value = _read_json(path)
    rows = value.get("operations")
    deferred_rows = value.get("deferred_operations")
    if (
        value.get("operation_count") != 18
        or not isinstance(rows, list)
        or len(rows) != value["operation_count"]
        or not isinstance(deferred_rows, list)
        or value.get("required_operation_count") != len(rows) - len(deferred_rows)
    ):
        raise ArtifactManifestError(
            "operation matrix must declare 18 operations and an exact ready scope"
        )
    deferred = {
        row.get("id") for row in deferred_rows
        if isinstance(row, dict) and row.get("status") == "deferred"
    }
    if len(deferred) != len(deferred_rows):
        raise ArtifactManifestError("operation matrix contains an invalid deferral")
    expected: dict[str, str] = {}
    for row in rows:
        if not isinstance(row, dict) or row.get("availability") != "published":
            raise ArtifactManifestError("every Live18 operation must be published")
        operation_id = row.get("id")
        command_operation = row.get("command_operation")
        if (
            not isinstance(operation_id, str)
            or SAFE_IDENTIFIER.fullmatch(operation_id) is None
            or not isinstance(command_operation, str)
            or not command_operation.endswith(".prepare")
            or operation_id in expected
        ):
            raise ArtifactManifestError("operation matrix contains an invalid operation")
        if operation_id not in deferred:
            expected[operation_id] = command_operation
    if len(expected) != value["required_operation_count"]:
        raise ArtifactManifestError("operation matrix ready scope is incomplete")
    return expected


def _evidence_set_sha256(rows: list[dict[str, Any]]) -> str:
    commitments = {
        row["operation_id"]: row["raw_evidence_sha256"] for row in rows
    }
    return hashlib.sha256(
        json.dumps(commitments, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _operation_set_sha256(expected_operations: dict[str, str]) -> str:
    return hashlib.sha256(
        json.dumps(
            expected_operations, sort_keys=True, separators=(",", ":")
        ).encode("utf-8")
    ).hexdigest()


def _screenshot_summaries(
    value: dict[str, Any], operation_id: str, screenshot_dir: Path | None,
) -> list[dict[str, Any]]:
    rows = value.get("screenshots")
    if not isinstance(rows, list) or len(rows) != len(SAFE_SCREENSHOT_STAGES):
        raise ArtifactManifestError("browser evidence must contain exactly two screenshots")
    if screenshot_dir is None:
        raise ArtifactManifestError("browser screenshot directory is required")
    root = screenshot_dir.resolve()
    summaries: list[dict[str, Any]] = []
    for index, expected_stage in enumerate(SAFE_SCREENSHOT_STAGES):
        row = rows[index]
        expected_filename = f"{operation_id}-{expected_stage}.png"
        if not isinstance(row, dict) or row.get("stage") != expected_stage:
            raise ArtifactManifestError("browser screenshot stages are invalid or out of order")
        if row.get("filename") != expected_filename:
            raise ArtifactManifestError("browser screenshot filename is not operation-bound")
        screenshot = screenshot_dir / expected_filename
        if screenshot.is_symlink() or not screenshot.is_file():
            raise ArtifactManifestError("browser screenshot is missing or is a symlink")
        try:
            resolved = screenshot.resolve(strict=True)
            resolved.relative_to(root)
        except (OSError, ValueError) as exc:
            raise ArtifactManifestError("browser screenshot escaped its reviewed directory") from exc
        mode = stat.S_IMODE(resolved.stat().st_mode)
        if mode & 0o077:
            raise ArtifactManifestError("browser screenshot permissions are not owner-only")
        content = resolved.read_bytes()
        if len(content) < 24 or content[:8] != PNG_SIGNATURE or content[12:16] != b"IHDR":
            raise ArtifactManifestError("browser screenshot is not a valid PNG")
        width, height = struct.unpack(">II", content[16:24])
        byte_size = row.get("byte_size")
        if (
            not isinstance(byte_size, int)
            or isinstance(byte_size, bool)
            or byte_size != len(content)
            or row.get("width") != width
            or row.get("height") != height
            or width < 1
            or height < 1
        ):
            raise ArtifactManifestError("browser screenshot metadata does not match the PNG")
        digest = hashlib.sha256(content).hexdigest()
        if row.get("sha256") != digest or SHA256.fullmatch(digest) is None:
            raise ArtifactManifestError("browser screenshot SHA-256 does not match")
        summaries.append({
            "stage": expected_stage,
            "filename": expected_filename,
            "sha256": digest,
            "byte_size": byte_size,
            "width": width,
            "height": height,
        })
    return summaries


def _browser_summary(path: Path, screenshot_dir: Path | None) -> dict[str, Any]:
    value = _read_json(path)
    if value.get("evidence_schema") != "aasopharma.live18.browser.v1":
        raise ArtifactManifestError(f"{path.name} has the wrong browser evidence schema")
    operation_id = value.get("operation_id")
    command_operation = value.get("command_operation")
    if not isinstance(operation_id, str) or not operation_id:
        raise ArtifactManifestError("invalid operation_id")
    if not isinstance(command_operation, str) or not command_operation.endswith(".prepare"):
        raise ArtifactManifestError("invalid command_operation")
    self_approval = value.get("self_approval_probe")
    self_approval_status = None
    if self_approval is not None:
        if not isinstance(self_approval, dict) or not isinstance(self_approval.get("status"), int):
            raise ArtifactManifestError("invalid self-approval evidence")
        self_approval_status = self_approval["status"]
    http_rows = value.get("http_evidence")
    missing_rows = value.get("missing_required_http_evidence")
    if not isinstance(http_rows, list) or not isinstance(missing_rows, list):
        raise ArtifactManifestError("browser HTTP evidence must be arrays")
    summary = {
        "operation_id": operation_id,
        "command_operation": command_operation,
        "tested_sha": _required_text(value, "tested_sha", SHA),
        "command_request_id": _required_text(value, "command_request_id", UUID),
        "resource_id": _required_text(value, "resource_id", UUID),
        "preview_hash": _required_text(value, "preview_hash", PREVIEW_HASH),
        "requester_user_id": _required_text(value, "requester_user_id", UUID),
        "reviewer_user_id": _required_text(value, "reviewer_user_id", UUID),
        "organization_id": _required_text(value, "organization_id", UUID),
        "branch_id": _required_text(value, "branch_id", UUID),
        "cleanup_id": _optional_uuid(value.get("cleanup_id")),
        "self_approval_status": self_approval_status,
        "missing_required_http": [_http_summary(row) for row in missing_rows],
        "http": [_http_summary(row) for row in http_rows],
    }
    summary["screenshots"] = _screenshot_summaries(value, operation_id, screenshot_dir)
    summary["raw_evidence_sha256"] = _digest(path)
    return summary


def _browser_failure_summary(path: Path) -> dict[str, Any]:
    value = _read_json(path)
    if value.get("evidence_schema") != "aasopharma.live18.browser-failure.v1":
        raise ArtifactManifestError(f"{path.name} has the wrong browser failure schema")
    step_index = value.get("step_index")
    actor = value.get("actor")
    action = value.get("action")
    locator_kind = value.get("locator_kind")
    if (
        (step_index is not None and (
            not isinstance(step_index, int) or isinstance(step_index, bool) or step_index < 0
        ))
        or (actor is not None and actor not in SAFE_ACTORS)
        or (action is not None and action not in SAFE_UI_ACTIONS)
        or (locator_kind is not None and locator_kind not in SAFE_LOCATOR_KINDS)
    ):
        raise ArtifactManifestError("invalid browser failure progress metadata")
    return {
        "operation_id": _required_text(value, "operation_id", SAFE_IDENTIFIER),
        "tested_sha": _required_text(value, "tested_sha", SHA),
        "stage": _required_text(value, "stage", SAFE_IDENTIFIER),
        "step_index": step_index,
        "actor": actor,
        "action": action,
        "locator_kind": locator_kind,
        "error_kind": _required_text(value, "error_kind", SAFE_ERROR_KIND),
        "raw_evidence_sha256": _digest(path),
    }


def _deployment_summary(
    path: Path,
    *,
    allow_provenance_only: bool = False,
) -> dict[str, Any]:
    value = _read_json(path)
    schema = value.get("schema")
    ready_schema = "aasopharma.live18.deployment-evidence.v1"
    provenance_schema = "aasopharma.deployment-provenance.v1"
    if schema != ready_schema and not (
        allow_provenance_only and schema == provenance_schema
    ):
        raise ArtifactManifestError("wrong deployment evidence schema")
    provider = value.get("provider")
    services = value.get("services")
    if (
        provider not in {"render", "railway"}
        or not isinstance(services, dict)
        or set(services) != {"api", "frontend", "mcp"}
    ):
        raise ArtifactManifestError("invalid deployment evidence")
    commit_sha = _required_text(value, "commit_sha", SHA)
    origins: dict[str, str] = {}
    deployment_ids: dict[str, str] = {}
    for name in ("api", "frontend", "mcp"):
        service = services.get(name)
        origin = service.get("origin") if isinstance(service, dict) else None
        if not isinstance(origin, str) or not origin.startswith("https://") or "@" in origin:
            raise ArtifactManifestError(f"invalid {name} deployment origin")
        origins[name] = origin
        if provider == "railway":
            deployment_ids[name] = _required_text(
                service, "deployment_id", UUID
            )
    if len(set(origins.values())) != 3:
        raise ArtifactManifestError("deployment service origins must be distinct")
    if (
        services["api"].get("health")
        != {"status": "healthy", "git_commit": commit_sha}
        or services["frontend"].get("health") != "ok"
        or services["frontend"].get("build_metadata")
        != {"service": "aasopharma-erp", "git_commit": commit_sha}
        or services["mcp"].get("health")
        != {"status": "ok", "git_commit": commit_sha}
    ):
        raise ArtifactManifestError(
            "deployment evidence does not prove exact-SHA public provenance"
        )
    if schema == ready_schema:
        if (
            services["api"].get("readiness") != {"status": "ready"}
            or services["mcp"].get("readiness") != {"status": "ready"}
        ):
            raise ArtifactManifestError(
                "deployment evidence does not prove exact-SHA public readiness"
            )
        status = "ready"
    else:
        if "readiness" in services["api"] or "readiness" in services["mcp"]:
            raise ArtifactManifestError(
                "provenance-only evidence must not claim public readiness"
            )
        status = "provenance_only"
    return {
        "provider": provider,
        "commit_sha": commit_sha,
        "status": status,
        "origins": origins,
        "deployment_ids": deployment_ids if provider == "railway" else None,
        "raw_evidence_sha256": _digest(path),
    }


def _database_summary(
    path: Path, deployment: dict[str, Any]
) -> dict[str, Any]:
    value = _read_json(path)
    provider = deployment["provider"]
    expected_schema = {
        "railway": "aasopharma.live18.railway-database-response.v1",
        "render": "aasopharma.live18.database-evidence.v1",
    }[provider]
    expected_content_hash = _content_sha256(value)
    if (
        value.get("schema") != expected_schema
        or value.get("action") != "capture-evidence"
        or value.get("expected_sha") != deployment["commit_sha"]
        or not isinstance(value.get("project_ref"), str)
        or SAFE_PROJECT_REF.fullmatch(value["project_ref"]) is None
        or value.get("content_sha256") != expected_content_hash
    ):
        raise ArtifactManifestError("invalid provider-bound database evidence")
    resources = value.get("resources")
    runtime_role = value.get("runtime_role")
    if not isinstance(resources, dict) or not isinstance(runtime_role, dict):
        raise ArtifactManifestError("invalid database evidence")
    runtime_common = {
        "current_user": "erp_runtime",
        "superuser": False,
        "bypassrls": False,
        "migration_owner_member": False,
    }
    if provider == "railway":
        expected_runtime = {
            **runtime_common,
            "network_family": 6,
            "transport": "supabase_direct_ipv6_from_railway",
        }
        runtime_valid = runtime_role == expected_runtime
    else:
        expected_runtime = {
            **runtime_common,
            "row_security": True,
            "transport": "supabase_direct_ipv4_from_github_actions",
        }
        runtime_valid = (
            set(runtime_role) == {*expected_runtime, "network_family"}
            and all(
                runtime_role.get(key) == expected
                for key, expected in expected_runtime.items()
            )
            and runtime_role.get("network_family") in {4, 6}
        )
    if not runtime_valid:
        raise ArtifactManifestError(
            "database evidence did not use the provider-matched isolated runtime role"
        )
    safe_resources: dict[str, Any] = {}
    for operation, resource in sorted(resources.items()):
        database_value = resource.get("database") if isinstance(resource, dict) else None
        if (
            not isinstance(operation, str)
            or SAFE_IDENTIFIER.fullmatch(operation) is None
            or not isinstance(resource, dict)
            or not isinstance(database_value, dict)
            or not database_value
        ):
            raise ArtifactManifestError("invalid database resource evidence")
        safe_resources[operation] = {
            "command_operation": resource.get("command_operation"),
            "command_request_id": _required_text(resource, "command_request_id", UUID),
            "resource_id": _required_text(resource, "resource_id", UUID),
            "cross_tenant_denied": resource.get("cross_tenant_denied") is True,
            "database_sha256": hashlib.sha256(
                json.dumps(
                    database_value, sort_keys=True, separators=(",", ":"), default=str
                ).encode("utf-8")
            ).hexdigest(),
        }
    runtime_keys = (
        "current_user",
        "superuser",
        "bypassrls",
        "migration_owner_member",
    ) + (("row_security",) if provider == "render" else ()) + (
        "network_family",
        "transport",
    )
    return {
        "expected_sha": deployment["commit_sha"],
        "project_ref": value["project_ref"],
        "organization_id": _required_text(value, "organization_id", UUID),
        "denial_organization_id": _required_text(value, "denial_organization_id", UUID),
        "runtime_role": {
            key: runtime_role.get(key) for key in runtime_keys
        },
        "resources": safe_resources,
        "raw_evidence_sha256": _digest(path),
    }


def _demo_summary(
    path: Path,
    *,
    deployment: dict[str, Any],
    run_id: str,
    run_attempt: str,
) -> dict[str, Any]:
    value = _read_json(path)
    provider = deployment["provider"]
    if (
        value.get("action") != "provision-demo"
        or value.get("project_ref") is None
        or not isinstance(value.get("project_ref"), str)
        or SAFE_PROJECT_REF.fullmatch(value["project_ref"]) is None
        or value.get("content_sha256") != _content_sha256(value)
    ):
        raise ArtifactManifestError("invalid provider-bound demo evidence")
    if provider == "render":
        if (
            set(value) != {
                "schema",
                "action",
                "provider",
                "project_ref",
                "commit_sha",
                "deployed_sha",
                "run",
                "summary_sha256",
                "content_sha256",
            }
            or value.get("schema") != RENDER_DEMO_RECEIPT_SCHEMA
            or value.get("provider") != "render"
            or value.get("commit_sha") != deployment["commit_sha"]
            or value.get("deployed_sha") != deployment["commit_sha"]
            or value.get("run") != {"id": run_id, "attempt": run_attempt}
            or SHA256.fullmatch(str(value.get("summary_sha256", ""))) is None
        ):
            raise ArtifactManifestError("Render demo receipt differs from this exact run")
        summary_sha256 = value["summary_sha256"]
    else:
        write_fence = value.get("write_fence")
        if (
            value.get("schema")
            != "aasopharma.live18.railway-database-response.v1"
            or value.get("expected_sha") != deployment["commit_sha"]
            or value.get("run_id") != run_id
            or value.get("run_attempt") != run_attempt
            or not isinstance(write_fence, dict)
            or write_fence.get("state") != "open"
            or write_fence.get("commit_sha") != deployment["commit_sha"]
        ):
            raise ArtifactManifestError("Railway demo receipt differs from this exact run")
        summary_sha256 = None
    return {
        "action": "provision-demo",
        "provider": provider,
        "commit_sha": deployment["commit_sha"],
        "project_ref": value["project_ref"],
        "run": {"id": run_id, "attempt": run_attempt},
        "summary_sha256": summary_sha256,
        "content_sha256": value.get("content_sha256"),
        "write_fence": "open" if provider == "railway" else None,
        "raw_evidence_sha256": _digest(path),
    }


def _reconciliation_summary(
    path: Path,
    *,
    deployment: dict[str, Any],
    browser: list[dict[str, Any]],
    expected_operations: dict[str, str],
    run_id: str,
    run_attempt: str,
    database_evidence: Path | None,
) -> dict[str, Any]:
    value = _read_json(path)
    provider = deployment["provider"]
    expected_database_path = _optional_nonempty_file(database_evidence)
    expected_database_mode = {
        "railway": "captured_railway",
        "render": "captured_render_runtime",
    }[provider]
    expected_database_hash = (
        _digest(expected_database_path) if expected_database_path is not None else None
    )
    if (
        value.get("schema") != RECONCILIATION_SCHEMA
        or value.get("status") != "success"
        or value.get("provider") != provider
        or value.get("commit_sha") != deployment["commit_sha"]
        or value.get("run") != {"id": run_id, "attempt": run_attempt}
        or value.get("operation_count") != len(expected_operations)
        or value.get("operation_ids") != sorted(expected_operations)
        or value.get("operation_set_sha256")
        != _operation_set_sha256(expected_operations)
        or value.get("browser_evidence_set_sha256")
        != _evidence_set_sha256(browser)
        or value.get("database_mode") != expected_database_mode
        or value.get("database_evidence_sha256") != expected_database_hash
        or expected_database_path is None
    ):
        raise ArtifactManifestError(
            "reconciliation attestation does not match this exact Live18 run"
        )
    return {
        "status": "success",
        "provider": provider,
        "commit_sha": deployment["commit_sha"],
        "operation_count": len(expected_operations),
        "operation_ids": sorted(expected_operations),
        "operation_set_sha256": _operation_set_sha256(expected_operations),
        "browser_evidence_set_sha256": value["browser_evidence_set_sha256"],
        "database_mode": expected_database_mode,
        "database_evidence_sha256": expected_database_hash,
        "raw_attestation_sha256": _digest(path),
    }


def build_manifest(
    *,
    deployed_sha: Path,
    evidence_dir: Path,
    database_evidence: Path | None,
    demo_evidence: Path | None,
    browser_outcome: str,
    run_id: str,
    run_attempt: str,
    screenshot_dir: Path | None = None,
    reconciliation_evidence: Path | None = None,
    operation_matrix: Path = DEFAULT_OPERATION_MATRIX,
) -> dict[str, Any]:
    if browser_outcome not in {"success", "failure", "cancelled", "skipped"}:
        raise ArtifactManifestError("invalid browser outcome")
    browser: list[dict[str, Any]] = []
    browser_failures: list[dict[str, Any]] = []
    evidence_paths = (
        sorted(evidence_dir.glob("*.json")) if evidence_dir.is_dir() else []
    )
    for path in evidence_paths:
        if path.name == "completed-resources.json":
            continue
        schema = _read_json(path).get("evidence_schema")
        if schema == "aasopharma.live18.browser.v1":
            browser.append(_browser_summary(path, screenshot_dir))
        elif schema == "aasopharma.live18.browser-failure.v1":
            browser_failures.append(_browser_failure_summary(path))
        else:
            raise ArtifactManifestError(f"{path.name} has an unknown browser evidence schema")
    if len({row["operation_id"] for row in browser}) != len(browser):
        raise ArtifactManifestError("duplicate browser operation evidence")
    if len({row["operation_id"] for row in browser_failures}) != len(browser_failures):
        raise ArtifactManifestError("duplicate browser operation failure evidence")
    if browser_outcome == "success" and browser_failures:
        raise ArtifactManifestError("successful browser outcome cannot include failure evidence")
    expected_operations = _expected_operations(operation_matrix)
    actual_operations = {
        row["operation_id"]: row["command_operation"] for row in browser
    }
    if browser_outcome == "success":
        if actual_operations != expected_operations:
            raise ArtifactManifestError(
                "successful browser outcome requires the exact release-ready operations"
            )
        if screenshot_dir is None or not screenshot_dir.is_dir():
            raise ArtifactManifestError("successful browser outcome requires screenshot evidence")
        expected_files = {
            row["filename"]
            for operation in browser
            for row in operation["screenshots"]
        }
        actual_files = {
            path.name for path in screenshot_dir.iterdir()
            if path.is_file() or path.is_symlink()
        }
        expected_screenshot_count = len(expected_operations) * len(SAFE_SCREENSHOT_STAGES)
        if len(expected_files) != expected_screenshot_count or actual_files != expected_files:
            raise ArtifactManifestError(
                "successful browser outcome requires two reviewed screenshots per ready operation"
            )
    deployment = _deployment_summary(
        deployed_sha,
        # A failed/cancelled/skipped certification may have stopped before
        # Railway reopened its write fence and emitted readiness evidence.
        # Preserve exact-SHA provenance in that failure artifact without ever
        # allowing it to satisfy the successful certification contract.
        allow_provenance_only=browser_outcome != "success",
    )
    reconciliation_path = _optional_nonempty_file(reconciliation_evidence)
    if browser_outcome == "success" and reconciliation_path is None:
        raise ArtifactManifestError(
            "successful browser outcome requires reconciliation attestation"
        )
    if browser_outcome != "success" and reconciliation_path is not None:
        raise ArtifactManifestError(
            "reconciliation attestation requires a successful browser outcome"
        )
    reconciliation = (
        _reconciliation_summary(
            reconciliation_path,
            deployment=deployment,
            browser=browser,
            expected_operations=expected_operations,
            run_id=run_id,
            run_attempt=run_attempt,
            database_evidence=database_evidence,
        )
        if reconciliation_path is not None
        else None
    )
    database_path = _optional_nonempty_file(database_evidence)
    database = (
        _database_summary(database_path, deployment)
        if database_path is not None
        else None
    )
    demo_path = _optional_nonempty_file(demo_evidence)
    demo = (
        _demo_summary(
            demo_path,
            deployment=deployment,
            run_id=run_id,
            run_attempt=run_attempt,
        )
        if demo_path is not None
        else None
    )
    if browser_outcome == "success":
        if demo is None:
            raise ArtifactManifestError(
                "successful browser outcome requires provider-bound demo evidence"
            )
        if database is None:
            raise ArtifactManifestError(
                "successful browser outcome requires database evidence"
            )
        if demo["project_ref"] != database["project_ref"]:
            raise ArtifactManifestError(
                "demo and database evidence use different staging projects"
            )
        browser_by_operation = {row["operation_id"]: row for row in browser}
        if (
            set(database["resources"]) != set(expected_operations)
            or database["organization_id"]
            not in {row["organization_id"] for row in browser}
            or len({row["organization_id"] for row in browser}) != 1
            or database["denial_organization_id"] == database["organization_id"]
        ):
            raise ArtifactManifestError(
                "database evidence differs from the exact browser operation set"
            )
        for operation_id, resource in database["resources"].items():
            browser_row = browser_by_operation[operation_id]
            if (
                resource["command_operation"] != expected_operations[operation_id]
                or resource["command_request_id"]
                != browser_row["command_request_id"]
                or resource["resource_id"] != browser_row["resource_id"]
                or resource["cross_tenant_denied"] is not True
            ):
                raise ArtifactManifestError(
                    f"database evidence drifted for {operation_id}"
                )
    return {
        "schema": "aasopharma.live18.upload-manifest.v1",
        "run": {"id": run_id, "attempt": run_attempt, "browser_outcome": browser_outcome},
        "deployment": deployment,
        "browser": browser,
        "browser_failures": browser_failures,
        "database": database,
        "demo": demo,
        "reconciliation": reconciliation,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--deployed-sha", required=True, type=Path)
    parser.add_argument("--evidence-dir", required=True, type=Path)
    parser.add_argument("--database-evidence", type=Path)
    parser.add_argument("--demo-evidence", type=Path)
    parser.add_argument("--browser-outcome", required=True)
    parser.add_argument("--screenshot-dir", required=True, type=Path)
    parser.add_argument("--reconciliation-evidence", type=Path)
    parser.add_argument(
        "--operation-matrix", type=Path, default=DEFAULT_OPERATION_MATRIX
    )
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    manifest = build_manifest(
        deployed_sha=args.deployed_sha,
        evidence_dir=args.evidence_dir,
        database_evidence=args.database_evidence,
        demo_evidence=args.demo_evidence,
        browser_outcome=args.browser_outcome,
        run_id=os.getenv("GITHUB_RUN_ID", "local"),
        run_attempt=os.getenv("GITHUB_RUN_ATTEMPT", "local"),
        screenshot_dir=args.screenshot_dir,
        reconciliation_evidence=args.reconciliation_evidence,
        operation_matrix=args.operation_matrix,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

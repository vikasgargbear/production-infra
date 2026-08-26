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


class ArtifactManifestError(RuntimeError):
    """Runner-local evidence does not satisfy the public artifact contract."""


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ArtifactManifestError(f"{path.name} must contain one JSON object")
    return value


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


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
        or (request_id is not None and not isinstance(request_id, str))
    ):
        raise ArtifactManifestError("invalid HTTP evidence metadata")
    scrubbed_path = path.split("?", 1)[0]
    return {
        "actor": actor,
        "method": method,
        "path": scrubbed_path,
        "status": status,
        "request_id": request_id,
    }


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


def _deployment_summary(path: Path) -> dict[str, Any]:
    value = _read_json(path)
    if value.get("schema") != "aasopharma.live18.deployment-evidence.v1":
        raise ArtifactManifestError("wrong deployment evidence schema")
    provider = value.get("provider")
    services = value.get("services")
    if provider not in {"render", "railway"} or not isinstance(services, dict):
        raise ArtifactManifestError("invalid deployment evidence")
    origins: dict[str, str] = {}
    for name in ("api", "frontend", "mcp"):
        service = services.get(name)
        origin = service.get("origin") if isinstance(service, dict) else None
        if not isinstance(origin, str) or not origin.startswith("https://") or "@" in origin:
            raise ArtifactManifestError(f"invalid {name} deployment origin")
        origins[name] = origin
    return {
        "provider": provider,
        "commit_sha": _required_text(value, "commit_sha", SHA),
        "origins": origins,
        "raw_evidence_sha256": _digest(path),
    }


def _database_summary(path: Path) -> dict[str, Any]:
    value = _read_json(path)
    if value.get("action") != "capture-evidence":
        raise ArtifactManifestError("wrong database evidence action")
    resources = value.get("resources")
    runtime_role = value.get("runtime_role")
    if not isinstance(resources, dict) or not isinstance(runtime_role, dict):
        raise ArtifactManifestError("invalid database evidence")
    safe_resources: dict[str, Any] = {}
    for operation, resource in sorted(resources.items()):
        if not isinstance(operation, str) or not isinstance(resource, dict):
            raise ArtifactManifestError("invalid database resource evidence")
        safe_resources[operation] = {
            "command_operation": resource.get("command_operation"),
            "command_request_id": _required_text(resource, "command_request_id", UUID),
            "resource_id": _required_text(resource, "resource_id", UUID),
            "cross_tenant_denied": resource.get("cross_tenant_denied") is True,
            "database_sha256": hashlib.sha256(
                json.dumps(
                    resource.get("database"), sort_keys=True, separators=(",", ":"), default=str
                ).encode("utf-8")
            ).hexdigest(),
        }
    return {
        "organization_id": _required_text(value, "organization_id", UUID),
        "denial_organization_id": _required_text(value, "denial_organization_id", UUID),
        "runtime_role": {
            key: runtime_role.get(key)
            for key in (
                "current_user", "superuser", "bypassrls", "migration_owner_member",
                "network_family", "transport",
            )
        },
        "resources": safe_resources,
        "raw_evidence_sha256": _digest(path),
    }


def _hashed_optional(path: Path | None, expected_action: str) -> dict[str, Any] | None:
    path = _optional_nonempty_file(path)
    if path is None:
        return None
    value = _read_json(path)
    if value.get("action") != expected_action:
        raise ArtifactManifestError(f"wrong {expected_action} evidence action")
    return {
        "action": expected_action,
        "content_sha256": value.get("content_sha256"),
        "raw_evidence_sha256": _digest(path),
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
    if browser_outcome == "success":
        if len(browser) != 18:
            raise ArtifactManifestError("successful browser outcome requires exactly 18 operations")
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
        if len(expected_files) != 36 or actual_files != expected_files:
            raise ArtifactManifestError(
                "successful browser outcome requires exactly 36 reviewed screenshots"
            )
    return {
        "schema": "aasopharma.live18.upload-manifest.v1",
        "run": {"id": run_id, "attempt": run_attempt, "browser_outcome": browser_outcome},
        "deployment": _deployment_summary(deployed_sha),
        "browser": browser,
        "browser_failures": browser_failures,
        "database": (
            _database_summary(database_path)
            if (database_path := _optional_nonempty_file(database_evidence)) is not None
            else None
        ),
        "demo": _hashed_optional(demo_evidence, "provision-demo"),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--deployed-sha", required=True, type=Path)
    parser.add_argument("--evidence-dir", required=True, type=Path)
    parser.add_argument("--database-evidence", type=Path)
    parser.add_argument("--demo-evidence", type=Path)
    parser.add_argument("--browser-outcome", required=True)
    parser.add_argument("--screenshot-dir", required=True, type=Path)
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
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Prove that the retired Railway staging authority cannot serve traffic.

The proof is bound to one project, one environment, and the exact three
service identities and public domains.  A stopped service with the same name
in another Railway environment therefore cannot satisfy the gate.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class RailwayAuthorityError(RuntimeError):
    """Raised when the retired Railway authority is not provably inactive."""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _service_contract(value: str) -> tuple[str, str, str]:
    parts = value.split("=", 2)
    if len(parts) != 3 or not all(parts):
        raise argparse.ArgumentTypeError("service must be SERVICE_ID=NAME=HTTPS_URL")
    service_id, name, origin = parts
    parsed = urllib.parse.urlparse(origin)
    if parsed.scheme != "https" or not parsed.hostname or parsed.path not in {"", "/"}:
        raise argparse.ArgumentTypeError("service origin must be an HTTPS origin")
    return service_id, name, origin.rstrip("/")


def _domain_names(service: dict[str, Any]) -> set[str]:
    domains = service.get("domains") or {}
    return {
        str(entry.get("domain"))
        for group in ("serviceDomains", "customDomains")
        for entry in domains.get(group, [])
        if entry.get("domain")
    }


def validate_status(
    payload: dict[str, Any],
    *,
    project_id: str,
    environment_id: str,
    services: list[tuple[str, str, str]],
) -> list[dict[str, Any]]:
    if payload.get("id") != project_id:
        raise RailwayAuthorityError("Railway status belongs to an unexpected project")
    environments = [
        edge.get("node", {})
        for edge in payload.get("environments", {}).get("edges", [])
        if edge.get("node", {}).get("id") == environment_id
    ]
    if len(environments) != 1:
        raise RailwayAuthorityError("expected exactly one reviewed Railway environment")
    observed = {
        node.get("serviceId"): node
        for edge in environments[0].get("serviceInstances", {}).get("edges", [])
        if (node := edge.get("node", {})).get("serviceId")
    }
    expected_ids = {service_id for service_id, _, _ in services}
    if set(observed) != expected_ids:
        raise RailwayAuthorityError("Railway environment service identity set drifted")

    evidence: list[dict[str, Any]] = []
    for service_id, expected_name, origin in services:
        service = observed[service_id]
        if service.get("serviceName") != expected_name:
            raise RailwayAuthorityError(f"Railway service name drifted for {service_id}")
        host = urllib.parse.urlparse(origin).hostname
        if host not in _domain_names(service):
            raise RailwayAuthorityError(
                f"Railway public origin is not bound to {expected_name}: {origin}"
            )
        latest = service.get("latestDeployment")
        if not isinstance(latest, dict) or latest.get("deploymentStopped") is not True:
            raise RailwayAuthorityError(f"latest {expected_name} deployment is not stopped")
        active = service.get("activeDeployments") or []
        if any(deployment.get("deploymentStopped") is not True for deployment in active):
            raise RailwayAuthorityError(f"{expected_name} retains an active deployment")
        evidence.append(
            {
                "service_id": service_id,
                "service_name": expected_name,
                "origin": origin,
                "latest_deployment_id": latest.get("id"),
                "latest_deployment_status": latest.get("status"),
                "latest_deployment_stopped": True,
                "active_deployment_count": len(active),
            }
        )
    return evidence


def require_retired_health(origin: str) -> int:
    request = urllib.request.Request(f"{origin}/health", method="GET")
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            status = int(response.status)
    except urllib.error.HTTPError as error:
        status = int(error.code)
    except urllib.error.URLError as error:
        raise RailwayAuthorityError(f"Railway health probe failed for {origin}") from error
    if status != 404:
        raise RailwayAuthorityError(
            f"retired Railway origin returned HTTP {status}, expected 404: {origin}"
        )
    return status


def _write_receipt(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(payload, output, indent=2, sort_keys=True)
            output.write("\n")
        os.replace(temporary, path)
        path.chmod(0o600)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--status-json", type=Path, required=True)
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--environment-id", required=True)
    parser.add_argument("--commit-sha", required=True)
    parser.add_argument("--service", action="append", type=_service_contract, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    if re.fullmatch(r"[0-9a-f]{40}", args.commit_sha) is None:
        raise RailwayAuthorityError("commit SHA must be 40 lowercase hexadecimal characters")
    if len(args.service) != 3:
        raise RailwayAuthorityError("exactly three retired Railway services are required")
    if len({service_id for service_id, _, _ in args.service}) != 3:
        raise RailwayAuthorityError("retired Railway service IDs must be unique")
    payload = json.loads(args.status_json.read_text(encoding="utf-8"))
    services = validate_status(
        payload,
        project_id=args.project_id,
        environment_id=args.environment_id,
        services=args.service,
    )
    for service, contract in zip(services, args.service):
        service["health_status"] = require_retired_health(contract[2])
    receipt = {
        "version": 1,
        "commit_sha": args.commit_sha,
        "project_id": args.project_id,
        "environment_id": args.environment_id,
        "state": "retired",
        "verified_at": _utc_now(),
        "services": services,
    }
    _write_receipt(args.receipt, receipt)
    print(json.dumps({"state": "retired", "commit_sha": args.commit_sha}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

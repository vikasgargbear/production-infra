#!/usr/bin/env python3
"""Quiesce and resume the reviewed Render pilot without losing ownership state.

Database reset and credential rotation must not run while an older API process is
reconnecting with the credentials being replaced.  This controller records the
initial Render suspension state before the first mutation and resumes only the
services suspended by the same exact-SHA workflow run.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections.abc import Callable, Iterable, Mapping
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from scripts.provision_render_pilot import (
        API_NAME,
        DEFAULT_OWNER_ID,
        FRONTEND_NAME,
        MCP_NAME,
        ProvisioningError,
        RenderClient,
        ServiceRef,
    )
except ModuleNotFoundError:
    from provision_render_pilot import (  # type: ignore[no-redef]
        API_NAME,
        DEFAULT_OWNER_ID,
        FRONTEND_NAME,
        MCP_NAME,
        ProvisioningError,
        RenderClient,
        ServiceRef,
    )


QUIESCE_ORDER = (
    (FRONTEND_NAME, "static_site"),
    (MCP_NAME, "web_service"),
    (API_NAME, "web_service"),
)
RESUME_ORDER = tuple(reversed(QUIESCE_ORDER))
ACTIVE_DEPLOY_STATUSES = frozenset(
    {
        "created",
        "queued",
        "build_in_progress",
        "update_in_progress",
        "pre_deploy_in_progress",
    }
)
SUSPENSION_STATES = frozenset({"suspended", "not_suspended"})
MAX_STATE_CHECKS = 20
STATE_CHECK_DELAY_SECONDS = 5


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _validate_commit_sha(value: str) -> str:
    if len(value) != 40 or any(character not in "0123456789abcdef" for character in value):
        raise ProvisioningError("commit SHA must be 40 lowercase hexadecimal characters")
    return value


def _service_state(service: ServiceRef) -> str:
    state = service.raw.get("suspended")
    if state not in SUSPENSION_STATES:
        raise ProvisioningError(
            f"Render service {service.name} returned an unreviewed suspension state"
        )
    return str(state)


def _service_by_id(client: RenderClient, service: ServiceRef) -> ServiceRef:
    response = client.request("GET", f"/services/{service.id}")
    if not isinstance(response, dict):
        raise ProvisioningError(f"Render returned no state for {service.name}")
    current = client.service_ref(response)
    if (current.id, current.name, current.type) != (
        service.id,
        service.name,
        service.type,
    ):
        raise ProvisioningError(f"Render identity changed while managing {service.name}")
    return current


def _wait_for_state(
    client: RenderClient,
    service: ServiceRef,
    expected: str,
    *,
    sleep: Callable[[float], None] = time.sleep,
) -> None:
    for attempt in range(1, MAX_STATE_CHECKS + 1):
        if _service_state(_service_by_id(client, service)) == expected:
            return
        if attempt < MAX_STATE_CHECKS:
            sleep(STATE_CHECK_DELAY_SECONDS)
    raise ProvisioningError(
        f"Render service {service.name} did not reach {expected} within the bounded wait"
    )


def _require_no_active_deploy(client: RenderClient, service: ServiceRef) -> None:
    response = client.request(
        "GET", f"/services/{service.id}/deploys", query={"limit": 20}
    )
    for item in response or []:
        deploy = item.get("deploy", item) if isinstance(item, dict) else {}
        if isinstance(deploy, dict) and deploy.get("status") in ACTIVE_DEPLOY_STATUSES:
            raise ProvisioningError(
                f"Render service {service.name} has an active deploy and cannot be quiesced"
            )


def _write_new_receipt(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as output:
        json.dump(payload, output, indent=2, sort_keys=True)
        output.write("\n")


def _replace_receipt(path: Path, payload: Mapping[str, Any]) -> None:
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


def _load_receipt(path: Path, *, commit_sha: str, owner_id: str) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or payload.get("version") != 1:
        raise ProvisioningError("Render lifecycle receipt has an unsupported schema")
    if payload.get("commit_sha") != commit_sha or payload.get("owner_id") != owner_id:
        raise ProvisioningError("Render lifecycle receipt is not bound to this run")
    services = payload.get("services")
    if not isinstance(services, dict) or set(services) != {
        API_NAME,
        FRONTEND_NAME,
        MCP_NAME,
    }:
        raise ProvisioningError("Render lifecycle receipt has an incomplete service set")
    return payload


def _resolve_services(client: RenderClient, owner_id: str) -> dict[str, ServiceRef]:
    services: dict[str, ServiceRef] = {}
    for name, expected_type in QUIESCE_ORDER:
        service = client.find_service(owner_id, name, expected_type)
        if service is None:
            raise ProvisioningError(f"Required Render service {name} is missing")
        if service.raw.get("autoDeploy") not in (False, "no"):
            raise ProvisioningError(f"Render service {name} must have auto-deploy disabled")
        services[name] = service
    return services


def quiesce(
    client: RenderClient,
    *,
    owner_id: str,
    commit_sha: str,
    receipt_path: Path,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    services = _resolve_services(client, owner_id)
    for service in services.values():
        _require_no_active_deploy(client, service)

    payload: dict[str, Any] = {
        "version": 1,
        "owner_id": owner_id,
        "commit_sha": commit_sha,
        "created_at": _utc_now(),
        "phase": "quiescing",
        "services": {
            name: {
                "id": service.id,
                "name": service.name,
                "type": service.type,
                "initial_state": _service_state(service),
                "suspended_by_run": False,
                "resumed_by_run": False,
            }
            for name, service in services.items()
        },
    }
    _write_new_receipt(receipt_path, payload)

    for name, _ in QUIESCE_ORDER:
        service = services[name]
        record = payload["services"][name]
        if record["initial_state"] == "not_suspended":
            client.request("POST", f"/services/{service.id}/suspend")
            record["suspended_by_run"] = True
            _replace_receipt(receipt_path, payload)
        _wait_for_state(client, service, "suspended", sleep=sleep)

    payload["phase"] = "quiesced"
    payload["quiesced_at"] = _utc_now()
    _replace_receipt(receipt_path, payload)
    return payload


def resume_owned(
    client: RenderClient,
    *,
    owner_id: str,
    commit_sha: str,
    receipt_path: Path,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    payload = _load_receipt(receipt_path, commit_sha=commit_sha, owner_id=owner_id)
    services = _resolve_services(client, owner_id)
    payload["phase"] = "resuming"
    _replace_receipt(receipt_path, payload)

    for name, _ in RESUME_ORDER:
        service = services[name]
        record = payload["services"][name]
        if (record.get("id"), record.get("name"), record.get("type")) != (
            service.id,
            service.name,
            service.type,
        ):
            raise ProvisioningError(f"Render lifecycle receipt identity mismatch for {name}")
        if not record.get("suspended_by_run"):
            if _service_state(service) != "suspended":
                raise ProvisioningError(
                    f"Render service {name} changed from its pre-existing suspended state"
                )
            continue
        if _service_state(service) == "suspended":
            client.request("POST", f"/services/{service.id}/resume")
        _wait_for_state(client, service, "not_suspended", sleep=sleep)
        record["resumed_by_run"] = True
        _replace_receipt(receipt_path, payload)

    payload["phase"] = "resumed"
    payload["resumed_at"] = _utc_now()
    _replace_receipt(receipt_path, payload)
    return payload


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("quiesce", "resume-owned"))
    parser.add_argument("--owner-id", default=DEFAULT_OWNER_ID)
    parser.add_argument("--commit-sha", required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    return parser.parse_args(argv)


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        commit_sha = _validate_commit_sha(args.commit_sha)
        client = RenderClient(os.getenv("RENDER_API_KEY", ""))
        operation = quiesce if args.action == "quiesce" else resume_owned
        result = operation(
            client,
            owner_id=args.owner_id,
            commit_sha=commit_sha,
            receipt_path=args.receipt,
        )
        print(
            json.dumps(
                {
                    "phase": result["phase"],
                    "services": {
                        name: {
                            "initial_state": record["initial_state"],
                            "suspended_by_run": record["suspended_by_run"],
                            "resumed_by_run": record["resumed_by_run"],
                        }
                        for name, record in result["services"].items()
                    },
                },
                sort_keys=True,
            )
        )
        return 0
    except (json.JSONDecodeError, OSError, ProvisioningError, ValueError):
        print(
            "::error title=Render pilot lifecycle failure::"
            "The reviewed Render services could not reach the requested lifecycle state",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

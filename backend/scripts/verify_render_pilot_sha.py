#!/usr/bin/env python3
"""Fail closed unless every reviewed Render pilot service is live on one SHA."""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime
from typing import Any

try:
    from scripts.provision_render_pilot import (
        API_NAME,
        DEFAULT_OWNER_ID,
        FRONTEND_NAME,
        MCP_NAME,
        ProvisioningError,
        RenderClient,
    )
except ModuleNotFoundError:  # Direct execution adds backend/scripts to sys.path.
    from provision_render_pilot import (  # type: ignore[no-redef]
        API_NAME,
        DEFAULT_OWNER_ID,
        FRONTEND_NAME,
        MCP_NAME,
        ProvisioningError,
        RenderClient,
    )


SHA_RE = re.compile(r"^[0-9a-f]{40}$")
SERVICE_TYPES = {
    API_NAME: "web_service",
    FRONTEND_NAME: "static_site",
    MCP_NAME: "web_service",
}


def _parse_created_at(value: object) -> datetime:
    if not isinstance(value, str) or not value:
        raise ProvisioningError("Render deployment is missing createdAt")
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ProvisioningError("Render deployment has invalid createdAt") from exc


def select_latest_deploy(rows: object) -> dict[str, Any]:
    if not isinstance(rows, list) or not rows:
        raise ProvisioningError("Render service has no deployments")
    deploys: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            raise ProvisioningError("Render deployment response is malformed")
        deploy = row.get("deploy", row)
        if not isinstance(deploy, dict):
            raise ProvisioningError("Render deployment response is malformed")
        _parse_created_at(deploy.get("createdAt"))
        deploys.append(deploy)
    return max(deploys, key=lambda deploy: _parse_created_at(deploy.get("createdAt")))


def verify(client: RenderClient, owner_id: str, commit_sha: str) -> dict[str, Any]:
    if not SHA_RE.fullmatch(commit_sha):
        raise ProvisioningError("reviewed Render SHA must be 40 lowercase hexadecimal characters")

    evidence: dict[str, Any] = {
        "provider": "render", "commit_sha": commit_sha, "services": {}
    }
    for name, service_type in SERVICE_TYPES.items():
        service = client.find_service(owner_id, name, service_type)
        if service is None:
            raise ProvisioningError(f"reviewed Render service is missing: {name}")
        rows = client.request(
            "GET", f"/services/{service.id}/deploys", query={"limit": 20}
        )
        try:
            deploy = select_latest_deploy(rows)
        except ProvisioningError as exc:
            raise ProvisioningError(f"{name}: {exc}") from exc
        deployed_sha = (deploy.get("commit") or {}).get("id") if isinstance(deploy, dict) else None
        deploy_id = deploy.get("id")
        if not isinstance(deploy_id, str) or not deploy_id.strip():
            raise ProvisioningError(f"{name}: latest deployment has no immutable ID")
        if deploy.get("status") != "live" or deployed_sha != commit_sha:
            raise ProvisioningError(
                f"{name} is not live on reviewed SHA {commit_sha}; "
                f"status={deploy.get('status')!r} commit={deployed_sha!r}"
            )
        evidence["services"][name] = {
            "service_id": service.id,
            "deploy_id": deploy_id,
            "status": "live",
            "commit_sha": deployed_sha,
            "url": service.url,
        }
    return evidence


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit-sha", required=True)
    parser.add_argument("--owner-id", default=os.getenv("RENDER_OWNER_ID", DEFAULT_OWNER_ID))
    args = parser.parse_args()
    client = RenderClient(os.getenv("RENDER_API_KEY", ""))
    print(json.dumps(verify(client, args.owner_id, args.commit_sha), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

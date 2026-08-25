#!/usr/bin/env python3
"""Fail closed unless every reviewed Render pilot service is live on one SHA."""

from __future__ import annotations

import argparse
import json
import os
import re
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
            "GET", f"/services/{service.id}/deploys", query={"limit": 1}
        )
        if not isinstance(rows, list) or len(rows) != 1:
            raise ProvisioningError(f"{name} has no unambiguous current deployment")
        deploy = rows[0].get("deploy", rows[0]) if isinstance(rows[0], dict) else {}
        deployed_sha = (deploy.get("commit") or {}).get("id") if isinstance(deploy, dict) else None
        if deploy.get("status") != "live" or deployed_sha != commit_sha:
            raise ProvisioningError(
                f"{name} is not live on reviewed SHA {commit_sha}; "
                f"status={deploy.get('status')!r} commit={deployed_sha!r}"
            )
        evidence["services"][name] = {
            "service_id": service.id,
            "deploy_id": deploy.get("id"),
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

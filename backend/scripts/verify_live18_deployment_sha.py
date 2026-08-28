#!/usr/bin/env python3
"""Verify one public Live18 deployment provider against an exact Git SHA."""

from __future__ import annotations

import argparse
from collections.abc import Callable
import ipaddress
import json
import re
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


SHA_RE = re.compile(r"^[0-9a-f]{40}$")
DEPLOYMENT_ID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)
PROVIDERS = ("render", "railway")
MAX_RESPONSE_BYTES = 64 * 1024
PUBLIC_FETCH_TIMEOUT_SECONDS = 45
Fetch = Callable[[str], bytes]


class Live18DeploymentVerificationError(RuntimeError):
    """The public deployment does not match the reviewed Live18 boundary."""


def _origin(value: str, label: str) -> str:
    parsed = urlparse(value)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in ("", "/")
        or parsed.params
        or parsed.query
        or parsed.fragment
    ):
        raise Live18DeploymentVerificationError(
            f"{label} must be an HTTPS origin without credentials, path, query, or fragment"
        )
    try:
        port = parsed.port
    except ValueError as exc:
        raise Live18DeploymentVerificationError(
            f"{label} contains an invalid port"
        ) from exc
    host = parsed.hostname.lower()
    try:
        loopback = ipaddress.ip_address(host).is_loopback
    except ValueError:
        loopback = host == "localhost" or host.endswith(".localhost")
    if loopback:
        raise Live18DeploymentVerificationError(
            f"{label} must not use a local or loopback host"
        )
    authority = f"{host}:{port}" if port is not None else host
    return f"https://{authority}"


def _public_fetch(url: str) -> bytes:
    request = Request(url, headers={"Accept": "application/json, text/plain"})
    try:
        with urlopen(
            request, timeout=PUBLIC_FETCH_TIMEOUT_SECONDS
        ) as response:  # noqa: S310 - HTTPS is enforced.
            status = getattr(response, "status", None)
            if status != 200:
                raise Live18DeploymentVerificationError(
                    f"deployment metadata request returned HTTP {status}: {url}"
                )
            payload = response.read(MAX_RESPONSE_BYTES + 1)
    except Live18DeploymentVerificationError:
        raise
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        raise Live18DeploymentVerificationError(
            f"deployment metadata request failed: {url}"
        ) from exc
    if len(payload) > MAX_RESPONSE_BYTES:
        raise Live18DeploymentVerificationError(
            f"deployment metadata response exceeds {MAX_RESPONSE_BYTES} bytes: {url}"
        )
    return payload


def _json_object(fetch: Fetch, url: str, label: str) -> dict[str, Any]:
    try:
        value = json.loads(fetch(url).decode("utf-8"))
    except Live18DeploymentVerificationError:
        raise
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise Live18DeploymentVerificationError(
            f"{label} did not return valid UTF-8 JSON"
        ) from exc
    if not isinstance(value, dict):
        raise Live18DeploymentVerificationError(
            f"{label} must return one JSON object"
        )
    return value


def _require_status(
    value: dict[str, Any],
    *,
    label: str,
    expected_status: str,
    expected_sha: str | None = None,
) -> None:
    if value.get("status") != expected_status:
        raise Live18DeploymentVerificationError(
            f"{label} did not report status {expected_status!r}"
        )
    if expected_sha is not None and value.get("git_commit") != expected_sha:
        raise Live18DeploymentVerificationError(
            f"{label} does not publish reviewed SHA {expected_sha}"
        )


def verify_provenance(
    *,
    provider: str,
    commit_sha: str,
    frontend_origin: str,
    api_origin: str,
    mcp_origin: str,
    deployment_ids: dict[str, str] | None = None,
    fetch: Fetch = _public_fetch,
) -> dict[str, Any]:
    """Prove the public services are live on one SHA without requiring DB access."""

    if provider not in PROVIDERS:
        raise Live18DeploymentVerificationError(
            "Live18 deployment provider must be render or railway"
        )
    if SHA_RE.fullmatch(commit_sha) is None:
        raise Live18DeploymentVerificationError(
            "reviewed Live18 SHA must be 40 lowercase hexadecimal characters"
        )

    frontend = _origin(frontend_origin, "frontend origin")
    api = _origin(api_origin, "API origin")
    mcp = _origin(mcp_origin, "MCP origin")
    if len({frontend, api, mcp}) != 3:
        raise Live18DeploymentVerificationError(
            "frontend, API, and MCP must use three distinct HTTPS origins"
        )
    normalized_deployment_ids: dict[str, str] | None = None
    if deployment_ids is not None:
        if (
            provider != "railway"
            or set(deployment_ids) != {"api", "frontend", "mcp"}
            or any(
                not isinstance(value, str)
                or DEPLOYMENT_ID_RE.fullmatch(value) is None
                for value in deployment_ids.values()
            )
        ):
            raise Live18DeploymentVerificationError(
                "Railway deployment identities must contain three exact UUIDs"
            )
        normalized_deployment_ids = dict(deployment_ids)

    # Render's static-site rewrite intentionally serves the SPA document for
    # unknown paths, including /health. The versioned metadata resource is the
    # frontend's public liveness and exact-build boundary on both providers.
    frontend_metadata = _json_object(
        fetch, f"{frontend}/build-metadata.json", "frontend build metadata"
    )
    if (
        frontend_metadata.get("service") != "aasopharma-erp"
        or frontend_metadata.get("git_commit") != commit_sha
    ):
        raise Live18DeploymentVerificationError(
            f"frontend build metadata does not publish reviewed SHA {commit_sha}"
        )

    api_health = _json_object(fetch, f"{api}/health", "API health")
    _require_status(
        api_health,
        label="API health",
        expected_status="healthy",
        expected_sha=commit_sha,
    )

    mcp_health = _json_object(fetch, f"{mcp}/health", "MCP health")
    _require_status(
        mcp_health,
        label="MCP health",
        expected_status="ok",
        expected_sha=commit_sha,
    )
    services = {
        "api": {
            "origin": api,
            "health": {"status": "healthy", "git_commit": commit_sha},
        },
        "frontend": {
            "origin": frontend,
            "health": "ok",
            "build_metadata": {
                "service": "aasopharma-erp",
                "git_commit": commit_sha,
            },
        },
        "mcp": {
            "origin": mcp,
            "health": {"status": "ok", "git_commit": commit_sha},
        },
    }
    if normalized_deployment_ids is not None:
        for name, deployment_id in normalized_deployment_ids.items():
            services[name]["deployment_id"] = deployment_id
    return {
        "schema": "aasopharma.deployment-provenance.v1",
        "provider": provider,
        "commit_sha": commit_sha,
        "services": services,
    }


def verify(
    *,
    provider: str,
    commit_sha: str,
    frontend_origin: str,
    api_origin: str,
    mcp_origin: str,
    deployment_ids: dict[str, str] | None = None,
    fetch: Fetch = _public_fetch,
) -> dict[str, Any]:
    """Return deterministic public evidence or fail on any service mismatch."""

    provenance = verify_provenance(
        provider=provider,
        commit_sha=commit_sha,
        frontend_origin=frontend_origin,
        api_origin=api_origin,
        mcp_origin=mcp_origin,
        deployment_ids=deployment_ids,
        fetch=fetch,
    )
    api = provenance["services"]["api"]["origin"]
    mcp = provenance["services"]["mcp"]["origin"]
    api_ready = _json_object(fetch, f"{api}/ready", "API readiness")
    mcp_ready = _json_object(fetch, f"{mcp}/ready", "MCP readiness")
    _require_status(api_ready, label="API readiness", expected_status="ready")
    _require_status(mcp_ready, label="MCP readiness", expected_status="ready")

    return {
        "schema": "aasopharma.live18.deployment-evidence.v1",
        "provider": provider,
        "commit_sha": commit_sha,
        "services": {
            "api": {
                **provenance["services"]["api"],
                "readiness": {"status": "ready"},
            },
            "frontend": provenance["services"]["frontend"],
            "mcp": {
                **provenance["services"]["mcp"],
                "readiness": {"status": "ready"},
            },
        },
    }


def serialize_evidence(evidence: dict[str, Any]) -> str:
    """Serialize evidence reproducibly for hashing and artifact comparison."""

    return json.dumps(evidence, indent=2, sort_keys=True) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", required=True, choices=PROVIDERS)
    parser.add_argument("--commit-sha", required=True)
    parser.add_argument("--frontend-origin", required=True)
    parser.add_argument("--api-origin", required=True)
    parser.add_argument("--mcp-origin", required=True)
    parser.add_argument("--api-deployment-id")
    parser.add_argument("--frontend-deployment-id")
    parser.add_argument("--mcp-deployment-id")
    parser.add_argument(
        "--provenance-only",
        action="store_true",
        help="Verify exact public service builds without claiming readiness",
    )
    args = parser.parse_args()
    raw_deployment_ids = {
        "api": args.api_deployment_id,
        "frontend": args.frontend_deployment_id,
        "mcp": args.mcp_deployment_id,
    }
    supplied_deployment_ids = {
        name: value
        for name, value in raw_deployment_ids.items()
        if value is not None
    }
    deployment_ids = supplied_deployment_ids or None
    if deployment_ids is not None and len(deployment_ids) != 3:
        parser.error("all three Railway deployment IDs must be supplied together")
    verifier = verify_provenance if args.provenance_only else verify
    evidence = verifier(
        provider=args.provider,
        commit_sha=args.commit_sha,
        frontend_origin=args.frontend_origin,
        api_origin=args.api_origin,
        mcp_origin=args.mcp_origin,
        deployment_ids=deployment_ids,
    )
    print(serialize_evidence(evidence), end="")


if __name__ == "__main__":
    main()

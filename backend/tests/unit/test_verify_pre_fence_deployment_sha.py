from __future__ import annotations

import json

import pytest

from scripts.verify_live18_deployment_sha import (
    Live18DeploymentVerificationError,
    serialize_evidence,
    verify_provenance,
)


SHA = "a" * 40
ORIGINS = {
    "frontend_origin": "https://erp.example",
    "api_origin": "https://api.example",
    "mcp_origin": "https://mcp.example",
}


def _responses(sha: str = SHA) -> dict[str, bytes]:
    return {
        "https://erp.example/build-metadata.json": json.dumps(
            {"service": "aasopharma-erp", "git_commit": sha}
        ).encode(),
        "https://api.example/health": json.dumps(
            {"status": "healthy", "git_commit": sha}
        ).encode(),
        "https://mcp.example/health": json.dumps(
            {"status": "ok", "git_commit": sha}
        ).encode(),
    }


def _fetch(responses: dict[str, bytes]):
    def fetch(url: str) -> bytes:
        try:
            return responses[url]
        except KeyError as exc:
            raise AssertionError(f"unexpected URL: {url}") from exc

    return fetch


@pytest.mark.parametrize("provider", ["render", "railway"])
def test_provenance_requires_only_public_exact_sha_health(provider):
    evidence = verify_provenance(
        provider=provider,
        commit_sha=SHA,
        fetch=_fetch(_responses()),
        **ORIGINS,
    )

    assert evidence == {
        "schema": "aasopharma.deployment-provenance.v1",
        "provider": provider,
        "commit_sha": SHA,
        "services": {
            "api": {
                "origin": "https://api.example",
                "health": {"status": "healthy", "git_commit": SHA},
            },
            "frontend": {
                "origin": "https://erp.example",
                "health": "ok",
                "build_metadata": {
                    "service": "aasopharma-erp",
                    "git_commit": SHA,
                },
            },
            "mcp": {
                "origin": "https://mcp.example",
                "health": {"status": "ok", "git_commit": SHA},
            },
        },
    }
    serialized = serialize_evidence(evidence)
    assert serialize_evidence(json.loads(serialized)) == serialized


@pytest.mark.parametrize(
    ("url", "payload", "message"),
    [
        (
            "https://erp.example/build-metadata.json",
            b'{"service":"aasopharma-erp","git_commit":"wrong"}',
            "frontend build metadata",
        ),
        (
            "https://api.example/health",
            b'{"status":"healthy","git_commit":"wrong"}',
            "API health",
        ),
        (
            "https://mcp.example/health",
            b'{"status":"ok","git_commit":"wrong"}',
            "MCP health",
        ),
    ],
)
def test_provenance_fails_closed_on_any_service_mismatch(url, payload, message):
    responses = _responses()
    responses[url] = payload
    with pytest.raises(Live18DeploymentVerificationError, match=message):
        verify_provenance(
            provider="render",
            commit_sha=SHA,
            fetch=_fetch(responses),
            **ORIGINS,
        )

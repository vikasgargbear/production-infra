from __future__ import annotations

import json

import pytest

from scripts.verify_live18_deployment_sha import (
    Live18DeploymentVerificationError,
    serialize_evidence,
    verify,
)


SHA = "a" * 40
ORIGINS = {
    "frontend_origin": "https://erp.example",
    "api_origin": "https://api.example",
    "mcp_origin": "https://mcp.example",
}


def _responses(sha: str = SHA) -> dict[str, bytes]:
    return {
        "https://erp.example/health": b"ok\n",
        "https://erp.example/build-metadata.json": json.dumps(
            {"service": "aasopharma-erp", "git_commit": sha}
        ).encode(),
        "https://api.example/health": json.dumps(
            {"status": "healthy", "git_commit": sha}
        ).encode(),
        "https://api.example/ready": b'{"status":"ready"}',
        "https://mcp.example/health": json.dumps(
            {"status": "ok", "git_commit": sha}
        ).encode(),
        "https://mcp.example/ready": b'{"status":"ready"}',
    }


def _fetch(responses: dict[str, bytes]):
    def fetch(url: str) -> bytes:
        try:
            return responses[url]
        except KeyError as exc:
            raise AssertionError(f"unexpected URL: {url}") from exc

    return fetch


@pytest.mark.parametrize("provider", ["render", "railway"])
def test_all_public_services_publish_one_exact_sha(provider):
    evidence = verify(
        provider=provider,
        commit_sha=SHA,
        fetch=_fetch(_responses()),
        **ORIGINS,
    )

    assert evidence == {
        "schema": "aasopharma.live18.deployment-evidence.v1",
        "provider": provider,
        "commit_sha": SHA,
        "services": {
            "api": {
                "origin": "https://api.example",
                "health": {"status": "healthy", "git_commit": SHA},
                "readiness": {"status": "ready"},
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
                "readiness": {"status": "ready"},
            },
        },
    }
    serialized = serialize_evidence(evidence)
    assert serialized.endswith("\n")
    assert serialized.index('"commit_sha"') < serialized.index('"provider"')
    assert serialized.index('"provider"') < serialized.index('"schema"')
    assert serialize_evidence(json.loads(serialized)) == serialized


@pytest.mark.parametrize("provider", ["", "fly", "Railway"])
def test_provider_is_closed_to_render_or_railway(provider):
    with pytest.raises(Live18DeploymentVerificationError, match="render or railway"):
        verify(
            provider=provider,
            commit_sha=SHA,
            fetch=_fetch(_responses()),
            **ORIGINS,
        )


@pytest.mark.parametrize("sha", ["a" * 39, "A" * 40, "not-a-sha"])
def test_reviewed_sha_must_be_full_lowercase_hex(sha):
    with pytest.raises(Live18DeploymentVerificationError, match="40 lowercase"):
        verify(
            provider="railway",
            commit_sha=sha,
            fetch=_fetch(_responses()),
            **ORIGINS,
        )


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("frontend_origin", "http://erp.example"),
        ("api_origin", "https://user:secret@api.example"),
        ("mcp_origin", "https://mcp.example/mcp"),
        ("api_origin", "https://api.example?mode=test"),
        ("frontend_origin", "https://erp.example/#app"),
    ],
)
def test_service_urls_must_be_https_origins(field, value):
    origins = {**ORIGINS, field: value}
    with pytest.raises(Live18DeploymentVerificationError, match="HTTPS origin"):
        verify(
            provider="render",
            commit_sha=SHA,
            fetch=_fetch(_responses()),
            **origins,
        )


@pytest.mark.parametrize(
    "origin", ["https://localhost", "https://127.0.0.1", "https://[::1]"]
)
def test_local_and_loopback_origins_are_rejected(origin):
    with pytest.raises(Live18DeploymentVerificationError, match="local or loopback"):
        verify(
            provider="railway",
            commit_sha=SHA,
            frontend_origin=origin,
            api_origin=ORIGINS["api_origin"],
            mcp_origin=ORIGINS["mcp_origin"],
            fetch=_fetch(_responses()),
        )


def test_trailing_origin_slash_is_normalized_deterministically():
    origins = {key: f"{value}/" for key, value in ORIGINS.items()}
    evidence = verify(
        provider="render",
        commit_sha=SHA,
        fetch=_fetch(_responses()),
        **origins,
    )
    assert [row["origin"] for row in evidence["services"].values()] == [
        "https://api.example",
        "https://erp.example",
        "https://mcp.example",
    ]


def test_three_service_roles_require_distinct_origins():
    with pytest.raises(Live18DeploymentVerificationError, match="three distinct"):
        verify(
            provider="render",
            commit_sha=SHA,
            frontend_origin=ORIGINS["api_origin"],
            api_origin=ORIGINS["api_origin"],
            mcp_origin=ORIGINS["mcp_origin"],
            fetch=_fetch(_responses()),
        )


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
        (
            "https://api.example/ready",
            b'{"status":"not_ready"}',
            "API readiness",
        ),
        (
            "https://mcp.example/ready",
            b'{"status":"not_ready"}',
            "MCP readiness",
        ),
    ],
)
def test_any_sha_or_readiness_mismatch_fails_closed(url, payload, message):
    responses = _responses()
    responses[url] = payload
    with pytest.raises(Live18DeploymentVerificationError, match=message):
        verify(
            provider="railway",
            commit_sha=SHA,
            fetch=_fetch(responses),
            **ORIGINS,
        )


@pytest.mark.parametrize(
    ("url", "payload", "message"),
    [
        ("https://erp.example/health", b"healthy", "exact text 'ok'"),
        ("https://api.example/health", b"not-json", "valid UTF-8 JSON"),
        ("https://mcp.example/ready", b"[]", "one JSON object"),
    ],
)
def test_malformed_public_metadata_fails_closed(url, payload, message):
    responses = _responses()
    responses[url] = payload
    with pytest.raises(Live18DeploymentVerificationError, match=message):
        verify(
            provider="railway",
            commit_sha=SHA,
            fetch=_fetch(responses),
            **ORIGINS,
        )

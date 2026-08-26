from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import httpx
import pytest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend/scripts/verify_canonical_evidence_storage.py"
SPEC = importlib.util.spec_from_file_location(
    "verify_canonical_evidence_storage", SCRIPT
)
verify = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = verify
SPEC.loader.exec_module(verify)


def _transport(*, update_status: int = 403):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        path = request.url.path
        if request.method == "POST" and "/object/list/" in path:
            return httpx.Response(200, json=[])
        if "outside-reviewed-path" in path:
            return httpx.Response(403)
        if "canonical-evidence-unreviewed" in path:
            return httpx.Response(404)
        if request.method == "POST":
            return httpx.Response(201)
        if request.method == "GET":
            return httpx.Response(200, content=verify.FIXTURE)
        if request.method == "PUT":
            return httpx.Response(update_status)
        if request.method == "DELETE":
            return httpx.Response(204)
        raise AssertionError((request.method, path))

    return httpx.MockTransport(handler), requests


class TokenProvider:
    def authorization_headers(self):
        return {
            "apikey": "sb_publishable_" + "a" * 32,
            "Authorization": "Bearer verified-service-user-token",
        }


def test_canary_proves_allowed_and_denied_operations_with_service_user():
    transport, requests = _transport()

    result = verify.verify_canary(
        project_ref="canonicalcanonical12",
        token_provider=TokenProvider(),
        transport=transport,
    )

    assert result == {
        "state": "verified",
        "allowed": {"upload": "201", "read": "200", "delete": "204"},
        "denied": {
            "list_result_count": 0,
            "update": "403",
            "invalid_path": "403",
            "cross_bucket": "404",
        },
    }
    assert all(request.headers.get("apikey") for request in requests)
    assert all(
        request.headers.get("authorization") == "Bearer verified-service-user-token"
        for request in requests
    )


def test_canary_fails_if_update_authority_is_broader_than_reviewed():
    transport, _ = _transport(update_status=200)

    with pytest.raises(verify.EvidenceCanaryError, match="can update"):
        verify.verify_canary(
            project_ref="canonicalcanonical12",
            token_provider=TokenProvider(),
            transport=transport,
        )

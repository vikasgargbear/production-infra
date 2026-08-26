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


def _transport(*, update_status: int = 403, initially_present: bool = False):
    requests: list[httpx.Request] = []
    state = {"present": initially_present}

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
            state["present"] = True
            return httpx.Response(201)
        if request.method == "GET":
            return (
                httpx.Response(200, content=verify.FIXTURE)
                if state["present"]
                else httpx.Response(404)
            )
        if request.method == "PUT":
            return httpx.Response(update_status)
        if request.method == "DELETE":
            state["present"] = False
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
        "recovered_preexisting_object": False,
        "cleanup_absence_verified": True,
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
    assert requests[0].method == "GET"
    assert requests[-1].method == "GET"


def test_canary_recovers_and_attests_a_prior_exact_canary_object():
    transport, requests = _transport(initially_present=True)

    result = verify.verify_canary(
        project_ref="canonicalcanonical12",
        token_provider=TokenProvider(),
        transport=transport,
        cleanup_sleep=lambda _seconds: None,
    )

    assert result["recovered_preexisting_object"] is True
    assert result["cleanup_absence_verified"] is True
    assert [request.method for request in requests[:3]] == ["GET", "DELETE", "GET"]


def test_canary_fails_if_update_authority_is_broader_than_reviewed():
    transport, _ = _transport(update_status=200)

    with pytest.raises(verify.EvidenceCanaryError, match="can update"):
        verify.verify_canary(
            project_ref="canonicalcanonical12",
            token_provider=TokenProvider(),
            transport=transport,
            cleanup_sleep=lambda _seconds: None,
        )


def test_canary_cleans_an_upload_whose_success_response_was_lost():
    present = False
    delete_attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal delete_attempts, present
        if request.method == "GET":
            return httpx.Response(200) if present else httpx.Response(404)
        if request.method == "POST":
            present = True
            raise httpx.ReadTimeout("response lost", request=request)
        if request.method == "DELETE":
            delete_attempts += 1
            present = False
            return httpx.Response(204)
        raise AssertionError(request.method)

    with pytest.raises(httpx.ReadTimeout, match="response lost"):
        verify.verify_canary(
            project_ref="canonicalcanonical12",
            token_provider=TokenProvider(),
            transport=httpx.MockTransport(handler),
            cleanup_sleep=lambda _seconds: None,
        )

    assert present is False
    assert delete_attempts == 1


def test_canary_failure_refuses_to_hide_unattested_cleanup():
    delete_attempts = 0
    present = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal delete_attempts, present
        path = request.url.path
        if request.method == "POST" and "/object/list/" in path:
            return httpx.Response(200, json=[])
        if "outside-reviewed-path" in path:
            return httpx.Response(403)
        if "canonical-evidence-unreviewed" in path:
            return httpx.Response(404)
        if request.method == "POST":
            present = True
            return httpx.Response(201)
        if request.method == "GET":
            return (
                httpx.Response(200, content=verify.FIXTURE)
                if present
                else httpx.Response(404)
            )
        if request.method == "PUT":
            return httpx.Response(200)
        if request.method == "DELETE":
            delete_attempts += 1
            return httpx.Response(503)
        raise AssertionError((request.method, path))

    with pytest.raises(
        verify.EvidenceCanaryError,
        match="cleanup could not prove exact-key absence",
    ):
        verify.verify_canary(
            project_ref="canonicalcanonical12",
            token_provider=TokenProvider(),
            transport=httpx.MockTransport(handler),
            cleanup_sleep=lambda _seconds: None,
        )

    assert delete_attempts == 3

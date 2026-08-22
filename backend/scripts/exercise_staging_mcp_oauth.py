#!/usr/bin/env python3
"""Exercise denial, PKCE approval, token exchange, and one live MCP read."""

from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import sys
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import jwt
import requests


PROJECT_REF = "rgihahbmkrmhitjdjvev"
SUPABASE_URL = f"https://{PROJECT_REF}.supabase.co"
ISSUER = f"{SUPABASE_URL}/auth/v1"
MCP_URL = "https://aasopharma-mcp-pilot.onrender.com/mcp"
CALLBACK_URL = "https://aasopharma-erp-pilot.onrender.com/oauth/staging-callback"
SCOPES = "openid offline_access"


class ExerciseError(RuntimeError):
    pass


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ExerciseError(f"{name} is required")
    return value


def _pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return verifier, challenge


def _authorization_id(location: str) -> str:
    values = parse_qs(urlparse(location).query).get("authorization_id", [])
    if len(values) != 1 or not values[0]:
        raise ExerciseError("Authorization redirect omitted one authorization_id")
    return values[0]


def _start_authorization(
    session: requests.Session,
    *,
    client_id: str,
    challenge: str,
    state: str,
) -> str:
    response = session.get(
        f"{ISSUER}/oauth/authorize",
        params={
            "client_id": client_id,
            "redirect_uri": CALLBACK_URL,
            "response_type": "code",
            "scope": SCOPES,
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "resource": MCP_URL,
            "prompt": "consent",
        },
        allow_redirects=False,
        timeout=20,
    )
    if response.status_code not in (302, 303, 307, 308):
        raise ExerciseError(
            f"Authorization start returned HTTP {response.status_code}: {response.text[:500]}"
        )
    return _authorization_id(response.headers.get("Location", ""))


def _authorization_details(
    session: requests.Session,
    authorization_id: str,
    access_token: str,
) -> dict[str, Any]:
    response = session.get(
        f"{ISSUER}/oauth/authorizations/{authorization_id}",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=20,
    )
    if not response.ok:
        raise ExerciseError(
            f"Authorization details returned HTTP {response.status_code}: {response.text[:500]}"
        )
    details = response.json()
    if not isinstance(details, dict) or "authorization_id" not in details:
        raise ExerciseError("Authorization details did not require explicit consent")
    return details


def _decide(
    session: requests.Session,
    authorization_id: str,
    access_token: str,
    action: str,
) -> str:
    response = session.post(
        f"{ISSUER}/oauth/authorizations/{authorization_id}/consent",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"action": action},
        timeout=20,
    )
    if not response.ok:
        raise ExerciseError(
            f"OAuth {action} returned HTTP {response.status_code}: {response.text[:500]}"
        )
    location = response.json().get("redirect_url")
    if not isinstance(location, str) or not location:
        raise ExerciseError(f"OAuth {action} omitted redirect_url")
    return location


def _assert_denial_redirect(location: str, state: str) -> None:
    parsed = urlparse(location)
    query = parse_qs(parsed.query)
    if f"{parsed.scheme}://{parsed.netloc}{parsed.path}" != CALLBACK_URL:
        raise ExerciseError("OAuth denial returned an unregistered callback")
    if query.get("error") != ["access_denied"] or query.get("state") != [state]:
        raise ExerciseError("OAuth denial did not preserve access_denied and state")
    if "code" in query:
        raise ExerciseError("OAuth denial unexpectedly returned an authorization code")


def _exchange_token(
    session: requests.Session,
    *,
    client_id: str,
    verifier: str,
    redirect_url: str,
) -> dict[str, Any]:
    query = parse_qs(urlparse(redirect_url).query)
    codes = query.get("code", [])
    if len(codes) != 1 or not codes[0]:
        raise ExerciseError("OAuth approval callback omitted one authorization code")
    response = session.post(
        f"{ISSUER}/oauth/token",
        data={
            "grant_type": "authorization_code",
            "client_id": client_id,
            "code": codes[0],
            "redirect_uri": CALLBACK_URL,
            "code_verifier": verifier,
            "resource": MCP_URL,
        },
        timeout=20,
    )
    if not response.ok:
        raise ExerciseError(
            f"OAuth token exchange returned HTTP {response.status_code}: {response.text[:500]}"
        )
    token = response.json()
    if not isinstance(token.get("access_token"), str) or not isinstance(
        token.get("refresh_token"), str
    ):
        raise ExerciseError("OAuth token exchange omitted access or refresh token")
    return token


def _jsonrpc_response(response: requests.Response) -> dict[str, Any]:
    if not response.ok:
        raise ExerciseError(
            f"MCP request returned HTTP {response.status_code}: {response.text[:500]}"
        )
    if "text/event-stream" in response.headers.get("content-type", ""):
        data_lines = [
            line[6:]
            for line in response.text.splitlines()
            if line.startswith("data: ")
        ]
        if len(data_lines) != 1:
            raise ExerciseError("MCP event-stream response did not contain one data event")
        body = json.loads(data_lines[0])
    else:
        body = response.json()
    if not isinstance(body, dict) or body.get("jsonrpc") != "2.0":
        raise ExerciseError("MCP response is not JSON-RPC 2.0")
    if "error" in body:
        raise ExerciseError(f"MCP JSON-RPC error: {body['error']}")
    return body


def _exercise_mcp(access_token: str) -> tuple[list[str], dict[str, Any]]:
    session = requests.Session()
    session.headers.update(
        {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json, text/event-stream",
            "Content-Type": "application/json",
        }
    )
    initialized = _jsonrpc_response(
        session.post(
            MCP_URL,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-06-18",
                    "capabilities": {},
                    "clientInfo": {"name": "canonical-staging-e2e", "version": "1"},
                },
            },
            timeout=30,
        )
    )
    session_id = initialized.get("result", {}).get("sessionId")
    if isinstance(session_id, str) and session_id:
        session.headers["Mcp-Session-Id"] = session_id
    session.post(
        MCP_URL,
        json={"jsonrpc": "2.0", "method": "notifications/initialized"},
        timeout=30,
    ).raise_for_status()
    listed = _jsonrpc_response(
        session.post(
            MCP_URL,
            json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
            timeout=30,
        )
    )
    tools = listed.get("result", {}).get("tools", [])
    names = sorted(tool.get("name") for tool in tools if isinstance(tool, dict))
    expected = ["erp_gst_settings_get", "erp_product_search", "erp_supplier_search"]
    if names != expected:
        raise ExerciseError(f"Live MCP registry drifted: {names}")
    called = _jsonrpc_response(
        session.post(
            MCP_URL,
            json={
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {
                    "name": "erp_product_search",
                    "arguments": {"q": "demo", "limit": 20, "offset": 0},
                },
            },
            timeout=30,
        )
    )
    result = called.get("result")
    if not isinstance(result, dict) or result.get("isError") is True:
        raise ExerciseError("Live product-search tool returned an error")
    if "d3000000-0000-7000-8000-000000000015" not in json.dumps(result):
        raise ExerciseError("Live product-search tool did not return the canonical demo product")
    return names, result


def main() -> int:
    if _required("CANONICAL_STAGING_PROJECT_REF") != PROJECT_REF:
        raise ExerciseError("Refusing OAuth exercise outside the reviewed staging project")
    if _required("SUPABASE_URL") != SUPABASE_URL:
        raise ExerciseError("SUPABASE_URL does not match the reviewed staging project")
    client_id = _required("MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS")
    email = _required("CANONICAL_STAGING_MCP_TEST_EMAIL")
    password = _required("CANONICAL_STAGING_MCP_TEST_PASSWORD")
    anon_key = _required("SUPABASE_ANON_KEY")
    session = requests.Session()
    session.headers.update({"apikey": anon_key})
    login = session.post(
        f"{ISSUER}/token",
        params={"grant_type": "password"},
        json={"email": email, "password": password},
        timeout=20,
    )
    if not login.ok:
        raise ExerciseError(
            f"Staging test login returned HTTP {login.status_code}: {login.text[:500]}"
        )
    user_access_token = login.json().get("access_token")
    if not isinstance(user_access_token, str) or not user_access_token:
        raise ExerciseError("Staging test login omitted access_token")

    _, denial_challenge = _pkce()
    denial_state = secrets.token_urlsafe(24)
    denial_id = _start_authorization(
        session, client_id=client_id, challenge=denial_challenge, state=denial_state
    )
    _authorization_details(session, denial_id, user_access_token)
    _assert_denial_redirect(
        _decide(session, denial_id, user_access_token, "deny"), denial_state
    )

    verifier, approval_challenge = _pkce()
    approval_state = secrets.token_urlsafe(24)
    approval_id = _start_authorization(
        session, client_id=client_id, challenge=approval_challenge, state=approval_state
    )
    _authorization_details(session, approval_id, user_access_token)
    approved_redirect = _decide(session, approval_id, user_access_token, "approve")
    if parse_qs(urlparse(approved_redirect).query).get("state") != [approval_state]:
        raise ExerciseError("OAuth approval did not preserve state")
    token = _exchange_token(
        session,
        client_id=client_id,
        verifier=verifier,
        redirect_url=approved_redirect,
    )
    claims = jwt.decode(token["access_token"], options={"verify_signature": False})
    if claims.get("iss") != ISSUER or claims.get("client_id") != client_id:
        raise ExerciseError("OAuth access token issuer or client_id drifted")
    if claims.get("aud") != "authenticated":
        raise ExerciseError("Staging OAuth access token audience drifted")
    scopes = set(str(claims.get("scope", "")).split())
    if not {"openid", "offline_access"}.issubset(scopes):
        raise ExerciseError("OAuth access token omitted required scopes")

    ready = requests.get(MCP_URL.removesuffix("/mcp") + "/ready", timeout=30)
    if ready.status_code != 200:
        raise ExerciseError(f"MCP readiness remained HTTP {ready.status_code}")
    tool_names, _ = _exercise_mcp(token["access_token"])
    evidence_dir = Path(os.getenv("CANONICAL_DEMO_EVIDENCE_DIR", "staging-evidence"))
    evidence_dir.mkdir(parents=True, exist_ok=True)
    evidence = {
        "project_ref": PROJECT_REF,
        "issuer": ISSUER,
        "resource": MCP_URL,
        "client_id": client_id,
        "client_type": "public",
        "pkce_method": "S256",
        "denial_verified": True,
        "approval_verified": True,
        "state_binding_verified": True,
        "access_token_claims_verified": ["iss", "aud", "client_id", "scope"],
        "refresh_token_issued": True,
        "mcp_readiness_verified": True,
        "mcp_tools": tool_names,
        "live_tool_call": "erp_product_search",
        "live_demo_product_verified": True,
    }
    (evidence_dir / "canonical-staging-mcp-oauth-e2e.json").write_text(
        json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps(evidence, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ExerciseError, requests.RequestException, ValueError, KeyError) as exc:
        print(f"staging MCP OAuth exercise failed: {exc}", file=sys.stderr)
        raise SystemExit(1)

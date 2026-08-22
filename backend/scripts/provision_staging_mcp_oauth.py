#!/usr/bin/env python3
"""Reconcile the reviewed free-staging OAuth client and demo identity binding."""

from __future__ import annotations

import json
import os
import secrets
import sys
from pathlib import Path
from typing import Any
import psycopg2
import requests


PROJECT_REF = "rgihahbmkrmhitjdjvev"
SUPABASE_URL = f"https://{PROJECT_REF}.supabase.co"
CLIENT_NAME = "AASOPharma canonical staging MCP"
TEST_CALLBACK = "https://aasopharma-erp-pilot.onrender.com/oauth/staging-callback"
REDIRECT_URIS = (
    TEST_CALLBACK,
    "https://claude.ai/api/mcp/auth_callback",
    "https://claude.com/api/mcp/auth_callback",
)
TEST_EMAIL = "mcp-e2e@canonical-staging.aasopharma.invalid"
TEST_USER_ID = "d3000000-0000-7000-8000-00000000002a"
TEST_MEMBERSHIP_ID = "d3000000-0000-7000-8000-00000000002b"
TEST_ACCESS_GRANT_ID = "d3000000-0000-7000-8000-00000000002c"
TEST_AGENT_GRANT_ID = "d3000000-0000-7000-8000-00000000002d"
TEST_REQUEST_ID = "d3000000-0000-7000-8000-00000000002e"
DEMO_ORG_ID = "d3000000-0000-7000-8000-000000000001"
DEMO_ROLE_ID = "d3000000-0000-7000-8000-000000000006"
REVIEWER_AUTH_USER_ID = "d3000000-0000-7000-8000-000000000002"
REVIEWER_MEMBERSHIP_ID = "d3000000-0000-7000-8000-000000000004"
READ_CAPABILITIES = (
    ("master.products.search", False),
    ("master.suppliers.search", True),
    ("gst.settings.get", False),
)


class ProvisioningError(RuntimeError):
    pass


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ProvisioningError(f"{name} is required")
    return value


def _request_json(
    method: str,
    url: str,
    token: str,
    *,
    payload: dict[str, Any] | None = None,
    params: dict[str, Any] | None = None,
) -> Any:
    response = requests.request(
        method,
        url,
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
        params=params,
        timeout=20,
    )
    if not response.ok:
        raise ProvisioningError(
            f"{method} {url} failed with HTTP {response.status_code}: "
            f"{response.text[:500]}"
        )
    return response.json() if response.content else None


def _service_role_key(management_token: str) -> str:
    keys = _request_json(
        "GET",
        f"https://api.supabase.com/v1/projects/{PROJECT_REF}/api-keys",
        management_token,
    )
    matches = [
        item.get("api_key")
        for item in keys
        if item.get("name") == "service_role" and item.get("api_key")
    ]
    if len(matches) != 1:
        raise ProvisioningError("Expected exactly one legacy service_role project key")
    return str(matches[0])


def _client_shape(client: dict[str, Any]) -> tuple[Any, ...]:
    return (
        client.get("name"),
        tuple(sorted(client.get("redirect_uris") or ())),
        client.get("client_type"),
        client.get("token_endpoint_auth_method"),
    )


def _reconcile_client(service_key: str) -> dict[str, Any]:
    endpoint = f"{SUPABASE_URL}/auth/v1/admin/oauth/clients"
    listed = _request_json("GET", endpoint, service_key, params={"per_page": 100})
    clients = listed.get("clients", []) if isinstance(listed, dict) else []
    matches = [client for client in clients if client.get("name") == CLIENT_NAME]
    if len(matches) > 1:
        raise ProvisioningError(f"Duplicate reviewed OAuth clients named {CLIENT_NAME!r}")
    payload = {
        "name": CLIENT_NAME,
        "redirect_uris": list(REDIRECT_URIS),
        "client_type": "public",
        "token_endpoint_auth_method": "none",
    }
    if matches:
        client = matches[0]
        if _client_shape(client) != _client_shape(payload):
            client = _request_json(
                "PATCH", f"{endpoint}/{client['client_id']}", service_key, payload=payload
            )
    else:
        client = _request_json("POST", endpoint, service_key, payload=payload)
    if not isinstance(client, dict) or _client_shape(client) != _client_shape(payload):
        raise ProvisioningError("OAuth client response did not match the reviewed public-client contract")
    client_id = client.get("client_id")
    if not isinstance(client_id, str) or not client_id.strip():
        raise ProvisioningError("OAuth client response omitted client_id")
    return client


def _reconcile_test_user(service_key: str, password: str) -> str:
    endpoint = f"{SUPABASE_URL}/auth/v1/admin/users"
    listed = _request_json("GET", endpoint, service_key, params={"page": 1, "per_page": 1000})
    users = listed.get("users", []) if isinstance(listed, dict) else []
    matches = [user for user in users if user.get("email") == TEST_EMAIL]
    if len(matches) > 1:
        raise ProvisioningError(f"Duplicate staging OAuth test users named {TEST_EMAIL!r}")
    payload = {
        "email": TEST_EMAIL,
        "password": password,
        "email_confirm": True,
        "user_metadata": {"purpose": "canonical-staging-mcp-e2e"},
    }
    if matches:
        user = _request_json(
            "PUT", f"{endpoint}/{matches[0]['id']}", service_key, payload=payload
        )
    else:
        user = _request_json("POST", endpoint, service_key, payload=payload)
    user_id = user.get("id") if isinstance(user, dict) else None
    if not isinstance(user_id, str) or not user_id.strip():
        raise ProvisioningError("Staging OAuth test user response omitted id")
    return user_id


def _bind_demo(database_url: str, client_id: str, auth_user_id: str) -> bool:
    with psycopg2.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT count(*) FROM core.organizations
                 WHERE id=%s AND status='active'
                """,
                (DEMO_ORG_ID,),
            )
            if cursor.fetchone() != (1,):
                return False
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")
            for name, value in (
                ("app.org_id", DEMO_ORG_ID),
                ("app.auth_user_id", REVIEWER_AUTH_USER_ID),
                ("app.membership_id", REVIEWER_MEMBERSHIP_ID),
                ("app.request_id", TEST_REQUEST_ID),
            ):
                cursor.execute("SELECT set_config(%s,%s,true)", (name, value))
            cursor.execute(
                """
                INSERT INTO core.users (id,auth_user_id,display_name,status)
                VALUES (%s,%s,'Canonical staging MCP test operator','active')
                ON CONFLICT (id) DO NOTHING
                """,
                (TEST_USER_ID, auth_user_id),
            )
            cursor.execute(
                """
                INSERT INTO core.memberships (
                    org_id,id,user_id,status,joined_at,
                    created_by_membership_id,updated_by_membership_id
                ) VALUES (%s,%s,%s,'active',transaction_timestamp(),%s,%s)
                ON CONFLICT (org_id,id) DO NOTHING
                """,
                (
                    DEMO_ORG_ID,
                    TEST_MEMBERSHIP_ID,
                    TEST_USER_ID,
                    REVIEWER_MEMBERSHIP_ID,
                    REVIEWER_MEMBERSHIP_ID,
                ),
            )
            cursor.execute(
                """
                INSERT INTO core.access_grants (
                    org_id,id,membership_id,role_id,scope_kind,branch_id,
                    valid_from_at,expires_at,status,created_by_membership_id
                ) VALUES (
                    %s,%s,%s,%s,'organization',NULL,transaction_timestamp(),
                    transaction_timestamp()+interval '30 days','active',%s
                ) ON CONFLICT (org_id,id) DO NOTHING
                """,
                (
                    DEMO_ORG_ID,
                    TEST_ACCESS_GRANT_ID,
                    TEST_MEMBERSHIP_ID,
                    DEMO_ROLE_ID,
                    REVIEWER_MEMBERSHIP_ID,
                ),
            )
            cursor.execute(
                """
                INSERT INTO automation.agent_grants (
                    org_id,id,subject_membership_id,client_id,client_display_name,
                    branch_id,authorization_mode,consent_version,consent_text_hash,
                    consented_by_membership_id,consented_at,granted_by_membership_id,
                    granted_at,expires_at,status,created_by_membership_id,
                    updated_by_membership_id
                ) VALUES (
                    %s,%s,%s,%s,%s,NULL,'self_consent','staging-mcp-e2e-v1',
                    extensions.digest('canonical staging read-only MCP test consent','sha256'),
                    %s,transaction_timestamp(),%s,transaction_timestamp(),
                    transaction_timestamp()+interval '30 days','active',%s,%s
                ) ON CONFLICT (org_id,id) DO NOTHING
                """,
                (
                    DEMO_ORG_ID,
                    TEST_AGENT_GRANT_ID,
                    TEST_MEMBERSHIP_ID,
                    client_id,
                    CLIENT_NAME,
                    TEST_MEMBERSHIP_ID,
                    REVIEWER_MEMBERSHIP_ID,
                    REVIEWER_MEMBERSHIP_ID,
                    REVIEWER_MEMBERSHIP_ID,
                ),
            )
            cursor.executemany(
                """
                INSERT INTO automation.agent_grant_capabilities (
                    org_id, agent_grant_id, capability_code, operation_mode,
                    risk_class, approval_policy, maximum_amount, currency_code,
                    allow_sensitive_read, status, created_by_membership_id
                ) VALUES (%s,%s,%s,'read','read_only','none',NULL,NULL,%s,'active',%s)
                ON CONFLICT (org_id, agent_grant_id, capability_code) DO NOTHING
                """,
                [
                    (
                        DEMO_ORG_ID,
                        TEST_AGENT_GRANT_ID,
                        capability,
                        allow_sensitive,
                        REVIEWER_MEMBERSHIP_ID,
                    )
                    for capability, allow_sensitive in READ_CAPABILITIES
                ],
            )
            cursor.execute(
                """
                SELECT user_row.auth_user_id::text, grant_row.client_id,
                       count(capability.capability_code)
                  FROM core.users AS user_row
                  JOIN core.memberships AS membership
                    ON membership.user_id=user_row.id AND membership.org_id=%s
                  JOIN automation.agent_grants AS grant_row
                    ON grant_row.org_id=membership.org_id
                   AND grant_row.subject_membership_id=membership.id
                  JOIN automation.agent_grant_capabilities AS capability
                    ON capability.org_id=grant_row.org_id
                   AND capability.agent_grant_id=grant_row.id
                 WHERE user_row.id=%s AND membership.id=%s
                   AND grant_row.id=%s AND grant_row.status='active'
                   AND capability.status='active'
                 GROUP BY user_row.auth_user_id,grant_row.client_id
                """,
                (DEMO_ORG_ID, TEST_USER_ID, TEST_MEMBERSHIP_ID, TEST_AGENT_GRANT_ID),
            )
            if cursor.fetchone() != (auth_user_id, client_id, len(READ_CAPABILITIES)):
                raise ProvisioningError("Staging MCP test grant binding did not reconcile exactly")
    return True


def _write_github_env(values: dict[str, str]) -> None:
    path = os.getenv("GITHUB_ENV")
    if not path:
        raise ProvisioningError("GITHUB_ENV is required")
    with Path(path).open("a", encoding="utf-8") as handle:
        for key, value in values.items():
            handle.write(f"{key}={value}\n")


def main() -> int:
    if _required("CANONICAL_STAGING_PROJECT_REF") != PROJECT_REF:
        raise ProvisioningError("Refusing OAuth provisioning outside the reviewed staging project")
    if _required("SUPABASE_URL") != SUPABASE_URL:
        raise ProvisioningError("SUPABASE_URL does not match the reviewed staging project")
    management_token = _required("SUPABASE_ACCESS_TOKEN")
    database_url = _required("PSYCOPG_DATABASE_URL")
    service_key = _service_role_key(management_token)
    print(f"::add-mask::{service_key}")
    password = secrets.token_urlsafe(32)
    print(f"::add-mask::{password}")
    client = _reconcile_client(service_key)
    auth_user_id = _reconcile_test_user(service_key, password)
    demo_bound = _bind_demo(database_url, client["client_id"], auth_user_id)
    _write_github_env(
        {
            "MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS": client["client_id"],
            "CANONICAL_STAGING_MCP_TEST_EMAIL": TEST_EMAIL,
            "CANONICAL_STAGING_MCP_TEST_PASSWORD": password,
        }
    )
    evidence_path = Path(os.getenv("CANONICAL_DEMO_EVIDENCE_DIR", "staging-evidence"))
    evidence_path.mkdir(parents=True, exist_ok=True)
    (evidence_path / "canonical-staging-oauth-client.json").write_text(
        json.dumps(
            {
                "project_ref": PROJECT_REF,
                "client_id": client["client_id"],
                "client_name": CLIENT_NAME,
                "client_type": "public",
                "token_endpoint_auth_method": "none",
                "redirect_uris": list(REDIRECT_URIS),
                "dynamic_client_registration": False,
                "demo_grant_bound": demo_bound,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "status": "ready",
                "client_id": client["client_id"],
                "demo_grant_bound": demo_bound,
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ProvisioningError, requests.RequestException, psycopg2.Error) as exc:
        print(f"staging MCP OAuth provisioning failed: {exc}", file=sys.stderr)
        raise SystemExit(1)

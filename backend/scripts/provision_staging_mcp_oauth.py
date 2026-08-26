#!/usr/bin/env python3
"""Reconcile the reviewed free-staging OAuth client and demo identity binding."""

from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import sys
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5
import psycopg2
import requests


PROJECT_REF = "rgihahbmkrmhitjdjvev"
SUPABASE_URL = f"https://{PROJECT_REF}.supabase.co"
CLIENT_NAME = "AASOPharma canonical staging MCP"
WEB_CLIENT_ID = "aasopharma-erp-web"
WEB_CLIENT_NAME = "AASOPharma canonical staging web"
WEB_TEST_AUTH_USER_ENV = "CANONICAL_STAGING_WEB_TEST_AUTH_USER_ID"
UNISSUED_CLIENT_ID = "disabled-unissued-canonical-staging"
TEST_CALLBACK = "https://aasopharma-erp-pilot.onrender.com/oauth/staging-callback"
REDIRECT_URIS = (
    TEST_CALLBACK,
    "https://claude.ai/api/mcp/auth_callback",
    "https://claude.com/api/mcp/auth_callback",
)
TEST_EMAIL = "mcp-e2e@canonical-staging.aasopharma.invalid"
TEST_USER_ID = "d3000000-0000-7000-8000-00000000002a"
TEST_MEMBERSHIP_ID = "d3000000-0000-7000-8000-00000000002b"
TEST_REQUEST_ID = "d3000000-0000-7000-8000-00000000002e"
DEMO_ORG_ID = "d3000000-0000-7000-8000-000000000001"
DEMO_ROLE_ID = "d3000000-0000-7000-8000-000000000006"
REVIEWER_AUTH_USER_ID = "d3000000-0000-7000-8000-000000000002"
REVIEWER_MEMBERSHIP_ID = "d3000000-0000-7000-8000-000000000004"
READ_CAPABILITIES = (
    ("master.products.search", False),
    ("master.suppliers.search", True),
    ("gst.settings.get", False),
    ("parties.customers.search", True),
    ("inventory.locations.search", False),
    ("inventory.stock_batches.search", False),
    ("sales.orders.get", False),
    ("sales.invoices.get", False),
    ("procurement.purchase_orders.get", False),
    ("procurement.goods_receipts.get", False),
    ("procurement.supplier_invoices.get", True),
    ("finance.open_items.search", True),
    ("finance.settlement_choices.search", True),
)
WRITE_CAPABILITIES = (
    ("sales.order.prepare", "actor_confirmation"),
    ("sales.dispatch.prepare", "actor_confirmation"),
    ("sales.invoice.prepare", "actor_confirmation"),
    ("sales.return.prepare", "separate_approver"),
    ("procurement.purchase_order.prepare", "actor_confirmation"),
    ("procurement.goods_receipt.prepare", "actor_confirmation"),
    ("procurement.supplier_invoice.prepare", "actor_confirmation"),
    ("procurement.purchase_return.prepare", "separate_approver"),
    ("finance.customer_receipt.prepare", "actor_confirmation"),
    ("finance.supplier_payment.prepare", "actor_confirmation"),
    ("finance.supplier_advance.prepare", "separate_approver"),
    ("inventory.adjustment.prepare", "separate_approver"),
    ("automation.command.approve", "actor_confirmation"),
    ("automation.command.execute", "actor_confirmation"),
)
STATUS_CAPABILITY = "automation.command.status.get"


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
    include_api_key: bool = False,
) -> Any:
    headers = {"Authorization": f"Bearer {token}"}
    if include_api_key:
        headers["apikey"] = token
    response = requests.request(
        method,
        url,
        headers=headers,
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
        tuple(sorted(client.get("redirect_uris") or ())),
        client.get("client_type"),
        client.get("token_endpoint_auth_method"),
    )


def _reconcile_client(service_key: str) -> dict[str, Any]:
    endpoint = f"{SUPABASE_URL}/auth/v1/admin/oauth/clients"
    listed = _request_json(
        "GET",
        endpoint,
        service_key,
        params={"per_page": 100},
        include_api_key=True,
    )
    clients = listed.get("clients", []) if isinstance(listed, dict) else []
    matches = [
        client
        for client in clients
        if TEST_CALLBACK in (client.get("redirect_uris") or ())
    ]
    if len(matches) > 1:
        raise ProvisioningError(
            f"Duplicate OAuth clients registered for staging callback {TEST_CALLBACK!r}"
        )
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
                "PATCH",
                f"{endpoint}/{client['client_id']}",
                service_key,
                payload=payload,
                include_api_key=True,
            )
    else:
        client = _request_json(
            "POST", endpoint, service_key, payload=payload, include_api_key=True
        )
    if not isinstance(client, dict) or _client_shape(client) != _client_shape(payload):
        raise ProvisioningError("OAuth client response did not match the reviewed public-client contract")
    client_id = client.get("client_id")
    if not isinstance(client_id, str) or not client_id.strip():
        raise ProvisioningError("OAuth client response omitted client_id")
    return client


def _reconcile_test_user(service_key: str, password: str) -> str:
    endpoint = f"{SUPABASE_URL}/auth/v1/admin/users"
    listed = _request_json(
        "GET",
        endpoint,
        service_key,
        params={"page": 1, "per_page": 1000},
        include_api_key=True,
    )
    users = listed.get("users", []) if isinstance(listed, dict) else []
    matches = [user for user in users if user.get("email") == TEST_EMAIL]
    if len(matches) > 1:
        raise ProvisioningError(f"Duplicate staging OAuth test users named {TEST_EMAIL!r}")
    payload = {
        "email": TEST_EMAIL,
        "password": password,
        "email_confirm": True,
        "app_metadata": {
            "purpose": "canonical-staging-mcp-e2e",
            "organization_id": DEMO_ORG_ID,
        },
    }
    if matches:
        user = _request_json(
            "PUT",
            f"{endpoint}/{matches[0]['id']}",
            service_key,
            payload=payload,
            include_api_key=True,
        )
    else:
        user = _request_json(
            "POST", endpoint, service_key, payload=payload, include_api_key=True
        )
    user_id = user.get("id") if isinstance(user, dict) else None
    if not isinstance(user_id, str) or not user_id.strip():
        raise ProvisioningError("Staging OAuth test user response omitted id")
    return user_id


def _enter_migration_owner(cursor) -> bool:
    """Borrow canonical owner authority only for this fixture transaction."""

    cursor.execute("SHOW server_version_num")
    supports_membership_options = int(cursor.fetchone()[0]) >= 160000
    if supports_membership_options:
        cursor.execute(
            'GRANT "erp_migration_owner" TO CURRENT_USER '
            'WITH INHERIT FALSE, SET TRUE'
        )
    else:
        cursor.execute('GRANT "erp_migration_owner" TO CURRENT_USER')
    cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
    return supports_membership_options


def _leave_migration_owner(cursor, supports_membership_options: bool) -> None:
    """Restore the reviewed non-settable owner membership before commit."""

    cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
    cursor.execute("RESET ROLE")
    if supports_membership_options:
        cursor.execute(
            'GRANT "erp_migration_owner" TO CURRENT_USER '
            'WITH INHERIT FALSE, SET FALSE'
        )
    else:
        cursor.execute('REVOKE "erp_migration_owner" FROM CURRENT_USER')


def _bind_demo(
    database_url: str,
    client_id: str,
    auth_user_id: str,
    web_auth_user_id: str,
) -> bool:
    run_id = os.getenv("GITHUB_RUN_ID", "local")
    access_grant_id = str(
        uuid5(NAMESPACE_URL, f"canonical-staging-mcp-access:{DEMO_ORG_ID}:{run_id}")
    )
    agent_grant_id = str(
        uuid5(NAMESPACE_URL, f"canonical-staging-mcp-agent:{DEMO_ORG_ID}:{run_id}")
    )
    web_agent_grant_id = str(
        uuid5(
            NAMESPACE_URL,
            f"canonical-staging-web-agent:{DEMO_ORG_ID}:{web_auth_user_id}:{run_id}",
        )
    )
    web_user_id = str(
        uuid5(
            NAMESPACE_URL,
            f"canonical-staging-web-user:{DEMO_ORG_ID}:{web_auth_user_id}",
        )
    )
    web_membership_id = str(
        uuid5(
            NAMESPACE_URL,
            f"canonical-staging-web-membership:{DEMO_ORG_ID}:{web_auth_user_id}",
        )
    )
    web_access_grant_id = str(
        uuid5(
            NAMESPACE_URL,
            f"canonical-staging-web-access:{DEMO_ORG_ID}:{web_auth_user_id}",
        )
    )
    with psycopg2.connect(database_url) as connection:
        with connection.cursor() as cursor:
            supports_membership_options = _enter_migration_owner(cursor)
            cursor.execute(
                """
                SELECT count(*) FROM core.organizations
                 WHERE id=%s AND status='active'
                """,
                (DEMO_ORG_ID,),
            )
            if cursor.fetchone() != (1,):
                _leave_migration_owner(cursor, supports_membership_options)
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
                SELECT id::text FROM core.users
                 WHERE auth_user_id=%s
                 ORDER BY id
                 LIMIT 2
                """,
                (web_auth_user_id,),
            )
            web_users = cursor.fetchall()
            if len(web_users) > 1:
                raise ProvisioningError(
                    "Reviewed staging web identity resolves to multiple canonical users"
                )
            if web_users:
                web_user_id = web_users[0][0]
                cursor.execute(
                    """
                    UPDATE core.users
                       SET status='active', row_version=row_version+1
                     WHERE id=%s AND status<>'active'
                    """,
                    (web_user_id,),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO core.users (id,auth_user_id,display_name,status)
                    VALUES (%s,%s,'Canonical staging web operator','active')
                    """,
                    (web_user_id, web_auth_user_id),
                )
            cursor.execute(
                """
                SELECT id::text FROM core.memberships
                 WHERE org_id=%s AND user_id=%s
                 ORDER BY id
                 LIMIT 2
                """,
                (DEMO_ORG_ID, web_user_id),
            )
            web_memberships = cursor.fetchall()
            if len(web_memberships) > 1:
                raise ProvisioningError(
                    "Reviewed staging web identity has multiple demo memberships"
                )
            if web_memberships:
                web_membership_id = web_memberships[0][0]
                cursor.execute(
                    """
                    UPDATE core.memberships
                       SET status='active', row_version=row_version+1,
                           updated_by_membership_id=%s
                     WHERE org_id=%s AND id=%s AND status<>'active'
                    """,
                    (REVIEWER_MEMBERSHIP_ID, DEMO_ORG_ID, web_membership_id),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO core.memberships (
                        org_id,id,user_id,status,joined_at,
                        created_by_membership_id,updated_by_membership_id
                    ) VALUES (%s,%s,%s,'active',transaction_timestamp(),%s,%s)
                    """,
                    (
                        DEMO_ORG_ID,
                        web_membership_id,
                        web_user_id,
                        REVIEWER_MEMBERSHIP_ID,
                        REVIEWER_MEMBERSHIP_ID,
                    ),
                )
            cursor.execute(
                """
                INSERT INTO core.access_grants (
                    org_id,id,membership_id,role_id,scope_kind,branch_id,
                    valid_from_at,expires_at,status,created_by_membership_id
                ) SELECT
                    %s,%s,%s,%s,'organization',NULL,transaction_timestamp(),
                    transaction_timestamp()+interval '30 days','active',%s
                 WHERE NOT EXISTS (
                    SELECT 1 FROM core.access_grants
                     WHERE org_id=%s AND membership_id=%s AND role_id=%s
                       AND status='active'
                )
                ON CONFLICT (org_id,id) DO UPDATE SET
                    valid_from_at=excluded.valid_from_at,
                    expires_at=excluded.expires_at,
                    status='active', row_version=access_grants.row_version+1
                """,
                (
                    DEMO_ORG_ID,
                    web_access_grant_id,
                    web_membership_id,
                    DEMO_ROLE_ID,
                    REVIEWER_MEMBERSHIP_ID,
                    DEMO_ORG_ID,
                    web_membership_id,
                    DEMO_ROLE_ID,
                ),
            )
            cursor.execute(
                """
                SELECT user_row.id::text, membership.id::text
                  FROM core.users AS user_row
                  JOIN core.memberships AS membership
                    ON membership.user_id=user_row.id
                   AND membership.org_id=%s
                  JOIN core.organizations AS organization
                    ON organization.id=membership.org_id
                 WHERE user_row.auth_user_id=%s
                   AND user_row.status='active'
                   AND membership.status='active'
                   AND organization.status='active'
                 ORDER BY user_row.id,membership.id
                 LIMIT 2
                """,
                (DEMO_ORG_ID, web_auth_user_id),
            )
            web_bindings = cursor.fetchall()
            if len(web_bindings) != 1:
                raise ProvisioningError(
                    "Reviewed staging web identity must resolve to exactly one active "
                    "user and membership in the demo organization"
                )
            web_user_id, web_membership_id = web_bindings[0]
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
                UPDATE core.access_grants
                   SET status='expired', row_version=row_version+1
                 WHERE org_id=%s AND membership_id=%s AND role_id=%s
                   AND status='active' AND expires_at IS NOT NULL
                   AND expires_at<=transaction_timestamp()
                """,
                (DEMO_ORG_ID, TEST_MEMBERSHIP_ID, DEMO_ROLE_ID),
            )
            cursor.execute(
                """
                INSERT INTO core.access_grants (
                    org_id,id,membership_id,role_id,scope_kind,branch_id,
                    valid_from_at,expires_at,status,created_by_membership_id
                ) SELECT
                    %s,%s,%s,%s,'organization',NULL,transaction_timestamp(),
                    transaction_timestamp()+interval '30 days','active',%s
                 WHERE NOT EXISTS (
                    SELECT 1 FROM core.access_grants
                     WHERE org_id=%s AND membership_id=%s AND role_id=%s
                       AND status='active'
                 )
                ON CONFLICT (org_id,id) DO NOTHING
                """,
                (
                    DEMO_ORG_ID,
                    access_grant_id,
                    TEST_MEMBERSHIP_ID,
                    DEMO_ROLE_ID,
                    REVIEWER_MEMBERSHIP_ID,
                    DEMO_ORG_ID,
                    TEST_MEMBERSHIP_ID,
                    DEMO_ROLE_ID,
                ),
            )
            cursor.execute(
                """
                UPDATE automation.agent_grants
                   SET status='suspended', row_version=row_version+1
                 WHERE org_id=%s AND subject_membership_id=%s AND client_id=%s
                   AND status='active'
                """,
                (DEMO_ORG_ID, TEST_MEMBERSHIP_ID, client_id),
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
                    extensions.digest('canonical staging bounded read and write MCP test consent','sha256'),
                    %s,transaction_timestamp(),%s,transaction_timestamp(),
                    transaction_timestamp()+interval '30 days','active',%s,%s
                ) ON CONFLICT (org_id,id) DO UPDATE SET
                    status='active', row_version=agent_grants.row_version+1
                """,
                (
                    DEMO_ORG_ID,
                    agent_grant_id,
                    TEST_MEMBERSHIP_ID,
                    client_id,
                    CLIENT_NAME,
                    TEST_MEMBERSHIP_ID,
                    REVIEWER_MEMBERSHIP_ID,
                    REVIEWER_MEMBERSHIP_ID,
                    REVIEWER_MEMBERSHIP_ID,
                ),
            )
            cursor.execute(
                """
                UPDATE automation.agent_grants
                   SET status='suspended', row_version=row_version+1
                 WHERE org_id=%s AND subject_membership_id=%s AND client_id=%s
                   AND status='active'
                """,
                (DEMO_ORG_ID, web_membership_id, WEB_CLIENT_ID),
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
                    %s,%s,%s,%s,%s,NULL,'self_consent','staging-web-e2e-v1',
                    extensions.digest('canonical staging first-party web command consent','sha256'),
                    %s,transaction_timestamp(),%s,transaction_timestamp(),
                    transaction_timestamp()+interval '30 days','active',%s,%s
                ) ON CONFLICT (org_id,id) DO UPDATE SET
                    status='active', row_version=agent_grants.row_version+1
                """,
                (
                    DEMO_ORG_ID,
                    web_agent_grant_id,
                    web_membership_id,
                    WEB_CLIENT_ID,
                    WEB_CLIENT_NAME,
                    web_membership_id,
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
                        agent_grant_id,
                        capability,
                        allow_sensitive,
                        REVIEWER_MEMBERSHIP_ID,
                    )
                    for capability, allow_sensitive in READ_CAPABILITIES
                ],
            )
            cursor.executemany(
                """
                INSERT INTO automation.agent_grant_capabilities (
                    org_id, agent_grant_id, capability_code, operation_mode,
                    risk_class, approval_policy, maximum_amount, currency_code,
                    allow_sensitive_read, status, created_by_membership_id
                ) VALUES (
                    %s,%s,%s,'write','consequential_write',%s,
                    '1000000.00','INR',false,'active',%s
                ) ON CONFLICT (org_id, agent_grant_id, capability_code) DO NOTHING
                """,
                [
                    (
                        DEMO_ORG_ID,
                        web_agent_grant_id,
                        capability,
                        approval,
                        REVIEWER_MEMBERSHIP_ID,
                    )
                    for capability, approval in WRITE_CAPABILITIES
                ],
            )
            cursor.executemany(
                """
                INSERT INTO automation.agent_grant_capabilities (
                    org_id, agent_grant_id, capability_code, operation_mode,
                    risk_class, approval_policy, maximum_amount, currency_code,
                    allow_sensitive_read, status, created_by_membership_id
                ) VALUES (
                    %s,%s,%s,'write','consequential_write',%s,
                    '1000000.00','INR',false,'active',%s
                ) ON CONFLICT (org_id, agent_grant_id, capability_code) DO NOTHING
                """,
                [
                    (
                        DEMO_ORG_ID,
                        agent_grant_id,
                        capability,
                        approval,
                        REVIEWER_MEMBERSHIP_ID,
                    )
                    for capability, approval in WRITE_CAPABILITIES
                ],
            )
            cursor.execute(
                """
                INSERT INTO automation.agent_grant_capabilities (
                    org_id, agent_grant_id, capability_code, operation_mode,
                    risk_class, approval_policy, maximum_amount, currency_code,
                    allow_sensitive_read, status, created_by_membership_id
                ) VALUES (%s,%s,%s,'read','read_only','none',NULL,NULL,false,'active',%s)
                ON CONFLICT (org_id, agent_grant_id, capability_code) DO NOTHING
                """,
                (
                    DEMO_ORG_ID,
                    agent_grant_id,
                    STATUS_CAPABILITY,
                    REVIEWER_MEMBERSHIP_ID,
                ),
            )
            cursor.execute(
                """
                INSERT INTO automation.agent_grant_capabilities (
                    org_id, agent_grant_id, capability_code, operation_mode,
                    risk_class, approval_policy, maximum_amount, currency_code,
                    allow_sensitive_read, status, created_by_membership_id
                ) VALUES (%s,%s,%s,'read','read_only','none',NULL,NULL,false,'active',%s)
                ON CONFLICT (org_id, agent_grant_id, capability_code) DO NOTHING
                """,
                (
                    DEMO_ORG_ID,
                    web_agent_grant_id,
                    STATUS_CAPABILITY,
                    REVIEWER_MEMBERSHIP_ID,
                ),
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
                (DEMO_ORG_ID, TEST_USER_ID, TEST_MEMBERSHIP_ID, agent_grant_id),
            )
            expected_capabilities = (
                len(READ_CAPABILITIES) + len(WRITE_CAPABILITIES) + 1
            )
            if cursor.fetchone() != (auth_user_id, client_id, expected_capabilities):
                raise ProvisioningError("Staging MCP test grant binding did not reconcile exactly")
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
                (DEMO_ORG_ID, web_user_id, web_membership_id, web_agent_grant_id),
            )
            expected_web_capabilities = len(WRITE_CAPABILITIES) + 1
            if cursor.fetchone() != (
                web_auth_user_id,
                WEB_CLIENT_ID,
                expected_web_capabilities,
            ):
                raise ProvisioningError("Staging web test grant binding did not reconcile exactly")
            _leave_migration_owner(cursor, supports_membership_options)
    return True


def _write_github_env(values: dict[str, str]) -> None:
    path = os.getenv("GITHUB_ENV")
    if not path:
        raise ProvisioningError("GITHUB_ENV is required")
    for key, value in values.items():
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
            raise ProvisioningError("GITHUB_ENV variable name is invalid")
        if "\r" in value or "\n" in value:
            raise ProvisioningError("GITHUB_ENV variable value contains a newline")
    with Path(path).open("a", encoding="utf-8") as handle:
        for key, value in values.items():
            handle.write(f"{key}={value}\n")


def _reviewed_client_id(client: dict[str, Any]) -> str:
    value = client.get("client_id")
    if not isinstance(value, str):
        raise ProvisioningError("OAuth client response omitted client_id")
    client_id = value.strip()
    if (
        not client_id
        or client_id != value
        or len(client_id) > 255
        or client_id == UNISSUED_CLIENT_ID
        or "," in client_id
        or any(character.isspace() for character in client_id)
    ):
        raise ProvisioningError("OAuth client response did not contain one reviewed client ID")
    return client_id


def _write_client_evidence(
    *, client_id: str, mode: str, demo_bound: bool, reviewed_sha: str | None = None
) -> None:
    evidence_path = Path(os.getenv("CANONICAL_DEMO_EVIDENCE_DIR", "staging-evidence"))
    evidence_path.mkdir(parents=True, exist_ok=True)
    evidence: dict[str, Any] = {
        "project_ref": PROJECT_REF,
        "client_id": client_id,
        "client_name": CLIENT_NAME,
        "client_type": "public",
        "token_endpoint_auth_method": "none",
        "redirect_uris": list(REDIRECT_URIS),
        "dynamic_client_registration": False,
        "provisioning_mode": mode,
        "demo_grant_bound": demo_bound,
        "web_test_grant_bound": demo_bound,
        "test_identity_reconciled": mode != "client-authority-only",
    }
    if reviewed_sha is not None:
        if not re.fullmatch(r"[0-9a-f]{40}", reviewed_sha):
            raise ProvisioningError("REVIEWED_SHA must be one exact lowercase commit SHA")
        evidence["reviewed_sha"] = reviewed_sha
    (evidence_path / "canonical-staging-oauth-client.json").write_text(
        json.dumps(evidence, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _redacted_annotation(exc: BaseException) -> str:
    detail = str(exc)
    detail = re.sub(r"sb_secret_[A-Za-z0-9._-]+", "[REDACTED]", detail)
    detail = re.sub(r"eyJ[A-Za-z0-9._-]+", "[REDACTED]", detail)
    detail = re.sub(r"postgres(?:ql)?://[^\s]+", "[REDACTED_DATABASE_URL]", detail)
    return detail.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def _mode(argv: list[str] | None = None) -> str:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mode",
        choices=(
            "complete",
            "client-authority-only",
            "client-only",
            "bind-existing-demo",
        ),
        default="complete",
    )
    return parser.parse_args(argv).mode


def main(argv: list[str] | None = None) -> int:
    mode = _mode(argv)
    if _required("CANONICAL_STAGING_PROJECT_REF") != PROJECT_REF:
        raise ProvisioningError("Refusing OAuth provisioning outside the reviewed staging project")
    if _required("SUPABASE_URL") != SUPABASE_URL:
        raise ProvisioningError("SUPABASE_URL does not match the reviewed staging project")
    management_token = _required("SUPABASE_ACCESS_TOKEN")
    reviewed_sha = _required("REVIEWED_SHA") if mode == "client-authority-only" else None
    if reviewed_sha is not None and not re.fullmatch(r"[0-9a-f]{40}", reviewed_sha):
        raise ProvisioningError("REVIEWED_SHA must be one exact lowercase commit SHA")
    existing_password = os.getenv("CANONICAL_STAGING_MCP_TEST_PASSWORD", "").strip()
    if mode == "bind-existing-demo" and not existing_password:
        raise ProvisioningError(
            "CANONICAL_STAGING_MCP_TEST_PASSWORD is required when binding an existing demo"
        )
    database_url = (
        _required("PSYCOPG_DATABASE_URL")
        if mode not in {"client-authority-only", "client-only"}
        else ""
    )
    service_key = _service_role_key(management_token)
    print(f"::add-mask::{service_key}")
    print("Resolved the staging project admin key")
    client = _reconcile_client(service_key)
    client_id = _reviewed_client_id(client)
    print("Reconciled the reviewed public OAuth client")
    if mode == "client-authority-only":
        _write_github_env({"MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS": client_id})
        _write_client_evidence(
            client_id=client_id,
            mode=mode,
            demo_bound=False,
            reviewed_sha=reviewed_sha,
        )
        print(
            json.dumps(
                {
                    "status": "ready",
                    "client_id": client_id,
                    "demo_grant_bound": False,
                    "web_test_grant_bound": False,
                },
                sort_keys=True,
            )
        )
        return 0
    password = existing_password or secrets.token_urlsafe(32)
    print(f"::add-mask::{password}")
    auth_user_id = _reconcile_test_user(service_key, password)
    print("Reconciled the disposable OAuth test identity")
    try:
        web_auth_user_id = str(UUID(_required(WEB_TEST_AUTH_USER_ENV)))
    except ValueError as exc:
        raise ProvisioningError(
            f"{WEB_TEST_AUTH_USER_ENV} must be a canonical UUID"
        ) from exc
    if web_auth_user_id == auth_user_id:
        raise ProvisioningError(
            "The reviewed staging web identity must be distinct from the disposable MCP identity"
        )
    demo_bound = False
    if mode != "client-only":
        demo_bound = _bind_demo(
            database_url,
            client_id,
            auth_user_id,
            web_auth_user_id,
        )
        if not demo_bound:
            raise ProvisioningError(
                "Canonical demo organization must exist before OAuth grant binding"
            )
        print("Reconciled the isolated MCP and reviewed web demo grants")
    else:
        print("Deferred demo grant binding until canonical demo provisioning")
    _write_github_env(
        {
            "MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS": client_id,
            "CANONICAL_STAGING_MCP_TEST_EMAIL": TEST_EMAIL,
            "CANONICAL_STAGING_MCP_TEST_PASSWORD": password,
        }
    )
    _write_client_evidence(
        client_id=client_id,
        mode=mode,
        demo_bound=demo_bound,
    )
    print(
        json.dumps(
            {
                "status": "ready",
                "client_id": client_id,
                "demo_grant_bound": demo_bound,
                "web_test_grant_bound": demo_bound,
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
        print(
            f"::error title=Staging MCP OAuth provisioning failed::{_redacted_annotation(exc)}"
        )
        raise SystemExit(1)

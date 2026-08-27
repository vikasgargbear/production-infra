#!/usr/bin/env python3
"""Exercise denial, PKCE approval, token exchange, and one live MCP read."""

from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import sys
import time
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse
from uuid import UUID
from zoneinfo import ZoneInfo

import jwt
import psycopg2
import requests

if __package__:
    from .deployment_control import (
        DEFAULT_MANIFEST,
        active_provider_name,
        active_provider_services,
        load_manifest,
    )
else:
    try:
        from scripts.deployment_control import (
            DEFAULT_MANIFEST,
            active_provider_name,
            active_provider_services,
            load_manifest,
        )
    except ModuleNotFoundError:
        from deployment_control import (
            DEFAULT_MANIFEST,
            active_provider_name,
            active_provider_services,
            load_manifest,
        )


_DEPLOYMENT_MANIFEST = load_manifest(DEFAULT_MANIFEST)
PROJECT_REF = _DEPLOYMENT_MANIFEST["supabase"]["project_ref"]
SUPABASE_URL = _DEPLOYMENT_MANIFEST["supabase"]["origin"]
ISSUER = f"{SUPABASE_URL}/auth/v1"
ACTIVE_PROVIDER = active_provider_name(_DEPLOYMENT_MANIFEST)
ACTIVE_PROVIDER_SERVICES = active_provider_services(_DEPLOYMENT_MANIFEST)
MCP_URL = ACTIVE_PROVIDER_SERVICES["mcp"]["origin"] + "/mcp"
CALLBACK_URL = (
    ACTIVE_PROVIDER_SERVICES["frontend"]["origin"] + "/oauth/staging-callback"
)
SCOPES = "openid offline_access"
DEMO_ORG_ID = "d3000000-0000-7000-8000-000000000001"
DEMO_BRANCH_ID = "d3000000-0000-7000-8000-000000000005"
DEMO_CUSTOMER_ACCOUNT_ID = "d3000000-0000-7000-8000-000000000011"
DEMO_PRODUCT_ID = "d3000000-0000-7000-8000-000000000015"
DEMO_UOM_CONVERSION_ID = "d3000000-0000-7000-8000-000000000016"


class ExerciseError(RuntimeError):
    pass


def _http_error(label: str, response: requests.Response) -> ExerciseError:
    return ExerciseError(f"{label} returned HTTP {response.status_code}")


def _safe_failure_detail(error: BaseException) -> str:
    if isinstance(error, ExerciseError):
        return str(error)
    if isinstance(error, psycopg2.Error):
        sqlstate = getattr(error, "pgcode", None)
        return f"database_error sqlstate={sqlstate}" if sqlstate else "database_error"
    if isinstance(error, requests.RequestException):
        return f"network_error class={type(error).__name__}"
    return f"validation_error class={type(error).__name__}"


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
        raise _http_error("Authorization start", response)
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
        raise _http_error("Authorization details", response)
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
        raise _http_error(f"OAuth {action}", response)
    location = response.json().get("redirect_url")
    if not isinstance(location, str) or not location:
        raise ExerciseError(f"OAuth {action} omitted redirect_url")
    return location


def _revoke_existing_grant(
    session: requests.Session,
    *,
    client_id: str,
    access_token: str,
) -> None:
    response = session.delete(
        f"{ISSUER}/user/oauth/grants",
        params={"client_id": client_id},
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=20,
    )
    if not response.ok:
        raise _http_error("OAuth grant reset", response)


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
        raise _http_error("OAuth token exchange", response)
    token = response.json()
    if not isinstance(token.get("access_token"), str) or not isinstance(
        token.get("refresh_token"), str
    ):
        raise ExerciseError("OAuth token exchange omitted access or refresh token")
    return token


def _validate_oauth_access_token_claims(
    access_token: str, *, client_id: str, organization_id: str
) -> dict[str, Any]:
    """Validate the public claim contract before contacting the MCP server.

    Signature validation remains the resource server's responsibility.  This
    preflight exists to report claim-shape drift precisely instead of reducing
    it to a generic HTTP 401 at the first MCP request.
    """

    claims = jwt.decode(access_token, options={"verify_signature": False})
    if claims.get("iss") != ISSUER or claims.get("client_id") != client_id:
        raise ExerciseError("OAuth access token issuer or client_id drifted")
    if claims.get("aud") != "authenticated":
        raise ExerciseError("Staging OAuth access token audience drifted")
    scopes = set(str(claims.get("scope", "")).split())
    if not {"openid", "offline_access"}.issubset(scopes):
        raise ExerciseError("OAuth access token omitted required scopes")
    app_metadata = claims.get("app_metadata")
    try:
        token_organization_id = str(
            UUID(str(app_metadata.get("org_id")))
            if isinstance(app_metadata, dict)
            else UUID("")
        )
    except (TypeError, ValueError) as exc:
        raise ExerciseError(
            "OAuth access token omitted canonical app_metadata.org_id"
        ) from exc
    if token_organization_id != str(UUID(organization_id)):
        raise ExerciseError("OAuth access token organization drifted")
    return claims


def _jsonrpc_response(response: requests.Response) -> dict[str, Any]:
    if not response.ok:
        raise _http_error("MCP request", response)
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
        error = body["error"]
        code = error.get("code") if isinstance(error, dict) else None
        detail = f" code={code}" if isinstance(code, int) else ""
        raise ExerciseError(f"MCP JSON-RPC error{detail}")
    return body


def _tool_payload(response: dict[str, Any]) -> dict[str, Any]:
    result = response.get("result")
    if not isinstance(result, dict) or result.get("isError") is True:
        raise ExerciseError("Live MCP tool returned an error result")
    structured = result.get("structuredContent")
    if isinstance(structured, dict):
        return structured
    content = result.get("content")
    if isinstance(content, list):
        for item in content:
            if isinstance(item, dict) and isinstance(item.get("text"), str):
                try:
                    decoded = json.loads(item["text"])
                except json.JSONDecodeError:
                    continue
                if isinstance(decoded, dict):
                    return decoded
    raise ExerciseError("Live MCP tool response omitted one JSON object payload")


def _decimal(value: Any, label: str) -> Decimal:
    if not isinstance(value, str):
        raise ExerciseError(f"{label} must remain an exact decimal string")
    try:
        return Decimal(value)
    except InvalidOperation as exc:
        raise ExerciseError(f"{label} is not an exact decimal string") from exc


def _customer_delivery_address(customers: dict[str, Any]) -> tuple[str, str]:
    if (
        customers.get("match_state") != "exact_match"
        or isinstance(customers.get("exact_match_count"), bool)
        or customers.get("exact_match_count") != 1
        or customers.get("requires_selection") is not False
    ):
        raise ExerciseError("Live customer resolution did not return one exact customer")
    results = customers.get("results")
    if not isinstance(results, list):
        raise ExerciseError("Live customer resolution omitted its bounded results")
    matches = [
        result
        for result in results
        if isinstance(result, dict)
        and result.get("customer_account_id") == DEMO_CUSTOMER_ACCOUNT_ID
    ]
    if len(matches) != 1:
        raise ExerciseError("Live customer resolution omitted one canonical demo customer")
    addresses = matches[0].get("primary_delivery_addresses")
    if not isinstance(addresses, list) or len(addresses) != 1:
        raise ExerciseError(
            "Canonical demo customer must have one exact active primary delivery address"
        )
    address = addresses[0]
    if not isinstance(address, dict):
        raise ExerciseError("Canonical delivery-address resolution returned an invalid row")
    address_id = address.get("delivery_address_id")
    row_version = address.get("delivery_address_row_version")
    if address.get("is_primary") is not True or address.get("address_kind") not in {
        "registered",
        "billing",
        "shipping",
    }:
        raise ExerciseError(
            "Canonical delivery-address resolution returned an ineligible primary row"
        )
    try:
        normalized_address_id = str(UUID(address_id)) if isinstance(address_id, str) else ""
    except ValueError as exc:
        raise ExerciseError("Canonical delivery-address resolution returned an invalid UUID") from exc
    if not normalized_address_id:
        raise ExerciseError("Canonical delivery-address resolution returned an invalid UUID")
    if isinstance(row_version, bool) or not isinstance(row_version, int) or row_version < 1:
        raise ExerciseError(
            "Canonical delivery-address resolution returned an invalid row version"
        )
    return normalized_address_id, str(row_version)


def _verify_sales_order_readback(
    prepared: dict[str, Any],
    executed: dict[str, Any],
    status: dict[str, Any],
    readback: dict[str, Any],
) -> dict[str, Any]:
    resource_id = executed.get("resource_id")
    if not isinstance(resource_id, str) or status.get("resource_id") != resource_id:
        raise ExerciseError("Live execute/status omitted one stable sales-order resource UUID")
    if readback.get("match_state") != "matched" or readback.get("matched_count") != 1:
        raise ExerciseError("Live sales-order readback was not one exact match")
    document = readback.get("document")
    if not isinstance(document, dict) or document.get("sales_order_id") != resource_id:
        raise ExerciseError("Live sales-order readback identity differs from execute")
    financial = prepared.get("financial_impact")
    if not isinstance(financial, list) or len(financial) != 1:
        raise ExerciseError("Live sales-order preview omitted one financial impact")
    preview_total = financial[0].get("grand_total")
    readback_total = document.get("grand_total")
    preview_decimal = _decimal(preview_total, "sales-order preview grand_total")
    readback_decimal = _decimal(readback_total, "sales-order readback grand_total")
    if preview_decimal != readback_decimal:
        raise ExerciseError(
            f"Live sales-order total drifted between preview and readback: "
            f"{preview_total!r} != {readback_total!r}"
        )
    lines = document.get("lines")
    if not isinstance(lines, list) or len(lines) != 1:
        raise ExerciseError("Live sales-order readback did not contain one exact product line")
    line = lines[0]
    expected = {
        "base_billed_quantity": Decimal("12"),
        "base_free_quantity": Decimal("2"),
        "quoted_unit_rate": Decimal("125.50"),
    }
    for field, expected_value in expected.items():
        if _decimal(line.get(field), f"sales-order readback {field}") != expected_value:
            raise ExerciseError(
                f"Live sales-order readback {field} differs from the command input"
            )
    return {
        "sales_order_id": resource_id,
        "grand_total": readback_total,
        "base_billed_quantity": line["base_billed_quantity"],
        "base_free_quantity": line["base_free_quantity"],
        "quoted_unit_rate": line["quoted_unit_rate"],
        "line_total": line["line_total"],
    }


def _exercise_mcp(
    access_token: str, *, business_flow: bool
) -> tuple[list[str], dict[str, Any] | None]:
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
    contract_path = Path(__file__).parents[1] / "mcp_runtime/service-contract.json"
    expected = sorted(json.loads(contract_path.read_text(encoding="utf-8"))["tools"])
    if names != expected:
        raise ExerciseError("Live MCP registry drifted from the reviewed tool set")
    if not business_flow:
        return names, None
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
    if DEMO_PRODUCT_ID not in json.dumps(called):
        raise ExerciseError("Live product-search tool did not return the canonical demo product")

    next_id = 4

    def call(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        nonlocal next_id
        response = _jsonrpc_response(
            session.post(
                MCP_URL,
                json={
                    "jsonrpc": "2.0",
                    "id": next_id,
                    "method": "tools/call",
                    "params": {"name": name, "arguments": arguments},
                },
                timeout=60,
            )
        )
        next_id += 1
        return _tool_payload(response)

    customers = call(
        "erp_customer_search", {"search_term": "CUST-DEMO-001", "limit": 20}
    )
    delivery_address_id, delivery_address_row_version = _customer_delivery_address(
        customers
    )

    run_id = os.getenv("GITHUB_RUN_ID", secrets.token_hex(6))
    business_date = datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()
    prepared = call(
        "erp_sales_order_prepare",
        {
            "idempotency_key": f"mcp-live-sales-order-{run_id}",
            "branch_id": DEMO_BRANCH_ID,
            "order_date": business_date,
            "document_discount": {
                "document_discount_kind": "amount",
                "document_discount_basis": "taxable_value",
                "document_discount_value": "25.00",
            },
            "rounding_policy": "nearest_rupee",
            "zero_rated_payment_mode": "not_applicable",
            "customer_account_id": DEMO_CUSTOMER_ACCOUNT_ID,
            "delivery_address_id": delivery_address_id,
            "delivery_address_row_version": delivery_address_row_version,
            "lines": [
                {
                    "product_id": DEMO_PRODUCT_ID,
                    "uom_conversion_id": DEMO_UOM_CONVERSION_ID,
                    "billed_quantity": "12",
                    "free_quantity": "2",
                    "free_supply_tax_treatment": "excluded_from_taxable_value",
                    "quoted_unit_rate": "125.50",
                    "price_basis": "tax_exclusive",
                    "line_discount": {
                        "line_discount_kind": "percent",
                        "line_discount_basis": "taxable_value",
                        "line_discount_value": "7.5",
                    },
                    "document_discount_eligible": True,
                }
            ],
        },
    )
    command_id = prepared.get("command_request_id")
    preview_hash = prepared.get("preview_hash")
    if not isinstance(command_id, str) or not isinstance(preview_hash, str):
        raise ExerciseError("Live prepare omitted command_request_id or preview_hash")
    approved = call(
        "erp_operation_approve",
        {
            "command_request_id": command_id,
            "preview_hash": preview_hash,
            "approval_intent": "approve",
            "idempotency_key": f"mcp-live-approve-{run_id}",
        },
    )
    executed = call(
        "erp_operation_execute",
        {
            "command_request_id": command_id,
            "preview_hash": preview_hash,
            "idempotency_key": f"mcp-live-execute-{run_id}",
        },
    )
    status = call("erp_operation_status_get", {"command_request_id": command_id})
    if status.get("status") != "succeeded":
        raise ExerciseError("Live command did not reach succeeded status")
    resource_id = executed.get("resource_id")
    if not isinstance(resource_id, str):
        raise ExerciseError("Live sales-order execute omitted resource_id")
    readback = call(
        "erp_sales_order_get",
        {"branch_id": DEMO_BRANCH_ID, "sales_order_id": resource_id},
    )
    exact_values = _verify_sales_order_readback(
        prepared, executed, status, readback
    )
    return names, {
        "command_request_id": command_id,
        "prepared": prepared,
        "approved": approved,
        "executed": executed,
        "status": status,
        "readback": readback,
        "exact_values": exact_values,
    }


def _reconcile_database(workflow: dict[str, Any]) -> dict[str, Any]:
    command_id = workflow["command_request_id"]
    readback = workflow["readback"]["document"]
    with psycopg2.connect(_required("PSYCOPG_DATABASE_URL")) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT command.status, command.target_resource_id::text,
                       count(order_row.id)
                  FROM automation.command_requests AS command
                  LEFT JOIN sales.orders AS order_row
                    ON order_row.org_id=command.org_id
                   AND order_row.id=command.target_resource_id
                 WHERE command.org_id=%s AND command.id=%s
                 GROUP BY command.status,command.target_resource_id
                """,
                (DEMO_ORG_ID, command_id),
            )
            row = cursor.fetchone()
            cursor.execute(
                """
                SELECT order_row.grand_total::text,
                       line.base_billed_quantity::text,
                       line.base_free_quantity::text,
                       line.quoted_unit_rate::text,
                       line.line_total::text
                  FROM sales.orders AS order_row
                  JOIN sales.order_lines AS line
                    ON line.org_id=order_row.org_id
                   AND line.order_id=order_row.id
                   AND line.line_kind='product'
                 WHERE order_row.org_id=%s AND order_row.id=%s
                 ORDER BY line.line_number, line.id
                """,
                (DEMO_ORG_ID, readback["sales_order_id"]),
            )
            value_rows = cursor.fetchall()
    if row is None or row[0] != "succeeded" or row[2] != 1:
        raise ExerciseError("Database did not reconcile one succeeded MCP sales order")
    if str(row[1]) != readback["sales_order_id"] or len(value_rows) != 1:
        raise ExerciseError("Database resource identity/line cardinality differs from MCP readback")
    value_row = value_rows[0]
    fields = (
        "grand_total",
        "base_billed_quantity",
        "base_free_quantity",
        "quoted_unit_rate",
        "line_total",
    )
    database_values = dict(zip(fields, value_row))
    for field, database_value in database_values.items():
        if _decimal(database_value, f"database {field}") != _decimal(
            readback["lines"][0][field] if field != "grand_total" else readback[field],
            f"MCP readback {field}",
        ):
            raise ExerciseError(f"Database {field} differs from MCP readback")
    return {
        "command_status": row[0],
        "sales_order_id": str(row[1]),
        "order_count": row[2],
        "exact_values": database_values,
    }


def _wait_for_mcp_readiness() -> None:
    readiness_url = MCP_URL.removesuffix("/mcp") + "/ready"
    last_detail = "no response"
    for attempt in range(1, 6):
        try:
            response = requests.get(readiness_url, timeout=30)
            last_detail = f"HTTP {response.status_code}"
            if response.status_code == 200:
                return
        except requests.RequestException as exc:
            last_detail = type(exc).__name__
        if attempt < 5:
            time.sleep(10)
    raise ExerciseError(f"MCP readiness failed after five checks: {last_detail}")


def main() -> int:
    if _required("CANONICAL_STAGING_PROJECT_REF") != PROJECT_REF:
        raise ExerciseError("Refusing OAuth exercise outside the reviewed staging project")
    if _required("SUPABASE_URL") != SUPABASE_URL:
        raise ExerciseError("SUPABASE_URL does not match the reviewed staging project")
    exercise_mode = os.getenv(
        "CANONICAL_STAGING_MCP_EXERCISE_MODE", "business_flow"
    ).strip()
    if exercise_mode not in {"boundary_only", "business_flow"}:
        raise ExerciseError("Unsupported staging MCP exercise mode")
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
    _revoke_existing_grant(
        session,
        client_id=client_id,
        access_token=user_access_token,
    )

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
    _validate_oauth_access_token_claims(
        token["access_token"],
        client_id=client_id,
        organization_id=DEMO_ORG_ID,
    )

    _wait_for_mcp_readiness()
    tool_names, workflow = _exercise_mcp(
        token["access_token"], business_flow=exercise_mode == "business_flow"
    )
    reconciliation = (
        _reconcile_database(workflow)
        if workflow is not None
        else None
    )
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
        "exercise_mode": exercise_mode,
        "live_read_tool_calls": (
            ["erp_product_search", "erp_customer_search", "erp_sales_order_get"]
            if workflow is not None else []
        ),
        "live_demo_product_verified": workflow is not None,
        "live_write_workflow": (
            [
                "erp_sales_order_prepare",
                "erp_operation_approve",
                "erp_operation_execute",
                "erp_operation_status_get",
            ]
            if workflow is not None
            else []
        ),
        "live_command_request_id": (
            workflow["command_request_id"] if workflow is not None else None
        ),
        "live_readback_tool": "erp_sales_order_get" if workflow is not None else None,
        "live_readback_resource_id": (
            workflow["exact_values"]["sales_order_id"] if workflow is not None else None
        ),
        "live_readback_exact_values": (
            workflow["exact_values"] if workflow is not None else None
        ),
        "database_reconciliation": reconciliation,
    }
    (evidence_dir / "canonical-staging-mcp-oauth-e2e.json").write_text(
        json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps(evidence, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (
        ExerciseError,
        requests.RequestException,
        psycopg2.Error,
        ValueError,
        KeyError,
    ) as exc:
        detail = _safe_failure_detail(exc)
        print(f"staging MCP OAuth exercise failed: {detail}", file=sys.stderr)
        detail = detail.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        print(f"::error title=Staging MCP OAuth exercise failed::{detail}")
        raise SystemExit(1)

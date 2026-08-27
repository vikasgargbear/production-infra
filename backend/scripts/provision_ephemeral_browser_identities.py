#!/usr/bin/env python3
"""Provision and always remove disposable canonical-staging browser identities.

This is intentionally a short-lived GitHub Actions boundary.  It never writes
the generated passwords or the resolved Supabase service-role key to its state
file.  The only durable state is the minimum non-secret reconciliation data
needed to undo a partially completed run.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import secrets
import sys
import time
from pathlib import Path
from typing import Any, Callable, NamedTuple
from uuid import UUID, uuid4

import psycopg2
import requests


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
if str(SCRIPT_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIRECTORY))

from provision_staging_mcp_oauth import (  # noqa: E402
    PROJECT_REF,
    SUPABASE_URL,
    _auth_admin_authority,
    _request_json,
)
from supabase_auth_admin import (  # noqa: E402
    SupabaseAuthAdminAuthority,
    SupabaseAuthAdminError,
    auth_admin_request,
    mask_auth_admin_secret,
)
from canonical_staging_database import load_direct_database_contract  # noqa: E402


EXPECTED_PROJECT_REF = "rgihahbmkrmhitjdjvev"
DIRECT_IPV4_DATABASE_TRANSPORT = "direct_ipv4"
RAILWAY_DIRECT_DATABASE_TRANSPORT = "railway_direct_ipv6"
WEB_CLIENT_ID = "aasopharma-erp-web"
DEMO_ORG_ID = "d3000000-0000-7000-8000-000000000001"
DEMO_REVIEWER_AUTH_USER_ID = "d3000000-0000-7000-8000-000000000002"
DEMO_REVIEWER_USER_ID = "d3000000-0000-7000-8000-000000000003"
DEMO_REVIEWER_MEMBERSHIP_ID = "d3000000-0000-7000-8000-000000000004"
DEMO_ROLE_ID = "d3000000-0000-7000-8000-000000000006"
DEMO_OPERATOR_AUTH_USER_ID = "d3000000-0000-7000-8000-000000000022"
DEMO_OPERATOR_USER_ID = "d3000000-0000-7000-8000-000000000023"
DEMO_OPERATOR_MEMBERSHIP_ID = "d3000000-0000-7000-8000-000000000024"
DENIAL_ORG_ID = "d3000000-0000-7000-8000-00000000002c"
DENIAL_CREATOR_MEMBERSHIP_ID = "d3000000-0000-7000-8000-00000000002d"
LOCK_KEY = "canonical-staging-live-browser-identities"
TWO_USER_PURPOSE = "canonical-staging-two-user-browser-e2e"
CORE_OPERATOR_PURPOSE = "canonical-staging-core-browser-e2e"
LIVE18_PURPOSE = "canonical-staging-live18-browser-e2e"
LIVE18_DENIAL_CONSENT_VERSION = "live18-denial-v1"
LIVE18_DENIAL_ROLE_PREFIX = "live18_denial_"
LIVE18_DENIAL_CLEANUP_REASON = "Live18 disposable identity cleanup"
STATE_VERSION = 1
BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = BACKEND_ROOT.parent
# Railway deliberately flattens backend/ into /app.  Keep runtime data under
# that packaged backend root and copy the generated operator contract there in
# the API image; local source checkouts continue to use the repository copy.
_PACKAGED_OPERATOR_CONTRACT_PATH = (
    BACKEND_ROOT / "docs" / "architecture" / "mcp-operator-actions.json"
)
OPERATOR_CONTRACT_PATH = (
    _PACKAGED_OPERATOR_CONTRACT_PATH
    if _PACKAGED_OPERATOR_CONTRACT_PATH.is_file()
    else REPOSITORY_ROOT / "docs/architecture/mcp-operator-actions.json"
)
LIVE18_MATRIX_PATH = BACKEND_ROOT / "tests/live_acceptance/operation_matrix.json"

REQUESTER_CAPABILITIES = (
    ("sales.return.prepare", "write", "consequential_write", "separate_approver"),
    (
        "procurement.purchase_return.prepare",
        "write",
        "consequential_write",
        "separate_approver",
    ),
    (
        "inventory.adjustment.prepare",
        "write",
        "consequential_write",
        "separate_approver",
    ),
    (
        "automation.command.execute",
        "write",
        "consequential_write",
        "actor_confirmation",
    ),
    ("automation.command.status.get", "read", "read_only", "none"),
)
REVIEWER_CAPABILITIES = (
    (
        "automation.command.approve",
        "write",
        "consequential_write",
        "actor_confirmation",
    ),
    ("automation.command.status.get", "read", "read_only", "none"),
)
REQUESTER_PERMISSIONS = (
    "sales.return.create",
    "procurement.purchase_return.create",
    "inventory.adjustment.create",
    "automation.command.execute",
    "automation.command.view",
)
REVIEWER_PERMISSIONS = (
    "automation.command.approve",
    "automation.command.view",
)
IDENTITIES = (
    ("requester", DEMO_OPERATOR_USER_ID, DEMO_OPERATOR_MEMBERSHIP_ID),
    ("reviewer", DEMO_REVIEWER_USER_ID, DEMO_REVIEWER_MEMBERSHIP_ID),
)

CORE_OPERATOR_CAPABILITIES = (
    ("sales.order.prepare", "write", "consequential_write", "actor_confirmation"),
    ("sales.dispatch.prepare", "write", "consequential_write", "actor_confirmation"),
    ("sales.invoice.prepare", "write", "consequential_write", "actor_confirmation"),
    (
        "procurement.purchase_order.prepare",
        "write",
        "consequential_write",
        "actor_confirmation",
    ),
    (
        "procurement.goods_receipt.prepare",
        "write",
        "consequential_write",
        "actor_confirmation",
    ),
    (
        "procurement.supplier_invoice.prepare",
        "write",
        "consequential_write",
        "actor_confirmation",
    ),
    (
        "finance.customer_receipt.prepare",
        "write",
        "consequential_write",
        "actor_confirmation",
    ),
    (
        "finance.supplier_payment.prepare",
        "write",
        "consequential_write",
        "actor_confirmation",
    ),
    ("sales.return.prepare", "write", "consequential_write", "separate_approver"),
    ("inventory.adjustment.prepare", "write", "consequential_write", "separate_approver"),
    ("automation.command.approve", "write", "consequential_write", "actor_confirmation"),
    ("automation.command.execute", "write", "consequential_write", "actor_confirmation"),
    ("automation.command.status.get", "read", "read_only", "none"),
)
CORE_OPERATOR_PERMISSIONS = (
    "sales.order.create",
    "sales.order.manage",
    "sales.dispatch.create",
    "sales.dispatch.post",
    "sales.invoice.create",
    "sales.invoice.post",
    "procurement.order.manage",
    "procurement.receipt.post",
    "procurement.supplier_invoice.create",
    "procurement.invoice.post",
    "finance.customer_receipt.create",
    "finance.supplier_payment.create",
    "finance.payment.manage",
    "finance.payment.allocate",
    "finance.journal.post",
    "sales.return.create",
    "sales.return.post",
    "inventory.adjustment.create",
    "inventory.document.post",
    "inventory.reservation.manage",
    "catalog.product.manage",
    "parties.party.manage",
    "parties.customer.manage",
    "parties.supplier.manage",
    "internal.sequence.allocate",
    "automation.command.approve",
    "automation.command.execute",
    "automation.command.view",
)
CORE_IDENTITIES = (
    ("operator", DEMO_OPERATOR_USER_ID, DEMO_OPERATOR_MEMBERSHIP_ID),
)


class EphemeralIdentityError(RuntimeError):
    pass


class Live18IdentityBoundary(NamedTuple):
    operator_auth_user_id: str | None
    reviewer_auth_user_id: str | None
    target_organization_count: int
    active_target_organization_count: int
    target_user_count: int
    exact_active_user_count: int
    target_demo_membership_count: int
    exact_active_demo_membership_count: int
    denial_creator_membership_count: int
    exact_active_denial_creator_membership_count: int
    active_demo_access_grant_count: int
    exact_active_demo_access_grant_count: int
    active_web_grant_count: int
    exact_active_baseline_web_grant_count: int
    exact_active_baseline_capability_grant_count: int
    active_temporary_grant_count: int


def _live18_authority() -> tuple[
    tuple[tuple[str, str, str, str], ...],
    tuple[tuple[str, str, str, str], ...],
    tuple[str, ...],
]:
    """Derive durable published and temporary ready-run MCP authorities."""
    contract = json.loads(OPERATOR_CONTRACT_PATH.read_text(encoding="utf-8"))
    matrix = json.loads(LIVE18_MATRIX_PATH.read_text(encoding="utf-8"))
    operations = matrix.get("operations", [])
    deferred_rows = matrix.get("deferred_operations", [])
    deferred = {
        item.get("id") for item in deferred_rows
        if isinstance(item, dict) and item.get("status") == "deferred"
    }
    published_operations = [
        item for item in operations
        if isinstance(item, dict) and item.get("availability") == "published"
    ]
    published = {item.get("command_operation") for item in published_operations}
    ready_operations = [
        item for item in published_operations if item.get("id") not in deferred
    ]
    ready = {item.get("command_operation") for item in ready_operations}
    if (
        matrix.get("operation_count") != 18
        or matrix.get("required_operation_count") != 17
        or len(operations) != matrix["operation_count"]
        or len(deferred) != len(deferred_rows)
        or len(published_operations) != matrix["operation_count"]
        or len(ready_operations) != matrix["required_operation_count"]
        or None in published
        or None in ready
    ):
        raise EphemeralIdentityError(
            "Live18 operation matrix must contain 18 named operations and an exact ready scope"
        )
    actions = contract.get("prepare_actions", [])
    by_operation = {
        action.get("operation_key"): action
        for action in actions
        if isinstance(action, dict) and action.get("operation_key")
    }
    if len(published) != 17 or set(by_operation) != published:
        raise EphemeralIdentityError(
            "Generated operator contract must expose all 17 published prepare commands"
        )
    if len(ready) != 16 or not ready < published:
        raise EphemeralIdentityError(
            "Generated operator contract must expose all 16 release-ready prepare commands"
        )
    def capabilities(
        operations: set[object],
    ) -> tuple[tuple[str, str, str, str], ...]:
        return tuple(
            (
                str(operation),
                "write",
                str(by_operation[str(operation)]["risk"]),
                str(by_operation[str(operation)]["approval_policy"]),
            )
            for operation in sorted(operations, key=str)
        ) + (
            (
                "automation.command.approve",
                "write",
                "consequential_write",
                "actor_confirmation",
            ),
            (
                "automation.command.execute",
                "write",
                "consequential_write",
                "actor_confirmation",
            ),
            ("automation.command.status.get", "read", "read_only", "none"),
        )
    permissions = tuple(sorted({
        str(by_operation[str(operation)]["permission"])
        for operation in ready
    } | {
        "automation.command.approve",
        "automation.command.execute",
        "automation.command.view",
    }))
    return capabilities(published), capabilities(ready), permissions


(
    LIVE18_PUBLISHED_REQUESTER_CAPABILITIES,
    LIVE18_REQUESTER_CAPABILITIES,
    LIVE18_REQUESTER_PERMISSIONS,
) = _live18_authority()


def _baseline_capability_bounds(
    capabilities: tuple[tuple[str, str, str, str], ...],
) -> tuple[dict[str, object], ...]:
    return tuple(
        {
            "capability_code": capability,
            "operation_mode": operation_mode,
            "risk_class": risk_class,
            "approval_policy": approval_policy,
            "maximum_amount": 1_000_000 if capability.endswith(".prepare") else None,
            "currency_code": "INR" if capability.endswith(".prepare") else None,
            "allow_sensitive_read": False,
            "status": "active",
        }
        for capability, operation_mode, risk_class, approval_policy in sorted(
            capabilities
        )
    )


LIVE18_BASELINE_OPERATOR_CAPABILITY_BOUNDS = _baseline_capability_bounds(
    LIVE18_PUBLISHED_REQUESTER_CAPABILITIES
    + (("inventory.destructions.get", "read", "read_only", "none"),)
)
LIVE18_BASELINE_REVIEWER_CAPABILITY_BOUNDS = _baseline_capability_bounds(
    ((
        "automation.command.approve",
        "write",
        "consequential_write",
        "actor_confirmation",
    ),)
)


def _temporary_capability_bounds(
    capabilities: tuple[tuple[str, str, str, str], ...],
) -> tuple[dict[str, object], ...]:
    """Mirror the strict two-hour browser-grant capability envelope."""

    return tuple(
        {
            "capability_code": capability,
            "operation_mode": operation_mode,
            "risk_class": risk_class,
            "approval_policy": approval_policy,
            "maximum_amount": 1_000_000 if operation_mode == "write" else None,
            "currency_code": "INR" if operation_mode == "write" else None,
            "allow_sensitive_read": False,
            "status": "active",
        }
        for capability, operation_mode, risk_class, approval_policy in sorted(
            capabilities
        )
    )


LIVE18_TEMPORARY_CAPABILITY_BOUNDS = {
    DEMO_OPERATOR_MEMBERSHIP_ID: _temporary_capability_bounds(
        LIVE18_REQUESTER_CAPABILITIES
    ),
    DEMO_REVIEWER_MEMBERSHIP_ID: _temporary_capability_bounds(
        REVIEWER_CAPABILITIES
    ),
}
LIVE18_IDENTITIES = IDENTITIES

PROFILE_TWO_USER = "two-user-approvals"
PROFILE_CORE_OPERATOR = "core-operator"
PROFILE_LIVE18 = "live18"
PROFILES = (PROFILE_TWO_USER, PROFILE_CORE_OPERATOR, PROFILE_LIVE18)


def _profile_purpose(profile: str) -> str:
    if profile == PROFILE_TWO_USER:
        return TWO_USER_PURPOSE
    if profile == PROFILE_CORE_OPERATOR:
        return CORE_OPERATOR_PURPOSE
    if profile == PROFILE_LIVE18:
        return LIVE18_PURPOSE
    raise EphemeralIdentityError(f"Unsupported browser identity profile: {profile}")


def _profile_identities(profile: str):
    _profile_purpose(profile)
    return CORE_IDENTITIES if profile == PROFILE_CORE_OPERATOR else IDENTITIES


def _permissions_for(role: str, profile: str):
    if profile == PROFILE_CORE_OPERATOR:
        if role != "operator":
            raise EphemeralIdentityError("Core browser profile only supports operator")
        return CORE_OPERATOR_PERMISSIONS
    if profile == PROFILE_LIVE18:
        if role == "requester":
            return LIVE18_REQUESTER_PERMISSIONS
        if role == "reviewer":
            return REVIEWER_PERMISSIONS
    if role == "requester":
        return REQUESTER_PERMISSIONS
    if role == "reviewer":
        return REVIEWER_PERMISSIONS
    raise EphemeralIdentityError(f"Unsupported two-user browser role: {role}")


def _capabilities_for(role: str, profile: str):
    if profile == PROFILE_CORE_OPERATOR:
        if role != "operator":
            raise EphemeralIdentityError("Core browser profile only supports operator")
        return CORE_OPERATOR_CAPABILITIES
    if profile == PROFILE_LIVE18:
        if role == "requester":
            return LIVE18_REQUESTER_CAPABILITIES
        if role == "reviewer":
            return REVIEWER_CAPABILITIES
    if role == "requester":
        return REQUESTER_CAPABILITIES
    if role == "reviewer":
        return REVIEWER_CAPABILITIES
    raise EphemeralIdentityError(f"Unsupported two-user browser role: {role}")


def _profile_from_state(state: dict[str, Any]) -> str:
    purpose = state.get("purpose")
    if purpose == TWO_USER_PURPOSE:
        return PROFILE_TWO_USER
    if purpose == CORE_OPERATOR_PURPOSE:
        return PROFILE_CORE_OPERATOR
    if purpose == LIVE18_PURPOSE:
        return PROFILE_LIVE18
    raise EphemeralIdentityError("Unsupported ephemeral browser identity purpose")


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise EphemeralIdentityError(f"{name} is required")
    return value


def _validate_target(management_token: str) -> None:
    if PROJECT_REF != EXPECTED_PROJECT_REF or SUPABASE_URL != (
        f"https://{EXPECTED_PROJECT_REF}.supabase.co"
    ):
        raise EphemeralIdentityError("Reviewed staging constants do not match")
    if _required("CANONICAL_STAGING_PROJECT_REF") != EXPECTED_PROJECT_REF:
        raise EphemeralIdentityError(
            "Refusing browser identity provisioning outside the reviewed staging project"
        )
    if _required("SUPABASE_URL") != SUPABASE_URL:
        raise EphemeralIdentityError(
            "SUPABASE_URL does not match the reviewed staging project"
        )
    project = _request_json(
        "GET",
        f"https://api.supabase.com/v1/projects/{EXPECTED_PROJECT_REF}",
        management_token,
    )
    if not isinstance(project, dict) or (
        project.get("id"), project.get("status"), project.get("region")
    ) != (EXPECTED_PROJECT_REF, "ACTIVE_HEALTHY", "ap-south-1"):
        raise EphemeralIdentityError(
            "The reviewed staging project is not ACTIVE_HEALTHY in ap-south-1"
        )


def _mask(value: str) -> None:
    if "\n" in value or "\r" in value:
        raise EphemeralIdentityError("Refusing to mask a multiline credential")
    print(f"::add-mask::{value}")


def _write_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(state, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        path.chmod(0o600)
    finally:
        if temporary.exists():
            temporary.unlink()


def _read_state(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    state = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(state, dict):
        raise EphemeralIdentityError("Ephemeral identity state must be an object")
    if state.get("version") != STATE_VERSION:
        raise EphemeralIdentityError("Unsupported ephemeral identity state version")
    if state.get("project_ref") != EXPECTED_PROJECT_REF:
        raise EphemeralIdentityError("Refusing cleanup for a different Supabase project")
    return state


def _append_job_environment(values: dict[str, str]) -> None:
    destination = Path(_required("GITHUB_ENV"))
    with destination.open("a", encoding="utf-8") as handle:
        for key, value in values.items():
            if "\n" in value or "\r" in value:
                raise EphemeralIdentityError(f"Refusing multiline GitHub environment value {key}")
            handle.write(f"{key}={value}\n")


def _clear_browser_environment() -> None:
    destination = os.getenv("GITHUB_ENV", "").strip()
    if not destination:
        return
    with Path(destination).open("a", encoding="utf-8") as handle:
        for key in (
            "PLAYWRIGHT_LIVE_EMAIL",
            "PLAYWRIGHT_LIVE_PASSWORD",
            "PLAYWRIGHT_SALES_CHAIN_FIXTURE",
            "PLAYWRIGHT_LIVE_REQUESTER_EMAIL",
            "PLAYWRIGHT_LIVE_REQUESTER_PASSWORD",
            "LIVE18_REQUESTER_EMAIL",
            "LIVE18_REQUESTER_PASSWORD",
            "LIVE18_REVIEWER_EMAIL",
            "LIVE18_REVIEWER_PASSWORD",
            "LIVE18_DENIAL_ACCESS_TOKEN",
            "LIVE18_DENIAL_AUTH_USER_ID",
            "LIVE18_EXPECTED_ORG_ID",
            "LIVE18_EXPECTED_BRANCH_ID",
            "LIVE18_EXPECTED_DENIAL_ORG_ID",
            "PLAYWRIGHT_LIVE_REVIEWER_EMAIL",
            "PLAYWRIGHT_LIVE_REVIEWER_PASSWORD",
        ):
            handle.write(f"{key}=\n")


def _admin_request(
    method: str,
    path: str,
    authority: SupabaseAuthAdminAuthority,
    *,
    payload: dict[str, Any] | None = None,
    params: dict[str, Any] | None = None,
    allow_missing: bool = False,
) -> Any:
    try:
        return auth_admin_request(
            authority,
            method,
            path,
            payload=payload,
            params=params,
            allow_missing=allow_missing,
        )
    except SupabaseAuthAdminError as error:
        raise EphemeralIdentityError(
            f"Supabase Auth Admin request blocked: {error.code}"
        ) from error


def _create_auth_user(
    authority: SupabaseAuthAdminAuthority,
    *,
    purpose: str,
    role: str,
    run_token: str,
    email: str,
    password: str,
    organization_id: str = DEMO_ORG_ID,
) -> str:
    result = _admin_request(
        "POST",
        "users",
        authority,
        payload={
            "email": email,
            "password": password,
            "email_confirm": True,
            "app_metadata": {
                "purpose": purpose,
                "ephemeral_run_token": run_token,
                "browser_role": role,
                "org_id": organization_id,
            },
        },
    )
    user_id = result.get("id") if isinstance(result, dict) else None
    confirmed_at = (
        result.get("email_confirmed_at") or result.get("confirmed_at")
        if isinstance(result, dict)
        else None
    )
    if not isinstance(confirmed_at, str) or not confirmed_at.strip():
        raise EphemeralIdentityError(
            f"Disposable {role} Auth identity was not confirmed"
        )
    try:
        return str(UUID(str(user_id)))
    except (TypeError, ValueError) as exc:
        raise EphemeralIdentityError(
            f"Disposable {role} Auth response omitted a canonical UUID"
        ) from exc


def _list_run_auth_user_ids(
    authority: SupabaseAuthAdminAuthority, run_token: str, purpose: str
) -> set[str]:
    matches: set[str] = set()
    for page in range(1, 11):
        result = _admin_request(
            "GET", "users", authority,
            params={"page": page, "per_page": 1000},
        )
        users = result.get("users", []) if isinstance(result, dict) else []
        if not isinstance(users, list):
            raise EphemeralIdentityError("Supabase Auth user listing was malformed")
        for user in users:
            metadata = user.get("app_metadata", {}) if isinstance(user, dict) else {}
            if (
                isinstance(metadata, dict)
                and metadata.get("purpose") == purpose
                and metadata.get("ephemeral_run_token") == run_token
            ):
                matches.add(str(UUID(str(user["id"]))))
        if len(users) < 1000:
            break
    else:
        raise EphemeralIdentityError("Supabase Auth user listing exceeded 10 pages")
    return matches


def _list_purpose_auth_user_ids(
    authority: SupabaseAuthAdminAuthority, purpose: str
) -> set[str]:
    """Find stale disposable users without depending on a lost runner state file."""

    matches: set[str] = set()
    for page in range(1, 11):
        result = _admin_request(
            "GET", "users", authority,
            params={"page": page, "per_page": 1000},
        )
        users = result.get("users", []) if isinstance(result, dict) else []
        if not isinstance(users, list):
            raise EphemeralIdentityError("Supabase Auth user listing was malformed")
        for user in users:
            metadata = user.get("app_metadata", {}) if isinstance(user, dict) else {}
            if isinstance(metadata, dict) and metadata.get("purpose") == purpose:
                matches.add(str(UUID(str(user["id"]))))
        if len(users) < 1000:
            break
    else:
        raise EphemeralIdentityError("Supabase Auth user listing exceeded 10 pages")
    return matches


def _delete_auth_user(
    authority: SupabaseAuthAdminAuthority, auth_user_id: str
) -> None:
    last_error: EphemeralIdentityError | None = None
    for attempt in range(3):
        try:
            _admin_request(
                "DELETE", f"users/{UUID(auth_user_id)}", authority,
                allow_missing=True,
            )
            return
        except EphemeralIdentityError as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(2**attempt)
    assert last_error is not None
    raise last_error


def _database_connection(management_token: str):
    password = _required("SUPABASE_DB_PASSWORD")
    transport = os.getenv("CANONICAL_EPHEMERAL_DATABASE_TRANSPORT", "").strip()
    if transport == RAILWAY_DIRECT_DATABASE_TRANSPORT:
        return psycopg2.connect(
            host=f"db.{EXPECTED_PROJECT_REF}.supabase.co",
            port=5432,
            dbname="postgres",
            user="postgres",
            password=password,
            sslmode="require",
            gssencmode="disable",
            connect_timeout=15,
            application_name="canonical_ephemeral_browser_identities_railway_direct",
        )
    if transport != DIRECT_IPV4_DATABASE_TRANSPORT:
        raise EphemeralIdentityError(
            "Unsupported ephemeral database transport; refusing an implicit fallback"
        )
    contract = load_direct_database_contract()
    if contract.project_ref != EXPECTED_PROJECT_REF:
        raise EphemeralIdentityError(
            "Ephemeral identity project does not match direct database authority"
        )
    return psycopg2.connect(
        host=contract.host,
        port=contract.port,
        dbname=contract.database,
        user=contract.administrator_role,
        password=password,
        sslmode="require",
        gssencmode="disable",
        connect_timeout=contract.connect_timeout_seconds,
        application_name="canonical_ephemeral_browser_identities_direct_ipv4",
    )


def _enter_migration_owner(cursor) -> bool:
    """Borrow owner SET authority only for this transaction's staging fixture."""

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


def _terminalize_live18_denial_authority(
    cursor, targets: list[tuple[str, str]]
) -> None:
    """Revoke disposable denial authority without erasing consent history."""

    if not targets:
        return
    normalized_targets: list[dict[str, str]] = []
    for user_id, auth_user_id in targets:
        try:
            normalized_targets.append(
                {
                    "user_id": str(UUID(user_id)),
                    "auth_user_id": str(UUID(auth_user_id)),
                }
            )
        except (TypeError, ValueError) as exc:
            raise EphemeralIdentityError(
                "Disposable denial cleanup target is not an exact UUID pair"
            ) from exc
    target_json = json.dumps(normalized_targets, separators=(",", ":"))
    cursor.execute(
        """
        WITH targets AS (
          SELECT * FROM jsonb_to_recordset(%s::jsonb)
            AS target(user_id uuid,auth_user_id uuid)
        )
        SELECT count(*)
          FROM targets
          JOIN core.users AS user_row ON user_row.id=targets.user_id
         WHERE (
                 user_row.auth_user_id=targets.auth_user_id
                 OR (user_row.auth_user_id IS NULL AND user_row.status='disabled')
               )
           AND EXISTS (
                 SELECT 1 FROM core.memberships AS denial_membership
                  WHERE denial_membership.user_id=user_row.id
                    AND denial_membership.org_id=%s
                    AND denial_membership.id<>%s
               )
           AND NOT EXISTS (
                 SELECT 1 FROM core.memberships AS other_membership
                  WHERE other_membership.user_id=user_row.id
                    AND other_membership.org_id<>%s
               )
        """,
        (
            target_json,
            DENIAL_ORG_ID,
            DENIAL_CREATOR_MEMBERSHIP_ID,
            DENIAL_ORG_ID,
        ),
    )
    if cursor.fetchone() != (len(normalized_targets),):
        raise EphemeralIdentityError(
            "Disposable denial cleanup target is not exact and tenant-scoped"
        )
    cursor.execute(
        """
        WITH targets AS (
          SELECT * FROM jsonb_to_recordset(%s::jsonb)
            AS target(user_id uuid,auth_user_id uuid)
        )
        UPDATE automation.agent_grant_capabilities AS capability
           SET status='revoked',revoked_at=transaction_timestamp(),
               revoked_by_membership_id=%s
          FROM automation.agent_grants AS grant_row,
               core.memberships AS membership,core.users AS user_row,targets
         WHERE capability.org_id=grant_row.org_id
           AND capability.agent_grant_id=grant_row.id
           AND grant_row.org_id=%s
           AND grant_row.consent_version=%s
           AND membership.org_id=grant_row.org_id
           AND membership.id=grant_row.subject_membership_id
           AND user_row.id=membership.user_id
           AND targets.user_id=user_row.id
           AND targets.auth_user_id=user_row.auth_user_id
           AND capability.status='active'
        """,
        (
            target_json,
            DENIAL_CREATOR_MEMBERSHIP_ID,
            DENIAL_ORG_ID,
            LIVE18_DENIAL_CONSENT_VERSION,
        ),
    )
    cursor.execute(
        """
        WITH targets AS (
          SELECT * FROM jsonb_to_recordset(%s::jsonb)
            AS target(user_id uuid,auth_user_id uuid)
        )
        UPDATE automation.agent_grants AS grant_row
           SET status='revoked',revoked_at=transaction_timestamp(),
               revoked_by_membership_id=%s,
               revocation_reason=%s,
               updated_at=transaction_timestamp(),
               updated_by_membership_id=%s,row_version=grant_row.row_version+1
          FROM core.memberships AS membership,core.users AS user_row,targets
         WHERE grant_row.org_id=%s
           AND membership.org_id=grant_row.org_id
           AND membership.id=grant_row.subject_membership_id
           AND user_row.id=membership.user_id
           AND targets.user_id=user_row.id
           AND targets.auth_user_id=user_row.auth_user_id
           AND grant_row.consent_version=%s
           AND grant_row.status IN ('active','suspended')
        """,
        (
            target_json,
            DENIAL_CREATOR_MEMBERSHIP_ID,
            LIVE18_DENIAL_CLEANUP_REASON,
            DENIAL_CREATOR_MEMBERSHIP_ID,
            DENIAL_ORG_ID,
            LIVE18_DENIAL_CONSENT_VERSION,
        ),
    )
    cursor.execute(
        """
        WITH targets AS (
          SELECT * FROM jsonb_to_recordset(%s::jsonb)
            AS target(user_id uuid,auth_user_id uuid)
        )
        UPDATE core.access_grants AS access_grant
           SET status='revoked',revoked_at=transaction_timestamp(),
               revoked_by_membership_id=%s,
               revocation_reason=%s,
               row_version=access_grant.row_version+1
          FROM core.memberships AS membership,core.users AS user_row,
               core.roles AS role,targets
         WHERE access_grant.org_id=%s
           AND membership.org_id=access_grant.org_id
           AND membership.id=access_grant.membership_id
           AND user_row.id=membership.user_id
           AND targets.user_id=user_row.id
           AND targets.auth_user_id=user_row.auth_user_id
           AND role.org_id=access_grant.org_id
           AND role.id=access_grant.role_id
           AND role.code LIKE %s
           AND access_grant.status='active'
        """,
        (
            target_json,
            DENIAL_CREATOR_MEMBERSHIP_ID,
            LIVE18_DENIAL_CLEANUP_REASON,
            DENIAL_ORG_ID,
            f"{LIVE18_DENIAL_ROLE_PREFIX}%",
        ),
    )
    cursor.execute(
        """
        WITH targets AS (
          SELECT * FROM jsonb_to_recordset(%s::jsonb)
            AS target(user_id uuid,auth_user_id uuid)
        )
        UPDATE core.roles AS role
           SET status='disabled',updated_at=transaction_timestamp(),
               updated_by_membership_id=%s,row_version=role.row_version+1
          FROM core.access_grants AS access_grant,
               core.memberships AS membership,core.users AS user_row,targets
         WHERE role.org_id=%s AND role.code LIKE %s
           AND access_grant.org_id=role.org_id
           AND access_grant.role_id=role.id
           AND membership.org_id=access_grant.org_id
           AND membership.id=access_grant.membership_id
           AND user_row.id=membership.user_id
           AND targets.user_id=user_row.id
           AND targets.auth_user_id=user_row.auth_user_id
           AND role.status='active'
        """,
        (
            target_json,
            DENIAL_CREATOR_MEMBERSHIP_ID,
            DENIAL_ORG_ID,
            f"{LIVE18_DENIAL_ROLE_PREFIX}%",
        ),
    )
    cursor.execute(
        """
        WITH targets AS (
          SELECT * FROM jsonb_to_recordset(%s::jsonb)
            AS target(user_id uuid,auth_user_id uuid)
        )
        UPDATE core.memberships AS membership
           SET status='revoked',revoked_at=transaction_timestamp(),
               revocation_reason=%s,
               updated_at=transaction_timestamp(),
               updated_by_membership_id=%s,row_version=membership.row_version+1
          FROM core.users AS user_row,targets
         WHERE membership.org_id=%s AND user_row.id=membership.user_id
           AND targets.user_id=user_row.id
           AND targets.auth_user_id=user_row.auth_user_id
           AND membership.id<>%s
           AND membership.status IN ('active','suspended')
        """,
        (
            target_json,
            LIVE18_DENIAL_CLEANUP_REASON,
            DENIAL_CREATOR_MEMBERSHIP_ID,
            DENIAL_ORG_ID,
            DENIAL_CREATOR_MEMBERSHIP_ID,
        ),
    )
    cursor.execute(
        """
        WITH targets AS (
          SELECT * FROM jsonb_to_recordset(%s::jsonb)
            AS target(user_id uuid,auth_user_id uuid)
        )
        UPDATE core.users AS user_row
           SET auth_user_id=NULL,status='disabled',
               updated_at=transaction_timestamp(),
               row_version=user_row.row_version+1
          FROM targets
         WHERE targets.user_id=user_row.id
           AND targets.auth_user_id=user_row.auth_user_id
           AND user_row.id NOT IN (%s::uuid,%s::uuid)
           AND user_row.status<>'anonymized'
        """,
        (target_json, DEMO_OPERATOR_USER_ID, DEMO_REVIEWER_USER_ID),
    )
    cursor.execute(
        """
        WITH targets AS (
          SELECT * FROM jsonb_to_recordset(%s::jsonb)
            AS target(user_id uuid,auth_user_id uuid)
        )
        SELECT count(*)
          FROM targets
         WHERE EXISTS (
                 SELECT 1 FROM core.users AS user_row
                  WHERE user_row.id=targets.user_id
                    AND user_row.auth_user_id IS NULL
                    AND user_row.status='disabled'
               )
           AND 1=(
                 SELECT count(*) FROM core.memberships AS membership
                  WHERE membership.org_id=%s
                    AND membership.user_id=targets.user_id
                    AND membership.id<>%s
                    AND membership.status='revoked'
               )
           AND 1=(
                 SELECT count(*) FROM core.access_grants AS access_grant
                   JOIN core.memberships AS membership
                     ON membership.org_id=access_grant.org_id
                    AND membership.id=access_grant.membership_id
                   JOIN core.roles AS role
                     ON role.org_id=access_grant.org_id
                    AND role.id=access_grant.role_id
                  WHERE membership.user_id=targets.user_id
                    AND membership.org_id=%s
                    AND role.code LIKE %s
                    AND access_grant.status IN ('revoked','expired')
                    AND role.status='disabled'
               )
           AND 1=(
                 SELECT count(*) FROM automation.agent_grants AS grant_row
                   JOIN core.memberships AS membership
                     ON membership.org_id=grant_row.org_id
                    AND membership.id=grant_row.subject_membership_id
                  WHERE membership.user_id=targets.user_id
                    AND membership.org_id=%s
                    AND grant_row.consent_version=%s
                    AND grant_row.status IN ('revoked','expired')
               )
           AND 1=(
                 SELECT count(*)
                   FROM automation.agent_grant_capabilities AS capability
                   JOIN automation.agent_grants AS grant_row
                     ON grant_row.org_id=capability.org_id
                    AND grant_row.id=capability.agent_grant_id
                   JOIN core.memberships AS membership
                     ON membership.org_id=grant_row.org_id
                    AND membership.id=grant_row.subject_membership_id
                  WHERE membership.user_id=targets.user_id
                    AND membership.org_id=%s
                    AND grant_row.consent_version=%s
                    AND capability.status='revoked'
               )
        """,
        (
            target_json,
            DENIAL_ORG_ID,
            DENIAL_CREATOR_MEMBERSHIP_ID,
            DENIAL_ORG_ID,
            f"{LIVE18_DENIAL_ROLE_PREFIX}%",
            DENIAL_ORG_ID,
            LIVE18_DENIAL_CONSENT_VERSION,
            DENIAL_ORG_ID,
            LIVE18_DENIAL_CONSENT_VERSION,
        ),
    )
    verified = cursor.fetchone()
    if verified != (len(normalized_targets),):
        raise EphemeralIdentityError(
            "Disposable denial authority did not reach its exact terminal boundary"
        )


def _recover_stale_live18_database(
    management_token: str, stale_auth_user_ids: set[str]
) -> None:
    """Restore fixed demo bindings and remove abandoned denial identities."""

    stale_ids = sorted(stale_auth_user_ids)
    with _database_connection(management_token) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                (LOCK_KEY,),
            )
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")
            membership_options = _enter_migration_owner(cursor)
            _set_reviewer_context(cursor)
            cursor.execute(
                """
                SELECT count(*),
                       count(*) FILTER (
                         WHERE consent_version IN (
                           'browser-e2e-v1','canonical-live-e2e-v1'
                         )
                       )
                  FROM automation.agent_grants
                 WHERE org_id=%s
                   AND subject_membership_id IN (%s::uuid,%s::uuid)
                   AND client_id=%s
                   AND status='active'
                """,
                (
                    DEMO_ORG_ID,
                    DEMO_OPERATOR_MEMBERSHIP_ID,
                    DEMO_REVIEWER_MEMBERSHIP_ID,
                    WEB_CLIENT_ID,
                ),
            )
            temporary_count_row = cursor.fetchone()
            if (
                not isinstance(temporary_count_row, tuple)
                or len(temporary_count_row) != 2
                or any(
                    type(value) is not int or value < 0
                    for value in temporary_count_row
                )
            ):
                raise EphemeralIdentityError(
                    "Live18 temporary grant recovery count was not exact"
                )
            (
                active_web_grant_count,
                active_temporary_grant_count,
            ) = temporary_count_row
            if active_web_grant_count != active_temporary_grant_count:
                raise EphemeralIdentityError(
                    "Live18 recovery found active web authority outside the "
                    "ephemeral grant boundary"
                )
            cursor.execute(
                """
                SELECT temporary.id::text,
                       temporary.subject_membership_id::text,
                       capability.capability_code,
                       capability.operation_mode,
                       capability.risk_class,
                       capability.approval_policy,
                       capability.maximum_amount,
                       capability.currency_code,
                       capability.allow_sensitive_read,
                       capability.status
                  FROM automation.agent_grants AS temporary
                  JOIN automation.agent_grant_capabilities AS capability
                    ON capability.org_id=temporary.org_id
                   AND capability.agent_grant_id=temporary.id
                 WHERE temporary.org_id=%s
                   AND temporary.client_id=%s
                   AND temporary.consent_version='browser-e2e-v1'
                   AND temporary.authorization_mode='self_consent'
                   AND temporary.branch_id IS NULL
                   AND temporary.consented_by_membership_id=
                       temporary.subject_membership_id
                   AND temporary.granted_by_membership_id=%s::uuid
                   AND temporary.created_by_membership_id=%s::uuid
                   AND temporary.updated_by_membership_id=%s::uuid
                   AND temporary.consented_at=temporary.granted_at
                   AND temporary.expires_at=
                       temporary.granted_at + interval '2 hours'
                   AND temporary.expires_at>transaction_timestamp()
                   AND temporary.status='active'
                   AND (
                     (temporary.subject_membership_id=%s::uuid AND
                      temporary.client_display_name=
                        'Ephemeral staging browser requester') OR
                     (temporary.subject_membership_id=%s::uuid AND
                      temporary.client_display_name=
                        'Ephemeral staging browser reviewer')
                   )
                 ORDER BY temporary.subject_membership_id,
                          capability.capability_code
                 FOR UPDATE OF temporary,capability
                """,
                (
                    DEMO_ORG_ID,
                    WEB_CLIENT_ID,
                    DEMO_REVIEWER_MEMBERSHIP_ID,
                    DEMO_REVIEWER_MEMBERSHIP_ID,
                    DEMO_REVIEWER_MEMBERSHIP_ID,
                    DEMO_OPERATOR_MEMBERSHIP_ID,
                    DEMO_REVIEWER_MEMBERSHIP_ID,
                ),
            )
            temporary_rows = cursor.fetchall()
            actual_temporary_bounds: dict[str, list[dict[str, object]]] = {}
            grant_ids_by_membership: dict[str, set[str]] = {}
            for row in temporary_rows:
                grant_ids_by_membership.setdefault(row[1], set()).add(row[0])
                actual_temporary_bounds.setdefault(row[1], []).append(
                    {
                        "capability_code": row[2],
                        "operation_mode": row[3],
                        "risk_class": row[4],
                        "approval_policy": row[5],
                        "maximum_amount": row[6],
                        "currency_code": row[7],
                        "allow_sensitive_read": row[8],
                        "status": row[9],
                    }
                )
            normalized_temporary_bounds = {
                membership_id: tuple(bounds)
                for membership_id, bounds in actual_temporary_bounds.items()
            }
            exact_temporary_pair = (
                set(grant_ids_by_membership)
                == set(LIVE18_TEMPORARY_CAPABILITY_BOUNDS)
                and all(
                    len(grant_ids) == 1
                    for grant_ids in grant_ids_by_membership.values()
                )
                and normalized_temporary_bounds == LIVE18_TEMPORARY_CAPABILITY_BOUNDS
            )
            if active_temporary_grant_count not in (0, 2) or (
                active_temporary_grant_count == 0 and temporary_rows
            ) or (
                active_temporary_grant_count == 2 and not exact_temporary_pair
            ):
                raise EphemeralIdentityError(
                    "Live18 temporary grants do not match the exact ephemeral authority"
                )
            cursor.execute(
                """
                UPDATE core.users
                   SET auth_user_id=CASE id
                         WHEN %s::uuid THEN %s::uuid
                         WHEN %s::uuid THEN %s::uuid
                       END,
                       updated_at=transaction_timestamp(),row_version=row_version+1
                 WHERE id IN (%s::uuid,%s::uuid)
                   AND auth_user_id=ANY(CAST(%s AS uuid[]))
                """,
                (
                    DEMO_OPERATOR_USER_ID,
                    DEMO_OPERATOR_AUTH_USER_ID,
                    DEMO_REVIEWER_USER_ID,
                    DEMO_REVIEWER_AUTH_USER_ID,
                    DEMO_OPERATOR_USER_ID,
                    DEMO_REVIEWER_USER_ID,
                    stale_ids,
                ),
            )
            cursor.execute(
                """
                UPDATE automation.agent_grants
                   SET status='suspended',suspended_at=transaction_timestamp(),
                       updated_at=transaction_timestamp(),row_version=row_version+1
                 WHERE org_id=%s
                   AND subject_membership_id IN (%s::uuid,%s::uuid)
                   AND client_id=%s
                   AND consent_version IN ('browser-e2e-v1','canonical-live-e2e-v1')
                   AND status='active'
                """,
                (
                    DEMO_ORG_ID,
                    DEMO_OPERATOR_MEMBERSHIP_ID,
                    DEMO_REVIEWER_MEMBERSHIP_ID,
                    WEB_CLIENT_ID,
                ),
            )
            cursor.execute(
                """
                SELECT user_row.id::text,user_row.auth_user_id::text,
                       EXISTS (
                         SELECT 1 FROM core.memberships AS denial_membership
                          WHERE denial_membership.user_id=user_row.id
                            AND denial_membership.org_id=%s
                            AND denial_membership.id<>%s
                       ),
                       EXISTS (
                         SELECT 1 FROM core.memberships AS other_membership
                          WHERE other_membership.user_id=user_row.id
                            AND other_membership.org_id<>%s
                       )
                  FROM core.users AS user_row
                 WHERE user_row.auth_user_id=ANY(CAST(%s AS uuid[]))
                """,
                (
                    DENIAL_ORG_ID,
                    DENIAL_CREATOR_MEMBERSHIP_ID,
                    DENIAL_ORG_ID,
                    stale_ids,
                ),
            )
            denial_targets = []
            for (
                user_id,
                auth_user_id,
                has_denial_membership,
                has_other_membership,
            ) in cursor.fetchall():
                if has_denial_membership and has_other_membership:
                    raise EphemeralIdentityError(
                        "Disposable denial Auth identity is bound across organizations"
                    )
                if has_denial_membership:
                    denial_targets.append((user_id, auth_user_id))
            _set_denial_context(cursor)
            _terminalize_live18_denial_authority(cursor, denial_targets)
            cursor.execute(
                """
                SELECT auth_user_id::text
                  FROM core.users
                 WHERE auth_user_id=ANY(CAST(%s AS uuid[]))
                """,
                (stale_ids,),
            )
            unclassified_bindings = cursor.fetchall()
            if unclassified_bindings:
                raise EphemeralIdentityError(
                    "Disposable Auth identity has an unclassified database binding"
                )
            _leave_migration_owner(cursor, membership_options)


def _live18_denial_residue_counts(cursor) -> tuple[int, int, int]:
    """Count denial residue without depending on intact access/role joins."""

    cursor.execute(
        """
        SELECT
          (SELECT count(*) FROM core.roles
            WHERE org_id=%s::uuid AND code LIKE %s
              AND status='active'),
          (
            (SELECT count(*) FROM automation.agent_grant_capabilities AS capability
              JOIN automation.agent_grants AS grant_row
                ON grant_row.org_id=capability.org_id
               AND grant_row.id=capability.agent_grant_id
             WHERE capability.org_id=%s::uuid
               AND grant_row.consent_version=%s
               AND capability.status='active')
            +(SELECT count(*) FROM automation.agent_grants
               WHERE org_id=%s::uuid
                 AND consent_version=%s
                 AND status IN ('pending_consent','active','suspended'))
            +(SELECT count(*) FROM core.access_grants
               WHERE org_id=%s::uuid AND membership_id<>%s::uuid
                 AND status='active')
            +(SELECT count(*) FROM core.memberships
               WHERE org_id=%s::uuid AND id<>%s::uuid
                 AND status IN ('active','suspended'))
          ),
          (SELECT count(DISTINCT user_row.id)
             FROM core.users AS user_row
             JOIN core.memberships AS membership
               ON membership.user_id=user_row.id
            WHERE membership.org_id=%s::uuid
              AND membership.id<>%s::uuid
              AND user_row.auth_user_id IS NOT NULL)
        """,
        (
            DENIAL_ORG_ID,
            f"{LIVE18_DENIAL_ROLE_PREFIX}%",
            DENIAL_ORG_ID,
            LIVE18_DENIAL_CONSENT_VERSION,
            DENIAL_ORG_ID,
            LIVE18_DENIAL_CONSENT_VERSION,
            DENIAL_ORG_ID,
            DENIAL_CREATOR_MEMBERSHIP_ID,
            DENIAL_ORG_ID,
            DENIAL_CREATOR_MEMBERSHIP_ID,
            DENIAL_ORG_ID,
            DENIAL_CREATOR_MEMBERSHIP_ID,
        ),
    )
    value = cursor.fetchone()
    if (
        not isinstance(value, tuple)
        or len(value) != 3
        or any(type(count) is not int or count < 0 for count in value)
    ):
        raise EphemeralIdentityError("Live18 denial residue query was not exact")
    return value


def _live18_database_boundary(
    management_token: str,
) -> tuple[Live18IdentityBoundary, tuple[int, int, int]]:
    with _database_connection(management_token) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                (LOCK_KEY,),
            )
            membership_options = _enter_migration_owner(cursor)
            cursor.execute(
                """
                WITH ids AS (
                  SELECT
                    %s::uuid AS demo_org_id,
                    %s::uuid AS denial_org_id,
                    %s::uuid AS operator_user_id,
                    %s::uuid AS reviewer_user_id,
                    %s::uuid AS operator_auth_user_id,
                    %s::uuid AS reviewer_auth_user_id,
                    %s::uuid AS operator_membership_id,
                    %s::uuid AS reviewer_membership_id,
                    %s::uuid AS denial_creator_membership_id,
                    %s::uuid AS demo_role_id,
                    %s::varchar AS web_client_id,
                    %s::jsonb AS operator_capability_bounds,
                    %s::jsonb AS reviewer_capability_bounds
                ),
                exact_baseline_grants AS (
                  SELECT grant_row.id,grant_row.subject_membership_id
                    FROM automation.agent_grants AS grant_row
                    CROSS JOIN ids
                   WHERE grant_row.org_id=ids.demo_org_id
                     AND grant_row.client_id=ids.web_client_id
                     AND grant_row.authorization_mode='self_consent'
                     AND grant_row.branch_id IS NULL
                     AND grant_row.suspended_at IS NULL
                     AND grant_row.consented_by_membership_id=
                         grant_row.subject_membership_id
                     AND grant_row.granted_by_membership_id=
                         grant_row.subject_membership_id
                     AND grant_row.consented_at=grant_row.granted_at
                     AND grant_row.expires_at=
                         grant_row.granted_at + interval '30 days'
                     AND grant_row.created_by_membership_id=
                         ids.reviewer_membership_id
                     AND grant_row.updated_by_membership_id=
                         ids.reviewer_membership_id
                     AND grant_row.status='active'
                     AND grant_row.expires_at>transaction_timestamp()
                     AND (
                       (grant_row.subject_membership_id=
                          ids.operator_membership_id AND
                        grant_row.client_display_name=
                          'Canonical staging demo runner' AND
                        grant_row.consent_version='demo-v2' AND
                        grant_row.consent_text_hash=extensions.digest(
                          'canonical staging demo consent; INR 1000000 maximum',
                          'sha256'
                        )) OR
                       (grant_row.subject_membership_id=
                          ids.reviewer_membership_id AND
                        grant_row.client_display_name=
                          'Canonical staging independent approver' AND
                        grant_row.consent_version='demo-v2-approver' AND
                        grant_row.consent_text_hash=extensions.digest(
                          'canonical staging independent approval consent',
                          'sha256'
                        ))
                     )
                )
                SELECT jsonb_build_object(
                  'operator_auth_user_id',
                    (SELECT auth_user_id::text FROM core.users,ids
                      WHERE id=ids.operator_user_id),
                  'reviewer_auth_user_id',
                    (SELECT auth_user_id::text FROM core.users,ids
                      WHERE id=ids.reviewer_user_id),
                  'target_organization_count',
                    (SELECT count(*) FROM core.organizations,ids
                      WHERE id IN (ids.demo_org_id,ids.denial_org_id)),
                  'active_target_organization_count',
                    (SELECT count(*) FROM core.organizations,ids
                      WHERE id IN (ids.demo_org_id,ids.denial_org_id)
                        AND status='active'),
                  'target_user_count',
                    (SELECT count(*) FROM core.users,ids
                      WHERE id IN (ids.operator_user_id,ids.reviewer_user_id)),
                  'exact_active_user_count',
                    (SELECT count(*) FROM core.users,ids
                      WHERE status='active' AND (
                        (id=ids.operator_user_id AND
                         auth_user_id=ids.operator_auth_user_id) OR
                        (id=ids.reviewer_user_id AND
                         auth_user_id=ids.reviewer_auth_user_id)
                      )),
                  'target_demo_membership_count',
                    (SELECT count(*) FROM core.memberships,ids
                      WHERE org_id=ids.demo_org_id AND id IN (
                        ids.operator_membership_id,ids.reviewer_membership_id
                      )),
                  'exact_active_demo_membership_count',
                    (SELECT count(*) FROM core.memberships,ids
                      WHERE org_id=ids.demo_org_id AND status='active' AND (
                        (id=ids.operator_membership_id AND
                         user_id=ids.operator_user_id) OR
                        (id=ids.reviewer_membership_id AND
                         user_id=ids.reviewer_user_id)
                      )),
                  'denial_creator_membership_count',
                    (SELECT count(*) FROM core.memberships,ids
                      WHERE org_id=ids.denial_org_id
                        AND id=ids.denial_creator_membership_id),
                  'exact_active_denial_creator_membership_count',
                    (SELECT count(*) FROM core.memberships,ids
                      WHERE org_id=ids.denial_org_id
                        AND id=ids.denial_creator_membership_id
                        AND user_id=ids.operator_user_id AND status='active'),
                  'active_demo_access_grant_count',
                    (SELECT count(*) FROM core.access_grants,ids
                      WHERE org_id=ids.demo_org_id
                        AND membership_id IN (
                          ids.operator_membership_id,ids.reviewer_membership_id
                        )
                        AND status='active'
                        AND valid_from_at<=transaction_timestamp()
                        AND (expires_at IS NULL OR
                             expires_at>transaction_timestamp())),
                  'exact_active_demo_access_grant_count',
                    (SELECT count(DISTINCT access_grant.membership_id)
                       FROM core.access_grants AS access_grant
                       JOIN core.memberships AS membership
                         ON membership.org_id=access_grant.org_id
                        AND membership.id=access_grant.membership_id
                       JOIN core.roles AS role
                         ON role.org_id=access_grant.org_id
                        AND role.id=access_grant.role_id
                       CROSS JOIN ids
                      WHERE access_grant.org_id=ids.demo_org_id
                        AND access_grant.membership_id IN (
                          ids.operator_membership_id,ids.reviewer_membership_id
                        )
                        AND access_grant.scope_kind='organization'
                        AND access_grant.branch_id IS NULL
                        AND access_grant.created_by_membership_id=
                            ids.reviewer_membership_id
                        AND access_grant.status='active'
                        AND access_grant.valid_from_at<=transaction_timestamp()
                        AND access_grant.expires_at=
                            access_grant.valid_from_at + interval '30 days'
                        AND access_grant.expires_at>transaction_timestamp()
                        AND membership.status='active'
                        AND role.id=ids.demo_role_id
                        AND role.code='demo_operator'
                        AND role.status='active'),
                  'active_web_grant_count',
                    (SELECT count(*) FROM automation.agent_grants,ids
                      WHERE org_id=ids.demo_org_id
                        AND subject_membership_id IN (
                          ids.operator_membership_id,ids.reviewer_membership_id
                        )
                        AND client_id=ids.web_client_id AND status='active'
                        AND expires_at>transaction_timestamp()),
                  'exact_active_baseline_web_grant_count',
                    (SELECT count(*) FROM exact_baseline_grants),
                  'exact_active_baseline_capability_grant_count',
                    (SELECT count(*) FROM (
                      SELECT baseline.id
                        FROM exact_baseline_grants AS baseline
                        JOIN automation.agent_grant_capabilities AS capability
                          ON capability.org_id=(SELECT demo_org_id FROM ids)
                         AND capability.agent_grant_id=baseline.id
                        CROSS JOIN ids
                      GROUP BY baseline.id,baseline.subject_membership_id,
                                ids.operator_membership_id,
                                ids.operator_capability_bounds,
                                ids.reviewer_capability_bounds
                      HAVING jsonb_agg(
                               jsonb_build_object(
                                 'capability_code',capability.capability_code,
                                 'operation_mode',capability.operation_mode,
                                 'risk_class',capability.risk_class,
                                 'approval_policy',capability.approval_policy,
                                 'maximum_amount',capability.maximum_amount,
                                 'currency_code',capability.currency_code,
                                 'allow_sensitive_read',
                                   capability.allow_sensitive_read,
                                 'status',capability.status
                               ) ORDER BY capability.capability_code
                             )=
                             CASE
                               WHEN baseline.subject_membership_id=
                                    ids.operator_membership_id
                               THEN ids.operator_capability_bounds
                               ELSE ids.reviewer_capability_bounds
                             END
                    ) AS exact_capability_set),
                  'active_temporary_grant_count',
                    (SELECT count(*) FROM automation.agent_grants,ids
                      WHERE org_id=ids.demo_org_id
                        AND subject_membership_id IN (
                          ids.operator_membership_id,ids.reviewer_membership_id
                        )
                        AND client_id=ids.web_client_id
                        AND consent_version IN (
                          'browser-e2e-v1','canonical-live-e2e-v1'
                        ) AND status='active')
                )
                """,
                (
                    DEMO_ORG_ID,
                    DENIAL_ORG_ID,
                    DEMO_OPERATOR_USER_ID,
                    DEMO_REVIEWER_USER_ID,
                    DEMO_OPERATOR_AUTH_USER_ID,
                    DEMO_REVIEWER_AUTH_USER_ID,
                    DEMO_OPERATOR_MEMBERSHIP_ID,
                    DEMO_REVIEWER_MEMBERSHIP_ID,
                    DENIAL_CREATOR_MEMBERSHIP_ID,
                    DEMO_ROLE_ID,
                    WEB_CLIENT_ID,
                    json.dumps(LIVE18_BASELINE_OPERATOR_CAPABILITY_BOUNDS),
                    json.dumps(LIVE18_BASELINE_REVIEWER_CAPABILITY_BOUNDS),
                ),
            )
            row = cursor.fetchone()
            expected_fields = set(Live18IdentityBoundary._fields)
            if (
                not isinstance(row, tuple)
                or len(row) != 1
                or not isinstance(row[0], dict)
                or set(row[0]) != expected_fields
                or any(
                    type(row[0][name]) is not int or row[0][name] < 0
                    for name in expected_fields
                    if name not in {
                        "operator_auth_user_id",
                        "reviewer_auth_user_id",
                    }
                )
                or any(
                    row[0][name] is not None
                    and not isinstance(row[0][name], str)
                    for name in {
                        "operator_auth_user_id",
                        "reviewer_auth_user_id",
                    }
                )
            ):
                raise EphemeralIdentityError(
                    "Live18 demo identity boundary query was not exact"
                )
            demo_state = Live18IdentityBoundary(**row[0])
            denial_state = _live18_denial_residue_counts(cursor)
            _leave_migration_owner(cursor, membership_options)
    return demo_state, denial_state


def _classify_live18_identity_boundary(management_token: str) -> str:
    demo_state, denial_state = _live18_database_boundary(management_token)
    identity_pristine = Live18IdentityBoundary(
        operator_auth_user_id=None,
        reviewer_auth_user_id=None,
        target_organization_count=0,
        active_target_organization_count=0,
        target_user_count=0,
        exact_active_user_count=0,
        target_demo_membership_count=0,
        exact_active_demo_membership_count=0,
        denial_creator_membership_count=0,
        exact_active_denial_creator_membership_count=0,
        active_demo_access_grant_count=0,
        exact_active_demo_access_grant_count=0,
        active_web_grant_count=0,
        exact_active_baseline_web_grant_count=0,
        exact_active_baseline_capability_grant_count=0,
        active_temporary_grant_count=0,
    )
    seeded = Live18IdentityBoundary(
        operator_auth_user_id=DEMO_OPERATOR_AUTH_USER_ID,
        reviewer_auth_user_id=DEMO_REVIEWER_AUTH_USER_ID,
        target_organization_count=2,
        active_target_organization_count=2,
        target_user_count=2,
        exact_active_user_count=2,
        target_demo_membership_count=2,
        exact_active_demo_membership_count=2,
        denial_creator_membership_count=1,
        exact_active_denial_creator_membership_count=1,
        active_demo_access_grant_count=2,
        exact_active_demo_access_grant_count=2,
        active_web_grant_count=0,
        exact_active_baseline_web_grant_count=0,
        exact_active_baseline_capability_grant_count=0,
        active_temporary_grant_count=0,
    )
    if denial_state != (0, 0, 0):
        raise EphemeralIdentityError(
            "Live18 crash recovery left disposable denial authority"
        )
    if demo_state == identity_pristine:
        return "identity_pristine"
    if demo_state == seeded:
        return "seeded"
    raise EphemeralIdentityError(
        "Live18 crash recovery did not restore an exact identity boundary"
    )


def _assert_live18_database_boundary(management_token: str) -> None:
    if _classify_live18_identity_boundary(management_token) != "seeded":
        raise EphemeralIdentityError(
            "Live18 final cleanup requires the exact seeded identity boundary"
        )


def _assert_live18_pre_demo_database_boundary(management_token: str) -> None:
    _classify_live18_identity_boundary(management_token)


def _recover_lost_live18_state(
    boundary_assertion: Callable[[str], None],
) -> dict[str, int]:
    """Reconcile Live18 mutations even when both transient state files were lost.

    Provisioning creates Auth identities before changing database bindings or
    grants.  Their purpose metadata therefore provides a durable discovery
    anchor across SSH disconnects and container replacement.  The workflow is
    serialized, so every identity with this dedicated purpose belongs to the
    one cleanup boundary.
    """

    management_token = _required("SUPABASE_ACCESS_TOKEN")
    _validate_target(management_token)
    auth_admin = _auth_admin_authority(management_token)
    mask_auth_admin_secret(auth_admin)
    stale_auth_user_ids = _list_purpose_auth_user_ids(
        auth_admin, LIVE18_PURPOSE
    )
    _recover_stale_live18_database(management_token, stale_auth_user_ids)
    # Never delete the durable Auth discovery anchors until every database
    # authority and binding has reached its exact terminal boundary.
    boundary_assertion(management_token)
    if stale_auth_user_ids:
        for auth_user_id in sorted(stale_auth_user_ids):
            _delete_auth_user(auth_admin, auth_user_id)
    remaining_auth_user_ids = _list_purpose_auth_user_ids(
        auth_admin, LIVE18_PURPOSE
    )
    if remaining_auth_user_ids:
        raise EphemeralIdentityError(
            "Disposable live18 Auth identities remained after crash recovery"
        )
    boundary_assertion(management_token)
    return {
        "recovered_auth_identity_count": len(stale_auth_user_ids),
        "remaining_auth_identity_count": 0,
        "remaining_active_temporary_grant_count": 0,
        "remaining_denial_role_count": 0,
        "remaining_active_denial_authority_count": 0,
        "remaining_denial_auth_binding_count": 0,
    }


def recover_lost_live18_state() -> dict[str, int]:
    """Recover orphaned Live18 state and require the seeded final boundary."""

    return _recover_lost_live18_state(_assert_live18_database_boundary)


def recover_lost_live18_state_before_demo() -> dict[str, int]:
    """Recover before demo seeding, accepting only identity-pristine or seeded."""

    return _recover_lost_live18_state(_assert_live18_pre_demo_database_boundary)


def _verify_live18_owner_delegation(management_token: str) -> None:
    """Fail before Auth creation unless the scoped owner handoff is reversible."""

    with _database_connection(management_token) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                (LOCK_KEY,),
            )
            membership_options = _enter_migration_owner(cursor)
            _leave_migration_owner(cursor, membership_options)


def _provision_live18_denial_database(
    management_token: str,
    state_path: Path,
    state: dict[str, Any],
) -> None:
    denial = state["denial_identity"]
    with _database_connection(management_token) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                (LOCK_KEY,),
            )
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")
            membership_options = _enter_migration_owner(cursor)
            _set_denial_context(cursor)
            cursor.execute(
                "SELECT status FROM core.organizations WHERE id=%s FOR SHARE",
                (DENIAL_ORG_ID,),
            )
            if cursor.fetchone() != ("active",):
                raise EphemeralIdentityError("Disposable live18 denial organization is unavailable")
            cursor.execute(
                "SELECT status FROM core.memberships WHERE org_id=%s AND id=%s FOR SHARE",
                (DENIAL_ORG_ID, DENIAL_CREATOR_MEMBERSHIP_ID),
            )
            if cursor.fetchone() != ("active",):
                raise EphemeralIdentityError("Disposable denial organization lacks its reviewed creator")
            cursor.execute(
                "SELECT code FROM core.permissions WHERE code=%s AND status='active'",
                ("automation.command.view",),
            )
            if cursor.fetchone() != ("automation.command.view",):
                raise EphemeralIdentityError("Canonical command-view permission is unavailable")
            cursor.execute(
                """
                INSERT INTO core.users (id,auth_user_id,display_name,status)
                VALUES (%s,%s,'Ephemeral live18 denial observer','active')
                """,
                (denial["user_id"], denial["auth_user_id"]),
            )
            cursor.execute(
                """
                INSERT INTO core.memberships (
                    org_id,id,user_id,status,joined_at,
                    created_by_membership_id,updated_by_membership_id
                ) VALUES (%s,%s,%s,'active',transaction_timestamp(),%s,%s)
                """,
                (
                    DENIAL_ORG_ID,
                    denial["membership_id"],
                    denial["user_id"],
                    DENIAL_CREATOR_MEMBERSHIP_ID,
                    DENIAL_CREATOR_MEMBERSHIP_ID,
                ),
            )
            cursor.execute(
                """
                INSERT INTO core.roles (
                    org_id,id,code,name,description,is_system,status,
                    created_by_membership_id,updated_by_membership_id
                ) VALUES (
                    %s,%s,%s,'Ephemeral live18 denial observer',
                    'Run-scoped cross-tenant denial proof only',false,'active',%s,%s
                )
                """,
                (
                    DENIAL_ORG_ID,
                    denial["role_id"],
                    f"{LIVE18_DENIAL_ROLE_PREFIX}{state['run_token'].replace('-', '')[:20]}",
                    DENIAL_CREATOR_MEMBERSHIP_ID,
                    DENIAL_CREATOR_MEMBERSHIP_ID,
                ),
            )
            cursor.execute(
                """
                INSERT INTO core.role_permissions (
                    org_id,role_id,permission_code,created_by_membership_id
                ) VALUES (%s,%s,'automation.command.view',%s)
                """,
                (DENIAL_ORG_ID, denial["role_id"], DENIAL_CREATOR_MEMBERSHIP_ID),
            )
            cursor.execute(
                """
                INSERT INTO core.access_grants (
                    org_id,id,membership_id,role_id,scope_kind,branch_id,
                    valid_from_at,expires_at,status,created_by_membership_id
                ) VALUES (
                    %s,%s,%s,%s,'organization',NULL,transaction_timestamp(),
                    transaction_timestamp()+interval '2 hours','active',%s
                )
                """,
                (
                    DENIAL_ORG_ID,
                    denial["access_grant_id"],
                    denial["membership_id"],
                    denial["role_id"],
                    DENIAL_CREATOR_MEMBERSHIP_ID,
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
                    %s,%s,%s,%s,'Ephemeral live18 denial observer',NULL,
                    'self_consent',%s,extensions.digest(%s,'sha256'),
                    %s,transaction_timestamp(),%s,transaction_timestamp(),
                    transaction_timestamp()+interval '2 hours','active',%s,%s
                )
                """,
                (
                    DENIAL_ORG_ID,
                    denial["agent_grant_id"],
                    denial["membership_id"],
                    WEB_CLIENT_ID,
                    LIVE18_DENIAL_CONSENT_VERSION,
                    f"{LIVE18_PURPOSE}:{state['run_token']}:denial",
                    denial["membership_id"],
                    DENIAL_CREATOR_MEMBERSHIP_ID,
                    DENIAL_CREATOR_MEMBERSHIP_ID,
                    DENIAL_CREATOR_MEMBERSHIP_ID,
                ),
            )
            cursor.execute(
                """
                INSERT INTO automation.agent_grant_capabilities (
                    org_id,agent_grant_id,capability_code,operation_mode,risk_class,
                    approval_policy,allow_sensitive_read,status,created_by_membership_id
                ) VALUES (
                    %s,%s,'automation.command.status.get','read','read_only',
                    'none',false,'active',%s
                )
                """,
                (
                    DENIAL_ORG_ID,
                    denial["agent_grant_id"],
                    DENIAL_CREATOR_MEMBERSHIP_ID,
                ),
            )
            cursor.execute(
                """
                SELECT user_row.auth_user_id::text,membership.org_id::text,
                       permission.permission_code,capability.capability_code
                  FROM core.users user_row
                  JOIN core.memberships membership
                    ON membership.user_id=user_row.id AND membership.id=%s
                  JOIN core.access_grants access_grant
                    ON access_grant.org_id=membership.org_id
                   AND access_grant.membership_id=membership.id
                  JOIN core.role_permissions permission
                    ON permission.org_id=access_grant.org_id
                   AND permission.role_id=access_grant.role_id
                  JOIN automation.agent_grants agent_grant
                    ON agent_grant.org_id=membership.org_id
                   AND agent_grant.subject_membership_id=membership.id
                   AND agent_grant.client_id=%s AND agent_grant.status='active'
                  JOIN automation.agent_grant_capabilities capability
                    ON capability.org_id=agent_grant.org_id
                   AND capability.agent_grant_id=agent_grant.id
                   AND capability.status='active'
                 WHERE membership.org_id=%s AND user_row.id=%s
                """,
                (
                    denial["membership_id"],
                    WEB_CLIENT_ID,
                    DENIAL_ORG_ID,
                    denial["user_id"],
                ),
            )
            rows = cursor.fetchall()
            if rows != [(
                denial["auth_user_id"],
                DENIAL_ORG_ID,
                "automation.command.view",
                "automation.command.status.get",
            )]:
                raise EphemeralIdentityError("Disposable denial authority did not reconcile exactly")
            _leave_migration_owner(cursor, membership_options)
    state["denial_database_provisioned"] = True
    _write_state(state_path, state)


def _exchange_live18_denial_token(email: str, password: str) -> str:
    anon_key = _required("SUPABASE_ANON_KEY")
    login = requests.post(
        f"{SUPABASE_URL}/auth/v1/token",
        params={"grant_type": "password"},
        headers={"apikey": anon_key},
        json={"email": email, "password": password},
        timeout=20,
    )
    if not login.ok:
        raise EphemeralIdentityError(
            f"Disposable denial Supabase login failed with HTTP {login.status_code}"
        )
    supabase_token = login.json().get("access_token")
    if not isinstance(supabase_token, str) or not supabase_token:
        raise EphemeralIdentityError("Disposable denial login omitted an access token")
    api_origin = _required("PHARMA_CANONICAL_LIVE_API_BASE_URL").rstrip("/")
    if not api_origin.startswith("https://"):
        raise EphemeralIdentityError("Live18 denial exchange requires a non-local HTTPS API")
    response = requests.post(
        f"{api_origin}/api/auth/oauth/supabase/session",
        headers={"Authorization": f"Bearer {supabase_token}"},
        timeout=20,
    )
    if not response.ok:
        raise EphemeralIdentityError(
            f"Disposable denial ERP exchange failed with HTTP {response.status_code}"
        )
    erp_token = response.json().get("access_token")
    if not isinstance(erp_token, str) or not erp_token:
        raise EphemeralIdentityError("Disposable denial ERP exchange omitted an access token")
    try:
        encoded = erp_token.split(".")[1]
        padding = "=" * (-len(encoded) % 4)
        claims = json.loads(base64.urlsafe_b64decode(encoded + padding))
    except (IndexError, ValueError, json.JSONDecodeError) as exc:
        raise EphemeralIdentityError("Disposable denial ERP token is not a JWT") from exc
    if claims.get("org_id") != DENIAL_ORG_ID or not claims.get("user_id"):
        raise EphemeralIdentityError("Disposable denial ERP token has the wrong tenant identity")
    _mask(erp_token)
    return erp_token


def _cleanup_live18_denial_database(cursor, state: dict[str, Any]) -> None:
    denial = state.get("denial_identity")
    if not isinstance(denial, dict):
        if state.get("denial_database_provisioned") is True:
            raise EphemeralIdentityError(
                "Committed live18 denial state omitted its identity envelope"
            )
        return
    try:
        UUID(str(denial.get("auth_user_id", "")))
    except (TypeError, ValueError):
        if state.get("denial_database_provisioned") is not True:
            return
        raise EphemeralIdentityError(
            "Committed live18 denial state omitted its Auth UUID"
        )
    _set_denial_context(cursor)
    _terminalize_live18_denial_authority(
        cursor,
        [(denial["user_id"], denial["auth_user_id"])],
    )


def _set_audit_context(
    cursor,
    *,
    organization_id: str,
    auth_user_id: str,
    user_id: str,
    membership_id: str,
) -> None:
    for name, value in (
        ("app.org_id", organization_id),
        ("app.auth_user_id", auth_user_id),
        ("app.user_id", user_id),
        ("app.membership_id", membership_id),
        ("app.request_id", str(uuid4())),
    ):
        cursor.execute("SELECT set_config(%s,%s,true)", (name, value))


def _set_reviewer_context(cursor) -> None:
    _set_audit_context(
        cursor,
        organization_id=DEMO_ORG_ID,
        auth_user_id=DEMO_REVIEWER_AUTH_USER_ID,
        user_id=DEMO_REVIEWER_USER_ID,
        membership_id=DEMO_REVIEWER_MEMBERSHIP_ID,
    )


def _set_denial_context(cursor) -> None:
    _set_audit_context(
        cursor,
        organization_id=DENIAL_ORG_ID,
        auth_user_id=DEMO_OPERATOR_AUTH_USER_ID,
        user_id=DEMO_OPERATOR_USER_ID,
        membership_id=DENIAL_CREATOR_MEMBERSHIP_ID,
    )


def _resolve_core_sales_fixture(cursor) -> str:
    """Resolve the non-secret sales fixture from the reviewed seeded dataset."""
    cursor.execute(
        """
        SELECT branch.id::text,
               customer.id::text,
               product.id::text,
               conversion.id::text,
               eligible.batch_id::text,
               shipping.state_code
          FROM core.organizations AS organization
          JOIN core.branches AS branch
            ON branch.org_id=organization.id AND branch.id=%s AND branch.status='active'
          JOIN parties.customer_accounts AS customer
            ON customer.org_id=organization.id AND customer.id=%s AND customer.status='active'
          JOIN LATERAL (
              SELECT address.state_code,address.address_kind
                FROM parties.addresses AS address
               WHERE address.org_id=customer.org_id AND address.party_id=customer.party_id
                 AND address.is_primary AND address.status='active'
                 AND address.address_kind IN ('shipping','billing','registered')
                 AND address.valid_from<=(transaction_timestamp() AT TIME ZONE organization.timezone)::date
                 AND (address.valid_until IS NULL OR address.valid_until>=(transaction_timestamp() AT TIME ZONE organization.timezone)::date)
               ORDER BY CASE address.address_kind
                          WHEN 'shipping' THEN 0 WHEN 'billing' THEN 1 ELSE 2
                        END,address.id
               LIMIT 1
          ) AS shipping ON true
          JOIN catalog.products AS product
            ON product.org_id=organization.id AND product.id=%s AND product.status='active'
          JOIN catalog.uom_conversions AS conversion
            ON conversion.org_id=product.org_id AND conversion.id=%s
           AND conversion.product_id=product.id AND conversion.status='active'
          JOIN LATERAL (
              SELECT stock.batch_id
                FROM inventory.stock_balances AS stock
                JOIN inventory.locations AS location
                  ON location.org_id=stock.org_id AND location.id=stock.location_id
                 AND location.branch_id=stock.branch_id AND location.status='active'
                 AND location.allows_sale AND NOT location.allows_negative_stock
                JOIN inventory.batches AS batch
                  ON batch.org_id=stock.org_id AND batch.id=stock.batch_id
                 AND batch.product_id=stock.product_id
               WHERE stock.org_id=organization.id AND stock.branch_id=branch.id
                 AND stock.product_id=product.id AND stock.on_hand_quantity>0
                 AND inventory.available_quantity(
                       stock.org_id,stock.location_id,stock.product_id,stock.batch_id
                     )>=conversion.multiplier
                 AND batch.lot_kind='manufacturer_batch'
                 AND batch.status='released' AND batch.released_at IS NOT NULL
                 AND batch.expires_on IS NOT NULL
                 AND batch.expires_on>(transaction_timestamp() AT TIME ZONE organization.timezone)::date
               ORDER BY batch.expires_on,stock.batch_id,stock.location_id
               LIMIT 1
          ) AS eligible ON true
         WHERE organization.id=%s AND organization.status='active'
           AND conversion.multiplier>0
         LIMIT 2
        """,
        (
            "d3000000-0000-7000-8000-000000000005",
            "d3000000-0000-7000-8000-000000000011",
            "d3000000-0000-7000-8000-000000000015",
            "d3000000-0000-7000-8000-000000000016",
            DEMO_ORG_ID,
        ),
    )
    rows = cursor.fetchall()
    if len(rows) != 1:
        raise EphemeralIdentityError(
            "Canonical staging did not resolve exactly one usable sales-chain fixture"
        )
    branch_id, customer_id, product_id, conversion_id, batch_id, state_code = rows[0]
    return json.dumps(
        {
            "branch_id": branch_id,
            "customer_account_id": customer_id,
            "product_id": product_id,
            "uom_conversion_id": conversion_id,
            "expected_fefo_batch_id": batch_id,
            "billed_quantity": "1.000000",
            "free_quantity": "0.000000",
            "unit_rate": "84.0000",
            "place_of_supply_state_code": state_code,
        },
        separators=(",", ":"),
        sort_keys=True,
    )


def _provision_database(
    management_token: str,
    state_path: Path,
    state: dict[str, Any],
    profile: str,
) -> str | None:
    identities = _profile_identities(profile)
    membership_ids = [membership_id for _, _, membership_id in identities]
    user_ids = [user_id for _, user_id, _ in identities]
    auth_by_role = {
        entry["role"]: entry["auth_user_id"] for entry in state["auth_users"]
    }
    with _database_connection(management_token) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                (LOCK_KEY,),
            )
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")
            _set_reviewer_context(cursor)
            membership_options = _enter_migration_owner(cursor)
            cursor.execute(
                """
                SELECT user_row.id::text, membership.id::text,
                       user_row.auth_user_id::text
                  FROM core.users AS user_row
                  JOIN core.memberships AS membership
                    ON membership.user_id=user_row.id
                   AND membership.org_id=%s
                  JOIN core.organizations AS organization
                    ON organization.id=membership.org_id
                 WHERE user_row.id=ANY(CAST(%s AS uuid[]))
                   AND membership.id=ANY(CAST(%s AS uuid[]))
                   AND user_row.status='active'
                   AND membership.status='active'
                   AND organization.status='active'
                 ORDER BY user_row.id
                """,
                (
                    DEMO_ORG_ID,
                    user_ids,
                    membership_ids,
                ),
            )
            binding_rows = cursor.fetchall()
            expected_pairs = {
                (user_id, membership_id)
                for _, user_id, membership_id in identities
            }
            if {(row[0], row[1]) for row in binding_rows} != expected_pairs:
                raise EphemeralIdentityError(
                    "Seeded browser profile memberships are not exactly active"
                )
            cursor.execute(
                """
                SELECT membership.id::text,
                       array_agg(DISTINCT permission.code ORDER BY permission.code)
                  FROM core.memberships AS membership
                  JOIN core.access_grants AS access_grant
                    ON access_grant.org_id=membership.org_id
                   AND access_grant.membership_id=membership.id
                  JOIN core.roles AS role
                    ON role.org_id=access_grant.org_id
                   AND role.id=access_grant.role_id
                  JOIN core.role_permissions AS role_permission
                    ON role_permission.org_id=role.org_id
                   AND role_permission.role_id=role.id
                  JOIN core.permissions AS permission
                    ON permission.code=role_permission.permission_code
                 WHERE membership.org_id=%s
                   AND membership.id=ANY(CAST(%s AS uuid[]))
                   AND membership.status='active'
                   AND access_grant.status='active'
                   AND access_grant.valid_from_at<=transaction_timestamp()
                   AND (access_grant.expires_at IS NULL
                        OR access_grant.expires_at>transaction_timestamp())
                   AND role.status='active' AND permission.status='active'
                 GROUP BY membership.id
                """,
                (
                    DEMO_ORG_ID,
                    membership_ids,
                ),
            )
            permissions = {row[0]: set(row[1]) for row in cursor.fetchall()}
            required_permissions = {
                membership_id: set(_permissions_for(role, profile))
                for role, _, membership_id in identities
            }
            if any(
                not required.issubset(permissions.get(membership_id, set()))
                for membership_id, required in required_permissions.items()
            ):
                raise EphemeralIdentityError(
                    "Seeded memberships lack the required browser-profile permissions"
                )
            state["prior_bindings"] = [
                {
                    "user_id": row[0],
                    "membership_id": row[1],
                    "auth_user_id": row[2],
                }
                for row in binding_rows
            ]
            cursor.execute(
                """
                SELECT id::text, subject_membership_id::text, row_version
                  FROM automation.agent_grants
                 WHERE org_id=%s AND client_id=%s
                   AND subject_membership_id=ANY(CAST(%s AS uuid[]))
                   AND status='active'
                 ORDER BY id
                 FOR UPDATE
                """,
                (
                    DEMO_ORG_ID,
                    WEB_CLIENT_ID,
                    membership_ids,
                ),
            )
            state["prior_active_grants"] = [
                {
                    "grant_id": row[0],
                    "membership_id": row[1],
                    "row_version": row[2],
                }
                for row in cursor.fetchall()
            ]
            if profile == PROFILE_LIVE18 and state["prior_active_grants"]:
                raise EphemeralIdentityError(
                    "Live18 requires zero durable web grants before ephemeral "
                    "browser authority is created"
                )
            _write_state(state_path, state)

            cursor.execute(
                """
                UPDATE automation.agent_grants
                   SET status='suspended', suspended_at=transaction_timestamp(),
                       updated_at=transaction_timestamp(),
                       updated_by_membership_id=%s, row_version=row_version+1
                 WHERE org_id=%s AND client_id=%s
                   AND subject_membership_id=ANY(CAST(%s AS uuid[]))
                   AND status='active'
                """,
                (
                    DEMO_REVIEWER_MEMBERSHIP_ID,
                    DEMO_ORG_ID,
                    WEB_CLIENT_ID,
                    membership_ids,
                ),
            )
            for role, user_id, membership_id in identities:
                cursor.execute(
                    """
                    UPDATE core.users
                       SET auth_user_id=%s, updated_at=transaction_timestamp(),
                           row_version=row_version+1
                     WHERE id=%s AND status='active'
                    """,
                    (auth_by_role[role], user_id),
                )
                if cursor.rowcount != 1:
                    raise EphemeralIdentityError(
                        f"Could not bind the seeded {role} user exactly once"
                    )
                grant_id = state["temporary_grants"][role]
                cursor.execute(
                    """
                    INSERT INTO automation.agent_grants (
                        org_id,id,subject_membership_id,client_id,
                        client_display_name,branch_id,authorization_mode,
                        consent_version,consent_text_hash,
                        consented_by_membership_id,consented_at,
                        granted_by_membership_id,granted_at,expires_at,status,
                        created_by_membership_id,updated_by_membership_id
                    ) VALUES (
                        %s,%s,%s,%s,%s,NULL,'self_consent','browser-e2e-v1',
                        extensions.digest(%s,'sha256'),
                        %s,transaction_timestamp(),%s,transaction_timestamp(),
                        transaction_timestamp()+interval '2 hours','active',%s,%s
                    )
                    """,
                    (
                        DEMO_ORG_ID,
                        grant_id,
                        membership_id,
                        WEB_CLIENT_ID,
                        f"Ephemeral staging browser {role}",
                        f"{state['purpose']}:{state['run_token']}:{role}",
                        membership_id,
                        DEMO_REVIEWER_MEMBERSHIP_ID,
                        DEMO_REVIEWER_MEMBERSHIP_ID,
                        DEMO_REVIEWER_MEMBERSHIP_ID,
                    ),
                )
                cursor.executemany(
                    """
                    INSERT INTO automation.agent_grant_capabilities (
                        org_id,agent_grant_id,capability_code,operation_mode,
                        risk_class,approval_policy,maximum_amount,currency_code,
                        allow_sensitive_read,status,created_by_membership_id
                    ) VALUES (
                        %s,%s,%s,%s,%s,%s,
                        CASE WHEN %s='write' THEN 1000000.00 ELSE NULL END,
                        CASE WHEN %s='write' THEN 'INR' ELSE NULL END,
                        false,'active',%s
                    )
                    """,
                    [
                        (
                            DEMO_ORG_ID,
                            grant_id,
                            capability,
                            operation_mode,
                            risk_class,
                            approval_policy,
                            operation_mode,
                            operation_mode,
                            DEMO_REVIEWER_MEMBERSHIP_ID,
                        )
                        for capability, operation_mode, risk_class, approval_policy
                        in _capabilities_for(role, profile)
                    ],
                )

            cursor.execute(
                """
                SELECT grant_row.subject_membership_id::text,
                       user_row.auth_user_id::text, grant_row.id::text,
                       array_agg(capability.capability_code ORDER BY capability.capability_code)
                  FROM automation.agent_grants AS grant_row
                  JOIN core.memberships AS membership
                    ON membership.org_id=grant_row.org_id
                   AND membership.id=grant_row.subject_membership_id
                  JOIN core.users AS user_row ON user_row.id=membership.user_id
                  JOIN automation.agent_grant_capabilities AS capability
                    ON capability.org_id=grant_row.org_id
                   AND capability.agent_grant_id=grant_row.id
                   AND capability.status='active'
                 WHERE grant_row.org_id=%s AND grant_row.client_id=%s
                   AND grant_row.subject_membership_id=ANY(CAST(%s AS uuid[]))
                   AND grant_row.status='active'
                   AND grant_row.expires_at>transaction_timestamp()
                 GROUP BY grant_row.subject_membership_id,user_row.auth_user_id,grant_row.id
                 ORDER BY grant_row.subject_membership_id
                """,
                (
                    DEMO_ORG_ID,
                    WEB_CLIENT_ID,
                    membership_ids,
                ),
            )
            actual = {
                row[0]: (row[1], row[2], tuple(row[3])) for row in cursor.fetchall()
            }
            expected = {
                membership_id: (
                    auth_by_role[role],
                    state["temporary_grants"][role],
                    tuple(
                        sorted(
                            capability[0]
                            for capability in _capabilities_for(role, profile)
                        )
                    ),
                )
                for role, _, membership_id in identities
            }
            if actual != expected:
                raise EphemeralIdentityError(
                    "Disposable browser identities did not reconcile to exactly one "
                    "correctly bounded active web authority each"
                )
            fixture = (
                _resolve_core_sales_fixture(cursor)
                if profile == PROFILE_CORE_OPERATOR
                else None
            )
            _leave_migration_owner(cursor, membership_options)
    state["database_provisioned"] = True
    _write_state(state_path, state)
    return fixture


def _cleanup_database(management_token: str, state: dict[str, Any]) -> None:
    profile = _profile_from_state(state)
    identities = _profile_identities(profile)
    with _database_connection(management_token) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                (LOCK_KEY,),
            )
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")
            membership_options = _enter_migration_owner(cursor)
            if profile == PROFILE_LIVE18:
                _cleanup_live18_denial_database(cursor, state)
            _set_reviewer_context(cursor)
            temporary_grants = list(state.get("temporary_grants", {}).values())
            if temporary_grants:
                cursor.execute(
                    """
                    UPDATE automation.agent_grants
                       SET status='suspended', suspended_at=transaction_timestamp(),
                           updated_at=transaction_timestamp(),
                           updated_by_membership_id=%s, row_version=row_version+1
                     WHERE org_id=%s AND id=ANY(CAST(%s AS uuid[]))
                       AND client_id=%s AND status='active'
                    """,
                    (
                        DEMO_REVIEWER_MEMBERSHIP_ID,
                        DEMO_ORG_ID,
                        temporary_grants,
                        WEB_CLIENT_ID,
                    ),
                )
            auth_by_role = {
                entry["role"]: entry["auth_user_id"]
                for entry in state.get("auth_users", [])
            }
            membership_to_role = {
                membership_id: role for role, _, membership_id in identities
            }
            for binding in state.get("prior_bindings", []):
                role = membership_to_role[binding["membership_id"]]
                cursor.execute(
                    """
                    UPDATE core.users
                       SET auth_user_id=%s, updated_at=transaction_timestamp(),
                           row_version=row_version+1
                     WHERE id=%s AND auth_user_id=%s
                    """,
                    (
                        binding["auth_user_id"],
                        binding["user_id"],
                        auth_by_role.get(role),
                    ),
                )
                if cursor.rowcount not in (0, 1):
                    raise EphemeralIdentityError(
                        f"Unexpected {role} binding cleanup cardinality"
                    )
                cursor.execute(
                    "SELECT auth_user_id::text FROM core.users WHERE id=%s",
                    (binding["user_id"],),
                )
                row = cursor.fetchone()
                if row != (binding["auth_user_id"],):
                    raise EphemeralIdentityError(
                        f"Refusing to overwrite a concurrently changed {role} binding"
                    )
            for prior in state.get("prior_active_grants", []):
                cursor.execute(
                    """
                    UPDATE automation.agent_grants
                       SET status='active', suspended_at=NULL,
                           updated_at=transaction_timestamp(),
                           updated_by_membership_id=%s, row_version=row_version+1
                     WHERE org_id=%s AND id=%s AND client_id=%s
                       AND status='suspended' AND row_version=%s
                       AND expires_at>transaction_timestamp()
                    """,
                    (
                        DEMO_REVIEWER_MEMBERSHIP_ID,
                        DEMO_ORG_ID,
                        prior["grant_id"],
                        WEB_CLIENT_ID,
                        prior["row_version"] + 1,
                    ),
                )
                if cursor.rowcount == 0:
                    cursor.execute(
                        """
                        SELECT status FROM automation.agent_grants
                         WHERE org_id=%s AND id=%s AND client_id=%s
                        """,
                        (DEMO_ORG_ID, prior["grant_id"], WEB_CLIENT_ID),
                    )
                    if cursor.fetchone() != ("active",):
                        raise EphemeralIdentityError(
                            "A prior web grant changed during the browser test; "
                            "cleanup refused to reactivate it"
                        )
            if temporary_grants:
                cursor.execute(
                    """
                    SELECT count(*) FROM automation.agent_grants
                     WHERE org_id=%s AND id=ANY(CAST(%s AS uuid[]))
                       AND status='active'
                    """,
                    (DEMO_ORG_ID, temporary_grants),
                )
                if cursor.fetchone() != (0,):
                    raise EphemeralIdentityError(
                        "Temporary browser grants remained active after cleanup"
                    )
            _leave_migration_owner(cursor, membership_options)


def provision(state_path: Path, profile: str = PROFILE_TWO_USER) -> None:
    if state_path.exists():
        raise EphemeralIdentityError(
            "Ephemeral identity state already exists; clean it before provisioning"
        )
    management_token = _required("SUPABASE_ACCESS_TOKEN")
    purpose = _profile_purpose(profile)
    identities = _profile_identities(profile)
    _validate_target(management_token)
    auth_admin = _auth_admin_authority(management_token)
    mask_auth_admin_secret(auth_admin)
    if profile == PROFILE_LIVE18:
        stale_auth_user_ids = _list_purpose_auth_user_ids(auth_admin, purpose)
        if stale_auth_user_ids:
            _recover_stale_live18_database(management_token, stale_auth_user_ids)
            for auth_user_id in sorted(stale_auth_user_ids):
                _delete_auth_user(auth_admin, auth_user_id)
            if _list_purpose_auth_user_ids(auth_admin, purpose):
                raise EphemeralIdentityError(
                    "Stale disposable live18 Auth identities remained after recovery"
                )
        _verify_live18_owner_delegation(management_token)
    run_token = str(uuid4())
    state: dict[str, Any] = {
        "version": STATE_VERSION,
        "project_ref": EXPECTED_PROJECT_REF,
        "purpose": purpose,
        "run_token": run_token,
        "auth_users": [],
        "prior_bindings": [],
        "prior_active_grants": [],
        "temporary_grants": {role: str(uuid4()) for role, _, _ in identities},
        "database_provisioned": False,
    }
    if profile == PROFILE_LIVE18:
        state["denial_identity"] = {
            "auth_user_id": "",
            "user_id": str(uuid4()),
            "membership_id": str(uuid4()),
            "role_id": str(uuid4()),
            "access_grant_id": str(uuid4()),
            "agent_grant_id": str(uuid4()),
        }
        state["denial_database_provisioned"] = False
    _write_state(state_path, state)
    credentials: dict[str, str] = {}
    for role, _, _ in identities:
        email = f"erp-{role}-{run_token}@canonical-staging.aasopharma.invalid"
        password = secrets.token_urlsafe(48)
        _mask(email)
        _mask(password)
        auth_user_id = _create_auth_user(
            auth_admin,
            purpose=purpose,
            role=role,
            run_token=run_token,
            email=email,
            password=password,
        )
        state["auth_users"].append(
            {"role": role, "auth_user_id": auth_user_id}
        )
        _write_state(state_path, state)
        prefix = f"PLAYWRIGHT_LIVE_{role.upper()}"
        credentials[f"{prefix}_EMAIL"] = email
        credentials[f"{prefix}_PASSWORD"] = password
    denial_credentials: tuple[str, str] | None = None
    if profile == PROFILE_LIVE18:
        denial_email = f"erp-denial-{run_token}@canonical-staging.aasopharma.invalid"
        denial_password = secrets.token_urlsafe(48)
        _mask(denial_email)
        _mask(denial_password)
        denial_auth_user_id = _create_auth_user(
            auth_admin,
            purpose=purpose,
            role="denial",
            run_token=run_token,
            email=denial_email,
            password=denial_password,
            organization_id=DENIAL_ORG_ID,
        )
        state["auth_users"].append(
            {"role": "denial", "auth_user_id": denial_auth_user_id}
        )
        state["denial_identity"]["auth_user_id"] = denial_auth_user_id
        _write_state(state_path, state)
        denial_credentials = (denial_email, denial_password)
    if len({entry["auth_user_id"] for entry in state["auth_users"]}) != len(
        state["auth_users"]
    ):
        raise EphemeralIdentityError(
            "Supabase returned duplicate disposable Auth identities"
        )
    fixture = _provision_database(management_token, state_path, state, profile)
    if profile == PROFILE_LIVE18:
        _provision_live18_denial_database(management_token, state_path, state)
        if denial_credentials is None:
            raise EphemeralIdentityError("Live18 denial credentials were not generated")
        credentials.update({
            "LIVE18_REQUESTER_EMAIL": credentials["PLAYWRIGHT_LIVE_REQUESTER_EMAIL"],
            "LIVE18_REQUESTER_PASSWORD": credentials["PLAYWRIGHT_LIVE_REQUESTER_PASSWORD"],
            "LIVE18_REVIEWER_EMAIL": credentials["PLAYWRIGHT_LIVE_REVIEWER_EMAIL"],
            "LIVE18_REVIEWER_PASSWORD": credentials["PLAYWRIGHT_LIVE_REVIEWER_PASSWORD"],
            "LIVE18_DENIAL_ACCESS_TOKEN": _exchange_live18_denial_token(*denial_credentials),
            "LIVE18_DENIAL_AUTH_USER_ID": state["denial_identity"]["auth_user_id"],
            "LIVE18_EXPECTED_ORG_ID": DEMO_ORG_ID,
            "LIVE18_EXPECTED_BRANCH_ID": "d3000000-0000-7000-8000-000000000005",
            "LIVE18_EXPECTED_DENIAL_ORG_ID": DENIAL_ORG_ID,
        })
    if profile == PROFILE_CORE_OPERATOR:
        credentials["PLAYWRIGHT_LIVE_EMAIL"] = credentials.pop(
            "PLAYWRIGHT_LIVE_OPERATOR_EMAIL"
        )
        credentials["PLAYWRIGHT_LIVE_PASSWORD"] = credentials.pop(
            "PLAYWRIGHT_LIVE_OPERATOR_PASSWORD"
        )
        if not fixture:
            raise EphemeralIdentityError("Core browser fixture was not resolved")
        credentials["PLAYWRIGHT_SALES_CHAIN_FIXTURE"] = fixture
    _append_job_environment(credentials)
    print(f"Provisioned confirmed disposable {profile} browser identity profile")


def cleanup(state_path: Path) -> None:
    errors: list[str] = []
    database_cleaned = False
    try:
        state = _read_state(state_path)
        if state is None:
            print("No ephemeral browser identity state was present")
            return
        management_token = _required("SUPABASE_ACCESS_TOKEN")
        _validate_target(management_token)
        try:
            _cleanup_database(management_token, state)
            database_cleaned = True
        except Exception as exc:  # retain Auth metadata as the durable recovery anchor
            errors.append(f"database cleanup: {exc}")
        if database_cleaned:
            try:
                auth_admin = _auth_admin_authority(management_token)
                mask_auth_admin_secret(auth_admin)
                auth_user_ids = {
                    entry["auth_user_id"] for entry in state.get("auth_users", [])
                }
                auth_user_ids.update(
                    _list_run_auth_user_ids(
                        auth_admin,
                        str(state["run_token"]),
                        str(state["purpose"]),
                    )
                )
                for auth_user_id in sorted(auth_user_ids):
                    _delete_auth_user(auth_admin, auth_user_id)
            except Exception as exc:  # report after credentials are cleared
                errors.append(f"Auth cleanup: {exc}")
    finally:
        _clear_browser_environment()
    if errors:
        raise EphemeralIdentityError("; ".join(errors))
    state_path.unlink(missing_ok=True)
    print(
        "Suspended disposable web grants, restored seeded bindings and prior "
        "authorities, and deleted disposable Auth users"
    )


def _redacted_annotation(exc: BaseException) -> str:
    detail = str(exc)
    for name in ("SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD"):
        secret = os.getenv(name, "")
        if secret:
            detail = detail.replace(secret, "[REDACTED]")
    detail = re.sub(r"sb_secret_[A-Za-z0-9._-]+", "[REDACTED]", detail)
    detail = re.sub(r"eyJ[A-Za-z0-9._-]+", "[REDACTED]", detail)
    detail = re.sub(r"postgres(?:ql)?://[^\s]+", "[REDACTED_DATABASE_URL]", detail)
    return detail.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("provision", "cleanup"))
    parser.add_argument("--state", required=True, type=Path)
    parser.add_argument("--profile", choices=PROFILES, default=PROFILE_TWO_USER)
    arguments = parser.parse_args(argv)
    if arguments.action == "provision":
        provision(arguments.state, arguments.profile)
    else:
        cleanup(arguments.state)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (EphemeralIdentityError, requests.RequestException, psycopg2.Error) as exc:
        print("Ephemeral browser identity reconciliation failed", file=sys.stderr)
        print(
            "::error title=Ephemeral browser identity reconciliation failed::"
            f"{_redacted_annotation(exc)}"
        )
        raise SystemExit(1)

#!/usr/bin/env python3
"""Provision short-lived identities for canonical REST/MCP live reconciliation.

The browser identity reconciler owns Auth-user creation and restoration.  This
companion binds those same disposable requester/reviewer identities to the
reviewed MCP OAuth client, obtains real PKCE tokens, and always suspends the
temporary MCP grants again.  Passwords and tokens are masked and never written
to the state file.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import sys
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import psycopg2
import requests

SCRIPT_DIRECTORY = Path(__file__).resolve().parent
if str(SCRIPT_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIRECTORY))

from exercise_staging_mcp_oauth import (  # noqa: E402
    ISSUER,
    _authorization_details,
    _decide,
    _deployment_mcp_url,
    _exchange_token,
    _exercise_mcp,
    _pkce,
    _start_authorization,
    _validate_oauth_access_token_claims,
)
from provision_ephemeral_browser_identities import (  # noqa: E402
    DEMO_OPERATOR_AUTH_USER_ID,
    DEMO_OPERATOR_MEMBERSHIP_ID,
    DEMO_OPERATOR_USER_ID,
    DEMO_ORG_ID,
    DEMO_REVIEWER_AUTH_USER_ID,
    DEMO_REVIEWER_MEMBERSHIP_ID,
    DEMO_REVIEWER_USER_ID,
    EXPECTED_PROJECT_REF,
    DENIAL_ORG_ID,
    LIVE18_BASELINE_OPERATOR_CAPABILITY_BOUNDS,
    LIVE18_BASELINE_REVIEWER_CAPABILITY_BOUNDS,
    LIVE18_PURPOSE,
    LIVE18_REQUESTER_CAPABILITIES,
    LIVE18_TEMPORARY_CAPABILITY_BOUNDS,
    PROFILE_LIVE18,
    PROFILE_TWO_USER,
    TWO_USER_PURPOSE,
    _database_connection,
    _admin_request,
    _enter_migration_owner,
    _leave_migration_owner,
    _read_state as _read_browser_state,
    _validate_target,
)
from provision_staging_mcp_oauth import (  # noqa: E402
    _auth_admin_authority,
    _reconcile_client,
)
from canonical_demo_ids import (  # noqa: E402
    canonical_demo_authority_ids,
    canonical_live18_cycle_count_authority,
)
from supabase_auth_admin import mask_auth_admin_secret  # noqa: E402


STATE_VERSION = 1
PURPOSE = "canonical-staging-rest-mcp-live-e2e"
LOCK_KEY = "canonical-staging-live-browser-identities"
MCP_TEMPORARY_CONSENT_VERSION = "canonical-live-e2e-v1"
BASELINE_AUTHORITY = {
    "requester": {
        "membership_id": DEMO_OPERATOR_MEMBERSHIP_ID,
        "display_name": "Canonical staging demo runner",
        "consent_version": "demo-v2",
        "consent_text": "canonical staging demo consent; INR 1000000 maximum",
        "capabilities": LIVE18_BASELINE_OPERATOR_CAPABILITY_BOUNDS,
    },
    "reviewer": {
        "membership_id": DEMO_REVIEWER_MEMBERSHIP_ID,
        "display_name": "Canonical staging independent approver",
        "consent_version": "demo-v2-approver",
        "consent_text": "canonical staging independent approval consent",
        "capabilities": LIVE18_BASELINE_REVIEWER_CAPABILITY_BOUNDS,
    },
}
FIXTURE_RUN_TOKEN = re.compile(r"[1-9][0-9]{0,19}-[1-9][0-9]{0,9}")
BRANCH_ID = "d3000000-0000-7000-8000-000000000005"
TRANSFER_DESTINATION_BRANCH_ID = "d3000000-0000-7000-8000-000000000028"
CUSTOMER_ACCOUNT_ID = "d3000000-0000-7000-8000-000000000011"
PRODUCT_ID = "d3000000-0000-7000-8000-000000000015"
UOM_CONVERSION_ID = "d3000000-0000-7000-8000-000000000016"
COUNT_UOM_CONVERSION_ID = "d3000000-0000-7000-8000-000000000026"
SUPPLIER_ACCOUNT_ID = "d3200000-0000-7000-8000-000000000002"
SALEABLE_LOCATION_ID = "d3200000-0000-7000-8000-000000000006"
QUARANTINE_LOCATION_ID = "d3200000-0000-7000-8000-000000000007"
TRANSFER_DESTINATION_LOCATION_ID = "d3200000-0000-7000-8000-00000000000f"
BANK_ACCOUNT_ID = "d3200000-0000-7000-8000-000000000008"
BANK_LEDGER_ID = "d3210000-0000-7000-8000-000000000001"

PREPARE_CAPABILITIES = (
    ("sales.order.prepare", "actor_confirmation"),
    ("sales.dispatch.prepare", "actor_confirmation"),
    ("sales.invoice.prepare", "actor_confirmation"),
    ("sales.return.prepare", "separate_approver"),
    ("procurement.purchase_order.prepare", "actor_confirmation"),
    ("procurement.goods_receipt.prepare", "actor_confirmation"),
    ("procurement.supplier_invoice.prepare", "actor_confirmation"),
    ("procurement.purchase_return.prepare", "separate_approver"),
    ("finance.customer_receipt.prepare", "actor_confirmation"),
    ("finance.supplier_advance.prepare", "separate_approver"),
    ("finance.supplier_payment.prepare", "actor_confirmation"),
    ("inventory.adjustment.prepare", "separate_approver"),
    ("inventory.transfer.prepare", "actor_confirmation"),
)
LIVE18_PREPARE_CAPABILITIES = tuple(
    (capability, approval)
    for capability, _, _, approval in LIVE18_REQUESTER_CAPABILITIES
    if capability.endswith(".prepare")
)
REQUESTER_CAPABILITIES = (
    *PREPARE_CAPABILITIES,
    ("automation.command.approve", "actor_confirmation"),
    ("automation.command.execute", "actor_confirmation"),
    ("automation.command.status.get", "none"),
)
LIVE18_MCP_REQUESTER_CAPABILITIES = (
    *LIVE18_PREPARE_CAPABILITIES,
    ("automation.command.approve", "actor_confirmation"),
    ("automation.command.execute", "actor_confirmation"),
    ("automation.command.status.get", "none"),
)
REVIEWER_CAPABILITIES = (
    ("automation.command.approve", "actor_confirmation"),
    ("automation.command.status.get", "none"),
)


class CanonicalLiveIdentityError(RuntimeError):
    pass


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise CanonicalLiveIdentityError(f"{name} is required")
    return value


def _validated_fixture_run_token(value: str) -> str:
    if FIXTURE_RUN_TOKEN.fullmatch(value) is None:
        raise CanonicalLiveIdentityError(
            "Canonical live fixture run token is invalid"
        )
    return value


def _baseline_grants(fixture_run_token: str) -> dict[str, str]:
    """Derive the same-run MCP baselines from the shared demo ID authority."""

    run_id, run_attempt = _validated_fixture_run_token(fixture_run_token).split(
        "-", 1
    )
    authority_ids = canonical_demo_authority_ids(
        DEMO_ORG_ID, run_id, run_attempt
    )
    return {
        "requester": authority_ids["agent_grant"],
        "reviewer": authority_ids["legacy_approver_agent_grant"],
    }


def _set_mcp_audit_context(cursor, request_id: str) -> None:
    """Bind direct acceptance-only authority mutations to one audited actor."""

    try:
        request_id = str(UUID(request_id))
    except (TypeError, ValueError) as exc:
        raise CanonicalLiveIdentityError(
            "Canonical live MCP audit request ID is invalid"
        ) from exc
    for name, value in (
        ("app.org_id", DEMO_ORG_ID),
        ("app.membership_id", DEMO_REVIEWER_MEMBERSHIP_ID),
        ("app.request_id", request_id),
    ):
        cursor.execute("SELECT set_config(%s,%s,true)", (name, value))


def _mask(value: str) -> None:
    if "\n" in value or "\r" in value:
        raise CanonicalLiveIdentityError("Refusing to mask a multiline credential")
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
    if (
        not isinstance(state, dict)
        or state.get("version") != STATE_VERSION
        or state.get("project_ref") != EXPECTED_PROJECT_REF
        or state.get("purpose") != PURPOSE
    ):
        raise CanonicalLiveIdentityError("Canonical live identity state is invalid")
    return state


def _append_environment(values: dict[str, str]) -> None:
    path = Path(_required("GITHUB_ENV"))
    with path.open("a", encoding="utf-8") as handle:
        for key, value in values.items():
            if "\n" in value or "\r" in value:
                raise CanonicalLiveIdentityError(
                    f"Refusing multiline GitHub environment value {key}"
                )
            handle.write(f"{key}={value}\n")


def _oauth_token(
    email: str,
    password: str,
    anon_key: str,
    client_id: str,
    mcp_url: str,
) -> str:
    session = requests.Session()
    session.headers.update({"apikey": anon_key})
    login = session.post(
        f"{ISSUER}/token",
        params={"grant_type": "password"},
        json={"email": email, "password": password},
        timeout=20,
    )
    if not login.ok:
        raise CanonicalLiveIdentityError(
            f"Disposable OAuth login failed with HTTP {login.status_code}"
        )
    user_token = login.json().get("access_token")
    if not isinstance(user_token, str) or not user_token:
        raise CanonicalLiveIdentityError("Disposable OAuth login omitted access_token")
    verifier, challenge = _pkce()
    state = secrets.token_urlsafe(24)
    authorization_id = _start_authorization(
        session,
        client_id=client_id,
        challenge=challenge,
        state=state,
        mcp_url=mcp_url,
    )
    _authorization_details(session, authorization_id, user_token)
    redirect = _decide(session, authorization_id, user_token, "approve")
    token = _exchange_token(
        session,
        client_id=client_id,
        verifier=verifier,
        redirect_url=redirect,
        mcp_url=mcp_url,
    )
    access_token = token.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise CanonicalLiveIdentityError("PKCE exchange omitted MCP access_token")
    _validate_oauth_access_token_claims(
        access_token,
        client_id=client_id,
        organization_id=DEMO_ORG_ID,
    )
    return access_token


def _capabilities(role: str, *, live18: bool = False):
    if role != "requester":
        return REVIEWER_CAPABILITIES
    return LIVE18_MCP_REQUESTER_CAPABILITIES if live18 else REQUESTER_CAPABILITIES


def _resolve_fixture_identities(cursor, run_token: str) -> dict[str, str]:
    run_token = _validated_fixture_run_token(run_token)
    run_id, run_attempt = run_token.split("-", 1)
    cycle_count_authority = canonical_live18_cycle_count_authority(
        DEMO_ORG_ID, run_id, run_attempt
    )
    cursor.execute(
        """
        SELECT branch.id::text,customer.id::text,supplier.id::text,
               product.id::text,uom.id::text,count_uom.id::text,
               saleable.id::text,quarantine.id::text,
               destination_branch.id::text,destination_location.id::text,
               bank.id::text,bank_ledger.id::text,
               cycle_count_evidence.id::text,
               interstate.id::text,interstate_address.id::text,
               interstate_registration.id::text,
               sez.id::text,sez_address.id::text,sez_registration.id::text
          FROM core.branches AS branch
          JOIN parties.customer_accounts AS customer
            ON customer.org_id=branch.org_id AND customer.id=%s
           AND customer.status='active'
          JOIN parties.supplier_accounts AS supplier
            ON supplier.org_id=branch.org_id AND supplier.id=%s
           AND supplier.status='active'
          JOIN catalog.products AS product
            ON product.org_id=branch.org_id AND product.id=%s
           AND product.status='active'
          JOIN catalog.uom_conversions AS uom
            ON uom.org_id=product.org_id AND uom.product_id=product.id
           AND uom.id=%s AND uom.status='active'
          JOIN catalog.uom_conversions AS count_uom
            ON count_uom.org_id=product.org_id AND count_uom.product_id=product.id
           AND count_uom.id=%s AND count_uom.status='active'
          JOIN inventory.locations AS saleable
            ON saleable.org_id=branch.org_id AND saleable.branch_id=branch.id
           AND saleable.id=%s AND saleable.status='active' AND saleable.allows_sale
          JOIN inventory.locations AS quarantine
            ON quarantine.org_id=branch.org_id AND quarantine.branch_id=branch.id
           AND quarantine.id=%s AND quarantine.status='active'
          JOIN core.branches AS destination_branch
            ON destination_branch.org_id=branch.org_id
           AND destination_branch.id=%s AND destination_branch.status='active'
          JOIN inventory.locations AS destination_location
            ON destination_location.org_id=destination_branch.org_id
           AND destination_location.branch_id=destination_branch.id
           AND destination_location.id=%s AND destination_location.status='active'
           AND destination_location.allows_sale
          JOIN finance.bank_accounts AS bank
            ON bank.org_id=branch.org_id AND bank.id=%s AND bank.status='active'
          JOIN finance.accounts AS bank_ledger
            ON bank_ledger.org_id=branch.org_id AND bank_ledger.id=%s
           AND bank_ledger.status='active'
          JOIN core.attachments AS cycle_count_evidence
            ON cycle_count_evidence.org_id=branch.org_id
           AND cycle_count_evidence.id=%s
           AND cycle_count_evidence.storage_bucket='canonical-demo-evidence'
           AND cycle_count_evidence.storage_object_path=%s
           AND cycle_count_evidence.sha256=%s
           AND cycle_count_evidence.evidence_kind='inventory_cycle_count_sheet'
           AND cycle_count_evidence.status='retained'
           AND cycle_count_evidence.verified_at IS NOT NULL
           AND cycle_count_evidence.sha256 IS NOT NULL
           AND NOT erp_automation_reads.active_command_evidence_in_use(
               cycle_count_evidence.org_id,'inventory.adjustment.prepare',
               'evidence_attachment_id',cycle_count_evidence.id
           )
          LEFT JOIN parties.customer_accounts AS interstate
            ON interstate.org_id=branch.org_id AND interstate.customer_code=%s
           AND interstate.status='active'
          LEFT JOIN parties.addresses AS interstate_address
            ON interstate_address.org_id=interstate.org_id
           AND interstate_address.party_id=interstate.party_id
           AND interstate_address.is_primary AND interstate_address.status='active'
           AND interstate_address.state_code<>branch.state_code
          LEFT JOIN parties.tax_registrations AS interstate_registration
            ON interstate_registration.org_id=interstate.org_id
           AND interstate_registration.party_id=interstate.party_id
           AND interstate_registration.registration_type='GSTIN'
           AND interstate_registration.state_code=interstate_address.state_code
           AND interstate_registration.taxpayer_type='regular'
           AND interstate_registration.status='active'
          LEFT JOIN parties.customer_accounts AS sez
            ON sez.org_id=branch.org_id AND sez.customer_code=%s
           AND sez.status='active'
          LEFT JOIN parties.addresses AS sez_address
            ON sez_address.org_id=sez.org_id AND sez_address.party_id=sez.party_id
           AND sez_address.is_primary AND sez_address.status='active'
           AND sez_address.state_code<>branch.state_code
          LEFT JOIN parties.tax_registrations AS sez_registration
            ON sez_registration.org_id=sez.org_id
           AND sez_registration.party_id=sez.party_id
           AND sez_registration.registration_type='GSTIN'
           AND sez_registration.state_code=sez_address.state_code
           AND sez_registration.taxpayer_type IN ('sez_unit','sez_developer')
           AND sez_registration.status='active'
         WHERE branch.org_id=%s AND branch.id=%s AND branch.status='active'
         LIMIT 2
        """,
        (
            CUSTOMER_ACCOUNT_ID,
            SUPPLIER_ACCOUNT_ID,
            PRODUCT_ID,
            UOM_CONVERSION_ID,
            COUNT_UOM_CONVERSION_ID,
            SALEABLE_LOCATION_ID,
            QUARANTINE_LOCATION_ID,
            TRANSFER_DESTINATION_BRANCH_ID,
            TRANSFER_DESTINATION_LOCATION_ID,
            BANK_ACCOUNT_ID,
            BANK_LEDGER_ID,
            cycle_count_authority.attachment_id,
            cycle_count_authority.storage_object_path,
            psycopg2.Binary(cycle_count_authority.sha256),
            f"LIVE23-INTER-{run_token}",
            f"LIVE23-SEZ-{run_token}",
            DEMO_ORG_ID,
            BRANCH_ID,
        ),
    )
    rows = cursor.fetchall()
    if len(rows) != 1:
        raise CanonicalLiveIdentityError(
            "The reviewed canonical live fixture identities did not resolve exactly once"
        )
    keys = (
        "branch_id",
        "customer_account_id",
        "supplier_account_id",
        "product_id",
        "uom_conversion_id",
        "count_uom_conversion_id",
        "saleable_location_id",
        "quarantine_location_id",
        "transfer_destination_branch_id",
        "transfer_destination_location_id",
        "bank_account_id",
        "bank_ledger_id",
        "cycle_count_evidence_attachment_id",
        "interstate_customer_account_id",
        "interstate_delivery_address_id",
        "interstate_customer_gstin_id",
        "sez_customer_account_id",
        "sez_delivery_address_id",
        "sez_customer_gstin_id",
    )
    resolved = dict(zip(keys, rows[0]))
    variant_keys = keys[13:]
    if os.getenv("LIVE23_VARIANTS_REQUIRED") == "true":
        if any(resolved[key] is None for key in variant_keys):
            raise CanonicalLiveIdentityError(
                "Required Live23 customer fixture authority is incomplete"
            )
        return resolved
    return {key: resolved[key] for key in keys[:13]}


def _live18_auth_records(management_token: str) -> dict[str, tuple[str, str]]:
    """Return exact requester/reviewer Auth anchors for lost-state recovery."""

    authority = _auth_admin_authority(management_token)
    records: dict[str, tuple[str, str]] = {}
    for page in range(1, 11):
        result = _admin_request(
            "GET", "users", authority, params={"page": page, "per_page": 1000}
        )
        users = result.get("users", []) if isinstance(result, dict) else []
        if not isinstance(users, list):
            raise CanonicalLiveIdentityError("Supabase Auth user listing was malformed")
        for user in users:
            metadata = user.get("app_metadata", {}) if isinstance(user, dict) else {}
            if not isinstance(metadata, dict) or metadata.get("purpose") != LIVE18_PURPOSE:
                continue
            role = metadata.get("browser_role")
            if role not in {"requester", "reviewer", "denial"}:
                raise CanonicalLiveIdentityError(
                    "Live18 Auth anchor has an unexpected browser role"
                )
            try:
                auth_user_id = str(UUID(str(user.get("id"))))
                run_token = str(UUID(str(metadata.get("ephemeral_run_token"))))
            except (TypeError, ValueError) as exc:
                raise CanonicalLiveIdentityError(
                    "Live18 Auth anchor omitted a canonical run-token identity"
                ) from exc
            expected_org = DENIAL_ORG_ID if role == "denial" else DEMO_ORG_ID
            if metadata.get("org_id") != expected_org:
                raise CanonicalLiveIdentityError(
                    "Live18 Auth anchor belongs to an unexpected organization"
                )
            if auth_user_id in records:
                raise CanonicalLiveIdentityError("Live18 Auth anchor was duplicated")
            records[auth_user_id] = (role, run_token)
        if len(users) < 1000:
            return records
    raise CanonicalLiveIdentityError("Supabase Auth user listing exceeded 10 pages")


def _resolve_bound_live18_run_token(cursor, records: dict[str, tuple[str, str]]) -> str | None:
    cursor.execute(
        """
        SELECT id::text,auth_user_id::text
          FROM core.users
         WHERE id IN (%s::uuid,%s::uuid)
         ORDER BY id
        """,
        (DEMO_REVIEWER_USER_ID, DEMO_OPERATOR_USER_ID),
    )
    bindings = dict(cursor.fetchall())
    expected_user_ids = {DEMO_OPERATOR_USER_ID, DEMO_REVIEWER_USER_ID}
    if set(bindings) != expected_user_ids:
        raise CanonicalLiveIdentityError("Canonical demo user bindings are incomplete")
    if bindings == {
        DEMO_OPERATOR_USER_ID: DEMO_OPERATOR_AUTH_USER_ID,
        DEMO_REVIEWER_USER_ID: DEMO_REVIEWER_AUTH_USER_ID,
    }:
        return None
    expected_roles = {
        DEMO_OPERATOR_USER_ID: "requester",
        DEMO_REVIEWER_USER_ID: "reviewer",
    }
    run_tokens: set[str] = set()
    for user_id, role in expected_roles.items():
        auth_user_id = bindings[user_id]
        record = records.get(auth_user_id)
        if record is None or record[0] != role:
            raise CanonicalLiveIdentityError(
                "Canonical demo binding has no exact Live18 Auth anchor"
            )
        run_tokens.add(record[1])
    if len(run_tokens) != 1:
        raise CanonicalLiveIdentityError(
            "Requester and reviewer Auth anchors are from different Live18 runs"
        )
    return run_tokens.pop()


def _mcp_authority_snapshot(
    cursor,
    client_id: str,
    browser_run_token: str | None,
    fixture_run_token: str,
) -> tuple[dict[str, int], list[str]]:
    """Validate exact durable baselines and optional two-hour MCP pair."""

    if (
        not isinstance(client_id, str)
        or not client_id
        or client_id != client_id.strip()
        or len(client_id) > 255
        or "," in client_id
        or any(character.isspace() for character in client_id)
    ):
        raise CanonicalLiveIdentityError("Reviewed MCP OAuth client ID is invalid")
    baseline_grants = _baseline_grants(fixture_run_token)
    temporary_hashes = {
        role: (
            f"{PURPOSE}:{browser_run_token}:{role}"
            if browser_run_token
            else "missing-anchor"
        )
        for role in ("requester", "reviewer")
    }
    cursor.execute(
        """
        SELECT grant_row.org_id::text,grant_row.id::text,
               grant_row.subject_membership_id::text,grant_row.client_id,
               grant_row.client_display_name,grant_row.branch_id IS NULL,
               grant_row.authorization_mode,grant_row.consent_version,
               grant_row.consent_text_hash=CASE
                 WHEN grant_row.id=%s::uuid THEN extensions.digest(%s,'sha256')
                 WHEN grant_row.id=%s::uuid THEN extensions.digest(%s,'sha256')
                 WHEN grant_row.consent_version=%s AND
                      grant_row.subject_membership_id=%s::uuid
                   THEN extensions.digest(%s,'sha256')
                 WHEN grant_row.consent_version=%s AND
                      grant_row.subject_membership_id=%s::uuid
                   THEN extensions.digest(%s,'sha256')
                 ELSE NULL
               END AS consent_hash_matches,
               grant_row.consented_by_membership_id::text,
               grant_row.consented_at=grant_row.granted_at,
               grant_row.granted_by_membership_id::text,
               grant_row.expires_at=grant_row.granted_at+CASE
                 WHEN grant_row.id IN (%s::uuid,%s::uuid) THEN interval '30 days'
                 ELSE interval '2 hours'
               END,
               grant_row.status,grant_row.suspended_at IS NULL,
               grant_row.created_by_membership_id::text,
               grant_row.updated_by_membership_id::text,
               grant_row.expires_at>transaction_timestamp(),grant_row.row_version,
               capability.capability_code,capability.operation_mode,
               capability.risk_class,capability.approval_policy,
               capability.maximum_amount,capability.currency_code,
               capability.allow_sensitive_read,capability.status
          FROM automation.agent_grants AS grant_row
          LEFT JOIN automation.agent_grant_capabilities AS capability
            ON capability.org_id=grant_row.org_id
           AND capability.agent_grant_id=grant_row.id
         WHERE grant_row.client_id=%s
           AND grant_row.subject_membership_id IN (%s::uuid,%s::uuid)
           AND (
             grant_row.status='active' OR
             (grant_row.org_id=%s AND grant_row.id IN (%s::uuid,%s::uuid))
           )
         ORDER BY grant_row.id,capability.capability_code
         FOR UPDATE OF grant_row
        """,
        (
            baseline_grants["requester"],
            BASELINE_AUTHORITY["requester"]["consent_text"],
            baseline_grants["reviewer"],
            BASELINE_AUTHORITY["reviewer"]["consent_text"],
            MCP_TEMPORARY_CONSENT_VERSION,
            DEMO_OPERATOR_MEMBERSHIP_ID,
            temporary_hashes["requester"],
            MCP_TEMPORARY_CONSENT_VERSION,
            DEMO_REVIEWER_MEMBERSHIP_ID,
            temporary_hashes["reviewer"],
            baseline_grants["requester"],
            baseline_grants["reviewer"],
            client_id,
            DEMO_OPERATOR_MEMBERSHIP_ID,
            DEMO_REVIEWER_MEMBERSHIP_ID,
            DEMO_ORG_ID,
            baseline_grants["requester"],
            baseline_grants["reviewer"],
        ),
    )
    rows = cursor.fetchall()
    by_grant: dict[str, dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, tuple) or len(row) != 27:
            raise CanonicalLiveIdentityError("MCP authority snapshot was malformed")
        grant_id = row[1]
        shape = row[:19]
        entry = by_grant.setdefault(grant_id, {"shape": shape, "capabilities": []})
        if entry["shape"] != shape:
            raise CanonicalLiveIdentityError("MCP authority grant shape was inconsistent")
        entry["capabilities"].append(
            {
                "capability_code": row[19],
                "operation_mode": row[20],
                "risk_class": row[21],
                "approval_policy": row[22],
                "maximum_amount": row[23],
                "currency_code": row[24],
                "allow_sensitive_read": row[25],
                "status": row[26],
            }
        )

    baseline_versions: dict[str, int] = {}
    temporary_ids: list[str] = []
    temporary_roles: set[str] = set()
    baseline_statuses: set[str] = set()
    baseline_by_id = {value: role for role, value in baseline_grants.items()}
    role_by_membership = {
        DEMO_OPERATOR_MEMBERSHIP_ID: "requester",
        DEMO_REVIEWER_MEMBERSHIP_ID: "reviewer",
    }
    for grant_id, entry in by_grant.items():
        (
            org_id,
            _grant_id,
            membership_id,
            observed_client_id,
            display_name,
            branch_is_null,
            authorization_mode,
            consent_version,
            hash_matches,
            consented_by,
            consent_equals_granted,
            granted_by,
            lifetime_matches,
            status,
            suspended_at_is_null,
            created_by,
            updated_by,
            unexpired,
            row_version,
        ) = entry["shape"]
        if (
            org_id != DEMO_ORG_ID
            or observed_client_id != client_id
            or membership_id not in role_by_membership
            or branch_is_null is not True
            or authorization_mode != "self_consent"
            or hash_matches is not True
            or consent_equals_granted is not True
            or lifetime_matches is not True
            or created_by != DEMO_REVIEWER_MEMBERSHIP_ID
            or updated_by != DEMO_REVIEWER_MEMBERSHIP_ID
            or unexpired is not True
            or type(row_version) is not int
        ):
            raise CanonicalLiveIdentityError("MCP authority escaped its exact boundary")
        role = role_by_membership[membership_id]
        if grant_id in baseline_by_id:
            baseline_role = baseline_by_id[grant_id]
            expected = BASELINE_AUTHORITY[baseline_role]
            if (
                role != baseline_role
                or display_name != expected["display_name"]
                or consent_version != expected["consent_version"]
                or consented_by != membership_id
                or granted_by != membership_id
                or status not in {"active", "suspended"}
                or suspended_at_is_null is not (status == "active")
                or tuple(entry["capabilities"]) != expected["capabilities"]
            ):
                raise CanonicalLiveIdentityError("Canonical MCP baseline drifted")
            baseline_versions[grant_id] = row_version
            baseline_statuses.add(status)
            continue
        if (
            consent_version != MCP_TEMPORARY_CONSENT_VERSION
            or display_name != f"Ephemeral canonical live {role}"
            or consented_by != membership_id
            or granted_by != DEMO_REVIEWER_MEMBERSHIP_ID
            or status != "active"
            or suspended_at_is_null is not True
            or tuple(entry["capabilities"])
            != LIVE18_TEMPORARY_CAPABILITY_BOUNDS[membership_id]
        ):
            raise CanonicalLiveIdentityError("Temporary MCP authority drifted")
        temporary_ids.append(str(UUID(grant_id)))
        temporary_roles.add(role)

    if set(baseline_versions) != set(baseline_grants.values()):
        raise CanonicalLiveIdentityError("Canonical MCP baseline pair is incomplete")
    if temporary_ids:
        if (
            browser_run_token is None
            or len(temporary_ids) != 2
            or temporary_roles != {"requester", "reviewer"}
        ):
            raise CanonicalLiveIdentityError(
                "Temporary MCP authority has no exact same-run Auth anchor"
            )
        if baseline_statuses != {"suspended"}:
            raise CanonicalLiveIdentityError(
                "Temporary MCP authority did not replace suspended baselines"
            )
    elif baseline_statuses != {"active"}:
        raise CanonicalLiveIdentityError("Canonical MCP baselines are not active")
    return baseline_versions, sorted(temporary_ids)


def recover_lost_live18_mcp_state(
    management_token: str, client_id: str, fixture_run_token: str
) -> dict[str, int]:
    """Recover MCP grants even when both local and transported state were lost."""

    auth_records = _live18_auth_records(management_token)
    baseline_grants = _baseline_grants(fixture_run_token)
    recovered_count = 0
    with _database_connection(management_token) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", (LOCK_KEY,)
            )
            membership_options = _enter_migration_owner(cursor)
            run_token = _resolve_bound_live18_run_token(cursor, auth_records)
            if run_token is not None:
                _set_mcp_audit_context(cursor, run_token)
            _baseline_versions, temporary_ids = _mcp_authority_snapshot(
                cursor, client_id, run_token, fixture_run_token
            )
            if temporary_ids:
                cursor.execute(
                    """
                    UPDATE automation.agent_grants
                       SET status='suspended',suspended_at=transaction_timestamp(),
                           updated_at=transaction_timestamp(),row_version=row_version+1
                     WHERE org_id=%s AND client_id=%s
                       AND id=ANY(CAST(%s AS uuid[])) AND status='active'
                    """,
                    (DEMO_ORG_ID, client_id, temporary_ids),
                )
                if cursor.rowcount != len(temporary_ids):
                    raise CanonicalLiveIdentityError(
                        "Temporary MCP authority changed during recovery"
                    )
                cursor.execute(
                    """
                    UPDATE automation.agent_grants
                       SET status='active',suspended_at=NULL,
                           updated_at=transaction_timestamp(),row_version=row_version+1
                     WHERE org_id=%s AND client_id=%s
                       AND id=ANY(CAST(%s AS uuid[])) AND status='suspended'
                       AND expires_at>transaction_timestamp()
                    """,
                    (
                        DEMO_ORG_ID,
                        client_id,
                        list(baseline_grants.values()),
                    ),
                )
                if cursor.rowcount != 2:
                    raise CanonicalLiveIdentityError(
                        "Canonical MCP baselines changed during recovery"
                    )
                recovered_count = len(temporary_ids)
            _mcp_authority_snapshot(
                cursor, client_id, None, fixture_run_token
            )
            _leave_migration_owner(cursor, membership_options)
    return {
        "recovered_active_mcp_grant_count": recovered_count,
        "remaining_active_mcp_grant_count": 0,
    }


def _provision_database(
    management_token: str,
    browser_state: dict[str, Any],
    fixture_run_token: str,
    client_id: str,
    state: dict[str, Any],
) -> tuple[str, dict[str, str]]:
    live18 = browser_state.get("purpose") == LIVE18_PURPOSE
    auth_by_role = {
        entry["role"]: str(UUID(entry["auth_user_id"]))
        for entry in browser_state.get("auth_users", [])
        if entry.get("role") in {"requester", "reviewer"}
    }
    if set(auth_by_role) != {"requester", "reviewer"}:
        raise CanonicalLiveIdentityError(
            "Two-user browser state omitted requester or reviewer Auth identity"
        )
    baseline_grants = _baseline_grants(fixture_run_token)
    membership_by_role = {
        "requester": DEMO_OPERATOR_MEMBERSHIP_ID,
        "reviewer": DEMO_REVIEWER_MEMBERSHIP_ID,
    }
    user_by_role = {
        "requester": DEMO_OPERATOR_USER_ID,
        "reviewer": DEMO_REVIEWER_USER_ID,
    }
    with _database_connection(management_token) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", (LOCK_KEY,)
            )
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")
            membership_options = _enter_migration_owner(cursor)
            _set_mcp_audit_context(cursor, browser_state["run_token"])
            for role in ("requester", "reviewer"):
                cursor.execute(
                    """
                    SELECT user_row.auth_user_id::text
                      FROM core.users AS user_row
                      JOIN core.memberships AS membership
                        ON membership.user_id=user_row.id
                       AND membership.org_id=%s AND membership.id=%s
                     WHERE user_row.id=%s AND user_row.status='active'
                       AND membership.status='active'
                    """,
                    (DEMO_ORG_ID, membership_by_role[role], user_by_role[role]),
                )
                if cursor.fetchone() != (auth_by_role[role],):
                    raise CanonicalLiveIdentityError(
                        f"Disposable {role} Auth identity is not the active seeded binding"
                    )
            if live18:
                denial = browser_state.get("denial_identity") or {}
                cursor.execute(
                    """
                    SELECT membership.org_id::text
                      FROM core.memberships AS membership
                      JOIN core.users AS user_row
                        ON user_row.id=membership.user_id
                       AND user_row.auth_user_id=%s AND user_row.status='active'
                      JOIN core.organizations AS organization
                        ON organization.id=membership.org_id AND organization.status='active'
                     WHERE membership.id=%s AND membership.user_id=%s
                       AND membership.status='active' AND membership.org_id=%s
                    """,
                    (
                        denial.get("auth_user_id"),
                        denial.get("membership_id"),
                        denial.get("user_id"),
                        DENIAL_ORG_ID,
                    ),
                )
            else:
                cursor.execute(
                    """
                    SELECT membership.org_id::text
                      FROM core.memberships AS membership
                      JOIN core.organizations AS organization
                        ON organization.id=membership.org_id AND organization.status='active'
                     WHERE membership.user_id=%s AND membership.status='active'
                       AND membership.org_id<>%s
                     ORDER BY membership.org_id
                     LIMIT 2
                    """,
                    (DEMO_OPERATOR_USER_ID, DEMO_ORG_ID),
                )
            denial_orgs = cursor.fetchall()
            denial_mapping_is_exact = (
                denial_orgs == [(DENIAL_ORG_ID,)] if live18 else len(denial_orgs) == 1
            )
            if not denial_mapping_is_exact:
                raise CanonicalLiveIdentityError(
                    "The reviewed denial identity must map exactly once to its disposable organization"
                )
            denial_org_id = denial_orgs[0][0]
            fixture_identities = _resolve_fixture_identities(
                cursor, fixture_run_token
            )
            baseline_versions, temporary_ids = _mcp_authority_snapshot(
                cursor,
                client_id,
                str(UUID(browser_state["run_token"])),
                fixture_run_token,
            )
            if temporary_ids:
                raise CanonicalLiveIdentityError(
                    "A prior temporary MCP authority is still active"
                )
            state["prior_active_grants"] = [
                {
                    "grant_id": baseline_grants[role],
                    "membership_id": membership_by_role[role],
                    "row_version": baseline_versions[baseline_grants[role]],
                }
                for role in ("requester", "reviewer")
            ]
            _write_state(Path(state["state_path"]), state)
            cursor.execute(
                """
                UPDATE automation.agent_grants
                   SET status='suspended',suspended_at=transaction_timestamp(),
                       row_version=row_version+1
                 WHERE org_id=%s AND client_id=%s
                   AND id=ANY(CAST(%s AS uuid[]))
                   AND status='active'
                """,
                (
                    DEMO_ORG_ID,
                    client_id,
                    list(baseline_grants.values()),
                ),
            )
            if cursor.rowcount != 2:
                raise CanonicalLiveIdentityError(
                    "Canonical MCP baselines changed during provisioning"
                )
            for role in ("requester", "reviewer"):
                grant_id = state["temporary_grants"][role]
                membership_id = membership_by_role[role]
                cursor.execute(
                    """
                    INSERT INTO automation.agent_grants (
                        org_id,id,subject_membership_id,client_id,client_display_name,
                        branch_id,authorization_mode,consent_version,consent_text_hash,
                        consented_by_membership_id,consented_at,granted_by_membership_id,
                        granted_at,expires_at,status,created_by_membership_id,
                        updated_by_membership_id
                    ) VALUES (
                        %s,%s,%s,%s,%s,NULL,'self_consent',%s,
                        extensions.digest(%s,'sha256'),%s,transaction_timestamp(),
                        %s,transaction_timestamp(),transaction_timestamp()+interval '2 hours',
                        'active',%s,%s
                    )
                    """,
                    (
                        DEMO_ORG_ID,
                        grant_id,
                        membership_id,
                        client_id,
                        f"Ephemeral canonical live {role}",
                        MCP_TEMPORARY_CONSENT_VERSION,
                        f"{PURPOSE}:{browser_state['run_token']}:{role}",
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
                            "read" if capability.endswith(".get") else "write",
                            "read_only" if capability.endswith(".get") else "consequential_write",
                            approval,
                            "read" if capability.endswith(".get") else "write",
                            "read" if capability.endswith(".get") else "write",
                            DEMO_REVIEWER_MEMBERSHIP_ID,
                        )
                        for capability, approval in _capabilities(role, live18=live18)
                    ],
                )
            cursor.execute(
                """
                SELECT grant_row.subject_membership_id::text,grant_row.id::text,
                       array_agg(capability.capability_code ORDER BY capability.capability_code)
                  FROM automation.agent_grants AS grant_row
                  JOIN automation.agent_grant_capabilities AS capability
                    ON capability.org_id=grant_row.org_id
                   AND capability.agent_grant_id=grant_row.id
                   AND capability.status='active'
                 WHERE grant_row.org_id=%s AND grant_row.client_id=%s
                   AND grant_row.id=ANY(CAST(%s AS uuid[]))
                   AND grant_row.status='active'
                   AND grant_row.expires_at>transaction_timestamp()
                 GROUP BY grant_row.subject_membership_id,grant_row.id
                """,
                (
                    DEMO_ORG_ID,
                    client_id,
                    list(state["temporary_grants"].values()),
                ),
            )
            actual = {row[0]: (row[1], tuple(row[2])) for row in cursor.fetchall()}
            expected = {
                membership_by_role[role]: (
                    state["temporary_grants"][role],
                    tuple(sorted(
                        capability for capability, _ in _capabilities(role, live18=live18)
                    )),
                )
                for role in ("requester", "reviewer")
            }
            if actual != expected:
                raise CanonicalLiveIdentityError(
                    "Temporary canonical live MCP authority did not reconcile exactly"
                )
            _leave_migration_owner(cursor, membership_options)
    return denial_org_id, fixture_identities


def provision(
    state_path: Path,
    browser_state_path: Path,
    fixture_run_token: str,
) -> None:
    if state_path.exists():
        raise CanonicalLiveIdentityError("Clean canonical live state before provisioning")
    fixture_run_token = _validated_fixture_run_token(fixture_run_token)
    management_token = _required("SUPABASE_ACCESS_TOKEN")
    _validate_target(management_token)
    browser_state = _read_browser_state(browser_state_path)
    if (
        browser_state is None
        or browser_state.get("purpose") not in {TWO_USER_PURPOSE, LIVE18_PURPOSE}
        or not browser_state.get("database_provisioned")
    ):
        raise CanonicalLiveIdentityError(
            f"Provision the {PROFILE_TWO_USER} or {PROFILE_LIVE18} ephemeral identity profile first"
        )
    auth_admin = _auth_admin_authority(management_token)
    mask_auth_admin_secret(auth_admin)
    client = _reconcile_client(auth_admin)
    client_id = str(client["client_id"])
    state = {
        "version": STATE_VERSION,
        "project_ref": EXPECTED_PROJECT_REF,
        "purpose": PURPOSE,
        "state_path": str(state_path),
        "browser_run_token": browser_state["run_token"],
        "fixture_run_token": fixture_run_token,
        "client_id": client_id,
        "temporary_grants": {
            "requester": str(uuid4()),
            "reviewer": str(uuid4()),
        },
        "prior_active_grants": [],
    }
    _write_state(state_path, state)
    denial_org_id, fixture_identities = _provision_database(
        management_token,
        browser_state,
        fixture_run_token,
        client_id,
        state,
    )
    credentials = {
        "requester": (
            _required("PLAYWRIGHT_LIVE_REQUESTER_EMAIL"),
            _required("PLAYWRIGHT_LIVE_REQUESTER_PASSWORD"),
        ),
        "reviewer": (
            _required("PLAYWRIGHT_LIVE_REVIEWER_EMAIL"),
            _required("PLAYWRIGHT_LIVE_REVIEWER_PASSWORD"),
        ),
    }
    anon_key = _required("SUPABASE_ANON_KEY")
    mcp_url = _deployment_mcp_url()
    tokens = {
        role: _oauth_token(email, password, anon_key, client_id, mcp_url)
        for role, (email, password) in credentials.items()
    }
    for token in tokens.values():
        _mask(token)
    for role, token in tokens.items():
        tool_names, workflow = _exercise_mcp(
            token, business_flow=False, mcp_url=mcp_url
        )
        if not tool_names or workflow is not None:
            raise CanonicalLiveIdentityError(
                f"Deployed MCP rejected the boundary-only {role} OAuth verification"
            )
    requester_auth_id = next(
        entry["auth_user_id"]
        for entry in browser_state["auth_users"]
        if entry["role"] == "requester"
    )
    _append_environment(
        {
            "PHARMA_CANONICAL_MCP_ACCESS_TOKEN": tokens["requester"],
            "PHARMA_CANONICAL_MCP_REVIEWER_ACCESS_TOKEN": tokens["reviewer"],
            "PHARMA_CANONICAL_LIVE_TEST_AUTH_USER_ID": requester_auth_id,
            "PHARMA_CANONICAL_LIVE_TEST_BRANCH_ID": BRANCH_ID,
            "PHARMA_CANONICAL_LIVE_DENIAL_ORG_ID": denial_org_id,
            "MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS": client_id,
        }
    )
    evidence_path = Path(
        os.getenv(
            "PHARMA_CANONICAL_LIVE_FIXTURE_IDENTITY_EVIDENCE_PATH",
            "canonical-live-fixture-identities.json",
        )
    )
    evidence_path.write_text(
        json.dumps(
            {
                "project_ref": EXPECTED_PROJECT_REF,
                "organization_id": DEMO_ORG_ID,
                "denial_organization_id": denial_org_id,
                "oauth_client_id": client_id,
                "fixture_identities": fixture_identities,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    print("Provisioned short-lived requester/reviewer MCP OAuth authority")


def cleanup(state_path: Path) -> None:
    state = _read_state(state_path)
    if state is None:
        print("No ephemeral canonical live MCP state was present")
        return
    management_token = _required("SUPABASE_ACCESS_TOKEN")
    _validate_target(management_token)
    with _database_connection(management_token) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", (LOCK_KEY,)
            )
            membership_options = _enter_migration_owner(cursor)
            _set_mcp_audit_context(cursor, state["browser_run_token"])
            grants = list(state["temporary_grants"].values())
            cursor.execute(
                """
                UPDATE automation.agent_grants
                   SET status='suspended',suspended_at=transaction_timestamp(),
                       row_version=row_version+1
                 WHERE org_id=%s AND client_id=%s
                   AND id=ANY(CAST(%s AS uuid[])) AND status='active'
                """,
                (DEMO_ORG_ID, state["client_id"], grants),
            )
            cursor.execute(
                """
                SELECT count(*) FROM automation.agent_grants
                 WHERE org_id=%s AND client_id=%s
                   AND id=ANY(CAST(%s AS uuid[])) AND status='active'
                """,
                (DEMO_ORG_ID, state["client_id"], grants),
            )
            if cursor.fetchone() != (0,):
                raise CanonicalLiveIdentityError(
                    "Temporary canonical live MCP grants remained active"
                )
            for prior in state.get("prior_active_grants", []):
                cursor.execute(
                    """
                    UPDATE automation.agent_grants
                       SET status='active',suspended_at=NULL,row_version=row_version+1
                     WHERE org_id=%s AND client_id=%s AND id=%s
                       AND status='suspended' AND row_version=%s
                       AND expires_at>transaction_timestamp()
                    """,
                    (
                        DEMO_ORG_ID,
                        state["client_id"],
                        prior["grant_id"],
                        prior["row_version"] + 1,
                    ),
                )
                if cursor.rowcount == 0:
                    cursor.execute(
                        """
                        SELECT status FROM automation.agent_grants
                         WHERE org_id=%s AND client_id=%s AND id=%s
                        """,
                        (
                            DEMO_ORG_ID,
                            state["client_id"],
                            prior["grant_id"],
                        ),
                    )
                    if cursor.fetchone() != ("active",):
                        raise CanonicalLiveIdentityError(
                            "A prior MCP authority changed during the live run; "
                            "cleanup refused to overwrite it"
                        )
            _leave_migration_owner(cursor, membership_options)
    state_path.unlink(missing_ok=True)
    print("Suspended temporary MCP grants and restored prior MCP authorities")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("provision", "cleanup"))
    parser.add_argument("--state", required=True, type=Path)
    parser.add_argument("--browser-state", type=Path)
    parser.add_argument("--fixture-run-token")
    arguments = parser.parse_args(argv)
    if arguments.action == "provision":
        if arguments.browser_state is None:
            raise CanonicalLiveIdentityError("--browser-state is required for provision")
        if arguments.fixture_run_token is None:
            raise CanonicalLiveIdentityError(
                "--fixture-run-token is required for provision"
            )
        provision(
            arguments.state,
            arguments.browser_state,
            arguments.fixture_run_token,
        )
    else:
        cleanup(arguments.state)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (CanonicalLiveIdentityError, requests.RequestException, psycopg2.Error) as exc:
        print(f"Ephemeral canonical live identity reconciliation failed: {exc}", file=sys.stderr)
        raise SystemExit(1)

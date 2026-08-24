#!/usr/bin/env python3
"""Provision and always remove two disposable canonical-staging browser identities.

This is intentionally a short-lived GitHub Actions boundary.  It never writes
the generated passwords or the resolved Supabase service-role key to its state
file.  The only durable state is the minimum non-secret reconciliation data
needed to undo a partially completed run.
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

# Keep the management-token -> legacy service-role resolution in one reviewed
# implementation.  In particular, do not accept a service-role key as input.
from provision_staging_mcp_oauth import (  # noqa: E402
    PROJECT_REF,
    SUPABASE_URL,
    _request_json,
    _service_role_key,
)


EXPECTED_PROJECT_REF = "rgihahbmkrmhitjdjvev"
EXPECTED_POOLER_HOST = "aws-0-ap-south-1.pooler.supabase.com"
WEB_CLIENT_ID = "aasopharma-erp-web"
DEMO_ORG_ID = "d3000000-0000-7000-8000-000000000001"
DEMO_REVIEWER_USER_ID = "d3000000-0000-7000-8000-000000000003"
DEMO_REVIEWER_MEMBERSHIP_ID = "d3000000-0000-7000-8000-000000000004"
DEMO_OPERATOR_USER_ID = "d3000000-0000-7000-8000-000000000023"
DEMO_OPERATOR_MEMBERSHIP_ID = "d3000000-0000-7000-8000-000000000024"
PURPOSE = "canonical-staging-two-user-browser-e2e"
STATE_VERSION = 1

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


class EphemeralIdentityError(RuntimeError):
    pass


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
            "PLAYWRIGHT_LIVE_REQUESTER_EMAIL",
            "PLAYWRIGHT_LIVE_REQUESTER_PASSWORD",
            "PLAYWRIGHT_LIVE_REVIEWER_EMAIL",
            "PLAYWRIGHT_LIVE_REVIEWER_PASSWORD",
        ):
            handle.write(f"{key}=\n")


def _admin_request(
    method: str,
    path: str,
    service_key: str,
    *,
    payload: dict[str, Any] | None = None,
    allow_missing: bool = False,
) -> Any:
    response = requests.request(
        method,
        f"{SUPABASE_URL}/auth/v1/admin/{path.lstrip('/')}",
        headers={
            "Authorization": f"Bearer {service_key}",
            "apikey": service_key,
        },
        json=payload,
        timeout=20,
    )
    if allow_missing and response.status_code == 404:
        return None
    if not response.ok:
        raise EphemeralIdentityError(
            f"Supabase Auth admin {method} {path} failed with HTTP "
            f"{response.status_code}"
        )
    return response.json() if response.content else None


def _create_auth_user(
    service_key: str,
    *,
    role: str,
    run_token: str,
    email: str,
    password: str,
) -> str:
    result = _admin_request(
        "POST",
        "users",
        service_key,
        payload={
            "email": email,
            "password": password,
            "email_confirm": True,
            "app_metadata": {
                "purpose": PURPOSE,
                "ephemeral_run_token": run_token,
                "browser_role": role,
                "organization_id": DEMO_ORG_ID,
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


def _list_run_auth_user_ids(service_key: str, run_token: str) -> set[str]:
    matches: set[str] = set()
    for page in range(1, 11):
        result = _admin_request(
            "GET", f"users?page={page}&per_page=1000", service_key
        )
        users = result.get("users", []) if isinstance(result, dict) else []
        if not isinstance(users, list):
            raise EphemeralIdentityError("Supabase Auth user listing was malformed")
        for user in users:
            metadata = user.get("app_metadata", {}) if isinstance(user, dict) else {}
            if (
                isinstance(metadata, dict)
                and metadata.get("purpose") == PURPOSE
                and metadata.get("ephemeral_run_token") == run_token
            ):
                matches.add(str(UUID(str(user["id"]))))
        if len(users) < 1000:
            break
    else:
        raise EphemeralIdentityError("Supabase Auth user listing exceeded 10 pages")
    return matches


def _delete_auth_user(service_key: str, auth_user_id: str) -> None:
    _admin_request(
        "DELETE", f"users/{UUID(auth_user_id)}", service_key, allow_missing=True
    )


def _database_connection(management_token: str):
    password = _required("SUPABASE_DB_PASSWORD")
    poolers = _request_json(
        "GET",
        (
            "https://api.supabase.com/v1/projects/"
            f"{EXPECTED_PROJECT_REF}/config/database/pooler"
        ),
        management_token,
    )
    primary = [
        item.get("connection_string")
        for item in poolers
        if isinstance(item, dict) and item.get("database_type") == "PRIMARY"
    ] if isinstance(poolers, list) else []
    if len(primary) != 1 or not isinstance(primary[0], str):
        raise EphemeralIdentityError("Expected one reviewed primary Supabase pooler")
    match = re.match(r"^postgresql://[^@]+@([^:]+):(\d+)/", primary[0])
    if not match or (match.group(1), match.group(2)) != (
        EXPECTED_POOLER_HOST,
        "6543",
    ):
        raise EphemeralIdentityError("Supabase pooler does not match the reviewed target")
    return psycopg2.connect(
        host=EXPECTED_POOLER_HOST,
        port=5432,
        dbname="postgres",
        user=f"postgres.{EXPECTED_PROJECT_REF}",
        password=password,
        sslmode="require",
        gssencmode="disable",
        connect_timeout=15,
        application_name="canonical_ephemeral_browser_identities",
    )


def _set_reviewer_context(cursor) -> None:
    for name, value in (
        ("app.org_id", DEMO_ORG_ID),
        ("app.auth_user_id", "d3000000-0000-7000-8000-000000000002"),
        ("app.membership_id", DEMO_REVIEWER_MEMBERSHIP_ID),
        ("app.request_id", str(uuid4())),
    ):
        cursor.execute("SELECT set_config(%s,%s,true)", (name, value))


def _capabilities_for(role: str):
    return REQUESTER_CAPABILITIES if role == "requester" else REVIEWER_CAPABILITIES


def _provision_database(
    management_token: str,
    state_path: Path,
    state: dict[str, Any],
) -> None:
    auth_by_role = {
        entry["role"]: entry["auth_user_id"] for entry in state["auth_users"]
    }
    with _database_connection(management_token) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                ("canonical-staging-two-user-browser-identities",),
            )
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")
            _set_reviewer_context(cursor)
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
                 WHERE (user_row.id,membership.id) IN ((%s,%s),(%s,%s))
                   AND user_row.status='active'
                   AND membership.status='active'
                   AND organization.status='active'
                 ORDER BY user_row.id
                """,
                (
                    DEMO_ORG_ID,
                    DEMO_OPERATOR_USER_ID,
                    DEMO_OPERATOR_MEMBERSHIP_ID,
                    DEMO_REVIEWER_USER_ID,
                    DEMO_REVIEWER_MEMBERSHIP_ID,
                ),
            )
            binding_rows = cursor.fetchall()
            expected_pairs = {
                (DEMO_OPERATOR_USER_ID, DEMO_OPERATOR_MEMBERSHIP_ID),
                (DEMO_REVIEWER_USER_ID, DEMO_REVIEWER_MEMBERSHIP_ID),
            }
            if {(row[0], row[1]) for row in binding_rows} != expected_pairs:
                raise EphemeralIdentityError(
                    "Seeded demo operator and reviewer memberships are not both active"
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
                    [DEMO_OPERATOR_MEMBERSHIP_ID, DEMO_REVIEWER_MEMBERSHIP_ID],
                ),
            )
            permissions = {row[0]: set(row[1]) for row in cursor.fetchall()}
            required_permissions = {
                DEMO_OPERATOR_MEMBERSHIP_ID: set(REQUESTER_PERMISSIONS),
                DEMO_REVIEWER_MEMBERSHIP_ID: set(REVIEWER_PERMISSIONS),
            }
            if any(
                not required.issubset(permissions.get(membership_id, set()))
                for membership_id, required in required_permissions.items()
            ):
                raise EphemeralIdentityError(
                    "Seeded memberships lack the required maker/checker role permissions"
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
                    [DEMO_OPERATOR_MEMBERSHIP_ID, DEMO_REVIEWER_MEMBERSHIP_ID],
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
                    [DEMO_OPERATOR_MEMBERSHIP_ID, DEMO_REVIEWER_MEMBERSHIP_ID],
                ),
            )
            for role, user_id, membership_id in IDENTITIES:
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
                        f"{PURPOSE}:{state['run_token']}:{role}",
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
                        in _capabilities_for(role)
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
                    [DEMO_OPERATOR_MEMBERSHIP_ID, DEMO_REVIEWER_MEMBERSHIP_ID],
                ),
            )
            actual = {
                row[0]: (row[1], row[2], tuple(row[3])) for row in cursor.fetchall()
            }
            expected = {
                DEMO_OPERATOR_MEMBERSHIP_ID: (
                    auth_by_role["requester"],
                    state["temporary_grants"]["requester"],
                    tuple(sorted(capability[0] for capability in REQUESTER_CAPABILITIES)),
                ),
                DEMO_REVIEWER_MEMBERSHIP_ID: (
                    auth_by_role["reviewer"],
                    state["temporary_grants"]["reviewer"],
                    tuple(sorted(capability[0] for capability in REVIEWER_CAPABILITIES)),
                ),
            }
            if actual != expected:
                raise EphemeralIdentityError(
                    "Disposable browser identities did not reconcile to exactly one "
                    "correctly bounded active web authority each"
                )
    state["database_provisioned"] = True
    _write_state(state_path, state)


def _cleanup_database(management_token: str, state: dict[str, Any]) -> None:
    with _database_connection(management_token) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                ("canonical-staging-two-user-browser-identities",),
            )
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")
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
                DEMO_OPERATOR_MEMBERSHIP_ID: "requester",
                DEMO_REVIEWER_MEMBERSHIP_ID: "reviewer",
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


def provision(state_path: Path) -> None:
    if state_path.exists():
        raise EphemeralIdentityError(
            "Ephemeral identity state already exists; clean it before provisioning"
        )
    management_token = _required("SUPABASE_ACCESS_TOKEN")
    _validate_target(management_token)
    service_key = _service_role_key(management_token)
    _mask(service_key)
    run_token = str(uuid4())
    state: dict[str, Any] = {
        "version": STATE_VERSION,
        "project_ref": EXPECTED_PROJECT_REF,
        "purpose": PURPOSE,
        "run_token": run_token,
        "auth_users": [],
        "prior_bindings": [],
        "prior_active_grants": [],
        "temporary_grants": {
            "requester": str(uuid4()),
            "reviewer": str(uuid4()),
        },
        "database_provisioned": False,
    }
    _write_state(state_path, state)
    credentials: dict[str, str] = {}
    for role, _, _ in IDENTITIES:
        email = f"erp-{role}-{run_token}@canonical-staging.aasopharma.invalid"
        password = secrets.token_urlsafe(48)
        _mask(email)
        _mask(password)
        auth_user_id = _create_auth_user(
            service_key,
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
    if len({entry["auth_user_id"] for entry in state["auth_users"]}) != 2:
        raise EphemeralIdentityError(
            "Supabase returned the same Auth identity for requester and reviewer"
        )
    _provision_database(management_token, state_path, state)
    _append_job_environment(credentials)
    print(
        "Provisioned two confirmed disposable browser identities with isolated "
        "maker/checker web authorities"
    )


def cleanup(state_path: Path) -> None:
    errors: list[str] = []
    try:
        state = _read_state(state_path)
        if state is None:
            print("No ephemeral browser identity state was present")
            return
        management_token = _required("SUPABASE_ACCESS_TOKEN")
        _validate_target(management_token)
        try:
            _cleanup_database(management_token, state)
        except Exception as exc:  # continue with Auth deletion on partial failure
            errors.append(f"database cleanup: {exc}")
        try:
            service_key = _service_role_key(management_token)
            _mask(service_key)
            auth_user_ids = {
                entry["auth_user_id"] for entry in state.get("auth_users", [])
            }
            auth_user_ids.update(
                _list_run_auth_user_ids(service_key, str(state["run_token"]))
            )
            for auth_user_id in sorted(auth_user_ids):
                _delete_auth_user(service_key, auth_user_id)
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
    arguments = parser.parse_args(argv)
    if arguments.action == "provision":
        provision(arguments.state)
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

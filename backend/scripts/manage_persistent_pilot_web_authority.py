#!/usr/bin/env python3
"""Open or close one bounded first-party web authority in canonical staging.

This control-plane helper never creates an organization, user, membership, role,
or business row.  It binds an explicitly reviewed canonical user and organization
UUID to one short-lived ``aasopharma-erp-web`` grant, or suspends that grant.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import json
import os
import re
from dataclasses import dataclass
from typing import Any, Iterable
from uuid import NAMESPACE_URL, UUID, uuid5

import psycopg2

if __package__:
    from .canonical_staging_database import (
        build_direct_dsn,
        load_direct_database_contract,
    )
    from .provision_staging_mcp_oauth import (
        _attest_reviewed_database,
        _enter_migration_owner,
        _leave_migration_owner,
    )
else:
    from canonical_staging_database import (
        build_direct_dsn,
        load_direct_database_contract,
    )
    from provision_staging_mcp_oauth import (
        _attest_reviewed_database,
        _enter_migration_owner,
        _leave_migration_owner,
    )


WEB_CLIENT_ID = "aasopharma-erp-web"
WEB_CLIENT_NAME = "AASOPharma persistent pilot web acceptance"
CONSENT_VERSION = "persistent-pilot-purchase-acceptance-v1"
CONSENT_TEXT = (
    "Time-bounded canonical staging purchase acceptance: purchase order, goods "
    "receipt, supplier invoice, supplier payment, supplier advance, purchase "
    "return, exact command approval, execution, and status readback."
)
MAXIMUM_AMOUNT = "10000.00"
AUTHORITY_HOURS = 8
STATUS_CAPABILITY = "automation.command.status.get"
WRITE_CAPABILITIES = (
    ("procurement.purchase_order.prepare", "actor_confirmation"),
    ("procurement.goods_receipt.prepare", "actor_confirmation"),
    ("procurement.supplier_invoice.prepare", "actor_confirmation"),
    ("procurement.purchase_return.prepare", "separate_approver"),
    ("finance.supplier_payment.prepare", "actor_confirmation"),
    ("finance.supplier_advance.prepare", "separate_approver"),
    ("automation.command.approve", "actor_confirmation"),
    ("automation.command.execute", "actor_confirmation"),
)


class AuthorityError(RuntimeError):
    pass


@dataclass(frozen=True)
class Target:
    project_ref: str
    organization_id: UUID
    auth_user_id: UUID
    canonical_user_id: UUID
    authority_nonce: str


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise AuthorityError(f"{name} is required")
    return value


def _target_from_environment() -> Target:
    project_ref = _required("CANONICAL_STAGING_PROJECT_REF")
    production_refs = {
        item.strip()
        for item in _required("CANONICAL_PRODUCTION_PROJECT_REFS").split(",")
        if item.strip()
    }
    if project_ref in production_refs:
        raise AuthorityError("Persistent pilot authority refuses a production project")
    nonce = _required("PERSISTENT_PILOT_AUTHORITY_NONCE")
    if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,160}", nonce):
        raise AuthorityError("PERSISTENT_PILOT_AUTHORITY_NONCE is invalid")
    try:
        return Target(
            project_ref=project_ref,
            organization_id=UUID(_required("PERSISTENT_PILOT_ORGANIZATION_ID")),
            auth_user_id=UUID(_required("PERSISTENT_PILOT_AUTH_USER_ID")),
            canonical_user_id=UUID(_required("PERSISTENT_PILOT_CANONICAL_USER_ID")),
            authority_nonce=nonce,
        )
    except ValueError as exc:
        raise AuthorityError("Persistent pilot identity inputs must be canonical UUIDs") from exc


def _database_url(target: Target) -> str:
    contract = load_direct_database_contract()
    if contract.project_ref != target.project_ref:
        raise AuthorityError("Persistent pilot authority targets the wrong staging project")
    return build_direct_dsn(
        contract=contract,
        role=contract.administrator_role,
        password=_required("SUPABASE_DB_PASSWORD"),
        application_name="persistent_pilot_web_authority",
    )


def _rows(cursor, sql: str, params: Iterable[Any]) -> list[tuple[Any, ...]]:
    cursor.execute(sql, tuple(params))
    return list(cursor.fetchall())


def _resolve_membership(cursor, target: Target) -> UUID:
    rows = _rows(
        cursor,
        """
        SELECT membership.id::text
          FROM core.users AS user_row
          JOIN core.memberships AS membership ON membership.user_id=user_row.id
          JOIN core.organizations AS organization ON organization.id=membership.org_id
         WHERE user_row.id=%s AND user_row.auth_user_id=%s
           AND membership.org_id=%s
           AND user_row.status='active' AND membership.status='active'
           AND organization.status='active'
         ORDER BY membership.id
         LIMIT 2
        """,
        (target.canonical_user_id, target.auth_user_id, target.organization_id),
    )
    if len(rows) != 1:
        raise AuthorityError(
            "Reviewed persistent pilot identity must resolve to exactly one active membership"
        )
    return UUID(rows[0][0])


def _activate_audit_context(cursor, target: Target, membership_id: UUID) -> None:
    request_id = uuid5(
        NAMESPACE_URL,
        f"persistent-pilot-web-authority-request:{target.organization_id}:{target.authority_nonce}",
    )
    for name, value in (
        ("app.org_id", target.organization_id),
        ("app.auth_user_id", target.auth_user_id),
        ("app.membership_id", membership_id),
        ("app.request_id", request_id),
    ):
        cursor.execute("SELECT pg_catalog.set_config(%s,%s,true)", (name, str(value)))


def _active_grants(cursor, target: Target, membership_id: UUID) -> list[tuple[Any, ...]]:
    return _rows(
        cursor,
        """
        SELECT id::text, consent_version, expires_at
          FROM automation.agent_grants
         WHERE org_id=%s AND subject_membership_id=%s
           AND client_id=%s AND branch_id IS NULL AND status='active'
         ORDER BY id
         LIMIT 2
         FOR UPDATE
        """,
        (target.organization_id, membership_id, WEB_CLIENT_ID),
    )


def _expected_capability_rows() -> set[tuple[Any, ...]]:
    return {
        (
            capability,
            "write",
            "consequential_write",
            approval,
            MAXIMUM_AMOUNT,
            "INR",
            False,
        )
        for capability, approval in WRITE_CAPABILITIES
    } | {(STATUS_CAPABILITY, "read", "read_only", "none", None, None, False)}


def _capability_rows(cursor, target: Target, grant_id: UUID) -> set[tuple[Any, ...]]:
    rows = _rows(
        cursor,
        """
        SELECT capability_code,operation_mode,risk_class,approval_policy,
               maximum_amount::text,currency_code,allow_sensitive_read
          FROM automation.agent_grant_capabilities
         WHERE org_id=%s AND agent_grant_id=%s AND status='active'
        """,
        (target.organization_id, grant_id),
    )
    return {tuple(row) for row in rows}


def _open(cursor, target: Target, membership_id: UUID) -> dict[str, Any]:
    active = _active_grants(cursor, target, membership_id)
    if len(active) > 1:
        raise AuthorityError("Persistent pilot web authority is ambiguous")
    if active:
        active_id = UUID(active[0][0])
        if active[0][1] != CONSENT_VERSION:
            raise AuthorityError("An unreviewed active first-party web grant already exists")
        expires_at = active[0][2]
        if expires_at <= datetime.now(timezone.utc):
            cursor.execute(
                """
                UPDATE automation.agent_grants
                   SET status='expired',updated_by_membership_id=%s,
                       row_version=row_version+1
                 WHERE org_id=%s AND id=%s AND status='active'
                """,
                (membership_id, target.organization_id, active_id),
            )
            active = []
        elif expires_at <= datetime.now(timezone.utc) + timedelta(hours=1):
            cursor.execute(
                """
                UPDATE automation.agent_grants
                   SET status='suspended',suspended_at=transaction_timestamp(),
                       updated_by_membership_id=%s,row_version=row_version+1
                 WHERE org_id=%s AND id=%s AND status='active'
                """,
                (membership_id, target.organization_id, active_id),
            )
            active = []
    if active:
        active_id = UUID(active[0][0])
        if _capability_rows(cursor, target, active_id) != _expected_capability_rows():
            raise AuthorityError("Active persistent pilot grant capabilities differ from the review")
        return {
            "action": "open",
            "state": "already_open",
            "organization_id": str(target.organization_id),
            "canonical_user_id": str(target.canonical_user_id),
            "membership_id": str(membership_id),
            "agent_grant_id": str(active_id),
            "expires_at": active[0][2].isoformat(),
            "capability_count": len(_expected_capability_rows()),
        }

    grant_id = uuid5(
        NAMESPACE_URL,
        f"persistent-pilot-web-authority:{target.organization_id}:"
        f"{target.auth_user_id}:{target.authority_nonce}",
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
            %s,%s,%s,%s,%s,NULL,'self_consent',%s,
            extensions.digest(%s,'sha256'),%s,transaction_timestamp(),
            %s,transaction_timestamp(),transaction_timestamp()+make_interval(hours => %s),
            'active',%s,%s
        )
        """,
        (
            target.organization_id,
            grant_id,
            membership_id,
            WEB_CLIENT_ID,
            WEB_CLIENT_NAME,
            CONSENT_VERSION,
            CONSENT_TEXT,
            membership_id,
            AUTHORITY_HOURS,
            membership_id,
            membership_id,
            membership_id,
        ),
    )
    cursor.executemany(
        """
        INSERT INTO automation.agent_grant_capabilities (
            org_id,agent_grant_id,capability_code,operation_mode,risk_class,
            approval_policy,maximum_amount,currency_code,allow_sensitive_read,
            status,created_by_membership_id
        ) VALUES (
            %s,%s,%s,'write','consequential_write',%s,%s,'INR',false,'active',%s
        )
        """,
        [
            (
                target.organization_id,
                grant_id,
                capability,
                approval,
                MAXIMUM_AMOUNT,
                membership_id,
            )
            for capability, approval in WRITE_CAPABILITIES
        ],
    )
    cursor.execute(
        """
        INSERT INTO automation.agent_grant_capabilities (
            org_id,agent_grant_id,capability_code,operation_mode,risk_class,
            approval_policy,maximum_amount,currency_code,allow_sensitive_read,
            status,created_by_membership_id
        ) VALUES (%s,%s,%s,'read','read_only','none',NULL,NULL,false,'active',%s)
        """,
        (target.organization_id, grant_id, STATUS_CAPABILITY, membership_id),
    )
    readback = _active_grants(cursor, target, membership_id)
    if len(readback) != 1 or UUID(readback[0][0]) != grant_id:
        raise AuthorityError("Persistent pilot web grant did not reconcile exactly")
    if _capability_rows(cursor, target, grant_id) != _expected_capability_rows():
        raise AuthorityError("Persistent pilot capability readback did not reconcile exactly")
    return {
        "action": "open",
        "state": "open",
        "organization_id": str(target.organization_id),
        "canonical_user_id": str(target.canonical_user_id),
        "membership_id": str(membership_id),
        "agent_grant_id": str(grant_id),
        "expires_at": readback[0][2].isoformat(),
        "capability_count": len(_expected_capability_rows()),
    }


def _close(cursor, target: Target, membership_id: UUID) -> dict[str, Any]:
    active = _active_grants(cursor, target, membership_id)
    if len(active) > 1:
        raise AuthorityError("Persistent pilot web authority is ambiguous")
    if not active:
        return {
            "action": "close",
            "state": "already_closed",
            "organization_id": str(target.organization_id),
            "canonical_user_id": str(target.canonical_user_id),
            "membership_id": str(membership_id),
            "capability_count": 0,
        }
    grant_id = UUID(active[0][0])
    if active[0][1] != CONSENT_VERSION:
        raise AuthorityError("Refusing to suspend an unreviewed first-party web grant")
    cursor.execute(
        """
        UPDATE automation.agent_grants
           SET status='suspended',suspended_at=transaction_timestamp(),
               updated_by_membership_id=%s,row_version=row_version+1
         WHERE org_id=%s AND id=%s AND status='active'
        """,
        (membership_id, target.organization_id, grant_id),
    )
    if _active_grants(cursor, target, membership_id):
        raise AuthorityError("Persistent pilot web authority remained open")
    return {
        "action": "close",
        "state": "closed",
        "organization_id": str(target.organization_id),
        "canonical_user_id": str(target.canonical_user_id),
        "membership_id": str(membership_id),
        "agent_grant_id": str(grant_id),
        "capability_count": 0,
    }


def reconcile(action: str, target: Target, database_url: str) -> dict[str, Any]:
    if action not in {"open", "close"}:
        raise AuthorityError("Authority action must be open or close")
    with psycopg2.connect(database_url) as connection:
        with connection.cursor() as cursor:
            _attest_reviewed_database(cursor)
            supports_membership_options = _enter_migration_owner(cursor)
            try:
                cursor.execute("SET CONSTRAINTS ALL DEFERRED")
                membership_id = _resolve_membership(cursor, target)
                _activate_audit_context(cursor, target, membership_id)
                receipt = (
                    _open(cursor, target, membership_id)
                    if action == "open"
                    else _close(cursor, target, membership_id)
                )
                cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
            finally:
                _leave_migration_owner(cursor, supports_membership_options)
    return receipt


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("open", "close"))
    args = parser.parse_args(argv)
    target = _target_from_environment()
    receipt = reconcile(args.action, target, _database_url(target))
    print(json.dumps(receipt, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

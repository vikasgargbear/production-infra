#!/usr/bin/env python3
"""Apply one reviewed historical inventory batch or promote an imported dataset.

The script is an operator-only entry point.  It accepts a JSON request on stdin,
attests the exact staging deployment/database, resolves one existing active ERP
administrator, and calls the same PostgreSQL authorities used by the REST API.
Business data is never embedded in the repository or printed in the receipt.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import sys
from typing import Any
from urllib.parse import quote
from uuid import UUID, uuid4

import psycopg2

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.routes.canonical_historical_migration import (
    HistoricalImportRequest,
    _wire_fact,
)
from scripts.provision_staging_mcp_oauth import (
    _attest_reviewed_database,
    _enter_migration_owner,
    _leave_migration_owner,
)


CANONICAL_STAGING_PROJECT_REF = "rgihahbmkrmhitjdjvev"
EXPECTED_CONFIRMATION_PREFIX = "APPLY-REVIEWED-HISTORICAL-INVENTORY"


def _uuid(value: Any, field: str) -> UUID:
    try:
        return UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise SystemExit(f"{field} is not a UUID") from exc


def _result(value: Any) -> dict[str, Any]:
    if isinstance(value, str):
        value = json.loads(value)
    if not isinstance(value, dict):
        raise SystemExit("canonical database authority returned an invalid receipt")
    return value


def _validate_request(value: dict[str, Any]) -> dict[str, Any]:
    allowed = {
        "action",
        "branch_id",
        "confirmation",
        "dataset_id",
        "expected_sha",
        "import_request",
        "location_id",
        "organization_id",
        "password",
        "production_project_refs",
        "project_ref",
        "user_id",
    }
    if set(value) - allowed:
        raise SystemExit("operator request contains unsupported fields")
    if value.get("action") not in {"import", "promote", "status"}:
        raise SystemExit("operator action is invalid")
    if not re.fullmatch(r"[0-9a-f]{40}", str(value.get("expected_sha", ""))):
        raise SystemExit("reviewed SHA is invalid")
    if os.environ.get("RAILWAY_GIT_COMMIT_SHA") != value["expected_sha"]:
        raise SystemExit("active API deployment differs from reviewed SHA")
    if value.get("project_ref") != CANONICAL_STAGING_PROJECT_REF:
        raise SystemExit("operator target is not canonical staging")
    production_refs = {
        item.strip()
        for item in str(value.get("production_project_refs", "")).split(",")
        if item.strip()
    }
    if value["project_ref"] in production_refs:
        raise SystemExit("refusing reviewed historical import against production")
    dataset_id = str(value.get("dataset_id", ""))
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{7,127}", dataset_id):
        raise SystemExit("dataset ID is invalid")
    organization_id = _uuid(value.get("organization_id"), "organization_id")
    user_id = _uuid(value.get("user_id"), "user_id")
    branch_id = _uuid(value.get("branch_id"), "branch_id")
    location_id = _uuid(value.get("location_id"), "location_id")
    expected_confirmation = (
        f"{EXPECTED_CONFIRMATION_PREFIX}:{organization_id}:{dataset_id}"
    )
    if value.get("confirmation") != expected_confirmation:
        raise SystemExit("operator confirmation differs")
    password = str(value.get("password", ""))
    if not password:
        raise SystemExit("database credential is unavailable")
    return {
        **value,
        "organization_id": organization_id,
        "user_id": user_id,
        "branch_id": branch_id,
        "location_id": location_id,
        "dataset_id": dataset_id,
        "password": password,
    }


def _database_url(value: dict[str, Any]) -> str:
    return (
        "postgresql://postgres:"
        + quote(value["password"], safe="")
        + "@db."
        + value["project_ref"]
        + ".supabase.co:5432/postgres?sslmode=require&gssencmode=disable"
        + "&connect_timeout=15&application_name=reviewed_historical_inventory"
    )


def _activate_reviewed_user(cursor, value: dict[str, Any]) -> tuple[str, str]:
    cursor.execute(
        """
        SELECT user_row.auth_user_id::text,membership.id::text
          FROM core.users AS user_row
          JOIN core.memberships AS membership ON membership.user_id=user_row.id
          JOIN core.organizations AS organization ON organization.id=membership.org_id
         WHERE user_row.id=%s AND membership.org_id=%s
           AND user_row.auth_user_id IS NOT NULL
           AND user_row.status='active'
           AND membership.status='active'
           AND membership.joined_at IS NOT NULL
           AND membership.revoked_at IS NULL
           AND organization.status='active'
         ORDER BY membership.id
         LIMIT 2
        """,
        (str(value["user_id"]), str(value["organization_id"])),
    )
    rows = cursor.fetchall()
    if len(rows) != 1:
        raise SystemExit("reviewed user lacks one active membership in the target organization")
    auth_user_id, membership_id = rows[0]
    cursor.execute(
        "SELECT erp_security.activate_context(%s,%s),"
        "pg_catalog.set_config('app.request_id',%s,true)",
        (auth_user_id, str(value["organization_id"]), str(uuid4())),
    )
    cursor.execute(
        "SELECT erp_security.has_permission('core.organization.manage',NULL::uuid)"
    )
    if cursor.fetchone()[0] is not True:
        raise SystemExit("reviewed user lacks organization migration authority")
    return auth_user_id, membership_id


def _import_batch(cursor, value: dict[str, Any]) -> dict[str, Any]:
    raw_request = value.get("import_request")
    if not isinstance(raw_request, dict):
        raise SystemExit("import action requires one decoded import request")
    request = HistoricalImportRequest.model_validate(raw_request)
    if request.dataset_id != value["dataset_id"]:
        raise SystemExit("import request dataset differs")
    if request.branch_id != value["branch_id"]:
        raise SystemExit("import request branch differs")
    expected = f"IMPORT-HISTORY:{value['organization_id']}:{value['dataset_id']}"
    if request.confirmation != expected:
        raise SystemExit("historical import confirmation differs")
    wire = [
        _wire_fact(
            org_id=value["organization_id"],
            dataset_id=request.dataset_id,
            branch_id=request.branch_id,
            fact=fact,
        )
        for fact in request.facts
    ]
    cursor.execute(
        "SELECT erp_automation_commands.import_historical_migration_facts(%s,%s::jsonb)",
        (str(value["organization_id"]), json.dumps(wire, separators=(",", ":"))),
    )
    receipt = _result(cursor.fetchone()[0])
    if receipt.get("accepted") != len(wire):
        raise SystemExit("historical import receipt count differs")
    return receipt


def _status(cursor, value: dict[str, Any]) -> dict[str, Any]:
    cursor.execute(
        "SELECT erp_automation_reads.historical_product_inventory_cutover_status(%s,%s)",
        (str(value["organization_id"]), value["dataset_id"]),
    )
    return _result(cursor.fetchone()[0])


def _promote(cursor, value: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    receipts: list[dict[str, Any]] = []
    for _ in range(50):
        cursor.execute(
            "SELECT erp_automation_commands.promote_historical_product_inventory_batch(%s,%s,%s,100)",
            (
                str(value["organization_id"]),
                value["dataset_id"],
                str(value["location_id"]),
            ),
        )
        receipt = _result(cursor.fetchone()[0])
        receipts.append(receipt)
        if receipt.get("complete") is True:
            break
    else:
        raise SystemExit("historical product promotion did not converge")
    return receipts, _status(cursor, value)


def main() -> int:
    raw = json.load(sys.stdin)
    if not isinstance(raw, dict):
        raise SystemExit("operator request must be a JSON object")
    value = _validate_request(raw)
    action = value["action"]
    with psycopg2.connect(_database_url(value)) as connection:
        with connection.cursor() as cursor:
            _attest_reviewed_database(cursor)
            supports_membership_options = _enter_migration_owner(cursor)
            try:
                _activate_reviewed_user(cursor, value)
                if action == "import":
                    operation_receipt: Any = _import_batch(cursor, value)
                    status = _status(cursor, value)
                elif action == "promote":
                    operation_receipt, status = _promote(cursor, value)
                else:
                    operation_receipt = {"status": "read_only"}
                    status = _status(cursor, value)
            except BaseException:
                connection.rollback()
                raise
            else:
                _leave_migration_owner(cursor, supports_membership_options)
    print(
        json.dumps(
            {
                "status": "ok",
                "action": action,
                "commit_sha": value["expected_sha"],
                "organization_id": str(value["organization_id"]),
                "user_id": str(value["user_id"]),
                "dataset_id": value["dataset_id"],
                "operation": operation_receipt,
                "cutover": status,
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

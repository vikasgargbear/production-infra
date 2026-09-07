#!/usr/bin/env python3
"""Apply one reviewed historical inventory batch or promote an imported dataset.

The script is an operator-only entry point.  It accepts a JSON request on stdin,
attests the exact staging deployment/database, resolves one existing active ERP
administrator, and calls the same PostgreSQL authorities used by the REST API.
Business data is never embedded in the repository or printed in the receipt.
"""

from __future__ import annotations

from contextlib import redirect_stdout
import json
from collections import Counter
from decimal import Decimal
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
        "migration_bundle",
        "location_id",
        "organization_id",
        "password",
        "production_project_refs",
        "project_ref",
        "user_id",
    }
    if set(value) - allowed:
        raise SystemExit("operator request contains unsupported fields")
    if value.get("action") not in {"import", "prepare-tax", "promote", "status", "migrate"}:
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


def _prepare_tax(cursor, value: dict[str, Any]) -> dict[str, Any]:
    cursor.execute(
        "SELECT erp_automation_commands.install_historical_tax_snapshot(%s,%s)",
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


def _migration_requests(value: dict[str, Any]) -> list[HistoricalImportRequest]:
    """Validate the entire source package before committing its first batch."""
    bundle = value.get("migration_bundle")
    if not isinstance(bundle, dict) or bundle.get("schema_version") != "aasopharma.marg-migration.v1":
        raise ValueError("A reviewed MARG migration bundle is required")
    for field in ("organization_id", "branch_id", "location_id", "dataset_id"):
        if str(bundle.get(field)) != str(value[field]):
            raise ValueError(f"Migration bundle {field} differs from the selected target")
    batches = bundle.get("import_requests")
    if not isinstance(batches, list) or not 1 <= len(batches) <= 2000:
        raise ValueError("Migration bundle requires 1 to 2000 request batches")
    requests = [HistoricalImportRequest.model_validate(batch) for batch in batches]
    identities: set[tuple[str, str]] = set()
    for request in requests:
        if request.dataset_id != value["dataset_id"] or request.branch_id != value["branch_id"]:
            raise ValueError("Migration request belongs to a different dataset or branch")
        if request.confirmation != f"IMPORT-HISTORY:{value['organization_id']}:{value['dataset_id']}":
            raise ValueError("Migration request confirmation differs")
        for fact in request.facts:
            identity = (fact.source_kind, fact.record_key)
            if identity in identities:
                raise ValueError("Migration bundle repeats a source record identity")
            identities.add(identity)
    return requests


def _transaction(connection, value: dict[str, Any], operation):
    """Commit one resumable chunk and always restore borrowed owner membership."""
    with connection:
        with connection.cursor() as cursor:
            _attest_reviewed_database(cursor)
            supports_membership_options = _enter_migration_owner(cursor)
            result = None
            try:
                _activate_reviewed_user(cursor, value)
                result = operation(cursor)
                _leave_migration_owner(cursor, supports_membership_options)
            except BaseException:
                connection.rollback()
                raise
            return result


def _source_tax_conflicts(requests) -> list[dict[str, Any]]:
    """Report snapshot-incompatible source rates without changing source facts."""
    groups: dict[str, dict[Decimal, int]] = {}
    for request in requests:
        for fact in request.facts:
            if fact.source_kind != "product" or fact.selection_state != "reviewed":
                continue
            code = fact.payload.get("hsn_code")
            rate = fact.payload.get("gst_rate")
            if code is None or rate is None:
                continue  # Completeness remains enforced by the canonical command.
            normalized = Decimal(str(rate))
            counts = groups.setdefault(str(code), {})
            counts[normalized] = counts.get(normalized, 0) + 1
    return [{"hsn_code": code, "rates": [str(rate) for rate in sorted(counts)],
             "products": sum(counts.values())}
            for code, counts in sorted(groups.items()) if len(counts) > 1]


def _validate_migration_tax_catalog(cursor, requests):
    """Customer migration may read, but must not replace, shared tax releases."""
    products = [{"code": fact.payload.get("hsn_code"), "rate": fact.payload.get("gst_rate"),
                 "event_date": str(fact.event_date) if fact.event_date else None}
                for request in requests for fact in request.facts
                if fact.source_kind == "product" and fact.selection_state == "reviewed"]
    cursor.execute("""
        SELECT count(*) FROM jsonb_to_recordset(%s::jsonb)
          AS source(code text, rate numeric, event_date date)
        WHERE (SELECT count(*) FROM tax.tax_code_versions version
          JOIN core.reference_data_releases release ON release.id=version.release_id
          WHERE version.code=source.code AND version.code_kind='hsn'
            AND version.default_supply_type='goods' AND version.status='active'
            AND release.dataset_kind='hsn_sac_tax' AND release.status='active'
            AND source.event_date BETWEEN version.effective_from
                AND COALESCE(version.effective_to,'infinity'::date)
            AND source.event_date BETWEEN release.effective_from
                AND COALESCE(release.effective_to,'infinity'::date)
            AND version.igst_rate=source.rate) <> 1
        """, (json.dumps(products),))
    if cursor.fetchone()[0]:
        raise ValueError("Source product tax assignments do not match the reviewed catalog; no import writes started")


def _operational_status(cursor, value: dict[str, Any]) -> dict[str, Any]:
    cursor.execute(
        "SELECT erp_automation_reads.historical_operational_cutover_status(%s,%s)",
        (str(value["organization_id"]), value["dataset_id"]),
    )
    return _result(cursor.fetchone()[0])


def _promote_parties(cursor, value: dict[str, Any]) -> dict[str, Any]:
    cursor.execute(
        "SELECT erp_automation_commands.promote_historical_operational_batch(%s,%s,500)",
        (str(value["organization_id"]), value["dataset_id"]),
    )
    return _result(cursor.fetchone()[0])


def _promote_products(cursor, value: dict[str, Any]) -> dict[str, Any]:
    cursor.execute(
        "SELECT erp_automation_commands.promote_historical_product_inventory_batch(%s,%s,%s,100)",
        (str(value["organization_id"]), value["dataset_id"], str(value["location_id"])),
    )
    return _result(cursor.fetchone()[0])


def _converge(step, remaining_fields: tuple[str, ...], label: str) -> int:
    previous = None
    for batch_number in range(1, 10001):
        result = step()
        remaining = sum(int(result[field]) for field in remaining_fields)
        if remaining < 0 or (result.get("complete") is True and remaining != 0):
            raise ValueError(f"{label} returned an inconsistent completion receipt")
        if result.get("complete") is True:
            return batch_number
        if previous is not None and remaining >= previous:
            raise ValueError(f"{label} stopped making progress; rerun after resolving the failed records")
        previous = remaining
    raise ValueError(f"{label} exceeded the bounded batch count")


def _reconcile_migration(cursor, value: dict[str, Any], requests) -> dict[str, Any]:
    expected = Counter(fact.source_kind for request in requests for fact in request.facts)
    cursor.execute(
        "SELECT source_kind::text,count(*) FROM automation.historical_migration_facts "
        "WHERE org_id=%s AND dataset_id=%s GROUP BY source_kind",
        (str(value["organization_id"]), value["dataset_id"]),
    )
    observed = dict(cursor.fetchall())
    if dict(expected) != observed:
        raise ValueError("Imported source counts differ from the reviewed package")
    inventory = _status(cursor, value)
    parties = _operational_status(cursor, value)
    for source, bound in (("source_products", "bound_products"), ("source_batches", "bound_batches")):
        if inventory[source] != inventory[bound]:
            raise ValueError(f"Inventory reconciliation differs: {source}")
    if parties["source_openings"] != parties["posted_openings"]:
        raise ValueError("Opening balance reconciliation differs")
    # Bindings may include a separate customer and supplier account for one party.
    if parties["bound_parties"] < parties["source_parties"]:
        raise ValueError("Party reconciliation differs")
    batches = [fact for request in requests for fact in request.facts
               if fact.source_kind == "batch" and fact.selection_state == "reviewed"]
    for field, fact_field in (("quantity", "quantity"), ("value", "inventory_value")):
        expected_total = sum((getattr(fact, fact_field) for fact in batches), Decimal(0))
        if Decimal(inventory[f"opening_{field}"]) != expected_total or Decimal(inventory[f"ledger_{field}"]) != expected_total:
            raise ValueError(f"Opening stock {field} does not reconcile with its ledger")
    for side in ("receivable", "payable"):
        expected_amount = sum((fact.outstanding_amount for request in requests for fact in request.facts
            if fact.source_kind == "opening_item" and fact.selection_state != "quarantined" and fact.side == side), Decimal(0))
        if Decimal(parties[side]) != expected_amount:
            raise ValueError(f"Opening {side} does not reconcile with the source")
    return {"counts_by_kind": observed, "inventory": inventory, "parties": parties}


def _migrate(connection, value: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    requests = _migration_requests(value)
    conflicts = _source_tax_conflicts(requests)
    if conflicts:
        raise ValueError(
            f"Source GST review required for {sum(item['products'] for item in conflicts)} "
            f"products across {len(conflicts)} HSN codes; no import writes started"
        )
    has_products = any(fact.source_kind == "product" and fact.selection_state == "reviewed"
                       for request in requests for fact in request.facts)
    if has_products:
        _transaction(connection, value, lambda c: _validate_migration_tax_catalog(c, requests))
    accepted = 0
    for index, request in enumerate(requests, 1):
        batch_value = {**value, "import_request": request.model_dump(mode="json")}
        result = _transaction(connection, value, lambda cursor: _import_batch(cursor, batch_value))
        accepted += int(result["accepted"])
        print(f"Import batch {index}/{len(requests)} committed ({accepted} records checked)", file=sys.stderr)
    _converge(lambda: _transaction(connection, value, lambda c: _promote_parties(c, value)),
              ("parties_remaining", "openings_remaining"), "Party and opening migration")
    if has_products:
        _converge(lambda: _transaction(connection, value, lambda c: _promote_products(c, value)),
                  ("products_remaining",), "Product and inventory migration")
    reconciliation = _transaction(connection, value, lambda c: _reconcile_migration(c, value, requests))
    return {
        "complete": True,
        "accepted": accepted,
        "reconciliation": reconciliation,
        "exclusions": value["migration_bundle"].get("exclusions", {}),
        "invoice_history": "Imported history is available in the invoice archive; new invoices use migrated stock.",
    }, reconciliation["inventory"]


def main() -> int:
    receipt_stream = sys.stdout
    raw = json.load(sys.stdin)
    if not isinstance(raw, dict):
        raise SystemExit("operator request must be a JSON object")
    value = _validate_request(raw)
    action = value["action"]
    # Imported helpers may emit diagnostics. Keep stdout reserved for the one
    # machine-readable receipt consumed by the protected workflow.
    with redirect_stdout(sys.stderr):
        with psycopg2.connect(_database_url(value)) as connection:
            if action == "migrate":
                operation_receipt, status = _migrate(connection, value)
            else:
                operation_receipt, status = _single_operation(connection, value)
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
        ),
        file=receipt_stream,
    )
    return 0


def _single_operation(connection, value):
    action = value["action"]
    with connection.cursor() as cursor:
        _attest_reviewed_database(cursor)
        supports_membership_options = _enter_migration_owner(cursor)
        try:
            _activate_reviewed_user(cursor, value)
            if action == "import":
                operation_receipt: Any = _import_batch(cursor, value)
                status = _status(cursor, value)
            elif action == "prepare-tax":
                operation_receipt = _prepare_tax(cursor, value)
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
    return operation_receipt, status


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Compile reviewed live18 UI templates from canonical staging facts.

Templates are repository-owned interaction intent.  Canonical identities and
labels are resolved after disposable staging provisioning.  Only genuinely
non-derivable operator choices may arrive in the compact reviewed scalar pack.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

import psycopg2


FIXTURE_SCHEMA = "aasopharma.live18.fixture.v1"
SCALAR_SCHEMA = "aasopharma.live18.reviewed-scalars.v1"
TEMPLATE_SCHEMA = "aasopharma.live18.ui-template.v1"
MAX_SCALAR_BYTES = 32 * 1024
UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.I,
)
TOKEN_RE = re.compile(r"\{\{(fact|scalar)\.([a-z][a-z0-9_.]*)\}\}")
RUNTIME_TOKEN_RE = re.compile(
    r"\{\{(?:command_request_id|preview_hash|run_token|resource_[a-z][a-z0-9_]*)\}\}"
)
RESOURCE_TOKEN_RE = re.compile(r"\{\{resource_([a-z][a-z0-9_]*)\}\}")
FORBIDDEN_SCALAR_KEYS = re.compile(r"(?:^|_)(?:id|uuid|row_version|hash|date|time|timestamp)$")
PHASES = (
    "missing_required_steps", "prepare_steps", "approval_steps", "execute_steps",
)
LIFECYCLE_MODES = {"split", "combined_actor_confirmation"}
ACTORS = {"requester", "reviewer"}
ACTIONS = {"goto", "click", "fill", "select", "press", "expectText"}
LOCATOR_KINDS = {"role", "label", "placeholder", "text", "testId"}
COMMUNICATION_ACTION = re.compile(r"whats?app|e-?mail|sms|text message|phone|call|tel:", re.I)


class FixtureCompileError(RuntimeError):
    pass


def _object(path: Path, label: str) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise FixtureCompileError(f"{label} must be a JSON object")
    return value


def _leaf(mapping: dict[str, Any], dotted: str, authority: str) -> str:
    value: Any = mapping
    for part in dotted.split("."):
        if not isinstance(value, dict) or part not in value:
            raise FixtureCompileError(f"missing {authority} value: {dotted}")
        value = value[part]
    if not isinstance(value, (str, int, float)) or isinstance(value, bool):
        raise FixtureCompileError(f"{authority} value must be scalar: {dotted}")
    rendered = str(value)
    if not rendered:
        raise FixtureCompileError(f"{authority} value must be non-empty: {dotted}")
    return rendered


def load_reviewed_scalars(path: Path) -> dict[str, Any]:
    raw = path.read_bytes()
    if len(raw) > MAX_SCALAR_BYTES:
        raise FixtureCompileError(
            f"reviewed scalar pack exceeds {MAX_SCALAR_BYTES} bytes"
        )
    pack = json.loads(raw)
    if not isinstance(pack, dict) or pack.get("schema") != SCALAR_SCHEMA:
        raise FixtureCompileError(f"reviewed scalar pack must use {SCALAR_SCHEMA}")
    values = pack.get("values")
    if not isinstance(values, dict):
        raise FixtureCompileError("reviewed scalar pack values must be an object")
    for key, value in values.items():
        if not isinstance(key, str) or FORBIDDEN_SCALAR_KEYS.search(key):
            raise FixtureCompileError(
                f"canonical identity/time authority is forbidden in reviewed scalar: {key}"
            )
        if not isinstance(value, (str, int, float)) or isinstance(value, bool):
            raise FixtureCompileError(f"reviewed scalar must be primitive: {key}")
        if UUID_RE.fullmatch(str(value)):
            raise FixtureCompileError(f"reviewed scalar must not carry a UUID: {key}")
    return values


def load_identity_evidence(path: Path) -> tuple[str, dict[str, str]]:
    evidence = _object(path, "identity evidence")
    org_id = evidence.get("organization_id")
    identities = evidence.get("fixture_identities")
    if not isinstance(org_id, str) or not UUID_RE.fullmatch(org_id):
        raise FixtureCompileError("identity evidence omitted canonical organization_id")
    if not isinstance(identities, dict) or not identities:
        raise FixtureCompileError("identity evidence omitted fixture_identities")
    for key, value in identities.items():
        if not isinstance(key, str) or not isinstance(value, str) or not UUID_RE.fullmatch(value):
            raise FixtureCompileError(f"invalid canonical fixture identity: {key}")
    return org_id, identities


def resolve_authoritative_facts(
    database_url: str,
    auth_user_id: str,
    org_id: str,
    identities: dict[str, str],
    run_token: str,
) -> dict[str, Any]:
    required = {
        "branch_id", "customer_account_id", "supplier_account_id", "product_id",
        "uom_conversion_id", "count_uom_conversion_id", "saleable_location_id",
        "quarantine_location_id", "transfer_destination_branch_id",
        "transfer_destination_location_id", "bank_account_id", "bank_ledger_id",
    }
    if set(identities) != required:
        raise FixtureCompileError(
            f"canonical fixture identity set drifted: missing={sorted(required-set(identities))} "
            f"extra={sorted(set(identities)-required)}"
        )
    sql = """
      SELECT branch.code,branch.name,customer.customer_code,customer_party.legal_name,
             supplier.supplier_code,supplier_party.legal_name,
             product.sku,product.name,uom.from_uom_code,count_uom.from_uom_code,
             source.code,source.name,quarantine.code,quarantine.name,
             destination_branch.code,destination_branch.name,
             destination.code,destination.name,bank.bank_name,bank.account_holder_name,
             ledger.code,ledger.name,
             delivery_address.id::text,delivery_address.row_version,
             direct_issue_batch.id::text,direct_issue_batch.batch_number,
             direct_issue_batch.available_base_quantity,uom.multiplier,
             to_char((transaction_timestamp() AT TIME ZONE organization.timezone)::date,'YYYY-MM-DD'),
             to_char(transaction_timestamp() AT TIME ZONE organization.timezone,'YYYY-MM-DD"T"HH24:MI')
        FROM core.branches branch
        JOIN core.organizations organization ON organization.id=branch.org_id AND organization.status='active'
        JOIN parties.customer_accounts customer ON customer.org_id=branch.org_id AND customer.id=%s
        JOIN parties.parties customer_party ON customer_party.org_id=customer.org_id AND customer_party.id=customer.party_id
        JOIN LATERAL (
            SELECT address.id,address.row_version
              FROM parties.addresses address
             WHERE address.org_id=customer.org_id
               AND address.party_id=customer.party_id
               AND address.status='active' AND address.is_primary
             ORDER BY (address.address_kind='shipping') DESC,address.id
             LIMIT 2
        ) delivery_address ON true
        JOIN parties.supplier_accounts supplier ON supplier.org_id=branch.org_id AND supplier.id=%s
        JOIN parties.parties supplier_party ON supplier_party.org_id=supplier.org_id AND supplier_party.id=supplier.party_id
        JOIN catalog.products product ON product.org_id=branch.org_id AND product.id=%s
        JOIN catalog.uom_conversions uom ON uom.org_id=product.org_id AND uom.id=%s AND uom.product_id=product.id
        JOIN catalog.uom_conversions count_uom ON count_uom.org_id=product.org_id AND count_uom.id=%s AND count_uom.product_id=product.id
        JOIN inventory.locations source ON source.org_id=branch.org_id AND source.id=%s AND source.branch_id=branch.id
        JOIN LATERAL (
            SELECT batch.id,batch.batch_number,
                   balance.on_hand_quantity AS available_base_quantity
              FROM inventory.batches batch
              JOIN inventory.stock_balances balance
                ON balance.org_id=batch.org_id AND balance.batch_id=batch.id
               AND balance.product_id=batch.product_id
               AND balance.branch_id=source.branch_id
               AND balance.location_id=source.id
               AND balance.on_hand_quantity>0
             WHERE batch.org_id=product.org_id AND batch.product_id=product.id
               AND batch.status='released' AND batch.released_at IS NOT NULL
               AND batch.expires_on>(transaction_timestamp() AT TIME ZONE organization.timezone)::date
             ORDER BY batch.expires_on,batch.id
             LIMIT 1
        ) direct_issue_batch ON true
        JOIN inventory.locations quarantine ON quarantine.org_id=branch.org_id AND quarantine.id=%s AND quarantine.branch_id=branch.id
        JOIN core.branches destination_branch ON destination_branch.org_id=branch.org_id AND destination_branch.id=%s
        JOIN inventory.locations destination ON destination.org_id=destination_branch.org_id AND destination.id=%s AND destination.branch_id=destination_branch.id
        JOIN finance.bank_accounts bank ON bank.org_id=branch.org_id AND bank.id=%s
        JOIN finance.accounts ledger ON ledger.org_id=branch.org_id AND ledger.id=%s
       WHERE branch.org_id=%s AND branch.id=%s
         AND branch.status='active' AND customer.status='active' AND supplier.status='active'
         AND product.status='active' AND source.status='active' AND quarantine.status='active'
         AND destination_branch.status='active' AND destination.status='active'
         AND bank.status='active' AND ledger.status='active'
    """
    params = (
        identities["customer_account_id"], identities["supplier_account_id"],
        identities["product_id"], identities["uom_conversion_id"],
        identities["count_uom_conversion_id"], identities["saleable_location_id"],
        identities["quarantine_location_id"], identities["transfer_destination_branch_id"],
        identities["transfer_destination_location_id"], identities["bank_account_id"],
        identities["bank_ledger_id"], org_id, identities["branch_id"],
    )
    if not re.fullmatch(r"[1-9][0-9]*-[1-9][0-9]*", run_token):
        raise FixtureCompileError("live18 run token must be GitHub run-id and attempt")
    supplier_challan_number = f"DEMO-UI-CH-{run_token}"
    supplier_invoice_number = f"DEMO-UI-SUP-{run_token}"
    supplier_invoice_sql = """
      SELECT receipt.id::text, receipt.supplier_challan_date,
             portal_line.invoice_number, portal_line.invoice_date
        FROM procurement.goods_receipts AS receipt
        JOIN procurement.goods_receipt_lines AS receipt_line
          ON receipt_line.org_id=receipt.org_id
         AND receipt_line.goods_receipt_id=receipt.id
        JOIN parties.supplier_accounts AS supplier
          ON supplier.org_id=receipt.org_id
         AND supplier.id=receipt.supplier_account_id
         AND supplier.status='active'
        JOIN parties.tax_registrations AS supplier_registration
          ON supplier_registration.org_id=supplier.org_id
         AND supplier_registration.party_id=supplier.party_id
         AND supplier_registration.status='active'
        JOIN tax.portal_document_lines AS portal_line
          ON portal_line.org_id=receipt.org_id
         AND portal_line.document_type='invoice'
         AND portal_line.supplier_gstin=supplier_registration.registration_number
         AND portal_line.invoice_number=%s
         AND portal_line.invoice_date=receipt.supplier_challan_date
        JOIN tax.portal_documents AS portal_document
          ON portal_document.org_id=portal_line.org_id
         AND portal_document.id=portal_line.portal_document_id
         AND portal_document.portal_document_type='gstr2b'
         AND portal_document.status='parsed'
         AND portal_document.parsed_at IS NOT NULL
       WHERE receipt.org_id=%s
         AND receipt.supplier_challan_number=%s
         AND receipt.status='posted'
         AND NOT EXISTS (
           SELECT 1
             FROM procurement.supplier_invoice_receipt_allocations AS allocation
            WHERE allocation.org_id=receipt_line.org_id
              AND allocation.goods_receipt_line_id=receipt_line.id
         )
         AND NOT EXISTS (
           SELECT 1
             FROM automation.command_requests AS command
            WHERE command.org_id=portal_line.org_id
              AND command.capability_code='procurement.supplier_invoice.prepare'
              AND command.operation='procurement.supplier_invoice.post'
              AND command.status NOT IN ('failed','expired','cancelled')
              AND NULLIF(convert_from(command.request_bytes,'UTF8')::jsonb
                    ->>'portal_document_line_id','')::uuid=portal_line.id
         )
       GROUP BY receipt.id, receipt.supplier_challan_date,
                portal_line.id, portal_line.invoice_number, portal_line.invoice_date
      HAVING count(receipt_line.id)=1
    """
    with psycopg2.connect(database_url) as connection:
        connection.set_session(readonly=True, autocommit=False)
        with connection.cursor() as cursor:
            cursor.execute("SELECT erp_security.activate_context(%s::uuid,%s::uuid)", (auth_user_id, org_id))
            cursor.execute(sql, params)
            rows = cursor.fetchall()
            cursor.execute(
                supplier_invoice_sql,
                (supplier_invoice_number, org_id, supplier_challan_number),
            )
            supplier_invoice_rows = cursor.fetchall()
        connection.rollback()
    if len(rows) != 1:
        raise FixtureCompileError(f"authoritative selector facts resolved {len(rows)} rows, expected one")
    keys = (
        "branch_code", "branch_name", "customer_code", "customer_name",
        "supplier_code", "supplier_name", "product_code", "product_name",
        "uom_code", "count_uom_code", "source_location_code", "source_location_name",
        "quarantine_location_code", "quarantine_location_name",
        "destination_branch_code", "destination_branch_name",
        "destination_location_code", "destination_location_name",
        "bank_name", "bank_account_holder", "bank_ledger_code", "bank_ledger_name",
        "delivery_address_id", "delivery_address_row_version",
        "direct_issue_batch_id", "direct_issue_batch_number",
        "direct_issue_available_base_quantity", "sales_uom_multiplier",
    )
    if len(supplier_invoice_rows) != 1:
        raise FixtureCompileError(
            "run-scoped supplier-invoice GRN/GSTR-2B authority resolved "
            f"{len(supplier_invoice_rows)} rows, expected one"
        )
    goods_receipt_id, challan_date, resolved_invoice_number, invoice_date = supplier_invoice_rows[0]
    if resolved_invoice_number != supplier_invoice_number or challan_date != invoice_date:
        raise FixtureCompileError("run-scoped supplier-invoice authority drifted")
    resolved = dict(zip(keys, rows[0][:-2]))
    return {
        "identity": {
            **identities,
            "supplier_invoice_goods_receipt_id": goods_receipt_id,
            "delivery_address_id": resolved.pop("delivery_address_id"),
            "delivery_address_row_version": resolved.pop("delivery_address_row_version"),
            "direct_issue_batch_id": resolved.pop("direct_issue_batch_id"),
        },
        "display": resolved,
        "clock": {
            "business_date": rows[0][-2],
            "business_datetime_local": rows[0][-1],
        },
        "choice": {
            "supplier_invoice_number": resolved_invoice_number,
            "supplier_invoice_date": invoice_date.isoformat(),
            "supplier_invoice_received_date": invoice_date.isoformat(),
        },
    }


def _operation_facts(
    operation_id: str,
    facts: dict[str, Any],
    scalars: dict[str, Any],
    used: set[str],
) -> dict[str, Any]:
    delivery_choices = {
        "sales_order": (
            "sales_order_delivery_offset_days",
            "sales_order_requested_delivery_date",
        ),
        "purchase_order": (
            "purchase_order_delivery_offset_days",
            "purchase_order_expected_delivery_date",
        ),
    }
    if operation_id == "sales_invoice":
        decimal_rules = {
            "sales_invoice_quantity": (6, Decimal("0"), None, False),
            "sales_invoice_rate": (4, Decimal("0"), None, False),
            "sales_invoice_discount_percent": (6, Decimal("0"), Decimal("100"), True),
            "sales_invoice_free_quantity": (6, Decimal("0"), None, False),
            "sales_invoice_distance_km": (2, Decimal("0"), None, False),
        }
        for key, (scale, minimum, maximum, minimum_inclusive) in decimal_rules.items():
            rendered = _leaf(scalars, key, "reviewed scalar")
            if not re.fullmatch(rf"(?:0|[1-9][0-9]{{0,13}})(?:\.[0-9]{{1,{scale}}})?", rendered):
                raise FixtureCompileError(
                    f"{key} must be a non-negative plain decimal with at most {scale} fractional digits"
                )
            try:
                numeric = Decimal(rendered)
            except InvalidOperation as exc:
                raise FixtureCompileError(f"{key} is not a valid reviewed decimal") from exc
            if (numeric < minimum if minimum_inclusive else numeric <= minimum) or (
                maximum is not None and numeric > maximum
            ):
                comparator = "at least" if minimum_inclusive else "greater than"
                ceiling = f" and no greater than {maximum}" if maximum is not None else ""
                raise FixtureCompileError(
                    f"{key} must be {comparator} {minimum}{ceiling}"
                )
        treatment = _leaf(
            scalars, "sales_invoice_free_supply_tax_treatment", "reviewed scalar"
        )
        if treatment not in {
            "excluded_from_taxable_value", "included_at_unit_rate",
        }:
            raise FixtureCompileError(
                "sales_invoice_free_supply_tax_treatment must be an explicit canonical treatment"
            )
        available_base = Decimal(_leaf(
            facts, "display.direct_issue_available_base_quantity", "canonical fact"
        ))
        uom_multiplier = Decimal(_leaf(
            facts, "display.sales_uom_multiplier", "canonical fact"
        ))
        requested_base = (
            Decimal(_leaf(scalars, "sales_invoice_quantity", "reviewed scalar"))
            + Decimal(_leaf(scalars, "sales_invoice_free_quantity", "reviewed scalar"))
        ) * uom_multiplier
        if uom_multiplier <= 0 or requested_base > available_base:
            raise FixtureCompileError(
                "sales_invoice reviewed billed/free quantities exceed the exact selected batch stock"
            )
        return facts
    if operation_id == "goods_receipt":
        offset_text = _leaf(
            scalars, "goods_receipt_expiry_offset_days", "reviewed scalar"
        )
        expiry_offset = (
            r"(?:[3-9][0-9]|[1-9][0-9]{2}|[1-2][0-9]{3}|"
            r"3[0-5][0-9]{2}|36[0-4][0-9]|3650)"
        )
        if not re.fullmatch(expiry_offset, offset_text):
            raise FixtureCompileError(
                "goods_receipt_expiry_offset_days must be an integer from 30 through 3650"
            )
        try:
            business_date = date.fromisoformat(
                _leaf(facts, "clock.business_date", "canonical fact")
            )
        except ValueError as exc:
            raise FixtureCompileError("canonical business date is invalid") from exc
        used.add("goods_receipt_expiry_offset_days")
        return {
            **facts,
            "choice": {
                **(facts.get("choice") or {}),
                "goods_receipt_expiry_date": (
                    business_date + timedelta(days=int(offset_text))
                ).isoformat(),
            },
        }
    if operation_id not in delivery_choices:
        return facts
    offset_key, choice_key = delivery_choices[operation_id]
    offset_text = _leaf(scalars, offset_key, "reviewed scalar")
    if not re.fullmatch(r"[1-9]|[12][0-9]|30", offset_text):
        raise FixtureCompileError(
            f"{offset_key} must be an integer from 1 through 30"
        )
    try:
        business_date = date.fromisoformat(_leaf(facts, "clock.business_date", "canonical fact"))
    except ValueError as exc:
        raise FixtureCompileError("canonical business date is invalid") from exc
    used.add(offset_key)
    return {
        **facts,
        "choice": {
            **(facts.get("choice") or {}),
            choice_key: (
                business_date + timedelta(days=int(offset_text))
            ).isoformat(),
        },
    }


def _compile_value(value: Any, facts: dict[str, Any], scalars: dict[str, Any], used: set[str]) -> Any:
    if isinstance(value, list):
        return [_compile_value(item, facts, scalars, used) for item in value]
    if isinstance(value, dict):
        return {key: _compile_value(item, facts, scalars, used) for key, item in value.items()}
    if not isinstance(value, str):
        return value

    def replace(match: re.Match[str]) -> str:
        authority, dotted = match.groups()
        if authority == "scalar":
            used.add(dotted)
            return _leaf(scalars, dotted, "reviewed scalar")
        return _leaf(facts, dotted, "canonical fact")

    rendered = TOKEN_RE.sub(replace, value)
    residue = re.sub(RUNTIME_TOKEN_RE, "", rendered)
    if "{{" in residue or "}}" in residue:
        raise FixtureCompileError(f"template contains unsupported token: {value}")
    return rendered


def _validate_compiled_steps(
    operation_id: str, operation: Any, approval_policy: str
) -> None:
    expected_keys = {*PHASES, "lifecycle_mode"}
    if not isinstance(operation, dict) or set(operation) != expected_keys:
        raise FixtureCompileError(
            f"{operation_id} template must define exactly {sorted(expected_keys)}"
        )
    lifecycle_mode = operation["lifecycle_mode"]
    if lifecycle_mode not in LIFECYCLE_MODES:
        raise FixtureCompileError(f"{operation_id} has unsupported lifecycle_mode")
    if lifecycle_mode == "combined_actor_confirmation" and approval_policy != "actor_confirmation":
        raise FixtureCompileError(
            f"{operation_id} combined lifecycle requires actor_confirmation policy"
        )
    steps = operation
    for phase in PHASES:
        rows = steps[phase]
        if not isinstance(rows, list) or not rows:
            raise FixtureCompileError(f"{operation_id}.{phase} must be non-empty")
        for index, step in enumerate(rows):
            if not isinstance(step, dict) or step.get("actor") not in ACTORS or step.get("action") not in ACTIONS:
                raise FixtureCompileError(f"{operation_id}.{phase}[{index}] has invalid actor/action")
            action = step["action"]
            locator = step.get("locator")
            if action == "goto":
                if locator is not None or not str(step.get("value", "")).startswith("/"):
                    raise FixtureCompileError(f"{operation_id}.{phase}[{index}] has invalid goto")
            else:
                if not isinstance(locator, dict) or locator.get("kind") not in LOCATOR_KINDS or not isinstance(locator.get("name"), str):
                    raise FixtureCompileError(f"{operation_id}.{phase}[{index}] requires a valid locator")
                if locator["kind"] == "role" and not isinstance(locator.get("role"), str):
                    raise FixtureCompileError(f"{operation_id}.{phase}[{index}] role locator omitted role")
            encoded = json.dumps(step, sort_keys=True)
            if action == "click" and COMMUNICATION_ACTION.search(encoded):
                raise FixtureCompileError(f"{operation_id}.{phase}[{index}] targets communication")
    if steps["prepare_steps"][0]["action"] != "goto":
        raise FixtureCompileError(f"{operation_id}.prepare_steps must restart from a route")
    if not any(row["action"] == "expectText" for row in steps["missing_required_steps"]):
        raise FixtureCompileError(f"{operation_id}.missing_required_steps omitted visible assertion")
    for phase in ("approval_steps", "execute_steps"):
        if "{{command_request_id}}" not in json.dumps(steps[phase], sort_keys=True):
            raise FixtureCompileError(f"{operation_id}.{phase} does not target captured command")


def compile_fixture(
    matrix_path: Path,
    template_directory: Path,
    facts: dict[str, Any],
    scalars: dict[str, Any],
) -> dict[str, Any]:
    matrix = _object(matrix_path, "operation matrix")
    expected = [row["id"] for row in matrix.get("operations", [])]
    if matrix.get("required_operation_count") != 18 or len(expected) != 18 or len(set(expected)) != 18:
        raise FixtureCompileError("operation matrix must declare exactly 18 unique operations")
    missing_templates = [
        operation_id
        for operation_id in expected
        if not (template_directory / f"{operation_id}.json").is_file()
    ]
    if missing_templates:
        raise FixtureCompileError(
            f"missing evidence-backed UI templates: {missing_templates}"
        )
    operations: dict[str, Any] = {}
    used: set[str] = set()
    for operation_id in expected:
        path = template_directory / f"{operation_id}.json"
        template = _object(path, f"{operation_id} template")
        if template.get("template_schema") != TEMPLATE_SCHEMA or template.get("operation_id") != operation_id:
            raise FixtureCompileError(f"invalid UI template authority: {operation_id}")
        dependencies = set(RESOURCE_TOKEN_RE.findall(json.dumps(template, sort_keys=True)))
        unavailable = sorted(dependencies - set(operations))
        if unavailable:
            raise FixtureCompileError(
                f"{operation_id} references unavailable prior operation resources: {unavailable}"
            )
        operation_facts = _operation_facts(operation_id, facts, scalars, used)
        compiled_operation = _compile_value(
            {
                "lifecycle_mode": template.get("lifecycle_mode"),
                **(template.get("steps") or {}),
            },
            operation_facts,
            scalars,
            used,
        )
        matrix_row = next(row for row in matrix["operations"] if row["id"] == operation_id)
        _validate_compiled_steps(
            operation_id, compiled_operation, matrix_row.get("approval_policy")
        )
        operations[operation_id] = compiled_operation
    unused = sorted(set(scalars) - used)
    if unused:
        raise FixtureCompileError(f"unreviewed/unused scalar values are forbidden: {unused}")
    return {"fixture_schema": FIXTURE_SCHEMA, "operations": operations}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--identity-evidence", type=Path, required=True)
    parser.add_argument("--reviewed-scalars", type=Path, required=True)
    parser.add_argument("--matrix", type=Path, required=True)
    parser.add_argument("--templates", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    org_id, identities = load_identity_evidence(args.identity_evidence)
    facts = resolve_authoritative_facts(
        os.environ["PHARMA_CANONICAL_LIVE_DATABASE_URL"],
        os.environ["PHARMA_CANONICAL_LIVE_TEST_AUTH_USER_ID"],
        org_id,
        identities,
        os.environ["LIVE18_RUN_TOKEN"],
    )
    fixture = compile_fixture(
        args.matrix, args.templates, facts, load_reviewed_scalars(args.reviewed_scalars)
    )
    args.output.write_text(json.dumps(fixture, separators=(",", ":")) + "\n", encoding="utf-8")
    args.output.chmod(0o600)


if __name__ == "__main__":
    main()
